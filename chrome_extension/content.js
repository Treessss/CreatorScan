let scanInterval = null;
let floatingBtn = null;
let batchInterval = null;
let lastApiResponseTime = Date.now();
// --- Task Scrape Logic Variables ---
let isTaskScraping = false;
let taskConfig = null;
let taskInterceptCount = 0;
let taskSeenProfileIds = new Set();

function csToast(message) {
    const id = 'cs-content-toast';
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.bottom = '24px';
        el.style.transform = 'translateX(-50%)';
        el.style.background = '#0f172a';
        el.style.color = '#fff';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '10px';
        el.style.fontSize = '12px';
        el.style.zIndex = '999999';
        el.style.boxShadow = '0 10px 28px rgba(0,0,0,.35)';
        document.body.appendChild(el);
    }
    el.textContent = String(message);
    el.style.opacity = '1';
    window.clearTimeout(el._csTimer);
    el._csTimer = window.setTimeout(() => {
        if (el) el.style.opacity = '0';
    }, 2200);
}

// Initialize
// Inject interceptor immediately on TikTok pages to catch early requests
if (window.location.hostname.includes('tiktok.com')) {
    injectScript();
}

// Restore state from sessionStorage if available (handles reloads before background reconnects)
const savedTaskConfig = sessionStorage.getItem('creatorScanTaskConfig');
if (savedTaskConfig) {
    try {
        const config = JSON.parse(savedTaskConfig);
        console.log('CreatorScan: Restored task config from session', config);
        startTaskScraping(config);
    } catch (e) {
        console.error('CreatorScan: Failed to restore task config', e);
    }
} else {
    checkStatusAndRun();
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startBatchScrape") {
        // Legacy: Force start immediately
        startBatchScrapingLoop();
    } else if (request.action === 'scrapeDeep') {
        handleDeepScrape();
    } else if (request.action === 'startTaskScrape') {
        startTaskScraping(request.config);
    } else if (request.action === 'stopTask') {
        stopTaskScraping();
    }
});

// --- Task Scrape Logic ---

function startTaskScraping(config) {
    console.log('CreatorScan: Starting task scrape', config);
    isTaskScraping = true;
    taskConfig = config;
    // Use the max of saved progress or config initial
    // But actually we should trust config if it comes from background (source of truth)
    // However, if we just reloaded, session might be fresher if background hasn't updated yet?
    // Let's rely on config.initialPageCount as base.
    
    // NOTE: If we are restoring from session, we might want to preserve the local count?
    // But background sends the authoritative 'pageCount' from storage.
    taskInterceptCount = config.initialPageCount || 0;
    taskSeenProfileIds = new Set();
    
    // Save to session for reliability
    sessionStorage.setItem('creatorScanTaskConfig', JSON.stringify(config));
    
    // 1. Inject Interceptor Script (TikTok only)
    if ((config.platform || detectPlatform()) === 'tiktok') {
        injectScript();
    }
    
    // 2. Start Loop
    if (!batchInterval) {
        lastApiResponseTime = Date.now();
        batchInterval = setInterval(taskLoopStep, 3000);
    }
}

function stopTaskScraping() {
    isTaskScraping = false;
    taskConfig = null;
    sessionStorage.removeItem('creatorScanTaskConfig');
    stopBatchScrapingLoop();
}


