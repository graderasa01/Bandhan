"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { AiProviderName } from "@/lib/ai/models";
import type { ModelAvailability } from "@/lib/ai/health";

/**
 * What each model actually did the last time anybody asked it — the truth the
 * dropdowns below used to have no way to show.
 *
 * A key being installed was the only signal before, and it lied in both
 * directions: this deployment has carried a valid Anthropic key with no credit
 * behind it, and Gemini models that Google's own list advertised while they
 * answered 503 or 404. Every row here is a real observation — a member's call
 * or an admin's "Check" — with the time it was made. Nothing is green until a
 * call succeeded, and an old observation says it is old.
 */

export interface HealthRow {
  provider: AiProviderName;
  model: string;
  label: string;
  state: ModelAvailability;
  stateLabel: string;
  stale: boolean;
  lastCheckedAt: number | null;
  lastLatencyMs: number | null;
  lastOutcome: string | null;
  lastReason: string | null;
  lastHttpStatus: number | null;
  lastMessage: string | null;
  contextWindow: number | null;
  vision: boolean;
  jsonSchema: string;
  verified: string | null;
}

const PROVIDER_LABELS: Record<AiProviderName, string> = {
  ANTHROPIC: "Claude (Anthropic)",
  OPENAI: "ChatGPT (OpenAI)",
  GEMINI: "Gemini (Google)",
  DEEPSEEK: "DeepSeek",
};

const STATE_STYLE: Record<ModelAvailability, string> = {
  AVAILABLE: "border-trust/40 bg-trust-bg text-trust",
  UNAVAILABLE: "border-warn/40 bg-warn-bg text-warn",
  USAGE_LIMIT: "border-warn/40 bg-warn-bg text-warn",
  AUTH_FAILED: "border-danger/40 bg-danger-bg text-danger",
  NOT_CONFIGURED: "border-line bg-bg-subtle text-muted",
  UNKNOWN: "border-line bg-bg-subtle text-muted",
};

function ago(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s pehle`;
  if (s < 3600) return `${Math.round(s / 60)} min pehle`;
  return `${Math.round(s / 3600)} ghante pehle`;
}

export function AvailabilityBadge({ state, label, stale }: { state: ModelAvailability; label: string; stale: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        STATE_STYLE[state],
        stale && "opacity-70",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
      {stale && " (purana check)"}
    </span>
  );
}

export default function AiHealthPanel({
  rows,
  policy,
  providerOrder,
  deepseekBalance,
}: {
  rows: HealthRow[];
  policy: string;
  providerOrder: AiProviderName[];
  deepseekBalance: { available: boolean; balance: string | null } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function probe(body: { provider?: AiProviderName; model?: string }, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/ai-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Check nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      const results = (json.results ?? []) as { outcome: string; model: string }[];
      const okCount = results.filter((r) => r.outcome === "MODEL_SUCCESS").length;
      toast({
        title: `${okCount}/${results.length} model ne jawab diya`,
        description: results
          .filter((r) => r.outcome !== "MODEL_SUCCESS")
          .map((r) => `${r.model}: ${r.outcome}`)
          .join(" · ")
          .slice(0, 200),
        tone: okCount === results.length ? "success" : "info",
      });
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const providers = [...new Set(rows.map((r) => r.provider))];

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">Model health</h3>
          <p className="mt-1 text-sm text-muted">
            Har model ki asli haalat — member ki asli call ya aapke &quot;Check&quot; se. Koi model tab tak
            &quot;Available&quot; nahi dikhta jab tak usne sach me jawab na diya ho.
          </p>
        </div>
        <Activity className="size-5 shrink-0 text-gold-600" />
      </div>

      <div className="mt-3 space-y-1 rounded-md bg-bg-subtle px-3 py-2 text-xs text-muted">
        <p>
          <span className="font-semibold text-ink">Fallback:</span>{" "}
          {policy === "cross-provider"
            ? `pehle chuna hua model, phir usi provider ka doosra model, phir doosra provider (${providerOrder.join(" → ")}).`
            : policy === "same-provider"
              ? "sirf usi provider ke doosre models par — provider kabhi nahi badalta."
              : "band — sirf chuna hua model."}{" "}
          <code>AI_FALLBACK_POLICY</code> se badlein.
        </p>
        {deepseekBalance && (
          <p>
            <span className="font-semibold text-ink">DeepSeek balance:</span> {deepseekBalance.balance ?? "?"}
            {!deepseekBalance.available && " — khatam, top-up chahiye"}
          </p>
        )}
        <p>Gemini free tier par har &quot;Check&quot; us model ki roz ki ~20 request me se ek leta hai.</p>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => probe({}, "all")}>
          {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : "Check all models"}
        </Button>
      </div>

      <div className="mt-3 space-y-4">
        {providers.map((provider) => (
          <div key={provider}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{PROVIDER_LABELS[provider]}</p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => probe({ provider }, provider)}
                className="text-xs font-medium text-gold-700 hover:underline disabled:opacity-50 dark:text-gold-300"
              >
                {busy === provider ? "Checking…" : "Check provider"}
              </button>
            </div>
            <ul className="divide-y divide-line rounded-md border border-line">
              {rows
                .filter((r) => r.provider === provider)
                .map((r) => {
                  const key = `${r.provider}:${r.model}`;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{r.label}</p>
                        <p className="truncate font-mono text-[0.6875rem] text-subtle">
                          {r.model} · {r.vision ? "vision" : "text-only"} · JSON {r.jsonSchema}
                          {r.contextWindow ? ` · ${Math.round(r.contextWindow / 1000)}k ctx` : " · limits unverified"}
                        </p>
                        {r.state !== "AVAILABLE" && r.state !== "UNKNOWN" && r.lastOutcome && (
                          <p className="truncate text-[0.6875rem] text-muted" title={r.lastMessage ?? undefined}>
                            {r.lastOutcome}
                            {r.lastHttpStatus ? ` · HTTP ${r.lastHttpStatus}` : ""}
                            {r.lastReason ? ` · ${r.lastReason}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <AvailabilityBadge state={r.state} label={r.stateLabel} stale={r.stale} />
                        <span className="w-20 text-right text-[0.6875rem] text-subtle">
                          {r.lastLatencyMs ? `${(r.lastLatencyMs / 1000).toFixed(1)}s · ` : ""}
                          {ago(r.lastCheckedAt)}
                        </span>
                        <button
                          type="button"
                          disabled={busy !== null || r.state === "NOT_CONFIGURED"}
                          onClick={() => probe({ provider: r.provider, model: r.model }, key)}
                          className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-gold-400 hover:text-ink disabled:opacity-40"
                        >
                          {busy === key ? <Loader2 className="size-3.5 animate-spin" /> : "Check"}
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
