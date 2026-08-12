'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../cn';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: ToastAction;
  onDismiss?: () => void;
  className?: string;
}

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. `0` pins the toast until it is dismissed by hand. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

const TONE_ICONS: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function Toast({
  title,
  description,
  tone = 'info',
  action,
  onDismiss,
  className,
}: ToastProps) {
  const Icon = TONE_ICONS[tone];
  return (
    <div
      className={cn(styles.toast, styles[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon size={14} />
      </span>
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
        {action ? (
          <button type="button" className={styles.action} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={onDismiss}>
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

interface ToastContextValue {
  toasts: ToastRecord[];
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Default auto-dismiss delay for toasts that do not set their own. */
  duration?: number;
  /** Oldest toasts beyond this count are dropped. */
  max?: number;
}

export function ToastProvider({ children, duration = 5000, max = 4 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const counter = useRef(0);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      setToasts((current) => [...current, { ...options, id }].slice(-max));
      const delay = options.duration ?? duration;
      if (delay > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), delay),
        );
      }
      return id;
    },
    [dismiss, duration, max],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toasts, toast, dismiss }), [dismiss, toast, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className={styles.viewport} role="region" aria-label="Notifications">
              {toasts.map((entry) => (
                <Toast
                  key={entry.id}
                  title={entry.title}
                  description={entry.description}
                  tone={entry.tone}
                  action={entry.action}
                  onDismiss={() => dismiss(entry.id)}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a <ToastProvider>');
  return context;
}
