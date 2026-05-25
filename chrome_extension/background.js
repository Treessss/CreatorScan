// --- Task Orchestration Logic ---
let activeTaskTabs = new Map(); // tabId -> { taskId, keyword, startTime }
let taskQueueInterval = null;
let tiktokTaskHydrationQueue = [];
const activeTikTokTaskHydrationIds = new Set();
const queuedTikTokTaskHydrationIds = new Set();
const MAX_CONCURRENT_TIKTOK_TASK_HYDRATION = 2;
let instagramTaskHydrationQueue = [];
let instagramTaskHydrationDeferredRetryQueue = [];
let instagramTaskCountryHydrationQueue = [];
let instagramTaskCountryHydrationDeferredRetryQueue = [];
const activeInstagramTaskHydrationIds = new Set();
const queuedInstagramTaskHydrationIds = new Set();
const queuedInstagramTaskHydrationDeferredRetryIds = new Set();
const activeInstagramTaskCountryHydrationIds = new Set();
const queuedInstagramTaskCountryHydrationIds = new Set();
const queuedInstagramTaskCountryHydrationDeferredRetryIds = new Set();
const activeInstagramTaskHydrationTabs = new Map(); // tabId -> { seed, timeoutId, startedAt }
let creatingInstagramTaskHydrationTabCount = 0;
const MAX_CONCURRENT_INSTAGRAM_TASK_HYDRATION = 2;
const MAX_CONCURRENT_INSTAGRAM_COUNTRY_HYDRATION = 3;
const INSTAGRAM_TASK_HYDRATION_TAB_MODE_ENABLED = false;
const INSTAGRAM_TASK_HYDRATION_TIMEOUT_MS = 30000;
const INSTAGRAM_TASK_HYDRATION_START_DELAY_MS = 1200;
const INSTAGRAM_TASK_HYDRATION_JOB_TIMEOUT_MS = 45000;
const INSTAGRAM_TASK_HYDRATION_SEND_MESSAGE_TIMEOUT_MS = 12000;
const INSTAGRAM_TASK_HYDRATION_MAX_ATTEMPTS = 2; // first pass + final retry
const INSTAGRAM_COUNTRY_HYDRATION_MAX_ATTEMPTS = 2; // first pass + final retry
const INSTAGRAM_ABOUT_THIS_ACCOUNT_UI_TAB_LOAD_TIMEOUT_MS = 20000;
const INSTAGRAM_ABOUT_THIS_ACCOUNT_UI_ACTION_TIMEOUT_MS = 25000;
const INSTAGRAM_WEB_PROFILE_INFO_FETCH_TIMEOUT_MS = 15000;
const INSTAGRAM_PROFILE_HTML_FETCH_TIMEOUT_MS = 15000;
const INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_FETCH_TIMEOUT_MS = 15000;
const INSTAGRAM_WEB_APP_ID = '936619743392459';
const INSTAGRAM_ASBD_ID = '359341';
const INSTAGRAM_ABOUT_THIS_ACCOUNT_APP_ID = 'com.bloks.www.ig.about_this_account';
const INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_CACHE_KEY = 'creatorScanInstagramAboutThisAccountWbloksTemplate';
const INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_MAX_AGE_MS = 30 * 60 * 1000;
const INSTAGRAM_ABOUT_THIS_ACCOUNT_BACKGROUND_FETCH_ENABLED = false;
const TIKTOK_EXTERNAL_EMAIL_LINK_CHECK_LIMIT = 3;
const TIKTOK_EXTERNAL_EMAIL_FETCH_TIMEOUT_MS = 8000;
const TIKTOK_EXTERNAL_EMAIL_MAX_HTML_CHARS = 600000;
const TIKTOK_EXTERNAL_EMAIL_RECURSE_MAX_DEPTH = 2; // root external page + discovered social links
const TIKTOK_EXTERNAL_EMAIL_RECURSE_MAX_TOTAL_PAGES = 8;
const TIKTOK_EXTERNAL_EMAIL_RECURSE_MAX_DISCOVERED_PER_PAGE = 6;
let batchCreatorsWriteChain = Promise.resolve();
let manualCreatorsWriteChain = Promise.resolve();
let importedCreatorsWriteChain = Promise.resolve();
let tiktokTaskHydrationWasBusy = false;
let instagramTaskHydrationWasBusy = false;
let instagramTaskHydrationFinalFailureCount = 0;
let instagramTaskCountryHydrationFinalFailureCount = 0;
const LOCAL_AVATAR_CACHE_TIMEOUT_MS = 8000;
const LOCAL_AVATAR_CACHE_MAX_BYTES = 700 * 1024;
const MAX_CONCURRENT_LOCAL_AVATAR_CACHE = 2;
const localAvatarCacheQueue = [];
const queuedLocalAvatarCacheJobKeys = new Set();
const activeLocalAvatarCacheJobKeys = new Set();
let instagramAboutThisAccountWbloksTemplateCache = null;
let instagramAboutThisAccountWbloksTemplateLoaded = false;
let instagramAboutThisAccountWbloksReqCounter = 11;
let instagramCountryNameToIso2Map = null;
const activeInstagramTaskHydrationJobs = new Map(); // key -> { key, runId, cancelled, cancelReason, controllers:Set<AbortController>, isFinalRetry:boolean, attempt:number }
const activeInstagramTaskCountryHydrationJobs = new Map(); // key -> { key, runId, cancelled, cancelReason, controllers:Set<AbortController>, isFinalRetry:boolean, attempt:number }
let instagramTaskHydrationRunId = 1;

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
        saveTaskProfiles(request.taskId, request.keyword, request.data)
            .catch(err => console.error('CreatorScan: saveTaskProfiles failed', err));
        sendResponse({received: true});
    } else if (request.action === 'startTikTokTaskHydrationRetry') {
        const queued = startTikTokTaskHydrationRetry(request.items || []);
        sendResponse({ received: true, queued });
    } else if (request.action === 'stopTikTokTaskHydrationRetry') {
        stopTikTokTaskHydrationRetry();
        sendResponse({ received: true });
    } else if (request.action === 'getTikTokTaskHydrationStatus') {
        sendResponse(getTikTokTaskHydrationStatus());
    } else if (request.action === 'startInstagramTaskHydrationRetry') {
        const queued = startInstagramTaskHydrationRetry(request.items || []);
        sendResponse({ received: true, queued });
    } else if (request.action === 'stopInstagramTaskHydrationRetry') {
        stopInstagramTaskHydrationRetry();
        sendResponse({ received: true });
    } else if (request.action === 'getInstagramTaskHydrationStatus') {
        sendResponse(getInstagramTaskHydrationStatus());
    } else if (request.action === 'instagramTaskHydrationResult') {
        handleInstagramTaskHydrationResult(sender.tab?.id, request)
            .then(() => sendResponse({ received: true }))
            .catch((err) => sendResponse({ received: false, error: String(err) }));
        return true;
    } else if (request.action === 'cacheInstagramAboutThisAccountWbloksPacket') {
        cacheInstagramAboutThisAccountWbloksPacket(request.packet)
            .then((cached) => sendResponse({ received: true, cached }))
            .catch((err) => sendResponse({ received: false, error: String(err) }));
        return true;
    } else if (request.action === 'queueLocalAvatarCacheBackfill') {
        queueLocalAvatarCacheBackfill()
            .then((queued) => sendResponse({ received: true, queued }))
            .catch((err) => sendResponse({ received: false, error: String(err) }));
        return true;
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
        saveBatchProfiles(request.data)
            .catch(err => console.error('CreatorScan: saveBatchProfiles failed', err));
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!INSTAGRAM_TASK_HYDRATION_TAB_MODE_ENABLED) return;
    if (changeInfo.status !== 'complete') return;
    if (!activeInstagramTaskHydrationTabs.has(tabId)) return;

    const job = activeInstagramTaskHydrationTabs.get(tabId);
    if (!job || !job.seed) return;

    setTimeout(() => {
        if (!activeInstagramTaskHydrationTabs.has(tabId)) return;
        chrome.tabs.sendMessage(tabId, {
            action: 'startInstagramTaskHydration',
            seed: {
                ...job.seed,
                profileUrl: getInstagramTaskHydrationProfileUrl(job.seed)
            },
            options: {
                reason: 'background_tab_complete'
            }
        }).catch((err) => {
            console.warn('CreatorScan: Failed to send startInstagramTaskHydration', tabId, err);
        });
    }, INSTAGRAM_TASK_HYDRATION_START_DELAY_MS);
});

async function handleTaskKeywordComplete(tabId, taskId, keyword) {
    if (activeTaskTabs.has(tabId)) {
        activeTaskTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
    }

    const { tasks = [] } = await chrome.storage.local.get('tasks');
    const taskIndex = tasks.findIndex(t => String(t.id) === String(taskId));
    
    if (taskIndex !== -1) {
        const task = tasks[taskIndex];
        const kwIndex = task.keywords.findIndex(k => k.word === keyword);
        
        if (kwIndex !== -1) {
            const wasCompleted = task.keywords[kwIndex].status === 'completed';
            task.keywords[kwIndex].status = 'completed';
            if (!wasCompleted) {
                const total = Number(task?.progress?.total || task.keywords.length || 0);
                const nextCompleted = Number(task?.progress?.completed || 0) + 1;
                task.progress.completed = total > 0 ? Math.min(nextCompleted, total) : nextCompleted;
            }
            
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
    const saveResult = await saveBatchProfiles(profiles);
    const addedCount = saveResult.addedCount || 0;

    const { tasks = [] } = await chrome.storage.local.get('tasks');
    const task = tasks.find(t => String(t.id) === String(taskId));
    
    if (task) {
        const kwObj = task.keywords.find(k => k.word === keyword);
        if (kwObj && addedCount > 0) {
            // Use deduped additions, otherwise UI count can be higher than actual stored rows.
            kwObj.collected = (kwObj.collected || 0) + addedCount;
            await chrome.storage.local.set({ tasks });
            chrome.runtime.sendMessage({ action: 'tasksUpdated' }).catch(() => {});
        }
    }

    const addedTikTokSeeds = (saveResult.addedProfiles || []).filter(isTikTokTaskSeedProfile);
    if (addedTikTokSeeds.length > 0) {
        queueTikTokTaskHydrations(addedTikTokSeeds);
    }

    const addedInstagramSeeds = (saveResult.addedProfiles || []).filter(isInstagramTaskHydrationCandidate);
    if (addedInstagramSeeds.length > 0) {
        queueInstagramTaskHydrations(addedInstagramSeeds);
    }
}

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
    if (activeInstagramTaskHydrationTabs.has(tabId)) {
        handleInstagramTaskHydrationTabClosed(tabId)
            .catch((err) => console.warn('CreatorScan: Instagram hydration tab close cleanup failed', err));
    }

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
    queueLocalAvatarCacheBackfill().catch((err) => console.warn('CreatorScan: avatar backfill skipped on install', err));
  });
});

chrome.runtime.onStartup.addListener(() => {
    queueLocalAvatarCacheBackfill().catch((err) => console.warn('CreatorScan: avatar backfill skipped on startup', err));
});

// Second listener removed (merged into main listener)

function withBatchCreatorsWriteLock(fn) {
    const run = () => Promise.resolve().then(fn);
    const chained = batchCreatorsWriteChain.then(run, run);
    // Keep chain alive even if one operation fails.
    batchCreatorsWriteChain = chained.catch(() => {});
    return chained;
}

function withCreatorsWriteLock(storageKey, fn) {
    if (storageKey === 'batchCollectedCreators') {
        return withBatchCreatorsWriteLock(fn);
    }
    const run = () => Promise.resolve().then(fn);
    if (storageKey === 'importedCreators') {
        const chained = importedCreatorsWriteChain.then(run, run);
        importedCreatorsWriteChain = chained.catch(() => {});
        return chained;
    }
    const chained = manualCreatorsWriteChain.then(run, run);
    manualCreatorsWriteChain = chained.catch(() => {});
    return chained;
}

function getCreatorIdentityForStorageKey(storageKey, item) {
    if (!item) return null;
    if (storageKey === 'creators') {
        if (!item.url) return null;
        return { field: 'url', value: String(item.url) };
    }
    if (item.id === undefined || item.id === null) return null;
    return { field: 'id', value: String(item.id) };
}

function isRemoteAvatarUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

function shouldCacheAvatarLocally(item) {
    if (!item) return false;
    const avatar = typeof item.avatar === 'string' ? item.avatar.trim() : '';
    if (!isRemoteAvatarUrl(avatar)) return false;
    if (typeof item.avatarLocal === 'string' && item.avatarLocal.startsWith('data:image/')) {
        if (item.avatarLocalSourceUrl && String(item.avatarLocalSourceUrl) === avatar) {
            return false;
        }
    }
    return true;
}

function queueLocalAvatarCacheForItems(storageKey, items) {
    let queued = 0;
    for (const item of (items || [])) {
        if (!shouldCacheAvatarLocally(item)) continue;
        const identity = getCreatorIdentityForStorageKey(storageKey, item);
        if (!identity) continue;
        const jobKey = `${storageKey}:${identity.field}:${identity.value}`;
        if (queuedLocalAvatarCacheJobKeys.has(jobKey) || activeLocalAvatarCacheJobKeys.has(jobKey)) continue;
        queuedLocalAvatarCacheJobKeys.add(jobKey);
        localAvatarCacheQueue.push({
            key: jobKey,
            storageKey,
            matchField: identity.field,
            matchValue: identity.value
        });
        queued++;
    }
    processLocalAvatarCacheQueue();
    return queued;
}

async function queueLocalAvatarCacheBackfill() {
    const { batchCollectedCreators = [], importedCreators = [], creators = [] } = await chrome.storage.local.get([
        'batchCollectedCreators',
        'importedCreators',
        'creators'
    ]);
    let totalQueued = 0;
    totalQueued += queueLocalAvatarCacheForItems('batchCollectedCreators', batchCollectedCreators);
    totalQueued += queueLocalAvatarCacheForItems('importedCreators', importedCreators);
    totalQueued += queueLocalAvatarCacheForItems('creators', creators);
    return totalQueued;
}

async function fetchAvatarDataUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOCAL_AVATAR_CACHE_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'omit',
            cache: 'force-cache',
            signal: controller.signal
        });
        if (!response.ok) return null;
        const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!contentType.startsWith('image/')) return null;
        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;
        if (arrayBuffer.byteLength > LOCAL_AVATAR_CACHE_MAX_BYTES) return null;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return `data:${contentType || 'image/jpeg'};base64,${btoa(binary)}`;
    } catch (err) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function patchLocalAvatarCacheField(storageKey, matchField, matchValue, sourceAvatarUrl, dataUrl) {
    if (!dataUrl) return false;
    return withCreatorsWriteLock(storageKey, async () => {
        const result = await chrome.storage.local.get(storageKey);
        const list = Array.isArray(result[storageKey]) ? result[storageKey].slice() : [];
        const index = list.findIndex((item) => String(item?.[matchField]) === String(matchValue));
        if (index === -1) return false;

        const current = list[index] || {};
        const currentAvatar = typeof current.avatar === 'string' ? current.avatar.trim() : '';
        if (!currentAvatar || !isRemoteAvatarUrl(currentAvatar)) return false;
        if (currentAvatar !== sourceAvatarUrl) {
            // Avatar changed after job was queued; let newer save/patch queue another cache job.
            return false;
        }

        list[index] = {
            ...current,
            avatarLocal: dataUrl,
            avatarLocalSourceUrl: sourceAvatarUrl,
            avatarLocalCachedAt: Date.now()
        };
        await chrome.storage.local.set({ [storageKey]: list });
        chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
        return true;
    });
}

async function processLocalAvatarCacheQueue() {
    while (activeLocalAvatarCacheJobKeys.size < MAX_CONCURRENT_LOCAL_AVATAR_CACHE && localAvatarCacheQueue.length > 0) {
        const job = localAvatarCacheQueue.shift();
        if (!job || !job.key) continue;
        queuedLocalAvatarCacheJobKeys.delete(job.key);
        activeLocalAvatarCacheJobKeys.add(job.key);

        (async () => {
            try {
                const result = await chrome.storage.local.get(job.storageKey);
                const list = Array.isArray(result[job.storageKey]) ? result[job.storageKey] : [];
                const item = list.find((row) => String(row?.[job.matchField]) === String(job.matchValue));
                if (!shouldCacheAvatarLocally(item)) return;
                const sourceAvatarUrl = String(item.avatar).trim();
                const dataUrl = await fetchAvatarDataUrl(sourceAvatarUrl);
                if (!dataUrl) return;
                await patchLocalAvatarCacheField(job.storageKey, job.matchField, job.matchValue, sourceAvatarUrl, dataUrl);
            } catch (err) {
                console.warn('CreatorScan: local avatar cache job failed', err);
            } finally {
                activeLocalAvatarCacheJobKeys.delete(job.key);
                processLocalAvatarCacheQueue();
            }
        })();
    }
}

