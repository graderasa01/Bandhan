"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { EASE_LUXE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The page's hero: the one thing Grio is asking right now.
 *
 * A new question arrives from the right and the old one leaves to the left —
 * a quarter of a second, a fade and a short slide, the way the next card of a
 * deck comes up. Both cards share one grid cell while they cross, so nothing
 * below them jumps and nothing scrolls. Grio's mark and name stay put: it is
 * the same person asking, only the question changes.
 */
export default function GrioQuestion({
  id,
  question,
  eyebrow,
  hint,
  ack,
  className,
}: {
  /** A new id is a new question — that is what slides. */
  id: string;
  question: string;
  /** A quiet line above the question (a member's "Namaste Rahul — bas 3 baatein baaki hain"). */
  eyebrow?: ReactNode;
  /** The line under the question. */
  hint?: ReactNode;
  /** One word beside Grio's name, for the moment right after an answer lands. */
  ack?: string | null;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <section className={cn("relative isolate pt-5", className)}>
      <p className="sr-only" aria-live="polite">
        {question}
      </p>

      <div className="absolute left-0 top-0 z-10 flex items-center gap-2.5">
        <span className="grid size-11 place-items-center rounded-full border border-gold-300/70 bg-surface text-gold-600 shadow-[0_8px_18px_-10px_rgb(74_17_25/0.35)] dark:border-gold-800 dark:text-gold-300">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <p className="-mt-3 text-sm font-semibold text-accent-text" aria-hidden>
          Grio
          <AnimatePresence>
            {ack && (
              <motion.span
                key={ack}
                className="font-medium text-muted"
                initial={{ opacity: 0, x: reduced ? 0 : -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {" · "}
                {ack}
              </motion.span>
            )}
          </AnimatePresence>
        </p>
      </div>

      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div
            key={id}
            className="[grid-area:1/1]"
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.26, ease: EASE_LUXE }}
          >
            <div className="relative ml-3.5 mt-2">
              {/* The next card in the deck, just showing at the edge. */}
              <span
                aria-hidden
                className="absolute inset-y-3 -right-2 left-6 -z-10 rounded-[26px] border border-line/60 bg-surface/70"
              />
              {/* `bolo-q__card` is the aurora's hook (globals.css): while the
                  voice is live, a cool bloom is laid just outside the gold edge
                  below. Nothing about the card itself changes. */}
              <div className="bolo-q__card relative rounded-[26px] border border-line/60 border-r-2 border-r-gold-400/70 bg-surface px-5 pb-5 pt-7 shadow-[0_1px_2px_rgb(74_17_25/0.04),0_18px_40px_-26px_rgb(74_17_25/0.35)] dark:border-r-gold-700/70">
                {eyebrow && <p className="mb-1.5 text-[0.8125rem] font-medium text-muted">{eyebrow}</p>}
                <h1 className="bt-display text-[1.75rem] sm:text-[2rem]">{question}</h1>
                {hint && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{hint}</p>}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
