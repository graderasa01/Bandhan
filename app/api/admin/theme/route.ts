import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { setThemePack, setCustomTheme } from "@/lib/services/theme/siteThemeService";

export const runtime = "nodejs";

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Valid hex chahiye, jaise #7A1F2B");

const PatchSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("preset"), pack: z.enum(["KUNDAN", "RAAT", "KAAGAZ"]) }),
  z.object({
    mode: z.literal("custom"),
    colors: z.object({
      primary: HEX,
      primaryText: HEX,
      accent: HEX,
      accentText: HEX,
      signal: HEX,
    }),
  }),
]);

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = PatchSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Data valid nahi hai." },
      { status: 422 },
    );
  }

  const result =
    parsed.data.mode === "preset"
      ? await setThemePack({ pack: parsed.data.pack, actorId: user.id, actorRole: user.role })
      : await setCustomTheme({ colors: parsed.data.colors, actorId: user.id, actorRole: user.role });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
