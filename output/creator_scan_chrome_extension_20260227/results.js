function csEnsureUi() {
    if (document.getElementById('cs-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'cs-ui-style';
    style.textContent = `
    .cs-toast{position:fixed;right:16px;top:16px;background:#0f172a;color:#fff;padding:10px 14px;border-radius:10px;font-size:12px;z-index:99999;box-shadow:0 10px 28px rgba(0,0,0,.32);}
    .cs-mask{position:fixed;inset:0;background:rgba(2,6,23,.45);display:flex;align-items:center;justify-content:center;z-index:99998;}
    .cs-dialog{width:360px;max-width:calc(100vw - 24px);background:#fff;border-radius:12px;padding:14px;box-shadow:0 16px 40px rgba(0,0,0,.28);}
    .cs-title{font-weight:700;font-size:14px;color:#111827;margin-bottom:6px;}
    .cs-msg{font-size:12px;color:#4b5563;line-height:1.5;white-space:pre-wrap;}
    .cs-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
    .cs-btn{border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;}
    .cs-btn.primary{background:#FF0050;border-color:#FF0050;color:#fff;}
    `;
    document.head.appendChild(style);
}

function csAlert(message) {
    csEnsureUi();
    const el = document.createElement('div');
    el.className = 'cs-toast';
    el.textContent = String(message);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
}

function csConfirm(message, title = '确认操作') {
    csEnsureUi();
    return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'cs-mask';
        mask.innerHTML = `
        <div class="cs-dialog">
          <div class="cs-title">${title}</div>
          <div class="cs-msg">${String(message)}</div>
          <div class="cs-actions">
            <button class="cs-btn" data-act="cancel">取消</button>
            <button class="cs-btn primary" data-act="ok">确认</button>
          </div>
        </div>`;
        mask.addEventListener('click', (e) => {
            const act = e.target && e.target.dataset ? e.target.dataset.act : '';
            if (act === 'ok') {
                mask.remove();
                resolve(true);
            } else if (act === 'cancel' || e.target === mask) {
                mask.remove();
                resolve(false);
            }
        });
        document.body.appendChild(mask);
    });
}

const DASHBOARD_PLATFORM_FILTER_STORAGE_KEY = 'creatorScanResultsPlatformFilter';
let activeDashboardPlatformFilter = 'all';

function normalizeDashboardPlatformFilter(value) {
    const key = String(value || '').trim().toLowerCase();
    if (['all', 'tiktok', 'instagram', 'youtube'].includes(key)) return key;
    return 'all';
}

function getDashboardPlatformFilterLabel(value = activeDashboardPlatformFilter) {
    const key = normalizeDashboardPlatformFilter(value);
    if (key === 'tiktok') return 'TikTok';
    if (key === 'instagram') return 'Instagram';
    if (key === 'youtube') return 'YouTube';
    return '全部平台';
}

function matchesDashboardPlatformFilter(item) {
    if (activeDashboardPlatformFilter === 'all') return true;
    return getCreatorPlatformKey(item) === activeDashboardPlatformFilter;
}

function formatBadgeCount(filteredCount, totalCount) {
    const filtered = Number(filteredCount || 0);
    const total = Number(totalCount || 0);
    if (total <= 0) return '0';
    if (filtered === total) return String(total);
    return `${filtered}/${total}`;
}

