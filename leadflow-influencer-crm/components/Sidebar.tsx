
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  active: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
      active 
        ? 'bg-primary/10 text-primary' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`}
  >
    <span className={`material-symbols-outlined ${active ? 'fill' : ''}`}>{icon}</span>
    <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
  </Link>
);

const Sidebar: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { to: '/dashboard', icon: 'dashboard', label: '仪表盘概览' },
    { to: '/influencers', icon: 'group', label: '所有网红' },
    { to: '/marketing', icon: 'campaign', label: '营销活动' },
    { to: '/api-keys', icon: 'key', label: 'API 设置' },
    { to: '/sub-accounts', icon: 'person_search', label: '子账号管理' },
    { to: '/settings', icon: 'settings', label: '系统设置' },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
      <div className="p-6 flex flex-col gap-8 h-full">
        <div className="flex items-center gap-3">
          <div className="bg-primary size-10 rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined">hub</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-[#0d141b] dark:text-white text-base font-bold leading-tight">LeadFlow</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-normal">网红营销SaaS工具</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 grow">
          {navItems.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              active={location.pathname === item.to}
            />
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div 
              className="size-8 rounded-full bg-slate-200 bg-cover bg-center" 
              style={{ backgroundImage: "url('https://picsum.photos/100/100')" }}
            ></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate text-slate-900 dark:text-white">Alex Rivera</p>
              <p className="text-[10px] text-slate-500 truncate">专业版方案</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
