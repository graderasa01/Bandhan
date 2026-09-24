import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { GlassPresetDefaultSchema, GlassPresetSaveSchema } from "@/lib/contracts/themeGlass";
import {
  deleteGlassPreset,
  getGlassPresets,
  saveGlassPreset,
  setDefaultGlassPreset,
  type GlassPresetResult,
} from "@/lib/services/theme/glassPresetService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The glass preset library on /admin/theme. Every write answers with the
 * whole list, so the screen never has to guess what changed. A preset is a
 * starting point for the sliders — saving one changes nothing a member sees.
 *
 *   GET                  the list
 *   POST   {id?, name, values}  save: overwrite `id`, or add a new preset
 *   PATCH  {defaultId}          make one the default (what Reset goes back to)
 *   DELETE ?id=…               delete a custom preset / restore a built-in
 */
function reply(result: GlassPresetResult) {
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true, presets: result.presets });
}

function invalid(message: string | undefined) {
  return NextResponse.json({ error: "VALIDATION_FAILED", message: message ?? "Data valid nahi hai." }, { status: 422 });
}

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json({ ok: true, presets: await getGlassPresets() });
}

export async function POST(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const json = await parseJsonBody(req);
  if (!json.ok) return json.response;
  const parsed = GlassPresetSaveSchema.safeParse(json.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  return reply(await saveGlassPreset({ ...parsed.data, actorId: user.id, actorRole: user.role }));
}

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const json = await parseJsonBody(req);
  if (!json.ok) return json.response;
  const parsed = GlassPresetDefaultSchema.safeParse(json.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  return reply(await setDefaultGlassPreset({ id: parsed.data.defaultId, actorId: user.id, actorRole: user.role }));
}

export async function DELETE(req: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return invalid("Preset id chahiye.");
  return reply(await deleteGlassPreset({ id, actorId: user.id, actorRole: user.role }));
}
