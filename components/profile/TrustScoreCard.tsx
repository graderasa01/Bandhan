import { Check, Circle } from "lucide-react";
import TrustScoreRing from "@/components/profile/TrustScoreRing";
import { LeafSpray } from "@/components/public/_shared/Ornaments";
import type { TrustFactor, TrustScoreLabel } from "@/lib/services/trust/trustScoreService";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

interface Props {
  score: number | null;
  scoreLabel: TrustScoreLabel;
  positiveFactors: TrustFactor[];
  improvementFactors: TrustFactor[];
}

/** Green for the two settled labels, amber for the two that mean "act". */
const LABEL_TONE: Record<TrustScoreLabel, string> = {
  STRONG: "border-trust/30 bg-trust-bg text-trust",
  GOOD: "border-trust/30 bg-trust-bg text-trust",
  MODERATE: "border-warn/30 bg-warn-bg text-warn",
  LOW: "border-warn/30 bg-warn-bg text-warn",
  UNKNOWN: "border-line bg-surface-2 text-muted",
};

export default async function TrustScoreCard({
  score,
  scoreLabel,
  positiveFactors,
  improvementFactors,
}: Props) {
  const t = await getT();
  const LABEL_TEXT: Record<TrustScoreLabel, string> = {
    STRONG: t("profile.trustScoreCard.strong", "Strong"),
    GOOD: t("profile.trustScoreCard.good", "Good"),
    MODERATE: t("profile.trustScoreCard.moderate", "Moderate"),
    LOW: t("profile.trustScoreCard.low", "Low"),
    UNKNOWN: t("profile.trustScoreCard.unknown", "Unknown"),
  };

  return (
    <div className="bt-card h-full overflow-hidden p-5 sm:p-6">
      <LeafSpray flip className="bt-vine bt-vine--soft -right-8 -top-10 h-[168px] w-[100px]" />

      <div className="relative flex items-center gap-5">
        <TrustScoreRing score={score} label={scoreLabel} size={104} />
        <div className="min-w-0">
          <h3 className="bt-display text-[1.3rem] leading-snug">
            {t("profile.trustScoreCard.title", "AI Trust Score")}
          </h3>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {score === null
              ? t("profile.trustScoreCard.pendingHint", "Profile poori hone ke baad AI ise calculate karega.")
              : t("profile.trustScoreCard.computedHint", "Verification aur profile quality ka combined score.")}
          </p>
          <span
            className={cn(
              "mt-2.5 inline-flex rounded-full border px-3 py-1 text-[0.75rem] font-semibold",
              LABEL_TONE[scoreLabel],
            )}
          >
            {LABEL_TEXT[scoreLabel]}
          </span>
        </div>
      </div>

      {positiveFactors.length > 0 && (
        <div className="relative mt-6">
          <p className="bt-microlabel text-trust">
            {t("profile.trustScoreCard.strongPoints", "Strong Points")}
          </p>
          {/* Two-up: the settled half of this card is a checklist you scan, not
              one you read, and a single column of nine turns the improvements
              below it into something you have to scroll for. */}
          <ul className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {positiveFactors.map((f) => (
              <li key={f.label} className="flex items-start gap-2 text-[0.8125rem] text-ink">
                <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-trust text-white">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {improvementFactors.length > 0 && (
        <div className="relative mt-6 border-t border-line pt-5">
          <p className="bt-microlabel text-warn">
            {t("profile.trustScoreCard.improve", "Improve")}
          </p>
          <ul className="mt-3 space-y-2">
            {improvementFactors.map((f) => (
              <li key={f.label} className="flex items-start gap-2 text-[0.8125rem] text-muted">
                <Circle className="mt-px size-4 shrink-0 text-line-strong" />
                {f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
