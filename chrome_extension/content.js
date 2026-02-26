let scanInterval = null;
let floatingBtn = null;
let batchInterval = null;
let lastApiResponseTime = Date.now();
// --- Task Scrape Logic Variables ---
let isTaskScraping = false;
let taskConfig = null;
let taskInterceptCount = 0;
let taskSeenProfileIds = new Set();
let taskKeywordCompletionSent = false;
let taskInstagramPacketSamples = [];
let instagramTaskHydrationSession = null;
let instagramTaskHydrationTimeoutTimer = null;
let instagramTaskHydrationRecentPackets = [];
const INSTAGRAM_TASK_PACKET_SAMPLE_LIMIT = 3;
const INSTAGRAM_TASK_SAMPLE_SUMMARIES_SESSION_KEY = 'creatorScanInstagramTaskPacketSummaries';
const INSTAGRAM_TASK_HYDRATION_SESSION_KEY = 'creatorScanInstagramTaskHydrationSession';
const INSTAGRAM_TASK_HYDRATION_PACKET_BUFFER_LIMIT = 24;
const INSTAGRAM_TASK_HYDRATION_PACKET_WAIT_MS = 8000;

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
// Inject interceptor immediately on supported pages to catch early requests
if (
    window.location.hostname.includes('tiktok.com') ||
    (
        window.location.hostname.includes('instagram.com') &&
        (isInstagramKeywordSearchPage() || isInstagramProfileRootPage())
    )
) {
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
restoreInstagramTaskHydrationFromSession();

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startBatchScrape") {
        // Legacy: Force start immediately
        startBatchScrapingLoop();
    } else if (request.action === 'scrapeDeep') {
        handleDeepScrape();
    } else if (request.action === 'startTaskScrape') {
        startTaskScraping(request.config);
    } else if (request.action === 'startInstagramTaskHydration') {
        startInstagramTaskHydration(request.seed || {}, request.options || {});
        sendResponse({ received: true });
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
    taskKeywordCompletionSent = false;
    
    // Save to session for reliability
    sessionStorage.setItem('creatorScanTaskConfig', JSON.stringify(config));
    
    const platform = config.platform || detectPlatform();

    // 1. Inject Interceptor Script (TikTok / Instagram task packets)
    if (platform === 'tiktok' || platform === 'instagram') {
        injectScript();
        // Kick once immediately so hidden tabs can trigger the next request without waiting for the first interval tick.
        try {
            if (platform === 'tiktok') {
                triggerTikTokTaskScroll();
            } else {
                triggerInstagramTaskScroll();
            }
        } catch (e) {}
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
    taskKeywordCompletionSent = false;
    sessionStorage.removeItem('creatorScanTaskConfig');
    taskInstagramPacketSamples = [];
    stopBatchScrapingLoop();
}

function requestTaskKeywordComplete(reason = 'unknown') {
    if (!isTaskScraping || !taskConfig) return false;
    if (taskKeywordCompletionSent) return false;
    if (!taskConfig.taskId || !taskConfig.keyword) return false;

    taskKeywordCompletionSent = true;
    stopBatchScrapingLoop();

    try {
        chrome.runtime.sendMessage({
            action: 'taskKeywordComplete',
            taskId: taskConfig.taskId,
            keyword: taskConfig.keyword,
            reason
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('CreatorScan: taskKeywordComplete send error', chrome.runtime.lastError);
                taskKeywordCompletionSent = false;
            } else {
                console.log('CreatorScan: task keyword completion requested', {
                    reason,
                    taskId: taskConfig?.taskId,
                    keyword: taskConfig?.keyword,
                    response
                });
            }
        });
        return true;
    } catch (e) {
        console.error('CreatorScan: Failed to send taskKeywordComplete', e);
        taskKeywordCompletionSent = false;
        return false;
    }
}

function getTikTokScrollTargets() {
    const candidateSelectors = [
        '[data-e2e*="search"]',
        '[data-e2e*="feed"]',
        '[data-e2e*="list"]',
        'main',
        '[role="main"]',
        'div[tabindex="0"]'
    ];

    const seen = new Set();
    const targets = [];

    function pushIfScrollable(el) {
        if (!el || !(el instanceof Element) || seen.has(el)) return;
        seen.add(el);

        const sh = el.scrollHeight || 0;
        const ch = el.clientHeight || 0;
        if (sh <= ch + 80) return;

        const style = getComputedStyle(el);
        const overflowY = style.overflowY || '';
        const scrollable = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        if (!scrollable && el !== document.scrollingElement) return;

        targets.push(el);
    }

    candidateSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach(pushIfScrollable);
    });

    pushIfScrollable(document.scrollingElement);
    pushIfScrollable(document.documentElement);
    pushIfScrollable(document.body);

    // Fallback: scan a subset of elements and pick the largest scrollable containers.
    if (targets.length === 0) {
        const all = Array.from(document.querySelectorAll('div, main, section'));
        all.forEach(pushIfScrollable);
    }

    return targets.sort((a, b) => {
        const aSize = (a.scrollHeight - a.clientHeight);
        const bSize = (b.scrollHeight - b.clientHeight);
        return bSize - aSize;
    });
}

