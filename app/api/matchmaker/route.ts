import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { createMatchmakerRequest, getMyMatchmakerRequests } from "@/lib/services/matchmaker/matchmakerService";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

const BodySchema = z.object({ note: z.string().max(500).optional() });

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const requests = await getMyMatchmakerRequests(user.id);
  return NextResponse.json({ ok: true, requests });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const entitlements = await getEntitlements(user.id);
  if (!entitlements.assistedMatchmaker) {
    return NextResponse.json(
      { ok: false, message: "Ye feature Premium plan me shaamil hai." },
      { status: 403 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  const t = await getT();
  const result = await createMatchmakerRequest(user.id, parsed.data.note ?? null, t);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
