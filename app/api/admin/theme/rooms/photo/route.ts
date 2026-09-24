import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { GlassDeviceSchema } from "@/lib/contracts/themeGlass";
import { ROOM_PHOTO_MAX_BYTES, RoomPhotoError, uploadRoomPhoto } from "@/lib/services/theme/themeRoomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * "Upload Photo" on /admin/theme. Admin only, one file, and the device it is
 * for (`device`: "mobile", the default, takes a portrait photo; "desktop" a
 * landscape one). Bounded by `content-length` before the body is read and by
 * size again after; the MIME type is a courtesy check only — what the file
 * decodes as is decided in the service, and what is stored is a WebP the
 * service wrote.
 *
 * Nothing goes live here. The response is the processed photo (URLs, the
 * measured brightness and the dim it needs), for the preview; the room
 * changes when the admin saves.
 */
export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const tooLarge = () =>
    NextResponse.json(
      { error: "TOO_LARGE", message: `File ${Math.round(ROOM_PHOTO_MAX_BYTES / 1024 / 1024)}MB se badi nahi ho sakti.` },
      { status: 413 },
    );

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > ROOM_PHOTO_MAX_BYTES + 64 * 1024) return tooLarge();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Photo file nahi mili (field 'file')." }, { status: 400 });
  }
  const device = GlassDeviceSchema.safeParse(form?.get("device") ?? "mobile");
  if (!device.success) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Device 'mobile' ya 'desktop' hona chahiye." }, { status: 400 });
  }
  if (file.size > ROOM_PHOTO_MAX_BYTES) return tooLarge();
  if (file.type && !ACCEPTED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "UNSUPPORTED_FORMAT", message: "Sirf JPG, PNG ya WebP photo chalegi." }, { status: 422 });
  }

  try {
    const photo = await uploadRoomPhoto({
      buffer: Buffer.from(await file.arrayBuffer()),
      actorId: user.id,
      device: device.data,
    });
    return NextResponse.json({ ok: true, photo }, { status: 201 });
  } catch (err) {
    if (err instanceof RoomPhotoError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 422 });
    }
    console.error("[theme-rooms] upload failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "UPLOAD_FAILED", message: "Photo save nahi ho payi — dobara try karein." }, { status: 500 });
  }
}
