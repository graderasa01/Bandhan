"use client";

import { useCallback, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleAlert,
  Loader2,
  PencilLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  BIO_TONES,
  type BioAnswer,
  type BioDraft,
  type BioResponse,
  type BioTone,
} from "@/lib/contracts/bio";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { HI_ACTIONS, type ActionLabels, type SpokenLanguage } from "@/lib/contracts/interview";
import type { FillingFor } from "@/lib/contracts/interview";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Textarea from "@/components/ui/Textarea";
import AnswerInput from "@/components/profile/AnswerInput";

/**
 * The bio writer — 02_product_spec §19.
 *
 * A blank "apne baare me bataiye" box is where most people stop filling a
 * profile: they know what they are like, they just cannot write it about
 * themselves. So this asks two or three concrete, answerable things instead —
 * what they did last weekend, what friends say about them — and turns the
 * answers into prose.
 *
 * Nothing lands in the profile until the user confirms, and the text stays
 * editable right up to that moment. The screen also names every profile field
 * the bio was built from, so it can be checked rather than trusted.
 */

type Step = "intro" | "asking" | "writing" | "choosing" | "failed";

/** Label a field key for the "ye inhi baaton se bana hai" list. */
function fieldLabel(key: string): string {
  if (key === "age") return "Umar";
  return FIELD_BY_KEY[key]?.label ?? key;
}

