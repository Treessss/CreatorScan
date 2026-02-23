
import React, { useState, useEffect } from 'react';
import { smtpService, emailService, templateService, creatorService } from '../services/api';
import { SmtpConfig, EmailTemplate, EmailLog, Influencer } from '../types';
import { useFeedback } from '../components/FeedbackProvider';
import CustomSelect from '../components/CustomSelect';
import CustomMultiSelect from '../components/CustomMultiSelect';

type MarketingTab = 'compose' | 'history' | 'templates';

const EmailMarketing: React.FC = () => {
  const { notify, confirm } = useFeedback();
  const [activeTab, setActiveTab] = useState<MarketingTab>('compose');

  // State for Compose
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [selectedSmtpIds, setSelectedSmtpIds] = useState<number[]>([]);
  const [subject, setSubject] = useState("为 {InfluencerName} 准备的精彩合作机会");
  const [body, setBody] = useState(`你好 {InfluencerName}, 我一直在关注你在 {Platform} 上发布的近期内容...`);
  const [sending, setSending] = useState(false);
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<number[]>([]);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [creators, setCreators] = useState<Influencer[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);

  // State for Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ title: '', subject: '', body: '' });

  // State for Logs
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  useEffect(() => {
    loadSmtpConfigs();
    loadTemplates();
    loadLogs();

    // Poll logs every 10 seconds for real-time status
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadSmtpConfigs = async () => {
    try {
      const data = await smtpService.getAll();
      setSmtpConfigs(data);
      // Auto select default or first
      const defaultCfg = data.find(c => c.is_default);
      if (defaultCfg) setSelectedSmtpIds([defaultCfg.id]);
      else if (data.length > 0) setSelectedSmtpIds([data[0].id]);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await templateService.getAll();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await emailService.getLogs(0, 100);
      setEmailLogs(data.items || []);
    } catch (err) {
      console.error('Failed to load logs', err);
    }
  };

  const loadCreators = async () => {
    setCreatorsLoading(true);
    try {
      // Fetch creators with email
      const data = await creatorService.getAll(0, 1000, undefined, true);
      setCreators(data.items || data); // Adjust based on actual API response structure
    } catch (err) {
      console.error('Failed to load creators', err);
    } finally {
      setCreatorsLoading(false);
    }
  };

  const handleOpenRecipientModal = () => {
    loadCreators();
    setShowRecipientModal(true);
  };

  const handleToggleCreator = (id: string) => {
    const numId = Number(id);
    setSelectedCreatorIds(prev =>
      prev.includes(numId)
        ? prev.filter(cid => cid !== numId)
        : [...prev, numId]
    );
  };

  const handleSelectAllCreators = () => {
    if (selectedCreatorIds.length === creators.length) {
      setSelectedCreatorIds([]);
    } else {
      setSelectedCreatorIds(creators.map(c => Number(c.id)));
    }
  };

  const handleStartTask = async () => {
    if (selectedSmtpIds.length === 0) {
      notify('请先选择一个发送邮箱配置。', 'warning');
      return;
    }

    if (selectedCreatorIds.length === 0) {
      notify('请至少选择一个收件人。', 'warning');
      return;
    }

    if (activeTab !== 'compose') {
        setActiveTab('compose'); // Switch to compose view to see progress
    }

    const ok = await confirm({
      title: '确认发送邮件',
      message: `确定要向选中的 ${selectedCreatorIds.length} 位红人发送邮件吗？`,
      confirmText: '确认发送',
      cancelText: '取消',
      type: 'warning',
    });
    if (!ok) return;

    setSending(true);
    try {
      await emailService.send({
        creator_ids: selectedCreatorIds,
        subject,
        body,
        smtp_config_ids: selectedSmtpIds
      });
      notify('任务已提交后台队列！', 'success');
      loadLogs(); // Refresh logs immediately
      setSelectedCreatorIds([]); // Clear selection
    } catch (err: any) {
      notify('启动任务失败: ' + err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  // Template Handlers
  const handleEditTemplate = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl);
    setTemplateForm({ title: tpl.title, subject: tpl.subject, body: tpl.body });
    setShowTemplateModal(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ title: '', subject: '', body: '' });
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        await templateService.update(editingTemplate.id, templateForm);
      } else {
        await templateService.create(templateForm);
      }
      setShowTemplateModal(false);
      loadTemplates();
    } catch (err: any) {
      notify('保存模板失败: ' + err.message, 'error');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    const ok = await confirm({
      title: '删除模板',
      message: '确定要删除这个模板吗？',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await templateService.delete(id);
      loadTemplates();
      notify('模板已删除', 'success');
    } catch (err: any) {
      notify('删除失败: ' + err.message, 'error');
    }
  };

  const handleUseTemplate = (tpl: EmailTemplate) => {
    setSubject(tpl.subject);
    setBody(tpl.body);
    setActiveTab('compose');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'history':
        return (
          <div className="bg-white dark:bg-slate-900 border border-[#e7edf3] dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800">
               <h3 className="font-bold text-slate-800 dark:text-white">发送记录</h3>
             </div>
             <table className="w-full text-left">
               <thead className="bg-slate-50 dark:bg-slate-800/50">
                 <tr>
                   <th className="px-6 py-4 text-xs font-bold text-[#4c739a] uppercase">收件人</th>
                   <th className="px-6 py-4 text-xs font-bold text-[#4c739a] uppercase">主题</th>
                   <th className="px-6 py-4 text-xs font-bold text-[#4c739a] uppercase">发送时间</th>
                   <th className="px-6 py-4 text-xs font-bold text-[#4c739a] uppercase">回复状态</th>
                   <th className="px-6 py-4 text-xs font-bold text-[#4c739a] uppercase text-right">状态</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                 {emailLogs.length === 0 ? (
                   <tr>
                     <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                       暂无发送记录
                     </td>
                   </tr>
                 ) : (
                   emailLogs.map((log) => (
                     <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                       <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">
                         {log.recipient_name || log.recipient_email || `ID: ${log.recipient_id}`}
                       </td>
                       <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">{log.subject}</td>
                       <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                         {new Date(log.sent_at).toLocaleString()}
                       </td>
                       <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                         {log.replied ? (
                           <span className="text-green-600 flex items-center gap-1">
                             <span className="material-symbols-outlined text-[16px]">reply</span> 已回复
                           </span>
                         ) : (
                           <span className="text-slate-400">未回复</span>
                         )}
                       </td>
                       <td className="px-6 py-4 text-right">
                         <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                           log.status === 'sent'
                             ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                             : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                         }`}>
                           {log.status === 'sent' ? '已发送' : '失败'}
                         </span>
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
          </div>
        );
      case 'templates':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((tpl) => (
              <div key={tpl.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:shadow-md transition-shadow cursor-pointer group relative">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleEditTemplate(tpl); }} className="text-slate-400 hover:text-primary">
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }} className="text-slate-400 hover:text-red-500">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
                <div className="size-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{tpl.title}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4">{tpl.subject}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleUseTemplate(tpl)} className="text-xs font-bold text-primary hover:underline">使用此模板</button>
                </div>
              </div>
            ))}

            <div
                onClick={handleCreateTemplate}
                className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center p-6 text-slate-400 hover:border-primary hover:text-primary transition-colors cursor-pointer min-h-[200px]"
            >
              <span className="material-symbols-outlined !text-4xl mb-2">add_circle</span>
              <span className="text-sm font-bold">创建新模板</span>
            </div>
          </div>
        );
      case 'compose':
      default:
        return (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-5 space-y-6">
              <div className="flex items-center gap-2"><h2 className="text-[#0d141b] dark:text-white text-lg font-bold">1. 配置与内容</h2></div>
              <div className="p-5 flex flex-col items-stretch justify-start rounded-xl shadow-sm bg-white dark:bg-slate-900 border border-[#e7edf3] dark:border-slate-800">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                     <span className="material-symbols-outlined text-primary">dns</span>
                     <label className="text-base font-bold text-[#0d141b] dark:text-white">发送账号设置</label>
                  </div>

                  {smtpConfigs.length > 0 ? (
                      <CustomMultiSelect
                        values={selectedSmtpIds.map(String)}
                        onChange={(vals) => setSelectedSmtpIds(vals.map((v) => Number(v)))}
                        options={smtpConfigs.map((config) => ({
                          value: String(config.id),
                          label: `${config.sender_name || config.username} (${config.username})${config.is_default ? ' (默认)' : ''}`,
                        }))}
                        placeholder="选择发件账号"
                      />
                  ) : (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-sm rounded-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">warning</span>
                        未检测到 SMTP 配置，请前往设置页面添加。
                      </div>
                  )}

                  {selectedSmtpIds.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        <span>已选择 {selectedSmtpIds.length} 个发件账号（轮询发送）</span>
                      </div>
                  )}
                </div>
                <button onClick={loadSmtpConfigs} className="w-full flex items-center justify-center rounded-lg h-9 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors">
                    刷新配置列表
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#e7edf3] dark:border-slate-800 p-5 space-y-4">
                <div>
                   <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-semibold text-[#0d141b] dark:text-white">收件人</label>
                      <button
                        onClick={handleOpenRecipientModal}
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        选择收件人 ({selectedCreatorIds.length})
                      </button>
                   </div>
                   {selectedCreatorIds.length > 0 ? (
                       <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300">
                           已选择 {selectedCreatorIds.length} 位红人作为收件人。
                       </div>
                   ) : (
                       <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-400 italic">
                           请选择收件人...
                       </div>
                   )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#0d141b] dark:text-white mb-2">邮件模板</label>
                  <CustomSelect
                    value=""
                    onChange={(val) => {
                      const tplId = Number(val);
                      if (tplId) {
                        const tpl = templates.find(t => t.id === tplId);
                        if (tpl) handleUseTemplate(tpl);
                      }
                    }}
                    placeholder="选择模板以快速填充..."
                    options={[
                      ...templates.map((tpl) => ({ value: String(tpl.id), label: tpl.title })),
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0d141b] dark:text-white mb-2">邮件主题</label>
                  <input
                    className="w-full rounded-lg border-[#e7edf3] dark:border-slate-700 bg-background-light dark:bg-slate-800 text-sm focus:ring-primary text-slate-700 dark:text-slate-300"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-semibold text-[#0d141b] dark:text-white">正文内容</label>
                    <div className="flex gap-2">
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded cursor-pointer hover:bg-primary/10 hover:text-primary">{'{姓名}'}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded cursor-pointer hover:bg-primary/10 hover:text-primary">{'{平台}'}</span>
                    </div>
                  </div>
                  <textarea
                    className="w-full rounded-lg border-[#e7edf3] dark:border-slate-700 bg-background-light dark:bg-slate-800 text-sm focus:ring-primary resize-none text-slate-700 dark:text-slate-300"
                    rows={8}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>
            <div className="xl:col-span-7 space-y-6">
              <div className="flex items-center gap-2"><h2 className="text-[#0d141b] dark:text-white text-lg font-bold">2. 实时送达状态</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-[#e7edf3] dark:border-slate-800 p-4 rounded-xl shadow-sm">
                  <p className="text-[#4c739a] text-xs font-medium uppercase mb-1">已发送总量</p>
                  <div className="flex items-baseline gap-2"><p className="text-2xl font-black text-[#0d141b] dark:text-white">{emailLogs.length}</p></div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3"><div className="bg-primary h-1.5 rounded-full" style={{ width: '100%' }}></div></div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-[#e7edf3] dark:border-slate-800 p-4 rounded-xl shadow-sm">
                    <p className="text-[#4c739a] text-xs font-medium uppercase mb-1">成功率</p>
                    <p className="text-2xl font-black text-green-600">
                        {emailLogs.length > 0
                            ? Math.round((emailLogs.filter(l => l.status === 'sent').length / emailLogs.length) * 100)
                            : 0}%
                    </p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-[#e7edf3] dark:border-slate-800 p-4 rounded-xl shadow-sm">
                    <p className="text-[#4c739a] text-xs font-medium uppercase mb-1">回复数</p>
                    <p className="text-2xl font-black text-blue-500">{emailLogs.filter(l => l.replied).length}</p>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-[#e7edf3] dark:border-slate-800 rounded-xl overflow-hidden shadow-sm h-[400px] flex flex-col">
                <div className="p-4 border-b border-[#e7edf3] dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center"><span className="text-sm font-bold">最新活动日志</span>
                {sending && <div className="flex items-center gap-2 text-primary"><div className="size-2 bg-primary rounded-full animate-pulse"></div><span className="text-[11px] font-bold">发送中...</span></div>}
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {emailLogs.slice(0, 10).map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded-full bg-slate-200" style={{ backgroundImage: `url('https://picsum.photos/40/40?random=${log.recipient_id}')`, backgroundSize: 'cover' }}></div>
                                        <div>
                                            <p className="text-sm font-bold leading-tight">{log.recipient_name || `Creator ${log.recipient_id}`}</p>
                                            <p className="text-xs text-[#4c739a]">{log.recipient_email || 'No Email'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`text-[10px] font-bold ${log.status === 'sent' ? 'text-green-600' : 'text-red-500'}`}>
                                        {log.status === 'sent' ? '已送达' : '失败'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-[#4c739a]">
                                    {new Date(log.sent_at).toLocaleTimeString()}
                                </td>
                            </tr>
                        ))}
                        {emailLogs.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">暂无日志数据</td>
                            </tr>
                        )}
                      </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 max-w-7xl mx-auto w-full relative">
      <div className="flex flex-wrap justify-between items-end gap-3 pb-6 border-b border-[#e7edf3] dark:border-slate-800 mb-6">
        <div className="flex min-w-72 flex-col gap-1">
          <p className="text-[#0d141b] dark:text-white text-3xl font-black tracking-tight">批量邮件营销</p>
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('compose')}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'compose' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              撰写与发送
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              活动历史
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'templates' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              模板库
            </button>
          </div>
        </div>
        <div className="flex gap-3 mb-2">
          <button
            onClick={handleStartTask}
            disabled={sending}
            className={`flex items-center justify-center rounded-lg h-10 px-6 bg-primary text-white text-sm font-bold shadow-sm hover:bg-primary/90 transition-all ${sending ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="material-symbols-outlined mr-2 text-[18px]">play_arrow</span>
            {sending ? '正在处理...' : '立即开始任务'}
          </button>
        </div>
      </div>

      {renderContent()}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg w-full max-w-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingTemplate ? '编辑模板' : '创建新模板'}</h3>
                    <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-500">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">模板名称</label>
                        <input
                            type="text"
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            placeholder="例如：初次合作邀请"
                            value={templateForm.title}
                            onChange={e => setTemplateForm({...templateForm, title: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">邮件主题</label>
                        <input
                            type="text"
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            placeholder="邮件标题..."
                            value={templateForm.subject}
                            onChange={e => setTemplateForm({...templateForm, subject: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">正文内容</label>
                        <textarea
                            rows={6}
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 resize-none"
                            placeholder="在此输入邮件内容..."
                            value={templateForm.body}
                            onChange={e => setTemplateForm({...templateForm, body: e.target.value})}
                        ></textarea>
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                    <button
                        onClick={() => setShowTemplateModal(false)}
                        className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSaveTemplate}
                        className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg"
                    >
                        保存模板
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Recipient Modal */}
      {showRecipientModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">选择收件人</h3>
                    <button onClick={() => setShowRecipientModal(false)} className="text-slate-400 hover:text-slate-500">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                    <span className="text-sm text-slate-600 dark:text-slate-400">已选择 {selectedCreatorIds.length} 位红人</span>
                    <button onClick={handleSelectAllCreators} className="text-xs font-bold text-primary hover:underline">
                        {selectedCreatorIds.length === creators.length ? '取消全选' : '全选所有'}
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {creatorsLoading ? (
                        <div className="flex justify-center p-8"><span className="text-slate-400">加载中...</span></div>
                    ) : (
                        <div className="space-y-1">
                            {creators.map(creator => (
                                <div
                                    key={creator.id}
                                    className={`flex items-center p-3 rounded-lg cursor-pointer ${selectedCreatorIds.includes(Number(creator.id)) ? 'bg-primary/5 border border-primary/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                    onClick={() => handleToggleCreator(creator.id)}
                                >
                                    <div className={`size-5 rounded border flex items-center justify-center mr-3 ${selectedCreatorIds.includes(Number(creator.id)) ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>
                                        {selectedCreatorIds.includes(Number(creator.id)) && <span className="material-symbols-outlined text-[14px]">check</span>}
                                    </div>
                                    <div className="size-8 rounded-full bg-slate-200 mr-3 overflow-hidden">
                                        {creator.avatar ? <img src={creator.avatar} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{creator.name}</p>
                                        <p className="text-xs text-slate-500">{creator.email || '无邮箱'}</p>
                                    </div>
                                    <div className="text-xs text-slate-400">{creator.platform}</div>
                                </div>
                            ))}
                            {creators.length === 0 && <div className="text-center p-8 text-slate-400">没有找到带有邮箱的红人</div>}
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3 shrink-0">
                    <button
                        onClick={() => setShowRecipientModal(false)}
                        className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => setShowRecipientModal(false)}
                        className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg"
                    >
                        确认选择
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default EmailMarketing;