function triggerTikTokTaskScroll() {
    const scrollTargets = getTikTokScrollTargets();
    const step = Math.max(Math.floor(window.innerHeight * 0.9), 900);

    // Simulate wheel on likely containers first (TikTok often listens on inner container).
    try {
        const wheelEvt = new WheelEvent('wheel', {
            deltaY: step,
            deltaMode: 0, // PIXEL
            bubbles: true,
            cancelable: true,
            view: window
        });
        scrollTargets.slice(0, 3).forEach((el) => el.dispatchEvent(wheelEvt));
        document.body?.dispatchEvent(wheelEvt);
        document.documentElement?.dispatchEvent(wheelEvt);
        window.dispatchEvent(wheelEvt);
    } catch (e) {
        console.error('CreatorScan: Wheel dispatch failed', e);
    }

    let moved = false;
    scrollTargets.slice(0, 5).forEach((el) => {
        try {
            const before = el.scrollTop || 0;
            // Nudge first to ensure scroll listeners see delta in throttled/background tabs.
            el.scrollTop = Math.max(0, before - 20);
            el.scrollTop = before + step;
            if ((el.scrollTop || 0) !== before) {
                moved = true;
            }
            el.dispatchEvent(new Event('scroll', { bubbles: true }));
        } catch (e) {
            // ignore per element
        }
    });

    // Also try window/document scrolling as fallback.
    try {
        const docEl = document.scrollingElement || document.documentElement || document.body;
        const beforeWin = window.scrollY || docEl.scrollTop || 0;
        window.scrollBy(0, -30);
        window.scrollBy(0, step);
        window.scrollTo({ top: Math.max(docEl.scrollHeight, document.body?.scrollHeight || 0), behavior: 'auto' });
        window.dispatchEvent(new Event('scroll'));
        const afterWin = window.scrollY || docEl.scrollTop || 0;
        if (afterWin !== beforeWin) moved = true;
    } catch (e) {
        console.error('CreatorScan: Window scroll fallback failed', e);
    }

    // Final fallback: scroll last video card into view.
    if (!moved) {
        const lastCard = document.querySelector('a[href*="/video/"]:last-of-type') ||
            Array.from(document.querySelectorAll('a[href*="/video/"]')).pop();
        if (lastCard && typeof lastCard.scrollIntoView === 'function') {
            try {
                lastCard.scrollIntoView({ block: 'end', behavior: 'auto' });
            } catch (e) {}
        }
    }

    console.log('CreatorScan: TikTok task scroll tick', {
        targets: scrollTargets.slice(0, 3).map(el => ({
            tag: el.tagName,
            id: el.id || '',
            cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
            top: el.scrollTop || 0,
            h: el.clientHeight || 0,
            sh: el.scrollHeight || 0
        }))
    });
}

function triggerInstagramTaskScroll() {
    const step = Math.max(Math.floor(window.innerHeight * 1.1), 900);
    const seen = new Set();
    const targets = [];

    function addTarget(el) {
        if (!el || !(el instanceof Element) || seen.has(el)) return;
        seen.add(el);
        const sh = el.scrollHeight || 0;
        const ch = el.clientHeight || 0;
        if (sh <= ch + 80) return;
        targets.push(el);
    }

    addTarget(document.querySelector('main'));
    addTarget(document.scrollingElement);
    addTarget(document.documentElement);
    addTarget(document.body);

    document.querySelectorAll('main div, section div').forEach((el) => {
        if (targets.length < 6) addTarget(el);
    });

    try {
        const wheelEvt = new WheelEvent('wheel', {
            deltaY: step,
            deltaMode: 0,
            bubbles: true,
            cancelable: true,
            view: window
        });
        targets.slice(0, 3).forEach((el) => el.dispatchEvent(wheelEvt));
        window.dispatchEvent(wheelEvt);
    } catch (e) {
        console.error('CreatorScan: Instagram wheel dispatch failed', e);
    }

    let moved = false;
    targets.slice(0, 6).forEach((el) => {
        try {
            const before = el.scrollTop || 0;
            el.scrollTop = before + step;
            if ((el.scrollTop || 0) !== before) moved = true;
            el.dispatchEvent(new Event('scroll', { bubbles: true }));
        } catch (e) {}
    });

    try {
        const root = document.scrollingElement || document.documentElement || document.body;
        const before = root ? (root.scrollTop || 0) : (window.scrollY || 0);
        window.scrollBy(0, step);
        window.scrollTo({ top: Math.max(root?.scrollHeight || 0, document.body?.scrollHeight || 0), behavior: 'auto' });
        const after = root ? (root.scrollTop || 0) : (window.scrollY || 0);
        if (after !== before) moved = true;
    } catch (e) {
        console.error('CreatorScan: Instagram window scroll failed', e);
    }

    console.log('CreatorScan: Instagram task scroll tick', {
        route: window.location.pathname,
        moved,
        targets: targets.slice(0, 3).map((el) => ({
            tag: el.tagName,
            id: el.id || '',
            top: el.scrollTop || 0,
            h: el.clientHeight || 0,
            sh: el.scrollHeight || 0
        }))
    });
}


