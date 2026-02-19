document.addEventListener('DOMContentLoaded', () => {
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

    // Load Data
    loadAllData();

    // Button Listeners
    document.getElementById('refresh-batch').addEventListener('click', loadBatchData);
    document.getElementById('refresh-manual').addEventListener('click', loadManualData);
    document.getElementById('refresh-imported').addEventListener('click', loadImportedData);
    
    document.getElementById('enrich-batch').addEventListener('click', async () => {
        handleEnrichment('batch');
    });

    document.getElementById('enrich-imported').addEventListener('click', async () => {
        handleEnrichment('imported');
    });

    async function handleEnrichment(type) {
        console.log(`Enrich ${type} button clicked`);
        const storageKey = type === 'batch' ? 'batchCollectedCreators' : 'importedCreators';
        const { [storageKey]: items } = await chrome.storage.local.get(storageKey);
        
        if (!items || items.length === 0) {
            return alert('没有可挖掘的数据。');
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
            return alert('所有项目已挖掘！请选择特定项目以强制重新采集。');
        }
        
        const msg = isForce 
            ? `开始强制挖掘 ${toEnrich.length} 个选中的个人资料？(将覆盖现有数据)`
            : `开始挖掘 ${toEnrich.length} 个个人资料？这将在后台打开标签页。`;

        if (confirm(msg)) {
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

    document.getElementById('stop-enrich-batch').addEventListener('click', () => stopEnrichment('batch'));
    document.getElementById('stop-enrich-imported').addEventListener('click', () => stopEnrichment('imported'));

    function stopEnrichment(type) {
        if(confirm('停止挖掘？当前打开的标签页将在完成后关闭。')) {
            chrome.runtime.sendMessage({ action: 'stopEnrichment' });
            updateEnrichmentUI(false, type);
        }
    }

    // Check enrichment status on load
    chrome.runtime.sendMessage({ action: 'getEnrichmentStatus' }, (response) => {
        if (response && response.isEnriching) {
            updateEnrichmentUI(true, 'batch');
            updateEnrichmentUI(true, 'imported');
        }
    });

    // Listen for completion
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'enrichmentComplete') {
            updateEnrichmentUI(false, 'batch');
            updateEnrichmentUI(false, 'imported');
            loadBatchData(); 
            loadImportedData();
            alert('挖掘过程已完成！');
        }
    });

    document.getElementById('clear-batch').addEventListener('click', () => clearData('batch'));
    document.getElementById('clear-imported').addEventListener('click', () => clearData('imported'));
    document.getElementById('clear-manual').addEventListener('click', () => clearData('manual'));

    async function clearData(type) {
        let name = type === 'batch' ? 'TikTok 任务数据' : (type === 'imported' ? '导入的 URL' : '手动采集');
        let key = type === 'batch' ? 'batchCollectedCreators' : (type === 'imported' ? 'importedCreators' : 'creators');
        
        if(confirm(`确定要清空 ${name} 数据吗？`)) {
            await chrome.storage.local.set({ [key]: [] });
            if (type === 'batch') loadBatchData();
            else if (type === 'imported') loadImportedData();
            else loadManualData();
        }
    }


    document.getElementById('export-batch').addEventListener('click', async () => {
        const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
        if(!batchCollectedCreators || batchCollectedCreators.length === 0) return alert('没有可导出的数据');
        
        // CSV Headers
        const headers = ['Nickname', 'UniqueId', 'FollowerCount', 'Signature', 'ProfileURL', 'AvatarURL', 'Platform', 'Timestamp', 'Email', 'ShareLinks', 'ID', 'SecUid', 'DeepScraped'];
        const rows = batchCollectedCreators.map(c => [
            escapeCsv(c.nickname),
            escapeCsv(c.uniqueId),
            c.followerCount,
            escapeCsv(c.signature),
            `https://www.tiktok.com/@${c.uniqueId}`,
            escapeCsv(c.avatar),
            c.platform,
            new Date(c.timestamp).toLocaleString(),
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
        if(!creators || creators.length === 0) return alert('没有可导出的数据');
        
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
                return alert('Excel 库未加载。请刷新页面或检查网络连接。');
            }

            const { creators } = await chrome.storage.local.get('creators');
            if(!creators || creators.length === 0) return alert('没有可导出的数据');
            
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
            alert('导出失败: ' + error.message);
        }
    });

    document.getElementById('export-imported').addEventListener('click', async () => {
        const { importedCreators } = await chrome.storage.local.get('importedCreators');
        if(!importedCreators || importedCreators.length === 0) return alert('没有可导出的数据');
        
        // CSV Headers
        const headers = ['Nickname', 'UniqueId', 'FollowerCount', 'Signature', 'ProfileURL', 'AvatarURL', 'Platform', 'Timestamp', 'Email', 'ShareLinks', 'ID', 'SecUid', 'DeepScraped'];
        const rows = importedCreators.map(c => [
            escapeCsv(c.nickname),
            escapeCsv(c.uniqueId),
            c.followerCount,
            escapeCsv(c.signature),
            `https://www.tiktok.com/@${c.uniqueId}`,
            escapeCsv(c.avatar),
            c.platform,
            new Date(c.timestamp).toLocaleString(),
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
                return alert('Excel 库未加载。请刷新页面或检查网络连接。');
            }

            const { importedCreators } = await chrome.storage.local.get('importedCreators');
            if(!importedCreators || importedCreators.length === 0) return alert('没有可导出的数据');
            
            const data = importedCreators.map(c => ({
                'Nickname': c.nickname,
                'UniqueId': c.uniqueId,
                'FollowerCount': c.followerCount,
                'Signature': c.signature,
                'ProfileURL': `https://www.tiktok.com/@${c.uniqueId}`,
                'AvatarURL': c.avatar,
                'Platform': c.platform,
                'Timestamp': new Date(c.timestamp).toLocaleString(),
                'Email': c.email || '',
                'ShareLinks': c.shareLinks ? c.shareLinks.join('; ') : '',
                'ID': c.id,
                'SecUid': c.secUid || '',
                'DeepScraped': c.deepScraped ? 'Yes' : 'No'
            }));
            
            downloadXlsx(data, 'imported_urls_export.xlsx');
        } catch (error) {
            console.error('Export Excel Error:', error);
            alert('导出失败: ' + error.message);
        }
    });

    document.getElementById('export-batch-xlsx').addEventListener('click', async () => {
        try {
            if (typeof XLSX === 'undefined') {
                return alert('Excel 库未加载。请刷新页面或检查网络连接。');
            }

            const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
            if(!batchCollectedCreators || batchCollectedCreators.length === 0) return alert('没有可导出的数据');
            
            const data = batchCollectedCreators.map(c => ({
                'Nickname': c.nickname,
                'UniqueId': c.uniqueId,
                'FollowerCount': c.followerCount,
                'Signature': c.signature,
                'ProfileURL': `https://www.tiktok.com/@${c.uniqueId}`,
                'AvatarURL': c.avatar,
                'Platform': c.platform,
                'Timestamp': new Date(c.timestamp).toLocaleString(),
                'Email': c.email || '',
                'ShareLinks': c.shareLinks ? c.shareLinks.join('; ') : '',
                'ID': c.id,
                'SecUid': c.secUid || '',
                'DeepScraped': c.deepScraped ? 'Yes' : 'No'
            }));
            
            downloadXlsx(data, 'tiktok_batch_export.xlsx');
        } catch (error) {
            console.error('Export Excel Error:', error);
            alert('导出失败: ' + error.message);
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
            return alert('请输入至少一个 URL。');
        }

        const urls = rawText.split(/[\n\s]+/).filter(u => u.trim() !== '');
        const newItems = [];
        
        // Regex to extract username from https://www.tiktok.com/@username
        const regex = /(?:tiktok\.com\/@|@)([\w\.]+)/;

        for (const url of urls) {
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
            return alert('未找到有效的 TikTok 个人资料 URL。');
        }

        // Save to storage
        const { importedCreators } = await chrome.storage.local.get('importedCreators');
        let currentItems = importedCreators || [];
        
        // Filter duplicates (check against uniqueId within imported list only)
        const existingIds = new Set(currentItems.map(i => i.uniqueId.toLowerCase()));
        const uniqueNewItems = newItems.filter(i => !existingIds.has(i.uniqueId.toLowerCase()));

        if (uniqueNewItems.length === 0) {
            importModal.style.display = 'none';
            return alert('所有导入的个人资料已存在于列表中。');
        }

        // Add to list
        currentItems = [...currentItems, ...uniqueNewItems];
        await chrome.storage.local.set({ importedCreators: currentItems });
        
        loadImportedData();
        importModal.style.display = 'none';
        alert(`成功导入 ${uniqueNewItems.length} 个新个人资料。\n跳过重复项: ${newItems.length - uniqueNewItems.length}`);
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
        if (serverUrl) serverUrlInput.value = serverUrl;
        settingsModal.style.display = 'block';
    });

    document.getElementById('cancel-settings').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    document.getElementById('save-settings').addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const url = serverUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
        
        if (!apiKey) return alert('请输入 API Key。');
        if (!url) return alert('请输入服务器地址 URL。');

        await chrome.storage.local.set({ serverApiKey: apiKey, serverUrl: url });
        alert('设置已保存！');
        settingsModal.style.display = 'none';
    });

    // Push Data Logic
    document.getElementById('push-batch').addEventListener('click', () => pushData('batch'));
    document.getElementById('push-imported').addEventListener('click', () => pushData('imported'));

    async function pushData(type) {
        const { serverApiKey, serverUrl } = await chrome.storage.local.get(['serverApiKey', 'serverUrl']);
        if (!serverApiKey || !serverUrl) {
            return alert('请先在设置中配置 API Key 和服务器地址。');
        }

        const storageKey = type === 'batch' ? 'batchCollectedCreators' : 'importedCreators';
        const { [storageKey]: items } = await chrome.storage.local.get(storageKey);

        if (!items || items.length === 0) {
            return alert('没有可推送的数据。');
        }

        const btn = document.getElementById(`push-${type}`);
        const originalText = btn.textContent;
        btn.textContent = '推送中...';
        btn.disabled = true;

        try {
            // Transform data to match API schema
            // API expects: { platform, unique_id, data }
            const payload = items.map(item => ({
                platform: item.platform || 'TikTok',
                unique_id: item.uniqueId || item.id, // Fallback if uniqueId missing
                data: item
            }));

            const response = await fetch(`${serverUrl}/creators/push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': serverApiKey
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                alert(`成功推送 ${result.length} 个创作者到服务器！`);
            } else {
                const error = await response.text();
                alert(`推送失败: ${response.status} ${response.statusText}\n${error}`);
            }
        } catch (err) {
            console.error('Push error:', err);
            alert(`推送失败: ${err.message}`);
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
        
        if (confirm(`确定要删除这 ${checkboxes.length} 项吗？`)) {
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

async function loadImportedData() {
    const { importedCreators } = await chrome.storage.local.get('importedCreators');
    const tbody = document.querySelector('#imported-table tbody');
    const emptyState = document.getElementById('imported-empty');
    const badge = document.getElementById('imported-badge');
    
    tbody.innerHTML = '';
    
    const data = importedCreators || [];
    if (badge) badge.textContent = data.length;
    
    if (data.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // Sort by timestamp desc
    data.sort((a, b) => b.timestamp - a.timestamp);
    
    data.forEach(item => {
        const tr = document.createElement('tr');
        const idStr = String(item.id);
        
        const profileUrl = `https://www.tiktok.com/@${item.uniqueId}`;
        const email = item.email || '-';
        const links = item.shareLinks ? item.shareLinks.join(', ') : '-';
        const statusIcon = item.deepScraped ? '✅' : '';

        tr.innerHTML = `
            <td><input type="checkbox" class="imported-checkbox" data-id="${idStr}"></td>
            <td><img src="${item.avatar}" class="avatar-img" onerror="this.src='icons/icon16.png'"></td>
            <td>${escapeHtml(item.nickname)} ${statusIcon}</td>
            <td class="link-cell"><a href="${profileUrl}" target="_blank">@${escapeHtml(item.uniqueId)}</a></td>
            <td>${item.followerCount}</td>
            <td>${escapeHtml(email)}</td>
            <td><div style="max-width: 150px; overflow:hidden; text-overflow:ellipsis; white-space: nowrap;" title="${escapeHtml(links)}">${escapeHtml(links)}</div></td>
            <td title="${escapeHtml(item.signature)}">${truncate(item.signature, 50)}</td>
            <td>${item.platform}</td>
            <td style="font-size: 12px; color: #888;">${new Date(item.timestamp).toLocaleTimeString()}</td>
            <td><button class="btn-danger btn-sm delete-single" data-type="imported" data-id="${idStr}">删除</button></td>
        `;
        tbody.appendChild(tr);
    });
    
    attachCheckboxListeners('imported');
}

