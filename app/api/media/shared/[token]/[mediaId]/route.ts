import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";

export const runtime = "nodejs";

/**
 * The one deliberately unauthenticated media route — everywhere else,
 * `/api/media/[id]` requires a session (see mediaAccess.ts's header on why).
 * A Soch Board share link exists precisely so a family member with no
 * BandhanTak account can open it (`shareLinkService.ts`'s own doc comment),
 * and the clip *is* the point of sharing it (§5 C7: "uski apni aawaz me 10
 * second — usse sab pata chal jaata hai") — so this route trades the session
 * check for three narrower ones: the token must be a live SOCH_BOARD link,
 * the requested clip must belong to that exact board owner, and it must be
 * an approved, still-public poll-answer clip. Nothing else this token
 * doesn't already grant becomes reachable through it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; mediaId: string }> }) {
  const { token, mediaId } = await params;

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link || link.kind !== "SOCH_BOARD" || link.revokedAt || link.expiresAt <= new Date()) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye file available nahi hai." }, { status: 404 });
  }

  const vote = await prisma.pollVote.findFirst({
    where: { voiceNoteMediaId: mediaId, userId: link.createdByUserId },
    include: {
      voiceNoteMedia: { select: { storageKey: true, mimeType: true, moderation: true, deletedAt: true } },
    },
  });
  const media = vote?.voiceNoteMedia;
  if (!media || media.deletedAt || media.moderation !== "APPROVED") {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye file available nahi hai." }, { status: 404 });
  }

  const owner = await prisma.profile.findFirst({
    where: { userId: link.createdByUserId, isVisible: true, sochBoardVisible: true, deletedAt: null },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye file available nahi hai." }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await mediaStorage.read(media.storageKey);
  } catch (err) {
    console.error("[media/shared] read failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye file available nahi hai." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
