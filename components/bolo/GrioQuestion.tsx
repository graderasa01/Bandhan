"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE_LUXE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The page's hero: the one thing Grio is asking right now.
 *
 * A new question arrives as a physical card laid over the last one: it comes
 * in from the right with a little perspective, a couple of percent of scale
 * and a depth shadow that travels with it, while the one it replaces recedes
 * and dims rather than sliding out from under. This is the page-transition
 * language of the glass system (globals.css, "Page transition — one physical
 * glass card laid over the last") spent where it is actually seen. No rotation
 * beyond a degree: a card being laid down, not a card being flipped.
 *
 * Both cards share one grid cell while they cross, so nothing below them jumps
 * and nothing scrolls.
 *
 * The card is a pane of the page's own glass with a gold rim, and Grio's seal
 * sits half off its top-left corner — the one thing on the page that overlaps
 * another, which is what makes the card read as a card rather than a panel.
 * Her name rides inside the card beside the seal, in the room's gold, so the
 * whole question — who is asking, what they asked, and how it may be answered —
 * is one object. The seal is 46px and double-ringed, and the card's radius is
 * 21px: both measured off the reference rather than chosen.
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
    <section className={cn("relative isolate", className)}>
      <p className="sr-only" aria-live="polite">
        {question}
      </p>

      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div
            key={id}
            className="[grid-area:1/1] pl-[5px] pt-[5px]"
            style={{ transformPerspective: 1600 }}
            // No `filter` on the card that stays. Any filter — even an identity
            // `brightness(1)` left behind at rest — makes this wrapper a
            // backdrop root, and the glass pane inside it can then only blur
            // what is inside the wrapper: nothing. On the satin room a 0.64
            // body hid that; on a photo room's clear glass it showed the photo
            // sharp and undimmed behind the question. Only the leaving card
            // dims, and its keyframes say where that starts.
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 44, scale: 0.965, rotateY: -1 }}
            animate={{ opacity: 1, x: 0, scale: 1, rotateY: 0 }}
            exit={
              reduced
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    x: -18,
                    scale: 0.94,
                    filter: ["brightness(1)", "brightness(0.72)"],
                    transition: { duration: 0.24, ease: EASE_LUXE },
                  }
            }
            transition={{ duration: 0.34, ease: EASE_LUXE }}
          >
            {/* `bolo-q__card` is the live light's hook (globals.css): while the
                voice is open, a cool bloom is laid just outside the gold rim.
                Nothing about the card itself changes. */}
            <div className="bolo-pane bolo-q__card px-[21px] pb-[17px] pt-[10px]">
              {/* Grio's seal sits half off the card's corner — the same person
                  asking, whichever question the card is showing. */}
              <span className="bolo-seal absolute -left-[7px] -top-[7px] grid size-[46px] place-items-center rounded-full">
                <svg viewBox="0 0 24 24" className="size-[23px]" aria-hidden>
                  <path
                    d="M10.6 3.1c.27 0 .5.19.57.45l.86 3.2c.3 1.13 1.19 2.02 2.32 2.32l3.2.86c.55.15.55.93 0 1.08l-3.2.86c-1.13.3-2.02 1.19-2.32 2.32l-.86 3.2c-.15.55-.93.55-1.08 0l-.86-3.2c-.3-1.13-1.19-2.02-2.32-2.32l-3.2-.86c-.55-.15-.55-.93 0-1.08l3.2-.86c1.13-.3 2.02-1.19 2.32-2.32l.86-3.2c.07-.26.3-.45.57-.45Z"
                    fill="#f2a032"
                    stroke="rgb(255 246 232 / 0.95)"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18.6 2.6v3.3M20.25 4.25h-3.3"
                    stroke="rgb(255 246 232 / 0.95)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <p className="ml-[31px] text-[15.5px] font-semibold leading-[1.2] text-gold" aria-hidden>
                Grio
                <AnimatePresence>
                  {ack && (
                    <motion.span
                      key={ack}
                      className="font-normal text-secondary"
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
              {/* The card has a floor height (globals.css, `.bolo-q__card`), and
                  this block is centred in it: the question never sits at the top
                  of a tall card with a hole under it. */}
              <div className="flex flex-1 flex-col justify-center">
                {eyebrow && <p className="mb-[8px] text-[13px] font-medium text-secondary">{eyebrow}</p>}
                <h1 className="bolo-q">{question}</h1>
                {hint && <p className="mt-[11px] text-[16.5px] leading-[1.3] text-secondary">{hint}</p>}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
