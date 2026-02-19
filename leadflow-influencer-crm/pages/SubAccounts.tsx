
import React, { useState, useEffect } from 'react';
import { userService } from '../services/api';
import { UserResponse, AuditLogResponse } from '../types';

type SubAccountTab = 'manage' | 'audit';

const SubAccounts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubAccountTab>('manage');
  const [subAccounts, setSubAccounts] = useState<UserResponse[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogResponse[]>([]);

  // Create Sub Account State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Password Update State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [updatePassword, setUpdatePassword] = useState('');

  useEffect(() => {
    if (activeTab === 'manage') {
      loadSubAccounts();
    } else {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadSubAccounts = async () => {
    try {
      const data = await userService.getSubAccounts();
      setSubAccounts(data);
    } catch (err) {
      console.error('Failed to load sub accounts', err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const data = await userService.getAuditLogs();
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    }
  };

  const handleCreateSubAccount = async () => {
    try {
      await userService.createSubAccount(newUsername, newPassword);
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      loadSubAccounts();
      alert('子账号创建成功');
    } catch (err: any) {
      alert('创建失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteSubAccount = async (id: number) => {
    if (confirm('确定要删除此子账号吗？此操作不可恢复。')) {
      try {
        await userService.deleteSubAccount(id);
        loadSubAccounts();
      } catch (err: any) {
        alert('删除失败: ' + (err.response?.data?.detail || err.message));
      }
    }
  };

  const handleUpdatePasswordSubmit = async () => {
    if (!selectedUserId) return;
    try {
      await userService.updateSubAccountPassword(selectedUserId, updatePassword);
      setShowPasswordModal(false);
      setUpdatePassword('');
      setSelectedUserId(null);
      alert('密码更新成功');
    } catch (err: any) {
      alert('更新失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'audit':
        return (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
               <h3 className="font-bold text-slate-900 dark:text-white">系统审计日志</h3>
               <button className="text-xs font-bold text-primary">刷新日志</button>
             </div>
             <div className="divide-y divide-slate-100 dark:divide-slate-800">
               {auditLogs.length === 0 ? (
                 <div className="p-8 text-center text-slate-500">暂无审计日志</div>
               ) : (
                 auditLogs.map((log, i) => (
                   <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                     <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                       <span className="material-symbols-outlined">
                         {log.action.includes('delete') ? 'delete' :
                          log.action.includes('create') ? 'add_circle' :
                          log.action.includes('update') ? 'edit' : 'info'}
                       </span>
                     </div>
                     <div className="flex-1">
                       <p className="text-sm font-semibold text-slate-900 dark:text-white">
                         <span className="text-primary">用户 ID: {log.user_id}</span> {log.action}
                       </p>
                       <p className="text-xs text-slate-500">{log.details}</p>
                       <p className="text-xs text-slate-400 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                     </div>
                   </div>
                 ))
               )}
             </div>
          </div>
        );
      case 'manage':
      default:
        return (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-bold text-slate-900 dark:text-white">活跃子账号</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">账号名称</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">API密钥</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-center">状态</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {subAccounts.length === 0 ? (
                    <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500">暂无子账号</td>
                    </tr>
                  ) : (
                    subAccounts.map((acc, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center font-bold text-xs">
                                {acc.username.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-900 dark:text-white">{acc.username}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4"><code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600">{acc.api_key.substring(0, 8)}...</code></td>
                        <td className="px-6 py-4 text-center">
                            <span className="text-xs font-bold text-green-500">运行中</span>
                        </td>
                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button
                                onClick={() => { setSelectedUserId(acc.id); setShowPasswordModal(true); }}
                                className="text-slate-400 hover:text-primary transition-colors"
                                title="修改密码"
                            >
                                <span className="material-symbols-outlined">lock_reset</span>
                            </button>
                            <button
                                onClick={() => handleDeleteSubAccount(acc.id)}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                                title="删除账号"
                            >
                                <span className="material-symbols-outlined">delete</span>
                            </button>
                        </td>
                        </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">子账号管理</h2>
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('manage')}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'manage' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              账号列表
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'audit' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              安全审计
            </button>
          </div>
        </div>
        <button
            onClick={() => setShowCreateModal(true)}
            className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          创建子账号
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <div className="bg-primary/10 text-primary p-2 rounded-lg"><span className="material-symbols-outlined">group</span></div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">活跃席位</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{subAccounts.length}</p>
        </div>
      </div>

      {renderContent()}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">创建新子账号</h3>
                    <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-500">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">用户名</label>
                        <input
                            type="text"
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">密码</label>
                        <input
                            type="password"
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                    <button
                        onClick={() => setShowCreateModal(false)}
                        className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleCreateSubAccount}
                        className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg"
                    >
                        创建账号
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Password Update Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">重置密码</h3>
                    <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-500">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">新密码</label>
                        <input
                            type="password"
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            value={updatePassword}
                            onChange={e => setUpdatePassword(e.target.value)}
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                    <button
                        onClick={() => setShowPasswordModal(false)}
                        className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleUpdatePasswordSubmit}
                        className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg"
                    >
                        更新密码
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default SubAccounts;
