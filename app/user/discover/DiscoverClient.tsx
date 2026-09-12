"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Lock } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import {
  DISCOVER_PAGE_SIZE,
  EDUCATION_TIER_VALUES,
  GENDER_VALUES,
  MARITAL_STATUS_VALUES,
  countActiveFilters,
  describeFilters,
  hasAnySearchState,
  stateToSearchParams,
  type BehaviorMode,
  type BehaviorStatus,
  type DiscoverApiError,
  type DiscoverFilters,
  type DiscoverIntentResponse,
  type DiscoverMode,
  type DiscoverResultCard,
  type DiscoverSearchResponse,
  type DiscoverSort,
  type DiscoverUrlState,
  type LookingForGender,
  type PreferenceEvidence,
  type RelaxationSuggestion,
} from "@/lib/discovery/contract";
import { POPULAR_CITIES } from "@/lib/profile/quickPicks";
import DiscoverSearchHero from "@/components/discover/DiscoverSearchHero";
import AiSearchConfirmation from "@/components/discover/AiSearchConfirmation";
import ActiveFilterChips from "@/components/discover/ActiveFilterChips";
import DiscoverFilterSheet from "@/components/discover/DiscoverFilterSheet";
import DiscoverResults from "@/components/discover/DiscoverResults";
import PreferenceSetupCard from "@/components/discover/PreferenceSetupCard";
import DiscoverySettingsPanel, { type SettingsDto } from "@/components/discover/DiscoverySettingsPanel";
import { useDiscoverVoice } from "@/components/discover/useDiscoverVoice";

export interface DiscoverClientProps {
  entitled: boolean;
  initialSettings: SettingsDto;
  viewer: { city: string | null; defaultLookingFor: LookingForGender | null };
  preferenceState: PreferenceEvidence;
  /** From the URL when it carried a search, else derived from the saved preference. */
  initialState: DiscoverUrlState;
  /** The first page, already fetched on the server when there was something to search. */
  initialSearch: DiscoverSearchResponse | null;
}

