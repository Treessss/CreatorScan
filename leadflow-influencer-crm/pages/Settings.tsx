
import React, { useState, useEffect } from 'react';
import { smtpService, userService, authService } from '../services/api';
import { SmtpConfig } from '../types';

type SettingsTab = 'profile' | 'smtp' | 'security';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('smtp');
  
  // SMTP State
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<Partial<SmtpConfig> | null>(null);
  const [isListView, setIsListView] = useState(true);
  const [testStatus, setTestStatus] = useState<{success: boolean, message: string} | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'smtp') {
      loadSmtpConfigs();
    }
  }, [activeTab]);

  const loadSmtpConfigs = async () => {
    try {
      setLoading(true);
      const data = await smtpService.getAll();
      setSmtpConfigs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingConfig({
      host: 'smtp.gmail.com',
      port: 587,
      username: '',
      password: '',
      is_default: smtpConfigs.length === 0,
      sender_name: ''
    });
    setIsListView(false);
    setTestStatus(null);
  };

  const handleEdit = (config: SmtpConfig) => {
    setEditingConfig({ ...config, password: '' }); // Clear password for security, user must re-enter if changing
    setIsListView(false);
    setTestStatus(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除此 SMTP 配置吗？')) return;
    try {
      await smtpService.delete(id);
      loadSmtpConfigs();
    } catch (err) {
      alert('删除失败');
    }
  };

  const handleSave = async () => {
    if (!editingConfig?.username || !editingConfig?.host) {
      alert('请填写必要信息');
      return;
    }
    
    // Check password only for new configs
    if (!editingConfig.id && !editingConfig.password) {
        alert('请输入密码/应用专用密码');
        return;
    }

    try {
      if (editingConfig.id) {
        await smtpService.update(editingConfig.id, editingConfig);
      } else {
        await smtpService.create(editingConfig);
      }
      setIsListView(true);
      loadSmtpConfigs();
    } catch (err) {
      console.error(err);
      alert('保存失败');
    }
  };

  const handleTestConnection = async () => {
    if (!editingConfig) return;
    setTestStatus({ success: false, message: '正在连接...' });
    try {
      const res = await smtpService.test(editingConfig);
      setTestStatus({ 
        success: res.success, 
        message: res.success ? '连接测试成功！' : `连接失败: ${res.error}` 
      });
    } catch (err: any) {
      setTestStatus({ success: false, message: `错误: ${err.message}` });
    }
  };

  const renderSmtpContent = () => {
    if (isListView) {
      return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 dark:border-slate-800 px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-[#0d141b] dark:text-white text-[22px] font-bold leading-tight">邮件投递配置 (SMTP)</h2>
                <p className="text-[#4c739a] dark:text-slate-400 text-base font-normal mt-2">
                  管理用于发送营销邮件的 SMTP 服务器账户。
                </p>
              </div>
              <button 
                onClick={handleCreateNew}
                className="flex items-center gap-2 bg-primary px-4 py-2 rounded-lg text-sm font-bold text-white hover:bg-primary/90 transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                添加新账号
              </button>
            </div>
            
            <div className="p-8">
              {loading ? (
                <p className="text-center text-slate-500">加载中...</p>
              ) : smtpConfigs.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                   <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">mail_lock</span>
                   <p className="text-slate-500 font-medium">暂无配置，请添加一个 SMTP 账号</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {smtpConfigs.map(config => (
                    <div key={config.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-5 flex items-center justify-between hover:border-primary/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="size-10 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <span className="material-symbols-outlined">mail</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 dark:text-white">{config.username}</h3>
                            {config.is_default && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase">Default</span>}
                          </div>
                          <p className="text-xs text-slate-500">{config.host}:{config.port} • {config.sender_name || 'No Name'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(config)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                          <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button onClick={() => handleDelete(config.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-8 py-6 flex items-center gap-4">
           <button onClick={() => setIsListView(true)} className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
             <span className="material-symbols-outlined">arrow_back</span>
           </button>
           <h2 className="text-[#0d141b] dark:text-white text-[22px] font-bold">
             {editingConfig?.id ? '编辑配置' : '添加新配置'}
           </h2>
        </div>
        
        <div className="px-8 py-8 flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">发件人名称</label>
                <input 
                  className="w-full h-11 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                  value={editingConfig?.sender_name || ''}
                  onChange={e => setEditingConfig(prev => ({ ...prev!, sender_name: e.target.value }))}
                  placeholder="e.g. LeadFlow Team"
                />
             </div>
             <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">设为默认</label>
                <div className="h-11 flex items-center">
                  <label className="flex items-center cursor-pointer gap-2">
                    <input 
                      type="checkbox" 
                      className="size-5 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={editingConfig?.is_default || false}
                      onChange={e => setEditingConfig(prev => ({ ...prev!, is_default: e.target.checked }))}
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">优先使用此账号发送邮件</span>
                  </label>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <label className="text-[#0d141b] dark:text-white text-sm font-semibold flex items-center gap-1">
              SMTP 服务器地址
            </label>
            <div className="md:col-span-2">
              <input 
                className="w-full h-11 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                value={editingConfig?.host || ''}
                onChange={e => setEditingConfig(prev => ({ ...prev!, host: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <label className="text-[#0d141b] dark:text-white text-sm font-semibold flex items-center gap-1">端口号</label>
            <div className="md:col-span-2">
              <input 
                type="number"
                className="w-48 h-11 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                value={editingConfig?.port || 587}
                onChange={e => setEditingConfig(prev => ({ ...prev!, port: parseInt(e.target.value) }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <label className="text-[#0d141b] dark:text-white text-sm font-semibold flex items-center gap-1">用户名 (邮箱地址)</label>
            <div className="md:col-span-2">
              <input 
                className="w-full h-11 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                value={editingConfig?.username || ''}
                onChange={e => setEditingConfig(prev => ({ ...prev!, username: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <label className="text-[#0d141b] dark:text-white text-sm font-semibold flex items-center gap-1">
              应用专用密码
              {editingConfig?.id && <span className="text-xs font-normal text-slate-400 ml-2">(留空则不修改)</span>}
            </label>
            <div className="md:col-span-2 relative">
              <input 
                className="w-full h-11 px-4 pr-12 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                type="password" 
                placeholder={editingConfig?.id ? "••••••••" : ""}
                value={editingConfig?.password || ''}
                onChange={e => setEditingConfig(prev => ({ ...prev!, password: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 mt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-medium">
              {testStatus && (
                <span className={testStatus.success ? "text-green-600" : "text-red-500"}>
                  {testStatus.success ? 'check_circle' : 'error'} {testStatus.message}
                </span>
              )}
            </div>
            <div className="flex gap-4">
              <button 
                onClick={handleTestConnection}
                className="flex h-10 items-center justify-center rounded-lg px-6 text-sm font-bold text-[#0d141b] dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                测试连接
              </button>
              <button 
                onClick={handleSave}
                className="flex h-10 items-center justify-center rounded-lg bg-primary px-8 text-sm font-bold text-white hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* ... Existing Profile Code ... */}
             <div className="border-b border-slate-100 dark:border-slate-800 px-8 py-6">
              <h2 className="text-[#0d141b] dark:text-white text-[22px] font-bold">个人信息</h2>
              <p className="text-[#4c739a] dark:text-slate-400 text-sm mt-1">管理您在 LeadFlow 平台上的公开信息和偏好设置。</p>
            </div>
            <div className="px-8 py-8 flex flex-col gap-8">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex flex-col items-center gap-4">
                  <div className="size-24 rounded-full bg-slate-200 bg-cover bg-center border-4 border-slate-50 dark:border-slate-800 shadow-sm" style={{ backgroundImage: "url('https://picsum.photos/200/200?random=1')" }}></div>
                  <button className="text-xs font-bold text-primary hover:underline">更换头像</button>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">姓名</label>
                    <input className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" defaultValue="Alex Rivera" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位名称</label>
                    <input className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" defaultValue="增长经理" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">显示语言</label>
                    <select className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <option>简体中文</option>
                      <option>English</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">时区</label>
                    <select className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <option>(GMT+08:00) 北京, 上海</option>
                      <option>(GMT-08:00) 太平洋时间</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button className="bg-primary px-8 py-2 rounded-lg text-sm font-bold text-white hover:bg-primary/90">保存个人资料</button>
              </div>
            </div>
          </div>
        );
      case 'security':
        return (
           <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
              <h2 className="text-[#0d141b] dark:text-white text-xl font-bold mb-6">修改密码</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">当前密码</label>
                  <input className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" type="password" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">新密码</label>
                  <input className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" type="password" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">确认新密码</label>
                  <input className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" type="password" />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button className="bg-primary px-8 py-2 rounded-lg text-sm font-bold text-white">更新密码</button>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[#0d141b] dark:text-white text-xl font-bold">双重身份验证 (2FA)</h2>
                  <p className="text-[#4c739a] text-sm mt-1">通过在登录时要求使用安全代码来增加账户安全性。</p>
                </div>
                <div className="relative inline-block w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded-full cursor-pointer">
                  <div className="absolute left-1 top-1 size-4 bg-white rounded-full transition-transform"></div>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg p-4 flex gap-3 text-blue-700 dark:text-blue-300">
                <span className="material-symbols-outlined">verified_user</span>
                <p className="text-sm">尚未启用 2FA。启用后，您将需要输入发送到您手机或邮箱的 6 位代码。</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
               <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800">
                 <h2 className="text-[#0d141b] dark:text-white text-lg font-bold">活跃会话</h2>
               </div>
               <div className="divide-y divide-slate-100 dark:divide-slate-800">
                 {[
                   { device: 'macOS - Chrome 浏览器', location: '中国, 北京', time: '当前在线', icon: 'desktop_windows' },
                   { device: 'iPhone 15 Pro - App', location: '中国, 上海', time: '2小时前', icon: 'smartphone' }
                 ].map((session, i) => (
                   <div key={i} className="px-8 py-4 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                       <span className="material-symbols-outlined text-slate-400">{session.icon}</span>
                       <div>
                         <p className="text-sm font-semibold text-slate-900 dark:text-white">{session.device}</p>
                         <p className="text-xs text-slate-500">{session.location} • {session.time}</p>
                       </div>
                     </div>
                     <button className="text-xs font-bold text-red-500 hover:underline">注销</button>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        );
      case 'smtp':
      default:
        return renderSmtpContent();
    }
  };

  return (
    <div className="layout-content-container flex flex-col max-w-[960px] flex-1 px-4 mx-auto py-10">
      <div className="flex flex-wrap justify-between gap-3 pb-6">
        <div className="flex min-w-72 flex-col gap-2">
          <p className="text-[#0d141b] dark:text-white text-4xl font-black leading-tight tracking-[-0.033em]">系统设置</p>
          <p className="text-[#4c739a] dark:text-slate-400 text-base font-normal">管理您的账户偏好与外部服务集成配置。</p>
        </div>
      </div>
      
      <div className="pb-6">
        <div className="flex border-b border-[#cfdbe7] dark:border-slate-800 px-4 gap-8">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 font-bold text-sm transition-colors ${activeTab === 'profile' ? 'border-b-primary text-primary' : 'border-b-transparent text-[#4c739a] hover:text-primary'}`}
          >
            个人信息
          </button>
          <button 
            onClick={() => setActiveTab('smtp')}
            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 font-bold text-sm transition-colors ${activeTab === 'smtp' ? 'border-b-primary text-primary' : 'border-b-transparent text-[#4c739a] hover:text-primary'}`}
          >
            邮件配置
          </button>
           <button 
            onClick={() => setActiveTab('security')}
            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 font-bold text-sm transition-colors ${activeTab === 'security' ? 'border-b-primary text-primary' : 'border-b-transparent text-[#4c739a] hover:text-primary'}`}
          >
            安全设置
          </button>
        </div>
      </div>
      
      {renderContent()}
    </div>
  );
};

export default Settings;