async function taskLoopStep() {
    if (!isTaskScraping) {
        stopBatchScrapingLoop();
        return;
    }
    
    // Check page limit
    if (taskInterceptCount >= taskConfig.pageLimit) {
        console.log(`CreatorScan: Task limit reached (${taskInterceptCount}/${taskConfig.pageLimit})`);
        requestTaskKeywordComplete('page_limit_interval');
        return;
    }
    
    // Check timeout (no data for 40s)
    if (Date.now() - lastApiResponseTime > 40000) {
        console.log('CreatorScan: No new data for 40s, reloading...');
        window.location.reload();
        return;
    }
    
    const platform = taskConfig.platform || detectPlatform();
    if (platform === 'tiktok') {
        // Hidden background tabs are timer-throttled; do the scroll synchronously in the interval tick.
        triggerTikTokTaskScroll();
        return;
    }

    if (platform === 'instagram') {
        triggerInstagramTaskScroll();
        return;
    }

    await runGenericTaskStep();
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

    if (event.data && event.data.type === 'INSTAGRAM_GRAPHQL_RESPONSE') {
        const packet = event.data.packet;
        rememberInstagramTaskHydrationPacket(packet);

        if (instagramTaskHydrationSession?.active) {
            handleInstagramTaskHydrationGraphqlPacket(packet)
                .catch((err) => console.error('CreatorScan: handleInstagramTaskHydrationGraphqlPacket failed', err));
        }

        if (!isTaskScraping) return;
        if ((taskConfig?.platform || detectPlatform()) !== 'instagram') return;
        handleInstagramTaskGraphqlPacket(packet)
            .catch((err) => console.error('CreatorScan: handleInstagramTaskGraphqlPacket failed', err));
    }
});

function isInstagramKeywordSearchPage(pathname = window.location.pathname) {
    return /^\/explore\/search\/keyword\/?$/.test(String(pathname || ''));
}

function isInstagramProfileRootPage(pathname = window.location.pathname, hostname = window.location.hostname) {
    if (!String(hostname || '').includes('instagram.com')) return false;
    const path = String(pathname || '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
    const blockedRoots = new Set([
        'explore', 'accounts', 'reels', 'stories', 'direct', 'p', 'tv', 'reel',
        'about', 'developer', 'legal', 'privacy', 'directory', 'challenge',
        'api', 'oauth', 'web', 'ads', 'press'
    ]);
    const segment = String(parts[0] || '').trim().toLowerCase();
    if (!segment) return false;
    return !blockedRoots.has(segment);
}

function rememberInstagramTaskHydrationPacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    instagramTaskHydrationRecentPackets.push(packet);
    if (instagramTaskHydrationRecentPackets.length > INSTAGRAM_TASK_HYDRATION_PACKET_BUFFER_LIMIT) {
        instagramTaskHydrationRecentPackets.splice(
            0,
            instagramTaskHydrationRecentPackets.length - INSTAGRAM_TASK_HYDRATION_PACKET_BUFFER_LIMIT
        );
    }
}

function clearInstagramTaskHydrationTimer() {
    if (instagramTaskHydrationTimeoutTimer) {
        clearTimeout(instagramTaskHydrationTimeoutTimer);
        instagramTaskHydrationTimeoutTimer = null;
    }
}

