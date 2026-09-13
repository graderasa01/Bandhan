import { createHash } from "crypto";

/**
 * Integrity hashes for the approval gate (MKT-1 §10) and the deployment row
 * (MKT-2 §6). Pure — the check scripts pin them.
 *
 * Both hashes are *canonical*: keys are sorted at every depth, so the same
 * payload read back from Postgres — JSONB does not keep key order; it sorts
 * by key length, then bytes — hashes the same as the object the card was
 * built from. MKT-1 hashed with plain `JSON.stringify`, which only worked
 * because its six keys happened to sort the same both ways; the MKT-2
 * payloads (30 keys) do not. `legacyHashPayload` keeps those earlier cards
 * verifiable.
 */

export function hashPayload(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}

/** The MKT-1 hash — insertion-order stringify — accepted for cards written before the canonical form. */
export function legacyHashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function payloadHashMatches(payload: unknown, storedHash: string): boolean {
  return hashPayload(payload) === storedHash || legacyHashPayload(payload) === storedHash;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The exact approved normalised spec (§6.2 `specHash`): platform + spec + budgets, canonical. */
export function specHashOf(input: { platform: string; spec: unknown; dailyBudgetPaise: number | null; totalBudgetPaise: number | null }): string {
  return sha256Hex(canonicalJson({ platform: input.platform, spec: input.spec, dailyBudgetPaise: input.dailyBudgetPaise, totalBudgetPaise: input.totalBudgetPaise }));
}
