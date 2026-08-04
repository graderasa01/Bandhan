"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease, spring } from "@/lib/motion";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** bottom = mobile sheet, side = desktop drawer, center = modal */
  variant?: "bottom" | "side" | "center";
  /** Hide the close button — use for flows that must be completed. */
  dismissible?: boolean;
  footer?: ReactNode;
  className?: string;
}

/**
 * One overlay primitive for sheets, drawers and modals.
 *
 * Handles the things overlays usually get wrong: focus trap, Escape, scroll
 * lock, restoring focus on close, and a real drag-to-dismiss on mobile.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  variant = "bottom",
  dismissible = true,
  footer,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  /**
   * Stays true through the closing animation, then flips false to unmount.
   * Slightly longer than the longest exit so the animation is never cut short.
   */
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), reduced ? 0 : 320);
    return () => clearTimeout(t);
  }, [open, reduced]);

  // Scroll lock + focus management
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panelRef.current)?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
      restoreFocus.current?.focus?.();
    };
  }, [open]);

  // Escape + focus trap
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissible]);

  /** Enter and leave targets per variant; `open` picks which one to animate to. */
  const panelMotion =
    variant === "bottom"
      ? {
          initial: { y: "100%" },
          animate: { y: open ? 0 : "100%" },
          transition: reduced ? ease.micro : spring.snappy,
        }
      : variant === "side"
        ? {
            initial: { x: "100%" },
            animate: { x: open ? 0 : "100%" },
            transition: reduced ? ease.micro : spring.snappy,
          }
        : {
            initial: { opacity: 0, scale: 0.96, y: 8 },
            animate: open
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 0, scale: 0.96, y: 8 },
            transition: ease.fast,
          };

  if (!mounted) return null;

  /*
   * Mounting is controlled here rather than by AnimatePresence.
   *
   * With AnimatePresence both exit animations ran to completion — scrim at
   * opacity 0, panel translated fully off-screen — but the nodes were never
   * unmounted. An invisible `fixed inset-0` scrim still has `pointer-events:
   * auto`, so every click on the page afterwards hit the scrim instead of the
   * app: the whole screen went dead while looking perfectly normal.
   *
   * `mounted` + a timer keeps the enter and exit animations and makes the
   * unmount deterministic, which is the one property an overlay cannot get
   * wrong.
   */
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={ease.fast}
        onClick={dismissible ? onClose : undefined}
        className={cn(
          "fixed inset-0 z-[200] bg-[var(--bt-scrim)] backdrop-blur-[2px]",
          // Belt and braces: even a node that outlives its close can never
          // swallow a click.
          !open && "pointer-events-none",
        )}
        aria-hidden
      />

      <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            {...panelMotion}
            drag={variant === "bottom" && dismissible && !reduced ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            className={cn(
              "fixed z-[201] flex flex-col bg-surface shadow-xl outline-none",
              variant === "bottom" &&
                "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-xl border-t border-line",
              variant === "side" &&
                "inset-y-0 right-0 w-full max-w-md border-l border-line sm:rounded-l-xl",
              variant === "center" &&
                "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line",
              className,
            )}
          >
            {variant === "bottom" && dismissible && (
              <div className="flex shrink-0 justify-center pt-3" aria-hidden>
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
            )}

            {(title || dismissible) && (
              <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-4">
                <div className="min-w-0">
                  {title && <h3 className="text-lg leading-snug">{title}</h3>}
                  {description && (
                    <p className="mt-1 text-[0.875rem] leading-snug text-muted">{description}</p>
                  )}
                </div>
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Band karein"
                    className="-m-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
                  >
                    <X className="size-5" />
                  </button>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

            {footer && (
              <div className="shrink-0 border-t border-line bg-surface px-5 py-4 pb-safe">
                {footer}
              </div>
            )}
      </motion.div>
    </>
  );
}
