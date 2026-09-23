"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import type { ReelRefineQuestion } from "@/lib/contracts/reel";
import { FEED_PREFERENCE_FIELDS } from "@/lib/reel/feedQuestions";
import { useT } from "@/components/i18n/LanguageProvider";

/** How long "Saved" stays on screen before the feed moves on by itself. */
const SAVED_HOLD_MS = 900;

/** Two chips a row only when every label is short enough not to wrap into a paragraph. */
const TWO_COLUMN_MAX_CHARS = 14;

/**
 * A question page in the feed — one of the member's own unanswered fields,
 * between two people (`lib/reel/feedQuestions.ts` has the rules).
 *
 * It is a page, not an overlay: it arrives the way the next person would and
 * leaves the same way, so it never covers a face and never pops up on a timer.
 * The top bar stays; there is no action rail, because nothing here is about
 * anybody else.
 *
 * - **A chip is the only thing that writes.** It goes through the ordinary
 *   autosave as the member's own confirmed word — the provenance the
 *   dashboard's one-question card records — says so, and then moves the feed
 *   on by itself: answering was the member asking for the next person.
 * - **Skip and a plain scroll write nothing.**
 * - **A save that did not land says so and stays.** The feed never moves on a
 *   failed save, or the member would believe an answer the server never got.
 */
export default function ReelQuestionPage({
  question,
  active,
  onSaved,
  onNext,
}: {
  question: ReelRefineQuestion;
  /** On screen right now — a timer that outlives a scroll must not move the feed. */
  active: boolean;
  onSaved: (key: string) => void;
  onNext: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );

  const preference = FEED_PREFERENCE_FIELDS.includes(question.key);
  const twoColumns = question.options.every((o) => o.length <= TWO_COLUMN_MAX_CHARS);

  async function answer(value: string) {
    if (busy || saved) return;
    haptic("select");
    setBusy(value);
    setFailed(false);
    try {
      const res = await fetch("/api/profile/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: { [question.key]: value },
          meta: { [question.key]: { source: "user", confirmed: true } },
        }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setSaved(value);
      onSaved(question.key);
      hold.current = setTimeout(() => {
        if (activeRef.current) onNext();
      }, SAVED_HOLD_MS);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label={t("reel.feedQuestion.aria", "Aapki profile ka ek sawaal")}
      className="flex h-full flex-col bg-gradient-to-b from-wine-700 via-wine-900 to-sand-900 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(4.5rem+env(safe-area-inset-top,0px))]"
    >
      <div className="mx-auto my-auto w-full max-w-md rounded-[1.5rem] border border-gold-200/70 bg-surface px-5 py-6 shadow-lg dark:border-gold-700/40">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <MessageCircleQuestion className="size-5" aria-hidden />
          </span>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            {t("reel.feedQuestion.kicker", "Aapki profile · ek sawaal")}
          </p>
        </div>

        <h2 className="mt-4 font-[family-name:var(--font-display)] text-[1.25rem] font-bold leading-snug text-accent-text">
          {question.question}
        </h2>
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
          {preference
            ? t("reel.feedQuestion.whyPreference", "Aapki pasand — aage ke rishtey isi hisaab se chune jayenge.")
            : t("reel.feedQuestion.whySelf", "Ek tap me aapki profile me jud jayega. Baad me kabhi bhi badal sakte hain.")}
        </p>

        <div className={cn("mt-4 grid gap-2", twoColumns ? "grid-cols-2" : "grid-cols-1")}>
          {question.options.map((option) => {
            const on = saved === option;
            return (
              <button
                key={option}
                type="button"
                disabled={busy !== null || saved !== null}
                aria-pressed={on}
                onClick={() => void answer(option)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-center text-[0.875rem] font-medium leading-tight transition-colors",
                  on
                    ? "border-gold-400 bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200"
                    : "border-line-strong bg-surface text-ink hover:border-gold-400 hover:bg-gold-50 dark:hover:bg-gold-900/20",
                  (busy !== null || saved !== null) && !on && busy !== option && "opacity-50",
                )}
              >
                {busy === option ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                ) : on ? (
                  <Check className="size-3.5 shrink-0" aria-hidden />
                ) : null}
                {option}
              </button>
            );
          })}
        </div>

        {failed && (
          <p role="alert" className="mt-3 text-[0.75rem] text-danger">
            {t("reel.end.saveFailed", "Save nahi ho paaya — dobara try karein.")}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-3 flex items-center gap-1.5 text-[0.8125rem] font-medium text-trust">
            <Check className="size-4 shrink-0" aria-hidden />
            {t("reel.feedQuestion.saved", "Save ho gaya — profile me jud gaya.")}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[0.75rem] leading-snug text-subtle">
            {t("reel.feedQuestion.scrollHint", "Upar swipe karein to agli profile")}
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={onNext}
            className="min-h-11 shrink-0 rounded-full px-4 text-[0.875rem] font-semibold text-muted transition-colors hover:bg-bg-subtle hover:text-ink disabled:opacity-50"
          >
            {saved ? t("reel.feedQuestion.next", "Next") : t("reel.feedQuestion.skip", "Skip")}
          </button>
        </div>
      </div>
    </section>
  );
}