function persistInstagramTaskHydrationSession() {
    if (!instagramTaskHydrationSession || !instagramTaskHydrationSession.active) return;
    const {
        seed,
        startedAt,
        reloadAttempted,
        fallbackAttempted,
        requestReason
    } = instagramTaskHydrationSession;
    const payload = {
        seed: seed || null,
        startedAt: startedAt || Date.now(),
        reloadAttempted: !!reloadAttempted,
        fallbackAttempted: !!fallbackAttempted,
        requestReason: requestReason || null
    };
    try {
        sessionStorage.setItem(INSTAGRAM_TASK_HYDRATION_SESSION_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('CreatorScan: Failed to persist Instagram hydration session', e);
    }
}

function clearInstagramTaskHydrationSessionState() {
    clearInstagramTaskHydrationTimer();
    instagramTaskHydrationSession = null;
    try {
        sessionStorage.removeItem(INSTAGRAM_TASK_HYDRATION_SESSION_KEY);
    } catch (e) {}
}

function startInstagramTaskHydration(seed, options = {}) {
    if (!seed || typeof seed !== 'object') return;
    clearInstagramTaskHydrationTimer();
    const uniqueId = String(seed.uniqueId || '').trim();
    const authorId = String(seed.authorId || seed.id || '').trim();
    if (!uniqueId && !authorId) return;

    if (!isInstagramProfileRootPage()) {
        console.warn('CreatorScan: startInstagramTaskHydration called on non-profile page', window.location.href);
    }

    injectScript();

    const session = {
        active: true,
        seed: {
            ...seed,
            uniqueId: uniqueId || seed.uniqueId,
            authorId: authorId || seed.authorId || seed.id,
            id: seed.id,
            profileUrl: seed.profileUrl || seed.url || (uniqueId ? `https://www.instagram.com/${encodeURIComponent(uniqueId)}/` : null)
        },
        startedAt: Number(options.startedAt || Date.now()),
        reloadAttempted: !!options.reloadAttempted,
        fallbackAttempted: !!options.fallbackAttempted,
        requestReason: String(options.reason || 'background_start')
    };
    instagramTaskHydrationSession = session;
    persistInstagramTaskHydrationSession();

    console.log('CreatorScan: Started Instagram task hydration session', {
        url: window.location.href,
        uniqueId: session.seed.uniqueId,
        authorId: session.seed.authorId,
        reason: session.requestReason,
        reloadAttempted: session.reloadAttempted
    });

    const consumedBuffered = tryProcessBufferedInstagramTaskHydrationPackets();
    if (!consumedBuffered) {
        scheduleInstagramTaskHydrationWait();
    }
}

function restoreInstagramTaskHydrationFromSession() {
    if (!isInstagramProfileRootPage()) return;
    let raw = null;
    try {
        raw = sessionStorage.getItem(INSTAGRAM_TASK_HYDRATION_SESSION_KEY);
    } catch (e) {}
    if (!raw) return;
    try {
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object' || !saved.seed) return;
        startInstagramTaskHydration(saved.seed, {
            startedAt: saved.startedAt,
            reloadAttempted: !!saved.reloadAttempted,
            fallbackAttempted: !!saved.fallbackAttempted,
            reason: saved.requestReason || 'session_restore'
        });
    } catch (e) {
        console.warn('CreatorScan: Failed to restore Instagram hydration session', e);
        clearInstagramTaskHydrationSessionState();
    }
}

function scheduleInstagramTaskHydrationWait() {
    clearInstagramTaskHydrationTimer();
    if (!instagramTaskHydrationSession?.active) return;
    instagramTaskHydrationTimeoutTimer = setTimeout(() => {
        handleInstagramTaskHydrationNoPacketTimeout()
            .catch((err) => console.error('CreatorScan: handleInstagramTaskHydrationNoPacketTimeout failed', err));
    }, INSTAGRAM_TASK_HYDRATION_PACKET_WAIT_MS);
}

function findNestedValueByKey(node, targetKey, seen) {
    if (!node || typeof node !== 'object') return undefined;
    const guard = seen || new WeakSet();
    if (guard.has(node)) return undefined;
    guard.add(node);

    if (Object.prototype.hasOwnProperty.call(node, targetKey)) {
        return node[targetKey];
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNestedValueByKey(item, targetKey, guard);
            if (found !== undefined) return found;
        }
        return undefined;
    }

    for (const value of Object.values(node)) {
        const found = findNestedValueByKey(value, targetKey, guard);
        if (found !== undefined) return found;
    }

    return undefined;
}

function summarizeInstagramTaskPacket(packet) {
    const serp = findNestedValueByKey(packet?.response, 'xdt_fbsearch__top_serp_graphql');
    const summary = {
        timestamp: packet?.timestamp || Date.now(),
        transport: packet?.transport || null,
        method: packet?.method || null,
        url: packet?.url || null,
        requestQueryKeys: Object.keys(packet?.request?.query || {}),
        responseTopKeys: packet?.response && typeof packet.response === 'object'
            ? Object.keys(packet.response).slice(0, 20)
            : [],
        serpType: Array.isArray(serp) ? 'array' : typeof serp
    };

    if (serp && typeof serp === 'object') {
        summary.serpKeys = Object.keys(serp).slice(0, 40);
        const searchResults = serp.sections || serp.results || serp.items || null;
        if (Array.isArray(searchResults)) {
            summary.serpListLength = searchResults.length;
        }
    }

    return summary;
}

