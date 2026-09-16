"use client";

import { AlertTriangle, Check, ChevronRight, Info, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Why this match?" — the ivory card over the lower third of the reel.
 *
 * Every line is `whyThisMatch.ts` output: deterministic comparisons of data
 * both people typed, ranked by importance, computed on the server. Nothing
 * here is generated at render time and nothing is a percentage the evidence
 * cannot carry. The two evidence kinds are drawn differently on purpose and
 * always have been — a check for something the code compared, a sparkle and an
 * "AI" tag for the model's cached phrasing — so a reader never has to guess
 * which one they are reading.
 *
 * ## Collapsed by default
 *
 * Two lines, because the person is the hero of this screen and a card that
 * covers their face to list six reasons has got the priority backwards. The
 * rail's "Why Match" expands it in place to the full set; "More details" opens
 * the sheet with the whole breakdown, the kundli notes and the full profile
 * link. Those are two genuinely different jobs, which is why they are two
 * controls rather than the same one twice.
 *
 * ## When there is nothing
 *
 * The card still renders, and says so. "Is baat ki jaankari abhi nahi di gayi"
 * is a true sentence about two profiles that have not yet answered enough;
 * hiding the card instead would leave the reader assuming we simply did not
 * bother, and inventing a reason to fill it is the one thing this whole layer
 * exists to prevent.
 */
export default function ReelWhyMatchCard({
  card,
  expanded,
  onToggleExpanded,
  onDetails,
  onAskGrio,
}: {
  card: ReelCardViewModel;
  expanded: boolean;
  onToggleExpanded: () => void;
  onDetails: () => void;
  onAskGrio: () => void;
}) {
  const t = useT();
  const why = card.whyThisMatch;

  // Importance order is already decided server-side (whyThisMatch.ts): the
  // confirmed public value connection first, then the ranked reasons.
  const lines: { text: string; kind: "fact" | "ai" }[] = [
    ...(why.valueConnection ? [{ text: why.valueConnection, kind: "fact" as const }] : []),
    ...why.reasons,
  ];

  const kundliCaution = card.kundli.notes.some((n) => n.tone === "caution");
  const caution = kundliCaution
    ? t("reel.card.kundliCautionHint", "Parampara ka ek note hai — details me dekhein.")
    : (why.unclear ?? card.concern);

  // A card that has something to *warn* about shows one reason and the warning,
  // rather than two reasons and the warning. The height this card is allowed is
  // the height that leaves the person's face visible, and inside that budget
  // "here is a thing to check" outranks a second "here is a thing that fits".
  const foldedCount = caution ? 1 : 2;
  const shown = expanded ? lines : lines.slice(0, foldedCount);

  return (
    <section
      aria-label={t("reel.card.whyHeading", "Why this match?")}
      className="rounded-[1.25rem] border border-gold-200/70 bg-surface/95 px-3 py-3 shadow-lg backdrop-blur-md dark:border-gold-700/40 dark:bg-surface/90"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <h3 className="min-w-0 truncate font-[family-name:var(--font-display)] text-[1rem] font-bold text-accent-text">
          {t("reel.card.whyHeading", "Why this match?")}
        </h3>

        {/* The "there is more" affordance lives in the header row, where it
            costs no height. The rail's "Why Match" is the same toggle. */}
        {lines.length > shown.length || expanded ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
            aria-expanded={expanded}
            // Hidden on the narrowest phones, where the header has room for the
            // title or for this and not both — and this is the redundant one:
            // the rail's "Why Match" is the same toggle, with a word on it.
            className="hidden size-7 shrink-0 place-items-center rounded-full bg-bg-subtle text-[0.6875rem] font-bold tabular-nums text-muted transition-colors hover:bg-gold-100 hover:text-gold-700 min-[380px]:grid"
          >
            {expanded ? "−" : `+${lines.length - shown.length}`}
            <span className="sr-only">
              {expanded
                ? t("reel.card.whyLess", "Kam dikhayein")
                : t("reel.card.whyMore", "+{n} aur").replace("{n}", String(lines.length - shown.length))}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDetails();
          }}
          aria-label={t("reel.card.moreDetailsAria", "Open full match details")}
          className="-mr-1.5 ml-auto inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[0.8125rem] font-semibold text-accent-text transition-colors hover:bg-gold-100/70 dark:hover:bg-gold-900/30"
        >
          {t("reel.card.moreDetails", "More details")}
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      {/* Two columns, like the reference: the reasons carry the width and the
          Ask Grio pill sits beside them. A pill on its own row below cost this
          card another 44px of the person's face for a control that reads
          perfectly well here. */}
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {shown.length > 0 ? (
            <ul className={cn("space-y-1.5", expanded && "max-h-[7.5rem] overflow-y-auto pr-1")}>
              {shown.map((line, i) => (
                <li key={`${i}-${line.text}`} className="flex items-start gap-2 text-[0.875rem] leading-snug text-ink">
                  <span
                    className={cn(
                      "mt-px grid size-5 shrink-0 place-items-center rounded-full",
                      line.kind === "ai"
                        ? "bg-wine-50 text-wine-700 dark:bg-wine-900/40 dark:text-wine-200"
                        : i === 0
                          ? "bg-trust-bg text-trust"
                          : "bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200",
                    )}
                  >
                    {line.kind === "ai" ? (
                      <Sparkles className="size-3" aria-hidden />
                    ) : i === 0 ? (
                      <Check className="size-3" aria-hidden />
                    ) : (
                      <Users className="size-3" aria-hidden />
                    )}
                  </span>
                  {/* Clamped while folded so one long AI sentence can't push
                      the card up over the person's face; the rail's "Why
                      Match" opens the whole thing. */}
                  <span className={cn("min-w-0", !expanded && "line-clamp-2")}>
                    {line.text}
                    {line.kind === "ai" && (
                      <span className="ml-1.5 rounded-sm border border-wine-300/60 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-wine-700 dark:border-wine-700/50 dark:text-wine-300">
                        {t("reel.card.aiTag", "AI")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.875rem] leading-snug text-muted">
              {t("reel.card.whyNothing", "Is baat ki jaankari abhi nahi di gayi.")}
            </p>
          )}

          {caution && (
            <p className="mt-1.5 flex items-start gap-2 text-[0.8125rem] leading-snug text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className={cn("min-w-0", !expanded && "line-clamp-2")}>{caution}</span>
            </p>
          )}

          {/* "General suggestion — preference match calculate nahi hua." The
              per-card half of the honesty rule: it used to be repeated by a
              banner above the whole stack, which is one banner more than this
              screen can afford. The next step now lives where it belongs — the
              refinement at the end of the batch. */}
          {card.preference.note && (
            <p className="mt-1.5 flex items-start gap-2 text-[0.75rem] leading-snug text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className={cn("min-w-0", !expanded && "line-clamp-2")}>{card.preference.note}</span>
            </p>
          )}

        </div>

        {/* The blush pill. Opens the real Grio panel already scoped to this
            profile (GrioProvider's `candidate` scope) — the same conversation
            the profile page's Rishta Lens opens, not a second one built here. */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            haptic("tap");
            onAskGrio();
          }}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-center rounded-full bg-wine-50 px-3 text-[0.8125rem] font-semibold text-wine-700 ring-1 ring-wine-200 transition-colors hover:bg-wine-100 dark:bg-wine-900/40 dark:text-wine-200 dark:ring-wine-700/50"
        >
          <Sparkles className="size-4 shrink-0" aria-hidden />
          {t("reel.actionBar.askGrio", "Ask Grio")}
        </button>
      </div>
    </section>
  );
}
