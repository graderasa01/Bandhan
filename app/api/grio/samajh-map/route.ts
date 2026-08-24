import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getT } from "@/lib/i18n/server";
import { buildSamajhMap, buildPrivacySnapshot } from "@/lib/services/grio/samajhMap";

export const runtime = "nodejs";

/**
 * The Samajh Map, and — behind `?section=privacy` — the Shield panel.
 *
 * Two sections on one route rather than two routes, because they are one
 * screen: the map is what is shown, the privacy snapshot is what opens on top
 * of it. Splitting the *fetch* matters (the snapshot is expensive and most
 * sessions never open it); splitting the *route* would only mean two files
 * asserting the same ownership rule.
 *
 * Ownership is implicit throughout, the same way `discoverySettingsService`
 * handles it: the userId comes from the session, never from the request, so
 * there is no id to check against an owner and no way to ask for somebody
 * else's map.
 */
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const section = new URL(req.url).searchParams.get("section");

  if (section === "privacy") {
    const privacy = await buildPrivacySnapshot(user.id);
    if (!privacy) return NextResponse.json({ ok: false, code: "no-profile" }, { status: 404 });
    return NextResponse.json({ ok: true, privacy });
  }

  // The node copy is built on the server, so the locale has to travel with the
  // request — `getT` reads the same `bt-lang` cookie every page does. Without
  // it the canvas rendered English chrome around Hinglish bubbles.
  const map = await buildSamajhMap(user.id, await getT());
  // 404 rather than an empty map: there is no profile row yet, and a map of
  // zero state would render as a screen full of "khaali" that says nothing.
  if (!map) return NextResponse.json({ ok: false, code: "no-profile" }, { status: 404 });

  return NextResponse.json({ ok: true, map });
}