function rememberInstagramTaskPacketSample(packet) {
    if (!packet || typeof packet !== 'object') return;

    const bucket = Array.isArray(window.__creatorScanInstagramTaskPacketSamples)
        ? window.__creatorScanInstagramTaskPacketSamples
        : [];

    if (bucket.length < INSTAGRAM_TASK_PACKET_SAMPLE_LIMIT) {
        bucket.push(packet);
    } else {
        bucket[bucket.length - 1] = packet;
    }

    window.__creatorScanInstagramTaskPacketSamples = bucket;
    taskInstagramPacketSamples = bucket;

    try {
        const summaries = bucket.map(summarizeInstagramTaskPacket);
        sessionStorage.setItem(INSTAGRAM_TASK_SAMPLE_SUMMARIES_SESSION_KEY, JSON.stringify(summaries));
    } catch (e) {
        console.warn('CreatorScan: Failed to persist Instagram packet summaries', e);
    }
}

function parseInstagramTaskRequestParams(packet) {
    const request = packet?.request || {};
    const params = {};

    const query = request.query;
    if (query && typeof query === 'object' && !Array.isArray(query)) {
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null) params[key] = value;
        });
    }

    const body = request.body;
    if (typeof body === 'string' && body) {
        const trimmed = body.replace(/\.\.\.\[truncated\]$/, '');
        try {
            const search = new URLSearchParams(trimmed);
            for (const [key, value] of search.entries()) {
                if (value !== undefined && value !== null) params[key] = value;
            }
        } catch (e) {
            // ignore malformed/truncated body
        }
    } else if (body && typeof body === 'object' && !Array.isArray(body)) {
        Object.entries(body).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params[key] = typeof value === 'string' ? value : String(value);
            }
        });
    }

    return params;
}

function parseInstagramTaskVariables(packet) {
    const params = parseInstagramTaskRequestParams(packet);
    const raw = params.variables;
    if (!raw || typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        try {
            return JSON.parse(decodeURIComponent(raw));
        } catch (e2) {
            return null;
        }
    }
}

function getInstagramPacketFriendlyName(packet) {
    const params = parseInstagramTaskRequestParams(packet);
    const value = params.fb_api_req_friendly_name;
    return value ? String(value) : '';
}

function getInstagramProfileHydrationUser(packet) {
    const user = packet?.response?.data?.user;
    if (!user || typeof user !== 'object') return null;
    if (!user.username) return null;
    return user;
}

function normalizeInstagramHydrationExternalLink(raw) {
    if (!raw) return null;
    let value = String(raw).trim();
    if (!value) return null;
    value = value.replace(/&amp;/g, '&');

    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.hostname.includes('l.instagram.com')) {
            const target = parsed.searchParams.get('u');
            if (target) {
                try {
                    value = decodeURIComponent(target);
                } catch (e) {
                    value = target;
                }
            }
        }
    } catch (e) {
        return null;
    }

    let finalUrl;
    try {
        finalUrl = new URL(value);
    } catch (e) {
        return null;
    }

    const host = finalUrl.hostname.toLowerCase();
    if (!/^https?:$/i.test(finalUrl.protocol)) return null;
    if (host.includes('instagram.com') || host.endsWith('threads.net')) return null;

    finalUrl.hash = '';
    return finalUrl.toString();
}

function extractInstagramHydrationShareLinks(user) {
    const out = [];
    const seen = new Set();
    const push = (raw) => {
        const url = normalizeInstagramHydrationExternalLink(raw);
        if (!url) return;
        const key = url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(url);
    };

    push(user?.external_url);
    push(user?.external_lynx_url);
    if (Array.isArray(user?.bio_links)) {
        user.bio_links.forEach((link) => {
            if (!link) return;
            if (typeof link === 'string') {
                push(link);
                return;
            }
            push(link.url);
            push(link.link_url);
            push(link.lynx_url);
            push(link.href);
        });
    }

    return out;
}

