
import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确认',
  cancelText = '取消',
  type = 'danger'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#101922] rounded-xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 transform transition-all animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`shrink-0 size-10 rounded-full flex items-center justify-center ${
              type === 'danger' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
              type === 'warning' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
              'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
              <span className="material-symbols-outlined text-xl">
                {type === 'danger' ? 'warning' : type === 'warning' ? 'error' : 'info'}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-colors ${
              type === 'danger' ? 'bg-red-500 hover:bg-red-600' :
              type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' :
              'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