async function taskLoopStep() {
    if (!isTaskScraping) {
        stopBatchScrapingLoop();
        return;
    }
    
    // Check page limit
    if (taskInterceptCount >= taskConfig.pageLimit) {
        console.log(`CreatorScan: Task limit reached (${taskInterceptCount}/${taskConfig.pageLimit})`);
        stopBatchScrapingLoop();
        chrome.runtime.sendMessage({ 
            action: 'taskKeywordComplete',
            taskId: taskConfig.taskId,
            keyword: taskConfig.keyword
        });
        return;
    }
    
    // Check timeout (no data for 40s)
    if (Date.now() - lastApiResponseTime > 40000) {
        console.log('CreatorScan: No new data for 40s, reloading...');
        window.location.reload();
        return;
    }
    
    if ((taskConfig.platform || detectPlatform()) !== 'tiktok') {
        await runGenericTaskStep();
        return;
    }

    // Scroll Logic for Background Tabs
    // 1. Dispatch Wheel Event (Simulate mouse wheel)
    // Many SPAs listen to 'wheel' or 'touchmove' rather than just 'scroll' event
    try {
        const wheelEvt = new WheelEvent('wheel', {
            deltaY: 1000,
            deltaMode: 1, // LINE
            bubbles: true,
            cancelable: true,
            view: window
        });
        document.body.dispatchEvent(wheelEvt);
        document.documentElement.dispatchEvent(wheelEvt);
    } catch (e) { console.error('Wheel dispatch failed', e); }

    // 2. Scroll slightly up first to ensure "scroll event" triggers change
    window.scrollBy(0, -50);
    
    // 3. Force scroll to bottom
    setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
        // Manually dispatch scroll event as browsers might suppress it in background if layout didn't change enough
        window.dispatchEvent(new Event('scroll'));
    }, 100);
}

async function runGenericTaskStep() {
    const platform = taskConfig.platform || detectPlatform();
    taskInterceptCount++;

    const profiles = collectGenericTaskProfiles(platform);
    const newProfiles = profiles.filter(p => {
        if (!p.id || taskSeenProfileIds.has(p.id)) return false;
        taskSeenProfileIds.add(p.id);
        return true;
    });

    if (newProfiles.length > 0) {
        chrome.runtime.sendMessage({
            action: 'saveTaskProfiles',
            taskId: taskConfig.taskId,
            keyword: taskConfig.keyword,
            data: newProfiles
        });
    }

    try {
        chrome.runtime.sendMessage({
            action: 'updateTaskProgress',
            taskId: taskConfig.taskId,
            keyword: taskConfig.keyword,
            pageCount: taskInterceptCount
        });
    } catch (e) {
        console.error('CreatorScan: Failed to send generic task progress', e);
    }

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function collectGenericTaskProfiles(platform) {
    if (platform === 'instagram') return collectInstagramTaskProfiles();
    if (platform === 'youtube') return collectYouTubeTaskProfiles();
    return [];
}

function collectInstagramTaskProfiles() {
    const profiles = [];
    const anchors = Array.from(document.querySelectorAll('a[href^="/"]'));
    const blockedRoots = new Set(['explore', 'accounts', 'reels', 'stories', 'direct', 'p', 'tv']);

    anchors.forEach((a) => {
        const href = a.getAttribute('href') || '';
        const cleaned = href.split('?')[0];
        const parts = cleaned.split('/').filter(Boolean);
        if (parts.length !== 1) return;
        const username = parts[0];
        if (!username || blockedRoots.has(username.toLowerCase())) return;

        const profileUrl = `https://www.instagram.com/${username}/`;
        const name = (a.textContent || '').trim() || username;
        profiles.push({
            id: profileUrl,
            uniqueId: username,
            nickname: name,
            platform: 'Instagram',
            url: profileUrl,
            timestamp: Date.now()
        });
    });

    return profiles;
}

function collectYouTubeTaskProfiles() {
    const profiles = [];
    const anchors = Array.from(document.querySelectorAll('a[href*="/@"], a[href*="/channel/"]'));

    anchors.forEach((a) => {
        const rawHref = a.getAttribute('href') || '';
        if (!rawHref.startsWith('/@') && !rawHref.startsWith('/channel/')) return;
        const url = `https://www.youtube.com${rawHref.split('?')[0]}`;

        let uniqueId = rawHref.split('/').filter(Boolean).slice(1).join('_');
        if (rawHref.startsWith('/@')) {
            uniqueId = rawHref.split('/')[1]?.replace('@', '') || uniqueId;
        } else if (rawHref.startsWith('/channel/')) {
            uniqueId = rawHref.split('/')[2] || uniqueId;
        }
        const name = (a.textContent || '').trim() || uniqueId;
        profiles.push({
            id: url,
            uniqueId,
            nickname: name,
            platform: 'YouTube',
            url,
            timestamp: Date.now()
        });
    });

    return profiles;
}


async function handleDeepScrape() {
    const platform = detectPlatform();
    let data = null;
    
    if (platform === 'tiktok') {
        data = scrapeTikTok();
    } else if (platform === 'instagram') {
        data = await scrapeInstagram();
    } else if (platform === 'youtube') {
        data = await scrapeYouTube();
    }
    
    chrome.runtime.sendMessage({
        action: 'enrichmentResult',
        data: data || 'no_data'
    });
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.isRecording) {
      checkStatusAndRun();
    }
    if (changes.isBatchScraping) {
      checkStatusAndRun();
    }
  }
});

