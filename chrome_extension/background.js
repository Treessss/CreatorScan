// --- Task Orchestration Logic ---
let activeTaskTabs = new Map(); // tabId -> { taskId, keyword, startTime }
let taskQueueInterval = null;
let tiktokTaskHydrationQueue = [];
const activeTikTokTaskHydrationIds = new Set();
const queuedTikTokTaskHydrationIds = new Set();
const MAX_CONCURRENT_TIKTOK_TASK_HYDRATION = 2;
let instagramTaskHydrationQueue = [];
const activeInstagramTaskHydrationIds = new Set();
const queuedInstagramTaskHydrationIds = new Set();
const activeInstagramTaskHydrationTabs = new Map(); // tabId -> { seed, timeoutId, startedAt }
let creatingInstagramTaskHydrationTabCount = 0;
const MAX_CONCURRENT_INSTAGRAM_TASK_HYDRATION = 2;
const INSTAGRAM_TASK_HYDRATION_TIMEOUT_MS = 30000;
const INSTAGRAM_TASK_HYDRATION_START_DELAY_MS = 1200;
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
const LOCAL_AVATAR_CACHE_TIMEOUT_MS = 8000;
const LOCAL_AVATAR_CACHE_MAX_BYTES = 700 * 1024;
const MAX_CONCURRENT_LOCAL_AVATAR_CACHE = 2;
const localAvatarCacheQueue = [];
const queuedLocalAvatarCacheJobKeys = new Set();
const activeLocalAvatarCacheJobKeys = new Set();

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
  chrome.storage.local.get(['creators', 'isRecording'], (result) => {
    if (!result.isRecording) return; // Double check

    const creators = result.creators || [];
    
    // Check for duplicates based on URL
    const exists = creators.some(c => c.url === newProfile.url);
    
    if (!exists) {
      creators.push(newProfile);
      chrome.storage.local.set({ creators: creators }, () => {
        queueLocalAvatarCacheForItems('creators', [newProfile]);
      });
      console.log('Saved new profile:', newProfile.url);
      chrome.runtime.sendMessage({ action: 'statsUpdated' }).catch(() => {});
    } else {
      // Optional: Update existing profile if needed, for now just skip
      console.log('Profile already exists:', newProfile.url);
    }
  });
}

function isInstagramTaskHydrationCandidate(profile) {
    return !!(
        profile &&
        String(profile.platform || '').toLowerCase() === 'instagram' &&
        (profile.uniqueId || profile.authorId || profile.id)
    );
}

function getInstagramTaskHydrationProfileUrl(seed) {
    if (!seed) return null;
    if (typeof seed.profileUrl === 'string' && seed.profileUrl.trim()) return seed.profileUrl.trim();
    if (typeof seed.url === 'string' && seed.url.trim()) return seed.url.trim();
    const username = String(seed.uniqueId || '').trim();
    if (!username) return null;
    return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

function getInstagramTaskHydrationStatus() {
    return {
        isHydrating: (instagramTaskHydrationQueue.length > 0 || activeInstagramTaskHydrationTabs.size > 0 || creatingInstagramTaskHydrationTabCount > 0),
        queued: instagramTaskHydrationQueue.length,
        active: activeInstagramTaskHydrationTabs.size + creatingInstagramTaskHydrationTabCount
    };
}

function notifyInstagramTaskHydrationStateIfIdle() {
    const isBusy = (instagramTaskHydrationQueue.length > 0 || activeInstagramTaskHydrationTabs.size > 0 || creatingInstagramTaskHydrationTabCount > 0);
    if (isBusy) {
        instagramTaskHydrationWasBusy = true;
        return;
    }
    if (instagramTaskHydrationWasBusy) {
        instagramTaskHydrationWasBusy = false;
        chrome.runtime.sendMessage({ action: 'instagramTaskHydrationComplete' }).catch(() => {});
    }
}

function queueInstagramTaskHydrations(profiles) {
    let queuedCount = 0;
    for (const raw of profiles || []) {
        if (!isInstagramTaskHydrationCandidate(raw)) continue;
        const seed = {
            ...raw,
            platform: 'Instagram',
            uniqueId: raw.uniqueId || raw.userId || raw.username,
            authorId: raw.authorId || raw.id,
            profileUrl: getInstagramTaskHydrationProfileUrl(raw)
        };
        if (!seed.profileUrl) continue;

        const key = String(seed.id);
        if (!key) continue;
        if (queuedInstagramTaskHydrationIds.has(key) || activeInstagramTaskHydrationIds.has(key)) continue;

        queuedInstagramTaskHydrationIds.add(key);
        instagramTaskHydrationQueue.push(seed);
        queuedCount++;
    }
    processInstagramTaskHydrationQueue();
    return queuedCount;
}

function startInstagramTaskHydrationRetry(items) {
    const candidates = (items || [])
        .filter(isInstagramTaskHydrationCandidate)
        .map((item) => ({
            ...item,
            platform: 'Instagram',
            uniqueId: item.uniqueId || item.userId || item.username,
            authorId: item.authorId || item.id
        }))
        .filter(isInstagramTaskHydrationCandidate);
    return queueInstagramTaskHydrations(candidates);
}

function stopInstagramTaskHydrationRetry() {
    instagramTaskHydrationQueue = [];
    queuedInstagramTaskHydrationIds.clear();
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
    while (
        (activeInstagramTaskHydrationTabs.size + creatingInstagramTaskHydrationTabCount) < MAX_CONCURRENT_INSTAGRAM_TASK_HYDRATION &&
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

        activeInstagramTaskHydrationIds.add(key);
        creatingInstagramTaskHydrationTabCount++;

        chrome.tabs.create({ url: profileUrl, active: false }, async (tab) => {
            creatingInstagramTaskHydrationTabCount = Math.max(0, creatingInstagramTaskHydrationTabCount - 1);
            if (chrome.runtime.lastError || !tab?.id) {
                console.warn('CreatorScan: Failed to open Instagram hydration tab', chrome.runtime.lastError, seed);
                activeInstagramTaskHydrationIds.delete(key);
                const patch = buildInstagramTaskHydrationFailurePatch(
                    chrome.runtime.lastError?.message || 'failed to create tab',
                    'tab_create'
                );
                if (seed.id !== undefined && seed.id !== null) {
                    await patchBatchCreatorById(seed.id, patch);
                }
                processInstagramTaskHydrationQueue();
                return;
            }

            const timeoutId = setTimeout(() => {
                if (!activeInstagramTaskHydrationTabs.has(tab.id)) return;
                handleInstagramTaskHydrationResult(tab.id, {
                    success: false,
                    source: 'timeout',
                    error: `Instagram hydration timeout after ${INSTAGRAM_TASK_HYDRATION_TIMEOUT_MS}ms`
                }).catch((err) => console.warn('CreatorScan: Instagram hydration timeout handling failed', err));
            }, INSTAGRAM_TASK_HYDRATION_TIMEOUT_MS);

            activeInstagramTaskHydrationTabs.set(tab.id, {
                seed: { ...seed, profileUrl },
                timeoutId,
                startedAt: Date.now()
            });
            notifyInstagramTaskHydrationStateIfIdle();
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
