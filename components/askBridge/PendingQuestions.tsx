"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, HelpCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AnswerQuestionSheet from "./AnswerQuestionSheet";
import ReportSheet from "@/components/safety/ReportSheet";
import CelebrationHost, { type Celebration } from "@/components/ui/CelebrationHost";
import type { InboundQuestionView } from "@/lib/contracts/askBridge";

/**
 * Inbound Ask Bridge questions awaiting an answer — sits above `NoticeList`
 * for the same reason `ReceivedVoiceNotes` does: these are objects to act on,
 * not events to read, and each is a mystery the recipient can only resolve by
 * answering (see AnswerQuestionSheet).
 */
export default function PendingQuestions({ initial }: { initial: InboundQuestionView[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [answerTarget, setAnswerTarget] = useState<InboundQuestionView | null>(null);
  const [reportTarget, setReportTarget] = useState<InboundQuestionView | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    setQuestions(initial);
  }, [initial]);

  if (questions.length === 0) return null;

  function remove(id: string) {
    setQuestions((list) => list.filter((q) => q.id !== id));
  }

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-wine-700">
        Aaye hue sawaal
        <span className="rounded-full bg-wine-700 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
          {questions.length}
        </span>
      </h2>

      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={q.id}>
            <Card padding="md" variant="soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-muted">
                    <HelpCircle className="size-3.5 shrink-0" />
                    {q.teaser} ne poocha hai
                  </p>
                  <p className="mt-1 text-[0.9375rem] leading-snug text-ink">&ldquo;{q.questionText}&rdquo;</p>
                </div>

                <button
                  type="button"
                  onClick={() => setReportTarget(q)}
                  aria-label="Report"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-subtle transition-colors hover:bg-bg-subtle hover:text-danger"
                >
                  <Flag className="size-4" />
                </button>
              </div>

              <Button variant="primary" size="md" fullWidth className="mt-3" onClick={() => setAnswerTarget(q)}>
                Jawab Dijiye
              </Button>
            </Card>
          </li>
        ))}
      </ul>

      <AnswerQuestionSheet
        question={answerTarget}
        onClose={() => setAnswerTarget(null)}
        onAnswered={() => {
          if (answerTarget) remove(answerTarget.id);
          setAnswerTarget(null);
          router.refresh();
        }}
        onDeclined={() => {
          if (answerTarget) remove(answerTarget.id);
          setAnswerTarget(null);
        }}
        onCelebration={setCelebration}
      />

      <ReportSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        targetLabel="Ye sawaal"
        targetType="QUESTION"
        targetId={reportTarget?.id}
      />

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />
    </section>
  );
}
