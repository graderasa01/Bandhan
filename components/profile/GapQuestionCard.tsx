"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { GapQuestionDef } from "@/lib/profile/dailyQuestions";

/**
 * The actionable half of an UNKNOWN dimension — instead of a dead end,
 * one tap-choice question at a time, written straight to the real profile
 * field via the same `save-draft` path onboarding uses. No AI call here
 * (D-32): the question and its options are all pre-written.
 */
export default function GapQuestionCard({ question }: { question: GapQuestionDef }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(value: string) {
    setBusy(value);
    try {
      const res = await fetch("/api/profile/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { [question.key]: value } }),
      });
      if (!res.ok) {
        toast({ title: "Save nahi hua", description: "Please try again.", tone: "error" });
        return;
      }
      toast({ title: "Shukriya", description: "Ye jaankari aapki Deep Profile behtar banayegi.", tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card variant="soft" padding="md" className="mb-4 border-gold-300/60">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] font-medium uppercase tracking-wide text-gold-700">Aaj ka sawaal</p>
          <p className="mt-0.5 text-[0.9375rem] font-medium text-ink">{question.question}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={busy !== null}
                onClick={() => answer(opt)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-gold-400 hover:bg-gold-50 disabled:opacity-50 dark:hover:bg-gold-900/20"
              >
                {busy === opt && <Loader2 className="size-3.5 animate-spin" />}
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