async function loadBatchData() {
    const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
    const tbody = document.querySelector('#batch-table tbody');
    const emptyState = document.getElementById('batch-empty');
    const badge = document.getElementById('batch-badge');
    
    tbody.innerHTML = '';
    
    const data = batchCollectedCreators || [];
    badge.textContent = data.length;
    
    if (data.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // Sort by timestamp desc
    data.sort((a, b) => b.timestamp - a.timestamp);
    
    data.forEach(item => {
        const tr = document.createElement('tr');
        const idStr = String(item.id);
        
        const profileUrl = `https://www.tiktok.com/@${item.uniqueId}`;
        const email = item.email || '-';
        const links = item.shareLinks ? item.shareLinks.join(', ') : '-';
        const statusIcon = item.deepScraped ? '✅' : '';

        tr.innerHTML = `
            <td><input type="checkbox" class="batch-checkbox" data-id="${idStr}"></td>
            <td><img src="${item.avatar}" class="avatar-img" onerror="this.src='icons/icon16.png'"></td>
            <td>${escapeHtml(item.nickname)} ${statusIcon}</td>
            <td class="link-cell"><a href="${profileUrl}" target="_blank">@${escapeHtml(item.uniqueId)}</a></td>
            <td>${item.followerCount}</td>
            <td>${escapeHtml(email)}</td>
            <td><div style="max-width: 150px; overflow:hidden; text-overflow:ellipsis; white-space: nowrap;" title="${escapeHtml(links)}">${escapeHtml(links)}</div></td>
            <td title="${escapeHtml(item.signature)}">${truncate(item.signature, 50)}</td>
            <td>${item.platform}</td>
            <td style="font-size: 12px; color: #888;">${new Date(item.timestamp).toLocaleTimeString()}</td>
            <td><button class="btn-danger btn-sm delete-single" data-type="batch" data-id="${idStr}">删除</button></td>
        `;
        tbody.appendChild(tr);
    });
    
    attachCheckboxListeners('batch');
}

async function loadManualData() {
    const { creators } = await chrome.storage.local.get('creators');
    const tbody = document.querySelector('#manual-table tbody');
    const emptyState = document.getElementById('manual-empty');
    const badge = document.getElementById('manual-badge');
    
    tbody.innerHTML = '';
    
    const data = creators || [];
    badge.textContent = data.length;
    
    if (data.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // Sort by timestamp desc
    data.sort((a, b) => b.timestamp - a.timestamp);
    
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
            if(confirm('确定删除此项吗？')) {
                const id = e.target.dataset.id;
                await deleteItems(type, [id]);
            }
        });
    });
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
