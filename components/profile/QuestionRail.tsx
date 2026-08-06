"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Mic } from "lucide-react";
import type { ProfileFieldDef } from "@/lib/profile/fields";
import { isAnswered, type ProfileValues } from "@/lib/profile/stages";
import type { FieldMeta } from "@/lib/profile/profileState";
import type { LocalGuess } from "@/lib/profile/localDetect";
import { cn } from "@/lib/utils";
import { haptic, spring } from "@/lib/motion";
import InfoTip from "@/components/ui/InfoTip";

const RAIL_LEGEND =
  "Hara tick = ho gaya. Gold glow = abhi ye poochha ja raha hai. Dashed border = sun raha hoon — jaise hi bologe, pakega. Ho gaye hue par tap karke badal sakte hain.";

type ChipState = "current" | "done" | "unsure" | "listening" | "pending";

function stateFor(
  field: ProfileFieldDef,
  values: ProfileValues,
  meta: Record<string, FieldMeta>,
  currentKey: string | string[] | null,
  guess: LocalGuess | undefined,
): ChipState {
  const isCurrent = Array.isArray(currentKey) ? currentKey.includes(field.key) : field.key === currentKey;
  if (isCurrent) return "current";
  if (isAnswered(field, values)) {
    return meta[field.key]?.confirmed === false ? "unsure" : "done";
  }
  if (guess) return "listening";
  return "pending";
}

const STATE_CLASS: Record<ChipState, string> = {
  current:
    "border-gold-400 bg-gold-50 text-gold-800 shadow-[0_0_0_3px_rgba(201,169,110,0.25)] dark:bg-gold-900/40 dark:text-gold-100",
  done: "border-trust/30 bg-trust-bg text-trust",
  unsure: "border-warn/40 bg-warn-bg text-warn",
  listening: "border-dashed border-gold-400/60 bg-gold-50/60 text-gold-700 dark:bg-gold-900/20 dark:text-gold-300",
  pending: "border-line bg-bg-subtle text-muted",
};

function RailChip({
  field,
  state,
  justLanded,
  onEdit,
}: {
  field: ProfileFieldDef;
  state: ChipState;
  justLanded: boolean;
  onEdit: (key: string) => void;
}) {
  const reduced = useReducedMotion();
  const clickable = state === "done" || state === "unsure";

  // The pop-once glow — same technique as DraftTray's Chip: a prop that stays
  // true for the whole turn gets its own short timer, so the pulse means
  // "landed just now" rather than "still true from three questions ago".
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!justLanded) return;
    setGlow(true);
    const t = setTimeout(() => setGlow(false), 1500);
    return () => clearTimeout(t);
  }, [justLanded]);

  const content = (
    <>
      {state === "done" && <Check className="size-3" strokeWidth={3} />}
      {state === "current" &&
        (reduced ? (
          <Mic className="size-3" />
        ) : (
          <motion.span aria-hidden animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>
            <Mic className="size-3" />
          </motion.span>
        ))}
      <span className="max-w-[7.5rem] truncate">{field.label}</span>
    </>
  );

  const classes = cn(
    "flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[0.75rem] font-medium transition-colors",
    STATE_CLASS[state],
    glow && !reduced && "animate-jadu",
  );

  return clickable ? (
    <button
      type="button"
      onClick={() => {
        haptic("tap");
        onEdit(field.key);
      }}
      className={classes}
    >
      {content}
    </button>
  ) : (
    <span className={classes}>{content}</span>
  );
}

export interface QuestionRailProps {
  fields: ProfileFieldDef[];
  values: ProfileValues;
  meta: Record<string, FieldMeta>;
  /** More than one key lights up "current" at once for a batched voice turn — a plain array works the same as a single key everywhere else. */
  currentKey: string | string[] | null;
  localGuesses: Partial<Record<string, LocalGuess>>;
  /** Keys confirmed this turn — drives the one-time landing glow. */
  justLandedKeys: string[];
  onEdit: (key: string) => void;
  className?: string;
  /** A single horizontally-scrolling row instead of a wrapping sticky panel —
   *  for hosting the rail inside a fixed-height card (the voice question's
   *  swipe-deck card) rather than a scrolling page. */
  compact?: boolean;
}

/**
 * The whole current stage, always visible, one chip per field.
 *
 * Fixed set on purpose — a rolling "next 3" reshuffles under the user's thumb
 * every time an answer lands, which is exactly what made the old upcoming-tip
 * feel unstable. Showing the entire stage instead means a chip only ever moves
 * through pending → listening → current → done, once, and never resets
 * position — the fixed layout is what makes a chip lighting up read as
 * progress rather than noise.
 */
export default function QuestionRail({
  fields,
  values,
  meta,
  currentKey,
  localGuesses,
  justLandedKeys,
  onEdit,
  className,
  compact = false,
}: QuestionRailProps) {
  const reduced = useReducedMotion();
  const doneCount = fields.filter((f) => isAnswered(f, values)).length;

  return (
    <div
      className={cn(
        compact
          ? "rounded-lg border border-line/60 bg-bg-subtle/60 p-2"
          : "sticky top-2 z-10 rounded-lg border border-line/70 bg-surface/85 p-3 shadow-lg backdrop-blur-xl",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between gap-2", compact ? "mb-1.5" : "mb-2")}>
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
          {doneCount} / {fields.length} ho gaya
        </span>
        <InfoTip text={RAIL_LEGEND} label="How to read this rail" />
      </div>

      <ul className={cn(compact ? "flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5" : "flex flex-wrap gap-1.5")}>
        <AnimatePresence initial={false}>
          {fields.map((field) => (
            <motion.li
              key={field.key}
              layout={!reduced}
              transition={spring.soft}
              className={cn("list-none", compact && "shrink-0")}
            >
              <RailChip
                field={field}
                state={stateFor(field, values, meta, currentKey, localGuesses[field.key])}
                justLanded={justLandedKeys.includes(field.key)}
                onEdit={onEdit}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
