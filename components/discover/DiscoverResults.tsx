"use client";

import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { BehaviorMode, BehaviorStatus, DiscoverMode, DiscoverResultCard as CardModel, DiscoverSort, RelaxationSuggestion } from "@/lib/discovery/contract";
import DiscoverResultCard from "./DiscoverResultCard";
import DiscoverEmptyState from "./DiscoverEmptyState";

export interface DiscoverResultsProps {
  items: CardModel[];
  /** True while the *first* page of a new search is in flight. Old cards stay on screen, dimmed. */
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  offline: boolean;
  nextCursor: string | null;
  countLabel: string | null;
  suggestions: RelaxationSuggestion[];
  behavior: BehaviorStatus | null;
  mode: DiscoverMode;
  sort: DiscoverSort;
  behaviorMode: BehaviorMode;
  onChangeMode: (m: DiscoverMode) => void;
  onChangeSort: (s: DiscoverSort) => void;
  onChangeBehaviorMode: (b: BehaviorMode) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onApplySuggestion: (s: RelaxationSuggestion) => void;
  onOpenFilters: () => void;
  /** Nothing has been searched yet on this page load. */
  idle: boolean;
}

const BEHAVIOR_OPTIONS: { value: BehaviorMode; label: string }[] = [
  { value: "none", label: "Sirf mere filters" },
  { value: "activity", label: "Meri activity ke hisaab se" },
  { value: "shortlist", label: "Meri shortlist jaisi profiles" },
  { value: "positive", label: "Mere recent positive choices jaisi" },
];

/**
 * The result list and the three controls that shape it. Counts are honest:
 * "12+ profiles" while more pages exist, an exact number only when the last
 * page has been reached. While a new search loads, the previous cards stay
 * visible under a subtle veil rather than flashing to blank — the user is
 * refining, not starting over.
 */
export default function DiscoverResults(props: DiscoverResultsProps) {
  const t = useT();
  const { items, loading, loadingMore, error, offline, nextCursor, suggestions, behavior, mode, sort, behaviorMode, idle } = props;
  const showSkeleton = loading && items.length === 0;
  const count = items.length;
  const countText =
    count === 0 ? null : `${count}${nextCursor ? "+" : ""} ${count === 1 && !nextCursor ? t("discover.results.profile", "profile") : t("discover.results.profiles", "profiles")}`;

  return (
    <section aria-labelledby="discover-results-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="discover-results-heading" className="mr-auto text-[0.9375rem] font-semibold text-ink" aria-live="polite">
          {loading && items.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("discover.results.updating", "Update ho raha hai…")}
            </span>
          ) : countText ? (
            countText
          ) : idle ? (
            t("discover.results.idle", "Results")
          ) : loading ? (
            t("discover.results.searching", "Dhoondh rahe hain…")
          ) : (
            t("discover.results.none", "Koi profile nahi")
          )}
        </h2>

        <div className="flex overflow-hidden rounded-full border border-line-strong" role="radiogroup" aria-label={t("discover.results.modeLabel", "Search mode")}>
          {(["strict", "flexible"] as DiscoverMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => props.onChangeMode(m)}
              title={m === "strict" ? t("discover.results.strictHint", "Har filter exact match — kuch bhi relax nahi hota") : t("discover.results.flexibleHint", "Ek preference chhoot jaye to bhi dikhayein — card par likha hoga kitni mili")}
              className={cn("h-9 px-3 text-[0.75rem] font-semibold transition-colors", mode === m ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:bg-bg-subtle")}
            >
              {m === "strict" ? t("discover.results.strict", "Strict") : t("discover.results.flexible", "Flexible")}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-[0.75rem] text-muted">
          <span className="sr-only sm:not-sr-only">{t("discover.results.sortLabel", "Sort")}</span>
          <select
            value={sort}
            onChange={(e) => props.onChangeSort(e.target.value as DiscoverSort)}
            aria-label={t("discover.results.sortLabel", "Sort")}
            className="h-9 rounded-full border border-line-strong bg-surface px-3 text-[0.75rem] font-semibold text-ink outline-none focus:border-gold-500"
          >
            <option value="newest">{t("discover.results.sortNewest", "Newest first")}</option>
            <option value="trust">{t("discover.results.sortTrust", "Trust score")}</option>
          </select>
        </label>

        <select
          value={behaviorMode}
          onChange={(e) => props.onChangeBehaviorMode(e.target.value as BehaviorMode)}
          aria-label={t("discover.results.smartLabel", "Smart mode")}
          className="h-9 max-w-full rounded-full border border-line-strong bg-surface px-3 text-[0.75rem] font-semibold text-ink outline-none focus:border-gold-500"
        >
          {BEHAVIOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {behavior && behavior.mode !== "none" && behavior.message && (
        <p
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-[0.8125rem] leading-snug",
            behavior.state === "active" ? "border-gold-300/60 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-200" : "border-line bg-surface-2 text-muted",
          )}
        >
          {behavior.message}
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[0.8125rem] text-danger">
          {offline ? <WifiOff className="size-4 shrink-0" aria-hidden /> : null}
          <span className="min-w-0 flex-1">{offline ? t("discover.results.offline", "Aap offline hain — internet aane par dobara try karein.") : error}</span>
          <button type="button" onClick={props.onRetry} className="inline-flex h-8 items-center gap-1 rounded-full border border-danger/40 px-3 text-[0.75rem] font-semibold">
            <RefreshCw className="size-3.5" aria-hidden />
            {t("discover.results.retry", "Retry")}
          </button>
        </div>
      )}

      {showSkeleton ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true" aria-label={t("discover.results.loading", "Loading")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-line bg-surface p-3.5">
              <Skeleton className="size-[76px] shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-3 w-full" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length > 0 ? (
        <>
          <ul className={cn("grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2", loading && "opacity-60")} aria-busy={loading || undefined}>
            {items.map((card) => (
              <li key={card.profileId}>
                <DiscoverResultCard card={card} />
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={loadingMore || loading}
                onClick={props.onLoadMore}
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-5 text-[0.875rem] font-semibold text-ink transition-colors hover:border-gold-500 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("discover.results.loadMore", "Aur dikhayein")}
              </button>
            </div>
          )}
        </>
      ) : !idle && !loading && !error ? (
        <DiscoverEmptyState suggestions={suggestions} onApplySuggestion={props.onApplySuggestion} onOpenFilters={props.onOpenFilters} busy={loading} />
      ) : null}
    </section>
  );
}
