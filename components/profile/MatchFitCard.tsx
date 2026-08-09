"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Info, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import type { FitBreakdown } from "@/lib/services/match/fitBreakdown";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The ranking, shown to the person it was done for.
 *
 * D-33 calls L2's ranking "deterministic, reproducible, explainable" — and
 * until now the app was two of those three. Every number below already decided
 * where this profile sat in the user's reel; the only new thing here is that
 * they can read it.
 *
 * Three deliberate refusals, all the same refusal in different clothes:
 *
 *  - **No `finalScore`.** The weighted total exists and is the actual ranking
 *    number, and it is still not on this card. "82% match" reads as a verdict —
 *    people act on it instead of on the breakdown, and it invites comparison
 *    with the 36-guna total, which measures something else entirely (the same
 *    reason `GunaMilanCard` refuses to show a percentage).
 *  - **No colour-as-judgement.** One accent on every bar. Tinting a low
 *    preference score red would be the app telling someone their own stated
 *    preferences are a problem.
 *  - **No empty bar when soch fit is missing.** `computeSochFit` returns null,
 *    not zero, when a pair shares no thinking data, and a 0%-wide bar would
 *    assert "you two think differently" — which is not what missing data means.
 *    The honest sentence and a route to fix it go there instead.
 */

export interface MatchFitCardProps {
  breakdown: FitBreakdown;
  /** Whose profile this is — "Priya". */
  otherName: string;
  /** The Grio CTA, passed in so this card stays presentational. */
  action?: ReactNode;
  className?: string;
}

export default function MatchFitCard({ breakdown, otherName, action, className }: MatchFitCardProps) {
  const t = useT();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <Card variant="luxe" padding="md" className={className}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Scale className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9375rem] font-semibold text-ink">
            {t("profile.matchFitCard.title", "Ye rishta aapko kyun dikha")}
          </h3>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
            {t(
              "profile.matchFitCard.description",
              "Ye wahi hisaab hai jo {otherName} ko aapki list me is jagah par laaya. Har number par tap karke samjhiye ki wo aaya kahan se.",
            ).replace("{otherName}", otherName)}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {breakdown.signals.map((s) => {
          const open = openKey === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : s.key)}
                aria-expanded={open}
                className="w-full text-left"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.8125rem] font-semibold text-ink">{s.label}</span>
                  <span className="rounded-full bg-bg-subtle px-1.5 text-[0.6875rem] font-medium text-subtle">
                    {t("profile.matchFitCard.weightInRanking", "ranking me {percent}%").replace(
                      "{percent}",
                      String(s.weightPercent),
                    )}
                  </span>
                  <span className="ml-auto text-[0.8125rem] font-semibold tabular-nums text-wine-700">
                    {s.score}
                    <span className="text-[0.6875rem] font-normal text-subtle">/100</span>
                  </span>
                  <ChevronDown
                    className={cn("size-3.5 shrink-0 text-subtle transition-transform duration-200", open && "rotate-180")}
                  />
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className="h-full rounded-full bg-wine-600 transition-all duration-700"
                    style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }}
                  />
                </div>
              </button>
              {open && <p className="mt-1.5 text-[0.75rem] leading-snug text-muted">{s.hint}</p>}
            </li>
          );
        })}
      </ul>

      {breakdown.sochLine && (
        <p className="mt-3 rounded-md border border-trust/25 bg-trust-bg px-3 py-2 text-[0.8125rem] leading-snug text-ink">
          {breakdown.sochLine}
        </p>
      )}

      {!breakdown.sochAvailable && (
        <div className="mt-3 rounded-md border border-line bg-bg-subtle px-3 py-2.5">
          <p className="text-[0.8125rem] leading-snug text-muted">
            {t(
              "profile.matchFitCard.sochUnavailable",
              "Soch ka mel abhi naapa nahi ja sakta — aap dono ne itne same sawaal answer nahi kiye hain. Ye zero nahi hai, ye abhi khaali hai.",
            )}
          </p>
          <Link
            href="/user/vibe"
            className="mt-1.5 inline-block text-[0.8125rem] font-semibold text-wine-700 hover:text-wine-800"
          >
            {t("profile.matchFitCard.answerVibeQuestions", "Vibe Hub par kuch sawaal answer karein →")}
          </Link>
        </div>
      )}

      {action && <div className="mt-4">{action}</div>}

      <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[0.6875rem] leading-snug text-subtle">
        <Info className="mt-px size-3 shrink-0" />
        <span>
          {t(
            "profile.matchFitCard.footerDisclaimer",
            "Ye numbers code ne nikaale hain, kisi AI ne nahi — aur ye har baar wahi aayenge. Ye kisi rishtey ka faisla nahi karte, sirf ye batate hain ki wo aapki list me kahan aaya. Faisla aapka hai.",
          )}
        </span>
      </p>
    </Card>
  );
}
