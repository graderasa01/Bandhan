"use client";

import { SearchX, SlidersHorizontal } from "lucide-react";
import Card from "@/components/ui/Card";
import { useT } from "@/components/i18n/LanguageProvider";
import type { RelaxationSuggestion } from "@/lib/discovery/contract";

/**
 * Zero results, said plainly. The server never relaxed anything to avoid this
 * screen; instead it may offer specific relaxations it has already checked
 * would return something. Each one is a button the user presses — the search
 * changes only when they do.
 */
export default function DiscoverEmptyState({
  suggestions,
  onApplySuggestion,
  onOpenFilters,
  busy,
}: {
  suggestions: RelaxationSuggestion[];
  onApplySuggestion: (s: RelaxationSuggestion) => void;
  onOpenFilters: () => void;
  busy: boolean;
}) {
  const t = useT();
  return (
    <Card variant="soft" padding="md" className="text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-surface text-muted">
        <SearchX className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-[0.9375rem] font-semibold text-ink">{t("discover.empty.title", "In filters se koi profile nahi mili")}</p>
      <p className="mt-1 text-[0.8125rem] text-muted">
        {suggestions.length > 0
          ? t("discover.empty.withSuggestions", "Kuch bhi apne aap nahi badla gaya. Neeche ke options se search thodi kholi ja sakti hai — aap chunein.")
          : t("discover.empty.noSuggestions", "Kuch bhi apne aap nahi badla gaya. Filters badal kar dobara dekhein.")}
      </p>
      {suggestions.length > 0 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-2" aria-label={t("discover.empty.suggestionsLabel", "Search kholne ke options")}>
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApplySuggestion(s)}
                className="h-10 rounded-full border border-gold-300/70 bg-gold-50 px-4 text-[0.8125rem] font-semibold text-gold-700 transition-colors hover:border-gold-500 disabled:opacity-50 dark:bg-gold-900/30 dark:text-gold-200"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onOpenFilters}
        className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[0.8125rem] font-semibold text-ink transition-colors hover:border-gold-500"
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {t("discover.empty.editFilters", "Filters badlein")}
      </button>
    </Card>
  );
}
