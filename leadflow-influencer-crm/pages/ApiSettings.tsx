
import React, { useEffect, useState } from 'react';
import { authService } from '../services/api';
import { useFeedback } from '../components/FeedbackProvider';

const ApiSettings: React.FC = () => {
  const { notify } = useFeedback();
  const [apiKey, setApiKey] = useState('Loading...');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getMe();
        setUser(userData);
        setApiKey(userData.api_key || 'No API Key found');
      } catch (err) {
        console.error(err);
        setApiKey('Error loading key');
      }
    };
    fetchUser();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background-light dark:bg-background-dark">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0d141b] dark:text-white">API 密钥管理</h1>
            <p className="text-[#4c739a] text-base max-w-2xl">
              管理您的 API 密钥，以便为浏览器插件提供授权并访问 KOL 线索数据。
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-[#cfdbe7] dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-[#cfdbe7] dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-semibold text-[#4c739a] uppercase tracking-wider">密钥名称</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#4c739a] uppercase tracking-wider">API 密钥</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#4c739a] uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#4c739a] uppercase tracking-wider text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cfdbe7] dark:divide-slate-800">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-[#0d141b] dark:text-white">主账号密钥</td>
                    <td className="px-6 py-4 text-sm font-mono text-[#4c739a]">{apiKey}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400`}>
                        <span className={`w-2 h-2 rounded-full bg-green-500`}></span>
                        已激活
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                            className="p-2 text-[#4c739a] hover:text-primary transition-colors" 
                            title="复制密钥"
                            onClick={() => {navigator.clipboard.writeText(apiKey); notify('已复制 API Key', 'success');}}
                        >
                            <span className="material-symbols-outlined">content_copy</span>
                        </button>
                      </div>
                    </td>
                  </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-4 items-start">
          <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg text-blue-600 dark:text-blue-300">
            <span className="material-symbols-outlined">verified_user</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200">使用说明</h4>
            <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              复制此 API 密钥，然后在 Chrome 插件的设置页面中填入，即可实现数据同步。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiSettings;
