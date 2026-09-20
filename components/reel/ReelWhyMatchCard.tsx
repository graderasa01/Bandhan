"use client";

import { AlertTriangle, Check, ChevronRight, Info, Sparkles, Users, X } from "lucide-react";
import { haptic } from "@/lib/motion";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * "Why this match?" — opened from the rail, over the lower part of the reel.
 *
 * Every line is `whyThisMatch.ts` output: deterministic comparisons of data
 * both people typed, ranked by importance, computed on the server. Nothing here
 * is generated at render time and nothing is a percentage the evidence cannot
 * carry. The two evidence kinds are drawn differently on purpose and always
 * have been — a check for something the code compared, a sparkle and an "AI"
 * tag for the model's cached phrasing — so a reader never has to guess which
 * one they are reading.
 *
 * ## It is not on screen until it is asked for
 *
 * This card used to sit under every profile permanently, folded to one or two
 * lines. Folded or not, it still took a fifth of the screen — and the screen's
 * job is to show a person. The reel is a photograph first; everything else is
 * something you ask for. So the rail's "Why Match" is now the only way in, and
 * when it opens it opens WHOLE: no fold, no `+2` counter, no clamped lines.
 * A panel that has been deliberately summoned should not then ration itself.
 *
 * ## Why it is dark glass and not the app's own
 *
 * It floats over a stranger's photograph, which can be bright. Every other
 * surface in the product is a white pane over a dark terrace; this one has to
 * be the opposite or its own text disappears over a white kurta. See "GLASS
 * OVER A PHOTO" in globals.css — `reel-glass` is the shared material, and the
 * rail's buttons are made of it too.
 *
 * ## When there is nothing
 *
 * It still says so. "Is baat ki jaankari abhi nahi di gayi" is a true sentence
 * about two profiles that have not answered enough; showing nothing would leave
 * the reader assuming we did not bother, and inventing a reason to fill it is
 * the one thing this whole layer exists to prevent.
 */
export default function ReelWhyMatchCard({
  card,
  onClose,
  onDetails,
  onAskGrio,
}: {
  card: ReelCardViewModel;
  onClose: () => void;
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

  return (
    <section
      aria-label={t("reel.card.whyHeading", "Why this match?")}
      className="reel-glass rounded-[1.25rem] px-3 py-3"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/12 text-gold-100">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <h3 className="min-w-0 truncate font-[family-name:var(--font-display)] text-[1rem] font-bold text-white">
          {t("reel.card.whyHeading", "Why this match?")}
        </h3>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDetails();
          }}
          aria-label={t("reel.card.moreDetailsAria", "Open full match details")}
          className="-mr-0.5 ml-auto inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[0.8125rem] font-semibold text-gold-100 transition-colors hover:bg-white/10"
        >
          {t("reel.card.moreDetails", "More details")}
          <ChevronRight className="size-4" aria-hidden />
        </button>

        {/* The way out. It is the same toggle as the rail's "Why Match", put
            where a reader's thumb already is when they have finished reading. */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            haptic("tap");
            onClose();
          }}
          aria-label={t("reel.card.whyClose", "Band karein")}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Two columns: the reasons carry the width and the Ask Grio pill sits
          beside them. A pill on its own row below cost this card another 44px
          of the person's face for a control that reads perfectly well here. */}
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {lines.length > 0 ? (
            // Capped and scrollable rather than clamped: the panel was asked
            // for, so nothing in it is abbreviated — but it still may not grow
            // until it covers the face it is explaining.
            <ul className="max-h-[9rem] space-y-1.5 overflow-y-auto pr-1">
              {lines.map((line, i) => (
                <li key={`${i}-${line.text}`} className="flex items-start gap-2 text-[0.875rem] leading-snug text-white">
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/14 text-gold-100">
                    {line.kind === "ai" ? (
                      <Sparkles className="size-3" aria-hidden />
                    ) : i === 0 ? (
                      <Check className="size-3" aria-hidden />
                    ) : (
                      <Users className="size-3" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    {line.text}
                    {line.kind === "ai" && (
                      <span className="ml-1.5 rounded-sm border border-white/35 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-white/80">
                        {t("reel.card.aiTag", "AI")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.875rem] leading-snug text-white/70">
              {t("reel.card.whyNothing", "Is baat ki jaankari abhi nahi di gayi.")}
            </p>
          )}

          {caution && (
            <p className="mt-1.5 flex items-start gap-2 text-[0.8125rem] leading-snug text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{caution}</span>
            </p>
          )}

          {/* "General suggestion — preference match calculate nahi hua." The
              per-card half of the honesty rule: it used to be repeated by a
              banner above the whole stack, which is one banner more than this
              screen can afford. */}
          {card.preference.note && (
            <p className="mt-1.5 flex items-start gap-2 text-[0.75rem] leading-snug text-white/70">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{card.preference.note}</span>
            </p>
          )}
        </div>

        {/* Opens the real Grio panel already scoped to this profile
            (GrioProvider's `candidate` scope) — the same conversation the
            profile page's Rishta Lens opens, not a second one built here. */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            haptic("tap");
            onAskGrio();
          }}
          className="reel-glass reel-glass--on inline-flex min-h-11 shrink-0 items-center gap-1.5 self-center rounded-full px-3 text-[0.8125rem] font-semibold text-gold-100"
        >
          <Sparkles className="size-4 shrink-0" aria-hidden />
          {t("reel.actionBar.askGrio", "Ask Grio")}
        </button>
      </div>
    </section>
  );
}
