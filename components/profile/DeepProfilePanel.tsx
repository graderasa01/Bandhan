"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Lock, Loader2, Sparkles, type LucideIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { DIMENSION_DESCRIPTIONS, DIMENSION_ICONS, DIMENSION_LABELS } from "@/lib/constants/deepDimensions";
import type { DimensionScoreView } from "@/lib/services/deepProfile/deepProfileService";
import type { DeepDimensionKey } from "@prisma/client";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Score-band colours — deliberately the same five hex pairs
 * `TrustScoreRing` uses for its STRONG/GOOD/MODERATE/LOW/UNKNOWN glow, not a
 * second palette invented for this screen. Both features share the exact
 * same label vocabulary (`DIMENSION_SCORE_LABELS` / `TrustScoreLabel`), so
 * "STRONG" earns the same green everywhere in the app rather than meaning a
 * different colour depending which screen you're on.
 */
const BAND: Record<string, { from: string; to: string; glowRgb: string; pill: "trust" | "gold" | "danger" | "neutral" }> = {
  STRONG: { from: "#4cbf94", to: "#1f7a5a", glowRgb: "31 122 90", pill: "trust" },
  GOOD: { from: "#4cbf94", to: "#1f7a5a", glowRgb: "31 122 90", pill: "trust" },
  MODERATE: { from: "#ddac51", to: "#a88848", glowRgb: "201 169 110", pill: "gold" },
  LOW: { from: "#e0b555", to: "#9a6512", glowRgb: "154 101 18", pill: "danger" },
  UNKNOWN: { from: "#9a8b7d", to: "#6b5d52", glowRgb: "154 139 125", pill: "neutral" },
};

/** Shared chrome for every dimension tile — icon wrap, corner glow, border — so score/pending/locked only differ in tone and content. */
function DimensionShell({
  icon: Icon,
  iconFrom,
  iconTo,
  glowRgb,
  dashed = false,
  dimmed = false,
  hoverGlow = false,
  children,
}: {
  icon: LucideIcon;
  iconFrom: string;
  iconTo: string;
  glowRgb: string;
  dashed?: boolean;
  dimmed?: boolean;
  hoverGlow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border p-4 transition-all duration-300",
        dashed ? "border-dashed border-line-strong bg-bg-subtle/50" : "border-line/70 bg-surface",
        dimmed && "opacity-70 hover:opacity-100",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 size-24 rounded-full blur-2xl transition-opacity duration-300",
          hoverGlow ? "opacity-0 group-hover:opacity-100" : "opacity-40",
        )}
        style={{ backgroundColor: `rgb(${glowRgb} / 0.35)` }}
      />
      <div className="relative flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full text-white shadow-md"
          style={{ backgroundImage: `linear-gradient(135deg, ${iconFrom}, ${iconTo})` }}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function ScoreCard({ item, hasGapQuestion }: { item: DimensionScoreView; hasGapQuestion: boolean }) {
  const t = useT();
  const isUnknown = item.scoreLabel === "UNKNOWN";
  const band = BAND[item.scoreLabel] ?? BAND.UNKNOWN;
  const Icon = DIMENSION_ICONS[item.key];

  return (
    <DimensionShell icon={Icon} iconFrom={band.from} iconTo={band.to} glowRgb={band.glowRgb}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold text-ink">{item.label}</p>
        {item.scoreValue !== null && (
          <span
            className="shrink-0 font-[family-name:var(--font-display)] text-xl font-bold tabular-nums"
            style={{ color: band.to }}
          >
            {item.scoreValue}
          </span>
        )}
      </div>
      {item.explanationText && (
        <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{item.explanationText}</p>
      )}
      {isUnknown && hasGapQuestion && (
        <p className="mt-1.5 text-[0.75rem] font-medium leading-snug text-gold-700">
          {t("profile.deepProfilePanel.answerAboveToImprove", "Upar diya sawaal jawab dekar profile ko behtar banayein")}
        </p>
      )}
      <Pill tone={band.pill} size="sm" className="mt-2.5">
        {isUnknown ? t("profile.deepProfilePanel.unknown", "Abhi pata nahi") : item.scoreLabel}
      </Pill>
    </DimensionShell>
  );
}

