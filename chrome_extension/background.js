// --- Task Orchestration Logic ---
let activeTaskTabs = new Map(); // tabId -> { taskId, keyword, startTime }
let taskQueueInterval = null;

// Listen for task messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // --- Task Orchestration ---
    if (request.action === 'checkTaskQueue') {
        checkTaskQueue();
        sendResponse({received: true});
    } else if (request.action === 'taskKeywordComplete') {
        handleTaskKeywordComplete(sender.tab.id, request.taskId, request.keyword);
        sendResponse({received: true});
    } else if (request.action === 'saveTaskProfiles') {
        saveTaskProfiles(request.taskId, request.keyword, request.data);
        sendResponse({received: true});
    } else if (request.action === 'stopTask') {
        stopTask(request.taskId);
        sendResponse({received: true});
    } else if (request.action === 'updateTaskProgress') {
        updateTaskProgress(request.taskId, request.keyword, request.pageCount)
            .then(() => sendResponse({success: true}))
            .catch(err => sendResponse({success: false, error: err.toString()}));
        return true; // Keep channel open for async response
    }
    // --- Data Saving ---
    else if (request.action === 'saveProfile') {
        saveProfile(request.data);
        sendResponse({received: true});
    } else if (request.action === 'saveBatchProfiles') {
        saveBatchProfiles(request.data);
        sendResponse({received: true});
    } 
    // --- Enrichment ---
    else if (request.action === 'startEnrichment') {
        enrichQueue = request.items;
        processEnrichmentQueue();
        sendResponse({received: true});
    } else if (request.action === 'enrichmentResult') {
        handleEnrichmentResult(sender.tab.id, request.data);
        sendResponse({received: true});
    } else if (request.action === 'stopEnrichment') {
        enrichQueue = [];
        console.log('Enrichment stopped by user.');
        sendResponse({received: true});
    } else if (request.action === 'getEnrichmentStatus') {
        sendResponse({ isEnriching: (enrichQueue.length > 0 || activeEnrichTabs.size > 0 || creatingTabCount > 0) });
    }
});

async function updateTaskProgress(taskId, keyword, pageCount) {
    const { tasks = [] } = await chrome.storage.local.get('tasks');
    // Ensure robust ID comparison (String vs String)
    const task = tasks.find(t => String(t.id) === String(taskId));
    
    if (task) {
        const kw = task.keywords.find(k => k.word === keyword);
        if (kw) {
            kw.pageCount = pageCount;
            await chrome.storage.local.set({ tasks });
            chrome.runtime.sendMessage({ action: 'tasksUpdated' }).catch(() => {});
            console.log(`CreatorScan: Updated task ${taskId} keyword "${keyword}" to page ${pageCount}`);
        } else {
            console.warn(`CreatorScan: Keyword "${keyword}" not found in task ${taskId}`);
        }
    } else {
        console.warn(`CreatorScan: Task ${taskId} not found`);
    }
}

async function stopTask(taskId) {
    const { tasks = [] } = await chrome.storage.local.get('tasks');
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
        task.status = 'paused'; // Or 'completed' if you want to force stop
        
        // Find active keywords for this task
        for (const [tabId, info] of activeTaskTabs.entries()) {
            if (info.taskId === taskId) {
                // Remove tab and update keyword status
                activeTaskTabs.delete(tabId);
                chrome.tabs.remove(tabId).catch(() => {});
                
                const kw = task.keywords.find(k => k.word === info.keyword);
                if (kw) kw.status = 'pending'; // Reset to pending so it can be resumed
            }
        }
        
        await chrome.storage.local.set({ tasks });
        chrome.runtime.sendMessage({ action: 'tasksUpdated' }).catch(() => {});
    }
}

async function checkTaskQueue() {
    const { tasks = [] } = await chrome.storage.local.get('tasks');
    let hasRunningTasks = false;
    let tasksChanged = false;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        
        // Skip completed tasks
        if (task.status === 'completed') continue;

        // If task is pending, mark it running
        if (task.status === 'pending') {
            task.status = 'running';
            tasksChanged = true;
        }

        if (task.status === 'running') {
            hasRunningTasks = true;
            
            // Check concurrency for this task
            const activeKeywordsForTask = Array.from(activeTaskTabs.values())
                .filter(t => t.taskId === task.id).length;
            
            const limit = task.config.concurrency || 1;
            
            if (activeKeywordsForTask < limit) {
                // Find next pending keyword
                const nextKeywordObj = task.keywords.find(k => k.status === 'pending');
                
                if (nextKeywordObj) {
                    // Start this keyword
                    nextKeywordObj.status = 'running';
                    tasksChanged = true;
                    
                    // Open tab
                    const searchUrl = getSearchUrl(task.platform, nextKeywordObj.word);
                    if (searchUrl) {
                        chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
                            if (tab) {
                                activeTaskTabs.set(tab.id, {
                                    taskId: task.id,
                                    keyword: nextKeywordObj.word,
                                    startTime: Date.now(),
                                    config: task.config
                                });
                                console.log(`Started keyword "${nextKeywordObj.word}" for task ${task.id} on tab ${tab.id}`);
                            }
                        });
                    } else {
                        // Explicitly skip unsupported platforms so task queue won't hang forever.
                        nextKeywordObj.status = 'completed';
                        task.progress.completed++;
                        tasksChanged = true;
                        console.warn(`CreatorScan: Unsupported task platform "${task.platform}", keyword "${nextKeywordObj.word}" skipped.`);
                    }
                } else {
                    // No pending keywords, check if all completed
                    const allDone = task.keywords.every(k => k.status === 'completed');
                    const anyRunning = task.keywords.some(k => k.status === 'running');
                    
                    if (allDone && !anyRunning) {
                        task.status = 'completed';
                        tasksChanged = true;
                    }
                }
            }
        }
    }

    if (tasksChanged) {
        await chrome.storage.local.set({ tasks });
        // Notify popup to update UI if open
        chrome.runtime.sendMessage({ action: 'tasksUpdated' }).catch(() => {});
    }
}

