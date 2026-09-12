"use client";

import { useState, type FormEvent } from "react";
import { Check, CircleHelp, Loader2, Mic, Pencil, Square } from "lucide-react";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { countActiveFilters, type BehaviorMode, type DiscoverFilters, type DiscoverIntentResponse } from "@/lib/discovery/contract";
import ActiveFilterChips from "./ActiveFilterChips";
import type { DiscoverVoice } from "./useDiscoverVoice";

export interface AiSearchConfirmationProps {
  intent: DiscoverIntentResponse;
  /** Editable copy of `intent.filters` — chips remove from here. */
  filters: DiscoverFilters;
  onChangeFilters: (next: DiscoverFilters) => void;
  behaviorMode: BehaviorMode;
  /** "Haan, profiles dikhao" */
  onConfirm: () => void;
  /** "Badlein" — opens the filter sheet on this draft. */
  onEdit: () => void;
  /** "Dobara bolun" — starts the microphone for a fresh sentence. */
  voice: DiscoverVoice;
  /** The one allowed clarification answer, typed or spoken. */
  onAnswerClarification: (answer: string) => void;
  busy: boolean;
  /** Live restatement of `filters` — recomputed by the parent on every chip change. */
  summary: string;
}

const BEHAVIOR_LABEL: Record<BehaviorMode, string | null> = {
  none: null,
  activity: "Meri activity ke hisaab se",
  shortlist: "Meri shortlist jaisi profiles",
  positive: "Mere recent positive choices jaisi profiles",
};

/**
 * The gate between "the AI read your sentence" and "the database ran a query".
 *
 * Nothing is searched until the user says so. The sentence shown is composed
 * by code from the canonical filters (never the model's prose), and the chips
 * *are* the filters — remove one here and the confirmed search will not have
 * it. Unresolved asks are listed plainly so a word the app cannot filter on is
 * seen to be dropped, not quietly lost; a low-confidence read gets one
 * question, and only one.
 */
export default function AiSearchConfirmation({
  intent,
  filters,
  onChangeFilters,
  behaviorMode,
  onConfirm,
  onEdit,
  voice,
  onAnswerClarification,
  busy,
  summary,
}: AiSearchConfirmationProps) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const listening = voice.state === "listening";
  const hasAnything = countActiveFilters(filters) > 0 || behaviorMode !== "none";
  const behaviorLabel = BEHAVIOR_LABEL[behaviorMode];

  function submitAnswer(e: FormEvent) {
    e.preventDefault();
    const a = answer.trim();
    if (!a || busy) return;
    onAnswerClarification(a);
    setAnswer("");
  }

  return (
    <section role="region" aria-live="polite" aria-label={t("discover.confirm.region", "AI ne kya samjha")}>
    <Card variant="luxe" padding="md" className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
          <Check className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[0.9375rem] leading-snug text-ink">
            {hasAnything ? (
              <>
                {t("discover.confirm.lead", "Main samjha ki aap")} <strong className="font-semibold">{summary}</strong>{" "}
                {t("discover.confirm.tail", "dhoondh rahe hain. Kya maine sahi samjha?")}
              </>
            ) : (
              t("discover.confirm.nothing", "Is sentence se koi filter nahi bana — thoda aur bataiye, ya neeche filters khud chun lein.")
            )}
          </p>
          {behaviorLabel && (
            <p className="mt-1 text-[0.8125rem] text-muted">
              {t("discover.confirm.behaviorLead", "Smart mode:")} <span className="font-medium text-ink">{behaviorLabel}</span>
            </p>
          )}
        </div>
      </div>

      {countActiveFilters(filters) > 0 && (
        <ActiveFilterChips filters={filters} onChange={onChangeFilters} onOpenFilters={onEdit} compact />
      )}

      {intent.unresolvedRequests.length > 0 && (
        <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[0.8125rem]">
          <p className="font-medium text-ink">{t("discover.confirm.unresolvedTitle", "Ye samajh nahi aaya ya iska filter nahi hai:")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {intent.unresolvedRequests.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.clarificationQuestion && (
        <form onSubmit={submitAnswer} className="rounded-md border border-gold-300/60 bg-gold-50/60 p-3 dark:border-gold-700/40 dark:bg-gold-900/20">
          <p className="flex items-start gap-1.5 text-[0.875rem] font-medium text-ink">
            <CircleHelp className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />
            {intent.clarificationQuestion}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="text"
              value={listening && voice.interim ? voice.interim : answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={busy || listening}
              aria-label={intent.clarificationQuestion}
              placeholder={t("discover.confirm.answerPlaceholder", "Yahan jawab likhein…")}
              className="h-10 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-3.5 text-[0.875rem] text-ink outline-none focus:border-gold-500"
            />
            {voice.supported && (
              <button
                type="button"
                onClick={() => (listening ? voice.stop() : void voice.start())}
                disabled={busy}
                aria-pressed={listening}
                aria-label={listening ? t("discover.hero.stopListening", "Stop listening") : t("discover.hero.speak", "Bol kar batayein")}
                className={cn("grid size-10 shrink-0 place-items-center rounded-full", listening ? "bg-gold-500 text-primary-fg" : "border border-line-strong text-wine-700")}
              >
                {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              </button>
            )}
            <button
              type="submit"
              disabled={busy || answer.trim().length === 0}
              className="h-10 shrink-0 rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-fg disabled:opacity-50"
            >
              {t("discover.confirm.answer", "Answer")}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !hasAnything}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[0.875rem] font-semibold text-accent-fg shadow-md transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {t("discover.confirm.yes", "Haan, profiles dikhao")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[0.875rem] font-semibold text-ink transition-colors hover:border-gold-500 disabled:opacity-50"
        >
          <Pencil className="size-4" aria-hidden />
          {t("discover.confirm.edit", "Badlein")}
        </button>
        {voice.supported && !intent.clarificationQuestion && (
          <button
            type="button"
            onClick={() => (listening ? voice.stop() : void voice.start())}
            disabled={busy}
            aria-pressed={listening}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-[0.875rem] font-semibold transition-colors disabled:opacity-50",
              listening ? "border-gold-500 bg-gold-500 text-primary-fg" : "border-line-strong bg-surface text-ink hover:border-gold-500",
            )}
          >
            {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            {listening ? t("discover.confirm.listening", "Sun rahe hain…") : t("discover.confirm.speakAgain", "Dobara bolun")}
          </button>
        )}
      </div>
    </Card>
    </section>
  );
}