function checkStatusAndRun() {
  chrome.storage.local.get(['isRecording', 'isBatchScraping'], (result) => {
    // Normal Recording Mode
    if (result.isRecording) {
      startScanning();
    } else {
      stopScanning();
    }
    
    // Batch Scrape Mode
    if (result.isBatchScraping) {
        startBatchScrapingLoop();
    } else {
        stopBatchScrapingLoop();
    }
  });
}

function startScanning() {
  // Check every 1s if we need to inject the button (SPA support)
  if (!scanInterval) {
    scanInterval = setInterval(() => {
      const platform = detectPlatform();
      if (platform) {
        injectFloatingButton(platform);
      } else {
        removeFloatingButton();
      }
    }, 1000);
  }
}

function stopScanning() {
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = null;
  removeFloatingButton();
}

function injectFloatingButton(platform) {
  if (document.getElementById('creator-scan-btn')) return;

  floatingBtn = document.createElement('button');
  floatingBtn.id = 'creator-scan-btn';
  floatingBtn.innerText = '采集';
  floatingBtn.style.position = 'fixed';
  floatingBtn.style.bottom = '100px';
  floatingBtn.style.right = '20px';
  floatingBtn.style.zIndex = '999999';
  floatingBtn.style.padding = '10px 20px';
  floatingBtn.style.backgroundColor = '#FF0050'; // TikTok colorish
  floatingBtn.style.color = 'white';
  floatingBtn.style.border = 'none';
  floatingBtn.style.borderRadius = '50px';
  floatingBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
  floatingBtn.style.cursor = 'move'; // Change cursor to move
  floatingBtn.style.fontWeight = 'bold';
  floatingBtn.style.fontSize = '14px';
  floatingBtn.style.userSelect = 'none'; // Prevent text selection
  
  // Drag logic
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    if (e.target === floatingBtn) {
      isDragging = true;
    }
  }

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, floatingBtn);
    }
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }

  floatingBtn.addEventListener('mousedown', dragStart);
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('mousemove', drag);

  // Click logic (distinguish from drag)
  let startX, startY;
  floatingBtn.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
  });
  
  floatingBtn.addEventListener('click', async (e) => {
      const moveX = Math.abs(e.clientX - startX);
      const moveY = Math.abs(e.clientY - startY);
      if (moveX < 5 && moveY < 5) { // Threshold for click
          e.stopPropagation();
          e.preventDefault();
          await manualScrape(platform);
      }
  });

  document.body.appendChild(floatingBtn);
}

function removeFloatingButton() {
  const btn = document.getElementById('creator-scan-btn');
  if (btn) btn.remove();
  floatingBtn = null;
}

async function manualScrape(platform) {
  const btn = document.getElementById('creator-scan-btn');
  if (btn) btn.innerText = '采集...';

  const result = await tryScrape(platform);
  
  if (result === 'success') {
    if (btn) {
      btn.innerText = '✅ 已采集';
      btn.style.backgroundColor = '#4CAF50';
      setTimeout(() => {
        if (btn) {
          btn.innerText = '采集';
          btn.style.backgroundColor = '#FF0050';
        }
      }, 2000);
    }
  } else if (result === 'no_data') {
    if (btn) {
      btn.innerText = '⚠️ 无数据';
      btn.style.backgroundColor = '#FF9800';
      setTimeout(() => {
        if (btn) {
          btn.innerText = '采集';
          btn.style.backgroundColor = '#FF0050';
        }
      }, 2000);
    }
    csToast('当前页面未检测到有效邮箱或挂链，或者不是红人主页。');
  } else if (result === 'unsupported') {
    if (btn) {
      btn.innerText = '当前不支持';
      setTimeout(() => {
        if (btn) btn.innerText = '采集';
      }, 2000);
    }
    csToast('当前页面暂不支持采集。');
  } else {
     if (btn) {
      btn.innerText = '❌ 失败';
      setTimeout(() => {
        if (btn) btn.innerText = '采集';
      }, 2000);
    }
  }
}