interface ResultsState {
  items: DiscoverResultCard[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  offline: boolean;
  suggestions: RelaxationSuggestion[];
  behavior: BehaviorStatus | null;
  countLabel: string | null;
  /** False until the first search of this page load has been requested. */
  searched: boolean;
}

type Phase = "setup" | "search";

/**
 * The page's state machine. Two rules it exists to hold:
 *
 *  1. **Nothing searches by surprise.** A sentence goes to `/api/discover/intent`
 *     and comes back as a *proposal* (`AiSearchConfirmation`); the database is
 *     queried only after "Haan, profiles dikhao", a chip removal, a sheet
 *     "Apply", a sort/mode change or an accepted relaxation — every one a tap.
 *  2. **The last request wins.** Every search carries a request id and an
 *     AbortController; a response whose id is no longer current is dropped, so
 *     two quick refinements can never paint the older answer over the newer.
 *     Old cards stay on screen (dimmed) until the new page lands — a refine is
 *     not a blank slate.
 *
 * URL state mirrors the search (`stateToSearchParams`) via `replaceState`, so
 * refresh/back restore exactly what was on screen.
 */
export default function DiscoverClient({ entitled, initialSettings, viewer, preferenceState, initialState, initialSearch }: DiscoverClientProps) {
  const t = useT();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>(preferenceState === "NOT_PROVIDED" && !hasAnySearchState(initialState) && !initialSearch ? "setup" : "search");
  const [query, setQuery] = useState(initialState.query);
  const [filters, setFilters] = useState<DiscoverFilters>(initialSearch?.applied.filters ?? initialState.filters);
  const [mode, setMode] = useState<DiscoverMode>(initialState.mode);
  const [sort, setSort] = useState<DiscoverSort>(initialState.sort);
  const [behaviorMode, setBehaviorMode] = useState<BehaviorMode>(initialState.behaviorMode);

  const [intent, setIntent] = useState<DiscoverIntentResponse | null>(null);
  const [intentFilters, setIntentFilters] = useState<DiscoverFilters>({});
  const [intentBehavior, setIntentBehavior] = useState<BehaviorMode>("none");
  const [intentBusy, setIntentBusy] = useState(false);
  const [intentNotice, setIntentNotice] = useState<string | null>(null);
  const [setupPrefill, setSetupPrefill] = useState<DiscoverFilters | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [simpleOpen, setSimpleOpen] = useState(false);

  const [results, setResults] = useState<ResultsState>({
    items: initialSearch?.results ?? [],
    nextCursor: initialSearch?.nextCursor ?? null,
    loading: false,
    loadingMore: false,
    error: null,
    offline: false,
    suggestions: initialSearch?.suggestions ?? [],
    behavior: initialSearch?.applied.behavior ?? null,
    countLabel: initialSearch?.countLabel ?? null,
    searched: Boolean(initialSearch),
  });

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /* ── URL mirror ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined" || phase === "setup") return;
    const params = stateToSearchParams({ filters, mode, sort, behaviorMode, query });
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  }, [filters, mode, sort, behaviorMode, query, phase]);

  /* ── Search ─────────────────────────────────────────────────────────── */
  const search = useCallback(
    async (next: { filters: DiscoverFilters; mode: DiscoverMode; sort: DiscoverSort; behaviorMode: BehaviorMode }, cursor: string | null = null) => {
      if (!entitled) return;
      const id = ++reqIdRef.current;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setResults((r) => ({ ...r, loading: cursor === null, loadingMore: cursor !== null, error: null, offline: false, searched: true }));

      try {
        const res = await fetch("/api/discover/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: next.filters, mode: next.mode, sort: next.sort, behaviorMode: next.behaviorMode, cursor, pageSize: DISCOVER_PAGE_SIZE }),
          signal: ac.signal,
        });
        const json = (await res.json()) as DiscoverSearchResponse | DiscoverApiError;
        if (id !== reqIdRef.current) return; // a newer search has taken over
        if (!json.ok) {
          setResults((r) => ({ ...r, loading: false, loadingMore: false, error: json.message }));
          return;
        }
        setResults((r) => ({
          items: cursor ? [...r.items, ...json.results.filter((n) => !r.items.some((o) => o.profileId === n.profileId))] : json.results,
          nextCursor: json.nextCursor,
          loading: false,
          loadingMore: false,
          error: null,
          offline: false,
          suggestions: json.suggestions,
          behavior: json.applied.behavior,
          countLabel: json.countLabel,
          searched: true,
        }));
        // The server may have filled a default (gender) — show it as a chip.
        if (!cursor) setFilters(json.applied.filters);
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || id !== reqIdRef.current) return;
        setResults((r) => ({
          ...r,
          loading: false,
          loadingMore: false,
          offline: typeof navigator !== "undefined" && !navigator.onLine,
          error: t("discover.networkError", "Network error — dobara try karein."),
        }));
      }
    },
    [entitled, t],
  );

  const current = { filters, mode, sort, behaviorMode };

  function applyFilters(nextFilters: DiscoverFilters, overrides: Partial<typeof current> = {}) {
    const next = { ...current, ...overrides, filters: nextFilters };
    setFilters(nextFilters);
    if (overrides.mode) setMode(overrides.mode);
    if (overrides.sort) setSort(overrides.sort);
    if (overrides.behaviorMode) setBehaviorMode(overrides.behaviorMode);
    setIntent(null);
    void search(next);
  }

  /* ── Intent ─────────────────────────────────────────────────────────── */
  const runIntent = useCallback(
    async (q: string, options: { allowClarification: boolean; forSetup?: boolean }) => {
      if (!entitled) return;
      setIntentBusy(true);
      setIntentNotice(null);
      try {
        const res = await fetch("/api/discover/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, currentFilters: options.forSetup ? {} : filters, allowClarification: options.allowClarification }),
        });
        const json = (await res.json()) as DiscoverIntentResponse | DiscoverApiError;
        if (!json.ok) {
          setIntentNotice(
            json.code === "rate_limited"
              ? json.message
              : t("discover.intent.unavailable", "AI abhi available nahi hai — neeche filters se search waise hi chalti hai."),
          );
          if (json.code === "validation") setIntentNotice(json.message);
          return;
        }
        if (options.forSetup) {
          setSetupPrefill(json.filters);
          return;
        }
        setIntent(json);
        setIntentFilters(json.filters);
        setIntentBehavior(json.behaviorMode);
      } catch {
        setIntentNotice(t("discover.intent.unavailable", "AI abhi available nahi hai — neeche filters se search waise hi chalti hai."));
      } finally {
        setIntentBusy(false);
      }
    },
    [entitled, filters, t],
  );

  const voice = useDiscoverVoice((text) => {
    if (phaseRef.current === "setup") {
      void runIntent(text, { allowClarification: false, forSetup: true });
      return;
    }
    setQuery(text);
    void runIntent(text, { allowClarification: true });
  });

  function confirmIntent() {
    if (!intent) return;
    applyFilters(intentFilters, { behaviorMode: intentBehavior });
  }

  function answerClarification(answer: string) {
    const combined = `${query}. ${answer}`;
    setQuery(combined);
    void runIntent(combined, { allowClarification: false });
  }

  /* ── First-use setup ────────────────────────────────────────────────── */
  async function startFromSetup(setupFilters: DiscoverFilters, save: boolean) {
    setPhase("search");
    if (save) {
      try {
        const res = await fetch("/api/discover/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filters: setupFilters }) });
        const json = await res.json();
        if (json.ok) {
          const bits = [json.saved.lookingForGender, json.saved.ageRange, json.saved.cities?.join(", ")].filter(Boolean).join(" · ");
          toast({ title: t("discover.setup.saved", "Preference save ho gayi"), description: bits, tone: "success" });
        } else {
          toast({ title: t("discover.setup.saveFailed", "Preference save nahi hui"), description: json.message, tone: "error" });
        }
      } catch {
        toast({ title: t("discover.networkError", "Network error — dobara try karein."), tone: "error" });
      }
    }
    applyFilters(setupFilters);
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  const locked = !entitled;
  const liveSummary = describeFilters(intentFilters);

  return (
    <div className="space-y-4">
      <DiscoverSearchHero
        value={query}
        onChange={setQuery}
        onSubmit={(q) => void runIntent(q, { allowClarification: true })}
        onClear={() => {
          setQuery("");
          setIntent(null);
          setIntentNotice(null);
        }}
        voice={voice}
        busy={intentBusy}
        locked={locked}
        notice={intentNotice}
      />

      {locked && (
        <Card variant="soft" padding="md">
          <div className="flex items-center gap-3">
            <Lock className="size-5 shrink-0 text-wine-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold text-ink">{t("discover.lockedTitle", "Advanced Discovery paid plan me khulta hai")}</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {t("discover.lockedBody", "Filters neeche dikh rahe hain taaki aap dekh sakein ye kaam kaise karta hai — search chalane aur results dekhne ke liye plan upgrade karein.")}
              </p>
              <Link href="/user/subscription" className="mt-2 inline-flex h-9 items-center rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-4 text-[0.8125rem] font-semibold text-primary-fg shadow-gold">
                {t("discover.upgrade", "View Plans")}
              </Link>
            </div>
          </div>
        </Card>
      )}

      {intent && !locked && (
        <AiSearchConfirmation
          intent={intent}
          filters={intentFilters}
          onChangeFilters={setIntentFilters}
          behaviorMode={intentBehavior}
          summary={liveSummary}
          onConfirm={confirmIntent}
          onEdit={() => {
            setFilters(intentFilters);
            setSheetOpen(true);
          }}
          voice={voice}
          onAnswerClarification={answerClarification}
          busy={intentBusy || results.loading}
        />
      )}

      {phase === "setup" && !locked ? (
        <PreferenceSetupCard
          defaultLookingFor={viewer.defaultLookingFor}
          viewerCity={viewer.city}
          prefill={setupPrefill}
          voice={voice}
          busy={intentBusy}
          onStart={startFromSetup}
          locked={locked}
        />
      ) : (
        <>
          <ActiveFilterChips
            filters={filters}
            onChange={(next) => applyFilters(next)}
            onOpenFilters={() => setSheetOpen(true)}
            onClearAll={() => applyFilters({ lookingForGender: filters.lookingForGender })}
          />

          {!locked && (
            <DiscoverResults
              items={results.items}
              loading={results.loading}
              loadingMore={results.loadingMore}
              error={results.error}
              offline={results.offline}
              nextCursor={results.nextCursor}
              countLabel={results.countLabel}
              suggestions={results.suggestions}
              behavior={results.behavior}
              mode={mode}
              sort={sort}
              behaviorMode={behaviorMode}
              idle={!results.searched}
              onChangeMode={(m) => applyFilters(filters, { mode: m })}
              onChangeSort={(s) => applyFilters(filters, { sort: s })}
              onChangeBehaviorMode={(b) => applyFilters(filters, { behaviorMode: b })}
              onLoadMore={() => void search(current, results.nextCursor)}
              onRetry={() => void search(current)}
              onApplySuggestion={(s) => applyFilters(s.filters, { mode: s.mode })}
              onOpenFilters={() => setSheetOpen(true)}
            />
          )}

          {!results.searched && !locked && countActiveFilters(filters) === 0 && (
            <p className="text-center text-[0.8125rem] text-muted">{t("discover.idleHint", "Upar likh kar ya bol kar batayein, ya Filters se shuru karein.")}</p>
          )}
        </>
      )}

      <SimpleFilters
        open={simpleOpen}
        onToggle={() => setSimpleOpen((o) => !o)}
        filters={filters}
        viewerCity={viewer.city}
        onChange={(next) => (phase === "setup" ? setFilters(next) : applyFilters(next))}
        onOpenAll={() => setSheetOpen(true)}
      />

      <DiscoverySettingsPanel entitled={entitled} initialSettings={initialSettings} />

      <DiscoverFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={intent ? intentFilters : filters}
        viewerCity={viewer.city}
        onApply={(next) => {
          if (intent) {
            setIntentFilters(next);
            return;
          }
          if (phase === "setup") setPhase("search");
          applyFilters(next);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Simple filters — the collapsed quick set under the results          */
/* ------------------------------------------------------------------ */

function SimpleFilters({
  open,
  onToggle,
  filters,
  viewerCity,
  onChange,
  onOpenAll,
}: {
  open: boolean;
  onToggle: () => void;
  filters: DiscoverFilters;
  viewerCity: string | null;
  onChange: (next: DiscoverFilters) => void;
  onOpenAll: () => void;
}) {
  const t = useT();
  const set = <K extends keyof DiscoverFilters>(key: K, value: DiscoverFilters[K] | undefined) => {
    const next = { ...filters };
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const toggleList = (key: "cities" | "maritalStatus", value: string) => {
    const cur = (filters[key] ?? []) as string[];
    set(key, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
  };
  const chip = (active: boolean) =>
    cn("h-9 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors", active ? "border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink");
  const cities = [...new Set([...(viewerCity ? [viewerCity] : []), ...POPULAR_CITIES])].slice(0, 9);

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <h2>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="discover-simple-filters" className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
          <span className="text-[0.9375rem] font-semibold text-ink">{t("discover.simple.title", "Simple Filters")}</span>
          <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h2>
      <div id="discover-simple-filters" hidden={!open} className="space-y-3 border-t border-line px-4 pb-4 pt-3">
        <div>
          <p className="mb-1.5 text-[0.75rem] font-medium text-subtle">{t("discover.f.lookingFor", "Looking for")}</p>
          <div className="flex gap-1.5" role="radiogroup">
            {GENDER_VALUES.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={filters.lookingForGender === g} onClick={() => set("lookingForGender", g)} className={chip(filters.lookingForGender === g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
          <label className="block">
            <span className="mb-1.5 block text-[0.75rem] font-medium text-subtle">{t("discover.f.minAge", "Min age")}</span>
            <input type="number" inputMode="numeric" min={18} max={80} value={filters.minAge ?? ""} onChange={(e) => set("minAge", e.target.value ? Math.min(80, Math.max(18, Math.round(Number(e.target.value)))) : undefined)} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.75rem] font-medium text-subtle">{t("discover.f.maxAge", "Max age")}</span>
            <input type="number" inputMode="numeric" min={18} max={80} value={filters.maxAge ?? ""} onChange={(e) => set("maxAge", e.target.value ? Math.min(80, Math.max(18, Math.round(Number(e.target.value)))) : undefined)} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-[0.875rem] text-ink outline-none focus:border-gold-500" />
          </label>
        </div>
        <div>
          <p className="mb-1.5 text-[0.75rem] font-medium text-subtle">{t("discover.f.city", "Current city")}</p>
          <div className="flex flex-wrap gap-1.5">
            {cities.map((c) => (
              <button key={c} type="button" aria-pressed={(filters.cities ?? []).includes(c)} onClick={() => toggleList("cities", c)} className={chip((filters.cities ?? []).includes(c))}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[0.75rem] font-medium text-subtle">{t("discover.f.educationTier", "Highest education")}</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {EDUCATION_TIER_VALUES.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={filters.educationTier === v} onClick={() => set("educationTier", filters.educationTier === v ? undefined : v)} className={chip(filters.educationTier === v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[0.75rem] font-medium text-subtle">{t("discover.f.marital", "Marital status")}</p>
          <div className="flex flex-wrap gap-1.5">
            {MARITAL_STATUS_VALUES.map((v) => (
              <button key={v} type="button" aria-pressed={(filters.maritalStatus ?? []).includes(v)} onClick={() => toggleList("maritalStatus", v)} className={chip((filters.maritalStatus ?? []).includes(v))}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 py-1">
          <span className="text-[0.875rem] text-ink">{t("discover.f.verifiedOnly", "Sirf verified profiles")}</span>
          <input type="checkbox" checked={Boolean(filters.verifiedOnly)} onChange={(e) => set("verifiedOnly", e.target.checked || undefined)} className="size-5 accent-primary" />
        </label>
        <button type="button" onClick={onOpenAll} className="text-[0.8125rem] font-semibold text-wine-700 hover:underline">
          {t("discover.simple.all", "Saare filters dekhein →")}
        </button>
      </div>
    </section>
  );
}
