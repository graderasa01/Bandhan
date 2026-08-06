"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleAlert, FileUp, Languages, ListChecks, SkipForward, Sparkles, Volume2 } from "lucide-react";
import { LANGUAGE_META, type ActionLabels, type SpokenLanguage } from "@/lib/contracts/interview";
import type { ProfileFieldDef } from "@/lib/profile/fields";
import type { ProfileValues } from "@/lib/profile/stages";
import type { FieldMeta } from "@/lib/profile/profileState";
import type { LocalGuess } from "@/lib/profile/localDetect";
import { cn } from "@/lib/utils";
import type { SpeechOutputProvider } from "@/lib/speech/SpeechOutputProvider";
import { createSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import InfoTip from "@/components/ui/InfoTip";
import LanguagePicker, { LanguageSwitchOffer } from "@/components/profile/LanguagePicker";
import QuestionRail from "@/components/profile/QuestionRail";
import AnswerInput, { type AnswerInputHandle } from "@/components/profile/AnswerInput";

/**
 * A small pill, not a full-width underlined text link — three or four of
 * those wrap across several lines on a page and just as easily on a card,
 * but a card has no room to spare for wrapped link rows the way a page does.
 */
function MiniAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "muted",
}: {
  icon: typeof FileUp;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "muted" | "accent";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 touch-target items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors active:scale-95",
        tone === "accent"
          ? "border-primary/30 bg-primary/10 text-primary-text hover:bg-primary/15"
          : "border-line-strong bg-surface/80 text-muted hover:border-gold-500 hover:text-ink",
        disabled && "opacity-50",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

/** One field asked this turn, already localized — see `askedQuestion` on the
 *  old singular contract this replaces. */
export type BatchQuestionItem = {
  field: ProfileFieldDef;
  askedQuestion: string;
  bilingualQuestion: string | null;
  optionLabels?: Record<string, string>;
};

export interface TargetedVoiceCardProps {
  /** Empty once every field in the queue has an answer. One item is the
   *  original one-at-a-time card; two or three is the batched voice turn. */
  items: BatchQuestionItem[];
  /**
   * One flowing sentence covering every field in `items` — "Apna Gender,
   * Date of Birth aur Height bata dijiye?" — used instead of stitching each
   * item's own question together when there's more than one and a natural
   * combined phrasing is available (Hindi/Hinglish only for now; other
   * languages still fall back to the per-field questions joined end to end).
   */
  groupQuestion: string | null;
  railFields: ProfileFieldDef[];
  draftValues: ProfileValues;
  draftMeta: Record<string, FieldMeta>;
  localGuesses: Partial<Record<string, LocalGuess>>;
  landed: string[];
  onEdit: (key: string) => void;
  busy: boolean;
  error: string | null;
  /** An AI follow-up about (one of) this batch's fields — replaces the whole
   *  question list with one focused line, spoken in its place, while active. */
  clarification: string | null;
  awaitingTranslation: boolean;
  misses: Record<string, number>;
  language: SpokenLanguage;
  onLanguageChange: (lang: SpokenLanguage) => void;
  langOffer: SpokenLanguage | null;
  onAcceptLangOffer: () => void;
  onDismissLangOffer: () => void;
  actions: ActionLabels;
  onSubmit: (text: string) => void;
  onInterimChange: (text: string) => void;
  onUploadBiodata: () => void;
  /** Also what a forward swipe does — this is the same `goNext` the deck
   *  itself uses, so "Fill the Form Instead" and swiping land on the exact
   *  same place: the first manual field card. */
  onFillForm: () => void;
  onLetAiHelp?: () => void;
  onSkip?: () => void;
}

/**
 * The voice-turn card, restyled to live inside a single `ManualCard` — the
 * deck's leading card (2026-08-03), swiped past into the manual field cards
 * behind it.
 *
 * Two or three questions get asked in one breath by default (2026-08-04) —
 * one TTS turn speaks every `items` question back to back, one recording
 * answers all of them, and the extraction endpoint picks up whichever of
 * them it can even beyond what was actually asked. `PacePreferenceCard`
 * (asked once, before this ever renders) is what can send `items` down to
 * length 1 instead — this then renders exactly as the original one-at-a-time
 * card always did: same heading, same inline option chips, same per-field
 * "AI Likhe" writer.
 */
export default function TargetedVoiceCard({
  items,
  groupQuestion,
  railFields,
  draftValues,
  draftMeta,
  localGuesses,
  landed,
  onEdit,
  busy,
  error,
  clarification,
  awaitingTranslation,
  misses,
  language,
  onLanguageChange,
  langOffer,
  onAcceptLangOffer,
  onDismissLangOffer,
  actions,
  onSubmit,
  onInterimChange,
  onUploadBiodata,
  onFillForm,
  onLetAiHelp,
  onSkip,
}: TargetedVoiceCardProps) {
  const outputRef = useRef<SpeechOutputProvider | null>(null);
  useEffect(() => {
    outputRef.current = createSpeechOutputProvider();
    return () => outputRef.current?.cancel();
  }, []);
  const answerInputRef = useRef<AnswerInputHandle | null>(null);

  const [speaking, setSpeaking] = useState(false);

  const single = items.length === 1 ? items[0] : null;
  const fallbackJoined = items.map((i) => i.askedQuestion).join("  ");
  const groupText = single ? single.askedQuestion : (groupQuestion ?? fallbackJoined);
  const spokenText = clarification ?? groupText;

  // A genuine same-question retry — a turn landed nothing for one of the
  // fields currently on screen, so it needs asking again out loud. Scoped to
  // `items`' own fields so a miss recorded against a batch fast pace has
  // already moved past never re-triggers this one.
  const missSignal = items.reduce((sum, i) => sum + (misses[i.field.key] ?? 0), 0);

  // Speaks whatever `spokenText` currently is once it settles — a fresh batch
  // of questions and an AI clarification both just flow through that one
  // string, so this one effect covers both the same way the single-field
  // card always did. Once the AI is done asking, the mic opens on its own —
  // `startListening` is a no-op if the user has already switched to typing
  // or started answering some other way, so this never fights a real tap.
  //
  // `busy` used to sit in the dependency array so a genuine miss (same
  // `spokenText`, nothing understood) would re-speak the question once that
  // turn settled. But in fast-pace mode `busy` also flips back to false long
  // after the *next* batch is already on screen and already spoken — that
  // re-fired this effect and spoke the next question a second time,
  // stepping on whatever the user was already doing (usually the mic
  // already listening for it, which is the "mic stops responding" bug this
  // replaces). `missSignal` is the same "a turn about this batch just
  // settled" signal, but scoped so it only fires for an actual miss.
  useEffect(() => {
    if (items.length === 0 || awaitingTranslation || !spokenText) return;
    outputRef.current?.speak(spokenText, {
      locale: LANGUAGE_META[language].locale,
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        answerInputRef.current?.startListening();
      },
      onError: () => setSpeaking(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenText, awaitingTranslation, missSignal]);

  if (items.length === 0) {
    return (
      <div className="m-auto flex w-full flex-col items-center gap-3 text-center">
        <BadgeCheck className="size-9 text-trust" />
        <p className="text-lg font-semibold text-ink">Sab sawaal ho gaye</p>
        <p className="text-[0.875rem] leading-relaxed text-muted">
          Jo baaki hai wo aap kabhi bhi bhar sakte hain — aage swipe karke form dekhein.
        </p>
        <MiniAction icon={ListChecks} label="View Form" onClick={onFillForm} tone="accent" />
      </div>
    );
  }

  const anyOptional = items.some((i) => !i.field.required);

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {langOffer && (
        <LanguageSwitchOffer detected={langOffer} onAccept={onAcceptLangOffer} onDismiss={onDismissLangOffer} />
      )}

      <QuestionRail
        compact
        fields={railFields}
        values={draftValues}
        meta={draftMeta}
        currentKey={items.map((i) => i.field.key)}
        localGuesses={localGuesses}
        justLandedKeys={landed}
        onEdit={onEdit}
      />

      <div className="flex items-center justify-end gap-2">
        <LanguagePicker value={language} onChange={onLanguageChange} />
      </div>

      <div className="space-y-1.5 text-center">
        {awaitingTranslation ? (
          <div className="space-y-1.5 py-1" aria-busy="true" aria-live="polite">
            <span className="skeleton mx-auto block h-5 w-3/4 rounded-md" />
            <span className="skeleton mx-auto block h-5 w-1/2 rounded-md" />
            <span className="sr-only">Sawaal taiyaar ho raha hai</span>
          </div>
        ) : clarification ? (
          <h2 className="text-balance text-lg font-semibold leading-tight text-ink sm:text-xl">
            {clarification}
            {speaking && (
              <Volume2 className="ml-1 inline-block size-4 shrink-0 animate-pulse align-middle text-primary-text" aria-hidden />
            )}
          </h2>
        ) : single ? (
          <>
            <h2 className="text-balance text-lg font-semibold leading-tight text-ink sm:text-xl">
              {single.askedQuestion}
              {speaking && (
                <Volume2 className="ml-1 inline-block size-4 shrink-0 animate-pulse align-middle text-primary-text" aria-hidden />
              )}
              {single.field.whyNeeded && (
                <InfoTip text={single.field.whyNeeded} className="ml-1 align-middle" />
              )}
            </h2>
            {single.bilingualQuestion && (
              <p lang="hi-Latn" className="flex items-center justify-center gap-1 text-[0.75rem] text-subtle">
                <Languages className="size-3 shrink-0" aria-hidden />
                {single.bilingualQuestion}
              </p>
            )}
            {misses[single.field.key] === 1 && (
              <p className="text-[0.75rem] text-warn">Pichhli baar samajh nahi aaya — ek baar aur bata dijiye.</p>
            )}
            {single.field.required && misses[single.field.key] >= 2 && (
              <p className="text-[0.75rem] text-warn">Ye zaroori hai, isliye skip nahi hoga — neeche type karke bata dijiye.</p>
            )}
          </>
        ) : (
          // Two or three fields, asked as one flowing sentence rather than
          // their separate "X kya hai?" questions stitched end to end — the
          // rail above already shows which fields these are (gold "current"
          // chips), so the heading doesn't need to enumerate them again.
          <h2 className="text-balance text-lg font-semibold leading-tight text-ink sm:text-xl">
            {groupText}
            {speaking && (
              <Volume2 className="ml-1 inline-block size-4 shrink-0 animate-pulse align-middle text-primary-text" aria-hidden />
            )}
          </h2>
        )}
        {!clarification && !single && items.some((i) => misses[i.field.key] === 1) && (
          <p className="text-[0.75rem] text-warn">Kuch samajh nahi aaya — ek baar phir bata dijiye.</p>
        )}
      </div>

      {!clarification && single?.field.options && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {single.field.options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => onSubmit(o)}
              className={cn(
                "min-h-9 touch-target rounded-full border border-line-strong bg-surface px-3.5",
                "text-[0.8125rem] font-medium text-ink transition-all active:scale-95",
                "hover:border-gold-500 hover:bg-gold-50 dark:hover:bg-gold-900/30",
                busy && "opacity-50",
              )}
            >
              {single.optionLabels?.[o] ?? o}
            </button>
          ))}
        </div>
      )}

      {/* Stops the swipe gesture from claiming a drag that starts on the
          typed-answer textarea — same guard CompactField uses for its own
          text inputs inside this same draggable card. */}
      <div className="w-full" onPointerDownCapture={(e) => e.stopPropagation()}>
        <AnswerInput
          ref={answerInputRef}
          compact
          hint={spokenText}
          busy={busy}
          onSubmit={onSubmit}
          language={language}
          actions={actions}
          onInterimChange={onInterimChange}
          onListenStart={() => {
            // Sarvam's audio.pause() doesn't fire the `ended` event the way
            // cancelling speechSynthesis does, so the speaking indicator
            // needs telling directly rather than waiting on onEnd here.
            outputRef.current?.cancel();
            setSpeaking(false);
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[0.75rem] leading-snug text-danger"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-1">
        <MiniAction icon={FileUp} label="Biodata" onClick={onUploadBiodata} disabled={busy} />
        <MiniAction icon={ListChecks} label="Form" onClick={onFillForm} disabled={busy} />
        {onLetAiHelp && <MiniAction icon={Sparkles} label="AI Likhe" onClick={onLetAiHelp} disabled={busy} tone="accent" />}
        {onSkip ? (
          <MiniAction icon={SkipForward} label={actions.skip} onClick={onSkip} disabled={busy} />
        ) : (
          !anyOptional && (
            <span className="inline-flex min-h-8 items-center text-[0.6875rem] font-medium text-subtle">
              Zaroori — bharna hoga
            </span>
          )
        )}
      </div>
    </div>
  );
}
