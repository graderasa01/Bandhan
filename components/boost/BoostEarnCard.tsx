"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Mic, Rocket } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Progress from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import CelebrationHost from "@/components/ui/CelebrationHost";
import type { BoostActivateResponse, BoostCelebration } from "@/lib/contracts/boost";
import { useT } from "@/components/i18n/LanguageProvider";

export interface BoostQuestView {
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardLabel: string;
  completed: boolean;
}

/**
 * The "manual" system itself — spend a credit right now, or work toward one.
 *
 * Two independent paths, shown honestly rather than merged into one button:
 * a held `RewardGrant(BOOST)` credit can be spent immediately
 * (`activateBoostFromReward`, wired here for the first time — the function
 * existed with no caller before this page); today's voice-note quest is how
 * a Free/Basic user earns the next one. Plan subscribers don't need either —
 * `BoostHero` already tells them it's standing.
 */
export default function BoostEarnCard({
  planHasBoost,
  credits,
  quest,
}: {
  planHasBoost: boolean;
  credits: number;
  quest: BoostQuestView | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<BoostCelebration | null>(null);

  async function activate() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/boost/activate", { method: "POST" });
      const json = (await res.json()) as BoostActivateResponse;
      if (!json.ok) {
        toast({ title: t("boost.earnCard.activateFailed", "Activate nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setCelebration(json.celebration);
      router.refresh();
    } catch {
      toast({ title: t("boost.earnCard.networkErrorTitle", "Network error"), description: t("boost.earnCard.networkErrorDesc", "Please try again."), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (planHasBoost) {
    return (
      <Card variant="soft" padding="md">
        <p className="text-[0.9375rem] font-semibold text-ink">{t("boost.earnCard.includedTitle", "Aapke plan me pehle se shaamil hai")}</p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          {t(
            "boost.earnCard.includedDesc",
            "Standard aur Premium dono me boost automatic chalu rehta hai, jab tak subscription chalu hai — kuch karne ki zaroorat nahi.",
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card variant="soft" padding="md">
      <p className="text-[0.9375rem] font-semibold text-ink">{t("boost.earnCard.earnOrUse", "Boost kamaayein, ya abhi use karein")}</p>

      {credits > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold-300/60 bg-gold-50 px-3.5 py-3 dark:border-gold-700/40 dark:bg-gold-900/20">
          <div className="min-w-0">
            <p className="text-[0.875rem] font-medium text-ink">
              {credits}
              {t("boost.earnCard.creditsReadyPre", " boost credit")}
              {credits > 1 ? "s" : ""}
              {t("boost.earnCard.creditsReadyPost", " ready ")}
              {credits > 1 ? t("boost.earnCard.hainPlural", "hain") : t("boost.earnCard.haiSingular", "hai")}
            </p>
            <p className="text-[0.75rem] text-muted">{t("boost.earnCard.activateHint", "Ek activate karein — 24 ghante ke liye chalega.")}</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={activate}
            icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
          >
            {t("boost.earnCard.activateBoost", "Activate Boost")}
          </Button>
        </div>
      )}

      {quest && !quest.completed && (
        <div className="mt-3 rounded-md border border-line bg-bg-subtle/60 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200">
              <Mic className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] font-medium text-ink">{quest.title}</p>
              <p className="text-[0.75rem] leading-snug text-muted">{quest.description}</p>
              <Progress
                className="mt-2"
                value={(Math.min(quest.progress, quest.target) / quest.target) * 100}
                label={`${Math.min(quest.progress, quest.target)} / ${quest.target}`}
                showPercentage={false}
                size="sm"
              />
              <p className="mt-1.5 text-[0.75rem] font-medium text-gold-700">{quest.rewardLabel}</p>
            </div>
          </div>
        </div>
      )}

      {quest?.completed && credits === 0 && (
        <p className="mt-3 text-[0.8125rem] text-muted">
          {t("boost.earnCard.questDoneToday", "Aaj ka boost quest poora ho chuka hai — kal phir se milega.")}
        </p>
      )}

      {!quest && credits === 0 && (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          {t("boost.earnCard.noDailyWayPre", "Boost kamaane ka roz ka tarika abhi aapke liye khula nahi hai.")}{" "}
          <Link href="/user/subscription" className="font-medium text-gold-700 underline underline-offset-2">
            {t("boost.earnCard.standardOrPremium", "Standard ya Premium")}
          </Link>{" "}
          {t("boost.earnCard.noDailyWayPost", "me hamesha ke liye shaamil milta hai.")}
        </p>
      )}

      <CelebrationHost celebration={celebration} onDone={() => setCelebration(null)} />
    </Card>
  );
}
