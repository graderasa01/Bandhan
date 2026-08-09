import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { buildGrioDeck } from "@/lib/services/grio/deck";
import { getT } from "@/lib/i18n/server";
import type { GrioDeckResponse } from "@/lib/contracts/grioDeck";

export const runtime = "nodejs";

/**
 * The Grio Deck — deliberately **not** behind the concierge's plan gate.
 *
 * `/api/concierge` requires `features.chat`, so on FREE the conversation is
 * shut. The deck is not the conversation: it is the user's own inbox, read
 * with the same queries `/user/inbox` already serves them without a plan check,
 * and it costs nothing to produce (no AI call, two indexed reads). Gating it
 * would hide a FREE user's own waiting voice note behind the upgrade it is
 * supposed to motivate — the exact inversion of what this surface is for.
 *
 * Owner-only in the only way that matters: `buildGrioDeck` takes the session's
 * user id and every query inside it filters on `toUserId`. There is no id in
 * the request to tamper with.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

  try {
    return NextResponse.json({ ok: true, deck: await buildGrioDeck(user.id, t) } satisfies GrioDeckResponse);
  } catch (err) {
    // The deck is an enhancement to a chat screen that works without it, so a
    // failure here degrades to "no cards" rather than breaking Grio — the same
    // call the concierge route makes about its own context build.
    console.error("[grio] deck build failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, message: "Cards abhi load nahi ho paye." } satisfies GrioDeckResponse,
      { status: 500 },
    );
  }
}