export default function BioWriter({
  prompts,
  knownFields,
  language,
  fillingFor,
  actions = HI_ACTIONS,
  onDone,
  onCancel,
}: {
  /** The concrete openers from the field catalog. */
  prompts: string[];
  knownFields: Record<string, string>;
  language: SpokenLanguage;
  fillingFor: FillingFor;
  actions?: ActionLabels;
  /** Called with the confirmed text — the only path into the draft. */
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<BioAnswer[]>([]);
  const [drafts, setDrafts] = useState<BioDraft[]>([]);
  const [usedFields, setUsedFields] = useState<string[]>([]);
  const [chosen, setChosen] = useState<BioTone | null>(null);
  const [edited, setEdited] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Three is the most anyone will answer before it feels like a form. */
  const asked = useMemo(() => prompts.slice(0, 3), [prompts]);

  const generate = useCallback(
    async (collected: BioAnswer[]) => {
      setStep("writing");
      setError(null);
      try {
        const res = await fetch("/api/profile/bio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers: collected, knownFields, language, fillingFor }),
        });
        const data = (await res.json()) as BioResponse;
        if (!data.ok) {
          setError(data.message);
          setStep("failed");
          return;
        }
        setDrafts(data.drafts);
        setUsedFields(data.usedFields);
        const first = data.drafts[0];
        setChosen(first.tone);
        setEdited(first.text);
        setStep("choosing");
        haptic("success");
      } catch {
        setError("Bio nahi ban paaya. Aap khud likh kar bhi bata sakte hain.");
        setStep("failed");
      }
    },
    [knownFields, language, fillingFor],
  );

  const submitAnswer = useCallback(
    (text: string) => {
      const next = [...answers, { prompt: asked[index], answer: text }];
      setAnswers(next);
      if (index + 1 < asked.length) {
        setIndex(index + 1);
      } else {
        void generate(next);
      }
    },
    [answers, asked, index, generate],
  );

  const skipRest = useCallback(() => {
    // Skipping is allowed at any point — with fewer answers the bio leans on
    // profile facts instead, which is thinner but still honest.
    void generate(answers);
  }, [answers, generate]);

  /* ---------------------------------------------------------------- */

  if (step === "intro") {
    return (
      <Card padding="lg" className="space-y-5">
        <div className="space-y-2">
          <Pill tone="gold" size="sm">
            <Sparkles />
            Main likh deta hoon
          </Pill>
          <h2 className="text-xl leading-snug">Apne baare me likhna mushkil lagta hai?</h2>
          <p className="text-pretty text-[0.9375rem] leading-relaxed text-muted">
            Koi baat nahi. Main {asked.length} chhote sawaal poochhunga — jo mann me aaye bata
            dijiye, main usse likh dunga. Aap padh kar badal bhi sakte hain.
          </p>
        </div>

        <ul className="space-y-1.5">
          {asked.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[0.8125rem] text-muted">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-500" />
              {p}?
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="accent"
            onClick={() => {
              haptic("tap");
              setStep("asking");
            }}
            className="sm:flex-1"
          >
            <Sparkles className="size-4" />
            Theek hai, poochhiye
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            <PencilLine className="size-4" />
            Main khud likhunga
          </Button>
        </div>
      </Card>
    );
  }

  if (step === "asking") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Pill tone="neutral" size="sm">
            Sawaal {index + 1} / {asked.length}
          </Pill>
          <button
            type="button"
            onClick={skipRest}
            className="min-h-12 touch-target text-[0.8125rem] font-medium text-muted hover:text-ink"
          >
            Bas, itna hi kaafi hai
          </button>
        </div>

        <h2 className="text-balance text-xl leading-snug sm:text-2xl">{asked[index]}?</h2>

        <AnswerInput
          hint="Ek-do line kaafi hai"
          busy={false}
          language={language}
          actions={actions}
          onSubmit={submitAnswer}
        />
      </div>
    );
  }

  if (step === "writing") {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="size-7 animate-spin text-primary-text" />
        <div>
          <p className="text-[0.9375rem] font-semibold text-ink">Aapke shabdon se likh raha hoon</p>
          <p className="mt-1 text-[0.8125rem] text-muted">Teen tarah se — jo pasand aaye chun lijiye.</p>
        </div>
      </Card>
    );
  }

  if (step === "failed") {
    return (
      <Card padding="lg" className="space-y-4">
        <p className="flex items-start gap-2.5 rounded-md border border-warn/30 bg-warn-bg px-4 py-3 text-[0.8125rem] leading-snug text-warn">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void generate(answers)} className="sm:flex-1">
            <RefreshCw className="size-4" />
            Dobara koshish
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Main khud likhunga
          </Button>
        </div>
      </Card>
    );
  }

  /* choosing ------------------------------------------------------- */

  const selected = drafts.find((d) => d.tone === chosen);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Pill tone="gold" size="sm">
            <Sparkles />
            Teen tarah se likha
          </Pill>
          <h2 className="mt-2 text-xl leading-snug">Jo sahi lage wo chun lijiye</h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Peeche"
          className="grid size-12 shrink-0 place-items-center rounded-full text-muted hover:bg-bg-subtle hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </button>
      </div>

      <div className="space-y-2.5">
        {drafts.map((d) => {
          const tone = BIO_TONES.find((t) => t.id === d.tone);
          const active = d.tone === chosen;
          return (
            <button
              key={d.tone}
              type="button"
              onClick={() => {
                haptic("select");
                setChosen(d.tone);
                setEdited(d.text);
                setEditing(false);
              }}
              aria-pressed={active}
              className={cn(
                "block w-full rounded-md border-2 p-4 text-left transition-all duration-200",
                active
                  ? "border-primary bg-gold-50 dark:bg-gold-900/25"
                  : "border-line bg-surface hover:border-line-strong hover:bg-bg-subtle",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-semibold text-ink">
                    {tone?.label}
                  </span>
                  <span className="block text-[0.75rem] text-subtle">{tone?.hint}</span>
                </span>
                {active && (
                  <motion.span
                    layoutId={reduced ? undefined : "bio-tone"}
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-primary"
                  >
                    <Check className="size-3 text-primary-fg" strokeWidth={3} />
                  </motion.span>
                )}
              </span>
              <span className="mt-3 block text-[0.9375rem] leading-relaxed text-ink">{d.text}</span>
            </button>
          );
        })}
      </div>

      {/* What it was built from. A bio the user cannot audit is one they have
          to take on faith, and §19.2 is the kind of rule that only means
          something if it is visible. */}
      {usedFields.length > 0 && (
        <div className="rounded-md border border-line bg-bg-subtle px-4 py-3">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            Sirf inhi baaton se bana hai
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
            {usedFields.map(fieldLabel).join(" · ")}
            {answers.length > 0 && ` · aur aapke ${answers.length} jawab`}
          </p>
          <p className="mt-2 text-[0.75rem] leading-snug text-subtle">
            Kamai, jaati, gotra aur ghar ka pata bio me kabhi nahi jaate.
          </p>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={edited}
            rows={5}
            aria-label="Apne baare me"
            onChange={(e) => setEdited(e.target.value)}
          />
          <p className="text-[0.75rem] text-subtle">
            Jo badalna ho badal dijiye — yahi profile par jayega.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-h-12 touch-target items-center gap-1.5 text-[0.8125rem] font-semibold text-primary-text underline underline-offset-4"
        >
          <PencilLine className="size-4" />
          Apne shabdon me badal dijiye
        </button>
      )}

      <div className="space-y-3">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          disabled={edited.trim().length === 0}
          onClick={() => {
            haptic("success");
            onDone(edited.trim());
          }}
        >
          <Check className="size-4" />
          Yahi rakhiye
        </Button>

        <p className="flex items-start gap-2.5 text-[0.75rem] leading-snug text-muted">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary-text" />
          Aapke &quot;Yahi rakhiye&quot; dabane tak ye profile me nahi jaata.
          {selected && " Jo dikh raha hai, wahi jayega."}
        </p>
      </div>
    </div>
  );
}
