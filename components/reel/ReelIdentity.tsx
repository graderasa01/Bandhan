"use client";

import { BadgeCheck, Blend, ChevronRight, ChevronUp, Play, Users } from "lucide-react";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { completenessIsNews, profileChips, profileSummaryLine } from "@/lib/reel/insights";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import type { ReelDetailsSection } from "./ReelDetailsSheet";

/**
 * Who this is, over their own photograph — in the order a person reads one.
 *
 * ## Three layers, not a biodata
 *
 *   1 second   — name, age, the verified tick, and "what · where" on one line.
 *   5 seconds  — three chips: what you two share first (gold dot), then their
 *                own words for how they live. Plus, above the name, how many
 *                reasons the app has for showing them — only when it has any.
 *   on request — everything else, one tap away: the name block itself, or the
 *                "Details" link, opens the details sheet over the lower part of
 *                the photo, so the person stays on screen while you read.
 *
 * Everything printed here is a field the person filled in, the code's
 * deterministic overlap, or a count of the server's own reasons
 * (`lib/reel/insights.ts`). Nothing is phrased by a model at render time and
 * every line disappears when its field is empty, rather than rendering a dash.
 *
 * ## Why the old bio line and verification pills left the card face
 *
 * Their own words ("about me") were two clamped lines on every card, and two
 * white "Photo Verified / Mobile Verified" pills sat under the name. Both were
 * true and both cost the photo a band of its height on every single card. The
 * tick next to the name now carries verification (its label says which checks
 * passed), and the bio opens the details sheet — deferred, never lost.
 *
 * ## The profile-depth signal is shown only when it is news
 *
 * "86% profile" on a card that is thoroughly filled is a trust signal; "40%"
 * is a real caution; the middle is every profile and says nothing. So the
 * number rides on the card only at the ends (`completenessIsNews`), and the
 * details sheet always has it, with the sections that are mostly empty.
 */
