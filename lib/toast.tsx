"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warn" | "info";

export interface ToastEntry {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: ToastEntry[];
  addToast: (entry: Omit<ToastEntry, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (entry: Omit<ToastEntry, "id">) => {
      const id = String(++_counter);
      setToasts((prev) => [...prev, { ...entry, id }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.addToast;
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={16} />,
  error:   <XCircle    size={16} />,
  warn:    <AlertTriangle size={16} />,
  info:    <Info       size={16} />,
};

function ToastItem({ toast, onRemove }: { toast: ToastEntry; onRemove: () => void }) {
  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={onRemove} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;
  const { toasts, removeToast } = ctx;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
      ))}
    </div>
  );
}
