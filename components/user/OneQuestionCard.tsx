"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageCircleQuestion } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import type { GapQuestionDef } from "@/lib/profile/dailyQuestions";

/**
 * One optional question on the dashboard, answered with a tap.
 *
 * The question is the day's Deep Profile gap question — the same pre-written
 * bank `GapQuestionCard` on `/user/vibe` draws from (`lib/profile/
 * dailyQuestions.ts`: the three mindset questions, then smoking / drinking /
 * familyValues / relocateWilling), picked by `userDashboardData` as the first
 * one still unanswered. The answer is written to the real profile field
 * through `/api/profile/save-draft`, exactly as onboarding writes it, so the
 * next visit naturally shows the next gap and nothing here needs its own
 * "asked already" state.
 *
 * What it deliberately is not: a streak, a counter, a "3 questions left", a
 * blocking step. One question, tappable options, a thank-you line, gone.
 * Skipping is a scroll. (D-32: the question and its options are code's words,
 * no model call.)
 */
export default function OneQuestionCard({ question }: { question: GapQuestionDef }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  async function answer(value: string) {
    if (busy) return;
    setBusy(value);
    try {
      const res = await fetch("/api/profile/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `meta` marks the answer as the person's own, confirmed word — the
        // same provenance a tapped card in the builder records — so the
        // "Why this match?" layer may treat it as self-confirmed evidence.
        body: JSON.stringify({
          values: { [question.key]: value },
          meta: { [question.key]: { source: "user", confirmed: true } },
        }),
      });
      if (!res.ok) {
        toast({
          title: t("userPage.dashboard.oneQuestion.saveFailed", "Save nahi hua"),
          description: t("userPage.dashboard.oneQuestion.tryAgain", "Please try again."),
          tone: "error",
        });
        return;
      }
      setAnswered(true);
      // The server's picture of the profile moved; a soft refresh lets the
      // rest of the dashboard (match reasons, intelligence) catch up without
      // a reload. This card stays on its thank-you line meanwhile.
      router.refresh();
    } catch {
      toast({
        title: t("userPage.dashboard.oneQuestion.networkError", "Network error"),
        description: t("userPage.dashboard.oneQuestion.tryAgain", "Please try again."),
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  if (answered) {
    return (
      <div role="status" className="bt-card flex items-center gap-3 px-4 py-3">
        <span className="bt-ring bt-ring--trust [--paper-ring-size:2.25rem]">
          <Check className="size-4" />
        </span>
        <p className="text-[0.875rem] text-ink">
          {t("userPage.dashboard.oneQuestion.thanks", "Isse aapke match reasons aur clear honge.")}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label={t("userPage.dashboard.oneQuestion.aria", "Ek chhota sawaal")}
      className="bt-card px-4 py-4 sm:px-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="bt-ring [--paper-ring-size:2.5rem]">
          <MessageCircleQuestion className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="bt-section-label">
            {t("userPage.dashboard.oneQuestion.kicker", "Ek chhota sawaal — optional")}
          </p>
          {/* The question in the serif: it is the one line here a person
              actually reads, and the answers below it are the ghost pill
              the rest of the page uses for a second action. */}
          <p className="bt-display mt-1.5 text-[1.05rem] leading-snug">
            {question.question}
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={busy !== null}
                onClick={() => answer(opt)}
                className="bt-cta-ghost inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.875rem] font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
              >
                {busy === opt && <Loader2 className="size-3.5 animate-spin" />}
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
