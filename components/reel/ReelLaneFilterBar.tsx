"use client";

import { BadgeCheck, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";
import { REEL_SEARCH_AGE_BANDS, type ReelSearchState } from "@/lib/reel/searchFilters";

/**
 * The filter row for a Meri List lane — floating over the photograph, under
 * the tabs (D-91b).
 *
 * Exactly the four controls the search sheet carries, and deliberately the
 * same ones: a name, an age band, your own city, verified-only. They build
 * their filters through `buildReelSearchFilters`, so "Jaipur, 26–30,
 * Verified" means one thing in this app rather than three.
 *
 * It stays mounted while the member moves between lanes, which is the point —
 * "Jaipur wale" is a question you ask of Viewed *and* of Liked, and re-tapping
 * the chip in every lane would be the app forgetting what you just said.
 */
export default function ReelLaneFilterBar({
  state,
  viewerCity,
  onChange,
}: {
  state: ReelSearchState;
  /** Null hides the city chip rather than guessing a city. */
  viewerCity: string | null;
  onChange: (next: ReelSearchState) => void;
}) {
  const t = useT();

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-medium reel-glass",
      active && "reel-glass--on",
    );

  return (
    <div className="px-3 pb-1 sm:px-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" aria-hidden />
        <input
          type="search"
          value={state.name}
          onChange={(e) => onChange({ ...state, name: e.target.value })}
          maxLength={60}
          autoComplete="off"
          aria-label={t("reel.library.searchLabel", "Is list me naam se dhoondein")}
          placeholder={t("reel.library.searchPlaceholder", "Is list me dhoondein")}
          className="h-9 w-full rounded-full border border-white/25 bg-black/30 pl-9 pr-3 text-[0.8125rem] text-white outline-none backdrop-blur-md placeholder:text-white/55 focus:border-white/70"
        />
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {viewerCity && (
          <button
            type="button"
            onClick={() => {
              haptic("select");
              onChange({ ...state, city: state.city ? null : viewerCity });
            }}
            aria-pressed={Boolean(state.city)}
            className={chip(Boolean(state.city))}
          >
            <MapPin className="size-3" aria-hidden />
            {viewerCity}
          </button>
        )}
        {REEL_SEARCH_AGE_BANDS.map((b, i) => (
          <button
            key={b.label}
            type="button"
            onClick={() => {
              haptic("select");
              onChange({ ...state, band: state.band === i ? null : i });
            }}
            aria-pressed={state.band === i}
            className={chip(state.band === i)}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            haptic("select");
            onChange({ ...state, verifiedOnly: !state.verifiedOnly });
          }}
          aria-pressed={state.verifiedOnly}
          className={chip(state.verifiedOnly)}
        >
          <BadgeCheck className="size-3" aria-hidden />
          {t("reel.search.verifiedOnly", "Verified")}
        </button>

        {/* No count here: the pill above already carries it, and a second copy
            at the right edge lands on top of the utility rail. */}
      </div>
    </div>
  );
}
