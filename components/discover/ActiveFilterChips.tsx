"use client";

import { Lock, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { filtersToChips, removeChip, type DiscoverFilters, type FilterChip } from "@/lib/discovery/contract";

export interface ActiveFilterChipsProps {
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
  onOpenFilters: () => void;
  onClearAll?: () => void;
  /** Read-only rendering (the confirmation card owns its own edit affordance). */
  compact?: boolean;
  className?: string;
}

/**
 * Every active filter as a removable chip, plus the one button that opens the
 * full filter sheet. Chips are the *truth* of what will run — they render from
 * the same `DiscoverFilters` object the request is built from, so there is no
 * way for the UI to show one thing and search another.
 */
export default function ActiveFilterChips({ filters, onChange, onOpenFilters, onClearAll, compact = false, className }: ActiveFilterChipsProps) {
  const t = useT();
  const chips = filtersToChips(filters);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="group" aria-label={t("discover.chips.groupLabel", "Active filters")}>
      <button
        type="button"
        onClick={onOpenFilters}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30"
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {t("discover.chips.filters", "Filters")}
        {chips.length > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-fg">{chips.length}</span>
        )}
      </button>

      {chips.map((chip) => (
        <Chip key={chip.id} chip={chip} onRemove={() => onChange(removeChip(filters, chip))} />
      ))}

      {!compact && chips.length > 1 && onClearAll && (
        <button type="button" onClick={onClearAll} className="h-9 rounded-full px-2.5 text-[0.75rem] font-medium text-muted transition-colors hover:text-danger">
          {t("discover.chips.clearAll", "Clear all")}
        </button>
      )}
    </div>
  );
}

function Chip({ chip, onRemove }: { chip: FilterChip; onRemove: () => void }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-1 rounded-full border pl-3 pr-1 text-[0.8125rem] font-medium",
        chip.sensitive ? "border-wine-200/70 bg-wine-50 text-wine-700 dark:border-wine-400/25 dark:bg-wine-900/40 dark:text-wine-200" : "border-gold-300/60 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-200",
      )}
    >
      {chip.sensitive && <Lock className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">{chip.label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${t("discover.chips.remove", "Remove")} ${chip.label}`}
        className="grid size-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface/70"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
