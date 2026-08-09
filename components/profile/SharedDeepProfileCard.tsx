import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { DimensionScoreView } from "@/lib/services/deepProfile/deepProfileService";
import { getT } from "@/lib/i18n/server";

const LABEL_TONE: Record<string, string> = {
  STRONG: "text-trust",
  GOOD: "text-trust",
  MODERATE: "text-warn",
  LOW: "text-danger",
  UNKNOWN: "text-subtle",
};

export type SharedDeepProfileCardState =
  | { state: "locked"; computedCount: number }
  | { state: "unlocked"; unlocked: DimensionScoreView[] };

/**
 * The match-facing sibling of `DeepProfilePanel` — read-only (no Analyze
 * button, this isn't the viewer's own report), and shown only when
 * `getMatchDeepProfileState` has already cleared all three gates (L3, owner
 * opt-in, computed rows exist). The "locked" branch is the honest upsell
 * this project's §7.3 discipline asks for: state the real fact (someone
 * shared a real report, with a count), never a scary invented claim.
 */
export default async function SharedDeepProfileCard({ state }: { state: SharedDeepProfileCardState }) {
  const t = await getT();
  if (state.state === "locked") {
    return (
      <Card variant="soft" padding="lg">
        <div className="flex items-center gap-2">
          <Lock className="size-4 shrink-0 text-subtle" />
          <p className="text-[0.9375rem] font-semibold text-ink">
            {t("profile.sharedDeepProfile.title", "Deep Compatibility Report")}
          </p>
        </div>
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
          {t(
            "profile.sharedDeepProfile.lockedDescription",
            "Inhone apna Deep Profile ({count} dimensions) aapke saath share kiya hai — dekhne ke liye Premium chahiye.",
          ).replace("{count}", String(state.computedCount))}
        </p>
        <Link href="/pricing">
          <Button variant="secondary" size="sm" className="mt-3" icon={<Sparkles className="size-4" />}>
            {t("profile.sharedDeepProfile.viewPremium", "View Premium")}
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card variant="soft" padding="lg">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-gold-600" />
        <p className="text-[0.9375rem] font-semibold text-ink">
          {t("profile.sharedDeepProfile.title", "Deep Compatibility Report")}
        </p>
      </div>
      <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
        {t("profile.sharedDeepProfile.unlockedDescription", "Inhone ye apni marzi se aapke saath share kiya hai.")}
      </p>
      <div className="mt-3">
        {state.unlocked.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-medium text-ink">{item.label}</p>
              {item.explanationText && (
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{item.explanationText}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {item.scoreValue !== null ? (
                <p className="text-lg font-bold tabular-nums text-ink">{item.scoreValue}</p>
              ) : null}
              <p className={`text-[0.75rem] font-medium ${LABEL_TONE[item.scoreLabel] ?? "text-subtle"}`}>
                {item.scoreLabel === "UNKNOWN"
                  ? t("profile.sharedDeepProfile.unknown", "Abhi pata nahi")
                  : item.scoreLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
