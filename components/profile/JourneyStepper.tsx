"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic, spring } from "@/lib/motion";
import Celebrate from "@/components/ui/Celebrate";
import CountUp from "@/components/ui/CountUp";
import { useT } from "@/components/i18n/LanguageProvider";

export type JourneyStep = {
  key: string;
  label: string;
  /** Shown under the label when this is the active step. */
  hint?: string;
  /** Unlocked reward — the reason to finish this step. */
  unlocks?: string;
  locked?: boolean;
};

export interface JourneyStepperProps {
  steps: JourneyStep[];
  currentIndex: number;
  completionPercent: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Profile wizard progress.
 *
 * Two deliberate choices:
 *
 *  1. Each step advertises what it *unlocks*, not just what it asks for.
 *     "Family details" is a chore; "Family details → 40% zyada profiles aapko
 *     dhoondh payengi" is a reason.
 *
 *  2. Crossing a 25% milestone fires a one-time celebration. Rationed, so it
 *     stays meaningful (see Celebrate).
 */
export default function JourneyStepper({
  steps,
  currentIndex,
  completionPercent,
  onStepClick,
  className,
}: JourneyStepperProps) {
  const t = useT();
  const reduced = useReducedMotion();
  const [celebrate, setCelebrate] = useState(false);
  const lastMilestone = useRef(Math.floor(completionPercent / 25));

  useEffect(() => {
    const milestone = Math.floor(completionPercent / 25);
    if (milestone > lastMilestone.current) {
      lastMilestone.current = milestone;
      setCelebrate(true);
      haptic("success");
    }
  }, [completionPercent]);

  const active = steps[currentIndex];

  return (
    <div className={cn("relative", className)}>
      <Celebrate trigger={celebrate} origin="top" onDone={() => setCelebrate(false)} />

      {/* Progress header */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
            {t("profile.journeyStepper.progressLabel", "Profile complete")}
          </p>
          <p className="font-[family-name:var(--font-display)] text-3xl leading-none text-ink">
            <CountUp value={completionPercent} suffix="%" />
          </p>
        </div>

        {active?.unlocks && (
          <motion.p
            key={active.key}
            initial={reduced ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-[55%] text-right text-[0.75rem] leading-snug text-primary-text"
          >
            {active.unlocks}
          </motion.p>
        )}
      </div>

      {/* Bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
        role="progressbar"
        aria-valuenow={completionPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("profile.journeyStepper.progressBarAriaLabel", "Profile completion")}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-gold-500 to-trust"
          initial={{ width: 0 }}
          animate={{ width: `${completionPercent}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Steps */}
      <ol className="mt-6 space-y-1">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          const clickable = Boolean(onStepClick) && !step.locked && i <= currentIndex;

          return (
            <li key={step.key}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (!clickable) return;
                  haptic("select");
                  onStepClick?.(i);
                }}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex w-full min-h-12 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  clickable && "hover:bg-bg-subtle",
                  !clickable && "cursor-default",
                )}
              >
                <span className="relative grid size-7 shrink-0 place-items-center">
                  {current && !reduced && (
                    <motion.span
                      layoutId="step-halo"
                      transition={spring.snappy}
                      className="absolute inset-0 rounded-full bg-primary/20"
                    />
                  )}
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full border-2 text-[0.625rem] font-bold transition-colors",
                      done && "border-trust bg-trust text-white",
                      current && "border-primary bg-primary text-primary-fg",
                      !done && !current && "border-line-strong bg-surface text-subtle",
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : step.locked ? (
                      <Lock className="size-3" />
                    ) : (
                      i + 1
                    )}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[0.9375rem] leading-snug",
                      current ? "font-semibold text-ink" : done ? "text-muted" : "text-subtle",
                    )}
                  >
                    {step.label}
                  </span>
                  {current && step.hint && (
                    <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">
                      {step.hint}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