function isMeaningfulCreatorFieldValue(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function mergeUniqueStringArray(existingValue, incomingValue) {
    const combined = [];
    const seen = new Set();
    const push = (val) => {
        if (val === undefined || val === null) return;
        const str = String(val).trim();
        if (!str) return;
        const key = str.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        combined.push(str);
    };

    (Array.isArray(existingValue) ? existingValue : []).forEach(push);
    (Array.isArray(incomingValue) ? incomingValue : []).forEach(push);
    return combined;
}

function getTaskHydrationStatusRank(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'success') return 3;
    if (value === 'failed') return 2;
    if (value === 'pending') return 1;
    return 0;
}

function mergeBatchCreatorRecord(existingRecord, incomingRecord) {
    const existing = existingRecord && typeof existingRecord === 'object' ? existingRecord : {};
    const incoming = incomingRecord && typeof incomingRecord === 'object' ? incomingRecord : {};
    const next = { ...existing };
    let changed = false;

    const assign = (key, value) => {
        next[key] = value;
        changed = true;
    };

    const mergedMatchedKeywords = mergeUniqueStringArray(existing.matchedKeywords, incoming.matchedKeywords);
    if (mergedMatchedKeywords.length > 0) {
        const before = Array.isArray(existing.matchedKeywords) ? existing.matchedKeywords : [];
        if (
            before.length !== mergedMatchedKeywords.length ||
            before.some((v, i) => String(v) !== String(mergedMatchedKeywords[i]))
        ) {
            assign('matchedKeywords', mergedMatchedKeywords);
        }
    }

    const mergedShareLinks = mergeUniqueStringArray(existing.shareLinks, incoming.shareLinks);
    if (mergedShareLinks.length > 0) {
        const before = Array.isArray(existing.shareLinks) ? existing.shareLinks : [];
        if (
            before.length !== mergedShareLinks.length ||
            before.some((v, i) => String(v) !== String(mergedShareLinks[i]))
        ) {
            assign('shareLinks', mergedShareLinks);
        }
    }

    const mergedTags = mergeUniqueStringArray(existing.tags, incoming.tags);
    if (mergedTags.length > 0) {
        const before = Array.isArray(existing.tags) ? existing.tags : [];
        if (
            before.length !== mergedTags.length ||
            before.some((v, i) => String(v) !== String(mergedTags[i]))
        ) {
            assign('tags', mergedTags);
        }
    }

    const numericMinFields = ['timestamp', 'firstSeenAt'];
    numericMinFields.forEach((key) => {
        const incomingVal = incoming[key];
        if (typeof incomingVal !== 'number' || !Number.isFinite(incomingVal)) return;
        const existingVal = next[key];
        if (typeof existingVal !== 'number' || !Number.isFinite(existingVal) || incomingVal < existingVal) {
            assign(key, incomingVal);
        }
    });

    const numericMaxFields = ['lastSeenAt', 'taskHydratedAt'];
    numericMaxFields.forEach((key) => {
        const incomingVal = incoming[key];
        if (typeof incomingVal !== 'number' || !Number.isFinite(incomingVal)) return;
        const existingVal = next[key];
        if (typeof existingVal !== 'number' || !Number.isFinite(existingVal) || incomingVal > existingVal) {
            assign(key, incomingVal);
        }
    });

    if (isMeaningfulCreatorFieldValue(incoming.sourceKeyword) && !isMeaningfulCreatorFieldValue(existing.sourceKeyword)) {
        assign('sourceKeyword', incoming.sourceKeyword);
    }

    if (isMeaningfulCreatorFieldValue(incoming.taskHydrationStatus)) {
        const incomingRank = getTaskHydrationStatusRank(incoming.taskHydrationStatus);
        const existingRank = getTaskHydrationStatusRank(existing.taskHydrationStatus);
        if (incomingRank > existingRank) {
            assign('taskHydrationStatus', incoming.taskHydrationStatus);
        } else if (!isMeaningfulCreatorFieldValue(existing.taskHydrationStatus)) {
            assign('taskHydrationStatus', incoming.taskHydrationStatus);
        }
    }

    if (
        isMeaningfulCreatorFieldValue(incoming.taskHydrationError) &&
        (!isMeaningfulCreatorFieldValue(existing.taskHydrationError) || getTaskHydrationStatusRank(existing.taskHydrationStatus) < 3)
    ) {
        assign('taskHydrationError', incoming.taskHydrationError);
    }

    Object.entries(incoming).forEach(([key, value]) => {
        if ([
            'matchedKeywords',
            'shareLinks',
            'tags',
            'timestamp',
            'firstSeenAt',
            'lastSeenAt',
            'taskHydratedAt',
            'sourceKeyword',
            'taskHydrationStatus',
            'taskHydrationError'
        ].includes(key)) {
            return;
        }
        if (!isMeaningfulCreatorFieldValue(value)) return;
        if (!isMeaningfulCreatorFieldValue(next[key])) {
            assign(key, value);
        }
    });

    return { changed, record: changed ? next : existing };
}

async function saveBatchProfiles(newProfiles) {
    return withBatchCreatorsWriteLock(async () => {
        const result = await chrome.storage.local.get(['batchCollectedCreators', 'batchSessionCount']);
        let creators = result.batchCollectedCreators || [];
        let sessionCount = result.batchSessionCount || 0;

        const seenIds = new Set(creators.map(c => String(c.id)));
        const addedProfiles = [];
        let updatedCount = 0;
        let hasChanges = false;

        (newProfiles || []).forEach(p => {
            if (!p || p.id === undefined || p.id === null) return;
            const key = String(p.id);
            if (!seenIds.has(key)) {
                creators.push(p);
                seenIds.add(key);
                addedProfiles.push(p);
                hasChanges = true;
                return;
            }

            const index = creators.findIndex(c => String(c.id) === key);
            if (index === -1) return;

            const merged = mergeBatchCreatorRecord(creators[index], p);
            if (merged.changed) {
                creators[index] = merged.record;
                updatedCount += 1;
                hasChanges = true;
            }
        });

        const addedCount = addedProfiles.length;
        if (hasChanges) {
            sessionCount += addedCount;
            await chrome.storage.local.set({ 
                batchCollectedCreators: creators,
                batchSessionCount: sessionCount 
            });
            console.log(`Saved ${addedCount} new batch profiles, merged ${updatedCount}. Session count: ${sessionCount}`);
            chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
            if (addedCount > 0) {
                queueLocalAvatarCacheForItems('batchCollectedCreators', addedProfiles);
            }
        }

        return { addedCount, addedProfiles, updatedCount };
    });
}

function saveProfile(newProfile) {
  withCreatorsWriteLock('creators', async () => {
    const result = await chrome.storage.local.get(['creators', 'isRecording']);
    if (!result.isRecording) return;

    const normalized = normalizeManualProfileRecordForStorage(newProfile);
    if (!normalized) return;

    const creators = Array.isArray(result.creators) ? result.creators.slice() : [];
    const normalizedUrl = String(normalized.url || '').trim();
    const normalizedProfileUrl = String(normalized.profileUrl || '').trim();

    const index = creators.findIndex((item) => {
        const itemUrl = String(item?.url || '').trim();
        const itemProfileUrl = String(item?.profileUrl || '').trim();
        if (normalizedUrl && itemUrl === normalizedUrl) return true;
        if (normalizedUrl && itemProfileUrl === normalizedUrl) return true;
        if (normalizedProfileUrl && itemUrl === normalizedProfileUrl) return true;
        if (normalizedProfileUrl && itemProfileUrl === normalizedProfileUrl) return true;
        return false;
    });

    let savedRecord = normalized;
    if (index >= 0) {
        const merged = mergeBatchCreatorRecord(creators[index], normalized);
        if (!merged.changed) return;
        creators[index] = merged.record;
        savedRecord = merged.record;
        console.log('Updated manual profile:', savedRecord.url || savedRecord.profileUrl || '(unknown)');
    } else {
        creators.push(normalized);
        console.log('Saved new manual profile:', normalized.url || normalized.profileUrl || '(unknown)');
    }

    await chrome.storage.local.set({ creators });
    queueLocalAvatarCacheForItems('creators', [savedRecord]);
    chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
  }).catch((err) => console.error('CreatorScan: saveProfile failed', err));
}

function normalizeManualProfileRecordForStorage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const now = Date.now();
    const rawTimestamp = Number(raw.timestamp);
    const timestamp = Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? rawTimestamp : now;

    const platform = normalizeCreatorPlatformName(raw.platform);
    const url = normalizeManualProfileUrl(raw.url || raw.profileUrl);
    if (!url) return null;

    const uniqueId = (
        String(raw.uniqueId || raw.userId || raw.username || '').trim() ||
        extractUniqueIdFromProfileUrl(url, platform)
    );

    const followerRaw = String(raw.followerCount || raw.followers || '').trim();
    const followerCount = followerRaw ? (normalizeInstagramCountTokenToIntegerString(followerRaw) || followerRaw) : '';

    const shareLinks = normalizeManualShareLinks(raw.shareLinks, url);
    const email = normalizeManualEmail(raw.email);
    const nickname = String(raw.nickname || raw.displayName || '').trim();
    const signature = String(raw.signature || raw.bio || raw.description || '').trim();
    const avatar = String(raw.avatar || '').trim();

    const record = {
        ...raw,
        id: String(raw.id || url),
        platform,
        sourceType: 'manual',
        taskSeedType: 'manual_profile',
        taskHydrationSource: 'manual_scrape',
        timestamp,
        firstSeenAt: Number.isFinite(Number(raw.firstSeenAt)) ? Number(raw.firstSeenAt) : timestamp,
        lastSeenAt: now,
        url,
        profileUrl: url,
        uniqueId: uniqueId || undefined
    };

    if (email) record.email = email;
    if (shareLinks.length > 0) record.shareLinks = shareLinks;
    else delete record.shareLinks;

    if (followerCount) {
        record.followerCount = String(followerCount);
        record.followers = String(followerCount); // keep compatibility with legacy manual table/export
    } else {
        delete record.followerCount;
        delete record.followers;
    }

    if (nickname) record.nickname = nickname;
    else delete record.nickname;

    if (signature) record.signature = signature;
    else delete record.signature;

    if (avatar) record.avatar = avatar;
    else delete record.avatar;

    if (!record.uniqueId) delete record.uniqueId;
    return record;
}

function normalizeCreatorPlatformName(platform) {
    const value = String(platform || '').trim().toLowerCase();
    if (value === 'instagram') return 'Instagram';
    if (value === 'youtube') return 'YouTube';
    return 'TikTok';
}

function normalizeManualProfileUrl(value) {
    if (!value) return null;
    let parsed;
    try {
        parsed = new URL(String(value).trim());
    } catch (e) {
        return null;
    }
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    parsed.hash = '';
    parsed.search = '';
    const normalized = parsed.toString();
    return normalized.replace(/\/+$/, '/');
}

function extractUniqueIdFromProfileUrl(url, platform) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return '';
    }
    const pathParts = String(parsed.pathname || '').split('/').filter(Boolean);
    if (pathParts.length === 0) return '';

    if (platform === 'Instagram') {
        return pathParts[0] || '';
    }
    if (platform === 'TikTok') {
        const first = String(pathParts[0] || '');
        if (first.startsWith('@')) return first.slice(1);
        return first;
    }
    if (platform === 'YouTube') {
        const first = String(pathParts[0] || '').toLowerCase();
        if (first === '@' && pathParts[1]) return pathParts[1];
        if (first.startsWith('@')) return first.slice(1);
        if (first === 'channel' || first === 'user' || first === 'c') {
            return String(pathParts[1] || '');
        }
        return String(pathParts[0] || '');
    }
    return String(pathParts[0] || '');
}

function normalizeManualShareLinks(links, baseUrl = null) {
    if (!Array.isArray(links)) return [];
    const out = [];
    const seen = new Set();
    links.forEach((item) => {
        const link = normalizeGenericExternalLink(item, baseUrl);
        if (!link) return;
        const key = link.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(link);
    });
    return out;
}

function normalizeManualEmail(email) {
    const value = String(email || '').trim();
    if (!value) return '';
    const match = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? String(match[0]).toLowerCase() : '';
}

function isInstagramTaskHydrationCandidate(profile) {
    return !!(
        profile &&
        String(profile.platform || '').toLowerCase() === 'instagram' &&
        (profile.uniqueId || profile.authorId || profile.id)
    );
}

function hasInstagramCountryHydrationValue(profile) {
    const code = String(profile?.locationCode || profile?.countryCode || '').trim();
    if (code) return true;

    const aboutCountry = String(profile?.aboutThisAccountCountry || '').trim();
    if (aboutCountry) return true;

    const countryName = String(profile?.countryName || '').trim();
    if (countryName) return true;

    const location = String(profile?.location || '').trim();
    if (location && /^[a-z]{2}$/i.test(location)) return true;

    return false;
}

