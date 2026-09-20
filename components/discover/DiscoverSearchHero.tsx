"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Loader2, Lock, Mic, Sparkles, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";
import { DISCOVER_QUERY_MAX_CHARS } from "@/lib/discovery/contract";
import type { DiscoverVoice } from "./useDiscoverVoice";

const EXAMPLES = [
  "Jaipur ya Delhi ki 25 se 29 saal ki MBA, non-smoker ladki dikhaiye",
  "Neha naam ki Delhi me teacher profile dhoondo",
  "Maine jin profiles ko shortlist kiya hai, un jaisi profiles dikhao",
  "Verified, vegetarian aur relocate karne ke liye ready profiles dikhaiye",
];

export interface DiscoverSearchHeroProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  onClear: () => void;
  voice: DiscoverVoice;
  /** The intent call is in flight. */
  busy: boolean;
  /** FREE plan — the box is a preview, the buttons say so instead of failing. */
  locked: boolean;
  /** Set when the last intent call failed softly (AI unavailable) — the box stays usable, filters do the work. */
  notice?: string | null;
}

/**
 * The page's first and largest control: one sentence in, filters out.
 *
 * Submission is explicit — Enter or the AI Search button — never on keystroke,
 * because every submit is a paid model call and a half-typed sentence is not a
 * search. The microphone feeds the same box: a spoken sentence lands as text
 * here and is submitted the same way, so there is exactly one path into the
 * intent parser.
 */
export default function DiscoverSearchHero({ value, onChange, onSubmit, onClear, voice, busy, locked, notice }: DiscoverSearchHeroProps) {
  const t = useT();
  const inputId = useId();
  const [exampleIdx, setExampleIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 5000);
    return () => clearInterval(timer);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy || locked) return;
    onSubmit(q);
  }

  const listening = voice.state === "listening";
  const transcribing = voice.state === "transcribing";
  const shown = listening && voice.interim ? voice.interim : value;

  return (
    <section aria-labelledby={`${inputId}-label`} className="rounded-lg border border-line bg-surface p-4 shadow-sm sm:p-5">
      <label id={`${inputId}-label`} htmlFor={inputId} className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
        <Sparkles className="size-4 text-wine-700" aria-hidden />
        {t("discover.hero.label", "AI ko batayein aap kaisa rishta dhoondh rahe hain")}
      </label>

      <form onSubmit={submit} className="mt-3">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border bg-surface pl-4 pr-1.5 transition-[border-color,box-shadow]",
            listening ? "border-gold-500 shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]" : "border-line-strong focus-within:border-gold-500 focus-within:shadow-[0_0_0_3px_rgb(201_169_110_/_0.18)]",
          )}
        >
          <input
            id={inputId}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={shown}
            maxLength={DISCOVER_QUERY_MAX_CHARS}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("discover.hero.placeholder", "AI ko batayein aap kaisa rishta dhoondh rahe hain…")}
            disabled={busy || listening || transcribing}
            aria-describedby={`${inputId}-hint ${inputId}-status`}
            className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-subtle disabled:opacity-70"
          />
          {value && !listening && (
            <button
              type="button"
              onClick={onClear}
              aria-label={t("discover.hero.clear", "Clear")}
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
          {voice.supported && (
            <button
              type="button"
              onClick={() => (listening ? voice.stop() : void voice.start())}
              disabled={locked || busy || transcribing}
              aria-pressed={listening}
              aria-label={listening ? t("discover.hero.stopListening", "Stop listening") : t("discover.hero.speak", "Bol kar batayein")}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50",
                listening ? "bg-accent text-accent-fg" : "text-wine-700 hover:bg-gold-50 dark:hover:bg-gold-900/30",
              )}
            >
              {transcribing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            </button>
          )}
          <button
            type="submit"
            disabled={locked || busy || listening || transcribing || value.trim().length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : locked ? <Lock className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
            {t("discover.hero.aiSearch", "AI Search")}
          </button>
        </div>

        <p id={`${inputId}-hint`} className="mt-2 flex min-w-0 items-center gap-1.5 text-[0.75rem] text-subtle">
          <span className="shrink-0">{t("discover.hero.exampleLead", "Jaise:")}</span>
          <button
            type="button"
            onClick={() => onChange(EXAMPLES[exampleIdx])}
            className="truncate text-left text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            “{EXAMPLES[exampleIdx]}”
          </button>
        </p>

        <p id={`${inputId}-status`} role="status" aria-live="polite" className={cn("mt-1 min-h-[1.125rem] text-[0.75rem]", voice.error || notice ? "text-danger" : "text-muted")}>
          {listening
            ? t("discover.hero.listening", "Sun rahe hain… bolna band karein to search khud chalegi.")
            : transcribing
              ? t("discover.hero.transcribing", "Aapki baat samajh rahe hain…")
              : busy
                ? t("discover.hero.thinking", "AI aapki baat filters me badal raha hai…")
                : voice.error ?? notice ?? (locked ? t("discover.hero.lockedHint", "AI search paid plan me khulti hai — filters aap abhi bhi dekh sakte hain.") : "")}
        </p>
      </form>
    </section>
  );
}
