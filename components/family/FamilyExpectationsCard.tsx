"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { FamilyQuestionView } from "@/lib/services/family/familyExpectationService";

/**
 * "Aap kya sochte hain?" — the family's own expectations, on the family portal.
 *
 * ## Why the family is asked at all
 *
 * Because they already have opinions, and today those opinions arrive in the
 * rishta at the worst possible moment: after two people have talked for a month
 * and one of them discovers their parents assumed something different about
 * where the couple would live. Asking early does not resolve the disagreement —
 * nothing in an app can — but it moves the discovery from "after we were
 * serious" to "before", which is the whole of the value.
 *
 * ## What this screen deliberately never shows
 *
 * The owner's answers. Not next to the question, not after answering, not as a
 * tick. More than half of these are MATCH_PRIVATE, and a parent reading their
 * adult child's private answers is a violation the child cannot easily refuse.
 * `/api/family-portal/expectations` has no shape that returns them, so this is
 * enforced by the endpoint rather than by this component remembering to omit it.
 *
 * The framing matters too: every line here says *aap kya sochte hain*, never
 * *sahi jawab kya hai*. A parent who feels graded stops answering honestly, and
 * a dishonest answer here is worse than no answer — it produces a comparison
 * that reads as agreement.
 */
export default function FamilyExpectationsCard({
  ownerName,
  initial,
}: {
  ownerName: string;
  initial: FamilyQuestionView[];
}) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const answered = questions.filter((q) => q.answer.length > 0).length;

  async function answer(key: string, value: string) {
    if (busyKey) return;
    setBusyKey(key);
    try {
      const res = await fetch("/api/family-portal/expectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Save nahi hua", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return;
      }
      if (json.questions) setQuestions(json.questions);
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium text-ink">Aapki apni soch</span>
          <span className="block text-[0.75rem] text-muted">
            {answered === 0
              ? `${ownerName} ke rishtey ke baare me aap kya chahte hain — ${questions.length} chhote sawaal.`
              : `${questions.length} me se ${answered} ka jawab de diya.`}
          </span>
        </span>
        {answered > 0 && (
          <span className="shrink-0 rounded-full bg-gold-400/15 px-2 py-0.5 text-[0.6875rem] font-medium text-gold-700 dark:text-gold-300">
            {answered}/{questions.length}
          </span>
        )}
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3">
          {/* Said once, at the top, and said plainly. A family member who thinks
              this is a test of what their child wants will answer what they
              think is expected — which produces a false agreement, the one
              outcome worse than silence. */}
          <p className="mb-3 rounded-md border border-line bg-bg-subtle px-3 py-2.5 text-[0.75rem] leading-relaxed text-muted">
            Ye {ownerName} ke jawab nahi hain — <span className="font-medium text-ink">aap</span> kya sochte hain, wo
            hai. Dono alag ho sakte hain aur ye bilkul normal hai. Aapka jawab {ownerName} ko dikhega taaki wo aapse
            baat kar sakein; unka jawab aapko nahi dikhta.
          </p>

          <ul className="flex flex-col gap-4">
            {questions.map((q) => (
              <li key={q.key}>
                <p className="text-[0.875rem] leading-snug text-ink">{q.question}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted">{q.whyNeeded}</p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.options.map((option) => {
                    const chosen = q.answer.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => void answer(q.key, option)}
                        aria-pressed={chosen}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[0.75rem] transition-colors disabled:opacity-55 ${
                          chosen
                            ? "border-gold-400 bg-gold-400/15 font-medium text-ink"
                            : "border-line text-muted hover:border-gold-400"
                        }`}
                      >
                        {chosen && <Check className="size-3" />}
                        {option}
                      </button>
                    );
                  })}
                  {busyKey === q.key && <Loader2 className="size-3.5 animate-spin self-center text-muted" />}
                </div>
              </li>
            ))}
          </ul>

          {/* No "Done" button on purpose: every tap already saved, and a submit
              control would imply the set has to be finished in one sitting.
              Nine questions is more than a parent will answer at once. */}
          <p className="mt-4 text-[0.6875rem] text-muted">
            Har jawab turant save ho jaata hai. Jab chahein badal sakte hain.
          </p>
        </div>
      )}
    </section>
  );
}