function getInstagramTaskHydrationProfileUrl(seed) {
    if (!seed) return null;
    if (typeof seed.profileUrl === 'string' && seed.profileUrl.trim()) return seed.profileUrl.trim();
    if (typeof seed.url === 'string' && seed.url.trim()) return seed.url.trim();
    const username = String(seed.uniqueId || '').trim();
    if (!username) return null;
    return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

function isInstagramTaskHydrationBusy() {
    return !!(
        instagramTaskHydrationQueue.length > 0 ||
        instagramTaskHydrationDeferredRetryQueue.length > 0 ||
        instagramTaskCountryHydrationQueue.length > 0 ||
        instagramTaskCountryHydrationDeferredRetryQueue.length > 0 ||
        activeInstagramTaskHydrationIds.size > 0 ||
        activeInstagramTaskCountryHydrationIds.size > 0 ||
        activeInstagramTaskHydrationTabs.size > 0 ||
        creatingInstagramTaskHydrationTabCount > 0
    );
}

function getQueuedInstagramTaskHydrationRetryCount() {
    const queuedFinalInMain = instagramTaskHydrationQueue.reduce((count, seed) => {
        return count + (seed && seed.__finalRetry ? 1 : 0);
    }, 0);
    return instagramTaskHydrationDeferredRetryQueue.length + queuedFinalInMain;
}

function getActiveInstagramTaskHydrationRetryCount() {
    let count = 0;
    for (const job of activeInstagramTaskHydrationJobs.values()) {
        if (job && job.isFinalRetry) count += 1;
    }
    return count;
}

function getQueuedInstagramCountryHydrationRetryCount() {
    const queuedFinalInMain = instagramTaskCountryHydrationQueue.reduce((count, seed) => {
        return count + (seed && seed.__countryFinalRetry ? 1 : 0);
    }, 0);
    return instagramTaskCountryHydrationDeferredRetryQueue.length + queuedFinalInMain;
}

function getActiveInstagramCountryHydrationRetryCount() {
    let count = 0;
    for (const job of activeInstagramTaskCountryHydrationJobs.values()) {
        if (job && job.isFinalRetry) count += 1;
    }
    return count;
}

function resetInstagramTaskHydrationRunStats() {
    instagramTaskHydrationFinalFailureCount = 0;
    instagramTaskCountryHydrationFinalFailureCount = 0;
}

function increaseInstagramTaskHydrationFinalFailureCount() {
    instagramTaskHydrationFinalFailureCount += 1;
}

function increaseInstagramCountryHydrationFinalFailureCount() {
    instagramTaskCountryHydrationFinalFailureCount += 1;
}

function getInstagramTaskHydrationStatus() {
    const activeMainCount = activeInstagramTaskHydrationIds.size + activeInstagramTaskHydrationTabs.size + creatingInstagramTaskHydrationTabCount;
    const activeCountryCount = activeInstagramTaskCountryHydrationIds.size;
    const queuedMainCount = instagramTaskHydrationQueue.length;
    const queuedCountryCount = instagramTaskCountryHydrationQueue.length;
    const queuedRetryCount = getQueuedInstagramTaskHydrationRetryCount();
    const queuedCountryRetryCount = getQueuedInstagramCountryHydrationRetryCount();
    const activeRetryCount = getActiveInstagramTaskHydrationRetryCount();
    const activeCountryRetryCount = getActiveInstagramCountryHydrationRetryCount();
    return {
        isHydrating: isInstagramTaskHydrationBusy(),
        queued: (
            queuedMainCount +
            instagramTaskHydrationDeferredRetryQueue.length +
            queuedCountryCount +
            instagramTaskCountryHydrationDeferredRetryQueue.length
        ),
        queuedMain: queuedMainCount,
        queuedCountry: queuedCountryCount,
        queuedRetry: queuedRetryCount,
        queuedCountryRetry: queuedCountryRetryCount,
        active: activeMainCount + activeCountryCount,
        activeMain: activeMainCount,
        activeCountry: activeCountryCount,
        activeRetry: activeRetryCount,
        activeCountryRetry: activeCountryRetryCount,
        retrying: queuedRetryCount + activeRetryCount + queuedCountryRetryCount + activeCountryRetryCount,
        failedFinal: instagramTaskHydrationFinalFailureCount + instagramTaskCountryHydrationFinalFailureCount,
        failedMainFinal: instagramTaskHydrationFinalFailureCount,
        failedCountryFinal: instagramTaskCountryHydrationFinalFailureCount
    };
}

function notifyInstagramTaskHydrationStateIfIdle() {
    const isBusy = isInstagramTaskHydrationBusy();
    if (isBusy) {
        instagramTaskHydrationWasBusy = true;
        return;
    }
    if (instagramTaskHydrationWasBusy) {
        instagramTaskHydrationWasBusy = false;
        chrome.runtime.sendMessage({ action: 'instagramTaskHydrationComplete' }).catch(() => {});
    }
}

function normalizeInstagramTaskHydrationSeed(raw, extra = {}) {
    const rawAuthorId = raw?.authorId ?? raw?.igUserPk ?? raw?.instagramUserId ?? raw?.igUserId ?? null;
    const normalizedAuthorId = String(rawAuthorId == null ? '' : rawAuthorId).trim();
    if (!raw) return null;
    const seed = {
        ...raw,
        ...extra,
        platform: 'Instagram',
        uniqueId: raw.uniqueId || raw.userId || raw.username,
        authorId: normalizedAuthorId || null,
        profileUrl: getInstagramTaskHydrationProfileUrl(raw) || extra.profileUrl || null
    };
    if (!seed.profileUrl) seed.profileUrl = getInstagramTaskHydrationProfileUrl(seed);
    const attempt = Number(seed.__attempt || 1);
    seed.__attempt = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
    seed.__finalRetry = !!seed.__finalRetry;
    return seed;
}

function enqueueInstagramTaskHydrationSeed(seed, options = {}) {
    const isDeferred = !!options.deferred;
    if (!seed) return false;
    const key = String(seed.id || '');
    if (!key) return false;

    if (isDeferred) {
        if (queuedInstagramTaskHydrationDeferredRetryIds.has(key) || queuedInstagramTaskHydrationIds.has(key)) {
            return false;
        }
        queuedInstagramTaskHydrationDeferredRetryIds.add(key);
        instagramTaskHydrationDeferredRetryQueue.push(seed);
        return true;
    }

    if (activeInstagramTaskHydrationIds.has(key)) return false;
    if (queuedInstagramTaskHydrationIds.has(key)) return false;
    if (queuedInstagramTaskHydrationDeferredRetryIds.has(key)) {
        queuedInstagramTaskHydrationDeferredRetryIds.delete(key);
        instagramTaskHydrationDeferredRetryQueue = instagramTaskHydrationDeferredRetryQueue.filter((item) => String(item?.id || '') !== key);
    }
    queuedInstagramTaskHydrationIds.add(key);
    instagramTaskHydrationQueue.push(seed);
    return true;
}

function maybeScheduleInstagramTaskHydrationFinalRetry(seed, error) {
    if (!seed) return false;
    const key = String(seed.id || '');
    if (!key) return false;
    const attempt = Number(seed.__attempt || 1);
    if (attempt >= INSTAGRAM_TASK_HYDRATION_MAX_ATTEMPTS) return false;
    if (seed.__finalRetry) return false;

    const retrySeed = normalizeInstagramTaskHydrationSeed(seed, {
        __attempt: attempt + 1,
        __finalRetry: true,
        __retryReason: String(error || 'retry')
    });
    return enqueueInstagramTaskHydrationSeed(retrySeed, { deferred: true });
}

function isInstagramCountryHydrationCandidate(profile) {
    if (!isInstagramTaskHydrationCandidate(profile)) return false;
    if (hasInstagramCountryHydrationValue(profile)) return false;
    return !!getInstagramTaskHydrationProfileUrl(profile);
}

function normalizeInstagramCountryHydrationSeed(raw, extra = {}) {
    const seed = normalizeInstagramTaskHydrationSeed(raw, extra);
    if (!seed) return null;
    const attempt = Number(seed.__countryAttempt || 1);
    seed.__countryAttempt = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
    seed.__countryFinalRetry = !!seed.__countryFinalRetry;
    return seed;
}

function enqueueInstagramCountryHydrationSeed(seed, options = {}) {
    const isDeferred = !!options.deferred;
    if (!seed) return false;
    const key = String(seed.id || '');
    if (!key) return false;

    if (isDeferred) {
        if (queuedInstagramTaskCountryHydrationDeferredRetryIds.has(key) || queuedInstagramTaskCountryHydrationIds.has(key)) {
            return false;
        }
        queuedInstagramTaskCountryHydrationDeferredRetryIds.add(key);
        instagramTaskCountryHydrationDeferredRetryQueue.push(seed);
        return true;
    }

    if (activeInstagramTaskCountryHydrationIds.has(key)) return false;
    if (queuedInstagramTaskCountryHydrationIds.has(key)) return false;
    if (queuedInstagramTaskCountryHydrationDeferredRetryIds.has(key)) {
        queuedInstagramTaskCountryHydrationDeferredRetryIds.delete(key);
        instagramTaskCountryHydrationDeferredRetryQueue = instagramTaskCountryHydrationDeferredRetryQueue.filter((item) => String(item?.id || '') !== key);
    }
    queuedInstagramTaskCountryHydrationIds.add(key);
    instagramTaskCountryHydrationQueue.push(seed);
    return true;
}

function maybeScheduleInstagramCountryHydrationFinalRetry(seed, error) {
    if (!seed) return false;
    const key = String(seed.id || '');
    if (!key) return false;
    const attempt = Number(seed.__countryAttempt || 1);
    if (attempt >= INSTAGRAM_COUNTRY_HYDRATION_MAX_ATTEMPTS) return false;
    if (seed.__countryFinalRetry) return false;

    const retrySeed = normalizeInstagramCountryHydrationSeed(seed, {
        __countryAttempt: attempt + 1,
        __countryFinalRetry: true,
        __countryRetryReason: String(error || 'retry')
    });
    return enqueueInstagramCountryHydrationSeed(retrySeed, { deferred: true });
}

function queueInstagramCountryHydrations(profiles) {
    let queuedCount = 0;
    for (const raw of profiles || []) {
        if (!isInstagramCountryHydrationCandidate(raw)) continue;
        const seed = normalizeInstagramCountryHydrationSeed(raw, {
            __countryAttempt: 1,
            __countryFinalRetry: false
        });
        if (!seed?.profileUrl) continue;
        if (enqueueInstagramCountryHydrationSeed(seed)) queuedCount++;
    }
    processInstagramTaskCountryHydrationQueue();
    return queuedCount;
}

function queueInstagramTaskHydrations(profiles) {
    const wasBusyBeforeQueue = isInstagramTaskHydrationBusy();
    let queuedCount = 0;
    let queuedCountryCount = 0;
    for (const raw of profiles || []) {
        if (!isInstagramTaskHydrationCandidate(raw)) continue;
        const seed = normalizeInstagramTaskHydrationSeed(raw, {
            __attempt: 1,
            __finalRetry: false
        });
        if (!seed.profileUrl) continue;

        const key = String(seed.id);
        if (!key) continue;
        const status = String(raw?.taskHydrationStatus || '').trim().toLowerCase();
        if (status !== 'success' && enqueueInstagramTaskHydrationSeed(seed)) queuedCount++;

        if (isInstagramCountryHydrationCandidate(seed)) {
            const countrySeed = normalizeInstagramCountryHydrationSeed(seed, {
                __countryAttempt: 1,
                __countryFinalRetry: false
            });
            if (enqueueInstagramCountryHydrationSeed(countrySeed)) queuedCountryCount++;
        }
    }
    if (!wasBusyBeforeQueue && (queuedCount > 0 || queuedCountryCount > 0)) {
        resetInstagramTaskHydrationRunStats();
    }
    processInstagramTaskHydrationQueue();
    processInstagramTaskCountryHydrationQueue();
    return queuedCount + queuedCountryCount;
}

function startInstagramTaskHydrationRetry(items) {
    const candidates = (items || [])
        .filter(isInstagramTaskHydrationCandidate)
        .map((item) => ({
            ...item,
            platform: 'Instagram',
            uniqueId: item.uniqueId || item.userId || item.username,
            authorId: item.authorId || item.igUserPk || item.instagramUserId || item.igUserId || null
        }))
        .filter(isInstagramTaskHydrationCandidate);
    return queueInstagramTaskHydrations(candidates);
}

function stopInstagramTaskHydrationRetry() {
    instagramTaskHydrationQueue = [];
    instagramTaskHydrationDeferredRetryQueue = [];
    instagramTaskCountryHydrationQueue = [];
    instagramTaskCountryHydrationDeferredRetryQueue = [];
    queuedInstagramTaskHydrationIds.clear();
    queuedInstagramTaskHydrationDeferredRetryIds.clear();
    queuedInstagramTaskCountryHydrationIds.clear();
    queuedInstagramTaskCountryHydrationDeferredRetryIds.clear();
    instagramTaskHydrationRunId++;

    for (const job of activeInstagramTaskHydrationJobs.values()) {
        cancelInstagramTaskHydrationJob(job, 'manual_stop');
    }
    for (const job of activeInstagramTaskCountryHydrationJobs.values()) {
        cancelInstagramTaskHydrationJob(job, 'manual_stop');
    }
    activeInstagramTaskHydrationJobs.clear();
    activeInstagramTaskCountryHydrationJobs.clear();
    activeInstagramTaskHydrationIds.clear();
    activeInstagramTaskCountryHydrationIds.clear();
    resetInstagramTaskHydrationRunStats();

    notifyInstagramTaskHydrationStateIfIdle();
}

function buildInstagramTaskHydrationFailurePatch(error, source = 'background') {
    return {
        taskHydrationStatus: 'failed',
        taskHydratedAt: Date.now(),
        taskHydrationError: error ? String(error) : 'unknown',
        taskHydrationSource: `instagram_${source}`
    };
}

function escapeRegexLiteral(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntitiesLite(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return _; }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            try { return String.fromCodePoint(parseInt(dec, 10)); } catch (e) { return _; }
        })
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function extractMetaContentByAttr(html, attrName, attrValue) {
    const source = String(html || '');
    if (!source) return null;
    const attr = escapeRegexLiteral(attrName);
    const value = escapeRegexLiteral(attrValue);
    const patterns = [
        new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${value}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b${attr}\\s*=\\s*["']${value}["'][^>]*>`, 'i')
    ];
    for (const re of patterns) {
        const match = source.match(re);
        if (match && match[1]) return decodeHtmlEntitiesLite(match[1]).trim();
    }
    return null;
}

function extractLinkHrefByRel(html, relValue) {
    const source = String(html || '');
    if (!source) return null;
    const value = escapeRegexLiteral(relValue);
    const patterns = [
        new RegExp(`<link[^>]*\\brel\\s*=\\s*["']${value}["'][^>]*\\bhref\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<link[^>]*\\bhref\\s*=\\s*["']([^"']*)["'][^>]*\\brel\\s*=\\s*["']${value}["'][^>]*>`, 'i')
    ];
    for (const re of patterns) {
        const match = source.match(re);
        if (match && match[1]) return decodeHtmlEntitiesLite(match[1]).trim();
    }
    return null;
}

function extractHtmlTitleText(html) {
    const source = String(html || '');
    const match = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match || !match[1]) return null;
    return decodeHtmlEntitiesLite(match[1]).replace(/\s+/g, ' ').trim();
}

function parseInstagramCountsFromMetaDescription(text) {
    const source = String(text || '').trim();
    if (!source) return {};
    const prefix = source.split(/\s[-–]\s/)[0] || source;
    const tokens = [];
    const re = /(\d[\d,.\s]*(?:[KMB]|万|亿)?\+?)/gi;
    let m;
    while ((m = re.exec(prefix)) && tokens.length < 3) {
        const token = String(m[1] || '').replace(/\s+/g, '').trim();
        if (!token) continue;
        tokens.push(token);
    }
    if (tokens.length < 3) return {};
    const followerCount = normalizeInstagramCountTokenToIntegerString(tokens[0]) || tokens[0];
    const followingCount = normalizeInstagramCountTokenToIntegerString(tokens[1]) || tokens[1];
    const postCount = normalizeInstagramCountTokenToIntegerString(tokens[2]) || tokens[2];
    return {
        followerCount,
        followingCount,
        postCount
    };
}

function normalizeInstagramCountTokenToIntegerString(raw) {
    let token = String(raw || '').trim();
    if (!token) return null;
    token = token.replace(/\s+/g, '').replace(/,/g, '').replace(/\+/g, '');
    if (!token) return null;

    const match = token.match(/^(\d+(?:\.\d+)?)([kmbw]|万|亿|千)?$/i);
    if (!match) {
        const digits = token.replace(/\D/g, '');
        return digits || null;
    }

    const base = Number(match[1]);
    if (!Number.isFinite(base)) return null;

    const suffix = String(match[2] || '').toLowerCase();
    let multiplier = 1;
    if (suffix === 'k') multiplier = 1e3;
    else if (suffix === 'm') multiplier = 1e6;
    else if (suffix === 'b') multiplier = 1e9;
    else if (suffix === 'w') multiplier = 1e4;
    else if (suffix === '万') multiplier = 1e4;
    else if (suffix === '亿') multiplier = 1e8;
    else if (suffix === '千') multiplier = 1e3;

    return String(Math.round(base * multiplier));
}

function decodeJsonStringLiteralLite(raw) {
    if (raw == null) return null;
    try {
        return JSON.parse(`"${String(raw)}"`);
    } catch (e) {
        return String(raw)
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
                try { return String.fromCharCode(parseInt(hex, 16)); } catch (err) { return _; }
            });
    }
}

function extractInstagramHtmlModuleSlice(html, moduleName, maxLen = 12000) {
    const source = String(html || '');
    if (!source) return '';
    const marker = `["${moduleName}",[],{`;
    const index = source.indexOf(marker);
    if (index === -1) return '';
    return source.slice(index, index + maxLen);
}

function extractJsonStringFieldFromSlice(slice, fieldName) {
    const source = String(slice || '');
    if (!source) return null;
    const field = escapeRegexLiteral(fieldName);
    const match = source.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'));
    if (!match) return null;
    return decodeJsonStringLiteralLite(match[1]);
}

