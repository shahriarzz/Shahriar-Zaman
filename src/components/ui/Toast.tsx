import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SURFACE, BORDER, RADIUS, SHADOW, TYPOGRAPHY } from '../../styles/tokens';
import { Button } from './Button';

export type ToastTone = 'error' | 'success' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
}

type ToastListener = (toast: ToastItem) => void;
const listeners: Set<ToastListener> = new Set();

export function showToast(toast: Omit<ToastItem, 'id'>) {
  const item: ToastItem = {
    ...toast,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  };
  listeners.forEach((listener) => listener(item));
}

const TONE_CONFIG: Record<ToastTone, {
  borderColor: string;
  bgDot: string;
  textColor: string;
  icon: React.FC<{ size?: number; className?: string }>;
}> = {
  error: {
    borderColor: 'border-red-500/30',
    bgDot: 'bg-red-500',
    textColor: 'text-red-200',
    icon: AlertTriangle,
  },
  warning: {
    borderColor: 'border-amber-500/30',
    bgDot: 'bg-amber-500',
    textColor: 'text-amber-200',
    icon: AlertTriangle,
  },
  success: {
    borderColor: 'border-emerald-500/30',
    bgDot: 'bg-emerald-500',
    textColor: 'text-emerald-200',
    icon: CheckCircle2,
  },
  info: {
    borderColor: 'border-orange-500/30',
    bgDot: 'bg-orange-500',
    textColor: 'text-orange-200',
    icon: Info,
  },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (item: ToastItem) => {
      setToasts((prev) => [...prev.slice(-3), item]); // keep maximum 4 active toasts

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, item.duration || 4500);

      return () => clearTimeout(timer);
    };

    listeners.add(handleToast);
    return () => {
      listeners.delete(handleToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div
      aria-live="polite"
      aria-label="System notifications"
      className="fixed bottom-24 right-4 md:top-4 md:bottom-auto md:right-4 z-50 flex flex-col gap-2 pointer-events-none select-none max-w-sm w-full"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const tone = toast.tone || 'info';
          const config = TONE_CONFIG[tone];
          const Icon = config.icon;

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                SURFACE.panel,
                BORDER.standard,
                RADIUS.card,
                SHADOW.panel,
                config.borderColor,
                "pointer-events-auto border px-4 py-3 flex items-center justify-between gap-3 backdrop-blur-xl"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className={cn("w-1.5 h-1.5 rounded-full animate-ping shrink-0", config.bgDot)} />
                <Icon size={14} className={cn("shrink-0", config.textColor)} />
                <span className={cn(TYPOGRAPHY.metadata, config.textColor, "text-[10px] break-words")}>
                  {toast.message}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeToast(toast.id)}
                className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300"
                aria-label="Dismiss notification"
                icon={<X size={12} />}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
