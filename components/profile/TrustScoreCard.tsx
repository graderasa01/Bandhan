import { CheckCircle2, Circle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import TrustScoreRing from "@/components/profile/TrustScoreRing";
import type { TrustFactor, TrustScoreLabel } from "@/lib/services/trust/trustScoreService";
import { getT } from "@/lib/i18n/server";

interface Props {
  score: number | null;
  scoreLabel: TrustScoreLabel;
  positiveFactors: TrustFactor[];
  improvementFactors: TrustFactor[];
}

export default async function TrustScoreCard({ score, scoreLabel, positiveFactors, improvementFactors }: Props) {
  const t = await getT();
  const BADGE_BY_LABEL: Record<TrustScoreLabel, { variant: "complete" | "incomplete" | "pending"; text: string }> = {
    STRONG: { variant: "complete", text: t("profile.trustScoreCard.strong", "Strong") },
    GOOD: { variant: "complete", text: t("profile.trustScoreCard.good", "Good") },
    MODERATE: { variant: "incomplete", text: t("profile.trustScoreCard.moderate", "Moderate") },
    LOW: { variant: "incomplete", text: t("profile.trustScoreCard.low", "Low") },
    UNKNOWN: { variant: "pending", text: t("profile.trustScoreCard.unknown", "Unknown") },
  };
  const badge = BADGE_BY_LABEL[scoreLabel];

  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center gap-4">
        <TrustScoreRing score={score} label={scoreLabel} size={92} />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-wine-700">{t("profile.trustScoreCard.title", "AI Trust Score")}</h3>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {score === null
              ? t("profile.trustScoreCard.pendingHint", "Profile poori hone ke baad AI ise calculate karega.")
              : t("profile.trustScoreCard.computedHint", "Verification aur profile quality ka combined score.")}
          </p>
          <Badge variant={badge.variant} className="mt-2">
            {badge.text}
          </Badge>
        </div>
      </div>

      {positiveFactors.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-trust">
            {t("profile.trustScoreCard.strongPoints", "Strong Points")}
          </p>
          <ul className="space-y-1">
            {positiveFactors.map((f) => (
              <li key={f.label} className="flex items-start gap-1.5 text-[0.8125rem] text-ink">
                <CheckCircle2 className="mt-px size-3.5 shrink-0 text-trust" />
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {improvementFactors.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-warn">
            {t("profile.trustScoreCard.improve", "Improve")}
          </p>
          <ul className="space-y-1">
            {improvementFactors.map((f) => (
              <li key={f.label} className="flex items-start gap-1.5 text-[0.8125rem] text-muted">
                <Circle className="mt-px size-3.5 shrink-0" />
                {f.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