function extractJsonNumberFieldFromSlice(slice, fieldName) {
    const source = String(slice || '');
    if (!source) return null;
    const field = escapeRegexLiteral(fieldName);
    const match = source.match(new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
}

function buildJazoestFromFBDtsgToken(token) {
    const source = String(token || '');
    if (!source) return null;
    let sum = 0;
    for (const ch of source) sum += ch.charCodeAt(0);
    return `2${sum}`;
}

function extractInstagramAboutThisAccountWbloksRequestContextFromHtml(html) {
    const siteDataSlice = extractInstagramHtmlModuleSlice(html, 'SiteData', 20000);
    const dtsgSlice = extractInstagramHtmlModuleSlice(html, 'DTSGInitialData', 3000) || extractInstagramHtmlModuleSlice(html, 'DTSGInitData', 4000);
    const lsdSlice = extractInstagramHtmlModuleSlice(html, 'LSD', 3000);
    const currentUserSlice = extractInstagramHtmlModuleSlice(html, 'CurrentUserInitialData', 8000);

    const fbDtsg = extractJsonStringFieldFromSlice(dtsgSlice, 'token');
    const lsd = extractJsonStringFieldFromSlice(lsdSlice, 'token');
    const __hs = extractJsonStringFieldFromSlice(siteDataSlice, 'haste_session');
    const __hsi = extractJsonStringFieldFromSlice(siteDataSlice, 'hsi');
    const __spin_b = extractJsonStringFieldFromSlice(siteDataSlice, '__spin_b');
    const efPage = extractJsonStringFieldFromSlice(siteDataSlice, 'ef_page');
    const __bkvFromHtml = extractJsonStringFieldFromSlice(siteDataSlice, '__bkv');

    const __rev = extractJsonNumberFieldFromSlice(siteDataSlice, 'server_revision') ?? extractJsonNumberFieldFromSlice(siteDataSlice, 'client_revision');
    const __spin_r = extractJsonNumberFieldFromSlice(siteDataSlice, '__spin_r') ?? __rev;
    const __spin_t = extractJsonNumberFieldFromSlice(siteDataSlice, '__spin_t');
    const dpr = extractJsonNumberFieldFromSlice(siteDataSlice, 'pr');
    const __comet_req = extractJsonNumberFieldFromSlice(siteDataSlice, 'comet_env');
    const parsedUser = extractJsonStringFieldFromSlice(currentUserSlice, 'USER_ID');

    const rawHtml = String(html || '');
    const __bkvMatch = rawHtml.match(/[?&]__bkv=([a-f0-9]{16,})/i);
    const __bkv = __bkvMatch?.[1] || __bkvFromHtml || null;
    const __user = (parsedUser && /^\d+$/.test(parsedUser)) ? parsedUser : '0';
    const jazoest = buildJazoestFromFBDtsgToken(fbDtsg);

    return {
        fbDtsg,
        jazoest,
        lsd,
        __user,
        __hs,
        __hsi,
        __rev: __rev != null ? String(Math.trunc(__rev)) : null,
        __spin_r: __spin_r != null ? String(Math.trunc(__spin_r)) : null,
        __spin_b: __spin_b || null,
        __spin_t: __spin_t != null ? String(Math.trunc(__spin_t)) : null,
        dpr: dpr != null ? String(dpr) : null,
        __comet_req: __comet_req != null ? String(Math.trunc(__comet_req)) : '7',
        __crn: efPage ? `comet.igweb.${efPage}` : 'comet.igweb.PolarisProfilePostsTabRoute',
        __bkv
    };
}

function findInstagramAboutThisAccountFieldInitial(node, targetKey, seen) {
    if (!node || typeof node !== 'object') return undefined;
    const guard = seen || new WeakSet();
    if (guard.has(node)) return undefined;
    guard.add(node);

    if (node.data && typeof node.data === 'object' && node.data.key === targetKey) {
        if (node.data.initial !== undefined && node.data.initial !== null) {
            return node.data.initial;
        }
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findInstagramAboutThisAccountFieldInitial(item, targetKey, guard);
            if (found !== undefined) return found;
        }
        return undefined;
    }

    for (const value of Object.values(node)) {
        const found = findInstagramAboutThisAccountFieldInitial(value, targetKey, guard);
        if (found !== undefined) return found;
    }
    return undefined;
}

function parseInstagramAboutThisAccountCountryFromWbloksResponseText(text) {
    const source = String(text || '').trim();
    if (!source) return null;
    const payloadText = source.startsWith('for (;;);') ? source.slice('for (;;);'.length) : source;
    let data;
    try {
        data = JSON.parse(payloadText);
    } catch (e) {
        return null;
    }

    const countryValue = findInstagramAboutThisAccountFieldInitial(
        data,
        'IG_ABOUT_THIS_ACCOUNT:about_this_account_country'
    );
    if (countryValue == null) return null;
    const country = String(countryValue).trim();
    return country || null;
}

function normalizeCountryLookupKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .replace(/[.,;:()[\]{}'"`~!@#$%^&*+=<>?/\\|_-]/g, '');
}

const INSTAGRAM_UNKNOWN_COUNTRY_MARKERS = [
    'unknown',
    'not shared',
    'not available',
    'unavailable',
    'private',
    'hidden',
    'none',
    'null',
    'undefined',
    'other',
    'others',
    'misc',
    'n/a',
    'na',
    'n.a.',
    'notapplicable',
    'not provided',
    'not set',
    'unspecified',
    '未分享',
    '未提供',
    '未知',
    '其他',
    '其它',
    '其他地区',
    '其他地區',
    '不详',
    '不詳',
    '保密',
    '隐藏',
    '隱藏',
    '未公开',
    '未公開',
    '不公开',
    '不公開',
    '无',
    '無',
    '没有',
    '沒有',
    '未披露',
    '未填写',
    '未填寫',
    '不适用',
    '不適用',
    'inconnu',
    'indisponible',
    'desconocido',
    'no disponible',
    'desconhecido',
    'nao disponivel',
    'non disponibile',
    'unbekannt',
    'nicht verfugbar',
    'неизвестно',
    'недоступно',
    'غير معروف',
    'غير متاح',
    'bilinmiyor',
    'mevcut degil',
    'tidak diketahui',
    'tidak tersedia',
    'khong ro',
    'khong co san',
    'lainnya',
    'otro',
    'autre',
    'altro',
    'andere',
    'ไม่ระบุ',
    'ไม่ทราบ'
];

const INSTAGRAM_UNKNOWN_COUNTRY_PARTIAL_MARKERS = [
    'notshared',
    'unknown',
    'private',
    'hidden',
    'unavailable',
    'notavailable',
    'unspecified',
    '未分享',
    '未知',
    '其他',
    '其它',
    '未提供',
    '未公开',
    '不公开',
    '保密',
    '隱藏',
    '隐藏'
];

const INSTAGRAM_UNKNOWN_COUNTRY_MARKER_KEYS = new Set(
    INSTAGRAM_UNKNOWN_COUNTRY_MARKERS
        .map((item) => normalizeCountryLookupKey(item))
        .filter(Boolean)
);

function isInstagramUnknownCountryValue(value) {
    const key = normalizeCountryLookupKey(value);
    if (!key) return true;
    if (INSTAGRAM_UNKNOWN_COUNTRY_MARKER_KEYS.has(key)) return true;
    return INSTAGRAM_UNKNOWN_COUNTRY_PARTIAL_MARKERS.some((token) => key.includes(normalizeCountryLookupKey(token)));
}

function getInstagramRegionCodesForMapping(manualAliases = {}) {
    const set = new Set();

    try {
        if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
            const values = Intl.supportedValuesOf('region');
            if (Array.isArray(values)) {
                values.forEach((code) => {
                    const iso2 = String(code || '').trim().toUpperCase();
                    if (/^[A-Z]{2}$/.test(iso2)) set.add(iso2);
                });
            }
        }
    } catch (e) {
        // ignore
    }

    if (set.size === 0) {
        try {
            if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
                const dn = new Intl.DisplayNames(['en'], { type: 'region' });
                const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                for (let i = 0; i < letters.length; i++) {
                    for (let j = 0; j < letters.length; j++) {
                        const code = `${letters[i]}${letters[j]}`;
                        const name = dn.of(code);
                        if (name && name !== code) {
                            set.add(code);
                        }
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }

    Object.keys(manualAliases || {}).forEach((code) => {
        const iso2 = String(code || '').trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(iso2)) set.add(iso2);
    });

    return Array.from(set);
}

function ensureInstagramCountryNameToIso2Map() {
    if (instagramCountryNameToIso2Map) return instagramCountryNameToIso2Map;

    const map = new Map();
    const addAlias = (name, iso2) => {
        const key = normalizeCountryLookupKey(name);
        if (!key || !iso2) return;
        map.set(key, String(iso2).trim().toUpperCase());
    };

    const manualAliases = {
        US: ['United States', 'USA', 'U.S.', 'U.S.A', '美国', '美國'],
        GB: ['United Kingdom', 'UK', 'Great Britain', 'Britain', '英國', '英国'],
        IT: ['Italy', 'Italia', '意大利', '義大利'],
        DE: ['Germany', 'Deutschland', '德國', '德国'],
        FR: ['France', '法国', '法國'],
        ES: ['Spain', 'España', '西班牙'],
        PT: ['Portugal', '葡萄牙'],
        NL: ['Netherlands', 'Nederland', '荷兰', '荷蘭'],
        BE: ['Belgium', '比利时', '比利時'],
        CH: ['Switzerland', 'Schweiz', 'Suisse', '瑞士'],
        AT: ['Austria', 'Österreich', '奥地利', '奧地利'],
        SE: ['Sweden', '瑞典'],
        NO: ['Norway', '挪威'],
        DK: ['Denmark', '丹麦', '丹麥'],
        FI: ['Finland', '芬兰', '芬蘭'],
        IE: ['Ireland', '爱尔兰', '愛爾蘭'],
        PL: ['Poland', '波兰', '波蘭'],
        CZ: ['Czechia', 'Czech Republic', '捷克'],
        GR: ['Greece', '希腊', '希臘'],
        TR: ['Turkey', 'Türkiye', '土耳其'],
        RU: ['Russia', 'Russian Federation', '俄罗斯', '俄羅斯'],
        UA: ['Ukraine', '乌克兰', '烏克蘭'],
        RO: ['Romania', '罗马尼亚', '羅馬尼亞'],
        HU: ['Hungary', '匈牙利'],
        BG: ['Bulgaria', '保加利亚', '保加利亞'],
        RS: ['Serbia', '塞尔维亚', '塞爾維亞'],
        HR: ['Croatia', '克罗地亚', '克羅地亞'],
        SI: ['Slovenia', '斯洛文尼亚', '斯洛文尼亞'],
        SK: ['Slovakia', '斯洛伐克'],
        LT: ['Lithuania', '立陶宛'],
        LV: ['Latvia', '拉脱维亚', '拉脫維亞'],
        EE: ['Estonia', '爱沙尼亚', '愛沙尼亞'],
        CA: ['Canada', '加拿大'],
        MX: ['Mexico', 'México', '墨西哥'],
        BR: ['Brazil', 'Brasil', '巴西'],
        AR: ['Argentina', '阿根廷'],
        CL: ['Chile', '智利'],
        CO: ['Colombia', '哥伦比亚', '哥倫比亞'],
        PE: ['Peru', '秘鲁', '秘魯'],
        VE: ['Venezuela', '委内瑞拉', '委內瑞拉'],
        EC: ['Ecuador', '厄瓜多尔', '厄瓜多爾'],
        UY: ['Uruguay', '乌拉圭', '烏拉圭'],
        PY: ['Paraguay', '巴拉圭'],
        BO: ['Bolivia', '玻利维亚', '玻利維亞'],
        AU: ['Australia', '澳大利亚', '澳洲', '澳大利亞'],
        NZ: ['New Zealand', 'Aotearoa', '新西兰', '紐西蘭'],
        JP: ['Japan', '日本'],
        KR: ['South Korea', 'Korea, Republic of', '대한민국', '韩国', '韓國'],
        KP: ['North Korea', 'Korea, Democratic People’s Republic of', '朝鲜', '朝鮮'],
        CN: ['China', 'PRC', '中国', '中國'],
        HK: ['Hong Kong', '中国香港', '中國香港', '香港'],
        TW: ['Taiwan', '中国台湾', '中國台灣', '台湾', '台灣'],
        MO: ['Macau', 'Macao', '中国澳门', '中國澳門', '澳门', '澳門'],
        SG: ['Singapore', '新加坡'],
        MY: ['Malaysia', '马来西亚', '馬來西亞'],
        TH: ['Thailand', '泰国', '泰國'],
        VN: ['Vietnam', 'Viet Nam', '越南'],
        ID: ['Indonesia', '印尼', '印度尼西亚', '印度尼西亞'],
        PH: ['Philippines', '菲律宾', '菲律賓'],
        IN: ['India', 'भारत', '印度'],
        PK: ['Pakistan', '巴基斯坦'],
        BD: ['Bangladesh', '孟加拉国', '孟加拉國'],
        LK: ['Sri Lanka', '斯里兰卡', '斯里蘭卡'],
        NP: ['Nepal', '尼泊尔', '尼泊爾'],
        SA: ['Saudi Arabia', '沙特阿拉伯', '沙烏地阿拉伯'],
        AE: ['United Arab Emirates', 'UAE', '阿联酋', '阿聯酋'],
        QA: ['Qatar', '卡塔尔', '卡達'],
        KW: ['Kuwait', '科威特'],
        OM: ['Oman', '阿曼'],
        BH: ['Bahrain', '巴林'],
        JO: ['Jordan', '约旦', '約旦'],
        LB: ['Lebanon', '黎巴嫩'],
        IL: ['Israel', '以色列'],
        EG: ['Egypt', '埃及'],
        MA: ['Morocco', '摩洛哥'],
        DZ: ['Algeria', '阿尔及利亚', '阿爾及利亞'],
        TN: ['Tunisia', '突尼斯'],
        LY: ['Libya', '利比亚', '利比亞'],
        ZA: ['South Africa', '南非'],
        NG: ['Nigeria', '尼日利亚', '奈及利亞', '奈及利亞'],
        KE: ['Kenya', '肯尼亚', '肯亞'],
        ET: ['Ethiopia', '埃塞俄比亚', '埃塞俄比亞'],
        TZ: ['Tanzania', '坦桑尼亚', '坦桑尼亞'],
        GH: ['Ghana', '加纳', '迦納']
    };

    for (const [iso2, aliases] of Object.entries(manualAliases)) {
        addAlias(iso2, iso2);
        aliases.forEach((alias) => addAlias(alias, iso2));
    }

    try {
        if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
            const defaultLocales = [
                'en', 'en-US',
                'zh', 'zh-CN', 'zh-TW',
                'ja', 'ko',
                'fr', 'de', 'es', 'pt', 'it',
                'ru', 'uk', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'bg', 'ro', 'hu',
                'sv', 'no', 'da', 'fi', 'nl', 'el', 'tr',
                'ar', 'he', 'fa',
                'hi', 'bn', 'ur',
                'th', 'vi', 'id', 'ms'
            ];
            const browserLocales = [];
            try {
                if (typeof navigator !== 'undefined') {
                    if (Array.isArray(navigator.languages)) {
                        browserLocales.push(...navigator.languages);
                    }
                    if (navigator.language) browserLocales.push(navigator.language);
                }
            } catch (e) {
                // ignore navigator access error
            }
            const localeSet = new Set(
                [...defaultLocales, ...browserLocales]
                    .map((item) => String(item || '').trim())
                    .filter(Boolean)
            );

            const displayNames = Array.from(localeSet).map((locale) => {
                try {
                    return new Intl.DisplayNames([locale], { type: 'region' });
                } catch (e) {
                    return null;
                }
            }).filter(Boolean);

            const codes = getInstagramRegionCodesForMapping(manualAliases);
            for (const code of codes) {
                const iso2 = String(code || '').trim().toUpperCase();
                if (!/^[A-Z]{2}$/.test(iso2)) continue;
                addAlias(iso2, iso2);
                for (const dn of displayNames) {
                    const name = dn.of(iso2);
                    if (name) addAlias(name, iso2);
                }
            }
        }
    } catch (e) {
        // ignore Intl mapping failures; manual aliases remain available
    }

    instagramCountryNameToIso2Map = map;
    return map;
}

function normalizeInstagramCountryToIso2(countryName) {
    const value = String(countryName || '').trim();
    if (!value) return 'NA';
    if (isInstagramUnknownCountryValue(value)) return 'NA';

    const key = normalizeCountryLookupKey(value);
    if (!key) return 'NA';
    const map = ensureInstagramCountryNameToIso2Map();
    const mapped = map.get(key);
    if (mapped) return mapped;

    if (/^[a-z]{2}$/i.test(value)) {
        const code = value.toUpperCase();
        const codeKey = normalizeCountryLookupKey(code);
        return map.get(codeKey) ? code : 'NA';
    }

    return 'NA';
}

function buildInstagramTaskHydrationPatchFromAboutThisAccountCountry(country, seed) {
    const value = String(country || '').trim();
    if (!value) return null;
    const iso2 = normalizeInstagramCountryToIso2(value);

    const username = String(seed?.uniqueId || '').trim();
    const profileUrl = getInstagramTaskHydrationProfileUrl(seed) || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : null);
    const patch = {
        platform: 'Instagram',
        countryHydratedAt: Date.now(),
        countryHydrationError: null,
        countryHydrationSource: 'instagram_about_this_account_ui',
        aboutThisAccountCountry: value,
        countryName: iso2 === 'NA' ? 'NA' : value,
        location: iso2,
        locationCode: iso2,
        countryCode: iso2
    };

    if (profileUrl) {
        patch.url = profileUrl;
        patch.profileUrl = profileUrl;
    }
    if (username) patch.uniqueId = username;
    if (seed?.authorId) patch.authorId = String(seed.authorId);
    if (seed?.igUserPk) patch.igUserPk = String(seed.igUserPk);
    return patch;
}

