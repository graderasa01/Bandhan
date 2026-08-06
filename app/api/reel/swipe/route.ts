import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { sendInterest } from "@/lib/services/match/sendInterest";

export const runtime = "nodejs";

const SwipeSchema = z.object({
  profileId: z.string().min(1),
  direction: z.enum(["LEFT", "RIGHT", "UP", "DOWN"]),
  reelId: z.string().optional(),
  // Button/keyboard swipes report 0 (instant, no drag to time) — only reject negative values.
  decisionMs: z.number().int().min(0).optional(),
  wasButton: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = SwipeSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 422 },
    );
  }
  const { profileId, direction, reelId, decisionMs, wasButton } = parsed.data;

  const candidateProfile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!candidateProfile) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Profile nahi mila." }, { status: 404 });
  }

  // RIGHT is checked before the SwipeAction is written: if the month's
  // interest quota is out, the card must not be spent either — the reel
  // never re-shows a swiped profile, so consuming it here would cost the
  // user their only shot at this candidate for something they never sent.
  if (direction === "RIGHT") {
    const result = await sendInterest(user.id, candidateProfile.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: 403 });
    }

    await prisma.swipeAction.create({
      data: { actorUserId: user.id, targetProfileId: profileId, dailyReelId: reelId, direction, decisionMs, wasButton: wasButton ?? false },
    });
    return NextResponse.json({ ok: true, matched: result.matched, matchId: result.matchId });
  }

  await prisma.swipeAction.create({
    data: {
      actorUserId: user.id,
      targetProfileId: profileId,
      dailyReelId: reelId,
      direction,
      decisionMs,
      wasButton: wasButton ?? false,
    },
  });

  if (direction === "DOWN") {
    await prisma.shortlist.upsert({
      where: { userId_targetProfileId: { userId: user.id, targetProfileId: profileId } },
      create: { userId: user.id, targetProfileId: profileId },
      update: {},
    });
  }

  // LEFT/UP/DOWN never match — RIGHT (the only direction that can) already returned above.
  return NextResponse.json({ ok: true, matched: false, matchId: null });
}
