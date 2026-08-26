"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import {
  DEAL_BREAKER_LABEL,
  INTELLIGENCE_QUESTION_BY_KEY,
} from "@/lib/profile/intelligenceQuestions";
import { catalogKey } from "@/lib/i18n/catalogKeys";

/**
 * "Maine ye samjha — sahi hai?" — the confirmation gate on conversational
 * profiling.
 *
 * Grio hears a Marriage Intelligence answer inside ordinary conversation and
 * emits `<<<LEARN:key=option>>>`. This card is what that marker becomes: the
 * catalog's own question, the catalog's own option, and a tap. Nothing is
 * stored until that tap, which is the whole reason the saved row can honestly
 * carry `source: USER_ENTERED` instead of being an inference — see
 * `LEARN_MARKER_START` for the three gates and why none of them trust the
 * model.
 *
 * ## Two things it deliberately does not do
 *
 * **It does not drop a near-miss.** Every other marker in this system fails
 * silently, and that is right for a button nobody asked for. It is wrong here:
 * the user has *already said the thing*, and dropping the card means the app
 * heard them and pretended it did not, then asks the same question on a form a
 * week later. So an option the model got slightly wrong ("6-12 months" for the
 * catalog's "6–12 months") falls through to the full option list rather than to
 * nothing. Only an unknown *key* renders nothing, because there is no question
 * to show.
 *
 * **It does not write the profile field.** It posts to the same
 * `/api/profile/intelligence` endpoint the layer flow posts to, so
 * `saveSignalAnswer` runs — with its option validation, its server-assigned
 * visibility, its `respondentType`, its `marriageTimeline` sync and its
 * `writeBack`. A second write path would be a second place for those five
 * things to drift.
 */

/** Trimmed, case- and dash-insensitive. The en-dash in "6–12 months" is the real miss. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[–—-]/g, "-").replace(/\s+/g, " ");
}

export default function GrioLearnCard({
  learnKey,
  proposed,
  onSaved,
}: {
  learnKey: string;
  /** The option the model heard. Never trusted — matched against the catalog. */
  proposed: string;
  /** Code's sentence for the transcript, so the next turn knows this is settled. */
  onSaved: (line: string) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const question = INTELLIGENCE_QUESTION_BY_KEY[learnKey];
  // An unknown key is the one case with nothing to render: no question text, no
  // options, nothing the user could meaningfully confirm.
  //
  // A multi-select is the second, and for a sharper reason. `saveSignalAnswer`
  // replaces the stored set, so confirming one option here would delete the
  // other four — a card that destroys data if you agree with it. The model is
  // never given the key for one of these (`askableInChat`, selfKnowledge.ts), so
  // this is unreachable in practice; it stays because "unreachable" is a
  // property of today's prompt and the data loss would be permanent.
  if (!question || question.multi) return null;

  const matched = question.options.find((o) => normalise(o) === normalise(proposed)) ?? null;
  /** Display only. The stored value stays `option` — see catalogKeys.ts. */
  const optionLabel = (option: string) =>
    t(catalogKey.option(option), DEAL_BREAKER_LABEL[option] ?? option);
  const showOptions = picking || matched === null;

  async function save(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: learnKey, value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("grio.learn.failed", "Jawab save nahi hua"),
          description: json?.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }
      setSaved(value);
      toast({ title: t("grio.learn.saved", "Yaad rakh liya"), tone: "success" });
      // Code's words in Grio's voice, appended to the transcript for the same
      // reason every action outcome is: the model reads it next turn, and
      // without it Grio asks again what it has just been told.
      onSaved(`✓ ${question.label}: ${value} — profile me save ho gaya.`);
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="flex max-w-[85%] items-center gap-2 rounded-lg border border-line bg-bg-subtle px-3.5 py-2.5 text-[0.8125rem] text-muted">
        <Check className="size-3.5 shrink-0 text-gold-600 dark:text-gold-400" />
        <span>
          {t(catalogKey.questionLabel(question.key), question.label)}:{" "}
          <span className="font-medium text-ink">{optionLabel(saved)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-[85%] rounded-lg border border-gold-300/70 bg-surface px-3.5 py-3 dark:border-gold-700/60">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
        <Sparkles className="size-3" />
        {t("grio.learn.heading", "Profile me save karein?")}
      </p>
      <p className="mt-1.5 text-[0.875rem] leading-snug text-ink">
        {t(catalogKey.questionText(question.key), question.question)}
      </p>

      {showOptions ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => void save(option)}
              className="rounded-md border border-line px-3 py-2 text-left text-[0.8125rem] text-ink transition-colors hover:border-gold-400 disabled:opacity-55"
            >
              {optionLabel(option)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="mt-2 rounded-md border border-line bg-bg-subtle px-3 py-2 text-[0.875rem] font-medium text-ink">
            {optionLabel(matched)}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(matched)}
              className="flex-1 rounded-md bg-gradient-to-b from-gold-400 to-gold-600 px-3 py-2 text-[0.8125rem] font-medium text-primary-fg disabled:opacity-55"
            >
              {t("grio.learn.confirm", "Yes, save")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPicking(true)}
              className="flex-1 rounded-md border border-line px-3 py-2 text-[0.8125rem] text-ink transition-colors hover:border-gold-400 disabled:opacity-55"
            >
              {t("grio.learn.change", "Something else")}
            </button>
          </div>
        </>
      )}

      {question.visibility !== "PROFILE_VISIBLE" ? (
        <p className="mt-2 text-[0.6875rem] text-muted">
          {t("grio.learn.private", "Ye jawab kisi ko dikhega nahi — sirf matching me kaam aata hai.")}
        </p>
      ) : null}
    </div>
  );
}