function parseFormEncodedObjectFromString(raw) {
    const text = String(raw || '').trim();
    if (!text) return {};
    const out = {};
    try {
        const params = new URLSearchParams(text);
        for (const [k, v] of params.entries()) {
            out[k] = v;
        }
        return out;
    } catch (e) {
        return out;
    }
}

function pickInstagramAboutThisAccountWbloksTemplateFields(form) {
    const source = form && typeof form === 'object' ? form : {};
    const keepKeys = [
        '__d', '__user', '__a', '__hs', 'dpr', '__ccg', '__rev', '__s', '__hsi',
        '__dyn', '__csr', '__hsdp', '__hblp', '__sjsp', '__comet_req',
        'fb_dtsg', 'jazoest', 'lsd', '__spin_r', '__spin_b', '__spin_t', '__crn'
    ];
    const out = {};
    for (const key of keepKeys) {
        const value = source[key];
        if (value == null) continue;
        const text = String(value).trim();
        if (!text) continue;
        out[key] = text;
    }
    return out;
}

function nextInstagramAboutThisAccountReqValue(previousValue) {
    const fallback = String(instagramAboutThisAccountWbloksReqCounter++);
    const prev = String(previousValue || '').trim();
    if (!prev) return fallback;
    if (/^\d+$/.test(prev)) {
        const num = Number(prev);
        if (Number.isFinite(num)) {
            instagramAboutThisAccountWbloksReqCounter = Math.max(instagramAboutThisAccountWbloksReqCounter, num + 1);
            return String(num + 1);
        }
    }
    if (/^[0-9a-z]+$/i.test(prev)) {
        const num = parseInt(prev, 36);
        if (Number.isFinite(num)) {
            const next = (num + 1).toString(36);
            return next;
        }
    }
    return fallback;
}

async function getInstagramAboutThisAccountWbloksTemplateCache() {
    if (instagramAboutThisAccountWbloksTemplateLoaded) return instagramAboutThisAccountWbloksTemplateCache;
    instagramAboutThisAccountWbloksTemplateLoaded = true;
    try {
        const stored = await chrome.storage.local.get(INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_CACHE_KEY);
        const value = stored?.[INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_CACHE_KEY];
        if (value && typeof value === 'object') {
            instagramAboutThisAccountWbloksTemplateCache = value;
            const reqValue = Number.parseInt(String(value?.form?.__req || ''), 10);
            if (Number.isFinite(reqValue)) {
                instagramAboutThisAccountWbloksReqCounter = Math.max(instagramAboutThisAccountWbloksReqCounter, reqValue + 1);
            }
        }
    } catch (e) {
        console.warn('CreatorScan: Failed to load Instagram about_this_account template cache', e);
    }
    return instagramAboutThisAccountWbloksTemplateCache;
}

async function setInstagramAboutThisAccountWbloksTemplateCache(value) {
    instagramAboutThisAccountWbloksTemplateLoaded = true;
    instagramAboutThisAccountWbloksTemplateCache = value && typeof value === 'object' ? value : null;
    try {
        if (instagramAboutThisAccountWbloksTemplateCache) {
            await chrome.storage.local.set({
                [INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_CACHE_KEY]: instagramAboutThisAccountWbloksTemplateCache
            });
        } else {
            await chrome.storage.local.remove(INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_CACHE_KEY);
        }
    } catch (e) {
        console.warn('CreatorScan: Failed to persist Instagram about_this_account template cache', e);
    }
}

async function cacheInstagramAboutThisAccountWbloksPacket(packet) {
    if (!packet || typeof packet !== 'object') return false;

    const urlText = String(packet.url || packet?.request?.url || '').trim();
    if (!urlText.includes('/async/wbloks/fetch')) return false;

    let url;
    try {
        url = new URL(urlText);
    } catch (e) {
        return false;
    }
    if (url.searchParams.get('appid') !== INSTAGRAM_ABOUT_THIS_ACCOUNT_APP_ID) return false;

    const requestBody = packet?.request?.body;
    const form = typeof requestBody === 'string'
        ? parseFormEncodedObjectFromString(requestBody)
        : (requestBody && typeof requestBody === 'object' ? requestBody : {});
    const pickedForm = pickInstagramAboutThisAccountWbloksTemplateFields(form);
    if (!pickedForm.fb_dtsg || !pickedForm.jazoest || !pickedForm.lsd) return false;

    const rawParams = String(form.params || '').trim();
    let paramsObj = null;
    if (rawParams) {
        try { paramsObj = JSON.parse(rawParams); } catch (e) {}
    }

    const responseText = String(packet.responseText || packet?.responseText || '');
    const country = responseText
        ? parseInstagramAboutThisAccountCountryFromWbloksResponseText(responseText)
        : (packet?.response?.country ? String(packet.response.country) : null);
    const template = {
        capturedAt: Date.now(),
        url: {
            appid: url.searchParams.get('appid') || INSTAGRAM_ABOUT_THIS_ACCOUNT_APP_ID,
            type: url.searchParams.get('type') || 'app',
            __bkv: url.searchParams.get('__bkv') || null
        },
        form: {
            ...pickedForm,
            __req: String(form.__req || pickedForm.__req || '11')
        },
        sample: {
            target_user_id: paramsObj?.target_user_id ? String(paramsObj.target_user_id) : null,
            referer_type: paramsObj?.referer_type ? String(paramsObj.referer_type) : null,
            country: country || null
        }
    };
    await setInstagramAboutThisAccountWbloksTemplateCache(template);
    return true;
}

function mergeInstagramHydrationPatchesForBackground(parts) {
    const merged = {};
    const sources = [];
    let hasUsefulField = false;
    const taskMetaKeys = new Set([
        'taskHydrationStatus',
        'taskHydratedAt',
        'taskHydrationError',
        'taskHydrationSource'
    ]);

    for (const part of parts || []) {
        if (!part || typeof part !== 'object') continue;
        if (part.taskHydrationSource) sources.push(String(part.taskHydrationSource));
        for (const [key, value] of Object.entries(part)) {
            if (taskMetaKeys.has(key)) continue;
            if (value === undefined) continue;

            if (key === 'shareLinks') {
                const mergedLinks = mergeUniqueStringArray(merged.shareLinks, value);
                if (mergedLinks.length > 0) {
                    merged.shareLinks = mergedLinks;
                    hasUsefulField = true;
                }
                continue;
            }

            merged[key] = value;
            if (key !== 'platform' && key !== 'url' && key !== 'profileUrl' && key !== 'uniqueId' && key !== 'authorId' && key !== 'igUserPk') {
                hasUsefulField = true;
            }
        }
    }

    if (sources.length > 0) {
        merged.taskHydrationSource = Array.from(new Set(sources)).join('+');
    }

    return { merged, hasUsefulField };
}

function extractInstagramSignatureFromMetaDescription(text) {
    const source = String(text || '').trim();
    if (!source) return null;

    const quoted = source.match(/[“"]([^“”"]{1,800})[”"]\s*$/);
    if (quoted && quoted[1]) {
        const value = decodeHtmlEntitiesLite(quoted[1]).trim();
        return value || null;
    }

    const colonSplit = source.match(/[：:]\s*([^:：]{1,800})$/);
    if (colonSplit && colonSplit[1]) {
        const value = decodeHtmlEntitiesLite(colonSplit[1]).trim();
        if (value && !/^https?:\/\//i.test(value)) return value;
    }
    return null;
}

function extractInstagramShareLinksFromProfileHtml(html) {
    const source = String(html || '');
    if (!source) return [];

    const candidates = [];
    const pushCandidate = (raw) => {
        if (!raw) return;
        const text = String(raw).trim();
        if (!text) return;
        candidates.push(text);
    };

    const hrefMatches = source.match(/href\s*=\s*["']([^"']+)["']/gi) || [];
    hrefMatches.forEach((entry) => {
        const match = entry.match(/href\s*=\s*["']([^"']+)["']/i);
        if (match && match[1]) pushCandidate(match[1]);
    });

    const jsonLinkPatterns = [
        /"external_url"\s*:\s*"((?:\\.|[^"])*)"/gi,
        /"external_lynx_url"\s*:\s*"((?:\\.|[^"])*)"/gi,
        /"link_url"\s*:\s*"((?:\\.|[^"])*)"/gi,
        /"lynx_url"\s*:\s*"((?:\\.|[^"])*)"/gi
    ];
    jsonLinkPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(source))) {
            if (!match || !match[1]) continue;
            const decoded = decodeJsonStringLiteralLite(match[1]);
            if (decoded) pushCandidate(decoded);
        }
    });

    const directUrlMatches = source.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
    directUrlMatches.forEach((url) => pushCandidate(url));

    const out = [];
    const seen = new Set();
    candidates.forEach((raw) => {
        const normalized = normalizeInstagramHydrationExternalLinkInBackground(raw);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(normalized);
    });

    return out.slice(0, 20);
}

function parseInstagramMetaTitleIdentity(title) {
    const source = String(title || '').trim();
    if (!source) return {};
    const match = source.match(/^\s*(.*?)\s*\(@([^)]+)\)/);
    if (!match) return {};
    const nickname = decodeHtmlEntitiesLite(match[1] || '').trim();
    const uniqueId = decodeHtmlEntitiesLite(match[2] || '').trim();
    return {
        nickname: nickname || undefined,
        uniqueId: uniqueId || undefined
    };
}

function normalizeInstagramHydrationExternalLinkInBackground(raw) {
    if (!raw) return null;
    let value = String(raw).trim();
    if (!value) return null;
    value = value.replace(/&amp;/g, '&');

    try {
        const parsed = new URL(value, 'https://www.instagram.com');
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

function extractInstagramHydrationShareLinksInBackground(user) {
    const out = [];
    const seen = new Set();
    const push = (raw) => {
        const url = normalizeInstagramHydrationExternalLinkInBackground(raw);
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
            if (typeof link === 'string') return push(link);
            push(link.url);
            push(link.link_url);
            push(link.lynx_url);
            push(link.href);
        });
    }
    return out;
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

function buildInstagramTaskHydrationPatchFromUserInBackground(user, seed, sourceTag = 'instagram_web_profile_info_api') {
    if (!user || typeof user !== 'object') return null;

    const packetUsername = String(user.username || '').trim();
    const seedUsername = String(seed?.uniqueId || '').trim();
    if (seedUsername && packetUsername && seedUsername.toLowerCase() !== packetUsername.toLowerCase()) {
        return null;
    }

    const packetAuthorId = String(user.id || user.pk || '').trim();
    const seedAuthorId = String(seed?.authorId || seed?.id || '').trim();
    if (seedAuthorId && packetAuthorId && seedAuthorId !== packetAuthorId) {
        return null;
    }

    const username = packetUsername || seedUsername;
    const profileUrl = username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : getInstagramTaskHydrationProfileUrl(seed);
    const patch = {
        platform: 'Instagram',
        taskHydrationStatus: 'success',
        taskHydratedAt: Date.now(),
        taskHydrationError: null,
        taskHydrationSource: sourceTag
    };

    if (profileUrl) {
        patch.url = profileUrl;
        patch.profileUrl = profileUrl;
    }
    if (username) patch.uniqueId = username;
    if (packetAuthorId) patch.authorId = packetAuthorId;
    if (user.pk) patch.igUserPk = String(user.pk);

    if (user.full_name !== undefined) patch.nickname = String(user.full_name || '').trim();
    const avatarUrl = user?.hd_profile_pic_url_info?.url || user.profile_pic_url;
    if (avatarUrl) patch.avatar = String(avatarUrl);

    if (user.follower_count !== undefined && user.follower_count !== null) patch.followerCount = String(user.follower_count);
    if (user.following_count !== undefined && user.following_count !== null) patch.followingCount = String(user.following_count);
    if (user.media_count !== undefined && user.media_count !== null) patch.postCount = String(user.media_count);
    if (user.total_clips_count !== undefined && user.total_clips_count !== null) patch.reelCount = String(user.total_clips_count);

    if (user.biography !== undefined) patch.signature = String(user.biography || '');
    if (user.category_name) patch.categoryName = String(user.category_name);
    else if (user.category) patch.categoryName = String(user.category);
    if (user.city_name) {
        patch.cityName = String(user.city_name);
    }

    if (user.is_verified !== undefined) {
        patch.verified = !!user.is_verified;
        patch.isVerified = !!user.is_verified;
    }
    if (user.is_private !== undefined) patch.isPrivate = !!user.is_private;
    if (user.is_business !== undefined) patch.isBusiness = !!user.is_business;
    if (user.is_professional_account !== undefined) patch.isProfessionalAccount = !!user.is_professional_account;

    const shareLinks = extractInstagramHydrationShareLinksInBackground(user);
    if (shareLinks.length > 0) patch.shareLinks = shareLinks;

    const publicEmail = user.public_email ? String(user.public_email).trim() : '';
    const bioEmail = extractFirstEmailFromText(String(user.biography || ''));
    const email = publicEmail || bioEmail;
    if (email) {
        patch.email = email;
        if (profileUrl) patch.emailSourceUrl = profileUrl;
    }

    return patch;
}

function isInstagramProfileRootUrlForPageContext(urlText) {
    const text = String(urlText || '').trim();
    if (!text) return false;
    try {
        const parsed = new URL(text);
        if (!parsed.hostname.includes('instagram.com')) return false;
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length !== 1) return false;
        const blockedRoots = new Set([
            'explore', 'accounts', 'reels', 'stories', 'direct', 'p', 'tv', 'reel',
            'about', 'developer', 'legal', 'privacy', 'directory', 'challenge',
            'api', 'oauth', 'web', 'ads', 'press'
        ]);
        const segment = String(parts[0] || '').trim().toLowerCase();
        return !!segment && !blockedRoots.has(segment);
    } catch (e) {
        return false;
    }
}

function getInstagramProfileUsernameFromUrl(urlText) {
    const text = String(urlText || '').trim();
    if (!text) return null;
    try {
        const parsed = new URL(text);
        if (!parsed.hostname.includes('instagram.com')) return null;
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length !== 1) return null;
        const blockedRoots = new Set([
            'explore', 'accounts', 'reels', 'stories', 'direct', 'p', 'tv', 'reel',
            'about', 'developer', 'legal', 'privacy', 'directory', 'challenge',
            'api', 'oauth', 'web', 'ads', 'press'
        ]);
        const username = String(parts[0] || '').trim();
        if (!username) return null;
        if (blockedRoots.has(username.toLowerCase())) return null;
        return username;
    } catch (e) {
        return null;
    }
}

function scoreInstagramPageContextTabForSeed(tab, seed) {
    if (!tab || tab.id === undefined || tab.id === null) return -Infinity;
    const tabUrl = String(tab.url || '').trim();
    const tabUrlLower = tabUrl.toLowerCase();
    const seedProfileUrl = String(getInstagramTaskHydrationProfileUrl(seed) || '').trim();
    const seedProfileUrlLower = seedProfileUrl.toLowerCase();
    const seedUsername = String(seed?.uniqueId || '').trim().toLowerCase();

    let score = 0;
    if (tab.status === 'complete') score += 20;
    if (tab.active) score += 10;
    if (tab.highlighted) score += 4;
    if (tabUrlLower.startsWith('https://www.instagram.com/')) score += 8;
    if (isInstagramProfileRootUrlForPageContext(tabUrl)) score += 18;

    if (seedProfileUrlLower) {
        const normalizedTabUrl = tabUrlLower.replace(/\/+$/, '/');
        const normalizedSeedUrl = seedProfileUrlLower.replace(/\/+$/, '/');
        if (normalizedTabUrl === normalizedSeedUrl) score += 100;
        else if (normalizedTabUrl.startsWith(normalizedSeedUrl)) score += 60;
    }
    if (seedUsername && tabUrlLower.includes(`/${seedUsername}`)) score += 40;

    return score;
}

