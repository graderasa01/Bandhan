"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Celebrate from "./Celebrate";
import { useToast } from "./Toast";
import { spring } from "@/lib/motion";

/**
 * Mirrors lib/services/rewards/celebrationService.ts. The client never builds
 * one of these — it only renders what an API handed back.
 */
export interface Celebration {
  tier: "first" | "reward" | "micro";
  eventKey: string;
  title: string;
  subtitle?: string;
}

/**
 * Renders whatever celebration the server just returned.
 *
 * Drop it once near the surface that triggers actions and feed it the
 * `celebration` field from the API response:
 *
 * ```tsx
 * const [celebration, setCelebration] = useState<Celebration | null>(null);
 * // …after a successful POST:
 * setCelebration(json.celebration ?? null);
 * <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />
 * ```
 *
 * `first` gets the gold burst plus a centred card; `reward` becomes a toast;
 * `micro` is a no-op here because the haptic already fired at the tap.
 *
 * `prefers-reduced-motion` is honoured by `Celebrate` itself (it renders
 * nothing), so the card below carries the message on its own in that case —
 * a reduced-motion user should still be told they hit a milestone.
 */
export default function CelebrationHost({
  celebration,
  onDone,
}: {
  celebration: Celebration | null;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const [card, setCard] = useState<Celebration | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!celebration) {
      handled.current = null;
      return;
    }
    // A parent that re-renders must not replay the same celebration.
    const stamp = `${celebration.eventKey}:${celebration.title}`;
    if (handled.current === stamp) return;
    handled.current = stamp;

    if (celebration.tier === "first") {
      setCard(celebration);
      return;
    }
    if (celebration.tier === "reward") {
      toast({ tone: "success", title: celebration.title, description: celebration.subtitle });
      onDone?.();
    }
    // micro: the haptic already fired at the tap; nothing to draw.
  }, [celebration, toast, onDone]);

  function dismiss() {
    setCard(null);
    onDone?.();
  }

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          className="fixed inset-0 z-[240] grid place-items-center bg-ink/40 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          role="dialog"
          aria-live="polite"
          aria-label={card.title}
        >
          <Celebrate trigger origin="center" />
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.snappy}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-sm rounded-lg border border-gold-300/60 bg-surface p-6 text-center shadow-xl"
          >
            <p className="font-[family-name:var(--font-display)] text-xl font-bold text-wine-700">
              {card.title}
            </p>
            {card.subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{card.subtitle}</p>}
            <button
              type="button"
              onClick={dismiss}
              className="mt-5 min-h-12 w-full rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-6 text-sm font-semibold text-primary-fg shadow-gold"
            >
              Got It
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
