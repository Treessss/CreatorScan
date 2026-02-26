import React, { useEffect, useMemo, useRef, useState } from 'react';

type Option = {
  label: string;
  value: string;
};

type CustomSelectProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
};

const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择',
  className = '',
  searchable = false,
  searchPlaceholder = '搜索...',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((opt) => opt.value === value), [options, value]);
  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((opt) => {
      const label = String(opt.label || '').toLowerCase();
      const raw = String(opt.value || '').toLowerCase();
      return label.includes(keyword) || raw.includes(keyword);
    });
  }, [options, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    if (searchable) {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-left text-sm leading-none text-slate-700 dark:text-slate-200 flex items-center justify-between"
      >
        <span className="truncate leading-none">{selected?.label || placeholder}</span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[100] mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {searchable && (
            <div className="sticky top-0 z-10 p-2 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          )}
          {filteredOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-sm leading-none text-left hover:bg-slate-50 dark:hover:bg-slate-700 ${
                value === opt.value ? 'text-primary font-semibold' : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-3 text-xs text-slate-400">无匹配结果</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
