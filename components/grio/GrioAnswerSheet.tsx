"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useT } from "@/components/i18n/LanguageProvider";
import AnswerQuestionSheet from "@/components/askBridge/AnswerQuestionSheet";
import type { InboundQuestionView } from "@/lib/contracts/askBridge";

/**
 * Answering an inbound question from inside Grio.
 *
 * Two stages, and the split is the point: this component only picks *which*
 * question, then hands the whole job to `AnswerQuestionSheet` — the same
 * component `/user/inbox` uses, posting to the same endpoint, with the same
 * reveal-on-answer copy. Re-implementing the answer flow here would mean two
 * places that could disagree about what answering costs and what it discloses.
 *
 * Why the user picks instead of the model: the answer endpoint needs a question
 * id, and an id is exactly the kind of argument no marker in this app carries.
 * The list is fetched by the client and never enters a prompt, so Grio can say
 * "do sawaal jawab ka intezaar kar rahe hain" (a count, from its context block)
 * without ever having read one.
 */
export default function GrioAnswerSheet({
  open,
  onClose,
  onAnswered,
}: {
  open: boolean;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const t = useT();
  const [questions, setQuestions] = useState<InboundQuestionView[] | null>(null);
  const [active, setActive] = useState<InboundQuestionView | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuestions(null);
    setActive(null);
    fetch("/api/profile-questions")
      .then((r) => r.json())
      .then((json) => setQuestions(json.ok ? json.questions : []))
      .catch(() => setQuestions([]));
  }, [open]);

  /** Drop the handled row locally — refetching would race the server's own write. */
  function settle(id: string) {
    setQuestions((prev) => prev?.filter((q) => q.id !== id) ?? null);
    setActive(null);
  }

  return (
    <>
      <Sheet
        open={open && active === null}
        onClose={onClose}
        variant="bottom"
        title={t("grio.pickQuestion", "Kis sawaal ka jawab dena hai?")}
      >
        {questions === null ? (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            {t("grio.loading", "Load ho raha hai…")}
          </p>
        ) : questions.length === 0 ? (
          <p className="py-6 text-center text-[0.8125rem] text-muted">
            {t("grio.noPendingQuestions", "Abhi koi sawaal jawab ka intezaar nahi kar raha.")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {questions.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setActive(q)}
                className="rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-gold-400"
              >
                <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-gold-700 dark:text-gold-300">
                  {q.teaser}
                </p>
                <p className="mt-1 text-[0.875rem] leading-snug text-ink">&ldquo;{q.questionText}&rdquo;</p>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <AnswerQuestionSheet
        question={active}
        onClose={() => setActive(null)}
        onAnswered={() => {
          if (active) settle(active.id);
          onAnswered();
        }}
        onDeclined={() => {
          if (active) settle(active.id);
        }}
      />
    </>
  );
}
