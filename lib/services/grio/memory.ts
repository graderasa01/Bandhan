import "server-only";
import { prisma } from "@/lib/db/prisma";
import { GRIO_MEMORY_MAX_FACTS, GRIO_MEMORY_MAX_FACT_LENGTH } from "@/lib/contracts/grio";
import type { GrioMemoryKind, SignalSource } from "@prisma/client";

/**
 * Grio's memory — doc 11 §3.5, guardrail §7.4.
 *
 * The original version was a capped list of strings, and the interesting
 * decision was what it left out: there is no server-side "extract facts from
 * this conversation" step. The model can propose a fact
 * (`<<<ACT:remember:…>>>`), but proposing renders a button and nothing more —
 * the row is only written after a tap, on a request the user made. That keeps
 * memory on the same footing as every other action in this layer, and it is
 * what makes §7.4 ("memory kabhi inference store nahi karegi") enforceable
 * rather than aspirational.
 *
 * All of that still holds. What changed is the shape.
 *
 * ## Why flat strings stopped being enough
 *
 * Two entries could contradict each other and the store had no way to say so:
 *
 *     Bangalore preferred          (said in June)
 *     Mumbai bhi theek hai         (said in August)
 *
 * Both went into the prompt as equally live facts, and the model picked. It
 * usually picked the recent one, which made the bug invisible until the turn it
 * did not. Those are not two preferences — they are one preference that
 * changed, and saying so needs a `kind`, a timestamp, and a link between them.
 *
 * ## Supersession is explicit and non-destructive
 *
 * `supersedesId` is set because somebody said "this replaces that": the user
 * tapping Update in the panel. Nothing here infers a conflict from the text.
 * Similarity matching would be right often enough to ship and would sometimes
 * delete a memory the user never asked to lose, and there is no undo for that.
 *
 * The replaced row is marked (`replacedAt`), never deleted. "What did I used to
 * think" stays answerable; only live rows reach the model.
 *
 * ## Reads are never capped, writes are
 *
 * The plan cap (`grioMemoryFacts`) applies to *new* entries only. A user who
 * saved 40 on Premium and downgraded still sees all 40 — a plan change may
 * decide what you can add, it may not delete what you already said. That rule
 * predates this rewrite and survives it unchanged; `GRIO_MEMORY_MAX_FACTS`
 * remains the absolute ceiling above whatever the plan allows.
 */

export interface GrioMemoryEntryView {
  id: string;
  body: string;
  kind: GrioMemoryKind;
  source: SignalSource;
  confirmed: boolean;
  createdAt: string;
  expiresAt: string | null;
  /** The body of the entry this one replaced, when it replaced one. */
  replaces: string | null;
}

/**
 * Live memory: not replaced, not expired.
 *
 * Expiry is evaluated on read rather than swept by a job. A TEMPORARY_CONTEXT
 * whose date has passed is wrong the instant it passes, and "wrong until the
 * nightly job runs" is not a state a matrimony assistant should be able to
 * enter. The index is `(userId, replacedAt)` so this stays one indexed read.
 */
