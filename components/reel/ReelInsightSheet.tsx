"use client";

import { AlertCircle, Blend, Check, ChevronRight, HelpCircle, Info, Orbit, Sparkles } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import type { ReelCardViewModel } from "@/lib/contracts/reel";
import { reelCautions, reelReasons } from "@/lib/reel/insights";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Grio's door on the reel — the reasons first, the conversation second.
 *
 * ## Not a chat box
 *
 * Opening an AI panel over every profile would make the reel a chatbot with
 * photographs. What a member usually wants from "AI" on a card is shorter:
 * *why am I seeing this person, and is there anything to watch for*. That
 * answer already exists, computed and ranked on the server
 * (`whyThisMatch.ts`), so this sheet shows it immediately — no model call, no
 * spinner — and offers the conversation only as the next step, already scoped
 * to this person (`GrioProvider`'s `candidate` scope, the same Rishta Lens the
 * profile page opens).
 *
 * ## Honest about which lines are which
 *
 * A check is something the code compared between two real profiles; a sparkle
 * with an "AI" tag is the model's cached phrasing of facts. Cautions are
 * printed in the same list, not hidden behind a tap: a reason to hesitate is
 * as much a part of "why this rishta" as a reason to go ahead.
 *
 * When there is nothing, it says so ("Is baat ki jaankari abhi nahi di gayi")
 * — inventing a reason to fill the sheet is the one thing this layer exists to
 * prevent.
 */
export default function ReelInsightSheet({
  open,
  onClose,
  card,
  onAskGrio,
  onAskAi,
  onKundli,
}: {
  open: boolean;
  onClose: () => void;
  card: ReelCardViewModel | null;
  onAskGrio: () => void;
  /** The quick, quota'd question (`/api/reel/ask`) — absent where it cannot run. */
  onAskAi?: () => void;
  onKundli: () => void;
}) {
  const t = useT();
  if (!card) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const reasons = reelReasons(card);
  const cautions = reelCautions(card, t);
  const milan = card.kundli.milan;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("reel.insight.title", "{name} — ye rishta kyun").replace("{name}", card.displayName)}
      variant="bottom"
    >
      <div className="space-y-4 pb-1">
        {reasons.length > 0 ? (
          <ul className="space-y-2">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug text-ink">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
                  {r.ai ? <Sparkles className="size-3.5" aria-hidden /> : i === 0 ? <Blend className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                </span>
                <span className="min-w-0 pt-0.5">
                  {r.text}
                  {r.ai && (
                    <span className="ml-1.5 rounded-sm border border-wine-300/60 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-wine-700 dark:border-wine-700/50 dark:text-wine-300">
                      {t("reel.card.aiTag", "AI")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] leading-snug text-muted">{t("reel.card.whyNothing", "Is baat ki jaankari abhi nahi di gayi.")}</p>
        )}

        {cautions.length > 0 && (
          <ul className="space-y-1.5 rounded-lg bg-warn-bg px-3 py-2.5">
            {cautions.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[0.875rem] leading-snug text-ink">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                <span className="min-w-0">
                  {c.text}
                  {c.ai && (
                    <span className="ml-1.5 rounded-sm border border-wine-300/60 px-1 align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-wine-700 dark:border-wine-700/50 dark:text-wine-300">
                      {t("reel.card.aiTag", "AI")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The tradition's view, beside the app's own — a number only when it
            is the real number, and one tap to the full 36 guna. */}
        {milan && (
          <button
            type="button"
            onClick={onKundli}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-gold-400"
          >
            <Orbit className="size-5 shrink-0 text-gold-700 dark:text-gold-300" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold text-ink">
                {t("reel.details.gunaMilan", "Guna Milan")}: {milan.total}/{milan.max} · {milan.band}
              </span>
              <span className="block text-[0.75rem] text-muted">
                {t("reel.details.gunaMilanHint2", "Parampara ka ek nazariya — rishta ka faisla nahi.")}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          </button>
        )}

        {card.preference.state !== "COMPARABLE" && !card.preference.note && (
          <p className="flex items-start gap-1.5 text-[0.75rem] leading-snug text-subtle">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            {t("reel.insight.noPreference", "Aapki pasand abhi kam pata hai — isliye ye wajah general hain, pasand ka percentage nahi.")}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={onAskGrio}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-4 text-[0.9375rem] font-semibold text-accent-fg transition-transform active:scale-[0.98]"
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            {t("reel.insight.askGrio", "Ask Grio about {name}").replace("{name}", card.displayName)}
          </button>
          {onAskAi && (
            <button
              type="button"
              onClick={onAskAi}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-bg-subtle"
            >
              <HelpCircle className="size-4 shrink-0" aria-hidden />
              {t("reel.details.quickQuestion", "Quick Question")}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
