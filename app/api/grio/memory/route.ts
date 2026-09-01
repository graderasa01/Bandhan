import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import {
  addMemoryEntry,
  clearMemory,
  getMemoryEntries,
  removeMemoryEntry,
  removeMemoryFact,
  type GrioMemoryEntryView,
} from "@/lib/services/grio/memory";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import {
  GRIO_MEMORY_KINDS,
  GRIO_MEMORY_MAX_FACT_LENGTH,
  type GrioMemoryItem,
  type GrioMemoryResponse,
} from "@/lib/contracts/grio";

export const runtime = "nodejs";

/**
 * Grio's memory, owner-only in every direction — there is no route here that
 * reads or writes anyone but the caller, and no admin surface at all. A
 * support agent being able to read what a user told their matchmaker in
 * confidence is the same class of mistake as M15's "chat content accessible to
 * NO admin role", so it is closed the same way: by not building the door.
 *
 * Writes are user-initiated only. The concierge route never calls
 * `addMemoryEntry` off the back of a model reply — a fact reaches this endpoint
 * because someone tapped "Remember this" or typed it into the panel.
 *
 * ## What typed memory added here
 *
 * `kind` and `supersedesId`, both optional and both validated. Neither can be
 * used to reach another user's data: `kind` is checked against the catalog, and
 * `supersedesId` is resolved inside `addMemoryEntry` with `userId` in the
 * `where` — an id belonging to somebody else finds no row and is dropped, and
 * the entry still saves as new rather than failing. That is deliberate: the
 * user asked to remember something, and a bad replace-target is not a reason to
 * lose the thing they typed.
 */

const AddSchema = z.object({
  fact: z.string().min(1).max(GRIO_MEMORY_MAX_FACT_LENGTH),
  kind: z.enum(GRIO_MEMORY_KINDS).optional(),
  /** The entry this replaces. Ownership is enforced in the service, not here. */
  supersedesId: z.string().min(1).optional(),
});

/** How many *new* entries this user's plan still allows. Reads are never capped. */
async function entryLimit(userId: string): Promise<number> {
  return (await getEntitlements(userId)).grioMemoryFacts;
}

/**
 * Both shapes on every response.
 *
 * `facts` is what the overlay's remember-flow and the older panel build read;
 * `items` is the typed view. Sending both costs a map over at most 40 rows and
 * removes the one failure this refactor could otherwise cause — a browser
 * holding the previous bundle asking for `facts` and getting `undefined`, which
 * renders as "you have no memories" rather than as an error.
 */
function payload(entries: GrioMemoryEntryView[], limit: number): GrioMemoryResponse {
  const items: GrioMemoryItem[] = entries.map((e) => ({
    id: e.id,
    body: e.body,
    kind: e.kind,
    confirmed: e.confirmed,
    createdAt: e.createdAt,
    expiresAt: e.expiresAt,
    replaces: e.replaces,
  }));
  return { ok: true, facts: entries.map((e) => e.body), items, limit };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [entries, limit] = await Promise.all([getMemoryEntries(user.id), entryLimit(user.id)]);
  return NextResponse.json(payload(entries, limit));
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Yaad rakhne ke liye kuch likhein." } satisfies GrioMemoryResponse,
      { status: 400 },
    );
  }

  const limit = await entryLimit(user.id);
  const result = await addMemoryEntry(user.id, parsed.data.fact, limit, {
    kind: parsed.data.kind,
    supersedesId: parsed.data.supersedesId ?? null,
  });

  // 409, not 403: nothing about the request was unauthorized — the list is
  // simply full at this plan, and the entries already saved come back with it
  // so the panel does not have to refetch to stay correct.
  if (!result.ok) {
    return NextResponse.json(
      {
        ...payload(result.entries, result.limit),
        ok: false,
        message: `Aapka plan ${result.limit} baatein yaad rakhta hai. Kuch purani hata dijiye, ya plan upgrade karein.`,
      } satisfies GrioMemoryResponse,
      { status: 409 },
    );
  }

  return NextResponse.json(payload(result.entries, limit));
}

/**
 * `?id=…` removes one entry, `?fact=…` removes by text (the older contract), and
 * no parameter clears everything.
 *
 * `fact=` is kept rather than replaced because a browser running the previous
 * bundle still sends it, and the release where the server stops understanding
 * the client it is currently serving is the release that silently breaks delete.
 */
export async function DELETE(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const fact = params.get("fact");

  const [, limit] = await Promise.all([
    id
      ? removeMemoryEntry(user.id, id)
      : fact
        ? removeMemoryFact(user.id, fact)
        : clearMemory(user.id),
    entryLimit(user.id),
  ]);

  return NextResponse.json(payload(await getMemoryEntries(user.id), limit));
}
