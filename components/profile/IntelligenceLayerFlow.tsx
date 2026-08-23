"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, ChevronLeft, Loader2, Lock, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import { ease, haptic } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { LayerView } from "@/lib/services/profile/intelligenceService";

/**
 * One layer, one question per card.
 *
 * The dashboard deliberately does not open questions inline — a dashboard that
 * turns into a questionnaire is a dashboard nobody opens twice. This is the
 * dedicated screen that card links to, and it borrows the manual form's
 * one-thing-at-a-time card philosophy without borrowing its swipe deck: five
 * taps in a row want a stable card and a visible "Question 2 of 5", not a
 * gesture to learn.
 *
 * Nothing here costs an AI call. Every question, option and reason is
 * pre-written in `lib/profile/intelligenceQuestions.ts` (D-31/D-32).
 */

export default function IntelligenceLayerFlow({ layer }: { layer: LayerView }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const reduced = useReducedMotion();

  const questions = layer.questions;
  // Resume where they left off — a returning user should not tap past four
  // answered cards to reach the one they came back for.
  const firstUnanswered = questions.findIndex((q) => q.answer.length === 0);
  const [index, setIndex] = useState(firstUnanswered === -1 ? questions.length : firstUnanswered);
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(questions.map((q) => [q.key, q.answer])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);

  const total = questions.length;
  const done = index >= total;
  const current = done ? null : questions[index];
  const answeredCount = Object.values(answers).filter((a) => a.length > 0).length;

  function advance() {
    setDirection(1);
    setIndex((i) => Math.min(i + 1, total));
  }

  function back() {
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }

  async function persist(key: string, value: string | string[]): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fetch("/api/profile/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        toast({
          title: t("profile.intelligence.saveFailed", "Save nahi hua"),
          description: t("profile.intelligence.tryAgain", "Please try again."),
          tone: "error",
        });
        return false;
      }
      return true;
    } catch {
      toast({
        title: t("profile.intelligence.networkError", "Network error"),
        description: t("profile.intelligence.tryAgain", "Please try again."),
        tone: "error",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function choose(key: string, value: string) {
    haptic("select");
    setAnswers((a) => ({ ...a, [key]: [value] }));
    const ok = await persist(key, value);
    // The optimistic chip is rolled back on failure, so the screen never shows
    // an answer the server does not have.
    if (!ok) setAnswers((a) => ({ ...a, [key]: [] }));
    else advance();
  }

  function toggleMulti(key: string, value: string, max: number | null) {
    haptic("select");
    setAnswers((a) => {
      const existing = a[key] ?? [];
      if (existing.includes(value)) return { ...a, [key]: existing.filter((v) => v !== value) };
      if (max && existing.length >= max) return a;
      return { ...a, [key]: [...existing, value] };
    });
  }

  async function saveMulti(key: string) {
    const value = answers[key] ?? [];
    if (value.length === 0) {
      advance();
      return;
    }
    if (await persist(key, value)) advance();
  }

  if (done) {
    return (
      <section className="mx-auto max-w-xl space-y-6 py-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-trust/10 text-trust ring-2 ring-trust/40">
          <CheckCircle2 className="size-7" />
        </span>
        <div>
          <h1 className="text-balance text-2xl font-semibold leading-tight">
            {layer.title} {t("profile.intelligence.understood", "samajh aa gayi")}
          </h1>
          <p className="mt-2 text-pretty leading-relaxed text-muted">{layer.unlocks}.</p>
        </div>

        <div className="flex flex-col gap-2">
          {layer.nextLayer && (
            <Button variant="accent" size="lg" fullWidth onClick={() => router.push(`/user/profile/intelligence/${layer.nextLayer!.slug}`)}>
              {t("profile.intelligence.nextArea", "Next")}: {layer.nextLayer.title}
              <ArrowRight className="size-4" />
            </Button>
          )}
          <Button variant="secondary" size="lg" fullWidth onClick={() => router.push("/user/dashboard")}>
            {t("profile.intelligence.backToDashboard", "Back to Dashboard")}
          </Button>
        </div>

        {answeredCount < total && (
          <button
            type="button"
            onClick={() => {
              setDirection(-1);
              setIndex(0);
            }}
            className="text-[0.8125rem] font-medium text-primary-text underline-offset-4 hover:underline"
          >
            {t("profile.intelligence.reviewAnswers", "Baaki sawaal dekhein")}
          </button>
        )}
      </section>
    );
  }

  const q = current!;
  const selected = answers[q.key] ?? [];

  return (
    <section className="mx-auto max-w-xl py-2">
      <header className="mb-4 flex items-center gap-3">
        {index > 0 ? (
          <button
            type="button"
            onClick={back}
            aria-label={t("profile.intelligence.previous", "Pichhla sawaal")}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-gold-400 hover:text-gold-700"
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : (
          <Link
            href="/user/dashboard"
            aria-label={t("profile.intelligence.backToDashboard", "Back to Dashboard")}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-gold-400 hover:text-gold-700"
          >
            <ChevronLeft className="size-4" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gold-700">{layer.title}</p>
          <p className="text-[0.8125rem] text-muted">
            {t("profile.intelligence.questionCounter", "Question")} {index + 1}{" "}
            {t("profile.intelligence.of", "of")} {total}
          </p>
        </div>
      </header>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-[width] duration-500"
          style={{ width: `${Math.round((index / total) * 100)}%` }}
        />
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={q.key}
          custom={direction}
          initial={reduced ? false : { opacity: 0, x: direction * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
          transition={ease.base}
        >
          <Card variant="default" padding="lg">
            <h2 className="text-balance text-lg font-semibold leading-snug text-ink">{q.question}</h2>

            {q.derived && selected.length > 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-trust/10 px-2.5 py-1 text-[0.75rem] text-trust">
                <Sparkles className="size-3.5" />
                {t("profile.intelligence.alreadyAnswered", "Ye aapne pehle bataya tha — badal sakte hain")}
              </p>
            )}
            {q.needsSelfConfirm && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2.5 py-1 text-[0.75rem] text-warn">
                {t("profile.intelligence.familyAnswered", "Family ne ye answer diya hai — unse confirm hona baaki hai")}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {q.options.map((opt) => {
                const isSelected = selected.includes(opt.value);
                const atMax = q.multi && q.maxSelections !== null && selected.length >= q.maxSelections && !isSelected;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={busy !== null || atMax}
                    onClick={() =>
                      q.multi ? toggleMulti(q.key, opt.value, q.maxSelections) : choose(q.key, opt.value)
                    }
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left text-[0.9375rem] transition-colors",
                      isSelected
                        ? "border-gold-500 bg-gold-50 font-medium text-ink dark:bg-gold-900/25"
                        : "border-line-strong bg-surface text-ink hover:border-gold-400 hover:bg-gold-50/60 dark:hover:bg-gold-900/15",
                      (busy !== null || atMax) && "opacity-50",
                    )}
                  >
                    <span className="min-w-0">{opt.label}</span>
                    {busy === q.key && isSelected ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-gold-700" />
                    ) : (
                      isSelected && <Check className="size-4 shrink-0 text-gold-700" />
                    )}
                  </button>
                );
              })}
            </div>

            {q.multi && (
              <Button
                variant="accent"
                size="lg"
                fullWidth
                className="mt-4"
                disabled={busy !== null}
                onClick={() => saveMulti(q.key)}
              >
                {t("profile.intelligence.saveContinue", "Save & Continue")}
                <ArrowRight className="size-4" />
              </Button>
            )}

            <p className="mt-4 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
              {q.isPrivate && <Lock className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />}
              <span>
                {q.isPrivate && (
                  <span className="font-medium text-ink">
                    {t(
                      "profile.intelligence.privateNote",
                      "Ye answer public profile par nahi dikhega. Matching improve karne ke liye use hoga.",
                    )}{" "}
                  </span>
                )}
                {q.whyNeeded}
              </span>
            </p>
          </Card>
        </motion.div>
      </AnimatePresence>

      {!q.required && (
        <button
          type="button"
          onClick={advance}
          disabled={busy !== null}
          className="mx-auto mt-4 block min-h-11 px-4 text-[0.8125rem] font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {t("profile.intelligence.skip", "Abhi rehne dein")}
        </button>
      )}
    </section>
  );
}
