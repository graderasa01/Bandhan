import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { resolveMediaAccess } from "@/lib/services/media/mediaAccess";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";

export const runtime = "nodejs";

/**
 * The only way audio leaves the server.
 *
 * Permission is re-checked here on every request rather than baked into a URL,
 * so revoking access (a note re-locked, a user blocked, a profile hidden) takes
 * effect on the next play — not whenever a signed link happens to expire.
 *
 * A 403 is returned as 404 to non-owners on purpose: "this id exists but you
 * can't have it" is itself information about who sent what to whom.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const access = await resolveMediaAccess({ mediaId: id, viewerId: user.id, viewerRole: user.role });

  if (!access.allowed) {
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye file available nahi hai." }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await mediaStorage.read(access.storageKey);
  } catch (err) {
    console.error("[media] read failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "NOT_FOUND", message: "Ye file available nahi hai." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": access.mimeType,
      "Content-Length": String(bytes.byteLength),
      // Gated content must not sit in a shared cache, and `no-store` also keeps
      // a re-locked note from playing out of the browser's disk cache.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
