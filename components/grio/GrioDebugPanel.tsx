"use client";

import { MODEL_REGISTRY } from "@/lib/ai/registry";
import type { GrioDebugTrace } from "@/lib/contracts/grioProfile";
import { cn } from "@/lib/utils";

/**
 * Grio's request trace, for developers — never rendered in production.
 *
 * Gated twice: `GrioChatCore` only mounts this when `NODE_ENV !== "production"`
 * (a compile-time constant, so the component is dead code in a production
 * bundle), and the API only *returns* a trace outside production. The model
 * picker is honoured by the server under the same rule.
 *
 * It answers the question the old "Jawab nahi ban paaya" never could: which
 * layer failed. Intent → context → tools → model attempts (each with its
 * outcome, HTTP status and latency) → fallback → final outcome.
 */
export const GRIO_DEBUG_ENABLED = process.env.NODE_ENV !== "production";

export default function GrioDebugPanel({
  trace,
  model,
  onModelChange,
}: {
  trace: GrioDebugTrace | null;
  model: string;
  onModelChange: (value: string) => void;
}) {
  const row = (k: string, v: React.ReactNode, key?: string) => (
    <div key={key ?? k} className="flex gap-2">
      <span className="w-28 shrink-0 text-subtle">{k}</span>
      <span className="min-w-0 break-words text-ink">{v}</span>
    </div>
  );
  const tick = (b: boolean) => (b ? "✓" : "✗");

  return (
    <div className="max-h-72 overflow-y-auto border-t border-dashed border-line bg-bg-subtle/70 px-4 py-2.5 font-mono text-[0.6875rem] leading-relaxed sm:px-6">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-semibold text-ink">Grio Debug</span>
        <span className="text-subtle">(dev only)</span>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="ml-auto rounded border border-line bg-surface px-1.5 py-0.5 text-[0.6875rem] text-ink"
          aria-label="Model for the next turn"
        >
          <option value="AUTO">AUTO (router)</option>
          {MODEL_REGISTRY.map((m) => (
            <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
              {m.provider}:{m.id}
            </option>
          ))}
        </select>
      </div>

      {!trace ? (
        <p className="text-subtle">Koi turn nahi hua abhi.</p>
      ) : (
        <div className="space-y-0.5">
          {row("request", `${trace.requestId} · ${trace.path}`)}
          {row(
            "intent",
            trace.intent
              ? `${trace.intent} (${trace.intentConfidence ?? "–"})${trace.intentMatched.length ? ` · ${trace.intentMatched.join(", ")}` : ""}`
              : "—",
          )}
          {row("profile", trace.profileId ?? "—")}
          {row("context", `profile ${tick(trace.profileContextLoaded)} · user ${tick(trace.userContextLoaded)} · ~${trace.approxInputTokens} tok`)}
          {trace.contextBlocks.length > 0 && row("blocks", trace.contextBlocks.map((b) => `${b.name}:${b.chars}`).join("  "))}
          {row("tools", trace.tools.join(", ") || "—")}
          {trace.stages.length > 0 && row("stages", trace.stages.map((s) => `${s.name} ${s.ms}ms`).join(" → "))}
          {row("answered by", trace.answeredBy)}
          {trace.model ? (
            <>
              {row("model", `${trace.model.primary} → ${trace.model.answeredBy ?? "none"}`)}
              {row("fallback", trace.model.fallbackUsed ? "yes" : "no")}
              {trace.model.attempts.map((a, i) =>
                row(
                  i === 0 ? "attempts" : "",
                  <span className={cn(a.outcome === "MODEL_SUCCESS" ? "text-trust" : "text-warn")}>
                    {a.role} {a.model} → {a.outcome}
                    {a.httpStatus ? ` ${a.httpStatus}` : ""} · {a.latencyMs}ms{a.reason ? ` · ${a.reason}` : ""}
                  </span>,
                  `attempt-${i}`,
                ),
              )}
              {trace.model.skipped.map((s, i) => row(i === 0 ? "skipped" : "", `${s.model} — ${s.reason}`, `skipped-${i}`))}
              {row("outcome", `${trace.model.finalOutcome} · ${trace.model.totalLatencyMs}ms`)}
            </>
          ) : (
            row("model", "— (no model call)")
          )}
          {row("error", trace.errorCategory ?? "—")}
          {row("total", `${trace.totalLatencyMs}ms`)}
        </div>
      )}
    </div>
  );
}
