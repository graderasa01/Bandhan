"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Check, Keyboard, ListChecks, Mic, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { LANGUAGE_META, type SpokenLanguage } from "@/lib/contracts/interview";
import type { SpeechOutputProvider } from "@/lib/speech/SpeechOutputProvider";
import type { SpeechProvider } from "@/lib/speech/SpeechProvider";
import { createSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import { createSpeechProvider } from "@/lib/speech/webSpeech";
import { classifyConfirm, classifyOffer, classifyReview } from "@/lib/speech/voiceIntent";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Where the spoken interview stops — and, now, how it *leaves*.
 *
 * Three ways a voice session ends, one card, because the user's question is the
 * same in all three — *what now?* — and each one has to answer it with real
 * choices rather than a dead microphone:
 *
 *   `ready`   — the eight minimum fields are done. This is the important one.
 *   `cap`     — this sitting has used its turn budget. Short sessions are a
 *               cost control and a kindness; typing carries on from here.
 *   `blocked` — the server refused on cost grounds (daily cap, or an admin
 *               switched voice off). Same offer, different reason.
 *
 * ## `ready` is a short spoken dialogue, not a spoken dead end
 *
 * Until 2026-09-11 this card *spoke* "aur details bharein ya aage badhein?"
 * and then waited for a tap. The person it had just spent two minutes
 * talking to answered out loud — "thik hai, next chalo" — and nothing
 * happened: the mic was closed, the page stayed put, and the assistant that
 * had asked the question was not listening for the answer. That is the
 * report this rewrite answers.
 *
 * So the card runs a tiny state machine over the mic:
 *
 *   offer    — "Bas 2 pasand aur bata dijiye…batayein, ya skip karein?"
 *              yes → the preference round (the parent asks the two
 *              questions); skip → confirm.
 *   review   — the round produced values: "Umar 25–29, sheher Jaipur —
 *              sahi?"  yes → the parent confirms and saves them; no → the
 *              parent clears them and asks again.
 *   confirm  — "Rishte dekhein — chalein?"  yes → stop everything and go;
 *              no → stay, buttons remain.
 *   idle     — after two unclear answers, or when the mic is unavailable:
 *              the buttons are the whole card. Voice never traps anyone.
 *
 * Only yes / no / skip are ever *understood* here, by keyword tables in
 * `voiceIntent.ts` — the card never selects or assumes a preference. The two
 * preference answers themselves go through the normal interview turn; what
 * the extractor read is shown and read back *before* it is saved, and
 * "save ho gayi" is only ever said after the spoken yes.
 *
 * Every spoken line is fixed in code, not generated: it is a status
 * announcement, and a model that improvises here would eventually improvise a
 * claim about the profile that isn't true.
 */
export type VoiceStopMode = "ready" | "cap" | "blocked";

/**
 * Where the optional "2 pasand" step stands:
 *
 *   available — the offer has not been made; at least one of the two is open.
 *   retry     — the round was spoken but nothing preference-shaped came back;
 *               the offer is made once more, saying so.
 *   review    — values came back and wait for a spoken / tapped yes.
 *   answered  — confirmed and saved. `confirmed` says which, and how many.
 *   missed    — two rounds, nothing usable; the person can add them later.
 *   skipped   — declined.
 *   none      — nothing to offer (both already filled elsewhere).
 */
export type PreferenceOffer = "available" | "retry" | "review" | "answered" | "missed" | "skipped" | "none";

/** One preference the round produced, or one that was confirmed — key, catalog label, the stored value. */
export interface PreferenceLine {
  key: string;
  label: string;
  value: string;
}

type Step = "offer" | "review" | "confirm" | "idle";

/** How many unclear answers before the card stops asking and shows only buttons. */
const MAX_UNCLEAR = 2;

function initialStep(mode: VoiceStopMode, offer: PreferenceOffer): Step {
  if (mode !== "ready") return "idle";
  if (offer === "available" || offer === "retry") return "offer";
  if (offer === "review") return "review";
  return "confirm";
}

export default function VoiceStopCard({
  mode,
  alreadyLive = false,
  language,
  preferenceOffer = "none",
  preferenceFields = [],
  preferenceReview = [],
  confirmedPreferences = [],
  onAskPreferences,
  onSkipPreferences,
  onConfirmPreferences,
  onRedoPreferences,
  onAddMore,
  onContinue,
  onType,
  onSaveForNow,
}: {
  mode: VoiceStopMode;
  /**
   * The autosave's own readiness check may already have activated the profile
   * by the time this card renders — the two run milliseconds apart. When it
   * has, this says so rather than offering to do something already done.
   */
  alreadyLive?: boolean;
  language: SpokenLanguage;
  preferenceOffer?: PreferenceOffer;
  /** The preference fields still open — what the offer names. One or two. */
  preferenceFields?: Array<{ key: string; label: string }>;
  /** What the round produced, awaiting confirmation. Shown and read back verbatim. */
  preferenceReview?: PreferenceLine[];
  /** What was confirmed and saved — the exact count and names "save ho gayi" may claim. */
  confirmedPreferences?: PreferenceLine[];
  onAskPreferences?: () => void;
  onSkipPreferences?: () => void;
  /** The spoken or tapped "sahi hai" over `preferenceReview` — the only path to a save. */
  onConfirmPreferences?: () => void;
  /** "Nahi" over `preferenceReview` — the values are dropped and the round asked again. */
  onRedoPreferences?: () => void;
  onAddMore: () => void;
  /** `via` says whether a spoken "haan" or a tap decided it — the caller picks the landing. */
  onContinue: (via: "voice" | "tap") => void;
  onType: () => void;
  onSaveForNow: () => void;
}) {
  const t = useT();
  const outputRef = useRef<SpeechOutputProvider | null>(null);
  const inputRef = useRef<SpeechProvider | null>(null);
  const finalRef = useRef("");
  const unclearRef = useRef(0);
  const doneRef = useRef(false);
  const [step, setStep] = useState<Step>(() => initialStep(mode, preferenceOffer));
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [micAvailable, setMicAvailable] = useState(true);

  const locale = LANGUAGE_META[language].locale;

  /* ------------------------------ copy ------------------------------- */

  // Spoken names for the two preference fields — short, the way a person
  // says them, not the catalog's "Partner's Age".
  const spokenName = (key: string, label: string) =>
    key === "partnerAgeRange"
      ? t("profile.voiceStop.spokenAge", "partner ki umar")
      : key === "partnerCityPreference"
        ? t("profile.voiceStop.spokenCity", "sheher")
        : label;
  const joinAnd = (parts: string[]) =>
    parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${t("profile.voiceStop.and", "aur")} ${parts[parts.length - 1]}`;

  // "…partner ki umar aur sheher…" — or just "…sheher…" when the age range
  // was filled some other way. The count in the sentence is the real count.
  const offerNames = joinAnd(preferenceFields.map((f) => spokenName(f.key, f.label)));
  const offerCount = preferenceFields.length;
  const offerLine =
    preferenceOffer === "retry"
      ? `${t("profile.voiceStop.spokenOfferRetryMissed", "Pasand samajh nahi aayi. Ek baar phir bata dijiye")} — ${offerNames} — ${t("profile.voiceStop.spokenOfferTail", "ya skip karein?")}`
      : `${t("profile.voiceStop.spokenReadyLead", "Zaroori profile ready hai.")} ${
          offerCount === 1
            ? t("profile.voiceStop.spokenOfferOne", "Bas 1 pasand aur bata dijiye")
            : t("profile.voiceStop.spokenOfferTwo", "Bas 2 pasand aur bata dijiye")
        } — ${offerNames} — ${t("profile.voiceStop.spokenOfferWhy", "taaki pehle rishte zyada relevant hon. Batayein, ya skip karein?")}`;
  const offerRetryLine = t("profile.voiceStop.spokenOfferRetry", "Batayein, ya skip karein?");

  // "Umar 25–29, sheher Jaipur — sahi?" — exactly the values on screen.
  const reviewValues = preferenceReview
    .map((line) => `${spokenName(line.key, line.label)} ${line.value}`)
    .join(", ");
  const reviewLine = `${reviewValues} — ${t("profile.voiceStop.spokenReviewTail", "sahi?")}`;
  const reviewRetryLine = `${reviewValues} — ${t("profile.voiceStop.spokenReviewRetry", "sahi hai, ya nahi?")}`;

  // "save ho gayi" names exactly what was confirmed: "Aapki 2 pasand save ho
  // gayi — umar 25–29, sheher Jaipur." Never a count that was not saved.
  const savedNames = confirmedPreferences.map((line) => `${spokenName(line.key, line.label)} ${line.value}`).join(", ");
  const savedLead =
    confirmedPreferences.length === 1
      ? t("profile.voiceStop.spokenSavedOne", "Aapki 1 pasand save ho gayi")
      : t("profile.voiceStop.spokenSavedTwo", "Aapki 2 pasand save ho gayi");
  const confirmLine =
    preferenceOffer === "answered" && confirmedPreferences.length > 0
      ? `${savedLead} — ${savedNames}. ${t("profile.voiceStop.spokenConfirmTail", "Rishte dekhein — chalein?")}`
      : preferenceOffer === "missed"
        ? t("profile.voiceStop.spokenConfirmMissed", "Pasand samajh nahi aayi — aap baad me bhi bata sakte hain. Rishte dekhein — chalein?")
        : preferenceOffer === "skipped"
          ? t("profile.voiceStop.spokenConfirmSkipped", "Theek hai, baad me bhi bata sakte hain. Rishte dekhein — chalein?")
          : t("profile.voiceStop.spokenConfirmReady", "Zaroori profile ready hai. Rishte dekhein — chalein?");
  const confirmRetryLine = t("profile.voiceStop.spokenConfirmRetry", "Chalein?");

  /* ------------------------------ audio ------------------------------ */

  /** Stop every sound and every mic — the card is leaving, or giving up on voice. */
  const silence = useCallback(() => {
    outputRef.current?.cancel();
    inputRef.current?.stop();
    setListening(false);
  }, []);

  const listenOnce = useCallback(
    (onHeard: (text: string) => void) => {
      const input = inputRef.current;
      if (!input || !input.isAvailable() || doneRef.current) {
        setMicAvailable(false);
        setStep("idle");
        return;
      }
      finalRef.current = "";
      setHeard("");
      setListening(true);
      void input.start({
        locale,
        autoStop: true,
        onResult: (r) => {
          if (r.isFinal) finalRef.current = `${finalRef.current} ${r.transcript}`.trim();
          setHeard(r.isFinal ? finalRef.current : `${finalRef.current} ${r.transcript}`.trim());
        },
        onError: () => {
          setListening(false);
          setMicAvailable(false);
          setStep("idle");
        },
        onEnd: () => {
          setListening(false);
          if (doneRef.current) return;
          onHeard(finalRef.current.trim());
        },
      });
    },
    [locale],
  );

  /** Speak a line, then open the mic for the answer. */
  const ask = useCallback(
    (line: string, onHeard: (text: string) => void) => {
      const output = outputRef.current;
      if (!output || !output.isAvailable()) {
        listenOnce(onHeard);
        return;
      }
      output.speak(line, {
        locale,
        onEnd: () => listenOnce(onHeard),
        onError: () => listenOnce(onHeard),
      });
    },
    [listenOnce, locale],
  );

  useEffect(() => {
    outputRef.current = createSpeechOutputProvider();
    inputRef.current = createSpeechProvider();
    if (!inputRef.current.isAvailable()) setMicAvailable(false);
    return () => {
      doneRef.current = true;
      outputRef.current?.cancel();
      inputRef.current?.stop();
    };
  }, []);

  /* --------------------------- the machine --------------------------- */

  const acceptReview = useCallback(() => {
    haptic("success");
    silence();
    onConfirmPreferences?.();
  }, [onConfirmPreferences, silence]);

  const redoReview = useCallback(() => {
    haptic("tap");
    silence();
    onRedoPreferences?.();
  }, [onRedoPreferences, silence]);

  const skipOffer = useCallback(() => {
    haptic("tap");
    silence();
    onSkipPreferences?.();
    unclearRef.current = 0;
    setStep("confirm");
  }, [onSkipPreferences, silence]);

  // A cap or a refusal is a thing to read, not to be told out loud by the
  // assistant that just stopped talking to you. Only `ready` speaks — and
  // now listens.
  const runStep = useCallback(
    (current: Step, retry: boolean) => {
      if (mode !== "ready" || doneRef.current) return;
      if (current === "offer") {
        ask(retry ? offerRetryLine : offerLine, (text) => {
          const intent = classifyOffer(text);
          if (intent === "yes") {
            haptic("tap");
            silence();
            onAskPreferences?.();
            return;
          }
          if (intent === "no") {
            skipOffer();
            return;
          }
          unclearRef.current += 1;
          if (unclearRef.current >= MAX_UNCLEAR) setStep("idle");
          else runStep("offer", true);
        });
        return;
      }
      if (current === "review") {
        ask(retry ? reviewRetryLine : reviewLine, (text) => {
          const intent = classifyReview(text);
          if (intent === "yes") {
            acceptReview();
            return;
          }
          if (intent === "no") {
            redoReview();
            return;
          }
          if (intent === "skip") {
            skipOffer();
            return;
          }
          unclearRef.current += 1;
          if (unclearRef.current >= MAX_UNCLEAR) setStep("idle");
          else runStep("review", true);
        });
        return;
      }
      if (current === "confirm") {
        ask(retry ? confirmRetryLine : confirmLine, (text) => {
          const intent = classifyConfirm(text);
          if (intent === "yes") {
            // The whole point: a spoken "haan" closes the mic, stops the
            // voice, and opens the next page — nobody has to find a button.
            doneRef.current = true;
            haptic("success");
            silence();
            onContinue("voice");
            return;
          }
          if (intent === "no") {
            haptic("tap");
            setStep("idle");
            return;
          }
          unclearRef.current += 1;
          if (unclearRef.current >= MAX_UNCLEAR) setStep("idle");
          else runStep("confirm", true);
        });
      }
    },
    [
      acceptReview,
      ask,
      confirmLine,
      confirmRetryLine,
      mode,
      offerLine,
      offerRetryLine,
      onAskPreferences,
      onContinue,
      redoReview,
      reviewLine,
      reviewRetryLine,
      silence,
      skipOffer,
    ],
  );

  // Speak (and listen) once per step. `runStep` closes over the latest
  // handlers; the step itself is the only trigger, so a re-render never
  // re-asks the same question over the top of the mic.
  useEffect(() => {
    if (step === "idle") return;
    unclearRef.current = 0;
    runStep(step, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // The parent moved the preference step on (answered / missed / skipped)
  // while this card was still on the offer or the review — follow it to the
  // confirmation. `review` arriving over an offer means values landed.
  useEffect(() => {
    if (mode !== "ready") return;
    if ((preferenceOffer === "answered" || preferenceOffer === "missed" || preferenceOffer === "skipped") && (step === "offer" || step === "review")) {
      silence();
      setStep("confirm");
    } else if (preferenceOffer === "review" && step === "offer") {
      silence();
      setStep("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceOffer]);

  const continueByTap = () => {
    doneRef.current = true;
    silence();
    onContinue("tap");
  };

  /* ------------------------------ render ----------------------------- */

  if (mode === "ready") {
    const offering = step === "offer" || (step === "idle" && (preferenceOffer === "available" || preferenceOffer === "retry"));
    const reviewing = preferenceOffer === "review" && (step === "review" || step === "idle");
    return (
      <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <BadgeCheck className="size-10 text-trust" />
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold leading-tight text-ink">
            {reviewing
              ? t("profile.voiceStop.reviewTitle", "Ye sahi hai?")
              : alreadyLive
                ? t("profile.voiceStop.liveTitle", "Aapki profile live hai")
                : t("profile.voiceStop.readyTitle", "Zaroori profile ready hai")}
          </h2>
          <p className="text-[0.875rem] leading-relaxed text-muted">
            {reviewing
              ? t("profile.voiceStop.reviewBody", "Jo suna, wo neeche hai. Sahi ho to haan boliye ya tap kijiye — tabhi save hoga.")
              : offering
                ? preferenceOffer === "retry"
                  ? t("profile.voiceStop.retryBody", "Pasand samajh nahi aayi — ek baar phir bata dijiye, ya skip karein.")
                  : offerCount === 1
                    ? `${t("profile.voiceStop.offerBodyOne", "Bas 1 pasand aur")} — ${offerNames}. ${t("profile.voiceStop.offerBodyWhy", "Ye batane se aapke rishte zyada relevant honge. Chahein to skip karein.")}`
                    : `${t("profile.voiceStop.offerBodyTwo", "Bas 2 pasand aur")} — ${offerNames}. ${t("profile.voiceStop.offerBodyWhy", "Ye batane se aapke rishte zyada relevant honge. Chahein to skip karein.")}`
                : preferenceOffer === "answered" && confirmedPreferences.length > 0
                  ? `${
                      confirmedPreferences.length === 1
                        ? t("profile.voiceStop.answeredBodyOne", "1 pasand save ho gayi")
                        : t("profile.voiceStop.answeredBodyTwo", "2 pasand save ho gayi")
                    } — ${confirmedPreferences.map((line) => `${line.label}: ${line.value}`).join(" · ")}. ${t("profile.voiceStop.answeredBodyTail", "Ab aage badhein?")}`
                  : preferenceOffer === "missed"
                    ? t("profile.voiceStop.missedBody", "Pasand samajh nahi aayi — baad me profile se bata sakte hain. Ab aage badhein?")
                    : t("profile.voiceStop.readyBody", "Aage badhein, ya kuch aur details bharein.")}
          </p>
        </div>

        {/* The values the extractor read, exactly as they will be stored —
            on screen while they are being read out, so eyes and ears agree. */}
        {reviewing && preferenceReview.length > 0 && (
          <ul className="w-full space-y-1.5 rounded-xl border border-line bg-bg-subtle px-3 py-2 text-left text-sm">
            {preferenceReview.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-3">
                <span className="text-muted">{line.label}</span>
                <span className="font-semibold text-ink">{line.value}</span>
              </li>
            ))}
          </ul>
        )}

        {/* What the mic is doing — the person just asked a question out loud
            deserves to see that the answer is being heard. */}
        <p className="flex min-h-5 items-center gap-1.5 text-[0.75rem] text-muted" aria-live="polite">
          {listening ? (
            <>
              <Mic className="size-3.5 animate-pulse text-gold-700" aria-hidden />
              {heard
                ? `${t("profile.voiceStop.heardPrefix", "Suna")}: ${heard}`
                : reviewing
                  ? t("profile.voiceStop.listeningReview", "Boliye — sahi hai, ya nahi")
                  : step === "confirm"
                    ? t("profile.voiceStop.listeningConfirm", "Boliye — haan ya nahi")
                    : t("profile.voiceStop.listening", "Boliye — haan ya skip")}
            </>
          ) : !micAvailable ? (
            t("profile.voiceStop.tapInstead", "Neeche tap karke chunein.")
          ) : null}
        </p>

        <div className="flex w-full flex-col gap-2">
          {reviewing ? (
            <>
              <Button variant="accent" size="md" fullWidth onClick={acceptReview}>
                <Check className="size-4" />
                {t("profile.voiceStop.reviewYes", "Yes, Correct")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="md" fullWidth onClick={redoReview}>
                  <RotateCcw className="size-4" />
                  {t("profile.voiceStop.reviewRedo", "Say Again")}
                </Button>
                <Button variant="secondary" size="md" fullWidth onClick={skipOffer}>
                  {t("profile.voiceStop.skipPreferences", "Skip")}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          ) : offering ? (
            <>
              <Button
                variant="accent"
                size="md"
                fullWidth
                onClick={() => {
                  silence();
                  haptic("tap");
                  onAskPreferences?.();
                }}
              >
                <SlidersHorizontal className="size-4" />
                {offerCount === 1
                  ? t("profile.voiceStop.tellPreferenceOne", "Tell 1 Preference")
                  : t("profile.voiceStop.tellPreferences", "Tell 2 Preferences")}
              </Button>
              <Button variant="secondary" size="md" fullWidth onClick={skipOffer}>
                {t("profile.voiceStop.skipPreferences", "Skip")}
                <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="accent" size="md" fullWidth onClick={continueByTap}>
                {alreadyLive
                  ? t("profile.voiceStop.continue", "Continue")
                  : t("profile.voiceStop.goLive", "Go Live & Continue")}
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  silence();
                  onAddMore();
                }}
              >
                {t("profile.voiceStop.addMore", "Add 2-3 More Details")}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <Keyboard className="size-9 text-muted" />
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold leading-tight text-ink">
          {mode === "cap"
            ? t("profile.voiceStop.capTitle", "Itni baat ho gayi")
            : t("profile.voiceStop.blockedTitle", "Voice abhi aage nahi ja paayegi")}
        </h2>
        <p className="text-[0.875rem] leading-relaxed text-muted">
          {mode === "cap"
            ? t("profile.voiceStop.capBody", "Baaki tap karke bhar dijiye — do minute ka kaam hai.")
            : t("profile.voiceStop.blockedBody", "Tap karke bhar sakte hain, jo bhara hai wo safe hai.")}
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <Button variant="accent" size="md" fullWidth onClick={onType}>
          <ListChecks className="size-4" />
          {t("profile.voiceStop.typeInstead", "Fill by Tapping")}
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onSaveForNow}>
          <Save className="size-4" />
          {t("profile.voiceStop.saveForNow", "Save for Now")}
        </Button>
      </div>
    </div>
  );
}