function buildInstagramTaskHydrationPatchFromUser(user, sessionSeed, sourceTag = 'instagram_profile_graphql') {
    if (!user || typeof user !== 'object') return null;

    const packetUsername = String(user.username || '').trim();
    const seedUsername = String(sessionSeed?.uniqueId || '').trim();
    if (seedUsername && packetUsername && seedUsername.toLowerCase() !== packetUsername.toLowerCase()) {
        return null;
    }

    const packetAuthorId = String(user.id || user.pk || '').trim();
    const seedAuthorId = String(sessionSeed?.authorId || sessionSeed?.id || '').trim();
    if (seedAuthorId && packetAuthorId && seedAuthorId !== packetAuthorId) {
        return null;
    }

    const patch = {};
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(packetUsername || seedUsername)}/`;

    patch.platform = 'Instagram';
    patch.url = profileUrl;
    patch.profileUrl = profileUrl;
    if (packetUsername) patch.uniqueId = packetUsername;
    if (packetAuthorId) patch.authorId = packetAuthorId;
    if (user.pk) patch.igUserPk = String(user.pk);

    if (user.full_name !== undefined) patch.nickname = String(user.full_name || '').trim();
    const avatarUrl = user?.hd_profile_pic_url_info?.url || user.profile_pic_url;
    if (avatarUrl) patch.avatar = avatarUrl;

    if (user.follower_count !== undefined && user.follower_count !== null) {
        patch.followerCount = String(user.follower_count);
    }
    if (user.following_count !== undefined && user.following_count !== null) {
        patch.followingCount = String(user.following_count);
    }
    if (user.media_count !== undefined && user.media_count !== null) {
        patch.postCount = String(user.media_count);
    }
    if (user.total_clips_count !== undefined && user.total_clips_count !== null) {
        patch.reelCount = String(user.total_clips_count);
    }

    if (user.biography !== undefined) patch.signature = String(user.biography || '');
    if (user.category_name) patch.categoryName = String(user.category_name);
    else if (user.category) patch.categoryName = String(user.category);
    if (user.city_name) patch.cityName = String(user.city_name);
    if (user.city_name) patch.location = String(user.city_name);

    if (user.is_verified !== undefined) {
        patch.verified = !!user.is_verified;
        patch.isVerified = !!user.is_verified;
    }
    if (user.is_private !== undefined) patch.isPrivate = !!user.is_private;
    if (user.is_business !== undefined) patch.isBusiness = !!user.is_business;
    if (user.is_professional_account !== undefined) patch.isProfessionalAccount = !!user.is_professional_account;

    const shareLinks = extractInstagramHydrationShareLinks(user);
    if (shareLinks.length > 0) patch.shareLinks = shareLinks;

    const publicEmail = user.public_email ? String(user.public_email).trim() : '';
    const bioEmail = extractEmail(String(user.biography || ''));
    const email = publicEmail || bioEmail;
    if (email) {
        patch.email = email;
        patch.emailSourceUrl = profileUrl;
    }

    patch.taskHydrationStatus = 'success';
    patch.taskHydratedAt = Date.now();
    patch.taskHydrationError = null;
    patch.taskHydrationSource = sourceTag;

    return patch;
}

function buildInstagramTaskHydrationPatchFromPacket(packet, sessionSeed) {
    const user = getInstagramProfileHydrationUser(packet);
    if (!user) return null;

    const friendlyName = getInstagramPacketFriendlyName(packet);
    if (friendlyName && friendlyName !== 'PolarisProfilePageContentQuery') {
        return null;
    }

    return buildInstagramTaskHydrationPatchFromUser(user, sessionSeed, 'instagram_profile_graphql');
}

function extractInstagramUserFromWebProfileInfoResponse(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.user && typeof data.user === 'object' && data.user.username) return data.user;
    if (data.data && typeof data.data === 'object') {
        if (data.data.user && typeof data.data.user === 'object' && data.data.user.username) return data.data.user;
        if (data.data.user_data && typeof data.data.user_data === 'object' && data.data.user_data.username) return data.data.user_data;
    }
    const nested = findNestedValueByKey(data, 'user');
    if (nested && typeof nested === 'object' && nested.username) return nested;
    return null;
}

async function fetchInstagramWebProfileInfoHydrationPatch(sessionSeed) {
    const username = String(sessionSeed?.uniqueId || '').trim();
    if (!username) return null;

    const url = `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'x-requested-with': 'XMLHttpRequest'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const user = extractInstagramUserFromWebProfileInfoResponse(data);
    return buildInstagramTaskHydrationPatchFromUser(user, sessionSeed, 'instagram_web_profile_info_api');
}

function buildInstagramTaskHydrationPatchFromDom(sessionSeed, data) {
    if (!data || typeof data !== 'object') return null;

    const patch = {};
    const username = String(sessionSeed?.uniqueId || '').trim();
    const profileUrl = data.url || sessionSeed?.profileUrl || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : null);

    patch.platform = 'Instagram';
    if (profileUrl) {
        patch.url = profileUrl;
        patch.profileUrl = profileUrl;
    }
    if (username) patch.uniqueId = username;
    if (sessionSeed?.authorId) patch.authorId = String(sessionSeed.authorId);
    if (sessionSeed?.igUserPk) patch.igUserPk = String(sessionSeed.igUserPk);

    if (data.followers !== undefined && data.followers !== null && String(data.followers).trim()) {
        patch.followerCount = String(data.followers).trim();
    }
    if (data.email) {
        patch.email = String(data.email).trim();
        if (profileUrl) patch.emailSourceUrl = profileUrl;
    }
    if (Array.isArray(data.shareLinks) && data.shareLinks.length > 0) {
        patch.shareLinks = data.shareLinks.filter(Boolean).map((v) => String(v));
    }

    const useful =
        !!patch.followerCount ||
        !!patch.email ||
        (Array.isArray(patch.shareLinks) && patch.shareLinks.length > 0);
    if (!useful) return null;

    patch.taskHydrationStatus = 'success';
    patch.taskHydratedAt = Date.now();
    patch.taskHydrationError = null;
    patch.taskHydrationSource = 'instagram_profile_dom_fallback';

    return patch;
}