function getSearchUrl(platform, keyword) {
    const encoded = encodeURIComponent(keyword);
    if (platform === 'tiktok') {
        return `https://www.tiktok.com/search/video?q=${encoded}`;
    }
    if (platform === 'instagram') {
        return `https://www.instagram.com/explore/search/keyword/?q=${encoded}`;
    }
    if (platform === 'youtube') {
        return `https://www.youtube.com/results?search_query=${encoded}`;
    }
    return null;
}

// Monitor tab updates to start scraping
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && activeTaskTabs.has(tabId)) {
        const taskInfo = activeTaskTabs.get(tabId);
        
        // Fetch latest pageCount from storage to handle reloads/resumes correctly
        const { tasks = [] } = await chrome.storage.local.get('tasks');
        const task = tasks.find(t => t.id === taskInfo.taskId);
        let initialPageCount = 0;
        
        if (task) {
            const kw = task.keywords.find(k => k.word === taskInfo.keyword);
            if (kw) {
                initialPageCount = kw.pageCount || 0;
            }
        }
        
        // Wait a bit for page load
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
                action: 'startTaskScrape',
                config: {
                    taskId: taskInfo.taskId,
                    keyword: taskInfo.keyword,
                    platform: task?.platform,
                    initialPageCount: initialPageCount,
                    ...taskInfo.config
                }
            }).catch(err => console.log("Failed to send startTaskScrape", err));
        }, 3000);
    }
});

async function handleTaskKeywordComplete(tabId, taskId, keyword) {
    if (activeTaskTabs.has(tabId)) {
        activeTaskTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
    }

    const { tasks = [] } = await chrome.storage.local.get('tasks');
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex !== -1) {
        const task = tasks[taskIndex];
        const kwIndex = task.keywords.findIndex(k => k.word === keyword);
        
        if (kwIndex !== -1) {
            task.keywords[kwIndex].status = 'completed';
            task.progress.completed++;
            
            // Check if task is fully complete
            const allDone = task.keywords.every(k => k.status === 'completed');
            if (allDone) {
                task.status = 'completed';
            }
            
            await chrome.storage.local.set({ tasks });
            chrome.runtime.sendMessage({ action: 'tasksUpdated' }).catch(() => {});
        }
    }
    
    // Check queue for next item
    checkTaskQueue();
}

async function saveTaskProfiles(taskId, keyword, profiles) {
    const { tasks = [] } = await chrome.storage.local.get('tasks');
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
        const kwObj = task.keywords.find(k => k.word === keyword);
        if (kwObj) {
            kwObj.collected = (kwObj.collected || 0) + profiles.length;
            await chrome.storage.local.set({ tasks });
        }
    }
    
    // Reuse existing save logic or create new
    // For now, save to 'batchCollectedCreators' as before so it appears in Results page
    saveBatchProfiles(profiles);
}

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
    if (activeTaskTabs.has(tabId)) {
        console.log(`Tab ${tabId} closed manually? Cleaning up.`);
        // Ideally we should mark keyword as failed or reset to pending?
        // For now just remove from active tracking so we can spawn a new one if needed
        // But if we don't update task status, it stays 'running' forever.
        // Let's reset to 'pending' if it wasn't completed.
        const info = activeTaskTabs.get(tabId);
        activeTaskTabs.delete(tabId);
        
        // Fix stuck task status
        chrome.storage.local.get('tasks', (res) => {
            const tasks = res.tasks || [];
            const task = tasks.find(t => t.id === info.taskId);
            if (task) {
                const kw = task.keywords.find(k => k.word === info.keyword);
                if (kw && kw.status === 'running') {
                    kw.status = 'pending'; // Retry
                    chrome.storage.local.set({ tasks });
                }
            }
            checkTaskQueue();
        });
    }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['isRecording', 'creators', 'isBatchScraping', 'batchCollectedCreators'], (result) => {
    if (result.isRecording === undefined) {
      chrome.storage.local.set({ isRecording: false });
    }
    if (result.creators === undefined) {
      chrome.storage.local.set({ creators: [] });
    }
    if (result.isBatchScraping === undefined) {
        chrome.storage.local.set({ isBatchScraping: false });
    }
    if (result.batchCollectedCreators === undefined) {
        chrome.storage.local.set({ batchCollectedCreators: [] });
    }
  });
});

