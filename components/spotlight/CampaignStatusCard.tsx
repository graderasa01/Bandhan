import { PauseCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Progress from "@/components/ui/Progress";
import type { CampaignView } from "@/lib/services/spotlight/campaignService";

/**
 * A campaign the buyer already paid for, reported against its own promise.
 *
 * `deliveredReach` is a counted row, never an estimate. One row per person in
 * `SpotlightDelivery`, written when that person actually opened the deck the
 * card was in — not when it was placed there. So the number on this bar is one
 * the buyer could verify by asking any of the people it counts, which is the
 * only kind of reach figure worth printing.
 *
 * `ENDED_SHORT` is on this card for the same reason. A campaign that ran out
 * of audience before it ran out of promise says so here, next to the bar that
 * shows how far it got — not silently as a "completed" one.
 */

const STATUS_LABEL: Record<CampaignView["status"], string> = {
  DRAFT: "Payment ka intezaar",
  RUNNING: "Chal raha hai",
  PAUSED: "Roka gaya",
  COMPLETED: "Poora hua",
  ENDED_SHORT: "Band — reach poori nahi hui",
  CANCELLED: "Cancel",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function daysLeft(endsAt: Date | null): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
}

export default function CampaignStatusCard({ campaign }: { campaign: CampaignView }) {
  const left = daysLeft(campaign.endsAt);
  const pct = campaign.promisedReach > 0 ? (campaign.deliveredReach / campaign.promisedReach) * 100 : 0;

  const targeting = [
    campaign.targetGender,
    `${campaign.minAge}–${campaign.maxAge} saal`,
    campaign.cities.length > 0 ? campaign.cities.join(", ") : "poore India me",
  ].join(" · ");

  return (
    <Card variant="default" padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[0.9375rem] font-semibold text-ink">{campaign.itemCode.replace(/_/g, " ")}</h3>
          <Pill size="sm" tone={campaign.status === "RUNNING" ? "gold" : "neutral"}>
            {STATUS_LABEL[campaign.status]}
          </Pill>
        </div>
        {campaign.status === "RUNNING" && left !== null && (
          <span className="text-[0.75rem] text-muted">{left} din bache</span>
        )}
      </div>

      <p className="mt-1 text-[0.75rem] text-subtle">{targeting}</p>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[0.8125rem]">
          <span className="font-medium text-ink">
            {campaign.deliveredReach} / {campaign.promisedReach} log
          </span>
          {campaign.startsAt && campaign.endsAt && (
            <span className="text-subtle">
              {formatDate(campaign.startsAt)} → {formatDate(campaign.endsAt)}
            </span>
          )}
        </div>
        <Progress value={pct} size="sm" showPercentage={false} className="mt-1.5" />
      </div>

      {campaign.status === "PAUSED" && (
        <p className="mt-3 flex items-start gap-2 text-[0.75rem] leading-relaxed text-warn">
          <PauseCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {campaign.pausedReason ?? "Eligibility poori nahi ho rahi."} Jitne din ruka rahega, utne din baad me
            wapas mil jayenge.
          </span>
        </p>
      )}
    </Card>
  );
}
