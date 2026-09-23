"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
      const timer = setTimeout(() => dismiss(id), 4500);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed right-4 top-[72px] z-[100] flex max-w-[380px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in cursor-pointer rounded-xl border border-border-strong bg-panel px-[15px] py-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.5)] ${
              t.type === "success"
                ? "border-l-[3px] border-l-up"
                : t.type === "error"
                  ? "border-l-[3px] border-l-down"
                  : "border-l-[3px] border-l-accent"
            }`}
            onClick={() => dismiss(t.id)}
          >
            <div className="text-[14px] font-semibold">{t.title}</div>
            {t.message && <div className="mt-0.5 text-[13px] text-text-dim">{t.message}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}