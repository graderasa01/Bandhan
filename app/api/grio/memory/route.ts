import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { addMemoryFact, clearMemory, getMemory, removeMemoryFact } from "@/lib/services/grio/memory";
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

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({ ok: true, facts: await getMemory(user.id) } satisfies GrioMemoryResponse);
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

  return NextResponse.json({
    ok: true,
    facts: await addMemoryFact(user.id, parsed.data.fact),
  } satisfies GrioMemoryResponse);
}

/** `?fact=…` removes one; no param clears everything. */
export async function DELETE(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const fact = new URL(req.url).searchParams.get("fact");
  const facts = fact ? await removeMemoryFact(user.id, fact) : await clearMemory(user.id);

  return NextResponse.json({ ok: true, facts } satisfies GrioMemoryResponse);
}
