"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { MINDSET_QUESTIONS, buildVibeLine } from "@/lib/profile/mindset";
import { useProfile } from "@/lib/profile/profileState";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import InfoTip from "@/components/ui/InfoTip";

/**
 * A short, separate flow shown once, right after Stage 1 goes live.
 *
 * Deliberately not part of the voice interview: these are tap-only choices
 * (no Sonnet call, D-31), and asking them right after "profile live" lands
 * — rather than burying them mid-catalog — is what makes them read as a
 * bonus, not eight more fields between the user and the dashboard.
 */
export default function MindsetFlow({ onDone }: { onDone: () => void }) {
  const { draft, setValue, skipField } = useProfile();
  const [step, setStep] = useState(0);
  const total = MINDSET_QUESTIONS.length;
  const revealing = step >= total;
  const current = MINDSET_QUESTIONS[Math.min(step, total - 1)];
  const vibeLine = buildVibeLine(draft.values);

  function advance() {
    setStep((s) => Math.min(s + 1, total));
  }

  function choose(value: string) {
    haptic("select");
    setValue(current.key, value, { source: "user", confirmed: true });
    advance();
  }

  function skipAll() {
    haptic("tap");
    skipField("mindsetFlow");
    onDone();
  }

  if (revealing) {
    return (
      <section className="mx-auto max-w-xl space-y-6 text-center">
        <Pill tone="trust" size="sm">
          <Sparkles />
          Aapki Vibe
        </Pill>
        {vibeLine ? (
          <h1 className="text-balance text-2xl leading-tight sm:text-3xl">&ldquo;{vibeLine}&rdquo;</h1>
        ) : (
          <h1 className="text-balance text-2xl leading-tight sm:text-3xl">
            Koi baat nahi — ye baad me bhi bata sakte hain
          </h1>
        )}
        <p className="text-pretty leading-relaxed text-muted">
          Ye chhota insight aapki Rishta Reel profile pe dikhega, taaki log aapko sirf degree ya job
          se nahi, thodi soch se bhi jaanein.
        </p>
        <Button variant="accent" size="lg" fullWidth onClick={onDone}>
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-6 text-center">
      <div className="flex items-center justify-between gap-3 text-left">
        <Pill tone="gold" size="sm">
          <Sparkles />
          Special · {step + 1}/{total}
        </Pill>
        <button
          type="button"
          onClick={skipAll}
          className="min-h-11 touch-target text-[0.8125rem] font-medium text-muted underline underline-offset-4 hover:text-ink"
        >
          Skip All
        </button>
      </div>

      <h1 className="text-balance text-2xl leading-tight sm:text-3xl">
        {current.question}
        <InfoTip text={current.whyNeeded} className="ml-1.5 align-middle" />
      </h1>

      <div className="flex flex-wrap justify-center gap-2">
        {current.options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            className={cn(
              "min-h-12 touch-target rounded-full border border-line-strong bg-surface px-4",
              "text-sm font-medium text-ink transition-all active:scale-95",
              "hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={advance}
        className="min-h-11 touch-target text-[0.8125rem] font-medium text-muted underline underline-offset-4 hover:text-ink"
      >
        Skip This Question
      </button>
    </section>
  );
}
