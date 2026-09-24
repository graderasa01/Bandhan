import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { saveThemeRooms } from "@/lib/services/theme/themeRoomService";
import { DIM_MAX, ROOM_IDS } from "@/lib/theme/rooms";

export const runtime = "nodejs";

const RoomSchema = z.object({
  id: z.enum(ROOM_IDS),
  enabled: z.boolean(),
  // The sha256 an upload returned — never a URL. The URL is looked up from the
  // photo row, so nothing a client sends is ever written into a stylesheet.
  photoId: z.string().regex(/^[0-9a-f]{64}$/, "Photo id valid nahi hai.").nullable(),
  dim: z.number().min(0).max(DIM_MAX),
  focusX: z.number().int().min(0).max(100),
  focusY: z.number().int().min(0).max(100),
});

const PutSchema = z.object({
  rooms: z.array(RoomSchema).length(ROOM_IDS.length),
  defaultRoom: z.enum(ROOM_IDS),
});

/** Saves all four rooms at once — on/off, the default, and each room's photo. */
export async function PUT(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PutSchema.safeParse(jsonResult.body);
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
