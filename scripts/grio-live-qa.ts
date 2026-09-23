import "./_env";
import { prisma } from "../lib/db/prisma";
import { detectGrioIntent } from "../lib/services/grio/profile/intents";
import { answerProfileTurn, type ProfileTurnOutput } from "../lib/services/grio/profile/orchestrator";
import { registeredModel } from "../lib/ai/registry";
import type { AiProviderName, AiRoute } from "../lib/ai/models";
import type { GrioIntent } from "../lib/contracts/grioProfile";

/**
 * Grio's profile answers, asked for real: real profiles from the database this
 * script points at, the real orchestrator, a real model. No HTTP and no
 * session — the orchestrator is the thing under test, called exactly as
 * `/api/concierge` calls it.
 *
 *   npx tsx scripts/grio-live-qa.ts --viewer=Rohan --candidate=Neha --model=DEEPSEEK:deepseek-v4-pro
 *   npx tsx scripts/grio-live-qa.ts --viewer=Arjun --candidate=Neha --model=GEMINI:gemini-3.6-flash
 *   npx tsx scripts/grio-live-qa.ts --viewer=Rohan --candidate=Aisu --only=2,7     (a profile with no family)
 *   npx tsx scripts/grio-live-qa.ts --viewer=Rohan --candidate=Neha --memory      (follow-ups + profile switch)
 *
 * `--model=AUTO` uses the router exactly as production does.
 *
 * Writes what a real turn writes: AiInteraction rows for the viewer (which
 * count against their `grioChatPerDay`). Point it at a local database —
 * `DATABASE_URL` host is printed first so that is never a guess.
 */

const QUESTIONS = [
  "What is special about this profile for me?",
  "Family ke baare mein batao.",
  "Iske lifestyle ke baare mein batao.",
  "Hum dono mein kya common hai?",
  "Kahan difference hai?",
  "Kundali available hai?",
  "Profile mein kya missing hai?",
  "Is profile ko simple language mein summarize karo.",
  "Is person ko message start kaise karun?",
  "Is profile ke liye kaunse BandhanTak features useful hain?",
];

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function findProfile(q: string) {
  const byId = await prisma.profile.findFirst({ where: { id: { startsWith: q } }, select: { id: true, userId: true, displayName: true, gender: true } });
  if (byId) return byId;
  return prisma.profile.findFirst({
    where: { displayName: { startsWith: q, mode: "insensitive" }, deletedAt: null, isVisible: true },
    select: { id: true, userId: true, displayName: true, gender: true },
    orderBy: { createdAt: "asc" },
  });
}

function show(q: string, out: ProfileTurnOutput) {
  const t = out.trace;
  const m = t?.model;
  console.log(`\n━━ Q: ${q}`);
  console.log(
    `   intent=${out.intent}  answeredBy=${out.answeredBy ?? "-"}  ok=${out.ok}` +
      (m ? `  model=${m.answeredBy ?? "none"}${m.fallbackUsed ? " (fallback)" : ""}  ${m.totalLatencyMs}ms` : "") +
      (t ? `  total=${t.totalLatencyMs}ms  ~${t.approxInputTokens} tok in` : ""),
  );
  if (m && m.attempts.length > 1) {
    console.log(`   attempts: ${m.attempts.map((a) => `${a.model} ${a.outcome}${a.httpStatus ? ` ${a.httpStatus}` : ""} ${a.latencyMs}ms`).join(" → ")}`);
  }
  if (t?.errorCategory) console.log(`   error: ${t.errorCategory}`);
  if (out.evidence) {
    console.log(`   evidence: ${out.evidence.groups.map((g) => `${g.label} ${g.rows.length}`).join(" · ")}`);
  }
  if (out.actions?.length) console.log(`   actions: ${out.actions.map((a) => a.label).join(" | ")}`);
  if (out.followUps?.length) console.log(`   chips: ${out.followUps.map((s) => s.label).join(" | ")}`);
  if (out.sendTarget) console.log(`   sendTarget: ${out.sendTarget.name}`);
  console.log(`   ─ reply ─\n${(out.reply ?? out.message ?? "").split("\n").map((l) => `   │ ${l}`).join("\n")}`);
}

async function main() {
  const host = (process.env.DATABASE_URL ?? "").replace(/^[^@]*@/, "").replace(/[/?].*$/, "");
  console.log(`DB: ${host}`);
  if (!host.startsWith("localhost") && !process.argv.includes("--allow-remote")) {
    console.error("Refusing to write test turns to a non-local database. Pass --allow-remote if you really mean it.");
    process.exitCode = 1;
    return;
  }

  const viewer = await findProfile(arg("viewer") ?? "Rohan");
  const candidate = await findProfile(arg("candidate") ?? "Neha");
  if (!viewer || !candidate) {
    console.error("viewer/candidate not found");
    process.exitCode = 1;
    return;
  }
  const modelArg = arg("model") ?? "AUTO";
  let override: AiRoute | null = null;
  if (modelArg !== "AUTO") {
    const [provider, ...rest] = modelArg.split(":");
    const model = rest.join(":");
    if (!registeredModel(provider as AiProviderName, model)) throw new Error(`unknown model ${modelArg}`);
    override = { provider: provider as AiProviderName, model };
  }
  console.log(`viewer: ${viewer.displayName} (${viewer.gender})  →  candidate: ${candidate.displayName} (${candidate.gender})  model: ${modelArg}`);

  const turns: { role: "user" | "assistant"; content: string }[] = [];
  let lastIntent: GrioIntent | null = null;
  const ask = async (question: string, profileId: string) => {
    turns.push({ role: "user", content: question });
    const t0 = Date.now();
    const detected = detectGrioIntent(question, { previousIntent: lastIntent });
    const out = await answerProfileTurn({
      viewerUserId: viewer.userId,
      profileId,
      question,
      recentTurns: [...turns],
      detected,
      intentMs: Date.now() - t0,
      override,
      debug: true,
    });
    turns.push({ role: "assistant", content: out.reply ?? out.message ?? "" });
    lastIntent = out.intent;
    show(question, out);
    return out;
  };

  if (process.argv.includes("--memory")) {
    console.log("\n=== Conversation memory: follow-ups stay on the same profile ===");
    await ask("Is profile mein mere liye kya special hai?", candidate.id);
    await ask("Family?", candidate.id);
    await ask("And lifestyle?", candidate.id);
    await ask("aur batao", candidate.id);

    const other = await findProfile(arg("switch") ?? "Sneha");
    if (other) {
      console.log(`\n=== Profile switch: ${candidate.displayName} → ${other.displayName} (turns reset, as the client does) ===`);
      turns.length = 0;
      lastIntent = null;
      const out = await ask("Family?", other.id);
      const mentionsOld = (out.reply ?? "").includes(candidate.displayName ?? "∅∅");
      console.log(`\n   switch check: reply mentions previous profile's name? ${mentionsOld ? "YES — BUG" : "no ✓"}`);
    }
    return;
  }

  const only = arg("only")?.split(",").map((n) => Number(n) - 1);
  for (const [i, q] of QUESTIONS.entries()) {
    if (only && !only.includes(i)) continue;
    await ask(q, candidate.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
