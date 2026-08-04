import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { prisma } from "@/lib/db/prisma";
import { sendInterest } from "@/lib/services/match/sendInterest";

export const runtime = "nodejs";

const BodySchema = z.object({ profileId: z.string().min(1) });

/**
 * Send an interest from the profile page.
 *
 * The two existing paths are both scoped to a context — the reel's RIGHT swipe
 * needs a card in today's reel, and `/api/shortlist/[id]` needs a saved row —
 * so neither works from a profile opened by link. All three call the same
 * `sendInterest()`, which owns the mutual-match transition.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Profile chahiye." }, { status: 422 });
  }

  const target = await prisma.profile.findUnique({
    where: { id: parsed.data.profileId },
    select: { userId: true, isVisible: true, profileStatus: true, deletedAt: true },
  });

  // An unpublished profile can't receive an interest — the same rule the
  // profile page applies when deciding whether it exists for this viewer.
  if (!target || target.deletedAt || !target.isVisible || target.profileStatus === "DRAFT") {
    return NextResponse.json({ error: "NOT_FOUND", message: "Profile nahi mila." }, { status: 404 });
  }

  if (target.userId === user.id) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Apne aap ko interest nahi bhej sakte." }, { status: 400 });
  }

  const result = await sendInterest(user.id, target.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true, matched: result.matched, matchId: result.matchId });
}
