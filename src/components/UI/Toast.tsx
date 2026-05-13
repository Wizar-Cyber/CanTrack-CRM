import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Info, X, Bell } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />,
  error:   <XCircle      className="w-4 h-4 text-rose-500   shrink-0 mt-0.5" />,
  info:    <Bell         className="w-4 h-4 text-blue-500   shrink-0 mt-0.5" />,
};

const BORDER: Record<ToastType, string> = {
  success: 'border-l-emerald-400',
  error:   'border-l-rose-400',
  info:    'border-l-blue-400',
};

const ToastCard: React.FC<{ toast: ToastItem; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 4500);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`
        pointer-events-auto flex items-start gap-3
        bg-white border border-slate-200 border-l-4 ${BORDER[toast.type]}
        rounded-xl shadow-lg px-4 py-3.5 min-w-[300px] max-w-sm
      `}
    >
      {ICONS[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="p-0.5 text-slate-300 hover:text-slate-500 rounded transition-colors shrink-0"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onRemove }) => (
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
    <AnimatePresence mode="popLayout">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </AnimatePresence>
  </div>
);

/** Hook de conveniencia para gestionar toasts */
export function useToasts() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const add = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts(prev => [...prev, { ...t, id }]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, add, remove };
}
