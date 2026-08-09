import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { getIncognitoSetting, setIncognito } from "@/lib/services/profile/incognitoService";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/**
 * The incognito switch. Owner-only in both directions — the whole feature is a
 * promise about one person's own browsing, so there is no shape of this route
 * that reads or writes anyone else.
 *
 * Same split as `/api/profile/soch-board-visibility` and
 * `/api/profile/deep-dimensions/share-visibility`: the setting is a plain
 * boolean on `Profile`, the plan check lives in the service.
 */

const BodySchema = z.object({ enabled: z.boolean() });

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [enabled, entitlements] = await Promise.all([
    getIncognitoSetting(user.id),
    getEntitlements(user.id),
  ]);
  return NextResponse.json({ ok: true, enabled, allowed: entitlements.incognitoBrowse });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 422 });
  }

  const t = await getT();
  const result = await setIncognito(user.id, parsed.data.enabled, t);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 403 });
  }

  return NextResponse.json({ ok: true, enabled: result.enabled });
}