function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('tiktok.com')) return 'tiktok';
  if (hostname.includes('instagram.com')) return 'instagram';
  if (hostname.includes('youtube.com')) return 'youtube';
  return null;
}

async function tryScrape(platform) {
  let data = null;
  
  if (platform === 'tiktok') {
    data = scrapeTikTok();
  } else if (platform === 'instagram') {
    data = await scrapeInstagram();
  } else if (platform === 'youtube') {
    data = await scrapeYouTube();
  } else {
    return 'unsupported';
  }

  // Logic: Scrape if has email OR has share links
  if (data && (data.email || (data.shareLinks && data.shareLinks.length > 0))) {
    // Send to background to save
    chrome.runtime.sendMessage({
      action: 'saveProfile',
      data: {
        ...data,
        timestamp: Date.now()
      }
    });
    return 'success';
  } else {
    return 'no_data';
  }
}

// --- TikTok Scraper ---
function scrapeTikTok() {
  // Check if we are on a profile page (/@username)
  if (!window.location.pathname.startsWith('/@')) return null;

  const bioElement = document.querySelector('[data-e2e="user-bio"]');
  if (!bioElement) return null; // Not loaded yet

  const bioText = bioElement.innerText;
  const email = extractEmail(bioText);
  
  // Extract Share Links
  const linkElements = document.querySelectorAll('[data-e2e="user-link"]');
  const shareLinks = [];
  
  linkElements.forEach(a => {
    let href = a.getAttribute('href');
    if (href) {
      if (href.includes('tiktok.com/link/v2')) {
        try {
          const urlObj = new URL(href);
          const target = urlObj.searchParams.get('target');
          if (target) {
            shareLinks.push(decodeURIComponent(target));
          } else {
            shareLinks.push(href);
          }
        } catch (e) {
          shareLinks.push(href);
        }
      } else {
        shareLinks.push(href);
      }
    }
  });
  
  // Extract Followers
  const followersElement = document.querySelector('[data-e2e="followers-count"]');
  const followers = followersElement ? followersElement.innerText : null;

  return {
    platform: 'TikTok',
    url: window.location.href.split('?')[0], // Clean URL
    email: email,
    shareLinks: shareLinks,
    followers: followers
  };
}

