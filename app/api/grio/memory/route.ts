import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { addMemoryFact, clearMemory, getMemory, removeMemoryFact } from "@/lib/services/grio/memory";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { GRIO_MEMORY_MAX_FACT_LENGTH, type GrioMemoryResponse } from "@/lib/contracts/grio";

export const runtime = "nodejs";

/**
 * Grio's memory, owner-only in every direction — there is no route here that
 * reads or writes anyone but the caller, and no admin surface at all. A
 * support agent being able to read what a user told their matchmaker in
 * confidence is the same class of mistake as M15's "chat content accessible to
 * NO admin role", so it is closed the same way: by not building the door.
 *
 * Writes are user-initiated only. The concierge route never calls
 * `addMemoryFact` off the back of a model reply — a fact reaches this endpoint
 * because someone tapped "Remember this" or typed it into the panel.
 */

const AddSchema = z.object({ fact: z.string().min(1).max(GRIO_MEMORY_MAX_FACT_LENGTH) });

/** How many *new* facts this user's plan still allows. Reads are never capped. */
async function factLimit(userId: string): Promise<number> {
  return (await getEntitlements(userId)).grioMemoryFacts;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [facts, limit] = await Promise.all([getMemory(user.id), factLimit(user.id)]);
  return NextResponse.json({ ok: true, facts, limit } satisfies GrioMemoryResponse);
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

  const limit = await factLimit(user.id);
  const result = await addMemoryFact(user.id, parsed.data.fact, limit);

  // 409, not 403: nothing about the request was unauthorized — the list is
  // simply full at this plan, and the facts already saved come back with it so
  // the panel does not have to refetch to stay correct.
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        facts: result.facts,
        limit: result.limit,
        message: `Aapka plan ${result.limit} baatein yaad rakhta hai. Kuch purani hata dijiye, ya plan upgrade karein.`,
      } satisfies GrioMemoryResponse,
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, facts: result.facts, limit } satisfies GrioMemoryResponse);
}

/** `?fact=…` removes one; no param clears everything. */
export async function DELETE(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const fact = new URL(req.url).searchParams.get("fact");
  const [facts, limit] = await Promise.all([
    fact ? removeMemoryFact(user.id, fact) : clearMemory(user.id),
    factLimit(user.id),
  ]);

  return NextResponse.json({ ok: true, facts, limit } satisfies GrioMemoryResponse);
}
