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
 * Quiet on purpose — 41px pills with an ivory hairline and no icons — because
 * they sit under a large question and above a keyboard, and are only ever a
 * shortcut: every one could also be said or typed. The measurements are the
 * reference's own: 41px tall, fully rounded, and a 15px gutter between them.
 * The old 7px gutter read as a segmented control rather than as separate
 * answers, which is a different promise than the one this page makes.
 *
 * The chosen one takes the burgundy fill and a rose rim — the one tap on the
 * page that has already committed to something. That state is drawn from
 * `aria-pressed` alone (`.bolo-chip`, globals.css), so what a screen reader is
 * told and what the eye sees can never drift apart. Each keeps a 48px hit area
 * (`touch-target`, D-23) however small it looks.
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
    <div role="group" aria-label={label} className="flex flex-wrap gap-x-[15px] gap-y-[10px]">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          aria-pressed={chip.selected}
          onClick={() => onPick(chip.id)}
          className={cn(
            "bolo-chip touch-target inline-flex h-[41px] min-w-[84px] items-center justify-center whitespace-nowrap px-[21px]",
            "text-[14px] leading-none active:scale-[0.97]",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
