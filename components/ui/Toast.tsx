"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic, spring, ease } from "@/lib/motion";

type ToastTone = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
};

type ToastInput = Omit<Partial<Toast>, "id"> & { title: string };

const ToastContext = createContext<{
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE_ICON = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE_STYLE: Record<ToastTone, string> = {
  success: "border-trust/25 bg-trust-bg text-trust",
  error: "border-danger/25 bg-danger-bg text-danger",
  warning: "border-warn/25 bg-warn-bg text-warn",
  info: "border-info/25 bg-info-bg text-info",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Math.random().toString(36).slice(2);
      const next: Toast = {
        id,
        tone: input.tone ?? "info",
        title: input.title,
        description: input.description,
        action: input.action,
        duration: input.duration ?? 4500,
      };

      setToasts((t) => [...t.slice(-2), next]); // keep at most 3 on screen
      haptic(next.tone === "error" ? "error" : next.tone === "success" ? "success" : "tap");

      if (next.duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), next.duration));
      }
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer if the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[250] flex flex-col items-center gap-2 p-4 pb-safe sm:bottom-auto sm:right-0 sm:top-0 sm:items-end sm:pt-safe"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = TONE_ICON[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: ease.fast }}
                transition={spring.snappy}
                role={t.tone === "error" ? "alert" : "status"}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-surface p-4 shadow-lg",
                  "border-line",
                )}
              >
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border", TONE_STYLE[t.tone])}>
                  <Icon className="size-3.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{t.description}</p>
                  )}
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-2 text-[0.8125rem] font-semibold text-primary-text underline underline-offset-2"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Band karein"
                  className="-m-1 grid size-8 shrink-0 place-items-center rounded-full text-subtle transition-colors hover:bg-bg-subtle hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
