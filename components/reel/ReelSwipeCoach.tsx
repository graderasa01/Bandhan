"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bookmark, Check, Sparkles, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { ease } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The one-time "do ungliyon se swipe karein" notice.
 *
 * Why it exists: the card hands single-finger *vertical* movement to the
 * browser wherever the details pane can still scroll (`data-reel-scroll` +
 * `touch-pan-y`, see ReelCard.tsx). That hand-off is correct — reading the
 * details has to win over throwing the card away — but on a real phone it
 * reads as "ek ungli se card hilta hi nahi" (Devesh, 2026-08-08), because the
 * finger usually lands on the part of the card that scrolls. Two fingers
 * never enter that hand-off, so the card always moves.
 *
 * So this is a *gesture* explanation, not a feature tour: it is the first
 * thing on screen, it names the two-finger gesture, and it is gone for good
 * the moment the user taps OK. Deliberately NOT the 6s auto-hide that
 * `ManualProfileFormMobile`'s hand-coach uses — that one demonstrates a
 * gesture that already works, this one corrects an expectation, and an
 * expectation you never acknowledged isn't corrected.
 *
 * Key naming follows the app's existing hints (`manual-deck-swipe-hint-seen`,
 * `grio-bubble-hint-seen`).
 */
const HINT_SEEN_KEY = "reel-two-finger-hint-seen";

/** Has this device already been told? Answered on the client only — the
 *  server has no idea, and rendering a "seen" state it can't know would flash
 *  the notice at every returning user for one frame. */
function alreadySeen() {
  try {
    return window.localStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    return false; // private mode / storage blocked — showing it again is the safe miss
  }
}

export default function ReelSwipeCoach() {
  const t = useT();
  const DIRECTIONS = [
    { icon: Check, label: t("reel.swipeCoach.directionRight", "Right — Interest"), tone: "text-gold-700" },
    { icon: X, label: t("reel.swipeCoach.directionLeft", "Left — Abhi Nahi"), tone: "text-muted" },
    { icon: Bookmark, label: t("reel.swipeCoach.directionDown", "Down — Shortlist"), tone: "text-trust" },
    { icon: Sparkles, label: t("reel.swipeCoach.directionUp", "Up — AI se Poocho"), tone: "text-wine-700" },
  ] as const;
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    // Touch only. On a mouse the card drags fine with one button and there is
    // no second finger to talk about, so this would be a lie on desktop.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse && !alreadySeen()) setOpen(true);
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      /* nothing to do — it'll simply be shown again next time */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={ease.fast}
      // Sits inside the card area, not over the whole screen: the action bar
      // below stays usable, so a user who would rather tap than swipe can
      // simply start tapping and read this later.
      className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-ink/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reel-swipe-coach-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={ease.base}
        className="w-full max-w-[20rem] rounded-lg border border-line bg-surface p-5 text-center shadow-xl"
      >
        {/* Two fingertips travelling right — the gesture itself, not a hand
            icon that could be read as "tap here". */}
        <div className="mx-auto flex h-14 w-full max-w-[11rem] items-center justify-center rounded-md bg-bg-subtle">
          <motion.div
            className="flex gap-2"
            animate={reduce ? undefined : { x: [-26, 26, -26] }}
            transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
          >
            <span className="size-5 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 shadow-gold" />
            <span className="size-5 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 shadow-gold" />
          </motion.div>
        </div>

        <h2
          id="reel-swipe-coach-title"
          className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold text-wine-700"
        >
          {t("reel.swipeCoach.heading", "Card do ungliyon se swipe karein")}
        </h2>
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
          {t(
            "reel.swipeCoach.instructionPart1",
            "Ek ungli se card kabhi-kabhi nahi chalta — us waqt phone card ke andar ki details scroll kar raha hota hai.",
          )}{" "}
          <span className="font-semibold text-ink">{t("reel.swipeCoach.instructionBold", "Do ungliyan")}</span>{" "}
          {t(
            "reel.swipeCoach.instructionPart2",
            "rakhkar swipe karenge to card hamesha chalega. Neeche ke buttons se bhi wahi kaam hota hai.",
          )}
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-left">
          {DIRECTIONS.map(({ icon: Icon, label, tone }) => (
            <li key={label} className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-muted">
              <Icon className={`size-3.5 shrink-0 ${tone}`} />
              <span className="min-w-0 truncate">{label}</span>
            </li>
          ))}
        </ul>

        <Button variant="primary" size="md" className="mt-5 w-full" onClick={dismiss}>
          {t("reel.swipeCoach.gotIt", "OK, Got It")}
        </Button>
        <p className="mt-2 text-[0.6875rem] text-subtle">{t("reel.swipeCoach.oneTimeNote", "Ye sirf ek baar dikhega.")}</p>
      </motion.div>
    </motion.div>
  );
}
