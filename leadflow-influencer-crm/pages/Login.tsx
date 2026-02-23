
import React, { useState } from 'react';
import { authService } from '../services/api';
import { useFeedback } from '../components/FeedbackProvider';

const Login: React.FC<{ onLogin: (user: any) => void }> = ({ onLogin }) => {
  const { notify } = useFeedback();
  const [role, setRole] = useState<'Member' | 'Admin'>('Member');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trialContact = import.meta.env.VITE_TRIAL_CONTACT || '请联系系统管理员开通试用账号';

  const handleRequestTrial = () => {
    notify(trialContact, 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // 1. Get Token
      const tokenData = await authService.login(username, password, otpCode || undefined);
      localStorage.setItem('token', tokenData.access_token);
      
      // 2. Get User Details
      const user = await authService.getMe();
      localStorage.setItem('user', JSON.stringify(user));
      
      onLogin(user);
    } catch (err: any) {
      console.error(err);
      if (err?.response?.data?.detail === '2FA_REQUIRED') {
        setRequire2FA(true);
        setError('请输入 2FA 验证码');
      } else {
        setError(err.response?.data?.detail || '登录失败，请检查用户名和密码');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-x-hidden p-4 bg-[#f6f7f8] dark:bg-[#101922]">
      <header className="mb-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 text-primary">
          <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined !text-3xl">hub</span>
          </div>
          <h1 className="text-[#0d141b] dark:text-slate-100 text-2xl font-bold tracking-tight">KOL 获客管理系统</h1>
        </div>
      </header>
      
      <main className="w-full max-w-[440px] bg-white dark:bg-slate-900 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-[#e7edf3] dark:border-slate-800 overflow-hidden">
        <div className="p-8">
          <div className="mb-6">
            <h2 className="text-[#0d141b] dark:text-slate-50 text-2xl font-bold leading-tight mb-2">欢迎回来</h2>
            <p className="text-[#4c739a] dark:text-slate-400 text-sm font-normal">请输入您的凭据以访问 KOL 管理工作台。</p>
          </div>

          <div className="mb-6">
            <div className="flex h-11 items-center justify-center rounded-lg bg-[#f0f2f5] dark:bg-slate-800 p-1">
              <button 
                onClick={() => setRole('Member')}
                className={`flex-1 h-full rounded-lg px-2 text-sm font-semibold transition-all duration-200 ${
                  role === 'Member' ? 'bg-white dark:bg-slate-700 shadow-sm text-[#0d141b] dark:text-white' : 'text-[#4c739a] dark:text-slate-400'
                }`}
              >
                成员登录
              </button>
              <button 
                onClick={() => setRole('Admin')}
                className={`flex-1 h-full rounded-lg px-2 text-sm font-semibold transition-all duration-200 ${
                  role === 'Admin' ? 'bg-white dark:bg-slate-700 shadow-sm text-[#0d141b] dark:text-white' : 'text-[#4c739a] dark:text-slate-400'
                }`}
              >
                管理员登录
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col gap-2">
              <span className="text-[#0d141b] dark:text-slate-200 text-sm font-semibold">用户名</span>
              <input 
                className="w-full rounded-lg text-[#0d141b] dark:text-slate-100 focus:ring-2 focus:ring-primary/20 border border-[#cfdbe7] dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary h-12 placeholder:text-[#4c739a] dark:placeholder:text-slate-500 px-4 text-sm font-normal" 
                placeholder="username" 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[#0d141b] dark:text-slate-200 text-sm font-semibold">登录密码</span>
                <button type="button" className="text-primary text-xs font-semibold hover:underline">忘记密码？</button>
              </div>
              <input 
                className="w-full rounded-lg text-[#0d141b] dark:text-slate-100 focus:ring-2 focus:ring-primary/20 border border-[#cfdbe7] dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary h-12 placeholder:text-[#4c739a] dark:placeholder:text-slate-500 px-4 text-sm font-normal" 
                placeholder="••••••••" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {require2FA && (
              <label className="flex flex-col gap-2">
                <span className="text-[#0d141b] dark:text-slate-200 text-sm font-semibold">2FA 验证码</span>
                <input
                  className="w-full rounded-lg text-[#0d141b] dark:text-slate-100 focus:ring-2 focus:ring-primary/20 border border-[#cfdbe7] dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary h-12 placeholder:text-[#4c739a] dark:placeholder:text-slate-500 px-4 text-sm font-normal"
                  placeholder="6位验证码"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                />
              </label>
            )}
            <div className="flex items-center gap-2 pt-1">
              <input className="size-4 rounded border-[#cfdbe7] text-primary focus:ring-primary" id="remember" type="checkbox" />
              <label className="text-sm text-[#4c739a] dark:text-slate-400 cursor-pointer" htmlFor="remember">在该设备上记住我</label>
            </div>
            <button 
              className="w-full h-12 mt-4 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm tracking-wide transition-colors shadow-md shadow-primary/20 disabled:opacity-50" 
              type="submit"
              disabled={loading}
            >
              {loading ? '登录中...' : '立即登录'}
            </button>
          </form>
        </div>
        <div className="bg-[#f8fafc] dark:bg-slate-800/50 border-t border-[#e7edf3] dark:border-slate-800 p-6 text-center">
          <p className="text-[#4c739a] dark:text-slate-400 text-sm">
            还没有账号？ 
            <button onClick={handleRequestTrial} className="text-primary font-bold hover:underline ml-1">申请试用</button>
          </p>
        </div>
      </main>

      <footer className="mt-8 text-[#4c739a] dark:text-slate-500 text-xs text-center max-w-sm">
        <div className="flex items-center justify-center gap-4 mb-4">
          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">lock</span> 安全登录</span>
          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">dns</span> 独立服务器</span>
        </div>
        © 2024 LeadFlow 获客管理系统. 版权所有。专为专业 KOL 数据处理而设计。
      </footer>
    </div>
  );
};

export default Login;
