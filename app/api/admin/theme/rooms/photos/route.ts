import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { GlassDeviceSchema } from "@/lib/contracts/themeGlass";
import { listRoomPhotos } from "@/lib/services/theme/themeRoomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Choose from Library" on /admin/theme: photos already uploaded, newest
 * first, shaped for the device asked about (`?device=mobile|desktop`).
 */
export async function GET(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const device = GlassDeviceSchema.safeParse(new URL(req.url).searchParams.get("device") ?? "mobile");
  if (!device.success) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Device 'mobile' ya 'desktop' hona chahiye." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, photos: await listRoomPhotos(device.data) });
}