async function getInstagramPageContextTabsForSeed(seed) {
    let tabs = [];
    try {
        const result = await chrome.tabs.query({ url: ['https://www.instagram.com/*'] });
        tabs = Array.isArray(result) ? result : [];
    } catch (e) {
        throw new Error(`tabs.query failed: ${String(e)}`);
    }

    const profileRootTabs = tabs.filter((tab) => isInstagramProfileRootUrlForPageContext(tab.url));
    const candidates = profileRootTabs.length > 0 ? profileRootTabs : tabs;

    return candidates
        .filter((tab) => tab && tab.id !== undefined && tab.id !== null && String(tab.url || '').includes('instagram.com'))
        .sort((a, b) => scoreInstagramPageContextTabForSeed(b, seed) - scoreInstagramPageContextTabForSeed(a, seed));
}

async function sendMessageToInstagramTabWithTimeout(tabId, payload, timeoutMs = INSTAGRAM_TASK_HYDRATION_SEND_MESSAGE_TIMEOUT_MS) {
    return Promise.race([
        chrome.tabs.sendMessage(tabId, payload),
        new Promise((_, reject) => setTimeout(
            () => reject(new Error(`tabs.sendMessage timeout ${timeoutMs}ms`)),
            timeoutMs
        ))
    ]);
}

function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createInstagramHydrationTab(profileUrl) {
    creatingInstagramTaskHydrationTabCount += 1;
    try {
        return await new Promise((resolve, reject) => {
            chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'tabs.create failed'));
                    return;
                }
                if (!tab || tab.id === undefined || tab.id === null) {
                    reject(new Error('tabs.create returned empty tab'));
                    return;
                }
                resolve(tab);
            });
        });
    } finally {
        creatingInstagramTaskHydrationTabCount = Math.max(0, creatingInstagramTaskHydrationTabCount - 1);
    }
}

async function waitForInstagramTabLoadComplete(tabId, timeoutMs, jobContext = null) {
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs || 0));
    while (Date.now() < deadline) {
        throwIfInstagramTaskHydrationJobCancelled(jobContext);
        let tab = null;
        try {
            tab = await chrome.tabs.get(tabId);
        } catch (e) {
            throw new Error(`tab ${tabId} closed before load`);
        }
        if (tab && tab.status === 'complete') {
            return tab;
        }
        await delayMs(200);
    }
    throw new Error(`tab load timeout ${timeoutMs}ms`);
}