function updateDashboardPlatformMenuUI() {
    const menuButtons = document.querySelectorAll('.platform-menu-tab');
    menuButtons.forEach((btn) => {
        const isActive = normalizeDashboardPlatformFilter(btn.dataset.platform) === activeDashboardPlatformFilter;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function getBatchAutoHydrationPlatformConfig() {
    const filter = normalizeDashboardPlatformFilter(activeDashboardPlatformFilter);
    if (filter === 'instagram') {
        return {
            platform: 'instagram',
            label: 'Instagram',
            startAction: 'startInstagramTaskHydrationRetry',
            stopAction: 'stopInstagramTaskHydrationRetry',
            statusAction: 'getInstagramTaskHydrationStatus',
            completeAction: 'instagramTaskHydrationComplete'
        };
    }
    if (filter === 'tiktok' || filter === 'all') {
        return {
            platform: 'tiktok',
            label: 'TikTok',
            startAction: 'startTikTokTaskHydrationRetry',
            stopAction: 'stopTikTokTaskHydrationRetry',
            statusAction: 'getTikTokTaskHydrationStatus',
            completeAction: 'tiktokTaskHydrationComplete'
        };
    }
    return null;
}

function updateBatchAutoHydrationButtonText() {
    const runBtn = document.getElementById('enrich-batch');
    const stopBtn = document.getElementById('stop-enrich-batch');
    if (!runBtn || !stopBtn) return;

    const config = getBatchAutoHydrationPlatformConfig();
    if (!config) {
        runBtn.textContent = '自动补全（暂不支持）';
        runBtn.disabled = true;
        stopBtn.disabled = true;
        return;
    }

    runBtn.disabled = false;
    stopBtn.disabled = false;
    runBtn.textContent = `自动补全（${config.label}）`;
    stopBtn.textContent = `停止自动补全（${config.label}）`;
}

document.addEventListener('DOMContentLoaded', () => {
    const DEFAULT_SERVER_URL = 'http://localhost:8090';
    console.log('Results page loaded');
    if (typeof XLSX === 'undefined') {
        console.error('SheetJS (XLSX) library not found on load!');
    } else {
        console.log('SheetJS (XLSX) library loaded successfully.');
    }

    // Tabs Logic
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Activate clicked tab
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    activeDashboardPlatformFilter = normalizeDashboardPlatformFilter(
        localStorage.getItem(DASHBOARD_PLATFORM_FILTER_STORAGE_KEY)
    );
    updateDashboardPlatformMenuUI();
    updateBatchAutoHydrationButtonText();
    document.querySelectorAll('.platform-menu-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            const next = normalizeDashboardPlatformFilter(btn.dataset.platform);
            if (next === activeDashboardPlatformFilter) return;
            activeDashboardPlatformFilter = next;
            localStorage.setItem(DASHBOARD_PLATFORM_FILTER_STORAGE_KEY, next);
            updateDashboardPlatformMenuUI();
            updateBatchAutoHydrationButtonText();
            refreshBatchAutoHydrationUIForSelectedPlatform();
            loadAllData();
        });
    });

    // Load Data
    loadAllData();
    chrome.runtime.sendMessage({ action: 'queueLocalAvatarCacheBackfill' }).catch(() => {});

    // Button Listeners
    document.getElementById('refresh-batch').addEventListener('click', loadBatchData);
    document.getElementById('refresh-manual').addEventListener('click', loadManualData);
    document.getElementById('refresh-imported').addEventListener('click', loadImportedData);
    
    document.getElementById('enrich-batch').addEventListener('click', async () => {
        handleBatchAutoHydration();
    });

    document.getElementById('enrich-imported').addEventListener('click', async () => {
        handleEnrichment('imported');
    });

    function refreshBatchAutoHydrationUIForSelectedPlatform() {
        const config = getBatchAutoHydrationPlatformConfig();
        if (!config) {
            updateBatchAutoHydrationUI({ isHydrating: false, queued: 0, active: 0, retrying: 0, failedFinal: 0 });
            return;
        }
        chrome.runtime.sendMessage({ action: config.statusAction }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`CreatorScan: ${config.statusAction} error`, chrome.runtime.lastError);
                updateBatchAutoHydrationUI({ isHydrating: false, queued: 0, active: 0, retrying: 0, failedFinal: 0 });
                return;
            }
            updateBatchAutoHydrationUI(response && typeof response === 'object'
                ? response
                : { isHydrating: false, queued: 0, active: 0, retrying: 0, failedFinal: 0 }
            );
        });
    }

    async function handleBatchAutoHydration() {
        console.log('Batch auto hydration retry button clicked');
        const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
        const items = batchCollectedCreators || [];

        const config = getBatchAutoHydrationPlatformConfig();
        if (!config) {
            return csAlert('当前平台暂不支持自动补全（仅支持 TikTok / Instagram）。');
        }
        const platformKey = config.platform;
        const platformLabel = config.label;

        if (items.length === 0) {
            return csAlert('没有可自动补全的数据。');
        }

        const selectedIds = Array.from(document.querySelectorAll('.batch-checkbox:checked')).map(cb => cb.dataset.id);
        const usingSelection = selectedIds.length > 0;

        let candidates = items.filter((c) => {
            if (!c || String(c.platform || '').toLowerCase() !== platformKey) return false;
            if (usingSelection && !selectedIds.includes(String(c.id))) return false;
            const taskHydrationStatus = String(c.taskHydrationStatus || '').toLowerCase();
            if (platformKey === 'instagram') {
                const locationText = String(c.location || '').trim();
                const hasCountry = !!(
                    String(c.locationCode || '').trim() ||
                    String(c.countryCode || '').trim() ||
                    String(c.aboutThisAccountCountry || '').trim() ||
                    String(c.countryName || '').trim() ||
                    (locationText && /^[a-z]{2}$/i.test(locationText))
                );
                if (taskHydrationStatus === 'success' && hasCountry) return false;
            } else if (taskHydrationStatus === 'success') {
                return false;
            }
            if (!c.id || !(c.uniqueId || c.userId)) return false;
            return true;
        });

        if (candidates.length === 0) {
            return csAlert(usingSelection
                ? `选中的项目里没有需要自动补全的 ${platformLabel} 红人（可能已补全完成）。`
                : `当前没有未完成自动补全的 ${platformLabel} 红人。`);
        }

        // Prioritize the newest rows first to improve visible completion speed.
        candidates = candidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const hydrationBehaviorText = platformKey === 'instagram'
            ? '会在后台打开主页标签页采集国家并自动关闭。'
            : '不会打开后台标签页。';
        const msg = usingSelection
            ? `开始自动补全 ${candidates.length} 个选中的未完成项目？（${hydrationBehaviorText}）`
            : `开始自动补全 ${candidates.length} 个未完成项目？（${hydrationBehaviorText}）`;

        if (!(await csConfirm(msg, `自动补全（${platformLabel}）`))) {
            return;
        }

        chrome.runtime.sendMessage(
            { action: config.startAction, items: candidates },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(`CreatorScan: ${config.startAction} error`, chrome.runtime.lastError);
                    csAlert(`自动补全启动失败: ${chrome.runtime.lastError.message}`);
                    return;
                }
                if (response && typeof response.queued === 'number' && response.queued === 0) {
                    csAlert('没有可加入补全队列的数据。');
                    return;
                }
                refreshBatchAutoHydrationUIForSelectedPlatform();
                if (usingSelection) {
                    document.querySelectorAll('.batch-checkbox:checked').forEach(cb => cb.checked = false);
                    document.getElementById('batch-select-all').checked = false;
                    updateDeleteBtn('batch');
                }
                csAlert(`已加入 ${platformLabel} 自动补全队列：${response?.queued ?? candidates.length} 条`);
            }
        );
    }

    async function handleEnrichment(type) {
        console.log(`Enrich ${type} button clicked`);
        const storageKey = type === 'batch' ? 'batchCollectedCreators' : 'importedCreators';
        const { [storageKey]: items } = await chrome.storage.local.get(storageKey);
        
        if (!items || items.length === 0) {
            return csAlert('没有可挖掘的数据。');
        }
        
        // Check for selected items first
        const selectedCheckboxes = document.querySelectorAll(`.${type}-checkbox:checked`);
        let toEnrich = [];
        let isForce = false;

        if (selectedCheckboxes.length > 0) {
            const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
            toEnrich = items
                .filter(c => selectedIds.includes(String(c.id)))
                .map(c => ({
                    id: c.id,
                    url: `https://www.tiktok.com/@${c.uniqueId}`,
                    source: type
                }));
            isForce = true;
        } else {
            // No selection: enrich only those NOT yet deep scraped
            toEnrich = items
                .filter(c => !c.deepScraped)
                .map(c => ({
                    id: c.id,
                    url: `https://www.tiktok.com/@${c.uniqueId}`,
                    source: type
                }));
        }
        
        if (toEnrich.length === 0) {
            return csAlert('所有项目已挖掘！请选择特定项目以强制重新采集。');
        }
        
        const msg = isForce 
            ? `开始强制挖掘 ${toEnrich.length} 个选中的个人资料？(将覆盖现有数据)`
            : `开始挖掘 ${toEnrich.length} 个个人资料？这将在后台打开标签页。`;

        if (await csConfirm(msg, '开始挖掘')) {
            chrome.runtime.sendMessage({ action: 'startEnrichment', items: toEnrich });
            updateEnrichmentUI(true, type);
            
            // Clear selection after start
            if (isForce) {
                document.querySelectorAll(`.${type}-checkbox:checked`).forEach(cb => cb.checked = false);
                document.getElementById(`${type}-select-all`).checked = false;
                updateDeleteBtn(type);
            }
        }
    }

    document.getElementById('stop-enrich-batch').addEventListener('click', async () => stopBatchAutoHydration());
    document.getElementById('stop-enrich-imported').addEventListener('click', async () => stopEnrichment('imported'));

    async function stopBatchAutoHydration() {
        const config = getBatchAutoHydrationPlatformConfig();
        if (!config) {
            return csAlert('当前平台暂不支持自动补全停止操作。');
        }
        if (await csConfirm('停止自动补全？队列中的待处理项会被取消，进行中的请求会在本轮结束。', '停止自动补全')) {
            chrome.runtime.sendMessage({ action: config.stopAction }, () => {
                refreshBatchAutoHydrationUIForSelectedPlatform();
            });
            updateBatchAutoHydrationUI({ isHydrating: false, queued: 0, active: 0, retrying: 0, failedFinal: 0 });
        }
    }

    async function stopEnrichment(type) {
        if (await csConfirm('停止挖掘？当前打开的标签页将在完成后关闭。', '停止挖掘')) {
            chrome.runtime.sendMessage({ action: 'stopEnrichment' });
            updateEnrichmentUI(false, type);
        }
    }

    // Check enrichment status on load
    chrome.runtime.sendMessage({ action: 'getEnrichmentStatus' }, (response) => {
        if (response && response.isEnriching) {
            updateEnrichmentUI(true, 'imported');
        }
    });
    refreshBatchAutoHydrationUIForSelectedPlatform();
    window.setInterval(() => {
        refreshBatchAutoHydrationUIForSelectedPlatform();
    }, 2000);

    // Listen for completion
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'enrichmentComplete') {
            updateEnrichmentUI(false, 'imported');
            loadImportedData();
            csAlert('挖掘过程已完成！');
        } else if (request.action === 'tiktokTaskHydrationComplete' || request.action === 'instagramTaskHydrationComplete') {
            const stopBtn = document.getElementById('stop-enrich-batch');
            const currentConfig = getBatchAutoHydrationPlatformConfig();
            const isCurrentPlatformCompletion = currentConfig && request.action === currentConfig.completeAction;
            const wasRunning = isCurrentPlatformCompletion && stopBtn && stopBtn.style.display !== 'none';
            refreshBatchAutoHydrationUIForSelectedPlatform();
            loadBatchData();
            if (wasRunning) {
                csAlert(`自动补全已完成（${currentConfig.label}）。`);
            }
        }
    });

    document.getElementById('clear-batch').addEventListener('click', () => clearData('batch'));
    document.getElementById('clear-imported').addEventListener('click', () => clearData('imported'));
    document.getElementById('clear-manual').addEventListener('click', () => clearData('manual'));
    document.getElementById('delete-no-email-batch').addEventListener('click', () => deleteNoEmailItems('batch'));
    document.getElementById('delete-no-email-imported').addEventListener('click', () => deleteNoEmailItems('imported'));
    document.getElementById('delete-no-email-manual').addEventListener('click', () => deleteNoEmailItems('manual'));

    async function clearData(type) {
        let name = type === 'batch' ? '任务数据' : (type === 'imported' ? '导入的 URL' : '手动采集');
        let key = type === 'batch' ? 'batchCollectedCreators' : (type === 'imported' ? 'importedCreators' : 'creators');
        
        if (await csConfirm(`确定要清空 ${name} 数据吗？`, '清空数据')) {
            await chrome.storage.local.set({ [key]: [] });
            if (type === 'batch') loadBatchData();
            else if (type === 'imported') loadImportedData();
            else loadManualData();
        }
    }

    function hasValidEmail(email) {
        return !!(email && String(email).trim() && String(email).trim() !== '-');
    }

    async function deleteNoEmailItems(type) {
        let storageKey;
        let typeName;
        if (type === 'batch') {
            storageKey = 'batchCollectedCreators';
            typeName = '任务采集';
        } else if (type === 'imported') {
            storageKey = 'importedCreators';
            typeName = '导入 URL';
        } else {
            storageKey = 'creators';
            typeName = '手动采集';
        }

        const result = await chrome.storage.local.get(storageKey);
        const items = result[storageKey] || [];
        if (!items.length) {
            return csAlert('当前列表没有数据。');
        }

        const noEmailIds = [];
        items.forEach((item) => {
            if (hasValidEmail(item.email)) return;
            if (type === 'manual') {
                if (item.url) noEmailIds.push(item.url);
            } else if (item.id !== undefined && item.id !== null) {
                noEmailIds.push(String(item.id));
            }
        });

        if (noEmailIds.length === 0) {
            return csAlert('当前列表没有“无邮箱”的红人数据。');
        }

        const ok = await csConfirm(
            `将删除 ${typeName} 列表中 ${noEmailIds.length} 条没有邮箱的红人数据。此操作不可撤销，是否继续？`,
            '删除无邮箱数据'
        );
        if (!ok) return;

        await deleteItems(type, noEmailIds);
        csAlert(`已删除 ${noEmailIds.length} 条无邮箱数据。`);
    }


    document.getElementById('export-batch').addEventListener('click', async () => {
        const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
        if(!batchCollectedCreators || batchCollectedCreators.length === 0) return csAlert('没有可导出的数据');
        
        // CSV Headers
        const headers = ['Nickname', 'UniqueId', 'FollowerCount', 'Location', 'Signature', 'ProfileURL', 'AvatarURL', 'Platform', 'Timestamp', 'Email', 'ShareLinks', 'ID', 'SecUid', 'DeepScraped'];
        const rows = batchCollectedCreators.map(c => [
            escapeCsv(getCreatorDisplayName(c)),
            escapeCsv(c.uniqueId || ''),
            escapeCsv(getCreatorFollowerDisplay(c)),
            escapeCsv(getCreatorLocationDisplay(c)),
            escapeCsv(c.signature || ''),
            escapeCsv(getCreatorProfileUrl(c)),
            escapeCsv(c.avatar || ''),
            c.platform || '',
            c.timestamp ? new Date(c.timestamp).toLocaleString() : '',
            escapeCsv(c.email || ''),
            escapeCsv(c.shareLinks ? c.shareLinks.join('; ') : ''),
            c.id,
            c.secUid || '',
            c.deepScraped ? 'Yes' : 'No'
        ]);
        
        downloadCsv('tiktok_batch_export.csv', headers, rows);
    });

    document.getElementById('export-manual').addEventListener('click', async () => {
        const { creators } = await chrome.storage.local.get('creators');
        if(!creators || creators.length === 0) return csAlert('没有可导出的数据');
        
        const headers = ['Platform', 'Email', 'Followers', 'ShareLinks', 'ProfileURL', 'Timestamp'];
        const rows = creators.map(c => [
            c.platform,
            escapeCsv(c.email || ''),
            escapeCsv(c.followers || ''),
            escapeCsv(c.shareLinks ? c.shareLinks.join('; ') : ''),
            escapeCsv(c.url),
            new Date(c.timestamp).toLocaleString()
        ]);
        
        downloadCsv('manual_scrape_export.csv', headers, rows);
    });
    
    document.getElementById('export-manual-xlsx').addEventListener('click', async () => {
        try {
            if (typeof XLSX === 'undefined') {
                return csAlert('Excel 库未加载。请刷新页面或检查网络连接。');
            }

            const { creators } = await chrome.storage.local.get('creators');
            if(!creators || creators.length === 0) return csAlert('没有可导出的数据');
            
            const data = creators.map(c => ({
                'Platform': c.platform,
                'Email': c.email || '',
                'Followers': c.followers || '',
                'ShareLinks': c.shareLinks ? c.shareLinks.join('; ') : '',
                'ProfileURL': c.url,
                'Timestamp': new Date(c.timestamp).toLocaleString()
            }));
            
            downloadXlsx(data, 'manual_scrape_export.xlsx');
        } catch (error) {
            console.error('Export Excel Error:', error);
            csAlert('导出失败: ' + error.message);
        }
    });

    document.getElementById('export-imported').addEventListener('click', async () => {
        const { importedCreators } = await chrome.storage.local.get('importedCreators');
        if(!importedCreators || importedCreators.length === 0) return csAlert('没有可导出的数据');
        
        // CSV Headers
        const headers = ['Nickname', 'UniqueId', 'FollowerCount', 'Location', 'Signature', 'ProfileURL', 'AvatarURL', 'Platform', 'Timestamp', 'Email', 'ShareLinks', 'ID', 'SecUid', 'DeepScraped'];
        const rows = importedCreators.map(c => [
            escapeCsv(getCreatorDisplayName(c)),
            escapeCsv(c.uniqueId || ''),
            escapeCsv(getCreatorFollowerDisplay(c)),
            escapeCsv(getCreatorLocationDisplay(c)),
            escapeCsv(c.signature || ''),
            escapeCsv(getCreatorProfileUrl(c)),
            escapeCsv(c.avatar || ''),
            c.platform || '',
            c.timestamp ? new Date(c.timestamp).toLocaleString() : '',
            escapeCsv(c.email || ''),
            escapeCsv(c.shareLinks ? c.shareLinks.join('; ') : ''),
            c.id,
            c.secUid || '',
            c.deepScraped ? 'Yes' : 'No'
        ]);
        
        downloadCsv('imported_urls_export.csv', headers, rows);
    });

    document.getElementById('export-imported-xlsx').addEventListener('click', async () => {
        try {
            if (typeof XLSX === 'undefined') {
                return csAlert('Excel 库未加载。请刷新页面或检查网络连接。');
            }

            const { importedCreators } = await chrome.storage.local.get('importedCreators');
            if(!importedCreators || importedCreators.length === 0) return csAlert('没有可导出的数据');
            
            const data = importedCreators.map(c => ({
                'Nickname': getCreatorDisplayName(c),
                'UniqueId': c.uniqueId || '',
                'FollowerCount': getCreatorFollowerDisplay(c),
                'Location': getCreatorLocationDisplay(c),
                'Signature': c.signature || '',
                'ProfileURL': getCreatorProfileUrl(c),
                'AvatarURL': c.avatar || '',
                'Platform': c.platform || '',
                'Timestamp': c.timestamp ? new Date(c.timestamp).toLocaleString() : '',
                'Email': c.email || '',
                'ShareLinks': c.shareLinks ? c.shareLinks.join('; ') : '',
                'ID': c.id,
                'SecUid': c.secUid || '',
                'DeepScraped': c.deepScraped ? 'Yes' : 'No'
            }));
            
            downloadXlsx(data, 'imported_urls_export.xlsx');
        } catch (error) {
            console.error('Export Excel Error:', error);
            csAlert('导出失败: ' + error.message);
        }
    });

    document.getElementById('export-batch-xlsx').addEventListener('click', async () => {
        try {
            if (typeof XLSX === 'undefined') {
                return csAlert('Excel 库未加载。请刷新页面或检查网络连接。');
            }

            const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
            if(!batchCollectedCreators || batchCollectedCreators.length === 0) return csAlert('没有可导出的数据');
            
            const data = batchCollectedCreators.map(c => ({
                'Nickname': getCreatorDisplayName(c),
                'UniqueId': c.uniqueId || '',
                'FollowerCount': getCreatorFollowerDisplay(c),
                'Location': getCreatorLocationDisplay(c),
                'Signature': c.signature || '',
                'ProfileURL': getCreatorProfileUrl(c),
                'AvatarURL': c.avatar || '',
                'Platform': c.platform || '',
                'Timestamp': c.timestamp ? new Date(c.timestamp).toLocaleString() : '',
                'Email': c.email || '',
                'ShareLinks': c.shareLinks ? c.shareLinks.join('; ') : '',
                'ID': c.id,
                'SecUid': c.secUid || '',
                'DeepScraped': c.deepScraped ? 'Yes' : 'No'
            }));
            
            downloadXlsx(data, 'tiktok_batch_export.xlsx');
        } catch (error) {
            console.error('Export Excel Error:', error);
            csAlert('导出失败: ' + error.message);
        }
    });
    
    // Import URLs Logic
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-urls-input');
    
    document.getElementById('import-urls').addEventListener('click', () => {
        importModal.style.display = 'block';
        importInput.value = '';
        importInput.focus();
    });

    document.getElementById('cancel-import').addEventListener('click', () => {
        importModal.style.display = 'none';
    });

    // Close modal if clicking outside
    importModal.addEventListener('click', (e) => {
        if (e.target === importModal) {
            importModal.style.display = 'none';
        }
    });

    document.getElementById('confirm-import').addEventListener('click', async () => {
        const rawText = importInput.value;
        if (!rawText.trim()) {
            return csAlert('请输入至少一个 URL。');
        }

        const urls = rawText.split(/[\n\s]+/).filter(u => u.trim() !== '');
        const newItems = [];
        let unsupportedCount = 0;
        
        // Regex to extract username from https://www.tiktok.com/@username
        const regex = /(?:tiktok\.com\/@|@)([\w\.]+)/;

        for (const url of urls) {
            if (!/tiktok\.com/i.test(url) && !/^@[\w.]+$/.test(url)) {
                unsupportedCount += 1;
                continue;
            }
            const match = url.match(regex);
            if (match && match[1]) {
                let uniqueId = match[1].replace(/[.,;]$/, '');
                
                newItems.push({
                    id: Date.now() + Math.floor(Math.random() * 10000), // Generate a random ID
                    uniqueId: uniqueId,
                    nickname: uniqueId, // Placeholder
                    avatar: 'icons/icon48.png', // Placeholder
                    followerCount: '-',
                    signature: 'Imported via URL',
                    platform: 'TikTok',
                    timestamp: Date.now(),
                    deepScraped: false,
                    email: '',
                    shareLinks: []
                });
            }
        }

        if (newItems.length === 0) {
            if (unsupportedCount > 0) {
                return csAlert(`未找到有效的 TikTok 个人资料 URL。\n检测到 ${unsupportedCount} 条非 TikTok 链接，已跳过。`);
            }
            return csAlert('未找到有效的 TikTok 个人资料 URL。');
        }

        // Save to storage
        const { importedCreators } = await chrome.storage.local.get('importedCreators');
        let currentItems = importedCreators || [];
        
        // Filter duplicates (check against uniqueId within imported list only)
        const existingIds = new Set(currentItems.map(i => i.uniqueId.toLowerCase()));
        const uniqueNewItems = newItems.filter(i => !existingIds.has(i.uniqueId.toLowerCase()));

        if (uniqueNewItems.length === 0) {
            importModal.style.display = 'none';
            return csAlert('所有导入的个人资料已存在于列表中。');
        }

        // Add to list
        currentItems = [...currentItems, ...uniqueNewItems];
        await chrome.storage.local.set({ importedCreators: currentItems });
        
        loadImportedData();
        importModal.style.display = 'none';
        const skippedDuplicateCount = newItems.length - uniqueNewItems.length;
        const unsupportedText = unsupportedCount > 0 ? `\n跳过非 TikTok 链接: ${unsupportedCount}` : '';
        csAlert(`成功导入 ${uniqueNewItems.length} 个新个人资料。\n跳过重复项: ${skippedDuplicateCount}${unsupportedText}`);
    });

    // Batch Select Logic
    setupSelection('batch');
    setupSelection('manual');
    setupSelection('imported');
    
    // Settings Modal Logic
    const settingsModal = document.getElementById('settings-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    const serverUrlInput = document.getElementById('server-url-input');

    document.getElementById('open-settings').addEventListener('click', async () => {
        const { serverApiKey, serverUrl } = await chrome.storage.local.get(['serverApiKey', 'serverUrl']);
        if (serverApiKey) apiKeyInput.value = serverApiKey;
        serverUrlInput.value = serverUrl || DEFAULT_SERVER_URL;
        settingsModal.style.display = 'block';
    });

    document.getElementById('cancel-settings').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    document.getElementById('save-settings').addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const url = serverUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
        
        if (!apiKey) return csAlert('请输入 API Key。');
        if (!url) return csAlert('请输入服务器地址 URL。');
        if (!/^https?:\/\//i.test(url)) return csAlert('服务器地址必须以 http:// 或 https:// 开头。');

        await chrome.storage.local.set({ serverApiKey: apiKey, serverUrl: url });
        csAlert('设置已保存！');
        settingsModal.style.display = 'none';
    });

    // Push Data Logic
    document.getElementById('push-batch').addEventListener('click', () => pushData('batch'));
    document.getElementById('push-imported').addEventListener('click', () => pushData('imported'));

    function normalizeTagsInput(value) {
        if (Array.isArray(value)) {
            const seen = new Set();
            const out = [];
            value.forEach(v => {
                const s = String(v || '').trim();
                if (!s) return;
                const key = s.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                out.push(s);
            });
            return out;
        }
        const text = String(value || '');
        return normalizeTagsInput(text.split(/[\n,，;；]+/g));
    }

    function mergeTags(existing, incoming, merge = true) {
        const next = normalizeTagsInput(incoming);
        if (!merge) return next;
        return normalizeTagsInput([...(Array.isArray(existing) ? existing : []), ...next]);
    }

    function openPushTagsModal(type, count) {
        const modal = document.getElementById('push-tags-modal');
        const input = document.getElementById('push-tags-input');
        const help = document.getElementById('push-tags-help');
        const mergeCheckbox = document.getElementById('push-tags-merge');
        const cancelBtn = document.getElementById('cancel-push-tags');
        const confirmBtn = document.getElementById('confirm-push-tags');
        if (!modal || !input || !help || !mergeCheckbox || !cancelBtn || !confirmBtn) {
            return Promise.resolve({ cancelled: false, tags: [], merge: true });
        }

        help.textContent = `为本次${type === 'batch' ? '任务采集' : '导入 URL'}推送的 ${count} 条数据添加标签（可多个）。支持英文逗号、中文逗号、分号或换行分隔。`;
        input.value = '';
        mergeCheckbox.checked = true;
        modal.style.display = 'block';
        setTimeout(() => input.focus(), 0);

        return new Promise((resolve) => {
            let closed = false;
            const finish = (result) => {
                if (closed) return;
                closed = true;
                modal.style.display = 'none';
                cleanup();
                resolve(result);
            };
            const onCancel = () => finish({ cancelled: true, tags: [], merge: true });
            const onConfirm = () => finish({
                cancelled: false,
                tags: normalizeTagsInput(input.value),
                merge: !!mergeCheckbox.checked
            });
            const onBackdrop = (e) => {
                if (e.target === modal) onCancel();
            };
            const onKeydown = (e) => {
                if (e.key === 'Escape') onCancel();
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onConfirm();
            };
            const cleanup = () => {
                cancelBtn.removeEventListener('click', onCancel);
                confirmBtn.removeEventListener('click', onConfirm);
                modal.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeydown);
            };

            cancelBtn.addEventListener('click', onCancel, { once: true });
            confirmBtn.addEventListener('click', onConfirm, { once: true });
            modal.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKeydown);
        });
    }

    async function pushData(type) {
        const { serverApiKey, serverUrl } = await chrome.storage.local.get(['serverApiKey', 'serverUrl']);
        if (!serverApiKey) {
            return csAlert('请先在设置中配置 API Key。');
        }
        const targetServerUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, '');

        const storageKey = type === 'batch' ? 'batchCollectedCreators' : 'importedCreators';
        const { [storageKey]: items } = await chrome.storage.local.get(storageKey);

        if (!items || items.length === 0) {
            return csAlert('没有可推送的数据。');
        }

        const pushTagConfig = await openPushTagsModal(type, items.length);
        if (pushTagConfig.cancelled) return;

        const btn = document.getElementById(`push-${type}`);
        const originalText = btn.textContent;
        btn.textContent = '推送中...';
        btn.disabled = true;

        try {
            const preparedItems = items.map((item) => {
                const nextItem = { ...item };
                const nextTags = mergeTags(item.tags, pushTagConfig.tags, pushTagConfig.merge);
                if (nextTags.length > 0) {
                    nextItem.tags = nextTags;
                } else {
                    delete nextItem.tags;
                }
                return nextItem;
            });

            // Persist tags locally when user provided push tags, so repeat pushes keep tags.
            if (pushTagConfig.tags.length > 0) {
                await chrome.storage.local.set({ [storageKey]: preparedItems });
            }

            // Transform data to match API schema
            // API expects: { platform, unique_id, data }
            const payload = preparedItems.map(item => ({
                // Normalize aliases before push so backend/frontend can consume one stable key.
                // Keep original fields too (locationCreated/region) for traceability.
                platform: item.platform || 'TikTok',
                unique_id: item.uniqueId || item.id, // Fallback if uniqueId missing
                data: {
                    ...item,
                    location: item.location || item.locationCreated || item.region || null,
                    ...(item.tags && item.tags.length > 0 ? { tags: item.tags } : {})
                }
            }));

            const response = await fetch(`${targetServerUrl}/creators/push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': serverApiKey
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const tagText = pushTagConfig.tags.length > 0 ? `（标签: ${pushTagConfig.tags.join(', ')}）` : '';
                csAlert(`成功推送 ${result.length} 个创作者到服务器！${tagText}`);
            } else {
                const error = await response.text();
                csAlert(`推送失败: ${response.status} ${response.statusText}\n${error}`);
            }
        } catch (err) {
            console.error('Push error:', err);
            csAlert(`推送失败: ${err.message}`);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // Auto-refresh listener
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.batchCollectedCreators) loadBatchData();
            if (changes.creators) loadManualData();
            if (changes.importedCreators) loadImportedData();
        }
    });
});

function setupSelection(type) {
    const selectAll = document.getElementById(`${type}-select-all`);
    const deleteBtn = document.getElementById(`delete-selected-${type}`);
    
    selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll(`.${type}-checkbox`);
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateDeleteBtn(type);
    });
    
    deleteBtn.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll(`.${type}-checkbox:checked`);
        if (checkboxes.length === 0) return;
        
        if (await csConfirm(`确定要删除这 ${checkboxes.length} 项吗？`, '批量删除')) {
            const idsToDelete = Array.from(checkboxes).map(cb => cb.dataset.id);
            await deleteItems(type, idsToDelete);
        }
    });
}

function updateDeleteBtn(type) {
    const checked = document.querySelectorAll(`.${type}-checkbox:checked`);
    const btn = document.getElementById(`delete-selected-${type}`);
    if (checked.length > 0) {
        btn.style.display = 'inline-block';
        btn.textContent = `删除选中 (${checked.length})`;
    } else {
        btn.style.display = 'none';
    }
}

function updateEnrichmentUI(isEnriching, type) {
    if (!type) type = 'batch'; 
    
    const enrichBtn = document.getElementById(`enrich-${type}`);
    const stopBtn = document.getElementById(`stop-enrich-${type}`);
    
    if (enrichBtn && stopBtn) {
        if (isEnriching) {
            enrichBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
        } else {
            enrichBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
        }
    }
}

function normalizeBatchAutoHydrationStatus(statusLike) {
    const source = (statusLike && typeof statusLike === 'object')
        ? statusLike
        : { isHydrating: !!statusLike };
    const asCount = (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };
    const isHydrating = !!source.isHydrating;
    const queued = asCount(source.queued);
    const active = asCount(source.active);
    const retrying = asCount(source.retrying);
    const failedFinal = asCount(source.failedFinal);
    const queuedMain = asCount(source.queuedMain);
    const queuedCountry = asCount(source.queuedCountry);
    const activeMain = asCount(source.activeMain);
    const activeCountry = asCount(source.activeCountry);
    const queuedCountryRetry = asCount(source.queuedCountryRetry);
    const activeCountryRetry = asCount(source.activeCountryRetry);
    const failedMainFinal = asCount(source.failedMainFinal);
    const failedCountryFinal = asCount(source.failedCountryFinal);
    return {
        isHydrating,
        queued,
        active,
        retrying,
        failedFinal,
        queuedMain,
        queuedCountry,
        activeMain,
        activeCountry,
        queuedCountryRetry,
        activeCountryRetry,
        failedMainFinal,
        failedCountryFinal
    };
}

function buildBatchAutoHydrationStatusText(config, status) {
    if (!config) return '自动补全状态：当前平台暂不支持';
    const parts = [
        status.isHydrating ? '进行中' : '空闲',
        `排队 ${status.queued}`,
        `运行 ${status.active}`
    ];
    if (config.platform === 'instagram') {
        parts.push(`主队列 ${status.queuedMain + status.activeMain}`);
        parts.push(`国家队列 ${status.queuedCountry + status.activeCountry}`);
        parts.push(`国家进行中 ${status.activeCountry}`);
        parts.push(`国家重试中 ${status.queuedCountryRetry + status.activeCountryRetry}`);
        parts.push(`国家最终失败 ${status.failedCountryFinal}`);
        parts.push(`重试中 ${status.retrying}`);
        parts.push(`最终失败 ${status.failedFinal}`);
    }
    return `${config.label} 自动补全：${parts.join(' · ')}`;
}

function updateBatchAutoHydrationUI(statusLike) {
    const runBtn = document.getElementById('enrich-batch');
    const stopBtn = document.getElementById('stop-enrich-batch');
    const statusEl = document.getElementById('batch-auto-hydration-status');
    if (!runBtn || !stopBtn) return;

    const config = getBatchAutoHydrationPlatformConfig();
    const status = normalizeBatchAutoHydrationStatus(statusLike);

    if (status.isHydrating) {
        runBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    } else {
        runBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
    }

    if (!statusEl) return;
    statusEl.textContent = buildBatchAutoHydrationStatusText(config, status);
    statusEl.style.borderColor = status.isHydrating ? '#91caff' : '#d9d9d9';
    statusEl.style.background = status.isHydrating ? '#e6f4ff' : '#fafafa';
    statusEl.style.color = status.isHydrating ? '#0958d9' : '#595959';
}

async function deleteItems(type, ids) {
    let storageKey;
    if (type === 'batch') storageKey = 'batchCollectedCreators';
    else if (type === 'imported') storageKey = 'importedCreators';
    else storageKey = 'creators';

    const result = await chrome.storage.local.get(storageKey);
    let items = result[storageKey] || [];
    
    const initialLength = items.length;
    
    if (type === 'batch' || type === 'imported') {
        items = items.filter(item => !ids.includes(String(item.id)));
    } else {
        // Manual items might not have ID, use URL as ID
        items = items.filter(item => !ids.includes(item.url));
    }
    
    if (items.length < initialLength) {
        await chrome.storage.local.set({ [storageKey]: items });
        // Reload will happen automatically via listener
        // But for better UX reset select all
        document.getElementById(`${type}-select-all`).checked = false;
        document.getElementById(`delete-selected-${type}`).style.display = 'none';
    }
}

async function loadAllData() {
    await Promise.all([loadBatchData(), loadManualData(), loadImportedData()]);
}

function getCreatorPlatformKey(item) {
    return String(item?.platform || '').trim().toLowerCase();
}

function getCreatorProfileUrl(item) {
    if (item && typeof item.profileUrl === 'string' && item.profileUrl.trim()) return item.profileUrl.trim();
    if (item && typeof item.url === 'string' && item.url.trim()) return item.url.trim();

    const uniqueId = String(item?.uniqueId || '').trim();
    if (!uniqueId) return '';

    const platform = getCreatorPlatformKey(item);
    if (platform === 'instagram') {
        return `https://www.instagram.com/${encodeURIComponent(uniqueId)}/`;
    }
    if (platform === 'youtube') {
        if (uniqueId.startsWith('http://') || uniqueId.startsWith('https://')) return uniqueId;
        if (uniqueId.startsWith('@')) return `https://www.youtube.com/${uniqueId}`;
        return `https://www.youtube.com/@${encodeURIComponent(uniqueId)}`;
    }
    return `https://www.tiktok.com/@${encodeURIComponent(uniqueId)}`;
}