function liveWhere(userId: string) {
  return {
    userId,
    replacedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

function toView(row: {
  id: string;
  body: string;
  kind: GrioMemoryKind;
  source: SignalSource;
  confirmed: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  supersedes: { body: string } | null;
}): GrioMemoryEntryView {
  return {
    id: row.id,
    body: row.body,
    kind: row.kind,
    source: row.source,
    confirmed: row.confirmed,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    replaces: row.supersedes?.body ?? null,
  };
}

export async function getMemoryEntries(userId: string): Promise<GrioMemoryEntryView[]> {
  const rows = await prisma.grioMemoryEntry.findMany({
    where: liveWhere(userId),
    orderBy: { createdAt: "asc" },
    take: GRIO_MEMORY_MAX_FACTS,
    include: { supersedes: { select: { body: true } } },
  });
  return rows.map(toView);
}

/**
 * The plain-string view, kept because three callers only ever wanted the words:
 * the `remember` dedupe check, the memory panel's existing contract, and
 * `formatMemory`. Deriving it here rather than at each call site means the
 * "which entries are live" rule has one implementation.
 */
export async function getMemory(userId: string): Promise<string[]> {
  return (await getMemoryEntries(userId)).map((e) => e.body);
}

export type AddMemoryResult =
  | { ok: true; entries: GrioMemoryEntryView[] }
  | { ok: false; reason: "full"; entries: GrioMemoryEntryView[]; limit: number };

export interface AddMemoryInput {
  kind?: GrioMemoryKind;
  /** Marks an existing entry replaced. Ignored when it is not this user's. */
  supersedesId?: string | null;
  /** Required in practice for TEMPORARY_CONTEXT — see `resolveExpiry`. */
  expiresAt?: Date | null;
  source?: SignalSource;
  confirmed?: boolean;
}

/**
 * A TEMPORARY_CONTEXT with no expiry is a permanent memory wearing the wrong
 * label — "agle mahine Mumbai me hoon" is actively misleading a year later. So
 * the kind implies a default horizon when the caller does not set one, rather
 * than silently becoming permanent.
 */
const TEMPORARY_DEFAULT_DAYS = 30;

function resolveExpiry(kind: GrioMemoryKind, explicit: Date | null | undefined): Date | null {
  if (explicit) return explicit;
  if (kind !== "TEMPORARY_CONTEXT") return null;
  return new Date(Date.now() + TEMPORARY_DEFAULT_DAYS * 86_400_000);
}

/**
 * `maxEntries` is the caller's plan limit — resolve it from `getEntitlements`,
 * never from the constant, or every plan gets the ceiling.
 *
 * A user at their limit is told no rather than losing their oldest entry.
 * Dropping something because somebody *downgraded* is not forgetting, it is the
 * product taking a thing back, and the honest version of that is a refusal the
 * user can see.
 *
 * **Replacing does not count against the cap.** A supersede is a net-zero
 * change to live memory — one row in, one row out — so refusing it at the limit
 * would strand a full-memory user with an outdated preference they are not
 * allowed to correct. That is the one case where the cap would actively make
 * the memory worse.
 */
export async function addMemoryEntry(
  userId: string,
  body: string,
  maxEntries: number,
  input: AddMemoryInput = {},
): Promise<AddMemoryResult> {
  const value = body.trim().slice(0, GRIO_MEMORY_MAX_FACT_LENGTH);
  if (!value) return { ok: true, entries: await getMemoryEntries(userId) };

  const kind = input.kind ?? "FACT";

  // Ownership before anything else: a `supersedesId` from another user's memory
  // is dropped, not honoured, and the entry is still saved as a new one.
  const target = input.supersedesId
    ? await prisma.grioMemoryEntry.findFirst({
        where: { id: input.supersedesId, userId, replacedAt: null },
        select: { id: true },
      })
    : null;

  const existing = await getMemoryEntries(userId);

  // A duplicate is a no-op, not a rejection — and it is checked before the cap,
  // or a full list would refuse to "save" something it already holds. Skipped
  // when replacing: re-stating a memory in order to supersede a different one
  // is a real edit, not a duplicate.
  if (!target && existing.some((e) => e.body.toLowerCase() === value.toLowerCase())) {
    return { ok: true, entries: existing };
  }

  const limit = Math.min(maxEntries, GRIO_MEMORY_MAX_FACTS);
  if (!target && existing.length >= limit) {
    return { ok: false, reason: "full", entries: existing, limit };
  }

  await prisma.$transaction(async (tx) => {
    await tx.grioMemoryEntry.create({
      data: {
        userId,
        body: value,
        kind,
        source: input.source ?? "USER_ENTERED",
        confirmed: input.confirmed ?? true,
        expiresAt: resolveExpiry(kind, input.expiresAt),
        supersedesId: target?.id ?? null,
      },
    });
    if (target) {
      await tx.grioMemoryEntry.update({
        where: { id: target.id },
        data: { replacedAt: new Date() },
      });
    }
  });

  return { ok: true, entries: await getMemoryEntries(userId) };
}

/** Back-compat wrapper for the callers that only ever passed a string. */
export async function addMemoryFact(
  userId: string,
  fact: string,
  maxFacts: number,
): Promise<{ ok: true; facts: string[] } | { ok: false; reason: "full"; facts: string[]; limit: number }> {
  const result = await addMemoryEntry(userId, fact, maxFacts);
  return result.ok
    ? { ok: true, facts: result.entries.map((e) => e.body) }
    : { ok: false, reason: "full", facts: result.entries.map((e) => e.body), limit: result.limit };
}

/**
 * A user deleting their own memory is a real delete, not a soft one.
 *
 * This is the opposite decision from supersession, and deliberately: replacing
 * keeps history because the user said "this is now different", which implies
 * there *was* a before. Deleting means "I never want you to know this", and
 * honouring that with a hidden row would be the app quietly disagreeing.
 */
export async function removeMemoryEntry(userId: string, id: string): Promise<GrioMemoryEntryView[]> {
  await prisma.grioMemoryEntry.deleteMany({ where: { id, userId } });
  return getMemoryEntries(userId);
}

/** Body-based delete, for the panel's existing contract. Removes every match. */
export async function removeMemoryFact(userId: string, fact: string): Promise<string[]> {
  await prisma.grioMemoryEntry.deleteMany({ where: { userId, body: fact } });
  return getMemory(userId);
}

export async function clearMemory(userId: string): Promise<string[]> {
  await prisma.grioMemoryEntry.deleteMany({ where: { userId } });
  return [];
}

/* ------------------------------------------------------------------ */
/* The block injected into Grio's prompt                               */
/* ------------------------------------------------------------------ */

/**
 * How each kind is introduced to the model.
 *
 * Grouped rather than listed flat because the kinds want different treatment
 * and saying so once per group is cheaper — and clearer — than a tag per line.
 * A BOUNDARY is not a preference to weigh against others; a GOAL is a thing to
 * measure suggestions against; a TEMPORARY_CONTEXT is true today and should not
 * shape long-term advice.
 */
const KIND_HEADING: Record<GrioMemoryKind, string> = {
  FACT: "Ye baatein user ne apne baare me batayi hain",
  PREFERENCE: "Ye unki pasand hai (badal sakti hai — agar purani lage to poochh lijiye)",
  BOUNDARY: "Ye unki saaf lakeer hai — ise tolne ki koshish mat kijiye",
  GOAL: "Ye wo hasil karna chahte hain",
  RELATIONSHIP_NOTE: "Ye kisi ek rishtey ke baare me unka apna note hai",
  TEMPORARY_CONTEXT: "Ye abhi ke liye sach hai (aage badal jayega — lambi salah isse mat baandhiye)",
};

const KIND_ORDER: GrioMemoryKind[] = [
  "BOUNDARY",
  "GOAL",
  "PREFERENCE",
  "FACT",
  "RELATIONSHIP_NOTE",
  "TEMPORARY_CONTEXT",
];

/**
 * Empty string when nothing is remembered — callers skip the block entirely
 * rather than printing an empty heading.
 *
 * A superseded entry never reaches here (it is filtered at the query), but the
 * *fact* that something was replaced does: "pehle X kaha tha" is exactly the
 * context that stops Grio treating a corrected preference as a fresh surprise.
 */
export function formatMemoryEntries(entries: GrioMemoryEntryView[]): string {
  if (entries.length === 0) return "";

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    rows: entries.filter((e) => e.kind === kind),
  })).filter((g) => g.rows.length > 0);

  return groups
    .map((g) => {
      const lines = g.rows
        .map((e) => {
          const replaced = e.replaces ? ` (pehle "${e.replaces}" kaha tha — ab ye)` : "";
          const unconfirmed = e.confirmed ? "" : " [user ne ise abhi confirm nahi kiya]";
          return `- ${e.body}${replaced}${unconfirmed}`;
        })
        .join("\n");
      return `${KIND_HEADING[g.kind]}:\n${lines}`;
    })
    .join("\n\n");
}

/** String-list overload kept for callers that never had typed entries. */
export function formatMemory(facts: string[]): string {
  if (facts.length === 0) return "";
  return facts.map((f) => `- ${f}`).join("\n");
}
