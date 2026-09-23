import "./_env";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db/prisma";
import { callAi } from "../lib/ai/providers";
import { invalidateCredentialCache } from "../lib/ai/credentials";
import { clearProviderHealth } from "../lib/ai/health";
import { detectGrioIntent } from "../lib/services/grio/profile/intents";
import { answerProfileTurn } from "../lib/services/grio/profile/orchestrator";
import type { AiRoute } from "../lib/ai/models";

/**
 * Grio under failure, for real: the conditions the product must survive,
 * produced against the local database and the real providers.
 *
 *   npx tsx scripts/grio-failure-drills.ts            every drill
 *   npx tsx scripts/grio-failure-drills.ts --only=key,timeout
 *
 * Every drill states what a member must see and what a developer must be able
 * to read, and checks both. Refuses to run against a non-local database: two
 * drills write (a temporary block row, AI interaction logs) and clean up after
 * themselves.
 */

let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean);
const want = (name: string) => only.length === 0 || only.includes(name);

async function profileNamed(name: string) {
  return prisma.profile.findFirst({
    where: { displayName: { startsWith: name, mode: "insensitive" }, deletedAt: null, isVisible: true },
    select: { id: true, userId: true, displayName: true },
    orderBy: { createdAt: "asc" },
  });
}

async function turn(viewerUserId: string, profileId: string, question: string, override: AiRoute | null = null) {
  const detected = detectGrioIntent(question);
  return answerProfileTurn({
    viewerUserId,
    profileId,
    question,
    recentTurns: [{ role: "user", content: question }],
    detected,
    intentMs: 0,
    override,
    debug: true,
  });
}

const SAFE = (msg: string) => !/\b\d{3}\b|gemini|deepseek|anthropic|openai|api key|invalid_argument|credit balance/i.test(msg);

