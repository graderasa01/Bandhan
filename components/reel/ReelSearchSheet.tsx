"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Loader2, MapPin, Search, SlidersHorizontal } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import DiscoverResultCard from "@/components/discover/DiscoverResultCard";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";
import {
  type DiscoverApiError,
  type DiscoverResultCard as ResultCard,
  type DiscoverSearchResponse,
} from "@/lib/discovery/contract";
import {
  REEL_SEARCH_AGE_BANDS,
  buildReelSearchFilters,
  hasReelSearchQuery,
  type ReelSearchState,
} from "@/lib/reel/searchFilters";

/**
 * Search, with its filters inside it — the reel's own (D-91).
 *
 * ## Why this exists next to /user/discover
 *
 * The reel's search icon used to be a link to the Advanced Discovery page:
 * thirty-odd filters in seven groups, an AI sentence parser, and a settings
 * panel. That page is the right tool for "Jaipur ki, 26–30, MBA, non-smoker" —
 * and completely the wrong one for what people actually do on the card screen,
 * which is look for one person by name, or narrow to a city and keep swiping.
 *
 * So this sheet carries the four controls that answer almost every real
 * question — a name, an age band, your own city, verified-only — and nothing
 * else. Everything beyond that is one tap away at the bottom, unchanged. This
 * is a shortcut over the same engine, never a second one: the request goes to
 * `/api/discover/search` with the same `DiscoverFilters` the full page sends,
 * so a result here is a result there.
 *
 * ## What it does not do
 *
 * It does not deal searched profiles into the deck. A card in the reel carries
 * a rank, a ring and its reasons — all of which are statements about the
 * ranking, and none of which are true of a row that matched because somebody
 * typed three letters of a name. The results link to the real profile page
 * instead, which is the surface built to say "here is this person" without
 * claiming the app chose them.
 */

/** Typing settles before the server is asked — one search per pause, not per keystroke. */
const DEBOUNCE_MS = 350;

export default function ReelSearchSheet({
  open,
  onClose,
  viewerCity,
}: {
  open: boolean;
  onClose: () => void;
  /** The viewer's own city, for the one-tap "mere sheher me" chip. Null hides it. */
  viewerCity: string | null;
}) {
  const t = useT();

  const [name, setName] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const [myCity, setMyCity] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [results, setResults] = useState<ResultCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countLabel, setCountLabel] = useState<string | null>(null);

  /** Only the newest search may write to the screen — a slow first request must
   *  never overwrite the results of the query typed after it. */
  const runId = useRef(0);

  // One object, built by one pure function — see `lib/reel/searchFilters.ts`
  // for why the assembly does not live inline here.
  //
  // Memoised on the four primitives, and that is load-bearing rather than an
  // optimisation: `search` closes over this object and the debounce effect
  // depends on `search`. A fresh literal every render would make the effect
  // re-run on the very state change `search` itself causes (`setBusy`), and
  // the box would search forever without anybody typing.
  const state = useMemo<ReelSearchState>(
    () => ({ name, band, city: myCity ? viewerCity : null, verifiedOnly }),
    [name, band, myCity, viewerCity, verifiedOnly],
  );
  const hasQuery = hasReelSearchQuery(state);

  const search = useCallback(async () => {
    const id = ++runId.current;
    setBusy(true);
    setError(null);

    const filters = buildReelSearchFilters(state);

    try {
      const res = await fetch("/api/discover/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `strict`: what was asked for is what is searched. A "flexible" pass
        // would return people who miss the filter and label it — useful on the
        // full page, confusing in a box somebody typed a name into.
        body: JSON.stringify({ filters, mode: "strict", sort: "newest", behaviorMode: "none", pageSize: 12 }),
      });
      const body = (await res.json()) as DiscoverSearchResponse | DiscoverApiError;
      if (id !== runId.current) return;
      if (!res.ok || body.ok === false) {
        setError(
          (body as DiscoverApiError).message ??
            t("reel.search.failed", "Search nahi ho paayi — dobara try karein."),
        );
        setResults(null);
        return;
      }
      setResults(body.results);
      setCountLabel(body.countLabel);
    } catch {
      if (id !== runId.current) return;
      setError(t("reel.search.failed", "Search nahi ho paayi — dobara try karein."));
      setResults(null);
    } finally {
      if (id === runId.current) setBusy(false);
    }
  }, [state, t]);

  // Nothing asked for → nothing shown. An empty box must not quietly become
  // "everybody", which is what a search that runs with no filters would be.
  useEffect(() => {
    if (!open) return;
    if (!hasQuery) {
      setResults(null);
      setCountLabel(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => void search(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, hasQuery, search]);

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors",
      active
        ? "border-gold-400 bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200"
        : "border-line-strong bg-surface text-ink hover:border-gold-400",
    );

  return (
    <Sheet open={open} onClose={onClose} title={t("reel.search.title", "Rishta dhoondein")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="off"
          aria-label={t("reel.search.nameLabel", "Naam se dhoondein")}
          placeholder={t("reel.search.placeholder", "Naam likhein — kisi ka bhi")}
          className="h-12 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[0.9375rem] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-gold-500 focus:shadow-[0_0_0_3px_rgb(201_169_110_/_0.28)]"
        />
      </div>

      {/* The whole filter, four taps wide. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {viewerCity && (
          <button type="button" onClick={() => { haptic("select"); setMyCity((v) => !v); }} aria-pressed={myCity} className={chip(myCity)}>
            <MapPin className="size-3.5" aria-hidden />
            {viewerCity}
          </button>
        )}
        {REEL_SEARCH_AGE_BANDS.map((b, i) => (
          <button
            key={b.label}
            type="button"
            onClick={() => { haptic("select"); setBand((v) => (v === i ? null : i)); }}
            aria-pressed={band === i}
            className={chip(band === i)}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { haptic("select"); setVerifiedOnly((v) => !v); }}
          aria-pressed={verifiedOnly}
          className={chip(verifiedOnly)}
        >
          <BadgeCheck className="size-3.5" aria-hidden />
          {t("reel.search.verifiedOnly", "Verified")}
        </button>
      </div>

      <div className="mt-4 min-h-[8rem]">
        {!hasQuery ? (
          <p className="px-1 py-6 text-center text-[0.875rem] leading-relaxed text-muted">
            {t(
              "reel.search.hint",
              "Naam likhein ya upar se ek chip chunein — jo bhi member aapke liye dikh sakta hai, mil jayega.",
            )}
          </p>
        ) : busy && results === null ? (
          <p className="flex items-center justify-center gap-2 py-8 text-[0.875rem] text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("reel.search.searching", "Dhoondh rahe hain…")}
          </p>
        ) : error ? (
          <p role="alert" className="px-1 py-6 text-center text-[0.875rem] leading-relaxed text-danger">
            {error}
          </p>
        ) : results && results.length === 0 ? (
          <p className="px-1 py-6 text-center text-[0.875rem] leading-relaxed text-muted">
            {t("reel.search.none", "Is naam ya filter se koi profile nahi mili. Thoda kam filter laga kar dekhein.")}
          </p>
        ) : (
          <>
            {countLabel && (
              <p className="mb-2 px-1 text-[0.75rem] font-medium text-subtle" aria-live="polite">
                {countLabel}
              </p>
            )}
            <div className={cn("space-y-2 transition-opacity", busy && "opacity-60")}>
              {results?.map((card) => (
                <DiscoverResultCard key={card.profileId} card={card} />
              ))}
            </div>
          </>
        )}
      </div>

      <Link
        href="/user/discover"
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-[0.875rem] font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {t("reel.search.allFilters", "Poore filters")}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Sheet>
  );
}