async function fetchInstagramAboutThisAccountHydrationPatchViaUiTab(seed, jobContext = null) {
    throwIfInstagramTaskHydrationJobCancelled(jobContext);
    const profileUrl = getInstagramTaskHydrationProfileUrl(seed);
    if (!profileUrl) return null;
    const targetUserId = String(seed?.authorId || '').trim();
    console.debug('CreatorScan: country hydration ui-tab start', {
        seedId: seed?.id || null,
        uniqueId: seed?.uniqueId || null,
        authorId: targetUserId || null,
        profileUrl
    });

    let openedTabId = null;
    try {
        const tab = await createInstagramHydrationTab(profileUrl);
        openedTabId = tab.id;

        await waitForInstagramTabLoadComplete(
            openedTabId,
            INSTAGRAM_ABOUT_THIS_ACCOUNT_UI_TAB_LOAD_TIMEOUT_MS,
            jobContext
        );
        throwIfInstagramTaskHydrationJobCancelled(jobContext);
        await delayMs(300);

        const messagePayload = {
            action: 'runInstagramAboutThisAccountUiHydration',
            seed: {
                id: seed?.id,
                authorId: targetUserId || null,
                uniqueId: seed?.uniqueId || null,
                profileUrl
            }
        };

        let response = null;
        try {
            response = await sendMessageToInstagramTabWithTimeout(
                openedTabId,
                messagePayload,
                INSTAGRAM_ABOUT_THIS_ACCOUNT_UI_ACTION_TIMEOUT_MS
            );
        } catch (firstError) {
            const firstText = String(firstError || '').toLowerCase();
            if (firstText.includes('receiving end does not exist')) {
                await delayMs(500);
                response = await sendMessageToInstagramTabWithTimeout(
                    openedTabId,
                    messagePayload,
                    INSTAGRAM_ABOUT_THIS_ACCOUNT_UI_ACTION_TIMEOUT_MS
                );
            } else {
                throw firstError;
            }
        }

        if (!response || response.received === false) {
            const msg = response?.error ? String(response.error) : 'empty response';
            throw new Error(msg);
        }

        const country = String(response.country || '').trim();
        if (!country) {
            throw new Error('country missing from ui hydration');
        }
        console.debug('CreatorScan: country hydration ui-tab success', {
            seedId: seed?.id || null,
            uniqueId: seed?.uniqueId || null,
            authorId: targetUserId || null,
            country
        });
        return buildInstagramTaskHydrationPatchFromAboutThisAccountCountry(country, seed);
    } catch (err) {
        console.warn('CreatorScan: country hydration ui-tab failed', {
            seedId: seed?.id || null,
            uniqueId: seed?.uniqueId || null,
            authorId: targetUserId || null,
            profileUrl,
            error: String(err)
        });
        if (isInstagramHydrationCancellationError(err, jobContext)) throw err;
        throw new Error(`ui_tab failed (${String(err)})`);
    } finally {
        if (openedTabId !== null) {
            chrome.tabs.remove(openedTabId).catch(() => {});
        }
    }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const externalSignal = options?.signal || null;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (externalSignal && typeof externalSignal.addEventListener === 'function') {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
    }
    try {
        const fetchOptions = { ...(options || {}) };
        delete fetchOptions.signal;
        return await fetch(url, {
            ...fetchOptions,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
            externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }
}

function createInstagramTaskHydrationJobContext(key, seed = null) {
    const attempt = Number(seed?.__attempt || 1);
    return {
        key: String(key || ''),
        runId: instagramTaskHydrationRunId,
        seedId: String(seed?.id || ''),
        attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : 1,
        isFinalRetry: !!seed?.__finalRetry,
        cancelled: false,
        cancelReason: null,
        controllers: new Set()
    };
}

function registerInstagramTaskHydrationAbortController(jobContext, controller) {
    if (!jobContext || !controller) return;
    if (jobContext.cancelled || jobContext.runId !== instagramTaskHydrationRunId) {
        try { controller.abort(); } catch (e) {}
        return;
    }
    jobContext.controllers.add(controller);
}

function unregisterInstagramTaskHydrationAbortController(jobContext, controller) {
    if (!jobContext || !controller) return;
    jobContext.controllers.delete(controller);
}

function cancelInstagramTaskHydrationJob(jobContext, reason = 'cancelled') {
    if (!jobContext) return;
    jobContext.cancelled = true;
    jobContext.cancelReason = reason;
    for (const controller of jobContext.controllers) {
        try { controller.abort(); } catch (e) {}
    }
    jobContext.controllers.clear();
}

function isInstagramTaskHydrationJobCancelled(jobContext) {
    if (!jobContext) return false;
    if (jobContext.cancelled) return true;
    if (jobContext.runId !== instagramTaskHydrationRunId) return true;
    return false;
}

function isInstagramHydrationCancellationError(error, jobContext) {
    if (isInstagramTaskHydrationJobCancelled(jobContext)) return true;
    const text = String(error || '').toLowerCase();
    if (!text) return false;
    return (
        text.includes('aborterror') ||
        text.includes('aborted') ||
        text.includes('hydration cancelled') ||
        text.includes('job timeout') ||
        text.includes('manual_stop')
    );
}

function throwIfInstagramTaskHydrationJobCancelled(jobContext) {
    if (isInstagramTaskHydrationJobCancelled(jobContext)) {
        const reason = String(jobContext?.cancelReason || 'cancelled');
        throw new Error(`instagram hydration cancelled (${reason})`);
    }
}

async function fetchWithTimeoutForInstagramHydration(url, options = {}, timeoutMs = 10000, jobContext = null) {
    throwIfInstagramTaskHydrationJobCancelled(jobContext);
    const controller = new AbortController();
    registerInstagramTaskHydrationAbortController(jobContext, controller);
    try {
        return await fetchWithTimeout(url, {
            ...(options || {}),
            signal: controller.signal
        }, timeoutMs);
    } finally {
        unregisterInstagramTaskHydrationAbortController(jobContext, controller);
    }
}

async function fetchInstagramWebProfileInfoHydrationPatchInBackground(seed, jobContext = null) {
    const username = String(seed?.uniqueId || '').trim();
    if (!username) return null;

    const response = await fetchWithTimeoutForInstagramHydration(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'accept': '*/*',
                'x-requested-with': 'XMLHttpRequest',
                'x-ig-app-id': INSTAGRAM_WEB_APP_ID,
                'x-asbd-id': INSTAGRAM_ASBD_ID,
                'referer': `https://www.instagram.com/${encodeURIComponent(username)}/`
            }
        },
        INSTAGRAM_WEB_PROFILE_INFO_FETCH_TIMEOUT_MS,
        jobContext
    );

    if (!response.ok) {
        throw new Error(`web_profile_info HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const user = extractInstagramUserFromWebProfileInfoResponse(data);
    return buildInstagramTaskHydrationPatchFromUserInBackground(user, seed, 'instagram_web_profile_info_api');
}

function buildInstagramTaskHydrationPatchFromHtmlMeta(seed, html) {
    const source = String(html || '');
    if (!source) return null;

    const ogTitle = extractMetaContentByAttr(source, 'property', 'og:title');
    const ogDescription = extractMetaContentByAttr(source, 'property', 'og:description');
    const metaDescription = extractMetaContentByAttr(source, 'name', 'description');
    const ogImage = extractMetaContentByAttr(source, 'property', 'og:image');
    const ogUrl = extractMetaContentByAttr(source, 'property', 'og:url');
    const canonicalUrl = extractLinkHrefByRel(source, 'canonical');
    const titleText = extractHtmlTitleText(source);

    const titleIdentity = parseInstagramMetaTitleIdentity(ogTitle || titleText);
    const username = String(titleIdentity.uniqueId || seed?.uniqueId || '').trim();
    const profileUrl = canonicalUrl || ogUrl || getInstagramTaskHydrationProfileUrl(seed) || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : null);

    const patch = {
        platform: 'Instagram',
        taskHydrationStatus: 'success',
        taskHydratedAt: Date.now(),
        taskHydrationError: null,
        taskHydrationSource: 'instagram_profile_html_meta'
    };

    if (profileUrl) {
        patch.url = profileUrl;
        patch.profileUrl = profileUrl;
    }
    if (username) patch.uniqueId = username;
    if (seed?.authorId) patch.authorId = String(seed.authorId);
    if (seed?.igUserPk) patch.igUserPk = String(seed.igUserPk);
    if (titleIdentity.nickname) patch.nickname = titleIdentity.nickname;
    if (ogImage) patch.avatar = ogImage;

    const counts = parseInstagramCountsFromMetaDescription(ogDescription || metaDescription);
    if (counts.followerCount) patch.followerCount = counts.followerCount;
    if (counts.followingCount) patch.followingCount = counts.followingCount;
    if (counts.postCount) patch.postCount = counts.postCount;

    const signature = extractInstagramSignatureFromMetaDescription(metaDescription || ogDescription);
    if (signature) patch.signature = signature;

    const shareLinks = extractInstagramShareLinksFromProfileHtml(source);
    if (shareLinks.length > 0) patch.shareLinks = shareLinks;

    const email = extractFirstEmailFromText(`${metaDescription || ''}\n${ogDescription || ''}`);
    if (email) {
        patch.email = email;
        if (profileUrl) patch.emailSourceUrl = profileUrl;
    }

    const useful = !!(
        patch.nickname ||
        patch.avatar ||
        patch.followerCount ||
        patch.signature ||
        patch.email ||
        (Array.isArray(patch.shareLinks) && patch.shareLinks.length > 0)
    );
    return useful ? patch : null;
}

async function fetchInstagramProfileHtmlHydrationPatchInBackground(seed, jobContext = null) {
    const data = await fetchInstagramProfileHtmlHydrationDataInBackground(seed, jobContext);
    return data?.patch || null;
}

async function fetchInstagramProfileHtmlHydrationDataInBackground(seed, jobContext = null) {
    const profileUrl = getInstagramTaskHydrationProfileUrl(seed);
    if (!profileUrl) return null;

    const response = await fetchWithTimeoutForInstagramHydration(
        profileUrl,
        {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        },
        INSTAGRAM_PROFILE_HTML_FETCH_TIMEOUT_MS,
        jobContext
    );

    if (!response.ok) {
        throw new Error(`profile_html HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    return {
        html,
        patch: buildInstagramTaskHydrationPatchFromHtmlMeta(seed, html)
    };
}

async function fetchInstagramAboutThisAccountHydrationPatchInBackground(seed, html, jobContext = null) {
    const targetUserId = String(seed?.authorId || seed?.id || '').trim();
    if (!targetUserId) return null;

    const profileUrl = getInstagramTaskHydrationProfileUrl(seed);
    if (!profileUrl) return null;

    const context = html ? extractInstagramAboutThisAccountWbloksRequestContextFromHtml(html) : {};
    const cachedTemplate = await getInstagramAboutThisAccountWbloksTemplateCache();
    const templateIsFresh = !!(
        cachedTemplate &&
        typeof cachedTemplate === 'object' &&
        Number.isFinite(Number(cachedTemplate.capturedAt || 0)) &&
        (Date.now() - Number(cachedTemplate.capturedAt || 0)) < INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_TEMPLATE_MAX_AGE_MS
    );
    const templateForm = templateIsFresh && cachedTemplate.form && typeof cachedTemplate.form === 'object'
        ? cachedTemplate.form
        : null;
    const templateUrl = templateIsFresh && cachedTemplate.url && typeof cachedTemplate.url === 'object'
        ? cachedTemplate.url
        : null;

    const effectiveFBDtsg = context?.fbDtsg || templateForm?.fb_dtsg || null;
    const effectiveLsd = context?.lsd || templateForm?.lsd || null;
    const effectiveJazoest = context?.jazoest || templateForm?.jazoest || (effectiveFBDtsg ? buildJazoestFromFBDtsgToken(effectiveFBDtsg) : null);

    if (!effectiveFBDtsg || !effectiveLsd || !effectiveJazoest) {
        throw new Error('about_this_account missing runtime tokens');
    }

    const requestUrl = new URL('https://www.instagram.com/async/wbloks/fetch/');
    requestUrl.searchParams.set('appid', INSTAGRAM_ABOUT_THIS_ACCOUNT_APP_ID);
    requestUrl.searchParams.set('type', 'app');
    if (context.__bkv || templateUrl?.__bkv) requestUrl.searchParams.set('__bkv', context.__bkv || templateUrl.__bkv);

    const form = new URLSearchParams();
    if (templateForm) {
        Object.entries(templateForm).forEach(([key, value]) => {
            if (key === 'params') return;
            if (value == null) return;
            const text = String(value).trim();
            if (!text) return;
            form.set(key, text);
        });
    }

    form.set('__d', 'www');
    form.set('__user', context.__user || form.get('__user') || '0');
    form.set('__a', '1');
    form.set('__req', nextInstagramAboutThisAccountReqValue(form.get('__req') || templateForm?.__req || '11'));
    if (context.__hs) form.set('__hs', context.__hs);
    if (context.dpr) form.set('dpr', context.dpr);
    form.set('__ccg', form.get('__ccg') || 'UNKNOWN');
    if (context.__rev) form.set('__rev', context.__rev);
    if (context.__hsi) form.set('__hsi', context.__hsi);
    if (context.__comet_req) form.set('__comet_req', context.__comet_req);
    form.set('fb_dtsg', effectiveFBDtsg);
    form.set('jazoest', effectiveJazoest);
    form.set('lsd', effectiveLsd);
    if (context.__spin_r) form.set('__spin_r', context.__spin_r);
    if (context.__spin_b) form.set('__spin_b', context.__spin_b);
    if (context.__spin_t) form.set('__spin_t', context.__spin_t);
    if (context.__crn) form.set('__crn', context.__crn);
    form.set('params', JSON.stringify({
        referer_type: 'ProfileMore',
        target_user_id: targetUserId
    }));

    const response = await fetchWithTimeoutForInstagramHydration(
        requestUrl.toString(),
        {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'x-requested-with': 'XMLHttpRequest',
                'x-ig-app-id': INSTAGRAM_WEB_APP_ID,
                'x-asbd-id': INSTAGRAM_ASBD_ID,
                'referer': profileUrl
            },
            body: form.toString()
        },
        INSTAGRAM_ABOUT_THIS_ACCOUNT_WBLOKS_FETCH_TIMEOUT_MS,
        jobContext
    );

    if (!response.ok) {
        throw new Error(`about_this_account HTTP ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const country = parseInstagramAboutThisAccountCountryFromWbloksResponseText(text);
    if (!country) return null;
    return buildInstagramTaskHydrationPatchFromAboutThisAccountCountry(country, seed);
}

async function hydrateInstagramTaskSeed(seed, jobContext = null) {
    if (!isInstagramTaskHydrationCandidate(seed) || seed?.id === undefined || seed?.id === null) return null;

    throwIfInstagramTaskHydrationJobCancelled(jobContext);

    const errors = [];
    let patch = null;
    let webProfilePatch = null;
    let profileHtmlPatch = null;

    // 主资料采集：国家字段由独立队列异步补全，这里只处理基础资料。
    const webProfilePromise = fetchInstagramWebProfileInfoHydrationPatchInBackground(seed, jobContext);
    const profileHtmlPromise = fetchInstagramProfileHtmlHydrationDataInBackground(seed, jobContext);

    const [webProfileResult, profileHtmlResult] = await Promise.allSettled([
        webProfilePromise,
        profileHtmlPromise
    ]);

    if (webProfileResult.status === 'fulfilled') {
        webProfilePatch = webProfileResult.value || null;
    } else {
        const err = webProfileResult.reason;
        if (isInstagramHydrationCancellationError(err, jobContext)) throw err;
        errors.push(`web_profile_info: ${String(err)}`);
    }

    if (profileHtmlResult.status === 'fulfilled') {
        const htmlData = profileHtmlResult.value || null;
        profileHtmlPatch = htmlData?.patch || null;
    } else {
        const err = profileHtmlResult.reason;
        if (isInstagramHydrationCancellationError(err, jobContext)) throw err;
        errors.push(`profile_html: ${String(err)}`);
    }

    throwIfInstagramTaskHydrationJobCancelled(jobContext);

    {
        const composed = mergeInstagramHydrationPatchesForBackground([
            webProfilePatch,
            profileHtmlPatch
        ]);
        if (composed.hasUsefulField && composed.merged && typeof composed.merged === 'object') {
            patch = {
                ...composed.merged,
                platform: 'Instagram',
                taskHydrationStatus: 'success',
                taskHydratedAt: Date.now(),
                taskHydrationError: null,
                taskHydrationSource: composed.merged.taskHydrationSource || 'instagram_background_hybrid'
            };
        }
    }

    // 用户要求：粉丝数以主页 HTML meta 为准（已转纯数字）
    if (patch && profileHtmlPatch?.followerCount) {
        patch.followerCount = String(profileHtmlPatch.followerCount);
    }

    if (patch && !patch.email && Array.isArray(patch.shareLinks) && patch.shareLinks.length > 0) {
        try {
            throwIfInstagramTaskHydrationJobCancelled(jobContext);
            const lookup = await findEmailFromExternalLinks(patch.shareLinks);
            if (lookup?.email) {
                patch.email = lookup.email;
                if (lookup.sourceUrl) patch.emailSourceUrl = lookup.sourceUrl;
            }
        } catch (err) {
            if (isInstagramHydrationCancellationError(err, jobContext)) throw err;
            errors.push(`external_email: ${String(err)}`);
        }
    }

    if (!patch) {
        patch = buildInstagramTaskHydrationFailurePatch(
            errors.join(' | ') || 'instagram hydration failed',
            'background_fetch'
        );
    } else if (errors.length > 0) {
        // Keep successful status but record warnings for debugging.
        patch.taskHydrationError = errors.join(' | ');
    }

    if (isInstagramTaskHydrationJobCancelled(jobContext)) return null;
    await patchBatchCreatorById(seed.id, patch);
    return patch;
}

async function handleInstagramTaskHydrationTabClosed(tabId) {
    const job = activeInstagramTaskHydrationTabs.get(tabId);
    if (!job) return;

    activeInstagramTaskHydrationTabs.delete(tabId);
    if (job.timeoutId) clearTimeout(job.timeoutId);

    const key = String(job.seed?.id || '');
    if (key) activeInstagramTaskHydrationIds.delete(key);

    const patch = buildInstagramTaskHydrationFailurePatch('hydration tab closed before completion', 'tab_closed');
    if (job.seed?.id !== undefined && job.seed?.id !== null) {
        await patchBatchCreatorById(job.seed.id, patch);
    }

    processInstagramTaskHydrationQueue();
}

async function handleInstagramTaskHydrationResult(tabId, payload = {}) {
    let resolvedTabId = tabId;
    if ((resolvedTabId === undefined || resolvedTabId === null) && payload.id !== undefined && payload.id !== null) {
        for (const [candidateTabId, job] of activeInstagramTaskHydrationTabs.entries()) {
            if (String(job?.seed?.id) === String(payload.id)) {
                resolvedTabId = candidateTabId;
                break;
            }
        }
    }

    if (resolvedTabId === undefined || resolvedTabId === null) return false;
    const job = activeInstagramTaskHydrationTabs.get(resolvedTabId);
    if (!job) return false;

    activeInstagramTaskHydrationTabs.delete(resolvedTabId);
    if (job.timeoutId) clearTimeout(job.timeoutId);

    const key = String(job.seed?.id || '');
    if (key) activeInstagramTaskHydrationIds.delete(key);

    let patch = null;
    if (payload && payload.success && payload.patch && typeof payload.patch === 'object') {
        patch = {
            ...payload.patch,
            taskHydrationStatus: 'success',
            taskHydratedAt: Number(payload.patch.taskHydratedAt || Date.now()),
            taskHydrationError: null,
            taskHydrationSource: payload.patch.taskHydrationSource || `instagram_${payload.source || 'content'}`
        };
    } else {
        patch = buildInstagramTaskHydrationFailurePatch(
            payload?.error || 'instagram hydration failed',
            payload?.source || 'content'
        );
    }

    if (job.seed?.id !== undefined && job.seed?.id !== null) {
        await patchBatchCreatorById(job.seed.id, patch);
    }

    chrome.tabs.remove(resolvedTabId).catch(() => {});
    processInstagramTaskHydrationQueue();
    return true;
}

function processInstagramTaskHydrationQueue() {
    notifyInstagramTaskHydrationStateIfIdle();

    if (
        instagramTaskHydrationQueue.length === 0 &&
        activeInstagramTaskHydrationIds.size === 0 &&
        instagramTaskHydrationDeferredRetryQueue.length > 0
    ) {
        const deferred = instagramTaskHydrationDeferredRetryQueue.slice();
        instagramTaskHydrationDeferredRetryQueue = [];
        queuedInstagramTaskHydrationDeferredRetryIds.clear();
        deferred.forEach((seed) => {
            const normalized = normalizeInstagramTaskHydrationSeed(seed, {
                __finalRetry: true
            });
            enqueueInstagramTaskHydrationSeed(normalized);
        });
    }

    while (
        activeInstagramTaskHydrationIds.size < MAX_CONCURRENT_INSTAGRAM_TASK_HYDRATION &&
        instagramTaskHydrationQueue.length > 0
    ) {
        const seed = instagramTaskHydrationQueue.shift();
        if (!seed) continue;
        const key = String(seed.id || '');
        if (!key) continue;

        queuedInstagramTaskHydrationIds.delete(key);
        if (activeInstagramTaskHydrationIds.has(key)) continue;

        const profileUrl = getInstagramTaskHydrationProfileUrl(seed);
        if (!profileUrl) continue;

        const jobContext = createInstagramTaskHydrationJobContext(key, seed);
        activeInstagramTaskHydrationIds.add(key);
        activeInstagramTaskHydrationJobs.set(key, jobContext);

        const hardTimeout = setTimeout(() => {
            cancelInstagramTaskHydrationJob(jobContext, 'job_timeout');
        }, INSTAGRAM_TASK_HYDRATION_JOB_TIMEOUT_MS);

        hydrateInstagramTaskSeed({ ...seed, profileUrl }, jobContext)
            .then((patch) => {
                const status = String(patch?.taskHydrationStatus || '').toLowerCase();
                if (status !== 'failed') return;

                const retryScheduled = maybeScheduleInstagramTaskHydrationFinalRetry(seed, patch?.taskHydrationError || 'hydration_failed');
                if (retryScheduled) return;

                increaseInstagramTaskHydrationFinalFailureCount();
            })
            .catch(async (err) => {
                const cancelled = isInstagramHydrationCancellationError(err, jobContext);
                const cancelReason = String(jobContext?.cancelReason || '');

                if (cancelled && cancelReason === 'manual_stop') {
                    return;
                }
                if (cancelled && cancelReason && cancelReason !== 'job_timeout') {
                    return;
                }
                if (cancelled && !cancelReason) {
                    return;
                }

                const retryScheduled = maybeScheduleInstagramTaskHydrationFinalRetry(seed, err);
                if (retryScheduled) return;

                if (cancelled && cancelReason === 'job_timeout') {
                    await patchBatchCreatorById(
                        seed.id,
                        buildInstagramTaskHydrationFailurePatch('instagram hydration timeout after final retry', 'background_fetch')
                    );
                    increaseInstagramTaskHydrationFinalFailureCount();
                    return;
                }

                console.warn('CreatorScan: Instagram background hydration failed', seed, err);
                await patchBatchCreatorById(
                    seed.id,
                    buildInstagramTaskHydrationFailurePatch(String(err), 'background_fetch')
                );
                increaseInstagramTaskHydrationFinalFailureCount();
            })
            .finally(() => {
                clearTimeout(hardTimeout);
                activeInstagramTaskHydrationJobs.delete(key);
                activeInstagramTaskHydrationIds.delete(key);
                processInstagramTaskHydrationQueue();
            });
    }
    notifyInstagramTaskHydrationStateIfIdle();
}

async function hydrateInstagramCountrySeed(seed, jobContext = null) {
    if (!isInstagramTaskHydrationCandidate(seed) || seed?.id === undefined || seed?.id === null) return null;
    throwIfInstagramTaskHydrationJobCancelled(jobContext);

    const patch = await fetchInstagramAboutThisAccountHydrationPatchViaUiTab(seed, jobContext);
    if (!patch || !patch.location) {
        throw new Error('country patch empty');
    }

    if (isInstagramTaskHydrationJobCancelled(jobContext)) return null;
    await patchBatchCreatorById(seed.id, {
        ...patch,
        countryHydratedAt: Number(patch.countryHydratedAt || Date.now()),
        countryHydrationError: null,
        countryHydrationSource: patch.countryHydrationSource || 'instagram_about_this_account_ui'
    });
    return patch;
}

function processInstagramTaskCountryHydrationQueue() {
    notifyInstagramTaskHydrationStateIfIdle();

    if (
        instagramTaskCountryHydrationQueue.length === 0 &&
        activeInstagramTaskCountryHydrationIds.size === 0 &&
        instagramTaskCountryHydrationDeferredRetryQueue.length > 0
    ) {
        const deferred = instagramTaskCountryHydrationDeferredRetryQueue.slice();
        instagramTaskCountryHydrationDeferredRetryQueue = [];
        queuedInstagramTaskCountryHydrationDeferredRetryIds.clear();
        deferred.forEach((seed) => {
            const normalized = normalizeInstagramCountryHydrationSeed(seed, {
                __countryFinalRetry: true
            });
            enqueueInstagramCountryHydrationSeed(normalized);
        });
    }

    while (
        activeInstagramTaskCountryHydrationIds.size < MAX_CONCURRENT_INSTAGRAM_COUNTRY_HYDRATION &&
        instagramTaskCountryHydrationQueue.length > 0
    ) {
        const seed = instagramTaskCountryHydrationQueue.shift();
        if (!seed) continue;
        const key = String(seed.id || '');
        if (!key) continue;

        queuedInstagramTaskCountryHydrationIds.delete(key);
        if (activeInstagramTaskCountryHydrationIds.has(key)) continue;

        const profileUrl = getInstagramTaskHydrationProfileUrl(seed);
        if (!profileUrl) continue;

        const countryJobSeed = {
            ...seed,
            profileUrl,
            __attempt: Number(seed.__countryAttempt || 1),
            __finalRetry: !!seed.__countryFinalRetry
        };
        const jobContext = createInstagramTaskHydrationJobContext(key, countryJobSeed);
        activeInstagramTaskCountryHydrationIds.add(key);
        activeInstagramTaskCountryHydrationJobs.set(key, jobContext);

        const hardTimeout = setTimeout(() => {
            cancelInstagramTaskHydrationJob(jobContext, 'job_timeout');
        }, INSTAGRAM_TASK_HYDRATION_JOB_TIMEOUT_MS);

        hydrateInstagramCountrySeed(countryJobSeed, jobContext)
            .catch(async (err) => {
                const cancelled = isInstagramHydrationCancellationError(err, jobContext);
                const cancelReason = String(jobContext?.cancelReason || '');

                if (cancelled && cancelReason === 'manual_stop') {
                    return;
                }
                if (cancelled && cancelReason && cancelReason !== 'job_timeout') {
                    return;
                }
                if (cancelled && !cancelReason) {
                    return;
                }

                const retryScheduled = maybeScheduleInstagramCountryHydrationFinalRetry(seed, err);
                if (retryScheduled) return;

                await patchBatchCreatorById(seed.id, {
                    countryHydratedAt: Date.now(),
                    countryHydrationError: cancelled && cancelReason === 'job_timeout'
                        ? 'country hydration timeout after final retry'
                        : String(err),
                    countryHydrationSource: 'instagram_about_this_account_ui'
                });
                increaseInstagramCountryHydrationFinalFailureCount();
            })
            .finally(() => {
                clearTimeout(hardTimeout);
                activeInstagramTaskCountryHydrationJobs.delete(key);
                activeInstagramTaskCountryHydrationIds.delete(key);
                processInstagramTaskCountryHydrationQueue();
            });
    }

    notifyInstagramTaskHydrationStateIfIdle();
}

function isTikTokTaskSeedProfile(profile) {
    return !!(
        profile &&
        profile.platform === 'TikTok' &&
        profile.taskSeedType === 'tiktok_video_author_pair' &&
        (profile.userId || profile.uniqueId) &&
        profile.videoId &&
        profile.id
    );
}

function isTikTokTaskHydrationCandidate(profile) {
    return !!(
        profile &&
        profile.platform === 'TikTok' &&
        (profile.userId || profile.uniqueId) &&
        profile.id
    );
}

function queueTikTokTaskHydrations(profiles, options = {}) {
    const allowMissingVideoId = !!options.allowMissingVideoId;
    let queuedCount = 0;
    for (const profile of profiles || []) {
        if (!isTikTokTaskHydrationCandidate(profile)) continue;
        if (!allowMissingVideoId && !profile.videoId) continue;
        const key = String(profile.id);
        if (queuedTikTokTaskHydrationIds.has(key) || activeTikTokTaskHydrationIds.has(key)) {
            continue;
        }
        queuedTikTokTaskHydrationIds.add(key);
        tiktokTaskHydrationQueue.push(profile);
        queuedCount++;
    }
    processTikTokTaskHydrationQueue();
    return queuedCount;
}

function getTikTokTaskHydrationStatus() {
    return {
        isHydrating: (tiktokTaskHydrationQueue.length > 0 || activeTikTokTaskHydrationIds.size > 0),
        queued: tiktokTaskHydrationQueue.length,
        active: activeTikTokTaskHydrationIds.size
    };
}

function notifyTikTokTaskHydrationStateIfIdle() {
    const isBusy = (tiktokTaskHydrationQueue.length > 0 || activeTikTokTaskHydrationIds.size > 0);
    if (isBusy) {
        tiktokTaskHydrationWasBusy = true;
        return;
    }
    if (tiktokTaskHydrationWasBusy) {
        tiktokTaskHydrationWasBusy = false;
        chrome.runtime.sendMessage({ action: 'tiktokTaskHydrationComplete' }).catch(() => {});
    }
}

function startTikTokTaskHydrationRetry(items) {
    const candidates = (items || [])
        .filter(item => item && String(item.platform || '').toLowerCase() === 'tiktok')
        .map(item => ({
            ...item,
            platform: 'TikTok',
            userId: item.userId || item.uniqueId,
            uniqueId: item.uniqueId || item.userId
        }))
        .filter(isTikTokTaskHydrationCandidate);

    return queueTikTokTaskHydrations(candidates, { allowMissingVideoId: true });
}

function stopTikTokTaskHydrationRetry() {
    tiktokTaskHydrationQueue = [];
    queuedTikTokTaskHydrationIds.clear();
    notifyTikTokTaskHydrationStateIfIdle();
}

function processTikTokTaskHydrationQueue() {
    notifyTikTokTaskHydrationStateIfIdle();
    while (
        activeTikTokTaskHydrationIds.size < MAX_CONCURRENT_TIKTOK_TASK_HYDRATION &&
        tiktokTaskHydrationQueue.length > 0
    ) {
        const seed = tiktokTaskHydrationQueue.shift();
        const key = String(seed.id);
        queuedTikTokTaskHydrationIds.delete(key);
        activeTikTokTaskHydrationIds.add(key);

        hydrateTikTokTaskSeed(seed)
            .catch(err => console.error('CreatorScan: TikTok task hydration failed', seed, err))
            .finally(() => {
                activeTikTokTaskHydrationIds.delete(key);
                processTikTokTaskHydrationQueue();
            });
    }
    notifyTikTokTaskHydrationStateIfIdle();
}

async function hydrateTikTokTaskSeed(seed) {
    if (!isTikTokTaskHydrationCandidate(seed)) return;

    const handle = seed.userId || seed.uniqueId;
    const videoId = seed.videoId;
    const authorUrl = `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
    const videoUrl = videoId
        ? `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(String(videoId))}`
        : null;

    let locationCreated = null;
    let videoFetchError = null;
    let userDetail = null;
    let authorHtml = null;
    let authorFetchError = null;

    if (videoUrl) {
        try {
            const videoHtml = await fetchTikTokHtml(videoUrl);
            locationCreated = extractTikTokLocationCreated(videoHtml);
        } catch (err) {
            videoFetchError = String(err);
            console.warn('CreatorScan: TikTok video page fetch/parse failed', videoUrl, err);
        }
    }

    try {
        authorHtml = await fetchTikTokHtml(authorUrl);
        userDetail = extractTikTokUserDetail(authorHtml);
    } catch (err) {
        authorFetchError = String(err);
        console.warn('CreatorScan: TikTok author page fetch/parse failed', authorUrl, err);
    }

    const contact = extractTikTokAuthorContact(authorHtml, userDetail);
    let externalEmailLookup = null;
    if (!contact.email && Array.isArray(contact.shareLinks) && contact.shareLinks.length > 0) {
        externalEmailLookup = await findEmailFromExternalLinks(contact.shareLinks);
        if (externalEmailLookup?.email) {
            contact.email = externalEmailLookup.email;
        }
    }

    const patch = buildTikTokHydratedProfilePatch(seed, {
        authorUrl,
        videoUrl,
        locationCreated,
        userDetail,
        contact,
        externalEmailLookup,
        videoFetchError,
        authorFetchError
    });

    if (Object.keys(patch).length === 0) return;
    await patchBatchCreatorById(seed.id, patch);
}

async function fetchTikTokHtml(url) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
}

async function fetchHtmlForEmailLookup(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIKTOK_EXTERNAL_EMAIL_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (
            contentType &&
            !contentType.includes('text/html') &&
            !contentType.includes('text/plain') &&
            !contentType.includes('application/xhtml+xml')
        ) {
            throw new Error(`Unsupported content-type: ${contentType}`);
        }

        const text = await response.text();
        return String(text || '').slice(0, TIKTOK_EXTERNAL_EMAIL_MAX_HTML_CHARS);
    } finally {
        clearTimeout(timer);
    }
}

function extractTikTokLocationCreated(html) {
    const universalData = extractTikTokUniversalData(html);
    const defaultScope = universalData && universalData.__DEFAULT_SCOPE__;
    const videoDetail = defaultScope && (
        defaultScope['webapp.video-detail'] ||
        (defaultScope.webapp && defaultScope.webapp['video-detail'])
    );

    const fromJson = videoDetail?.itemInfo?.itemStruct?.locationCreated;
    if (fromJson) return fromJson;

    const regexMatch = String(html || '').match(/"locationCreated"\s*:\s*"([^"]+)"/i);
    return regexMatch ? regexMatch[1] : null;
}

