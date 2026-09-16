"use client";

import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelLens } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The four lenses over today's deck — frosted pills floating on the photograph.
 *
 * They filter the reel that already exists; they never ask for a different
 * one. That is the honest shape for this product: the day's fifteen are the
 * day's fifteen, and a tab that quietly fetched more would turn the daily
 * limit into decoration. So every lens is a question the card behind it can
 * already answer:
 *
 *   For You     — the server's own ranking, untouched.
 *   Nearby      — `card.nearby`: the same city you typed on your profile.
 *   New         — `card.isNew`: joined in the last month.
 *   Compatible  — `card.rankScore !== null`: a real personal comparison exists
 *                 for this pair. Not "a high score" — a *computed* one, which
 *                 is the only claim the data supports.
 *
 * A lens with nothing left in it dims rather than disappearing, and still
 * opens: hiding it would leave a member wondering where the tab went, and the
 * empty state names the reason in a sentence. `counts` is how many *undecided*
 * cards each lens still holds, so the row describes the deck as it stands
 * rather than as it was dealt.
 *
 * The row scrolls horizontally rather than shrinking its pills. On a 360px
 * phone four pills at a readable size do not fit, and the two ways out of that
 * are a pill whose label is cut in half or a row you can nudge — the second is
 * the one that never hides a word.
 *
 * No filter icon here, unlike the first pass: partner preferences and the
 * "Reel aur recommendation settings" panel both live on `/user/discover`, and
 * the header's search already goes there. Two controls landing on one page is
 * one control too many on a row this narrow.
 */
export const REEL_LENSES: ReelLens[] = ["FOR_YOU", "NEARBY", "NEW", "COMPATIBLE"];

export default function ReelTabs({
  active,
  counts,
  seen,
  total,
  onChange,
}: {
  active: ReelLens;
  counts: Record<ReelLens, number>;
  /** How many of today's cards have been decided — the "4" in "4/15". */
  seen: number;
  total: number;
  onChange: (lens: ReelLens) => void;
}) {
  const t = useT();

  const LABELS: Record<ReelLens, string> = {
    FOR_YOU: t("reel.tabs.forYou", "For You"),
    NEARBY: t("reel.tabs.nearby", "Nearby"),
    NEW: t("reel.tabs.new", "New"),
    COMPATIBLE: t("reel.tabs.compatible", "Compatible"),
  };

  return (
    <div className="flex items-center gap-2 px-3 pb-1 sm:px-4">
      <div
        role="tablist"
        aria-label={t("reel.tabs.groupLabel", "Aaj ke rishton ke lens")}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {REEL_LENSES.map((lens) => {
          const isActive = lens === active;
          const empty = counts[lens] === 0;
          return (
            <button
              key={lens}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (!isActive) haptic("select");
                onChange(lens);
              }}
              className={cn(
                "relative inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-[0.875rem] font-semibold shadow-sm backdrop-blur-md transition-colors",
                isActive
                  ? "border-white/55 bg-black/45 text-white"
                  : empty
                    ? "border-white/20 bg-black/20 text-white/55"
                    : "border-white/25 bg-black/25 text-white/90 hover:bg-black/40",
              )}
            >
              {LABELS[lens]}
              {/* The active mark sits under the words inside the pill — the
                  reference's own weight. Rose rather than the brand's wine:
                  wine-700 is nearly black and would vanish on a frosted dark
                  pill, which is the one thing a "you are here" mark may not do. */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-4 bottom-[7px] h-[2.5px] rounded-full bg-rose-500 transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              {empty && !isActive && (
                <span className="sr-only">{t("reel.tabs.emptySuffix", "— aaj is lens me koi nahi")}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* The daily ritual, as a number instead of fifteen unreadable dots. */}
      <span
        className="hidden h-10 shrink-0 items-center rounded-full border border-white/25 bg-black/25 px-2.5 text-[0.75rem] font-semibold tabular-nums text-white/90 shadow-sm backdrop-blur-md min-[400px]:inline-flex"
        aria-label={t("reel.tabs.progressLabel", "Aaj ke rishtey").concat(`: ${seen}/${total}`)}
      >
        {seen}/{total}
      </span>
    </div>
  );
}
