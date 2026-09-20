import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { likeProfile, revealLike, unlikeProfile } from "@/lib/services/library/likeService";

export const runtime = "nodejs";

/**
 * The private like (D-91b) — PUT to like, DELETE to unlike, PATCH to reveal.
 *
 * Deliberately a sibling of `/api/shortlist/[profileId]` rather than a flag on
 * it: the two actions look identical on screen and are opposites underneath.
 * A shortlist tells the other person; a like tells nobody until its owner
 * decides to.
 *
 * No route here can answer "who liked me" — that question has no handler
 * anywhere, which is the point (see `likeService`).
 */

export async function PUT(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  const result = await likeProfile(user.id, profileId);
  if (!result.ok) {
    return NextResponse.json({ error: "BAD_REQUEST", message: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  await unlikeProfile(user.id, profileId);
  return NextResponse.json({ ok: true });
}

/** "Inhe bata dein" — the liker naming themself to this one person. One-way. */
export async function PATCH(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  const { ok } = await revealLike(user.id, profileId);
  if (!ok) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Ye like maujood nahi hai, ya pehle hi bata diya gaya hai." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
