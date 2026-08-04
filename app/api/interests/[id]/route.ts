import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { createMatch } from "@/lib/services/match/confirmMutual";

export const runtime = "nodejs";

const PatchSchema = z.object({ status: z.enum(["ACCEPTED", "DECLINED"]) });

/** Recipient-only: accepting IS the reciprocation, so it creates the Match directly (no second Interest row needed). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }

  const interest = await prisma.interest.findUnique({ where: { id } });
  if (!interest || interest.toUserId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Interest nahi mila." }, { status: 404 });
  }

  await prisma.interest.update({ where: { id }, data: { status: parsed.data.status } });

  let matchId: string | null = null;
  if (parsed.data.status === "ACCEPTED") {
    const match = await createMatch(interest.fromUserId, interest.toUserId);
    matchId = match.id;
  }

  return NextResponse.json({ ok: true, matchId });
}
