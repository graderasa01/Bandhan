"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Snap = "half" | "full";

/** Share of the viewport each snap point covers. Half leaves the face on screen. */
const HALF = 0.6;
const FULL = 0.92;
const SPRING = { type: "spring", stiffness: 380, damping: 40, restDelta: 0.5 } as const;

/**
 * A bottom sheet with two heights — the reel's "see more" that keeps the
 * person on screen.
 *
 * The app's `Sheet` sizes itself to its content, and a full profile is long:
 * it came up to 88% of the screen and covered the photograph it was
 * describing, so reading about somebody meant losing sight of them. This one
 * opens at **60%** — the top of the photo, the face, stays visible above it —
 * and only goes to 92% when the reader asks for more: by dragging the handle
 * up, or simply by scrolling the content, which is the gesture that already
 * means "show me more".
 *
 * Height, not a transform, is what moves: the footer (the sheet's primary
 * action) is pinned to the bottom of the sheet at every height, instead of
 * sitting below the fold of a half-hidden panel.
 *
 * Accessibility mirrors `Sheet` exactly — a dialog, focus moved in and
 * trapped, Escape closes, focus restored — because a second overlay primitive
 * that forgot any one of those would be a regression dressed as a feature.
 */
export default function ReelSnapSheet({
  open,
  onClose,
  ariaLabel,
  header,
  footer,
  children,
  expandKey,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** Sticky at the top — the person's identity, so the reader never loses whose page this is. */
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Changing this opens the sheet straight at full height (a deep link into one section). */
  expandKey?: string | null;
}) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const height = useMotionValue(0);
  const [mounted, setMounted] = useState(open);
  const [snap, setSnap] = useState<Snap>("half");
  const drag = useRef<{ id: number; startY: number; startH: number; t: number; lastY: number; lastT: number } | null>(null);

  const vh = () => (typeof window === "undefined" ? 800 : window.innerHeight);
  const heightFor = (s: Snap) => Math.round(vh() * (s === "full" ? FULL : HALF));
  // The scrim deepens as the sheet rises: at half the photo must still read.
  const scrimOpacity = useTransform(height, (h) => Math.min(1, h / (vh() * FULL)) * 0.7);

  function to(target: number, then?: () => void) {
    if (reduced) {
      height.set(target);
      then?.();
      return;
    }
    const controls = animate(height, target, SPRING);
    if (then) void controls.then(then);
  }

  // Open / close. Mounting is controlled here for the same reason `Sheet`
  // controls it: an overlay that outlives its close must never swallow a tap.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const start: Snap = expandKey ? "full" : "half";
      setSnap(start);
      requestAnimationFrame(() => to(heightFor(start)));
      return;
    }
    to(0, () => setMounted(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !expandKey) return;
    setSnap("full");
    to(heightFor("full"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandKey]);

  // Focus in, focus trapped, focus restored — the same contract as `Sheet`.
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement;
    const timer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panelRef.current)?.focus();
    }, 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
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
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  // Reading on is asking for more: the first real scroll at half height takes
  // the sheet to full, so nobody has to find the handle to see the rest.
  function onScroll() {
    if (snap === "half" && (scrollRef.current?.scrollTop ?? 0) > 12) {
      setSnap("full");
      to(heightFor("full"));
    }
  }

  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    // Buttons in the header (close) keep their own click.
    if ((e.target as HTMLElement).closest("button, a")) return;
    const now = performance.now();
    drag.current = { id: e.pointerId, startY: e.clientY, startH: height.get(), t: now, lastY: e.clientY, lastT: now };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* survivable */
    }
  }
  function onHandleMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const next = Math.max(0, Math.min(vh() * FULL, d.startH - (e.clientY - d.startY)));
    height.set(next);
    d.lastY = e.clientY;
    d.lastT = performance.now();
  }
  function onHandleUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const moved = Math.abs(e.clientY - d.startY);
    const dt = Math.max(1, performance.now() - d.t) / 1000;
    const vy = (e.clientY - d.startY) / dt; // px/s, down is positive
    const h = height.get();
    const half = heightFor("half");
    const full = heightFor("full");
    // A tap on the handle toggles, the way every sheet with a grabber does.
    if (moved < 6) {
      const next: Snap = snap === "half" ? "full" : "half";
      setSnap(next);
      to(heightFor(next));
      return;
    }
    if (vy > 900 || h < half * 0.62) {
      onClose();
      return;
    }
    const next: Snap = vy < -700 || h > (half + full) / 2 ? "full" : "half";
    setSnap(next);
    to(heightFor(next));
  }

  if (!mounted) return null;

  return (
    <>
      <motion.div
        aria-hidden
        onClick={onClose}
        style={{ opacity: scrimOpacity }}
        className={cn("fixed inset-0 z-[200] bg-black", !open && "pointer-events-none")}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={{ height }}
        className={cn(
          // The elevated weight of the glass system — the one surface that is
          // nearly opaque, because it has to win over a photograph.
          "bt-surface--elevated fixed inset-x-0 bottom-0 z-[201] flex flex-col overflow-hidden rounded-t-2xl border-t border-line shadow-xl outline-none",
          "md:left-1/2 md:right-auto md:w-[min(34rem,100%)] md:-translate-x-1/2",
        )}
      >
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="shrink-0 cursor-grab touch-none select-none border-b border-line active:cursor-grabbing"
        >
          <div className="flex justify-center pt-2.5" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </div>
          <div className="flex items-center gap-3 px-4 pb-3 pt-2">
            <div className="min-w-0 flex-1">{header}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
          {children}
        </div>

        {footer && <div className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-safe">{footer}</div>}
      </motion.div>
    </>
  );
}
