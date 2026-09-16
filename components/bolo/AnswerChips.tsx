"use client";

import { cn } from "@/lib/utils";

export interface AnswerChipView {
  id: string;
  label: string;
  /** Undefined for a chip that stores nothing ("+ Doosra shehar"). */
  selected?: boolean;
}

/**
 * The answers that can simply be tapped for the question on screen.
 *
 * Quiet on purpose — 36px pills, a hairline of gold, no icons — because they
 * sit under a large question and above a keyboard, and are only ever a
 * shortcut: every one could also be said or typed. The chosen one takes a
 * light wash of the accent, which is what a tap looks like while Grio's next
 * question is on its way. Each keeps a 48px hit area (`touch-target`, D-23)
 * however small it looks.
 */
export default function AnswerChips({
  chips,
  label,
  disabled,
  onPick,
}: {
  chips: AnswerChipView[];
  /** The question these answer — the group's accessible name. */
  label: string;
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-x-2 gap-y-2.5">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          aria-pressed={chip.selected}
          onClick={() => onPick(chip.id)}
          className={cn(
            "touch-target inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-[0.9375rem] font-medium leading-none",
            "transition-[background-color,border-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            "disabled:pointer-events-none disabled:opacity-50",
            chip.selected
              ? "border-accent/45 bg-accent/[0.07] text-accent-text dark:border-accent-text/50 dark:bg-accent/20"
              : "border-gold-300/80 bg-surface text-ink hover:border-gold-500 hover:bg-gold-50/70 dark:border-gold-800 dark:hover:bg-gold-900/30",
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