function sendInstagramTaskHydrationResultToBackground(seed, result) {
    const targetSeed = seed && typeof seed === 'object' ? seed : {};
    const payload = {
        action: 'instagramTaskHydrationResult',
        id: targetSeed.id,
        uniqueId: targetSeed.uniqueId,
        authorId: targetSeed.authorId,
        ...result
    };

    chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
            console.error('CreatorScan: instagramTaskHydrationResult send error', chrome.runtime.lastError, payload);
        } else {
            console.log('CreatorScan: instagramTaskHydrationResult sent', payload, response);
        }
    });
}

function finishInstagramTaskHydrationSession(result) {
    const session = instagramTaskHydrationSession;
    if (!session?.active) return;
    const seed = session.seed || {};
    clearInstagramTaskHydrationSessionState();
    sendInstagramTaskHydrationResultToBackground(seed, result);
}

function tryProcessBufferedInstagramTaskHydrationPackets() {
    if (!instagramTaskHydrationSession?.active) return false;
    const packets = instagramTaskHydrationRecentPackets.slice().reverse();
    for (const packet of packets) {
        const patch = buildInstagramTaskHydrationPatchFromPacket(packet, instagramTaskHydrationSession.seed);
        if (patch) {
            finishInstagramTaskHydrationSession({
                success: true,
                source: 'graphql-buffer',
                patch
            });
            return true;
        }
    }
    return false;
}

async function handleInstagramTaskHydrationGraphqlPacket(packet) {
    if (!instagramTaskHydrationSession?.active) return false;
    const patch = buildInstagramTaskHydrationPatchFromPacket(packet, instagramTaskHydrationSession.seed);
    if (!patch) return false;

    finishInstagramTaskHydrationSession({
        success: true,
        source: 'graphql-live',
        patch
    });
    return true;
}

async function handleInstagramTaskHydrationNoPacketTimeout() {
    if (!instagramTaskHydrationSession?.active) return;

    const session = instagramTaskHydrationSession;
    if (!session.reloadAttempted) {
        session.reloadAttempted = true;
        persistInstagramTaskHydrationSession();
        console.warn('CreatorScan: Instagram hydration packet wait timeout, reloading once', {
            uniqueId: session.seed?.uniqueId,
            url: window.location.href
        });
        window.location.reload();
        return;
    }

    if (!session.fallbackAttempted) {
        session.fallbackAttempted = true;
        persistInstagramTaskHydrationSession();
        try {
            const apiPatch = await fetchInstagramWebProfileInfoHydrationPatch(session.seed);
            if (apiPatch) {
                finishInstagramTaskHydrationSession({
                    success: true,
                    source: 'web-profile-info-api',
                    patch: apiPatch
                });
                return;
            }
        } catch (e) {
            console.warn('CreatorScan: Instagram web_profile_info fallback failed', e);
        }
        try {
            const domData = await scrapeInstagram();
            const patch = buildInstagramTaskHydrationPatchFromDom(session.seed, domData);
            if (patch) {
                finishInstagramTaskHydrationSession({
                    success: true,
                    source: 'dom-fallback',
                    patch
                });
                return;
            }
        } catch (e) {
            console.warn('CreatorScan: Instagram hydration DOM fallback failed', e);
        }
    }

    finishInstagramTaskHydrationSession({
        success: false,
        source: 'timeout',
        error: 'Instagram profile hydration packet not captured'
    });
}

function extractInstagramTaskKeyword(packet) {
    const variables = parseInstagramTaskVariables(packet);
    const fromVariables = typeof variables?.query === 'string' ? variables.query.trim() : '';
    if (fromVariables) return fromVariables;
    const fromTask = typeof taskConfig?.keyword === 'string' ? taskConfig.keyword.trim() : '';
    return fromTask || '';
}

