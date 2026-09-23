import "./_env";
import { prisma } from "../lib/db/prisma";
import { applyProviderSwitch, getAllAiRoutes } from "../lib/ai/aiConfigService";
import { planProviderSwitch, type ProviderSwitchMode } from "../lib/ai/providerSwitch";
import { AI_FEATURE_TIER, type AiFeatureKey, type AiProviderName } from "../lib/ai/models";

/**
 * The bulk provider switch from a terminal — the same `applyProviderSwitch`
 * the admin button calls, with a dry run in front of it.
 *
 *   npx tsx scripts/ai-provider-switch.ts                          (dry run, GEMINI + spread)
 *   npx tsx scripts/ai-provider-switch.ts --provider=ANTHROPIC     (dry run, another provider)
 *   npx tsx scripts/ai-provider-switch.ts --tier                   (dry run, one model per tier)
 *   npx tsx scripts/ai-provider-switch.ts --apply                  (writes)
 *
 * It exists because the situation this is for — a provider's balance hits zero
 * and every feature on it starts throwing — is not always one an admin can log
 * in and click through. Being able to run it against the production database
 * from a shell is the difference between a five-minute outage and a long one.
 *
 * The dry run is the default, and prints the current routing next to the
 * proposed one, because "switch everything" is the one AI setting that is hard
 * to eyeball afterwards.
 */

const PROVIDERS: AiProviderName[] = ["ANTHROPIC", "OPENAI", "GEMINI", "DEEPSEEK"];

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const providerArg = (arg("provider") ?? "GEMINI").toUpperCase();
  if (!PROVIDERS.includes(providerArg as AiProviderName)) {
    console.error(`Unknown provider "${providerArg}". One of: ${PROVIDERS.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerArg as AiProviderName;
  const mode: ProviderSwitchMode = process.argv.includes("--tier") ? "tier" : "spread";
  const apply = process.argv.includes("--apply");

  const current = await getAllAiRoutes();
  const plan = planProviderSwitch(provider, mode);
  const planned = new Map(plan.assignments.map((a) => [a.feature, a.model]));

  console.log(`\n  Target: ${provider}   mode: ${mode}   ${apply ? "APPLY" : "dry run"}\n`);
  console.log(`  ${"feature".padEnd(24)}${"tier".padEnd(10)}${"now".padEnd(34)}next`);
  console.log(`  ${"-".repeat(94)}`);

  for (const row of current) {
    const tier = AI_FEATURE_TIER[row.feature as Exclude<AiFeatureKey, "photoUltraEnhance">] ?? "image";
    const now = `${row.route.provider}:${row.route.model}`;
    const next = planned.get(row.feature);
    const mark = !next ? "— skip" : now === `${provider}:${next}` ? "(unchanged)" : next;
    console.log(`  ${row.feature.padEnd(24)}${tier.padEnd(10)}${now.padEnd(34)}${mark}`);
  }

  const buckets = new Set(plan.assignments.map((a) => a.model));
  console.log(`\n  ${plan.assignments.length} features → ${provider}, across ${buckets.size} model(s):`);
  for (const model of buckets) {
    const features = plan.assignments.filter((a) => a.model === model).map((a) => a.feature);
    console.log(`    ${model.padEnd(30)} ${features.length}  ${features.join(", ")}`);
  }
  for (const s of plan.skipped) console.log(`\n  skipped  ${s.feature} — ${s.reason}`);

  if (!apply) {
    console.log("\n  Dry run only. Re-run with --apply to write.\n");
    return;
  }

  // The audit row needs a real actor. Falling back to a synthetic ID would put
  // an un-attributable bulk change in the log, which is the one thing the log
  // exists to prevent.
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    console.error("\n  No ADMIN user in this database — cannot attribute the audit row. Aborting.\n");
    process.exitCode = 1;
    return;
  }

  const result = await applyProviderSwitch({ provider, mode, actorId: admin.id, actorRole: admin.role });
  if (!result.ok) {
    console.error(`\n  Failed: ${result.error} — ${result.message}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n  Written. ${result.applied.length} features on ${result.provider} across ${result.modelsUsed} models,` +
      ` attributed to ${admin.fullName ?? admin.id}.\n`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
