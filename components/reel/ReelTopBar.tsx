"use client";

import { Bookmark, ChevronDown, ChevronLeft, Eye, Heart, Layers, MessageCircle, Search, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { REEL_LENSES, type ReelLens } from "@/lib/contracts/reel";
import type { ReelLane } from "@/lib/contracts/reelLibrary";
import { useT } from "@/components/i18n/LanguageProvider";

/** The icon each lane wears — here, in the My List sheet and on the closing card alike. */
export const REEL_LANE_ICONS: Record<ReelLane, LucideIcon> = {
  VIEWED: Eye,
  LIKED: Heart,
  SHORTLIST: Bookmark,
  INTEREST: Send,
  MESSAGE: MessageCircle,
};

/**
 * The reel's whole top edge — one quiet row over the photograph.
 *
 * ## What it replaced
 *
 * Two rows of chrome: a header carrying the full BandhanTak wordmark, a
 * search icon, an "Ask Grio" pill, the notice bell and the member's avatar;
 * and under it a scrolling rail of **eight** frosted pills (three lenses, a
 * hairline, five history lanes), each with a number. Together they took the
 * top fifth of every photo, and the eight pills read as eight equal choices
 * when one of them — For You — is what the screen is for.
 *
 * ## What each thing became
 *
 * - **The lenses** are three words, centred, with a gold mark under the one
 *   you are in: For You · Nearby · New. They filter the feed you are
 *   scrolling, so they stay one tap away and in the same place.
 * - **The five history lanes** (Viewed, Liked, Shortlist, Interest, Messages)
 *   are one "My List" button on the left, opening a sheet that names each
 *   with its real count. They are a different *kind* of place — people you
 *   already acted on — and a different kind of place belongs behind a door,
 *   not in the same row as a filter. Inside a lane this button becomes the way
 *   back, and the centre names the lane, so the row always says where you are.
 * - **Search** stays on the right. It is also the reel's filter (D-91).
 * - **The wordmark, the avatar and the bell are gone from the photo.** The
 *   app's own bottom nav is on this screen now (see `AppShell`'s `immersive`),
 *   so Today, the hub and the unread dots all live where they live on every
 *   other page, and the brand is carried by the room's colour and type rather
 *   than by a logo standing on somebody's forehead.
 *
 * Counts are gone from the lens words, deliberately: "For You 19" counted the
 * cards loaded in memory, which is a number about the app, not about anybody.
 * The lanes keep theirs (in the sheet), because "Shortlist 5" is a fact about
 * the member's own list. Screen readers still hear both.
 */
export default function ReelTopBar({
  lens,
  lane,
  laneLabel,
  laneCount,
  lensCounts,
  unreadMessages,
  onLens,
  onOpenList,
  onExitLane,
  onSearch,
}: {
  lens: ReelLens;
  /** The history lane on screen, or null in the feed. */
  lane: ReelLane | null;
  laneLabel: string;
  laneCount: number;
  /** Cards loaded that each lens still holds — read out, never printed. */
  lensCounts: Record<ReelLens, number>;
  /** A reply is waiting somewhere — the My List door carries a dot, since Messages is behind it. */
  unreadMessages: number;
  onLens: (lens: ReelLens) => void;
  onOpenList: () => void;
  onExitLane: () => void;
  onSearch: () => void;
}) {
  const t = useT();

  const LENS_LABELS: Record<ReelLens, string> = {
    FOR_YOU: t("reel.tabs.forYou", "For You"),
    NEARBY: t("reel.tabs.nearby", "Nearby"),
    NEW: t("reel.tabs.new", "New"),
  };

  const LaneIcon = lane ? REEL_LANE_ICONS[lane] : null;
  // White type straight on the photograph, lifted by a soft shadow and the
  // card's own top scrim — no pill behind the words, which is what made the
  // old rail a second strip of chrome.
  const onPhoto = "text-white [text-shadow:0_1px_8px_rgb(0_0_0_/_0.55)]";

  // The row itself lets a drag through to the feed underneath; only its
  // controls catch a tap (the parent sets `pointer-events: none`, which
  // every child inherits unless it asks otherwise).
  return (
    <div className="flex h-11 items-center gap-1 px-1.5 sm:px-2">
      {lane ? (
        <button
          type="button"
          onClick={onExitLane}
          aria-label={t("reel.top.backToFeed", "Back to For You")}
          className={cn("pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10", onPhoto)}
        >
          <ChevronLeft className="size-6 drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.5)]" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenList}
          aria-label={
            unreadMessages > 0
              ? t("reel.top.myListUnread", "My List — Viewed, Liked, Shortlist, Interest, Messages — naya message aaya hai")
              : t("reel.top.myList", "My List — Viewed, Liked, Shortlist, Interest, Messages")
          }
          className={cn("pointer-events-auto relative grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10", onPhoto)}
        >
          <Layers className="size-[22px] drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.5)]" aria-hidden />
          {unreadMessages > 0 && (
            <span aria-hidden className="absolute right-2 top-2 size-2.5 rounded-full bg-rose-500 ring-2 ring-black/30" />
          )}
        </button>
      )}

      <div className="flex min-w-0 flex-1 justify-center">
        {lane && LaneIcon ? (
          // Tapping the lane's name opens the list again — the quickest way
          // from one lane to the next without going back to the feed first.
          <button
            type="button"
            onClick={onOpenList}
            className={cn("pointer-events-auto inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-2 text-[0.9375rem] font-semibold", onPhoto)}
          >
            <LaneIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{laneLabel}</span>
            <span className="tabular-nums text-white/70">{laneCount}</span>
            <ChevronDown className="size-4 shrink-0 text-white/80" aria-hidden />
            <span className="sr-only">{t("reel.top.switchLane", "— doosri list kholein")}</span>
          </button>
        ) : (
          <div role="tablist" aria-label={t("reel.tabs.groupLabel", "Aaj ke rishton ke lens")} className="flex items-center gap-1">
            {REEL_LENSES.map((l) => {
              const active = l === lens;
              return (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onLens(l)}
                  className={cn(
                    "pointer-events-auto relative inline-flex min-h-11 items-center px-2.5 text-[0.9375rem] font-semibold transition-colors min-[380px]:px-3",
                    onPhoto,
                    !active && "text-white/70 hover:text-white/90",
                  )}
                >
                  {LENS_LABELS[l]}
                  {/* Gold, short and under the word — the brand's colour doing
                      the brand's job, where a wordmark used to stand. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-1.5 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-gold-300 shadow-[0_0_8px_rgb(221_172_81_/_0.6)] transition-opacity",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="sr-only">
                    {lensCounts[l] === 0
                      ? t("reel.tabs.emptySuffix", "— is lens me abhi koi nahi")
                      : (lensCounts[l] === 1
                          ? t("reel.tabs.countSuffixOne", "— 1 profile baaki")
                          : t("reel.tabs.countSuffix", "— {n} profiles baaki")
                        ).replace("{n}", String(lensCounts[l]))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSearch}
        aria-label={t("reel.header.search", "Search aur reel filters")}
        className={cn("pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10", onPhoto)}
      >
        <Search className="size-[22px] drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.5)]" aria-hidden />
      </button>
    </div>
  );
}
