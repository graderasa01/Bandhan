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
 */

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

export async function addMemoryFact(userId: string, fact: string): Promise<string[]> {
  const value = fact.trim().slice(0, GRIO_MEMORY_MAX_FACT_LENGTH);
  if (!value) return getMemory(userId);

  const existing = await getMemory(userId);
  if (existing.some((f) => f.toLowerCase() === value.toLowerCase())) return existing;

  // Oldest out when full — see docstring.
  const next = [...existing, value].slice(-GRIO_MEMORY_MAX_FACTS);
  return writeMemory(userId, next);
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
