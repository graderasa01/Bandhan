import { CheckCircle2, Circle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import TrustScoreRing from "@/components/profile/TrustScoreRing";
import type { TrustFactor, TrustScoreLabel } from "@/lib/services/trust/trustScoreService";

interface Props {
  score: number | null;
  scoreLabel: TrustScoreLabel;
  positiveFactors: TrustFactor[];
  improvementFactors: TrustFactor[];
}

const BADGE_BY_LABEL: Record<TrustScoreLabel, { variant: "complete" | "incomplete" | "pending"; text: string }> = {
  STRONG: { variant: "complete", text: "Strong" },
  GOOD: { variant: "complete", text: "Good" },
  MODERATE: { variant: "incomplete", text: "Moderate" },
  LOW: { variant: "incomplete", text: "Low" },
  UNKNOWN: { variant: "pending", text: "Unknown" },
};

export default function TrustScoreCard({ score, scoreLabel, positiveFactors, improvementFactors }: Props) {
  const badge = BADGE_BY_LABEL[scoreLabel];

  return (
    <Card variant="default" padding="lg">
      <div className="flex items-center gap-4">
        <TrustScoreRing score={score} label={scoreLabel} size={92} />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-wine-700">AI Trust Score</h3>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            {score === null
              ? "Profile poori hone ke baad AI ise calculate karega."
              : "Verification aur profile quality ka combined score."}
          </p>
          <Badge variant={badge.variant} className="mt-2">
            {badge.text}
          </Badge>
        </div>
      </div>

      {positiveFactors.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-trust">
            Strong Points
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
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-warn">Improve</p>
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
