"use client";

import { useEffect, useRef } from "react";
import { Mic, Rows3, SquareStack } from "lucide-react";
import { LANGUAGE_META, type ActionLabels, type SpokenLanguage } from "@/lib/contracts/interview";
import { detectPacePreference } from "@/lib/profile/pacePreference";
import { createSpeechOutputProvider } from "@/lib/speech/webSpeechOutput";
import type { SpeechOutputProvider } from "@/lib/speech/SpeechOutputProvider";
import { haptic } from "@/lib/motion";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import { ChoiceCard } from "@/components/ui/Controls";
import AnswerInput from "@/components/profile/AnswerInput";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Asked once, before the first batch of voice questions — 2026-08-04, Devesh
 * asked for the pace itself to be a spoken question rather than a silent
 * default: the AI should ask how the user wants to be asked, and go by
 * whatever they say, not just default to 3 and hide a text link for the
 * other mode. Tapping a card answers instantly; the mic/type box underneath
 * exists for anyone who'd rather just say it ("ek saath kar do jaldi").
 *
 * One-shot: `InterviewMode` only renders this while `batchSize` is still
 * `null`, and every path in — resuming a draft, finishing a biodata upload,
 * the first open-talk turn, "Add More Details" from the live screen — goes
 * through that same gate, so this can never appear twice in one session.
 */
export default function PacePreferenceCard({
  language,
  actions,
  onChoose,
}: {
  language: SpokenLanguage;
  actions: ActionLabels;
  onChoose: (batchSize: 1 | 3) => void;
}) {
  const t = useT();
  const QUESTION = t(
    "profile.pacePreference.question",
    "Sawaal ek-ek karke poochhun, ya kai sawaal ek saath bata doon?",
  );
  const outputRef = useRef<SpeechOutputProvider | null>(null);

  useEffect(() => {
    const provider = createSpeechOutputProvider();
    outputRef.current = provider;
    provider.speak(QUESTION, { locale: LANGUAGE_META[language].locale });
    return () => provider.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(size: 1 | 3) {
    haptic("tap");
    outputRef.current?.cancel();
    onChoose(size);
  }

  return (
    <Card
      padding="lg"
      className="mx-auto max-w-md space-y-6 border-line/70 bg-surface/75 shadow-lg backdrop-blur-xl"
    >
      <div className="space-y-2 text-center">
        <Pill tone="gold" size="sm" className="mx-auto">
          <Mic />
          {t("profile.pacePreference.tag", "Ek chhota sawaal")}
        </Pill>
        <h1 className="text-balance text-2xl font-semibold leading-tight text-ink">{QUESTION}</h1>
      </div>

      <div className="space-y-3">
        <ChoiceCard
          name="pace"
          value="together"
          checked={false}
          onSelect={() => pick(3)}
          icon={<SquareStack />}
          title={t("profile.pacePreference.togetherTitle", "Kai Saath Me")}
          description={t(
            "profile.pacePreference.togetherDescription",
            "Jaldi hoga — 2-3 sawaal ek saath poochhunga, jo yaad aaye bol dijiye",
          )}
        />
        <ChoiceCard
          name="pace"
          value="one"
          checked={false}
          onSelect={() => pick(1)}
          icon={<Rows3 />}
          title={t("profile.pacePreference.oneTitle", "Ek-ek Karke")}
          description={t("profile.pacePreference.oneDescription", "Aaram se — ek sawaal, ek jawab, phir agla")}
        />
      </div>

      <div className="border-t border-line/60 pt-4">
        <AnswerInput
          compact
          hint={QUESTION}
          busy={false}
          language={language}
          actions={actions}
          onSubmit={(text) => pick(detectPacePreference(text))}
        />
      </div>
    </Card>
  );
}