// Second listener removed (merged into main listener)

function saveBatchProfiles(newProfiles) {
    chrome.storage.local.get(['batchCollectedCreators', 'batchSessionCount'], (result) => {
        let creators = result.batchCollectedCreators || [];
        let sessionCount = result.batchSessionCount || 0;
        
        // Deduplicate
        let addedCount = 0;
        newProfiles.forEach(p => {
            if (!creators.some(c => c.id === p.id)) {
                creators.push(p);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            sessionCount += addedCount;
            chrome.storage.local.set({ 
                batchCollectedCreators: creators,
                batchSessionCount: sessionCount 
            });
            console.log(`Saved ${addedCount} new batch profiles. Session count: ${sessionCount}`);
            chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
        }
    });
}

function saveProfile(newProfile) {
  chrome.storage.local.get(['creators', 'isRecording'], (result) => {
    if (!result.isRecording) return; // Double check

    const creators = result.creators || [];
    
    // Check for duplicates based on URL
    const exists = creators.some(c => c.url === newProfile.url);
    
    if (!exists) {
      creators.push(newProfile);
      chrome.storage.local.set({ creators: creators });
      console.log('Saved new profile:', newProfile.url);
      chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
    } else {
      // Optional: Update existing profile if needed, for now just skip
      console.log('Profile already exists:', newProfile.url);
    }
  });
}

// Enrichment State
let enrichQueue = [];
let activeEnrichTabs = new Map(); // tabId -> item
let creatingTabCount = 0; // Track tabs currently being created
const MAX_CONCURRENT_ENRICH = 3;
const ENRICH_TIMEOUT = 30000; // 30s timeout per tab

function processEnrichmentQueue() {
    if (enrichQueue.length === 0 && activeEnrichTabs.size === 0 && creatingTabCount === 0) {
        console.log('Enrichment complete.');
        // Notify frontend
        chrome.runtime.sendMessage({ action: 'enrichmentComplete' }).catch(() => {});
        return;
    }
    
    // Check if we have capacity: (active + creating) < limit
    while ((activeEnrichTabs.size + creatingTabCount) < MAX_CONCURRENT_ENRICH && enrichQueue.length > 0) {
        const item = enrichQueue.shift();
        creatingTabCount++; // Reserve slot synchronously
        
        chrome.tabs.create({ url: item.url, active: false }, (tab) => {
            creatingTabCount--; // Release reservation
            
            if (chrome.runtime.lastError || !tab) {
                 console.error("Failed to open tab for enrichment:", chrome.runtime.lastError);
                 // Optionally re-queue item or just proceed
                 processEnrichmentQueue();
                 return;
            }
            
            activeEnrichTabs.set(tab.id, item);
            console.log('Opened tab for enrichment:', item.url);
            
            // Timeout safety
            setTimeout(() => {
                if (activeEnrichTabs.has(tab.id)) {
                    console.log('Enrichment timeout, closing:', item.url);
                    handleEnrichmentResult(tab.id, 'timeout');
                }
            }, ENRICH_TIMEOUT);
        });
    }
}

// Monitor tab updates to inject script/trigger scrape
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && activeEnrichTabs.has(tabId)) {
        // Wait a bit for dynamic content
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'scrapeDeep' });
        }, 3000); // 3s wait after load
    }
});

function handleEnrichmentResult(tabId, data) {
    if (!activeEnrichTabs.has(tabId)) return;
    
    const item = activeEnrichTabs.get(tabId);
    activeEnrichTabs.delete(tabId);
    
    // Determine storage key
    const storageKey = item.source === 'imported' ? 'importedCreators' : 'batchCollectedCreators';

    // Update storage
    chrome.storage.local.get(storageKey, (result) => {
        let creators = result[storageKey] || [];
        const index = creators.findIndex(c => c.id === item.id);
        
        if (index !== -1) {
            // Only mark as deepScraped if we got valid data (not timeout, not error)
            // And data object is not empty (though scrapeTikTok always returns object)
            // User requested: "if failed, do not mark".
            // We consider 'timeout' or 'no_data' as failure.
            
            if (data && typeof data === 'object') {
                creators[index].deepScraped = true;
                
                // Replace original data with new data
                if (data.email) creators[index].email = data.email;
                if (data.shareLinks) creators[index].shareLinks = data.shareLinks;
                if (data.followers) creators[index].followerCount = data.followers; // Update followers
                if (data.avatar) creators[index].avatar = data.avatar;
                if (data.nickname) creators[index].nickname = data.nickname;
                if (data.signature) creators[index].signature = data.signature;
                
                console.log('Enriched & Updated:', item.id, data.email);
            } else {
                console.log('Enrichment failed (no data/timeout) for:', item.id);
                // Do NOT set deepScraped = true
            }
            
            chrome.storage.local.set({ [storageKey]: creators });
        }
        
        chrome.tabs.remove(tabId, () => {
             if (chrome.runtime.lastError) {}
        });
        processEnrichmentQueue();
    });
}
