import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmModal from './ConfirmModal';

type ToastType = 'success' | 'error' | 'info';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
};

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type FeedbackContextValue = {
  notify: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolver: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { title: '', message: '' },
    resolver: null,
  });

  const notify = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        open: true,
        options,
        resolver: resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    confirmState.resolver?.(true);
    setConfirmState((prev) => ({ ...prev, open: false, resolver: null }));
  }, [confirmState]);

  const handleCancel = useCallback(() => {
    confirmState.resolver?.(false);
    setConfirmState((prev) => ({ ...prev, open: false, resolver: null }));
  }, [confirmState]);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`min-w-[240px] max-w-[360px] rounded-lg border px-3 py-2 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : toast.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
      <ConfirmModal
        isOpen={confirmState.open}
        title={confirmState.options.title}
        message={confirmState.options.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        confirmText={confirmState.options.confirmText}
        cancelText={confirmState.options.cancelText}
        type={confirmState.options.type}
      />
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used inside FeedbackProvider');
  }
  return ctx;
};