// --- Instagram Scraper ---
async function scrapeInstagram() {
  const pathParts = window.location.pathname.split('/').filter(p => p);
  if (pathParts.length !== 1) return null; // Likely not a profile root
  
  const main = document.querySelector('main');
  if (!main) return null;

  // 1. Try to expand "More" / "更多" button in bio
  const buttons = main.querySelectorAll('div[role="button"]');
  buttons.forEach(btn => {
    if (btn.innerText.includes('更多') || btn.innerText.includes('more')) {
        btn.click();
    }
  });

  await new Promise(r => setTimeout(r, 100));

  // 2. Try to click the "Multiple Links" button
  const possibleLinkButtons = Array.from(main.querySelectorAll('button'));
  const linkBtn = possibleLinkButtons.find(btn => {
      const text = btn.innerText;
      return text.includes('和另外') || (text.includes('and') && text.includes('more'));
  });

  if (linkBtn) {
      linkBtn.click();
      await new Promise(r => setTimeout(r, 1500));
  }
  
  // 3. Extract Email
  const text = document.body.innerText; 
  const email = extractEmail(text);
  
  // 4. Extract Links
  const externalLinks = [];
  let rootElement = document.body;
  let isModalFound = false;

  const modalHeader = Array.from(document.querySelectorAll('h1, h2, h3')).find(
      el => el.innerText.trim() === '链接' || el.innerText.trim() === 'Links'
  );
  
  if (modalHeader) {
      const modal = modalHeader.closest('div[role="dialog"]') || modalHeader.closest('.x7r02ix');
      if (modal) {
          rootElement = modal;
          isModalFound = true;
      }
  }

  const links = rootElement.querySelectorAll('a[href^="http"]');
  links.forEach(a => {
    const href = a.href;
    
    if (href.toLowerCase().includes('threads')) {
        return;
    }
    
    if (href.includes('instagram.com') && !href.includes('l.instagram.com')) {
        return; 
    }
    
    const lowerHref = href.toLowerCase();
    
    if (lowerHref.includes('about.instagram.com') || 
        lowerHref.includes('help.instagram.com') ||
        lowerHref.includes('meta.ai')) {
        return;
    }

    if (!isModalFound) {
        if (lowerHref.includes('meta.com') || 
            lowerHref.includes('facebook.com')) {
            return;
        }
    }

    if (href.includes('l.instagram.com')) {
        try {
            const urlObj = new URL(href);
            const u = urlObj.searchParams.get('u');
            if (u) {
                const decoded = decodeURIComponent(u);
                if (!decoded.toLowerCase().includes('threads')) {
                    externalLinks.push(decoded);
                }
            } else {
                 externalLinks.push(href);
            }
        } catch (e) {
            externalLinks.push(href);
        }
    } else {
        externalLinks.push(href);
    }
  });

  const uniqueLinks = [...new Set(externalLinks)];

  // Extract Followers
  let followers = null;
  const followersLink = main.querySelector('a[href*="/followers/"]');
  if (followersLink) {
      const titleSpan = followersLink.querySelector('span[title]');
      if (titleSpan) {
          followers = titleSpan.getAttribute('title');
      } else {
          followers = followersLink.innerText.replace(/followers|粉丝|关注者/gi, '').trim();
      }
  }

  return {
    platform: 'Instagram',
    url: window.location.href.split('?')[0],
    email: email,
    shareLinks: uniqueLinks,
    followers: followers
  };
}

// --- YouTube Scraper ---
async function scrapeYouTube() {
  if (!window.location.pathname.startsWith('/@') && !window.location.pathname.startsWith('/channel/')) return null;
  
  const moreButtons = Array.from(document.querySelectorAll('button'));
  const descriptionMoreBtn = moreButtons.find(btn => {
      const label = btn.getAttribute('aria-label') || '';
      const text = btn.innerText || '';
      return (label.includes('说明') || label.includes('description') || text.includes('…more') || text.includes('…更多')) && btn.offsetParent !== null;
  });

  if (descriptionMoreBtn) {
      descriptionMoreBtn.click();
      await new Promise(r => setTimeout(r, 800));
  }

  const fullText = document.body.innerText;
  const email = extractEmail(fullText); 
  
  let followers = null;
  const subscriberElement = document.querySelector('#subscriber-count');
  
  if (subscriberElement) {
    followers = subscriberElement.innerText.replace('subscribers', '').replace('位订阅者', '').trim();
  } else {
    const metaSection = document.querySelector('#channel-header #meta');
    if (metaSection) {
        const texts = metaSection.innerText.split('\n');
        const subText = texts.find(t => t.includes('subscribers') || t.includes('位订阅者') || t.includes('粉丝'));
        if (subText) {
            followers = subText.replace('subscribers', '').replace('位订阅者', '').replace('粉丝', '').trim();
        }
    }

    if (!followers) {
        const viewModel = document.querySelector('yt-content-metadata-view-model');
        if (viewModel) {
            const spans = Array.from(viewModel.querySelectorAll('span[role="text"], span.yt-core-attributed-string'));
            const subscriberSpan = spans.find(s => {
                const text = s.innerText;
                return text.includes('subscribers') || 
                       text.includes('位订阅者') || 
                       text.includes('粉丝') ||
                       /^\d+(\.\d+)?[MK万]/.test(text) && (text.includes('位订阅者') || text.includes('subscribers'));
            });
            
            if (subscriberSpan) {
                followers = subscriberSpan.innerText.replace('subscribers', '').replace('位订阅者', '').replace('粉丝', '').trim();
            } else {
                const rows = viewModel.querySelectorAll('.yt-content-metadata-view-model__metadata-row');
                if (rows.length >= 2) {
                    const secondRow = rows[1];
                    const rowText = secondRow.innerText;
                    const parts = rowText.split('•');
                    if (parts.length > 0) {
                         const potentialSub = parts[0].trim();
                         if (potentialSub.includes('订阅者') || potentialSub.includes('subscribers') || potentialSub.includes('粉丝')) {
                             followers = potentialSub.replace('subscribers', '').replace('位订阅者', '').replace('粉丝', '').trim();
                         }
                    }
                }
            }
        }
    }
  }

  const newLinks = document.querySelectorAll('a[href*="redirect"]');
  const shareLinks = [];
  if (newLinks) {
      newLinks.forEach(a => {
          try {
              const url = new URL(a.href);
              const q = url.searchParams.get('q');
              if (q) shareLinks.push(q);
          } catch(e) {}
      })
  }

  return {
    platform: 'YouTube',
    url: window.location.href,
    email: email,
    shareLinks: [...new Set(shareLinks)],
    followers: followers
  };
}