export default function ReelIdentity({
  card,
  reasonsCount,
  historyNote,
  selfPreview = false,
  onReasons,
  onDetails,
  onVoice,
}: {
  card: ReelCardViewModel;
  /** How many "why this rishta" lines the server ranked for this card. */
  reasonsCount: number;
  /** "Pehle dekha tha", "Not now kaha tha" — the one history fact the rail's states do not already say. */
  historyNote: string | null;
  /** The owner's own preview: no pair, so nothing pair-level is shown. */
  selfPreview?: boolean;
  onReasons?: () => void;
  onDetails?: (section?: ReelDetailsSection) => void;
  onVoice?: () => void;
}) {
  const t = useT();
  const chips = selfPreview ? [] : profileChips(card);
  const summary = profileSummaryLine(card);
  const verified = card.verified || card.mobileVerified;
  const verifiedAs = [
    card.verified ? t("reel.trustStrip.photoVerified", "Photo Verified") : null,
    card.mobileVerified ? t("reel.trustStrip.mobileVerified", "Mobile Verified") : null,
  ]
    .filter(Boolean)
    .join(", ");
  const showDepth = !selfPreview && completenessIsNews(card.completeness.percent);
  const interactive = Boolean(onDetails);

  // The text shadow is a real one, not decoration: this text lands on whatever
  // the photograph happens to be, and the scrim alone is not enough over a
  // bright sari or a sunlit wall.
  const onPhoto = "[text-shadow:0_1px_3px_rgb(0_0_0_/_0.55),0_2px_16px_rgb(0_0_0_/_0.5)]";

  const nameBlock = (
    <>
      {/* `text-white` on the heading itself: `@layer base` colours h1-h3
          directly, and a direct rule beats an inherited one however the parent
          is coloured (see the overlay-heading note). */}
      <h2 className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-[1.75rem] font-bold leading-none text-white">
        <span className="min-w-0 truncate">
          {card.displayName}
          {card.age ? `, ${card.age}` : ""}
        </span>
        {verified && (
          <>
            <BadgeCheck className="size-5 shrink-0 fill-trust text-white" aria-hidden />
            <span className="sr-only">{verifiedAs}</span>
          </>
        )}
      </h2>
      {(summary || historyNote) && (
        <p className="mt-1.5 truncate text-[0.9375rem] font-medium leading-tight text-white">
          {summary}
          {historyNote && (
            <span className="text-white/70">
              {summary ? " · " : ""}
              {historyNote}
            </span>
          )}
        </p>
      )}
      {chips.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            // "Jaipur" twice — once in the summary line, again as the value of
            // "Same city". The chip's news is the *sameness*, so where the
            // line already printed the place, the label carries the chip alone.
            const echoesSummary = Boolean(
              chip.label && card.city && chip.text.trim().toLowerCase() === card.city.trim().toLowerCase(),
            );
            return (
              <li
                key={chip.text}
                className={cn(
                  // One geometry for both kinds, so the row reads as a set.
                  "inline-flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 backdrop-blur-md [text-shadow:none]",
                  "shadow-[0_6px_18px_-8px_rgb(0_0_0_/_0.65)]",
                  chip.shared ? "bg-black/45 pl-2 ring-1 ring-gold-300/45" : "bg-black/40 pl-2.5 ring-1 ring-white/20",
                )}
              >
                {/* The whole "this is about you two" signal, in four pixels of gold. */}
                {chip.shared && (
                  <span aria-hidden className="size-1 shrink-0 rounded-full bg-gold-400 shadow-[0_0_5px_rgb(221_172_81_/_0.9)]" />
                )}
                {chip.label && (
                  <span
                    className={cn(
                      "font-semibold uppercase leading-none tracking-[0.06em] text-gold-300/90",
                      echoesSummary ? "text-[0.6875rem]" : "text-[0.625rem]",
                    )}
                  >
                    {chip.label}
                  </span>
                )}
                {!echoesSummary && <span className="text-[0.75rem] font-semibold leading-none text-white">{chip.text}</span>}
                {chip.shared && <span className="sr-only">{t("reel.overlay.sharedChip", "— aap dono me common")}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-2 text-white", onPhoto)}>
      {/* Layer 2's headline: why the app put this person here. A count of the
          server's own ranked reasons — never a score, never "0". */}
      {!selfPreview && (card.matchId || (reasonsCount > 0 && onReasons)) && (
        <div className="flex flex-wrap items-center gap-1.5 [text-shadow:none]">
          {card.matchId && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-2.5 text-[0.75rem] font-semibold text-wine-900 shadow-[0_4px_14px_rgb(0_0_0_/_0.35)]">
              <Users className="size-3.5" aria-hidden />
              {t("reel.card.matched", "Rishta jud chuka hai")}
            </span>
          )}
          {reasonsCount > 0 && onReasons && (
            <button
              type="button"
              onClick={onReasons}
              className="reel-glass inline-flex h-8 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[0.75rem] font-semibold"
            >
              <span className="grid size-6 place-items-center rounded-full bg-gold-300/90 text-wine-900">
                <Blend className="size-3.5" aria-hidden />
              </span>
              {(reasonsCount === 1
                ? t("reel.card.reasonsOne", "Ye rishta kyun · 1 wajah")
                : t("reel.card.reasons", "Ye rishta kyun · {n} wajah")
              ).replace("{n}", String(reasonsCount))}
              <ChevronRight className="size-3.5 opacity-80" aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* The name block is the door to the details. A tap, not a drag: the
          feed swallows the click that ends a swipe, so dragging a card up by
          its name moves the feed and opens nothing. */}
      {interactive ? (
        <button
          type="button"
          onClick={() => onDetails?.()}
          aria-label={t("reel.card.openDetailsAria", "{name} ki poori profile details kholein").replace("{name}", card.displayName)}
          className="block w-full min-w-0 text-left"
        >
          {nameBlock}
        </button>
      ) : (
        <div className="w-full min-w-0">{nameBlock}</div>
      )}

      {interactive && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[0.75rem] font-semibold text-white/95">
          {showDepth && (
            <SignalButton onClick={() => onDetails?.("profile")}>
              <DepthRing percent={card.completeness.percent} />
              {t("reel.card.profileDepth", "{n}% profile").replace("{n}", String(card.completeness.percent))}
            </SignalButton>
          )}
          {onVoice && (
            <SignalButton onClick={onVoice}>
              <Play className="size-3.5 fill-current" aria-hidden />
              {t("reel.card.familyVoice", "Family voice")}
            </SignalButton>
          )}
          <SignalButton onClick={() => onDetails?.()}>
            {t("reel.card.details", "Details")}
            <ChevronUp className="size-3.5" aria-hidden />
          </SignalButton>
        </div>
      )}
    </div>
  );
}

/** A quiet text control on the photo — a real 44px target with no pill of its own. */
function SignalButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1 inline-flex min-h-9 items-center gap-1 rounded-full px-2 transition-colors hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/** The completeness number, as a ring — a glance, not a progress bar. */
function DepthRing({ percent }: { percent: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, percent)) / 100;
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="rgb(255 255 255 / 0.3)" strokeWidth="2.5" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="rgb(245 214 150)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${c * filled} ${c}`}
      />
    </svg>
  );
}
