
import React, { useState, useEffect } from 'react';
import { smtpService, userService, authService } from '../services/api';
import { SmtpConfig } from '../types';
import { useFeedback } from '../components/FeedbackProvider';

type SettingsTab = 'profile' | 'smtp' | 'security';

const Settings: React.FC = () => {
  const { notify, confirm } = useFeedback();
  const [activeTab, setActiveTab] = useState<SettingsTab>('smtp');
  const [profileUsername, setProfileUsername] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAOtp, setTwoFAOtp] = useState('');
  const [twoFADisablePassword, setTwoFADisablePassword] = useState('');
  const [twoFADisableOtp, setTwoFADisableOtp] = useState('');
  const [twoFAWorking, setTwoFAWorking] = useState(false);
  const [twoFAMessage, setTwoFAMessage] = useState<string | null>(null);
  
  // SMTP State
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<Partial<SmtpConfig> | null>(null);
  const [isListView, setIsListView] = useState(true);
  const [testStatus, setTestStatus] = useState<{success: boolean, message: string} | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMyProfile();
  }, []);

  useEffect(() => {
    if (activeTab === 'smtp') {
      loadSmtpConfigs();
    }
  }, [activeTab]);

  const loadMyProfile = async () => {
    try {
      const me = await authService.getMe();
      setProfileUsername(me.username || '');
      setTwoFAEnabled(!!me.two_fa_enabled);
    } catch (err) {
      console.error('Failed to load profile', err);
    }
  };

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
    const ok = await confirm({
      title: '删除 SMTP 配置',
      message: '确定要删除此 SMTP 配置吗？',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await smtpService.delete(id);
      loadSmtpConfigs();
      notify('删除成功', 'success');
    } catch (err) {
      notify('删除失败', 'error');
    }
  };

  const handleSave = async () => {
    if (!editingConfig?.username || !editingConfig?.host) {
      notify('请填写必要信息', 'warning');
      return;
    }
    
    // Check password only for new configs
    if (!editingConfig.id && !editingConfig.password) {
        notify('请输入密码/应用专用密码', 'warning');
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
      notify('保存成功', 'success');
    } catch (err) {
      console.error(err);
      notify('保存失败', 'error');
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

  const handleSaveProfile = async () => {
    if (!profileUsername.trim()) {
      setProfileMessage('用户名不能为空');
      return;
    }
    try {
      setProfileSaving(true);
      setProfileMessage(null);
      const updated = await userService.updateProfile(profileUsername.trim());
      localStorage.setItem('user', JSON.stringify(updated));
      setProfileMessage('个人资料已保存');
    } catch (err: any) {
      setProfileMessage(err?.response?.data?.detail || '保存失败');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordCurrent) {
      setPasswordMessage('请输入当前密码');
      return;
    }
    if (!passwordNew || passwordNew.length < 6) {
      setPasswordMessage('新密码至少 6 位');
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordMessage('两次输入的新密码不一致');
      return;
    }
    try {
      setPasswordSaving(true);
      setPasswordMessage(null);
      await userService.updatePassword(passwordCurrent, passwordNew);
      setPasswordCurrent('');
      setPasswordNew('');
      setPasswordConfirm('');
      setPasswordMessage('密码已更新');
    } catch (err: any) {
      setPasswordMessage(err?.response?.data?.detail || '更新密码失败');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleGenerate2FA = async () => {
    try {
      setTwoFAWorking(true);
      setTwoFAMessage(null);
      const data = await userService.setup2FA();
      setTwoFASecret(data.secret);
      setTwoFAMessage('已生成密钥，请在认证器中添加后输入验证码启用');
    } catch (err: any) {
      setTwoFAMessage(err?.response?.data?.detail || '生成 2FA 密钥失败');
    } finally {
      setTwoFAWorking(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!twoFAOtp.trim()) {
      setTwoFAMessage('请输入验证码');
      return;
    }
    try {
      setTwoFAWorking(true);
      setTwoFAMessage(null);
      const user = await userService.enable2FA(twoFAOtp.trim());
      setTwoFAEnabled(!!user.two_fa_enabled);
      setTwoFASecret('');
      setTwoFAOtp('');
      setTwoFAMessage('2FA 已启用');
    } catch (err: any) {
      setTwoFAMessage(err?.response?.data?.detail || '启用 2FA 失败');
    } finally {
      setTwoFAWorking(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!twoFADisablePassword || !twoFADisableOtp) {
      setTwoFAMessage('请输入当前密码和验证码');
      return;
    }
    try {
      setTwoFAWorking(true);
      setTwoFAMessage(null);
      const user = await userService.disable2FA(twoFADisablePassword, twoFADisableOtp);
      setTwoFAEnabled(!!user.two_fa_enabled);
      setTwoFADisablePassword('');
      setTwoFADisableOtp('');
      setTwoFAMessage('2FA 已关闭');
    } catch (err: any) {
      setTwoFAMessage(err?.response?.data?.detail || '关闭 2FA 失败');
    } finally {
      setTwoFAWorking(false);
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
             <div className="border-b border-slate-100 dark:border-slate-800 px-8 py-6">
              <h2 className="text-[#0d141b] dark:text-white text-[22px] font-bold">个人信息</h2>
              <p className="text-[#4c739a] dark:text-slate-400 text-sm mt-1">管理您在 LeadFlow 平台上的公开信息和偏好设置。</p>
            </div>
            <div className="px-8 py-8 flex flex-col gap-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">用户名</label>
                  <input
                    className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    value={profileUsername}
                    onChange={(e) => setProfileUsername(e.target.value)}
                    placeholder="请输入用户名"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">说明</label>
                  <div className="w-full h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center text-sm text-slate-500">
                    当前版本仅开放用户名编辑
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  {profileMessage && <span className="text-sm text-slate-500">{profileMessage}</span>}
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="bg-primary px-8 py-2 rounded-lg text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {profileSaving ? '保存中...' : '保存个人资料'}
                  </button>
                </div>
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
                  <input
                    className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    type="password"
                    value={passwordCurrent}
                    onChange={(e) => setPasswordCurrent(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">新密码</label>
                  <input
                    className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    type="password"
                    value={passwordNew}
                    onChange={(e) => setPasswordNew(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">确认新密码</label>
                  <input
                    className="w-full h-10 px-4 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <div className="flex items-center gap-4">
                  {passwordMessage && <span className="text-sm text-slate-500">{passwordMessage}</span>}
                  <button
                    onClick={handleUpdatePassword}
                    disabled={passwordSaving}
                    className="bg-primary px-8 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60"
                  >
                    {passwordSaving ? '更新中...' : '更新密码'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
              <div className="mb-6">
                <h2 className="text-[#0d141b] dark:text-white text-xl font-bold">双重身份验证 (2FA)</h2>
                <p className="text-[#4c739a] text-sm mt-1">
                  当前状态：{twoFAEnabled ? '已启用' : '未启用'}
                </p>
              </div>
              {!twoFAEnabled ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <button
                      onClick={handleGenerate2FA}
                      disabled={twoFAWorking}
                      className="bg-primary px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60"
                    >
                      生成密钥
                    </button>
                    {twoFASecret && (
                      <button
                        onClick={() => navigator.clipboard.writeText(twoFASecret)}
                        className="border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        复制密钥
                      </button>
                    )}
                  </div>
                  {twoFASecret && (
                    <div className="text-sm text-slate-600 dark:text-slate-300 break-all">Secret: {twoFASecret}</div>
                  )}
                  <div className="flex gap-3 items-center">
                    <input
                      className="w-48 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      placeholder="输入6位验证码"
                      value={twoFAOtp}
                      onChange={(e) => setTwoFAOtp(e.target.value)}
                    />
                    <button
                      onClick={handleEnable2FA}
                      disabled={twoFAWorking || !twoFASecret}
                      className="bg-primary px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60"
                    >
                      启用 2FA
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      type="password"
                      placeholder="当前密码"
                      value={twoFADisablePassword}
                      onChange={(e) => setTwoFADisablePassword(e.target.value)}
                    />
                    <input
                      className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      placeholder="当前验证码"
                      value={twoFADisableOtp}
                      onChange={(e) => setTwoFADisableOtp(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleDisable2FA}
                    disabled={twoFAWorking}
                    className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60"
                  >
                    关闭 2FA
                  </button>
                </div>
              )}
              {twoFAMessage && <p className="text-sm text-slate-500 mt-4">{twoFAMessage}</p>}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
              <div className="mb-6">
                <h2 className="text-[#0d141b] dark:text-white text-xl font-bold">会话管理</h2>
                <p className="text-[#4c739a] text-sm mt-1">当前版本不展示活跃会话，也不提供远程注销入口。</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-lg p-4 flex gap-3 text-amber-700 dark:text-amber-300">
                <span className="material-symbols-outlined">info</span>
                <p className="text-sm">如需强制下线，请先修改密码并轮换 API Key。后续版本会补齐完整会话管理能力。</p>
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
    <div className="layout-content-container h-full overflow-y-auto flex flex-col max-w-[960px] flex-1 px-4 mx-auto py-10">
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
