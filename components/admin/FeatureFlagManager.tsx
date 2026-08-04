"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { FEATURE_ROLLOUT_LABELS } from "@/lib/constants/features";
import type { FeatureRollout } from "@prisma/client";

export type FlagRow = {
  key: string;
  label: string;
  description: string;
  built: boolean;
  rollout: FeatureRollout;
  isDefault: boolean;
};

const ROLLOUTS: FeatureRollout[] = ["OFF", "ALLOWLIST", "PLAN_GATED", "ALL"];

const TONE: Record<FeatureRollout, string> = {
  OFF: "border-line bg-bg-subtle text-muted",
  ALLOWLIST: "border-warn/30 bg-warn-bg text-warn",
  PLAN_GATED: "border-trust/25 bg-trust-bg text-trust",
  ALL: "border-gold-400/50 bg-gold-50 text-gold-700 dark:bg-gold-900/25",
};

export default function FeatureFlagManager({ rows }: { rows: FlagRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function save(row: FlagRow, rollout: FeatureRollout) {
    setBusy(row.key);
    try {
      const res = await fetch(`/api/admin/features/${row.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollout }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${row.label} — ${FEATURE_ROLLOUT_LABELS[rollout]}`,
        description: "30 second ke andar har jagah live ho jayega.",
        tone: "success",
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.key} padding="md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.9375rem] font-semibold text-ink">{row.label}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${TONE[row.rollout]}`}
                >
                  {row.rollout}
                </span>
                {row.isDefault && (
                  <span className="text-[0.6875rem] text-subtle">code default</span>
                )}
              </div>
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{row.description}</p>
              {!row.built && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[0.75rem] text-warn">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Ye feature abhi bana nahi hai — switch badalne se kuch nahi hoga.
                </p>
              )}
            </div>

            <div className="w-full sm:w-64">
              <Select
                aria-label={`${row.label} rollout`}
                value={row.rollout}
                disabled={busy === row.key}
                onChange={(e) => save(row, e.target.value as FeatureRollout)}
                options={ROLLOUTS.map((r) => ({ value: r, label: FEATURE_ROLLOUT_LABELS[r] }))}
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