async function main() {
  const host = (process.env.DATABASE_URL ?? "").replace(/^[^@]*@/, "").replace(/[/?].*$/, "");
  console.log(`DB: ${host}`);
  if (!host.startsWith("localhost")) {
    console.error("Refusing: drills write test rows; point DATABASE_URL at the local database.");
    process.exitCode = 1;
    return;
  }

  const rohan = await profileNamed("Rohan Sharma");
  const neha = await profileNamed("Neha Sharma");
  const aisu = await profileNamed("Aisu");
  const noPref = await profileNamed("Dev NoPref");
  const aditya = await profileNamed("Aditya Rao");
  if (!rohan || !neha || !aisu || !noPref || !aditya) throw new Error("fixture profiles missing from this database");

  if (want("missing")) {
    console.log("\n1. A profile id that does not exist");
    const out = await turn(rohan.userId, randomUUID(), "Family?");
    expect("member reads 'not available', nothing else", !out.ok && out.message === "Ye profile abhi available nahi hai.", out.message);
    expect("developer sees why", out.trace?.errorCategory === "PROFILE_NOT_FOUND", out.trace?.errorCategory ?? "");
  }

  if (want("blocked")) {
    console.log("\n2. A blocked profile (temporary block row, removed afterwards)");
    const row = await prisma.userBlock.create({ data: { blockerUserId: neha.userId, blockedUserId: rohan.userId, reason: "grio drill" } });
    try {
      const out = await turn(rohan.userId, neha.id, "Is profile me mere liye kya khaas hai?");
      expect("blocked either way → the same 'not available' sentence", !out.ok && out.message === "Ye profile abhi available nahi hai.");
      expect("…and the member is not told who blocked whom", !/block/i.test(out.message ?? ""));
      expect("developer sees PROFILE_BLOCKED", out.trace?.errorCategory === "PROFILE_BLOCKED");
    } finally {
      await prisma.userBlock.delete({ where: { id: row.id } });
    }
  }

  if (want("family")) {
    console.log("\n3. A profile with no family details");
    const out = await turn(rohan.userId, aisu.id, "Family ke baare mein batao.");
    expect("answered by code, no model", out.answeredBy === "code" && out.trace?.model === null);
    expect("says family details are not available", (out.reply ?? "").includes("available nahi hain"), out.reply);
  }

  if (want("noprefs")) {
    console.log("\n4. A viewer who never stated a preference");
    const out = await turn(noPref.userId, neha.id, "Is profile me mere liye kya khaas hai?", { provider: "DEEPSEEK", model: "deepseek-v4-pro" });
    expect("the evidence card says why there is no preference comparison", Boolean(out.evidence?.footnote?.includes("preference")), out.evidence?.footnote ?? "");
    expect("no preference rows were invented", !(out.evidence?.groups ?? []).some((g) => g.rows.some((r) => r.kind === "preference")));
    expect("reply does not claim a preference match", !/aapki pasand ke hisaab/i.test(out.reply ?? ""), out.reply);
  }

  if (want("key")) {
    console.log("\n5. Invalid API keys on every configured provider");
    const saved = { g: process.env.GEMINI_API_KEY, d: process.env.DEEPSEEK_API_KEY, a: process.env.ANTHROPIC_API_KEY };
    process.env.GEMINI_API_KEY = "AIzaSy-this-key-is-not-valid-000000000";
    process.env.DEEPSEEK_API_KEY = "sk-this-key-is-not-valid";
    process.env.ANTHROPIC_API_KEY = "sk-ant-this-key-is-not-valid";
    invalidateCredentialCache();
    try {
      const r = await callAi({
        configFeature: "matchExplain",
        logFeature: "drill_invalid_key",
        userId: null,
        system: "x",
        content: "ok",
        maxTokens: 16,
        thinking: "off",
        subject: "Grio",
      });
      const outcomes = r.trace.attempts.map((a) => a.outcome);
      expect("the call fails", !r.ok);
      expect("each attempt is classified MODEL_AUTH_FAILED", outcomes.length > 0 && outcomes.every((o) => o === "MODEL_AUTH_FAILED"), outcomes.join(","));
      expect("the member-facing message is safe", !r.ok && SAFE(r.message), r.ok ? "" : r.message);
      const out = await turn(aditya.userId, neha.id, "Iske lifestyle ke baare mein batao.");
      expect("a profile turn still answers from code", out.ok && out.answeredBy === "code-fallback", `${out.answeredBy}`);
      expect("…with real facts (Music is on the profile)", (out.reply ?? "").includes("Music"), out.reply);
    } finally {
      process.env.GEMINI_API_KEY = saved.g;
      process.env.DEEPSEEK_API_KEY = saved.d;
      process.env.ANTHROPIC_API_KEY = saved.a;
      invalidateCredentialCache();
      // What saving a key from /admin/ai-settings now does (credentials.ts):
      // the old key's 401s say nothing about the restored one.
      for (const p of ["GEMINI", "DEEPSEEK", "ANTHROPIC"] as const) clearProviderHealth(p);
    }
  }

  if (want("timeout")) {
    console.log("\n6. A provider slower than the budget (5 ms per attempt)");
    const r = await callAi({
      configFeature: "matchExplain",
      logFeature: "drill_timeout",
      userId: null,
      system: "x",
      content: "ok",
      maxTokens: 16,
      thinking: "off",
      timeoutMs: 5,
      override: { provider: "DEEPSEEK", model: "deepseek-flash" },
    });
    expect("classified MODEL_TIMEOUT (or a dropped connection), not a generic failure", !r.ok && ["MODEL_TIMEOUT", "MODEL_NETWORK_ERROR"].includes(r.category), r.ok ? "ok?!" : r.category);
    expect("…and the member reads the timeout sentence", !r.ok && /der lag gayi/.test(r.message), r.ok ? "" : r.message);
  }

  if (want("quota")) {
    console.log("\n7. An account with no credit (Anthropic, live)");
    const r = await callAi({
      configFeature: "matchExplain",
      logFeature: "drill_quota",
      userId: null,
      system: "x",
      content: "ok",
      maxTokens: 16,
      thinking: "off",
      override: { provider: "ANTHROPIC", model: "claude-haiku-4-5" },
      subject: "Grio",
    });
    expect("classified MODEL_QUOTA_EXCEEDED (not BAD_REQUEST)", !r.ok && r.category === "MODEL_QUOTA_EXCEEDED", r.ok ? "funded?" : `${r.category} ${r.httpStatus}`);
    expect("the member does not read 'credit balance'", !r.ok && SAFE(r.message), r.ok ? "" : r.message);
  }

  if (want("auto")) {
    console.log("\n8. AUTO — the router as production runs it (matchExplain's saved route first)");
    const out = await turn(aditya.userId, neha.id, "Is profile me mere liye kya khaas hai?");
    const m = out.trace?.model;
    console.log(`     primary ${m?.primary} → answered by ${m?.answeredBy ?? "none"}  ${m?.attempts.map((a) => `${a.model} ${a.outcome}${a.httpStatus ? ` ${a.httpStatus}` : ""}`).join(" → ")}`);
    for (const s of m?.skipped ?? []) console.log(`     skipped ${s.model}: ${s.reason}`);
    expect("the member got an answer", out.ok && Boolean(out.reply));
    expect("a model answered, or code did and says so", out.answeredBy === "ai" || out.answeredBy === "code-fallback" || out.answeredBy === "code");
  }

  console.log(`\n${failures === 0 ? "all drills passed" : `${failures} drill check(s) failed`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
