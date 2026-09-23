import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { buildGrioProfileCards } from "@/lib/services/grio/cards";
import { GRIO_CARDS_MAX, type GrioCardsResponse } from "@/lib/contracts/grioCards";

export const runtime = "nodejs";

/**
 * `POST /api/grio/cards` — the faces behind a `<<<SHOW:>>>`, a focus hop, or a
 * `<<<FIND:>>>` result, for the chat to render.
 *
 * Client-called on purpose: the model's reply carries only ordinals, the client
 * resolves them against the roster the server returned, and only then asks for
 * pictures. So no attribute of anybody is ever in a prompt — the model points,
 * code shows. Every card is re-checked here (see `buildGrioProfileCards`)
 * because the ids arrive from a browser.
 */
const BodySchema = z.object({ profileIds: z.array(z.string().min(1)).min(1).max(GRIO_CARDS_MAX) }).strict();

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Profiles chahiye." } satisfies GrioCardsResponse, { status: 422 });
  }

  const cards = await buildGrioProfileCards(user.id, parsed.data.profileIds);
  return NextResponse.json({ ok: true, cards } satisfies GrioCardsResponse);
}
