"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, Info, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReelToastTone = "done" | "info" | "error" | "celebrate";

export interface ReelToastState {
  /** A new id replaces whatever is showing — there is only ever one. */
  id: number;
  tone: ReelToastTone;
  text: string;
  action?: { label: string; onClick: () => void };
}

const TONE_ICON: Record<ReelToastTone, LucideIcon> = {
  done: Check,
  info: Info,
  error: AlertCircle,
  celebrate: Users,
};

/**
 * The reel's own confirmation line — "Interest bheja · Undo".
 *
 * Not the app-wide `useToast`, for three reasons that all come from where it
 * sits. The app's toast is a white card along the bottom edge, and on the
 * reel that edge belongs to the person's name and the action rail; it
 * vibrates the phone on every success, and a feed that buzzes each time you
 * save somebody is the jarring interaction this rebuild removes; and it
 * stacks three deep, while a browsing surface needs exactly one line that the
 * next action replaces.
 *
 * So: one smoked-glass pill under the top bar, over the forehead-and-sky band
 * of the photograph that nothing else uses, for a few seconds. It confirms —
 * it never asks. Anything that needs a decision is a sheet.
 */
export default function ReelToast({ toast }: { toast: ReelToastState | null }) {
  const reduced = useReducedMotion();
  return (
    // The wrapper carries the position: `.reel-glass` sets `position: relative`
    // in unlayered CSS, which silently beats a positioning utility on the same
    // element (see the canvas-skin cascade note).
    <div
      className="pointer-events-none absolute inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top,0px))] z-50 flex justify-center px-4"
      // Errors interrupt; everything else waits its turn.
      role={toast?.tone === "error" ? "alert" : "status"}
      aria-live={toast?.tone === "error" ? "assertive" : "polite"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.14 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto max-w-full"
          >
            <div className="reel-glass inline-flex min-h-10 max-w-full items-center gap-2 rounded-full py-1 pl-1.5 pr-1.5 text-[0.8125rem] font-semibold">
              <ToastIcon tone={toast.tone} />
              <span className={cn("min-w-0 truncate", !toast.action && "pr-2")}>{toast.text}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="-my-1 ml-0.5 inline-flex min-h-9 shrink-0 items-center rounded-full bg-white/12 px-3 text-[0.8125rem] font-semibold text-gold-100 transition-colors hover:bg-white/20"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToastIcon({ tone }: { tone: ReelToastTone }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full",
        tone === "done" && "bg-gold-300/90 text-wine-900",
        tone === "celebrate" && "bg-gradient-to-b from-gold-300 to-gold-500 text-wine-900",
        tone === "info" && "bg-white/15 text-white",
        tone === "error" && "bg-rose-500/90 text-white",
      )}
    >
      <Icon className="size-4" strokeWidth={2.5} />
    </span>
  );
}