function getCreatorDisplayName(item) {
    const nickname = String(item?.nickname || '').trim();
    if (nickname) return nickname;
    const uniqueId = String(item?.uniqueId || '').trim();
    if (uniqueId) return uniqueId;
    const authorId = String(item?.authorId || '').trim();
    if (authorId) return authorId;
    const id = item?.id;
    return (id === undefined || id === null) ? '-' : String(id);
}

function getCreatorDisplayHandle(item) {
    const uniqueId = String(item?.uniqueId || '').trim();
    if (!uniqueId) {
        const id = item?.id;
        return (id === undefined || id === null) ? '-' : String(id);
    }
    const platform = getCreatorPlatformKey(item);
    if (platform === 'instagram' || platform === 'tiktok') return `@${uniqueId}`;
    return uniqueId;
}

function getCreatorFollowerDisplay(item) {
    const value = item?.followerCount ?? item?.followers;
    if (value === undefined || value === null) return '-';
    const text = String(value).trim();
    return text || '-';
}

function getCreatorLocationDisplay(item) {
    const candidates = [
        item?.location,
        item?.locationCode,
        item?.aboutThisAccountCountry,
        item?.countryName,
        item?.cityName,
        item?.locationCreated,
        item?.region
    ];
    for (const value of candidates) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '-';
}

