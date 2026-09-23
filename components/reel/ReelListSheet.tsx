"use client";

import { ChevronRight } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { REEL_LANES, type ReelLane, type ReelLaneCounts } from "@/lib/contracts/reelLibrary";
import { REEL_LANE_ICONS } from "./ReelTopBar";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * My List — the five history lanes behind one door (D-91b, D-92c).
 *
 * They used to be five of the eight pills across the top of the photograph.
 * Each lane is a real list — Viewed is "dekha, kuch nahi kiya", Interest is
 * only the ones *sent* — and each deals the same full-screen cards as the
 * feed, so what changed is only where the door is: one button, one sheet,
 * every lane with its real count and one line saying what it holds.
 *
 * A lane with nobody in it is still listed, quietly, with its zero — here the
 * list is the map of what exists, not a set of doors to walk through (the
 * closing card, which offers doors, keeps its "only the ones with somebody"
 * rule).
 */
export default function ReelListSheet({
  open,
  onClose,
  counts,
  active,
  unreadMessages,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  counts: ReelLaneCounts;
  /** The lane on screen, if one is. */
  active: ReelLane | null;
  unreadMessages: number;
  onPick: (lane: ReelLane) => void;
}) {
  const t = useT();

  const LABELS: Record<ReelLane, string> = {
    VIEWED: t("reel.tabs.viewed", "Viewed"),
    LIKED: t("reel.tabs.liked", "Liked"),
    SHORTLIST: t("reel.tabs.shortlist", "Shortlist"),
    INTEREST: t("reel.tabs.interest", "Interest"),
    MESSAGE: t("reel.tabs.message", "Messages"),
  };
  const HINTS: Record<ReelLane, string> = {
    VIEWED: t("reel.list.viewedHint", "Dekhi, par kuch nahi kiya — dobara faisla karein"),
    LIKED: t("reel.list.likedHint", "Private like — sirf aapko dikhta hai"),
    SHORTLIST: t("reel.list.shortlistHint", "Saved — ghar me baat karne ke liye"),
    INTEREST: t("reel.list.interestHint", "Jinhe aapne interest bheja"),
    MESSAGE: t("reel.list.messageHint", "Jinse baat shuru ho chuki hai"),
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("reel.list.title", "My List")} variant="bottom">
      <ul className="-mx-1 flex flex-col pb-1">
        {REEL_LANES.map((lane) => {
          const Icon = REEL_LANE_ICONS[lane];
          const count = counts[lane] ?? 0;
          const isActive = lane === active;
          return (
            <li key={lane}>
              <button
                type="button"
                onClick={() => onPick(lane)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-bg-subtle",
                  isActive && "bg-bg-subtle",
                )}
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                  <Icon className="size-[18px]" aria-hidden />
                  {lane === "MESSAGE" && unreadMessages > 0 && (
                    <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-surface" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[0.9375rem] font-semibold text-ink">{LABELS[lane]}</span>
                    <span className={cn("text-[0.8125rem] tabular-nums", count === 0 ? "text-subtle" : "text-muted")}>{count}</span>
                    {lane === "MESSAGE" && unreadMessages > 0 && (
                      <span className="text-[0.75rem] font-semibold text-rose-600 dark:text-rose-300">
                        {(unreadMessages === 1
                          ? t("reel.tabs.unreadOne", "— 1 naya message")
                          : t("reel.tabs.unread", "— {n} naye message")
                        ).replace("{n}", String(unreadMessages))}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[0.8125rem] text-muted">{HINTS[lane]}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
