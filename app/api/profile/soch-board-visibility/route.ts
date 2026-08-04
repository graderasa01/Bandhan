import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { setSochBoardVisibility } from "@/lib/services/vibe/sochBoardService";

export const runtime = "nodejs";

const BodySchema = z.object({ visible: z.boolean() });

export async function PATCH(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "visible (boolean) chahiye." }, { status: 422 });
  }

  await setSochBoardVisibility(user.id, parsed.data.visible);
  return NextResponse.json({ ok: true });
}
