"use client";

import Link from "next/link";
import { Flag, Heart, MessageCircle, Mic, ScrollText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The utilities column down the right of the media.
 *
 * Four matrimony tools, and deliberately nothing that counts anything. A reel
 * that showed likes, views or shares would be asking a member to care how
 * popular a stranger is; this rail only ever offers ways to understand one.
 *
 * Shortlist and Interest are *not* here. They are decisions, they live in the
 * bottom bar with their labels, and duplicating them into a column of small
 * translucent circles over a photograph is how a decision becomes a mis-tap.
 *
 * The one item that leaves the screen is Message, and only on a card this
 * member has already matched with (D-92b) — see the prop's own note for why a
 * chat you are already in is not a decision.
 *
 * ## Why the private Like is the exception (D-91b)
 *
 * It is not a decision: it does not dismiss the card, does not send anything,
 * and nobody on the other side learns of it. It is a bookmark for "pasand hai,
 * par abhi kisi ko pata na chale" — the member keeps swiping afterwards. And
 * it still counts nothing at anybody: the heart reflects *your* like on them,
 * never how many likes they have. The rail's rule holds.
 *
 * ## Voice
 *
 * The clip a pre-match viewer may actually hear is the Verified Parent
 * Blessing — a family member's own recording, already through moderation
 * (`mediaAccess.ts` re-checks on every byte). There is no self-recorded
 * "voice intro" in this product, so the button is absent, not disabled, on the
 * profiles that have no clip: a greyed play button promises audio that does
 * not exist anywhere.
 */
export default function ReelUtilityRail({
  hasVoice,
  whyOpen,
  liked,
  matchId,
  onVoice,
  onWhy,
  onLike,
  onDetails,
  onReport,
}: {
  hasVoice: boolean;
  /** Reflected on the Why control so it reads as a toggle, not a dead tap. */
  whyOpen: boolean;
  /** This viewer's own private like on this person — never anybody else's. */
  liked: boolean;
  /**
   * The chat these two already have (D-92b). Present only on a matched card,
   * and it is the one item here that leaves the screen.
   *
   * It does not break the rail's rule against decisions: opening a
   * conversation you are already in decides nothing and tells the other side
   * nothing new. It sits at the top because on a matched card it is the reason
   * the card is in the feed at all — the bottom bar carries the same
   * destination in its primary slot, which is deliberate: that slot cannot
   * keep saying "Interest" to somebody whose interest was already accepted,
   * and the most important action on a card is allowed to be reachable from
   * both the thumb's home and the eye's.
   */
  matchId?: string | null;
  onVoice: () => void;
  onWhy: () => void;
  onLike: () => void;
  onDetails: () => void;
  onReport: () => void;
}) {
  const t = useT();

  const ITEMS = [
    ...(matchId
      ? [
          {
            key: "message",
            icon: MessageCircle,
            label: t("reel.rail.message", "Message"),
            aria: t("reel.rail.messageAria", "Inse baat shuru karein — rishta jud chuka hai"),
            href: `/user/messages/${matchId}`,
            onClick: undefined as (() => void) | undefined,
            pressed: undefined as boolean | undefined,
          },
        ]
      : []),
    {
      key: "like",
      icon: Heart,
      label: liked ? t("reel.rail.liked", "Liked") : t("reel.rail.like", "Like"),
      aria: liked
        ? t("reel.rail.unlikeAria", "Like hata dein — ye sirf aapko dikhta hai")
        : t("reel.rail.likeAria", "Like karein — ye sirf aapko dikhega, unhe nahi"),
      onClick: onLike,
      pressed: liked,
    },
    ...(hasVoice
      ? [
          {
            key: "voice",
            icon: Mic,
            label: t("reel.rail.voice", "Voice"),
            aria: t("reel.rail.voiceAria", "Parivaar ki verified aawaz sunein"),
            onClick: onVoice,
            pressed: undefined as boolean | undefined,
          },
        ]
      : []),
    {
      key: "why",
      icon: Sparkles,
      label: t("reel.rail.whyMatch", "Why Match"),
      aria: t("reel.rail.whyMatchAria", "Ye rishta kyun — poora jawab kholein"),
      onClick: onWhy,
      pressed: whyOpen,
    },
    {
      key: "details",
      icon: ScrollText,
      label: t("reel.rail.moreDetails", "Details"),
      aria: t("reel.card.moreDetailsAria", "Open full match details"),
      onClick: onDetails,
      pressed: undefined,
    },
    {
      key: "report",
      icon: Flag,
      label: t("reel.rail.report", "Report"),
      aria: t("reel.rail.reportAria", "Is profile ki report karein"),
      onClick: onReport,
      pressed: undefined,
    },
  ];

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-3">
      {ITEMS.map(({ key, icon: Icon, label, aria, onClick, pressed, href }) => {
        const body = (
          <>
            {/* `reel-glass` rather than a black scrim — see "GLASS OVER A PHOTO"
                in globals.css. The open state is lit from inside instead of
                filled with gold: a solid pill over somebody's photograph reads
                as a sticker stuck to their face. */}
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full reel-glass",
                pressed && "reel-glass--on text-gold-100",
                // The chat is the only item here that is a destination, and it
                // is the point of the card it appears on — lit, so the eye
                // finds it without reading five labels.
                key === "message" && "reel-glass--on text-gold-100",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span
              aria-hidden
              className="text-center text-[0.6875rem] font-medium leading-tight text-white/95 [text-shadow:0_1px_6px_rgb(0_0_0_/_0.5)]"
            >
              {label}
            </span>
          </>
        );

        // Same guard every control on this card uses: a stationary tap must
        // reach the control, never start a half-drag on the card under it.
        const guard = (e: React.PointerEvent) => e.stopPropagation();

        return href ? (
          <Link
            key={key}
            href={href}
            aria-label={aria}
            onPointerDown={guard}
            onClick={(e) => {
              e.stopPropagation();
              haptic("tap");
            }}
            className="group flex w-14 flex-col items-center gap-1"
          >
            {body}
          </Link>
        ) : (
          <button
            key={key}
            type="button"
            aria-label={aria}
            aria-pressed={pressed}
            onPointerDown={guard}
            onClick={(e) => {
              e.stopPropagation();
              haptic("tap");
              onClick?.();
            }}
            className="group flex w-14 flex-col items-center gap-1"
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
