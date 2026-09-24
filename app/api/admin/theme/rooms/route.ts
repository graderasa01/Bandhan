import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { ThemeRoomsPutSchema } from "@/lib/contracts/themeGlass";
import { saveThemeRooms } from "@/lib/services/theme/themeRoomService";

export const runtime = "nodejs";

/**
 * Saves all four rooms at once — on/off, the default, each room's mobile and
 * desktop photo, and the glass over them (auto, or the admin's own numbers
 * per device).
 */
export async function PUT(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = ThemeRoomsPutSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Data valid nahi hai." },
      { status: 422 },
    );
  }

  const result = await saveThemeRooms({
    rooms: parsed.data.rooms,
    defaultRoom: parsed.data.defaultRoom,
    actorId: user.id,
    actorRole: user.role,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
