"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import type { QuizQuestionView } from "@/lib/services/quiz/quizBattleService";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * One unanswered question at a time — tapping an option submits immediately
 * (same "tap = vote, no separate submit" discipline PollCard uses), then
 * advances. Already-answered questions never show here; the parent only
 * opens this once `myAnsweredCount < total`.
 */
export default function QuizBattleSheet({
  open,
  onClose,
  matchId,
  battleId,
  questions,
  onAnswered,
}: {
  open: boolean;
  onClose: () => void;
  matchId: string;
  battleId: string | null;
  questions: QuizQuestionView[];
  onAnswered: () => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const next = questions.find((q) => q.myAnswer === null);

  async function answer(optionIndex: number) {
    if (!battleId || !next || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/quiz/${battleId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: next.key, optionIndex }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("quiz.battleSheet.answerFailed", "Jawab nahi gaya"), description: json.message, tone: "error" });
        return;
      }
      onAnswered();
      if (json.completed) {
        toast({
          title: t("quiz.battleSheet.completedTitle", "Battle poori ho gayi!"),
          description: t("quiz.battleSheet.completedDesc", "Result dekhne ke liye card kholein."),
          tone: "success",
        });
        onClose();
      }
    } catch {
      toast({ title: t("quiz.battleSheet.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open && next !== undefined} onClose={onClose} title={t("quiz.battleSheet.title", "Quiz Battle")} variant="bottom">
      {next && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-wine-700">
            {questions.filter((q) => q.myAnswer !== null).length + 1} / {questions.length}
          </p>
          <p className="text-[0.9375rem] font-medium text-ink">{next.question}</p>
          <div className="space-y-2">
            {next.options.map((opt, i) => (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => answer(i)}
                className="flex w-full items-center gap-2 rounded-md border border-line-strong px-3.5 py-2.5 text-left text-[0.8125rem] font-medium text-ink transition-colors disabled:cursor-default enabled:hover:border-gold-400 enabled:hover:bg-gold-50 dark:enabled:hover:bg-gold-900/20"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