function getCreatorSignatureDisplay(item) {
    const value = item?.signature;
    if (value === undefined || value === null) return '-';
    const text = String(value).trim();
    return text || '-';
}

function getCreatorTaskStatusIcon(item) {
    if (item?.deepScraped) return '✅';
    const status = String(item?.taskHydrationStatus || '').toLowerCase();
    if (status === 'pending') return '⏳';
    if (status === 'failed') return '⚠️';
    return '';
}

async function loadImportedData() {
    const { importedCreators } = await chrome.storage.local.get('importedCreators');
    const tbody = document.querySelector('#imported-table tbody');
    const emptyState = document.getElementById('imported-empty');
    const badge = document.getElementById('imported-badge');
    
    tbody.innerHTML = '';
    
    const allData = importedCreators || [];
    const data = allData.filter(matchesDashboardPlatformFilter);
    if (badge) badge.textContent = formatBadgeCount(data.length, allData.length);
    
    if (allData.length === 0) {
        emptyState.textContent = '暂无导入的 URL 数据';
        emptyState.style.display = 'block';
        return;
    }
    if (data.length === 0) {
        emptyState.textContent = `当前平台（${getDashboardPlatformFilterLabel()}）下暂无导入的 URL 数据`;
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // Sort by timestamp desc
    data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    data.forEach(item => {
        const tr = document.createElement('tr');
        const idStr = String(item.id);

        const profileUrl = getCreatorProfileUrl(item);
        const profileLabel = getCreatorDisplayHandle(item);
        const location = getCreatorLocationDisplay(item);
        const email = item.email || '-';
        const links = item.shareLinks ? item.shareLinks.join(', ') : '-';
        const statusIcon = getCreatorTaskStatusIcon(item);
        const signature = getCreatorSignatureDisplay(item);
        const followerCount = getCreatorFollowerDisplay(item);
        const displayName = getCreatorDisplayName(item);
        const profileCell = profileUrl
            ? `<a href="${escapeHtml(profileUrl)}" target="_blank">${escapeHtml(profileLabel)}</a>`
            : escapeHtml(profileLabel);

        tr.innerHTML = `
            <td><input type="checkbox" class="imported-checkbox" data-id="${idStr}"></td>
            <td><img src="${escapeHtml(getDisplayAvatar(item))}" class="avatar-img"></td>
            <td>${escapeHtml(displayName)} ${statusIcon}</td>
            <td class="link-cell">${profileCell}</td>
            <td>${escapeHtml(followerCount)}</td>
            <td title="${escapeHtml(String(location))}">${escapeHtml(String(location))}</td>
            <td>${escapeHtml(email)}</td>
            <td><div style="max-width: 150px; overflow:hidden; text-overflow:ellipsis; white-space: nowrap;" title="${escapeHtml(links)}">${escapeHtml(links)}</div></td>
            <td title="${escapeHtml(signature)}">${truncate(signature, 50)}</td>
            <td>${escapeHtml(item.platform || '-')}</td>
            <td style="font-size: 12px; color: #888;">${item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '-'}</td>
            <td><button class="btn-danger btn-sm delete-single" data-type="imported" data-id="${idStr}">删除</button></td>
        `;
        tbody.appendChild(tr);

        const avatarImg = tr.querySelector('.avatar-img');
        if (avatarImg) {
            avatarImg.addEventListener('error', handleAvatarImageError, { once: true });
        }
    });
    
    attachCheckboxListeners('imported');
}

async function loadBatchData() {
    const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
    const tbody = document.querySelector('#batch-table tbody');
    const emptyState = document.getElementById('batch-empty');
    const badge = document.getElementById('batch-badge');
    
    tbody.innerHTML = '';
    
    const allData = batchCollectedCreators || [];
    const data = allData.filter(matchesDashboardPlatformFilter);
    badge.textContent = formatBadgeCount(data.length, allData.length);
    
    if (allData.length === 0) {
        emptyState.textContent = '暂无任务采集数据';
        emptyState.style.display = 'block';
        return;
    }
    if (data.length === 0) {
        emptyState.textContent = `当前平台（${getDashboardPlatformFilterLabel()}）下暂无任务采集数据`;
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // Sort by timestamp desc
    data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    data.forEach(item => {
        const tr = document.createElement('tr');
        const idStr = String(item.id);

        const profileUrl = getCreatorProfileUrl(item);
        const profileLabel = getCreatorDisplayHandle(item);
        const location = getCreatorLocationDisplay(item);
        const email = item.email || '-';
        const links = item.shareLinks ? item.shareLinks.join(', ') : '-';
        const statusIcon = getCreatorTaskStatusIcon(item);
        const signature = getCreatorSignatureDisplay(item);
        const followerCount = getCreatorFollowerDisplay(item);
        const displayName = getCreatorDisplayName(item);
        const profileCell = profileUrl
            ? `<a href="${escapeHtml(profileUrl)}" target="_blank">${escapeHtml(profileLabel)}</a>`
            : escapeHtml(profileLabel);

        tr.innerHTML = `
            <td><input type="checkbox" class="batch-checkbox" data-id="${idStr}"></td>
            <td><img src="${escapeHtml(getDisplayAvatar(item))}" class="avatar-img"></td>
            <td>${escapeHtml(displayName)} ${statusIcon}</td>
            <td class="link-cell">${profileCell}</td>
            <td>${escapeHtml(followerCount)}</td>
            <td title="${escapeHtml(String(location))}">${escapeHtml(String(location))}</td>
            <td>${escapeHtml(email)}</td>
            <td><div style="max-width: 150px; overflow:hidden; text-overflow:ellipsis; white-space: nowrap;" title="${escapeHtml(links)}">${escapeHtml(links)}</div></td>
            <td title="${escapeHtml(signature)}">${truncate(signature, 50)}</td>
            <td>${escapeHtml(item.platform || '-')}</td>
            <td style="font-size: 12px; color: #888;">${item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '-'}</td>
            <td><button class="btn-danger btn-sm delete-single" data-type="batch" data-id="${idStr}">删除</button></td>
        `;
        tbody.appendChild(tr);

        const avatarImg = tr.querySelector('.avatar-img');
        if (avatarImg) {
            avatarImg.addEventListener('error', handleAvatarImageError, { once: true });
        }
    });
    
    attachCheckboxListeners('batch');
}

async function loadManualData() {
    const { creators } = await chrome.storage.local.get('creators');
    const tbody = document.querySelector('#manual-table tbody');
    const emptyState = document.getElementById('manual-empty');
    const badge = document.getElementById('manual-badge');
    
    tbody.innerHTML = '';
    
    const allData = creators || [];
    const data = allData.filter(matchesDashboardPlatformFilter);
    badge.textContent = formatBadgeCount(data.length, allData.length);
    
    if (allData.length === 0) {
        emptyState.textContent = '暂无手动采集数据';
        emptyState.style.display = 'block';
        return;
    }
    if (data.length === 0) {
        emptyState.textContent = `当前平台（${getDashboardPlatformFilterLabel()}）下暂无手动采集数据`;
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // Sort by timestamp desc
    data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    data.forEach(item => {
        const tr = document.createElement('tr');
        // Use URL as ID for manual items since they don't have explicit IDs
        const idStr = item.url;
        
        tr.innerHTML = `
            <td><input type="checkbox" class="manual-checkbox" data-id="${idStr}"></td>
            <td>${item.platform}</td>
            <td>${item.email ? `<a href="mailto:${item.email}">${item.email}</a>` : '-'}</td>
            <td>${item.followers || '-'}</td>
            <td>${formatLinks(item.shareLinks)}</td>
            <td class="link-cell"><a href="${item.url}" target="_blank">查看主页</a></td>
            <td style="font-size: 12px; color: #888;">${new Date(item.timestamp).toLocaleTimeString()}</td>
            <td><button class="btn-danger btn-sm delete-single" data-type="manual" data-id="${idStr}">删除</button></td>
        `;
        tbody.appendChild(tr);
    });
    
    attachCheckboxListeners('manual');
}

function attachCheckboxListeners(type) {
    const checkboxes = document.querySelectorAll(`.${type}-checkbox`);
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            updateDeleteBtn(type);
            // Update select all checkbox state
            const all = document.querySelectorAll(`.${type}-checkbox`);
            const checked = document.querySelectorAll(`.${type}-checkbox:checked`);
            document.getElementById(`${type}-select-all`).checked = all.length === checked.length;
        });
    });
    
    const deleteButtons = document.querySelectorAll(`.delete-single[data-type="${type}"]`);
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (await csConfirm('确定删除此项吗？', '删除确认')) {
                const id = e.target.dataset.id;
                await deleteItems(type, [id]);
            }
        });
    });
}

