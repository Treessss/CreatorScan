
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-8 py-4 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <label className="flex items-center w-full max-w-md relative group">
          <span className="material-symbols-outlined absolute left-3 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
          <input 
            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 placeholder:text-slate-400 text-slate-900 dark:text-white" 
            placeholder="搜索网红、账号或营销活动..." 
            type="text"
          />
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 relative">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
        </button>
        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
        <div className="flex items-center gap-3 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">Alex Rivera</p>
            <p className="text-xs text-slate-500 mt-1">增长经理</p>
          </div>
          <div 
            className="size-10 rounded-full bg-slate-200 bg-cover bg-center border-2 border-white dark:border-slate-800" 
            style={{ backgroundImage: "url('https://picsum.photos/100/100?random=1')" }}
          ></div>
        </div>
      </div>
    </header>
  );
};

export default Header;