function PendingCard({ dimensionKey }: { dimensionKey: DeepDimensionKey }) {
  const t = useT();
  const Icon = DIMENSION_ICONS[dimensionKey];
  return (
    <DimensionShell icon={Icon} iconFrom="#c9a96e" iconTo="#8a7146" glowRgb="201 169 110" dashed>
      <p className="text-[0.9375rem] font-semibold text-ink">{DIMENSION_LABELS[dimensionKey]}</p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-subtle">{DIMENSION_DESCRIPTIONS[dimensionKey]}</p>
      <p className="mt-2.5 inline-flex items-center gap-1 text-[0.75rem] font-medium text-gold-700">
        <Sparkles className="size-3" />
        {t("profile.deepProfilePanel.analyzeIt", "Analyze karein")}
      </p>
    </DimensionShell>
  );
}

function LockedCard({ dimensionKey }: { dimensionKey: DeepDimensionKey }) {
  const t = useT();
  const Icon = DIMENSION_ICONS[dimensionKey];
  return (
    <DimensionShell icon={Icon} iconFrom="#c9a96e" iconTo="#8a7146" glowRgb="201 169 110" dimmed hoverGlow>
      <p className="text-[0.9375rem] font-semibold text-ink">{DIMENSION_LABELS[dimensionKey]}</p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-subtle">{DIMENSION_DESCRIPTIONS[dimensionKey]}</p>
      <Pill tone="gold" size="sm" className="mt-2.5">
        <Lock className="size-3" />
        {t("profile.deepProfilePanel.upgrade", "Upgrade")}
      </Pill>
    </DimensionShell>
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
 * D-11's `deepDimensions`, made visible. Three distinct tile states —
 * scored, pending (entitled, not yet analyzed), locked (not entitled) — each
 * with its own honest look rather than one generic "locked" treatment for
 * both "you haven't tried yet" and "you'd need to pay for this".
 */
export default function DeepProfilePanel({ data }: { data: DeepProfilePanelData }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/deep-dimensions/analyze", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("profile.deepProfilePanel.analysisFailed", "Analysis nahi ho payi"), description: json.message, tone: "error" });
        return;
      }
      toast({
        title: t("profile.deepProfilePanel.analysisDone", "Analysis ho gaya"),
        description: `${json.computed} ${t("profile.deepProfilePanel.dimensionsUpdated", "dimensions update hue.")}`,
        tone: "success",
      });
      router.refresh();
    } catch {
      toast({ title: t("profile.deepProfilePanel.networkError", "Network error"), description: t("profile.deepProfilePanel.tryAgain", "Please try again."), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const entitledCount = data.unlocked.length + data.pendingKeys.length;
  const fullyScored = data.unlocked.length === data.totalDimensions;

  return (
    <Card variant="luxe" padding="lg" className="spotlight overflow-hidden">
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <span aria-hidden className="absolute inset-0 rounded-full animate-pulse-ring" />
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-[0.9375rem] font-semibold text-ink">
              {entitledCount} {t("profile.deepProfilePanel.ofPre", "of")} {data.totalDimensions}{" "}
              {t("profile.deepProfilePanel.dimensionsAvailable", "dimensions available")}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-muted">
              {t("profile.deepProfilePanel.sourceNote", "Ye aapke profile ke fields se AI nikalta hai — kabhi bhi kuch invent nahi karta.")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Only once every entitled dimension is actually scored — a report
              with locked or blank rows would undercut the thing families are
              meant to trust it for. */}
          {data.deepReportEnabled && fullyScored && (
            <Link href="/user/deep-profile/report">
              <Button variant="secondary" size="sm" icon={<Download className="size-4" />}>
                {t("profile.deepProfilePanel.pdfForFamily", "PDF for Family")}
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
            {data.hasAnyComputed
              ? t("profile.deepProfilePanel.refreshAnalysis", "Refresh Analysis")
              : t("profile.deepProfilePanel.analyzeMyProfile", "Analyze My Profile")}
          </Button>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.unlocked.map((item) => (
          <ScoreCard key={item.key} item={item} hasGapQuestion={data.hasGapQuestion} />
        ))}
        {data.pendingKeys.map((key) => (
          <PendingCard key={key} dimensionKey={key} />
        ))}
        {data.lockedKeys.map((key) => (
          <LockedCard key={key} dimensionKey={key} />
        ))}
      </div>
    </Card>
  );
}
