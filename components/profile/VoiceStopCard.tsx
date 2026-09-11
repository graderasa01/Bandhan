"use client";

import { useEffect, useRef } from "react";
import { BadgeCheck, Keyboard, ListChecks, Save } from "lucide-react";
import { LANGUAGE_META, type SpokenLanguage } from "@/lib/contracts/interview";
import type { SpeechOutputProvider } from "@/lib/speech/SpeechOutputProvider";
import { createSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Where the spoken interview stops.
 *
 * Three ways a voice session ends, one card, because the user's question is the
 * same in all three — *what now?* — and each one has to answer it with real
 * choices rather than a dead microphone:
 *
 *   `ready`   — the eight minimum fields are done. This is the important one.
 *               The assistant says one line and nothing else, and the user
 *               picks: a few more details now, or on into the app. It does
 *               **not** roll on into optional questions by itself; that was
 *               the old behaviour and it is exactly what made "profile ready"
 *               invisible.
 *   `cap`     — this sitting has used its turn budget. Short sessions are a
 *               cost control and a kindness; typing carries on from here.
 *   `blocked` — the server refused on cost grounds (daily cap, or an admin
 *               switched voice off). Same offer, different reason.
 *
 * The spoken line for `ready` is fixed in code, not generated: it is a status
 * announcement, and a model that improvises here would eventually improvise a
 * claim about the profile that isn't true.
 */
export type VoiceStopMode = "ready" | "cap" | "blocked";

export default function VoiceStopCard({
  mode,
  alreadyLive = false,
  language,
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
  onAddMore: () => void;
  onContinue: () => void;
  onType: () => void;
  onSaveForNow: () => void;
}) {
  const t = useT();
  const outputRef = useRef<SpeechOutputProvider | null>(null);

  const spokenLine = t(
    "profile.voiceStop.spokenReady",
    "Zaroori profile ready hai. Aap aur details abhi bharna chahenge ya aage badhein?",
  );

  useEffect(() => {
    outputRef.current = createSpeechOutputProvider();
    return () => outputRef.current?.cancel();
  }, []);

  // Only `ready` is spoken. A cap or a refusal is a thing to read, not to be
  // told out loud by the assistant that just stopped talking to you.
  useEffect(() => {
    if (mode !== "ready") return;
    outputRef.current?.speak(spokenLine, { locale: LANGUAGE_META[language].locale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (mode === "ready") {
    return (
      <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <BadgeCheck className="size-10 text-trust" />
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold leading-tight text-ink">
            {alreadyLive
              ? t("profile.voiceStop.liveTitle", "Aapki profile live hai")
              : t("profile.voiceStop.readyTitle", "Zaroori profile ready hai")}
          </h2>
          <p className="text-[0.875rem] leading-relaxed text-muted">
            {t("profile.voiceStop.readyBody", "Aur details abhi bharein, ya aage badhein.")}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button variant="accent" size="md" fullWidth onClick={onContinue}>
            {alreadyLive
              ? t("profile.voiceStop.continue", "Continue")
              : t("profile.voiceStop.goLive", "Go Live & Continue")}
          </Button>
          <Button variant="secondary" size="md" fullWidth onClick={onAddMore}>
            {t("profile.voiceStop.addMore", "Add 2-3 More Details")}
          </Button>
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
