import React, { useEffect, useMemo, useRef, useState } from 'react';

type Option = {
  label: string;
  value: string;
};

type CustomMultiSelectProps = {
  options: Option[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
};

const CustomMultiSelect: React.FC<CustomMultiSelectProps> = ({
  options,
  values,
  onChange,
  placeholder = '请选择',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(() => {
    if (values.length === 0) return placeholder;
    return `已选择 ${values.length} 项`;
  }, [values, placeholder]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
      return;
    }
    onChange([...values, value]);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-left text-sm text-slate-700 dark:text-slate-200 flex items-center justify-between"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-auto max-h-56">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
            >
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggleValue(opt.value)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomMultiSelect;