function extractInstagramTaskSeedProfiles(packet) {
    const serp = findNestedValueByKey(packet?.response, 'xdt_fbsearch__top_serp_graphql');
    if (!serp || typeof serp !== 'object') return [];

    const keyword = extractInstagramTaskKeyword(packet);
    const seen = new Set();
    const profiles = [];
    const now = Date.now();
    const edges = Array.isArray(serp.edges) ? serp.edges : [];

    edges.forEach((edge) => {
        const node = edge?.node;
        const items = Array.isArray(node?.items) ? node.items : [];
        items.forEach((item) => {
            const user = item?.user;
            if (!user || typeof user !== 'object') return;

            const username = String(user.username || '').trim();
            if (!username) return;

            const authorId = String(user.id || user.pk || '').trim();
            const igUserPk = String(user.pk || '').trim();
            const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
            const seedKey = authorId || username.toLowerCase();
            if (!seedKey || seen.has(seedKey)) return;
            seen.add(seedKey);

            profiles.push({
                id: authorId || profileUrl,
                platform: 'Instagram',
                uniqueId: username,
                authorId: authorId || undefined,
                igUserPk: igUserPk || undefined,
                url: profileUrl,
                profileUrl: profileUrl,
                timestamp: now,
                sourceKeyword: keyword || undefined,
                matchedKeywords: keyword ? [keyword] : [],
                firstSeenAt: now,
                lastSeenAt: now,
                taskSeedType: 'instagram_keyword_user',
                taskHydrationStatus: 'pending'
            });
        });
    });

    return profiles;
}

async function handleInstagramTaskGraphqlPacket(packet) {
    if (!packet || typeof packet !== 'object') return;

    lastApiResponseTime = Date.now();
    taskInterceptCount++;

    if (taskConfig) {
        taskConfig.initialPageCount = taskInterceptCount;
        sessionStorage.setItem('creatorScanTaskConfig', JSON.stringify(taskConfig));
    }

    rememberInstagramTaskPacketSample(packet);

    const summary = summarizeInstagramTaskPacket(packet);
    console.log(`CreatorScan: Instagram task packet ${taskInterceptCount}/${taskConfig?.pageLimit}`, summary);

    try {
        const extracted = extractInstagramTaskSeedProfiles(packet);
        const newProfiles = extracted.filter((profile) => {
            if (!profile || profile.id === undefined || profile.id === null) return false;
            const key = String(profile.id);
            if (taskSeenProfileIds.has(key)) return false;
            taskSeenProfileIds.add(key);
            return true;
        });

        if (newProfiles.length > 0 && taskConfig?.taskId && taskConfig?.keyword) {
            chrome.runtime.sendMessage({
                action: 'saveTaskProfiles',
                taskId: taskConfig.taskId,
                keyword: taskConfig.keyword,
                data: newProfiles
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('CreatorScan: Instagram saveTaskProfiles error', chrome.runtime.lastError);
                } else {
                    console.log(`CreatorScan: Instagram saved ${newProfiles.length} new seed profiles`, response);
                }
            });
        }
    } catch (e) {
        console.error('CreatorScan: Failed to extract/save Instagram task profiles', e);
    }

    try {
        chrome.runtime.sendMessage({
            action: 'updateTaskProgress',
            taskId: taskConfig.taskId,
            keyword: taskConfig.keyword,
            pageCount: taskInterceptCount
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('CreatorScan: Instagram updateTaskProgress error', chrome.runtime.lastError);
            } else {
                console.log('CreatorScan: Instagram updateTaskProgress sent', response);
            }
        });
    } catch (e) {
        console.error('CreatorScan: Failed to send Instagram updateTaskProgress', e);
    }

    if (taskConfig?.pageLimit && taskInterceptCount >= taskConfig.pageLimit) {
        requestTaskKeywordComplete('page_limit_instagram_packet');
    }
}

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
    
    // Scroll to trigger next page
    triggerTikTokTaskScroll();
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
                const videoId = item.id || item.aweme_id || item.awemeId;
                
                // Check if valid number and within range
                if (!isNaN(followerCount)) {
                     if (followerCount >= minFollowers && followerCount <= maxFollowers) {
                        if (mode === 'task') {
                            if (!author.id || !author.uniqueId || !videoId) {
                                return;
                            }
                            // Task mode now stores a minimal seed first.
                            // Background service worker will fetch video/profile pages and hydrate details.
                            validProfiles.push({
                                id: author.id, // keep author-level dedupe behavior in current storage/UI
                                authorId: author.id,
                                userId: author.uniqueId, // handle used in /@{id}
                                uniqueId: author.uniqueId,
                                videoId: videoId,
                                secUid: author.secUid,
                                platform: 'TikTok',
                                timestamp: Date.now(),
                                taskSeedType: 'tiktok_video_author_pair'
                            });
                        } else {
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
                        }
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

    if (mode === 'task' && taskConfig?.pageLimit && taskInterceptCount >= taskConfig.pageLimit) {
        requestTaskKeywordComplete('page_limit_tiktok_packet');
    }
}