function extractEmail(text) {
  if (!text) return null;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

// --- Batch Scrape Logic ---

function startBatchScrapingLoop() {
    // Only for TikTok
    if (detectPlatform() !== 'tiktok') return;

    // 1. Inject Interceptor Script
    injectScript();
    
    // 2. Start Loop
    if (!batchInterval) {
        lastApiResponseTime = Date.now(); // Reset timer
        batchInterval = setInterval(batchLoopStep, 3000); // Check every 3s
    }
}

function stopBatchScrapingLoop() {
    if (batchInterval) clearInterval(batchInterval);
    batchInterval = null;
}

function injectScript() {
    // Always re-inject if missing (e.g. after reload)
    // But since we can't remove the old one easily from DOM if we don't reload page,
    // we rely on the ID check.
    if (document.getElementById('creator-scan-injected')) return;
    const script = document.createElement('script');
    script.id = 'creator-scan-injected';
    script.src = chrome.runtime.getURL('injected.js');
    (document.head || document.documentElement).appendChild(script);
    console.log('CreatorScan: Injecting interceptor script...');
}

// Global listener for injected messages
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TIKTOK_SEARCH_API_RESPONSE') {
        console.log('CreatorScan: Received API data from injected script');
        
        // 1. Check Legacy Batch Mode
        chrome.storage.local.get('isBatchScraping', (res) => {
            if (res.isBatchScraping) {
                handleTikTokApiResponse(event.data.data, 'legacy');
            }
        });

        // 2. Check New Task Mode
        if (isTaskScraping) {
            handleTikTokApiResponse(event.data.data, 'task');
        }
    }
});

