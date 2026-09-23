import "./_env";
import { prisma } from "../lib/db/prisma";
import { probeAll, probeModel, getDeepSeekBalance } from "../lib/ai/probe";
import { callAi } from "../lib/ai/providers";
import { MODEL_REGISTRY, AI_PROVIDERS } from "../lib/ai/registry";
import { getProviderKey } from "../lib/ai/credentials";
import type { AiFeatureKey, AiProviderName } from "../lib/ai/models";

/**
 * The AI gateway, checked against the real providers from a terminal — the
 * CLI twin of /admin/ai-settings' model table.
 *
 *   npx tsx scripts/ai-model-probe.ts                       probe every registered model
 *   npx tsx scripts/ai-model-probe.ts --provider=DEEPSEEK   one provider
 *   npx tsx scripts/ai-model-probe.ts --model=GEMINI:gemini-3.6-flash
 *   npx tsx scripts/ai-model-probe.ts --balance             DeepSeek balance (free call)
 *   npx tsx scripts/ai-model-probe.ts --catalog             registry vs. what each provider lists
 *   npx tsx scripts/ai-model-probe.ts --route=matchExplain  one real routed call, with its trace
 *
 * Cost: one 16-token call per probed model. On Gemini's free tier that is one
 * request out of that model's daily allowance, so do not loop this.
 *
 * Reads keys the same way the app does (ProviderCredential row, then env) and
 * never prints one.
 */

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function row(cells: (string | number | null | undefined)[], widths: number[]) {
  return cells.map((c, i) => String(c ?? "—").padEnd(widths[i])).join(" ");
}

async function catalogCheck() {
  console.log("\nRegistry vs. provider model lists (free calls):\n");
  const listed: Record<AiProviderName, Set<string> | null> = { ANTHROPIC: null, OPENAI: null, GEMINI: null, DEEPSEEK: null };

  const gemini = await getProviderKey("GEMINI");
  if (gemini) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": gemini },
    });
    const json = (await res.json()) as { models?: { name: string }[] };
    listed.GEMINI = new Set((json.models ?? []).map((m) => m.name.replace("models/", "")));
  }
  const deepseek = await getProviderKey("DEEPSEEK");
  if (deepseek) {
    const res = await fetch("https://api.deepseek.com/models", { headers: { authorization: `Bearer ${deepseek}` } });
    const json = (await res.json()) as { data?: { id: string }[] };
    listed.DEEPSEEK = new Set((json.data ?? []).map((m) => m.id));
  }
  const anthropic = await getProviderKey("ANTHROPIC");
  if (anthropic) {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
    });
    const json = (await res.json()) as { data?: { id: string }[] };
    listed.ANTHROPIC = new Set((json.data ?? []).map((m) => m.id));
  }

  for (const m of MODEL_REGISTRY) {
    const set = listed[m.provider];
    const status = set === null ? "no key — not checked" : set.has(m.id) ? "listed" : "NOT LISTED by provider";
    console.log(`  ${m.provider.padEnd(10)} ${m.id.padEnd(26)} ${status}`);
  }
  console.log("\n  A listed model can still be dead (Gemini listed 2.5 Flash while it answered 404) — probe to be sure.");
}

async function routeCheck(feature: AiFeatureKey) {
  console.log(`\nOne real routed call for "${feature}":\n`);
  const result = await callAi({
    configFeature: feature,
    logFeature: `probe_${feature}`,
    userId: null,
    system: "Aap ek matrimony app ke assistant hain. Ek line me Hinglish me jawab dijiye.",
    content: "Sirf itna likhiye: namaste, main theek chal raha hoon.",
    maxTokens: 120,
    thinking: "off",
  });
  const t = result.trace;
  console.log(`  primary: ${t.primary.provider}:${t.primary.model}   policy: ${t.policy}`);
  for (const s of t.skipped) console.log(`  skipped  ${s.provider}:${s.model} — ${s.reason}`);
  for (const a of t.attempts) {
    console.log(
      `  attempt  ${a.role.padEnd(15)} ${`${a.provider}:${a.model}`.padEnd(34)} ${a.outcome.padEnd(28)} ${String(a.httpStatus ?? "—").padEnd(4)} ${String(a.latencyMs).padStart(6)}ms ${a.reason ?? ""}`,
    );
  }
  console.log(`  → ${result.ok ? "OK" : "FAILED"} (${t.finalOutcome}) in ${t.totalLatencyMs}ms, fallback used: ${t.fallbackUsed}`);
  console.log(`  answer: ${result.ok ? JSON.stringify(result.text.trim().slice(0, 160)) : result.message}`);
}

async function main() {
  const configured = Object.fromEntries(
    await Promise.all(AI_PROVIDERS.map(async (p) => [p, Boolean(await getProviderKey(p))] as const)),
  );
  console.log(`keys configured: ${AI_PROVIDERS.map((p) => `${p}=${configured[p] ? "yes" : "no"}`).join("  ")}`);

  if (flag("balance")) {
    const b = await getDeepSeekBalance();
    console.log(`DeepSeek balance: ${b ? `${b.balance ?? "?"} (available=${b.available})` : "unknown (no key or call failed)"}`);
    return;
  }
  if (flag("catalog")) return catalogCheck();

  const route = arg("route");
  if (route) return routeCheck(route as AiFeatureKey);

  const one = arg("model");
  const provider = arg("provider")?.toUpperCase() as AiProviderName | undefined;
  const results = one
    ? [await probeModel(one.split(":")[0] as AiProviderName, one.split(":").slice(1).join(":"))]
    : await probeAll(provider);

  const widths = [10, 26, 28, 5, 8, 22, 22];
  console.log("\n" + row(["provider", "model", "outcome", "http", "ms", "reason", "shown as"], widths));
  console.log("-".repeat(130));
  for (const r of results) {
    console.log(
      row(
        [r.provider, r.model, r.outcome, r.httpStatus, r.latencyMs, r.reason, r.availability.label],
        widths,
      ) + (r.detail ? `  ${r.detail.slice(0, 90)}` : ""),
    );
  }
}

main()
  .catch((e) => {
    console.error("probe failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
