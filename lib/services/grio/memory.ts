import "server-only";
import { prisma } from "@/lib/db/prisma";
import { GRIO_MEMORY_MAX_FACTS, GRIO_MEMORY_MAX_FACT_LENGTH } from "@/lib/contracts/grio";

/**
 * Grio's memory — doc 11 §3.5, guardrail §7.4.
 *
 * Everything here is deliberately dumb: a capped list of strings the user can
 * read and delete. The interesting decision is what is *absent*.
 *
 * There is no server-side "extract facts from this conversation" step. The
 * model can propose a fact (`<<<ACT:remember:…>>>`), but proposing renders a
 * button and nothing more — the row is only written after a tap, on a request
 * the user made. That keeps memory on the same footing as every other action
 * in this layer, and it is what makes §7.4 ("memory kabhi inference store
 * nahi karegi") enforceable rather than aspirational: an inference the user
 * declines to save is simply never saved.
 *
 * Dedupe is case-insensitive, and a full list drops its oldest entry rather
 * than rejecting the write. Refusing a save because a hidden cap was hit would
 * make the button lie about what it does; forgetting the oldest thing is what
 * the user already expects "remember this" to mean.
 *
 * ## How many facts, and why reads are never capped
 *
 * The limit is now per-plan (`grioMemoryFacts`, lib/constants/plans.ts) rather
 * than one number for everybody. The important consequence is a rule this file
 * enforces and nothing else can:
 *
 *   **The plan cap applies to writes only. Reads return everything stored.**
 *
 * `getMemory` used to run the same `sanitize` as the write path, which was
 * harmless while the cap was a constant and becomes data loss the moment it
 * varies: a user who saved 40 facts on Premium and then downgraded would open
 * the panel to find 32 of them gone — silently, and with no way back, because
 * the next write would persist the truncated list. A plan change may decide
 * what you can add. It may not delete what you already said.
 *
 * `GRIO_MEMORY_MAX_FACTS` still applies on both paths as the absolute ceiling;
 * it is a storage bound, not a price.
 */

/** Shape/length hygiene only — no count limit. Applied to every read and write. */
function sanitize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.trim().slice(0, GRIO_MEMORY_MAX_FACT_LENGTH))
    .filter(Boolean)
    .slice(0, GRIO_MEMORY_MAX_FACTS);
}

export async function getMemory(userId: string): Promise<string[]> {
  const row = await prisma.grioMemory.findUnique({ where: { userId }, select: { facts: true } });
  return sanitize(row?.facts);
}

async function writeMemory(userId: string, facts: string[]): Promise<string[]> {
  const clean = sanitize(facts);
  await prisma.grioMemory.upsert({
    where: { userId },
    create: { userId, facts: clean },
    update: { facts: clean },
  });
  return clean;
}

/**
 * `maxFacts` is the caller's plan limit — resolve it from `getEntitlements`,
 * never from the constant, or every plan gets the ceiling.
 *
 * A user already at or over their limit does not lose an older fact to make
 * room: they are told no. That is the one place this file departs from
 * "forgetting the oldest is what the user expects" — dropping a fact because
 * someone *downgraded* is not forgetting, it is the product taking something
 * back, and the honest version of that is a refusal the user can see.
 */
export type AddMemoryResult =
  | { ok: true; facts: string[] }
  | { ok: false; reason: "full"; facts: string[]; limit: number };

export async function addMemoryFact(
  userId: string,
  fact: string,
  maxFacts: number,
): Promise<AddMemoryResult> {
  const value = fact.trim().slice(0, GRIO_MEMORY_MAX_FACT_LENGTH);
  const existing = await getMemory(userId);
  if (!value) return { ok: true, facts: existing };

  // A duplicate is a no-op, not a rejection — and it must be checked before the
  // cap, or a full list would refuse to "save" something it already holds.
  if (existing.some((f) => f.toLowerCase() === value.toLowerCase())) {
    return { ok: true, facts: existing };
  }

  const limit = Math.min(maxFacts, GRIO_MEMORY_MAX_FACTS);
  if (existing.length >= limit) {
    return { ok: false, reason: "full", facts: existing, limit };
  }

  return { ok: true, facts: await writeMemory(userId, [...existing, value]) };
}

export async function removeMemoryFact(userId: string, fact: string): Promise<string[]> {
  const existing = await getMemory(userId);
  return writeMemory(
    userId,
    existing.filter((f) => f !== fact),
  );
}

export async function clearMemory(userId: string): Promise<string[]> {
  return writeMemory(userId, []);
}

/** The block injected into Grio's system prompt. Empty string when nothing is remembered. */
export function formatMemory(facts: string[]): string {
  if (facts.length === 0) return "";
  return facts.map((f) => `- ${f}`).join("\n");
}
