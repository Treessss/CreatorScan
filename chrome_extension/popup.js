function csEnsureUi() {
    if (document.getElementById('cs-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'cs-ui-style';
    style.textContent = `
    .cs-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 14px;border-radius:10px;font-size:12px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.3);}
    .cs-mask{position:fixed;inset:0;background:rgba(2,6,23,.45);display:flex;align-items:center;justify-content:center;z-index:99998;}
    .cs-dialog{width:320px;background:#fff;border-radius:12px;padding:14px;box-shadow:0 16px 40px rgba(0,0,0,.28);}
    .cs-title{font-weight:700;font-size:14px;color:#111827;margin-bottom:6px;}
    .cs-msg{font-size:12px;color:#4b5563;line-height:1.5;}
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
    setTimeout(() => el.remove(), 2200);
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

document.addEventListener('DOMContentLoaded', async () => {
    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const views = {
        'tasks': document.getElementById('view-tasks'),
        'manual': document.getElementById('view-manual'),
        'create': document.getElementById('view-create'),
        'data': document.getElementById('view-data')
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            // Update view
            const target = item.dataset.tab;
            Object.values(views).forEach(v => v.classList.add('hidden'));
            views[target].classList.remove('hidden');

            if (target === 'tasks') renderTasks();
            if (target === 'manual') updateManualRecordingStatus();
            if (target === 'data') updateStats();
        });
    });

    // Listen for updates from background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'tasksUpdated') {
            // Only re-render if we are on the tasks tab
            if (!document.getElementById('view-tasks').classList.contains('hidden')) {
                renderTasks();
            }
        } else if (request.action === 'statsUpdated') {
            // Update stats if we are on data tab
            if (!document.getElementById('view-data').classList.contains('hidden')) {
                updateStats();
            }
            if (!document.getElementById('view-manual').classList.contains('hidden')) {
                updateManualRecordingStatus();
            }
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (changes.creators || changes.batchCollectedCreators) {
            if (!document.getElementById('view-data').classList.contains('hidden')) {
                updateStats();
            }
        }
        if (changes.isRecording || changes.creators) {
            updateManualRecordingStatus();
        }
    });

    // --- Language Selector Logic ---
    const LANGUAGE_MAP = {
        'en': '英语 (English)',
        'zh': '中文 (Chinese)',
        'es': '西班牙语 (Spanish)',
        'fr': '法语 (French)',
        'de': '德语 (German)',
        'it': '意大利语 (Italian)',
        'pt': '葡萄牙语 (Portuguese)',
        'ru': '俄语 (Russian)',
        'ja': '日语 (Japanese)',
        'ko': '韩语 (Korean)',
        'ar': '阿拉伯语 (Arabic)',
        'hi': '印地语 (Hindi)',
        'tr': '土耳其语 (Turkish)',
        'vi': '越南语 (Vietnamese)',
        'th': '泰语 (Thai)',
        'id': '印尼语 (Indonesian)',
        'nl': '荷兰语 (Dutch)',
        'sv': '瑞典语 (Swedish)',
        'pl': '波兰语 (Polish)',
        'cs': '捷克语 (Czech)',
        'ro': '罗马尼亚语 (Romanian)',
        'hu': '匈牙利语 (Hungarian)',
        'el': '希腊语 (Greek)',
        'da': '丹麦语 (Danish)',
        'fi': '芬兰语 (Finnish)',
        'no': '挪威语 (Norwegian)',
        'he': '希伯来语 (Hebrew)',
        'uk': '乌克兰语 (Ukrainian)',
        'ms': '马来语 (Malay)',
        'tl': '他加禄语 (Tagalog)'
    };

    const langTrigger = document.getElementById('lang-trigger');
    const langOptions = document.getElementById('lang-options');
    const platformTrigger = document.getElementById('platform-trigger');
    const platformOptions = document.getElementById('platform-options');
    let selectedLanguages = [];
    let selectedPlatform = 'tiktok';

    function platformLabel(value) {
        if (value === 'instagram') return 'Instagram';
        if (value === 'youtube') return 'YouTube';
        return 'TikTok';
    }

    // Initialize Options
    Object.entries(LANGUAGE_MAP).forEach(([code, name]) => {
        const div = document.createElement('div');
        div.className = 'select-option';
        div.innerHTML = `
            <input type="checkbox" value="${code}">
            <span>${name}</span>
        `;
        div.addEventListener('click', (e) => {
            // Toggle checkbox if clicked on div (but not if clicked directly on checkbox to avoid double toggle)
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                updateSelectedLanguages();
            } else {
                updateSelectedLanguages();
            }
        });
        langOptions.appendChild(div);
    });

    // Toggle Dropdown
    langTrigger.addEventListener('click', () => {
        langOptions.classList.toggle('show');
    });

    platformTrigger.addEventListener('click', () => {
        platformOptions.classList.toggle('show');
    });

    platformOptions.querySelectorAll('.select-option').forEach((optionEl) => {
        optionEl.addEventListener('click', () => {
            selectedPlatform = optionEl.dataset.value || 'tiktok';
            platformTrigger.textContent = platformLabel(selectedPlatform);
            platformOptions.classList.remove('show');
            platformOptions.querySelectorAll('.select-option').forEach((el) => el.classList.remove('selected'));
            optionEl.classList.add('selected');
        });
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#language-selector')) {
            langOptions.classList.remove('show');
        }
        if (!e.target.closest('#platform-selector')) {
            platformOptions.classList.remove('show');
        }
    });

    function updateSelectedLanguages() {
        const checkboxes = langOptions.querySelectorAll('input:checked');
        selectedLanguages = Array.from(checkboxes).map(cb => cb.value);
        
        if (selectedLanguages.length === 0) {
            langTrigger.textContent = '不限 (点击选择)';
        } else {
            langTrigger.textContent = `已选 ${selectedLanguages.length} 项`;
        }
    }

    // --- Task Management ---
    const btnCreateTask = document.getElementById('btn-create-task');
    const taskListEl = document.getElementById('task-list');
    const emptyTasksEl = document.getElementById('empty-tasks');

    btnCreateTask.addEventListener('click', async () => {
        const platform = selectedPlatform;
        const keywordsText = document.getElementById('keywords').value;
        const concurrency = parseInt(document.getElementById('concurrency').value) || 1;
        const pageLimit = parseInt(document.getElementById('pageLimit').value) || 10;
        const minFollowers = parseInt(document.getElementById('minFollowers').value) || 0;
        const maxFollowers = parseInt(document.getElementById('maxFollowers').value) || 999999999;
        // const language = document.getElementById('language').value.trim(); // Old input
        const languages = selectedLanguages; // New array

        const keywords = keywordsText.split('\n').map(k => k.trim()).filter(k => k);

        if (keywords.length === 0) {
            csAlert('请输入至少一个关键词');
            return;
        }

        const newTask = {
            id: Date.now().toString(),
            platform,
            keywords: keywords.map(k => ({ word: k, status: 'pending', collected: 0, pageCount: 0 })),
            config: {
                concurrency,
                pageLimit,
                minFollowers,
                maxFollowers,
                languages // Store array
            },
            status: 'pending', // pending, running, completed, paused
            createdAt: Date.now(),
            progress: {
                total: keywords.length,
                completed: 0
            }
        };

        const { tasks = [] } = await chrome.storage.local.get('tasks');
        tasks.unshift(newTask);
        await chrome.storage.local.set({ tasks });

        // Switch to list view
        navItems[0].click();
        
        // Notify background to check queue
        chrome.runtime.sendMessage({ action: 'checkTaskQueue' });
        
        // Reset form
        document.getElementById('keywords').value = '';
        // Reset languages
        selectedLanguages = [];
        updateSelectedLanguages();
        langOptions.querySelectorAll('input').forEach(cb => cb.checked = false);
        langTrigger.textContent = '不限 (点击选择)';
    });

    async function renderTasks() {
        const { tasks = [] } = await chrome.storage.local.get('tasks');
        
        taskListEl.innerHTML = '';
        
        if (tasks.length === 0) {
            emptyTasksEl.classList.remove('hidden');
            return;
        } else {
            emptyTasksEl.classList.add('hidden');
        }

        tasks.forEach(task => {
                const el = document.createElement('div');
                el.className = 'task-card';
                
                let statusClass = 'status-pending';
                let statusText = '等待中';
                if (task.status === 'running') {
                    statusClass = 'status-running';
                    statusText = '进行中';
                } else if (task.status === 'completed') {
                    statusClass = 'status-completed';
                    statusText = '已完成';
                }

                const progressPercent = Math.round((task.progress.completed / task.progress.total) * 100);

                // Build details HTML
                const runningKw = task.keywords.filter(k => k.status === 'running');
                
                let detailsHtml = '';
                if (runningKw.length > 0) {
                    detailsHtml += `<div style="margin-bottom:4px; font-weight:500; color:#FF0050;">正在运行:</div>`;
                    runningKw.forEach(k => {
                        // Ensure pageCount is displayed, default to 0 if undefined
                        const pCount = (k.pageCount !== undefined) ? k.pageCount : 0;
                        detailsHtml += `<div style="font-size:12px; margin-bottom:2px; padding-left:8px; border-left: 2px solid #FF0050;">
                            ${k.word} <span style="color:#666;">- 第 ${pCount}/${task.config.pageLimit} 页, 已采集 ${k.collected || 0}</span>
                        </div>`;
                    });
                } else {
                     detailsHtml += `<div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                        关键词: ${task.keywords.map(k => k.word).slice(0, 3).join(', ')}${task.keywords.length > 3 ? '...' : ''}
                    </div>`;
                }

                el.innerHTML = `
                    <div class="task-header">
                        <div>
                            <div class="task-title">
                                <span class="platform-icon">${getPlatformEmoji(task.platform)}</span>
                                ${task.keywords.length} 个关键词任务
                            </div>
                            <div class="task-meta">
                                ${new Date(task.createdAt).toLocaleString()} · 并发 ${task.config.concurrency} · 翻页 ${task.config.pageLimit}
                            </div>
                        </div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    
                    ${detailsHtml}

                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 12px;">
                        <div style="font-size: 12px; color: #999;">总进度: ${task.progress.completed}/${task.progress.total} 词完成</div>
                        <div style="display: flex; gap: 8px;">
                            ${task.status === 'running' 
                                ? `<button class="btn-stop-task" data-id="${task.id}" style="border:none; background:none; color: #FF0050; cursor: pointer; font-size: 12px; font-weight: bold;">停止</button>`
                                : `<button class="btn-delete-task" data-id="${task.id}" style="border:none; background:none; color: #999; cursor: pointer; font-size: 12px;">删除</button>`
                            }
                        </div>
                    </div>
                `;
                taskListEl.appendChild(el);
            });

        // Add event listeners for buttons
        document.querySelectorAll('.btn-delete-task').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                if (await csConfirm('确定删除此任务吗？')) {
                    const { tasks } = await chrome.storage.local.get('tasks');
                    const newTasks = tasks.filter(t => t.id !== id);
                    await chrome.storage.local.set({ tasks: newTasks });
                    renderTasks();
                }
            });
        });

        document.querySelectorAll('.btn-stop-task').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                // Send to background to handle cleanup
                chrome.runtime.sendMessage({ action: 'stopTask', taskId: id });
                // Optimistic update not needed as background will trigger update
            });
        });
    }

    function getPlatformEmoji(p) {
        if (p === 'tiktok') return '🎵';
        if (p === 'youtube') return '▶️';
        if (p === 'instagram') return '📷';
        return '🌐';
    }

    // --- Data & Stats ---
    const btnOpenDashboard = document.getElementById('btn-open-dashboard');
    const btnOpenDashboardManual = document.getElementById('btn-open-dashboard-manual');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnClearData = document.getElementById('btn-clear-data');
    const totalProfilesEl = document.getElementById('total-profiles');
    const todayProfilesEl = document.getElementById('today-profiles');
    const btnToggleRecording = document.getElementById('btn-toggle-recording');
    const manualStatusBadgeEl = document.getElementById('manual-status-badge');
    const manualStatusTextEl = document.getElementById('manual-status-text');
    const manualTotalCountEl = document.getElementById('manual-total-count');

    btnOpenDashboard.addEventListener('click', () => {
        chrome.tabs.create({ url: 'results.html' });
    });

    btnOpenDashboardManual.addEventListener('click', () => {
        chrome.tabs.create({ url: 'results.html' });
    });

    btnToggleRecording.addEventListener('click', async () => {
        const { isRecording = false } = await chrome.storage.local.get('isRecording');
        const next = !isRecording;
        await chrome.storage.local.set({ isRecording: next });
        await updateManualRecordingStatus();
        csAlert(next ? '手动采集已开启，请在主页点击悬浮“采集”按钮。' : '手动采集已关闭。');
    });

    btnExportCsv.addEventListener('click', async () => {
        const { creators } = await chrome.storage.local.get('creators');
        const { batchCollectedCreators } = await chrome.storage.local.get('batchCollectedCreators');
        
        const allData = [...(creators || []), ...(batchCollectedCreators || [])];
        if (allData.length === 0) {
            csAlert('暂无数据可导出');
            return;
        }
        
        const csvContent = convertToCSV(allData);
        downloadCSV(csvContent);
    });

    btnClearData.addEventListener('click', async () => {
        if (await csConfirm('确定清空所有采集数据吗？')) {
            await chrome.storage.local.set({ creators: [], batchCollectedCreators: [] });
            updateStats();
            csAlert('数据已清空');
        }
    });

    async function updateStats() {
        const { creators, batchCollectedCreators } = await chrome.storage.local.get(['creators', 'batchCollectedCreators']);
        const all = [...(creators || []), ...(batchCollectedCreators || [])];
        
        totalProfilesEl.textContent = all.length;
        
        // Calculate today's
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const todayCount = all.filter(c => c.timestamp >= startOfDay.getTime()).length;
        todayProfilesEl.textContent = todayCount;
    }

    async function updateManualRecordingStatus() {
        const { isRecording = false, creators = [] } = await chrome.storage.local.get(['isRecording', 'creators']);
        manualTotalCountEl.textContent = Array.isArray(creators) ? creators.length : 0;

        if (isRecording) {
            manualStatusBadgeEl.classList.remove('status-pending');
            manualStatusBadgeEl.classList.add('status-running');
            manualStatusBadgeEl.textContent = '已开启';
            manualStatusTextEl.textContent = '已开启手动采集：在 TikTok / Instagram / YouTube 红人主页右下角点击“采集”悬浮按钮即可入库。';
            btnToggleRecording.textContent = '关闭手动采集';
            btnToggleRecording.style.backgroundColor = '#D60043';
        } else {
            manualStatusBadgeEl.classList.remove('status-running');
            manualStatusBadgeEl.classList.add('status-pending');
            manualStatusBadgeEl.textContent = '已关闭';
            manualStatusTextEl.textContent = '开启后，在 TikTok / Instagram / YouTube 页面右下角会显示“采集”悬浮按钮。';
            btnToggleRecording.textContent = '开启手动采集';
            btnToggleRecording.style.backgroundColor = '';
        }
    }

    // Helper functions (reused from old popup.js)
    function convertToCSV(data) {
        let maxLinks = 0;
        data.forEach(item => {
            if (item.shareLinks && item.shareLinks.length > maxLinks) maxLinks = item.shareLinks.length;
        });

        const headers = ['Platform', 'Profile URL', 'Followers', 'Email', 'Nickname', 'Signature'];
        for (let i = 1; i <= maxLinks; i++) headers.push(`Share Link ${i}`);
        headers.push('Captured At');

        const rows = data.map(item => {
            const row = [
                `"${item.platform || 'TikTok'}"`,
                `"${item.url}"`,
                `"${item.followers || item.followerCount || ''}"`,
                `"${item.email || ''}"`,
                `"${(item.nickname || '').replace(/"/g, '""')}"`,
                `"${(item.signature || '').replace(/"/g, '""')}"`
            ];

            const links = item.shareLinks || [];
            for (let i = 0; i < maxLinks; i++) {
                row.push(`"${links[i] || ''}"`);
            }

            row.push(`"${new Date(item.timestamp).toLocaleString()}"`);
            return row;
        });

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    function downloadCSV(content) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `creator_scan_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Initial render
    renderTasks();
    updateStats();
    updateManualRecordingStatus();
});