function extractTikTokUserDetail(html) {
    const universalData = extractTikTokUniversalData(html);
    const defaultScope = universalData && universalData.__DEFAULT_SCOPE__;
    if (!defaultScope || typeof defaultScope !== 'object') return null;

    return (
        defaultScope['webapp.user-detail'] ||
        (defaultScope.webapp && defaultScope.webapp['user-detail']) ||
        null
    );
}

function extractTikTokUniversalData(html) {
    const source = String(html || '');
    const match = source.match(
        /<script[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (!match || !match[1]) return null;

    try {
        return JSON.parse(match[1]);
    } catch (err) {
        console.warn('CreatorScan: Failed to parse __UNIVERSAL_DATA_FOR_REHYDRATION__', err);
        return null;
    }
}

function extractTikTokAuthorContact(html, userDetail) {
    const result = { email: null, shareLinks: [] };
    const user = userDetail?.userInfo?.user || {};
    let userDetailJson = '';
    try {
        userDetailJson = userDetail ? JSON.stringify(userDetail) : '';
    } catch (e) {}

    // Original DOM scraper semantics: email is searched from bio/signature text first.
    const emailSources = [
        user.signature,
        userDetail?.shareMeta?.desc,
        userDetailJson
    ].filter(Boolean);

    for (const source of emailSources) {
        const email = extractFirstEmailFromText(source);
        if (email) {
            result.email = email;
            break;
        }
    }

    const linkCandidates = [];
    const pushLinkCandidate = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            linkCandidates.push(value);
            return;
        }
        if (typeof value === 'object') {
            if (value.link) linkCandidates.push(value.link);
            if (value.url) linkCandidates.push(value.url);
            if (value.href) linkCandidates.push(value.href);
        }
    };

    // Common TikTok user-detail shapes
    pushLinkCandidate(user.bioLink);
    if (Array.isArray(user.bioLinkList)) user.bioLinkList.forEach(pushLinkCandidate);
    if (Array.isArray(user.linkInfos)) user.linkInfos.forEach(pushLinkCandidate);

    // Fallback: scan only TikTok redirect links from HTML source (avoid collecting unrelated CDN/app links).
    const htmlSource = String(html || '');
    if (htmlSource) {
        const redirectMatches = htmlSource.match(/https?:\/\/www\.tiktok\.com\/link\/v2\?[^\s"'<>\\]+/gi) || [];
        redirectMatches.forEach((u) => linkCandidates.push(u));
    }

    const normalized = [];
    const seen = new Set();
    linkCandidates.forEach((raw) => {
        const url = normalizeTikTokExternalLink(raw);
        if (!url) return;
        const key = url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(url);
    });

    result.shareLinks = normalized;
    return result;
}

function extractFirstEmailFromText(text) {
    if (!text) return null;
    const source = String(text)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#64;/g, '@');
    const match = source.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : null;
}

function normalizeTikTokExternalLink(raw) {
    if (!raw) return null;
    let value = String(raw).trim();
    if (!value) return null;

    value = value
        .replace(/&amp;/g, '&')
        .replace(/\\u002F/g, '/')
        .replace(/\\\//g, '/');

    if (value.startsWith('//')) {
        value = `https:${value}`;
    }

    if (value.startsWith('mailto:')) return null;

    let parsed;
    try {
        parsed = new URL(value, 'https://www.tiktok.com');
    } catch (e) {
        return null;
    }

    if (parsed.hostname.includes('tiktok.com') && parsed.pathname.includes('/link/v2')) {
        const target = parsed.searchParams.get('target');
        if (target) {
            try {
                value = decodeURIComponent(target);
            } catch (e) {
                value = target;
            }
            try {
                parsed = new URL(value);
            } catch (e) {
                return null;
            }
        }
    }

    const host = parsed.hostname.toLowerCase();
    if (host.includes('tiktok.com') || host.endsWith('tiktokcdn.com') || host.endsWith('byteoversea.com')) {
        return null;
    }
    if (!/^https?:$/i.test(parsed.protocol)) return null;

    parsed.hash = '';
    return parsed.toString();
}

function extractEmailsFromText(text) {
    if (!text) return [];
    const source = String(text)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#64;/g, '@');
    const matches = source.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const out = [];
    const seen = new Set();
    matches.forEach((m) => {
        const email = String(m).trim();
        if (!email) return;
        const key = email.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(email);
    });
    return out;
}

function normalizeGenericExternalLink(raw, baseUrl = null) {
    if (!raw) return null;
    let value = String(raw).trim();
    if (!value) return null;

    value = value
        .replace(/&amp;/g, '&')
        .replace(/\\u002F/g, '/')
        .replace(/\\\//g, '/');

    if (value.startsWith('//')) {
        value = `https:${value}`;
    }
    if (value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) {
        return null;
    }

    let parsed;
    try {
        parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
    } catch (e) {
        return null;
    }

    if (!/^https?:$/i.test(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString();
}

function isRecursiveSocialEmailCandidateLink(url) {
    if (!url) return false;
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return false;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const socialHosts = [
        'instagram.com',
        'youtube.com',
        'youtu.be',
        'facebook.com',
        'fb.com',
        'x.com',
        'twitter.com',
        'threads.net',
        'linkedin.com'
    ];
    if (!socialHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return false;
    }

    // Skip obvious share/dialog endpoints that are not profile-like pages.
    const path = (parsed.pathname || '').toLowerCase();
    const blockedFragments = ['/share', '/intent', '/dialog', '/sharer', '/login', '/signup'];
    if (blockedFragments.some((frag) => path.includes(frag))) {
        return false;
    }

    return true;
}

function extractRecursiveSocialLinksFromHtml(html, baseUrl) {
    const source = String(html || '');
    if (!source) return [];

    const candidates = [];

    const hrefMatches = Array.from(source.matchAll(/href\s*=\s*["']([^"']+)["']/gi));
    hrefMatches.forEach((match) => {
        if (match && match[1]) candidates.push(match[1]);
    });

    const rawUrlMatches = source.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    rawUrlMatches.forEach((u) => candidates.push(u));

    const normalized = [];
    const seen = new Set();
    candidates.forEach((raw) => {
        const url = normalizeGenericExternalLink(raw, baseUrl);
        if (!url || !isRecursiveSocialEmailCandidateLink(url)) return;
        const key = url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(url);
    });

    return normalized.slice(0, TIKTOK_EXTERNAL_EMAIL_RECURSE_MAX_DISCOVERED_PER_PAGE);
}

function extractEmailFromExternalHtml(html) {
    const source = String(html || '');
    if (!source) return null;

    // Prefer explicit mailto links if present.
    const mailtoMatches = Array.from(source.matchAll(/mailto:([^"'<>\\?#\s]+)/gi));
    for (const match of mailtoMatches) {
        const raw = match?.[1] || '';
        let decoded = raw;
        try { decoded = decodeURIComponent(raw); } catch (e) {}
        const email = extractFirstEmailFromText(decoded);
        if (email) return email;
    }

    const all = extractEmailsFromText(source);
    return all.length > 0 ? all[0] : null;
}

async function findEmailFromExternalLinks(links) {
    const normalizedLinks = Array.isArray(links) ? links.filter(Boolean) : [];
    const attempts = normalizedLinks.slice(0, TIKTOK_EXTERNAL_EMAIL_LINK_CHECK_LIMIT);
    const errors = [];
    const queue = attempts.map((url) => ({ url, depth: 0 }));
    const visited = new Set();
    let checked = 0;

    while (queue.length > 0 && checked < TIKTOK_EXTERNAL_EMAIL_RECURSE_MAX_TOTAL_PAGES) {
        const current = queue.shift();
        if (!current || !current.url) continue;
        const visitKey = current.url.toLowerCase();
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);
        checked++;

        try {
            const html = await fetchHtmlForEmailLookup(current.url);
            const email = extractEmailFromExternalHtml(html);
            if (email) {
                return {
                    email,
                    sourceUrl: current.url,
                    checked,
                    depth: current.depth
                };
            }

            // Only recurse when current page has no email and depth budget remains.
            if (current.depth < TIKTOK_EXTERNAL_EMAIL_RECURSE_MAX_DEPTH) {
                const nestedLinks = extractRecursiveSocialLinksFromHtml(html, current.url);
                nestedLinks.forEach((nestedUrl) => {
                    const nestedKey = nestedUrl.toLowerCase();
                    if (visited.has(nestedKey)) return;
                    queue.push({ url: nestedUrl, depth: current.depth + 1 });
                });
            }
        } catch (err) {
            errors.push(`${current.url}: ${String(err)}`);
        }
    }

    return {
        email: null,
        sourceUrl: null,
        checked,
        error: errors.length > 0 ? errors.join(' | ') : null
    };
}

function buildTikTokHydratedProfilePatch(seed, data) {
    const patch = {};
    const userDetail = data.userDetail;
    const userInfo = userDetail?.userInfo || {};
    const user = userInfo.user || {};
    const stats = userInfo.stats || {};

    patch.url = data.authorUrl;
    patch.profileUrl = data.authorUrl;
    if (data.videoUrl) patch.videoUrl = data.videoUrl;

    if (data.locationCreated) {
        patch.locationCreated = data.locationCreated;
    }

    if (user.id) patch.authorId = user.id;
    if (user.uniqueId) {
        patch.userId = user.uniqueId;
        patch.uniqueId = user.uniqueId;
    }
    if (user.secUid) patch.secUid = user.secUid;
    if (user.nickname) patch.nickname = user.nickname;
    if (user.signature !== undefined) patch.signature = user.signature;
    if (user.region) patch.region = user.region;
    if (user.verified !== undefined) patch.verified = !!user.verified;

    const avatarUrl = user.avatarLarger || user.avatarMedium || user.avatarThumb;
    if (avatarUrl) patch.avatar = avatarUrl;

    if (stats.followerCount !== undefined && stats.followerCount !== null) {
        patch.followerCount = String(stats.followerCount);
    }
    if (stats.followingCount !== undefined && stats.followingCount !== null) {
        patch.followingCount = String(stats.followingCount);
    }
    if (stats.heartCount !== undefined && stats.heartCount !== null) {
        patch.heartCount = String(stats.heartCount);
    }
    if (stats.videoCount !== undefined && stats.videoCount !== null) {
        patch.videoCount = String(stats.videoCount);
    }

    const email = data.contact?.email;
    const shareLinks = data.contact?.shareLinks;
    if (email) patch.email = email;
    if (Array.isArray(shareLinks) && shareLinks.length > 0) patch.shareLinks = shareLinks;
    if (data.externalEmailLookup?.sourceUrl) {
        patch.emailSourceUrl = data.externalEmailLookup.sourceUrl;
    }

    patch.taskHydrationStatus = (userDetail || data.locationCreated) ? 'success' : 'failed';
    patch.taskHydratedAt = Date.now();

    const errors = [];
    if (data.videoFetchError) errors.push(`video: ${data.videoFetchError}`);
    if (data.authorFetchError) errors.push(`author: ${data.authorFetchError}`);
    if (data.externalEmailLookup?.error) errors.push(`external-email: ${data.externalEmailLookup.error}`);
    patch.taskHydrationError = errors.length > 0 ? errors.join(' | ') : null;

    return patch;
}

async function patchBatchCreatorById(id, patch) {
    return withBatchCreatorsWriteLock(async () => {
        const { batchCollectedCreators = [] } = await chrome.storage.local.get('batchCollectedCreators');
        const creators = batchCollectedCreators.slice();
        const index = creators.findIndex(c => String(c.id) === String(id));
        if (index === -1) return false;

        creators[index] = { ...creators[index], ...patch };
        await chrome.storage.local.set({ batchCollectedCreators: creators });
        chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
        if (patch && patch.avatar) {
            queueLocalAvatarCacheForItems('batchCollectedCreators', [creators[index]]);
        }
        return true;
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
            
            chrome.storage.local.set({ [storageKey]: creators }, () => {
                if (data && typeof data === 'object' && data.avatar) {
                    queueLocalAvatarCacheForItems(storageKey, [creators[index]]);
                }
            });
        }
        
        chrome.tabs.remove(tabId, () => {
             if (chrome.runtime.lastError) {}
        });
        processEnrichmentQueue();
    });
}
