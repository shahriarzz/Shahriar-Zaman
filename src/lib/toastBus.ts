export type ToastTone = 'error' | 'success' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
}

type ToastListener = (toast: ToastItem) => void;
const listeners: Set<ToastListener> = new Set();

export function showToast(toast: Omit<ToastItem, 'id'>): void {
  const item: ToastItem = {
    ...toast,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  };
  listeners.forEach((listener) => listener(item));
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