function handleAvatarImageError(e) {
    const img = e.target;
    if (img && img.src && !img.src.endsWith('/icons/icon16.png') && !img.src.endsWith('icons/icon16.png')) {
        img.src = 'icons/icon16.png';
    }
}

function getDisplayAvatar(item) {
    if (item && typeof item.avatarLocal === 'string' && item.avatarLocal.trim()) return item.avatarLocal;
    if (item && typeof item.avatar === 'string' && item.avatar.trim()) return item.avatar;
    return 'icons/icon16.png';
}

// Helpers
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

function truncate(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

function formatLinks(links) {
    if (!links || links.length === 0) return '-';
    return links.map(link => {
        let display = link;
        try {
            const url = new URL(link);
            display = url.hostname + (url.pathname.length > 1 ? url.pathname : '');
        } catch(e) {}
        return `<a href="${link}" target="_blank" title="${link}">${truncate(display, 20)}</a>`;
    }).join('<br>');
}

function escapeCsv(text) {
    if (!text) return '';
    const stringText = String(text);
    if (stringText.includes(',') || stringText.includes('"') || stringText.includes('\n')) {
        return '"' + stringText.replace(/"/g, '""') + '"';
    }
    return stringText;
}

function downloadCsv(filename, headers, rows) {
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadXlsx(data, filename) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, filename);
}
