"use client";

import Link from "next/link";
import { Bookmark, Home, MessageCircle, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelSwipeDirection } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The bar under the photograph: one way out, one way to ask, and the two
 * things you can do about this person.
 *
 * Real click-equivalents for every drag gesture (§4.5 — non-negotiable):
 * screen-reader and keyboard users get exactly what a swipe gives.
 *
 * ## Two of these no longer have a gesture (D-92)
 *
 * Up and down walk the feed now, Instagram-style, so "Ask Grio" and
 * "Shortlist" live here and nowhere else. That is not a downgrade: a button
 * carries its own label, which is what makes a tap on it consent, and it is
 * the reason `ReelStack.commit` is allowed to read a vertical *drag* as pure
 * navigation. Everything these two do still happens; it just has to be asked
 * for by name.
 *
 * ## Why the first slot is the way home (D-92b)
 *
 * It held "Not now", and after D-92 that button had almost nothing left to
 * say: scrolling past a card already takes the person out of the fresh deck,
 * so the only thing the label still added was a *taste* signal for the
 * ranking. That signal is worth keeping — it is on the left swipe, on the left
 * arrow key, and on a labelled button inside the details sheet — but it is not
 * worth the most reachable thumb position on the screen.
 *
 * What was worth it is the one thing this screen genuinely lacked. The reel is
 * full-bleed: no header, no bottom nav, nothing to press to get back to the
 * rest of the app (Devesh, 2026-09-22 — "Not now button ki jagah dashboard par
 * jane wala button"). A member deep in a feed with no exit is a member who
 * closes the tab.
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
 * ## Why Interest is not a heart
 *
 * A heart is the single most dating-app gesture there is, and this action
 * sends a formal expression of interest that the other family may read. Two
 * figures side by side is the same promise the brand's interlocking rings
 * make. The label stays "Interest" and the API behind it is untouched.
 *
 * On a card the member has already matched with, that slot is a **Message**
 * link instead: the interest is mutual, it has been accepted, and a second
 * "Interest" button there would be the app forgetting its own history.
 *
 * Priority is expressed in weight, not size-to-the-point-of-absurdity:
 * the primary slot is filled maroon with a gold ring, Ask Grio is blush,
 * Shortlist is a quiet green tint, the way home is plain ivory. All four stay
 * visible and all four clear 44px.
 */
export default function ReelActionBar({
  onAction,
  disabled,
  matchId,
}: {
  onAction: (direction: ReelSwipeDirection) => void;
  disabled?: boolean;
  /** Set when this card is already a match — the primary slot becomes the chat. */
  matchId?: string | null;
}) {
  const t = useT();

  type Item = {
    key: string;
    icon: typeof Home;
    label: string;
    tone: "neutral" | "ai" | "family" | "primary";
    /** A destination, or a decision — never both. */
    href?: string;
    direction?: ReelSwipeDirection;
  };

  const ACTIONS: Item[] = [
    {
      key: "home",
      icon: Home,
      // English, like every other control label in the app.
      label: t("reel.actionBar.dashboard", "Dashboard"),
      tone: "neutral",
      href: "/user/dashboard",
    },
    { key: "grio", icon: Sparkles, label: t("reel.actionBar.askGrio", "Ask Grio"), tone: "ai", direction: "UP" },
    {
      key: "shortlist",
      icon: Bookmark,
      label: t("reel.actionBar.shortlist", "Shortlist"),
      tone: "family",
      direction: "DOWN",
    },
    matchId
      ? {
          key: "message",
          icon: MessageCircle,
          label: t("reel.actionBar.message", "Message"),
          tone: "primary",
          href: `/user/messages/${matchId}`,
        }
      : {
          key: "interest",
          icon: Users,
          label: t("reel.actionBar.interest", "Interest"),
          tone: "primary",
          direction: "RIGHT",
        },
  ];

  return (
    <div
      className="flex items-start justify-around gap-1 px-3"
      role="group"
      aria-label={t("reel.actionBar.groupLabel", "Rishta actions")}
    >
      {ACTIONS.map(({ key, icon: Icon, label, tone, href, direction }) => {
        const body = (
          <>
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
          </>
        );

        const shell = cn(
          "flex min-w-[4rem] flex-col items-center gap-2 rounded-2xl py-1 transition-transform",
          "hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        );

        // A destination is a link, so it opens in a new tab on a long-press and
        // reads as "jagah" to a screen reader. Only the decisions are buttons.
        return href ? (
          <Link key={key} href={href} aria-label={label} className={shell} onClick={() => haptic("tap")}>
            {body}
          </Link>
        ) : (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => {
              haptic(direction === "RIGHT" ? "success" : "tap");
              if (direction) onAction(direction);
            }}
            aria-label={label}
            className={shell}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
