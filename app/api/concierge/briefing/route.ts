import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { buildGrioBriefing } from "@/lib/services/grio/briefing";
import type { ConciergeBriefingResponse } from "@/lib/contracts/concierge";

export const runtime = "nodejs";

/**
 * Grio's opening line — what today looks like, before anyone has typed.
 *
 * ## Why this is its own endpoint and not the first `/api/concierge` turn
 *
 * Nothing here reaches a model, and that is the entire point (see
 * `lib/services/grio/briefing.ts`). Routing it through the chat endpoint would
 * mean paying for a completion to have facts read back, and would put the one
 * message most likely to be *heard rather than read* in the hands of the one
 * component that can be confidently wrong.
 *
 * It carries the same plan gate as the chat itself. A user who cannot open Grio
 * must not be able to reach a briefing about their day through the back door —
 * and the briefing is genuinely richer than what the dashboard shows, since it
 * names today's rishtey in ranked order.
 *
 * ## The roster rides along
 *
 * The reply carries the same numbered roster `/api/concierge` returns, because
 * the greeting *says the names* — so the very next thing a user says is
 * "pehle wale ke baare me batao", and that has to resolve against the list they
 * just heard rather than one fetched again a moment later.
 *
 * This is also the one place today's reel is generated on Grio's behalf
 * (`buildGrioRoster({ generateReel: true })`), so every subsequent chat turn is
 * a plain read.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "aiConcierge", (ctx) => ctx.features.chat);
  if (!gate.allowed) {
    return NextResponse.json({ ok: false } satisfies ConciergeBriefingResponse, { status: 403 });
  }

  try {
    const briefing = await buildGrioBriefing(user.id);
    return NextResponse.json({
      ok: true,
      text: briefing.text,
      roster: briefing.roster.entries.map((e) => ({ n: e.n, profileId: e.profileId, name: e.name })),
    } satisfies ConciergeBriefingResponse);
  } catch (err) {
    // A greeting that fails leaves the chat exactly as it was before this
    // endpoint existed — an empty panel with starter chips — so there is
    // nothing to tell the user and nothing to retry.
    console.error("[grio] briefing build failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false } satisfies ConciergeBriefingResponse);
  }
}
