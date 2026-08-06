"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
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
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);

  // One-shot landing glow, same technique as QuestionRail/DraftTray's "just
  // landed" pulse — here it fires on mount rather than on a prop change,
  // since a fresh gap question only ever shows up via a full page load.
  const [glow, setGlow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGlow(false), 1500);
    return () => clearTimeout(t);
  }, []);

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
    <Card
      variant="luxe"
      padding="md"
      className={cn("spotlight mb-4 overflow-hidden border-gold-300/60 shadow-gold", glow && !reduced && "animate-jadu")}
    >
      <div className="relative flex items-start gap-3">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
          <span aria-hidden className="absolute inset-0 rounded-full animate-pulse-ring" />
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-gold-700">Aaj ka sawaal</p>
          <p className="mt-0.5 text-[0.9375rem] font-medium text-ink">{question.question}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={busy !== null}
                onClick={() => answer(opt)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-gold-400 hover:bg-gold-50 disabled:opacity-50 dark:hover:bg-gold-900/20"
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
