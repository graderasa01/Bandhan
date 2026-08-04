"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Lock, Loader2, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DIMENSION_DESCRIPTIONS, DIMENSION_LABELS } from "@/lib/constants/deepDimensions";
import type { DimensionScoreView } from "@/lib/services/deepProfile/deepProfileService";
import type { DeepDimensionKey } from "@prisma/client";

const LABEL_TONE: Record<string, string> = {
  STRONG: "text-trust",
  GOOD: "text-trust",
  MODERATE: "text-warn",
  LOW: "text-danger",
  UNKNOWN: "text-subtle",
};

function ScoreRow({ item, hasGapQuestion }: { item: DimensionScoreView; hasGapQuestion: boolean }) {
  const isUnknown = item.scoreLabel === "UNKNOWN";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-medium text-ink">{item.label}</p>
        {item.explanationText && (
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{item.explanationText}</p>
        )}
        {/* Turns the dead end into a next step — the actual fix is the
            gap-question card above, this just points at it. */}
        {isUnknown && hasGapQuestion && (
          <p className="mt-0.5 text-[0.75rem] leading-snug text-gold-700">
            Upar diya sawaal jawab dekar profile ko behtar banayein
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {item.scoreValue !== null ? (
          <p className="text-lg font-bold tabular-nums text-ink">{item.scoreValue}</p>
        ) : null}
        <p className={`text-[0.75rem] font-medium ${LABEL_TONE[item.scoreLabel] ?? "text-subtle"}`}>
          {isUnknown ? "Abhi pata nahi" : item.scoreLabel}
        </p>
      </div>
    </div>
  );
}

function PendingRow({ dimensionKey }: { dimensionKey: DeepDimensionKey }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 text-muted last:border-0">
      <div>
        <p className="text-[0.9375rem] font-medium text-ink">{DIMENSION_LABELS[dimensionKey]}</p>
        <p className="mt-0.5 text-[0.75rem] text-subtle">{DIMENSION_DESCRIPTIONS[dimensionKey]}</p>
      </div>
      <span className="shrink-0 text-[0.75rem] text-subtle">Analyze karein</span>
    </div>
  );
}

/** The label is what's locked — showing it plainly next to a padlock is the honest "count visible, detail withheld" pattern this app uses everywhere else (admirer identity, voice notes). Nothing here needs blurring; a dimension's name isn't the paid content, its score is. */
function LockedRow({ dimensionKey }: { dimensionKey: DeepDimensionKey }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
      <div className="flex items-center gap-2 text-subtle">
        <Lock className="size-3.5 shrink-0" />
        <p className="text-[0.9375rem] font-medium">{DIMENSION_LABELS[dimensionKey]}</p>
      </div>
      <span className="shrink-0 text-[0.75rem] text-subtle">Upgrade</span>
    </div>
  );
}

export interface DeepProfilePanelData {
  unlocked: DimensionScoreView[];
  pendingKeys: DeepDimensionKey[];
  lockedKeys: DeepDimensionKey[];
  totalDimensions: number;
  hasAnyComputed: boolean;
  /** Whether `GapQuestionCard` is currently showing a question above this panel. */
  hasGapQuestion: boolean;
  /** Phase E — the printable report is offered once all 13 are actually scored, not just entitled. */
  deepReportEnabled: boolean;
}

/**
 * D-11's `deepDimensions`, made visible. Three distinct row states —
 * scored, pending (entitled, not yet analyzed), locked (not entitled) — each
 * with its own honest label rather than one generic "locked" treatment for
 * both "you haven't tried yet" and "you'd need to pay for this".
 */
export default function DeepProfilePanel({ data }: { data: DeepProfilePanelData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/deep-dimensions/analyze", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Analysis nahi ho payi", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Analysis ho gaya", description: `${json.computed} dimensions update hue.`, tone: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const entitledCount = data.unlocked.length + data.pendingKeys.length;
  const fullyScored = data.unlocked.length === data.totalDimensions;

  return (
    <Card variant="soft" padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.9375rem] font-semibold text-ink">
            {entitledCount} of {data.totalDimensions} dimensions available
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            Ye aapke profile ke fields se AI nikalta hai — kabhi bhi kuch invent nahi karta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Only once every entitled dimension is actually scored — a report
              with locked or blank rows would undercut the thing families are
              meant to trust it for. */}
          {data.deepReportEnabled && fullyScored && (
            <Link href="/user/deep-profile/report">
              <Button variant="secondary" size="sm" icon={<Download className="size-4" />}>
                Family ke liye PDF
              </Button>
            </Link>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={analyze}
            icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          >
            {data.hasAnyComputed ? "Refresh Analysis" : "Analyze My Profile"}
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {data.unlocked.map((item) => (
          <ScoreRow key={item.key} item={item} hasGapQuestion={data.hasGapQuestion} />
        ))}
        {data.pendingKeys.map((key) => (
          <PendingRow key={key} dimensionKey={key} />
        ))}
        {data.lockedKeys.map((key) => (
          <LockedRow key={key} dimensionKey={key} />
        ))}
      </div>
    </Card>
  );
}
