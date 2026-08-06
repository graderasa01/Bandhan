"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, CircleAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic, spring } from "@/lib/motion";
import { AIFilledBadge } from "@/components/ui/Field";

export type StreamField = {
  key: string;
  label: string;
  /** null means AI could not read it — this must stay visible, not hidden. */
  value: string | null;
  confidence: number;
  /** AI derived this rather than reading it (e.g. city → state). */
  inferred?: boolean;
};

export interface FieldFillStreamProps {
  fields: StreamField[];
  /** Drive externally (real extraction) or let it self-advance (demo). */
  filledCount?: number;
  autoPlay?: boolean;
  intervalMs?: number;
  onComplete?: () => void;
  className?: string;
}

/**
 * The signature profile-building moment.
 *
 * As extraction streams in, each field lands one at a time with its confidence
 * badge. This is the single screen that has to convince a user the AI is real —
 * a spinner followed by a filled form does not land the same way.
 *
 * Product rules made visible here (master_plan §10.2–10.4):
 *   • null values stay on screen as "padha nahi ja saka" — never hidden
 *   • inferred values are visually separated from read values
 *   • low confidence pulses for attention instead of looking settled
 */
export default function FieldFillStream({
  fields,
  filledCount,
  autoPlay = false,
  intervalMs = 900,
  onComplete,
  className,
}: FieldFillStreamProps) {
  const reduced = useReducedMotion();
  const controlled = filledCount !== undefined;
  const [internal, setInternal] = useState(reduced || !autoPlay ? fields.length : 0);

  const shown = controlled ? filledCount : internal;

  useEffect(() => {
    if (controlled || !autoPlay || reduced) return;
    if (internal >= fields.length) {
      onComplete?.();
      return;
    }
    const t = setTimeout(() => {
      setInternal((n) => n + 1);
      haptic("select");
    }, intervalMs);
    return () => clearTimeout(t);
  }, [internal, controlled, autoPlay, reduced, fields.length, intervalMs, onComplete]);

  const done = shown >= fields.length;
  const readCount = fields.slice(0, shown).filter((f) => f.value !== null).length;
  const missCount = fields.slice(0, shown).filter((f) => f.value === null).length;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Live status — screen readers get progress too */}
      <div
        className="flex items-center justify-between gap-3 pb-1"
        aria-live="polite"
        aria-atomic="true"
      >
        {/* min-w-0 is load-bearing: this line swaps between a short "padh raha
            hai…" and a much longer "N details mil gayi, N nahi padhi ja saki"
            every demo loop. A flex item defaults to min-width:auto and so
            refuses to shrink below its text — on a phone the longer string
            pushed this card, and with it the hero's whole grid column, wider
            than the screen, on the demo's own cycle. */}
        <span className="inline-flex min-w-0 items-center gap-2 text-[0.8125rem] font-medium text-muted">
          <Sparkles
            className={cn(
              "size-3.5 shrink-0 text-primary-text",
              !done && !reduced && "animate-pulse",
            )}
          />
          <span className="min-w-0">
            {done
              ? `${readCount} details mil gayi${missCount > 0 ? `, ${missCount} nahi padhi ja saki` : ""}`
              : "AI aapka biodata padh raha hai…"}
          </span>
        </span>
        <span className="shrink-0 text-[0.75rem] tabular-nums text-subtle">
          {shown}/{fields.length}
        </span>
      </div>

      {fields.map((field, i) => {
        const isShown = i < shown;
        const missing = field.value === null;

        return (
          <motion.div
            key={field.key}
            layout
            transition={reduced ? { duration: 0 } : spring.soft}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors duration-500",
              isShown
                ? missing
                  ? "border-warn/30 bg-warn-bg"
                  : field.inferred
                    ? "border-info/25 bg-info-bg"
                    : "border-line bg-surface"
                : "border-line/50 bg-bg-subtle",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] uppercase tracking-wider text-subtle">
                {field.label}
                {field.inferred && isShown && (
                  <span className="ml-1.5 normal-case tracking-normal text-info">· AI ne nikala</span>
                )}
              </p>

              <div className="mt-0.5 min-h-[1.375rem]">
                <AnimatePresence mode="wait" initial={false}>
                  {isShown ? (
                    <motion.p
                      key="v"
                      initial={reduced ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className={cn(
                        "truncate text-[0.9375rem]",
                        missing ? "italic text-warn" : "font-medium text-ink",
                      )}
                    >
                      {field.value ?? "Padha nahi ja saka — aap bhar dijiye"}
                    </motion.p>
                  ) : (
                    <motion.span
                      key="s"
                      exit={{ opacity: 0 }}
                      className="skeleton block h-3.5 w-2/3 rounded-full"
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>

            {isShown && (
              <motion.span
                initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: 0.08 }}
                className="shrink-0"
              >
                {missing ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn-bg px-2 py-0.5 text-[0.625rem] font-semibold text-warn">
                    <CircleAlert className="size-2.5" />
                    Missing
                  </span>
                ) : (
                  <AIFilledBadge confidence={field.confidence} />
                )}
              </motion.span>
            )}
          </motion.div>
        );
      })}

      {/* The non-negotiable rule, on screen — master_plan §33.16 */}
      <div className="flex items-start gap-2.5 rounded-md border border-line bg-bg-subtle px-4 py-3">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary-text" />
        <p className="text-[0.75rem] leading-snug text-muted">
          Kuch bhi save nahi hota jab tak{" "}
          <span className="font-semibold text-ink">aap review karke confirm</span> na karein.
        </p>
      </div>
    </div>
  );
}