async function batchLoopStep() {
    const { isBatchScraping, batchTargetCount, batchSessionCount } = await chrome.storage.local.get(['isBatchScraping', 'batchTargetCount', 'batchSessionCount']);
    
    if (!isBatchScraping) {
        stopBatchScrapingLoop();
        return;
    }
    
    const currentSessionCount = batchSessionCount || 0;
    
    // Check if target reached
    if (currentSessionCount >= batchTargetCount) {
        await chrome.storage.local.set({ 
            isBatchScraping: false,
            batchSessionCount: 0 // Reset as requested
        });
        csToast(`批量采集完成！本次采集 ${currentSessionCount} 个博主。`);
        return;
    }
    
    // Check timeout (no data for 40s)
    if (Date.now() - lastApiResponseTime > 40000) {
        console.log('CreatorScan: No new data for 40s, refreshing page...');
        window.location.reload();
        return;
    }
    
    // Scroll to bottom to trigger next page
    // Use smooth scrolling for more human-like behavior
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

async function handleTikTokApiResponse(data, mode = 'legacy') {
    lastApiResponseTime = Date.now(); // Update activity timestamp
    
    if (mode === 'task') {
        taskInterceptCount++;
        // Update local session config to keep sync
        if (taskConfig) {
            taskConfig.initialPageCount = taskInterceptCount;
            sessionStorage.setItem('creatorScanTaskConfig', JSON.stringify(taskConfig));
        }
        
        console.log(`CreatorScan: Task intercept ${taskInterceptCount}/${taskConfig.pageLimit}`);
        
        // Report progress to background
        try {
            chrome.runtime.sendMessage({
                action: 'updateTaskProgress',
                taskId: taskConfig.taskId,
                keyword: taskConfig.keyword,
                pageCount: taskInterceptCount
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('CreatorScan: updateTaskProgress error', chrome.runtime.lastError);
                } else {
                    console.log('CreatorScan: updateTaskProgress sent', response);
                }
            });
        } catch (e) {
            console.error('CreatorScan: Failed to send updateTaskProgress', e);
        }
    }
    
    console.log('CreatorScan: Handling API response', data);

    let itemList = data.item_list;
    if (!itemList && data.data && Array.isArray(data.data)) {
        itemList = data.data; // Handle potential wrapper
    }

    if (!itemList || !Array.isArray(itemList)) {
        console.warn('CreatorScan: No item_list found in data', Object.keys(data));
        return;
    }
    
    let minFollowers = 0;
    let maxFollowers = 999999999;
    let targetLanguages = []; // Changed to array

    if (mode === 'legacy') {
        const settings = await chrome.storage.local.get(['batchMinFollowers', 'batchMaxFollowers']);
        minFollowers = settings.batchMinFollowers;
        maxFollowers = settings.batchMaxFollowers;
    } else if (mode === 'task' && taskConfig) {
        minFollowers = taskConfig.minFollowers;
        maxFollowers = taskConfig.maxFollowers;
        // Support both old 'language' string and new 'languages' array
        if (taskConfig.languages && Array.isArray(taskConfig.languages)) {
            targetLanguages = taskConfig.languages;
        } else if (taskConfig.language) {
            targetLanguages = [taskConfig.language];
        }
    }
    
    console.log(`CreatorScan: Filtering with range ${minFollowers} - ${maxFollowers}, Languages: ${targetLanguages.join(', ') || 'Any'}`);
    
    const validProfiles = [];
    
    itemList.forEach(item => {
        try {
            // Language Check
            if (targetLanguages.length > 0 && item.textLanguage) {
                // If textLanguage is not in the allowed list (case-insensitive check)
                const itemLang = item.textLanguage.toLowerCase();
                const isMatch = targetLanguages.some(lang => lang.toLowerCase() === itemLang);
                
                if (!isMatch) {
                    return; // Skip mismatch
                }
            }

            // Some responses have 'user' instead of 'author', check both
            // But user said 'item_list' has 'author'
            const author = item.author || item.user; 
            // followerCount is in authorStatsV2 (new) or authorStats (old)
            const stats = item.authorStatsV2 || item.authorStats;
            
            if (author && stats) {
                const followerCountRaw = stats.followerCount;
                const followerCount = parseInt(followerCountRaw);
                
                // Check if valid number and within range
                if (!isNaN(followerCount)) {
                     if (followerCount >= minFollowers && followerCount <= maxFollowers) {
                        validProfiles.push({
                            id: author.id,
                            secUid: author.secUid,
                            signature: author.signature,
                            followerCount: followerCountRaw, // Keep original string as requested
                            // Extra fields for UI display
                            uniqueId: author.uniqueId,
                            nickname: author.nickname,
                            avatar: author.avatarThumb,
                            platform: 'TikTok',
                            timestamp: Date.now()
                        });
                     } else {
                         // console.log(`CreatorScan: Skipping ${author.uniqueId}, followers ${followerCount} not in range`);
                     }
                } else {
                    console.warn('CreatorScan: followerCount is NaN', followerCountRaw);
                }
            } else {
                // console.log('CreatorScan: Missing author or stats in item', item);
            }
        } catch (e) {
            console.error('CreatorScan: Error processing item', e);
        }
    });
    
    console.log(`CreatorScan: Found ${validProfiles.length} valid profiles`);

    if (validProfiles.length > 0) {
        if (mode === 'legacy') {
            chrome.runtime.sendMessage({
                action: 'saveBatchProfiles',
                data: validProfiles
            });
        } else if (mode === 'task') {
            chrome.runtime.sendMessage({
                action: 'saveTaskProfiles',
                taskId: taskConfig.taskId,
                keyword: taskConfig.keyword,
                data: validProfiles
            });
        }
    }
}
