import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { sendInterest } from "@/lib/services/match/sendInterest";

export const runtime = "nodejs";

/**
 * Add to my own shortlist from outside the reel.
 *
 * The swipe-down was the only way in, and the reel never re-shows a profile —
 * so a profile reached by link or from Matches could not be saved at all.
 * Idempotent, so a double tap is not an error.
 */
export async function PUT(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  const target = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { userId: true, isVisible: true, profileStatus: true, deletedAt: true },
  });

  if (!target || target.deletedAt || !target.isVisible || target.profileStatus === "DRAFT") {
    return NextResponse.json({ error: "NOT_FOUND", message: "Profile nahi mila." }, { status: 404 });
  }

  if (target.userId === user.id) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Apni hi profile shortlist nahi kar sakte." }, { status: 400 });
  }

  await prisma.shortlist.upsert({
    where: { userId_targetProfileId: { userId: user.id, targetProfileId: profileId } },
    create: { userId: user.id, targetProfileId: profileId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

/** Remove from my own shortlist. Scoped to the caller — you can only unsave your own row. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  const deleted = await prisma.shortlist.deleteMany({
    where: { userId: user.id, targetProfileId: profileId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye profile aapki shortlist me nahi hai." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Send an interest to someone sitting in the shortlist.
 *
 * Without this the shortlist would be a read-only museum: the reel never
 * re-shows a profile you've already swiped, so a saved profile had no path
 * left to an interest at all.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  // Only from your own shortlist — this endpoint must not become a way to
  // send an interest to an arbitrary profile id.
  const saved = await prisma.shortlist.findFirst({
    where: { userId: user.id, targetProfileId: profileId },
    select: { targetProfile: { select: { userId: true } } },
  });

  if (!saved) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye profile aapki shortlist me nahi hai." }, { status: 404 });
  }

  if (saved.targetProfile.userId === user.id) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Apne aap ko interest nahi bhej sakte." }, { status: 400 });
  }

  const result = await sendInterest(user.id, saved.targetProfile.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true, matched: result.matched, matchId: result.matchId });
}
