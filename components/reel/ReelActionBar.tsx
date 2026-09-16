"use client";

import { Bookmark, Sparkles, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelSwipeDirection } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The four decisions, and only the four decisions.
 *
 * Real click-equivalents for every drag gesture (§4.5 — non-negotiable):
 * screen-reader and keyboard users get exactly what a swipe gives.
 *
 * ## The names are the actions
 *
 * DOWN is "Shortlist", not "Family Ko". It wore a Users icon and that label
 * for a long time while the thing it actually does is `prisma.shortlist.upsert`
 * — the family angle is only what you can do *afterwards*, and that offer
 * already lives one step later inside `ReelShortlistSheet`. Naming the button
 * after the follow-up made people believe swipe-down was saving nothing
 * (reported 2026-08-07; the DB showed every DOWN swipe had written its row
 * correctly all along).
 *
 * LEFT is "Not now" rather than "Skip": it records a LEFT decision for today's
 * reel only — nothing is blocked and nobody is rejected.
 *
 * ## Why Interest is not a heart
 *
 * A heart is the single most dating-app gesture there is, and this action
 * sends a formal expression of interest that the other family may read. Two
 * figures side by side is the same promise the brand's interlocking rings
 * make. The label stays "Interest" and the API behind it is untouched.
 *
 * Priority is expressed in weight, not size-to-the-point-of-absurdity:
 * Interest is filled maroon with a gold ring, Ask Grio is blush, Shortlist is
 * a quiet green tint, Not now is plain ivory. All four stay visible and all
 * four clear 44px.
 */
export default function ReelActionBar({
  onAction,
  disabled,
}: {
  onAction: (direction: ReelSwipeDirection) => void;
  disabled?: boolean;
}) {
  const t = useT();

  const ACTIONS: {
    direction: ReelSwipeDirection;
    icon: typeof X;
    label: string;
    tone: "neutral" | "ai" | "family" | "primary";
  }[] = [
    { direction: "LEFT", icon: X, label: t("reel.actionBar.notNow", "Not now"), tone: "neutral" },
    { direction: "UP", icon: Sparkles, label: t("reel.actionBar.askGrio", "Ask Grio"), tone: "ai" },
    { direction: "DOWN", icon: Bookmark, label: t("reel.actionBar.shortlist", "Shortlist"), tone: "family" },
    { direction: "RIGHT", icon: Users, label: t("reel.actionBar.interest", "Interest"), tone: "primary" },
  ];

  return (
    <div
      className="flex items-start justify-around gap-1 px-3"
      role="group"
      aria-label={t("reel.actionBar.groupLabel", "Rishta actions")}
    >
      {ACTIONS.map(({ direction, icon: Icon, label, tone }) => (
        <button
          key={direction}
          type="button"
          disabled={disabled}
          onClick={() => {
            haptic(direction === "RIGHT" ? "success" : "tap");
            onAction(direction);
          }}
          aria-label={label}
          className={cn(
            "flex min-w-[4rem] flex-col items-center gap-2 rounded-2xl py-1 transition-transform",
            "hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <span
            className={cn(
              "grid place-items-center rounded-full transition-colors",
              tone === "primary"
                ? "size-[3.75rem] bg-accent text-gold-200 shadow-[0_10px_28px_rgb(74_17_25_/_0.4)] ring-2 ring-gold-400/70"
                : "size-[3.5rem] shadow-md",
              tone === "ai" && "bg-wine-50 text-wine-700 ring-1 ring-wine-200 dark:bg-wine-900/50 dark:text-wine-200 dark:ring-wine-700/50",
              tone === "family" && "bg-trust-bg text-trust ring-1 ring-trust/25",
              tone === "neutral" && "bg-surface text-muted ring-1 ring-line-strong",
            )}
          >
            <Icon className={cn(tone === "primary" ? "size-7" : "size-6")} aria-hidden />
          </span>
          <span
            className={cn(
              "text-[0.8125rem] font-semibold leading-none",
              tone === "primary" ? "text-accent-text" : "text-muted",
            )}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
