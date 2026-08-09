"use client";

import { Bookmark, Heart, MessageSquareText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelSwipeDirection } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * DOWN is "Shortlist", not "Family Ko".
 *
 * It wore a Users icon and that label for a long time while the thing it
 * actually does is `prisma.shortlist.upsert` — the family angle is only what
 * you can do *afterwards* with a shortlisted profile, and that offer already
 * lives one step later, inside `ReelShortlistSheet`. Naming the button after
 * the follow-up instead of the action made people believe swipe-down wasn't
 * saving anything (reported 2026-08-07; the DB showed every DOWN swipe had
 * written its row correctly all along). The button now says what it does.
 */
/**
 * Real click-equivalent for every drag gesture (§4.5 — non-negotiable).
 * Screen-reader and keyboard users get the exact same four actions.
 */
export default function ReelActionBar({
  onAction,
  disabled,
}: {
  onAction: (direction: ReelSwipeDirection) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const ACTIONS: { direction: ReelSwipeDirection; icon: typeof X; label: string; tone: string }[] = [
    { direction: "LEFT", icon: X, label: t("reel.actionBar.skip", "Skip"), tone: "neutral" },
    { direction: "UP", icon: MessageSquareText, label: t("reel.actionBar.askAi", "AI se Poocho"), tone: "ai" },
    { direction: "DOWN", icon: Bookmark, label: t("reel.actionBar.shortlist", "Shortlist"), tone: "family" },
    { direction: "RIGHT", icon: Heart, label: t("reel.actionBar.interest", "Interest"), tone: "primary" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("reel.actionBar.groupLabel", "Rishta actions")}>
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
            "flex min-h-12 touch-target flex-col items-center gap-1.5 rounded-lg py-2 transition-transform md:py-1.5",
            "hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <span
            className={cn(
              "grid size-11 place-items-center rounded-full transition-colors md:size-9",
              tone === "primary" && "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg shadow-gold",
              tone === "ai" && "bg-wine-100 text-wine-700 shadow-sm dark:bg-wine-900/50 dark:text-wine-300",
              tone === "family" && "bg-trust/10 text-trust shadow-sm",
              tone === "neutral" && "border border-line bg-surface text-muted shadow-sm",
            )}
          >
            <Icon className="size-5 md:size-4" />
          </span>
          <span className="text-[0.6875rem] font-medium leading-none text-muted">{label}</span>
        </button>
      ))}
    </div>
  );
}
