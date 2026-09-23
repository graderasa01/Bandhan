import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { loadProfileTurn, PROFILE_UNAVAILABLE_MESSAGE } from "@/lib/services/grio/profile/profileContext";
import { kundliAvailable, openingSuggestions } from "@/lib/services/grio/profile/answers";
import type { GrioProfileBriefResponse } from "@/lib/contracts/grioProfile";

export const runtime = "nodejs";

/**
 * `GET /api/grio/profile/:profileId` — what Grio shows the moment it opens on a
 * profile: whose profile this is (the pinned header), and four questions worth
 * asking about *this* one.
 *
 * Fetched when the panel opens scoped to a profile, never while the member is
 * scrolling the reel — browsing must not wait on anything Grio does. No model
 * is called: the header is the profile page's first screen, and the chips are
 * chosen from what the profile actually contains (no "Family?" chip for a
 * profile with no family details; "Kundli?" only when a milan exists).
 *
 * Same access rules as a profile turn (visible, not a draft, not yourself, not
 * blocked either way) — see `loadProfileTurn`.
 *
 * `?kundli=0` is the reel's affinity saying this member does not reach for
 * kundli, so the fourth slot offers "how to start" instead. Emphasis only; the
 * kundli is one tap away either way.
 */
export async function GET(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { profileId } = await params;

  const loaded = await loadProfileTurn(user.id, profileId, { withKundli: true });
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, message: PROFILE_UNAVAILABLE_MESSAGE } satisfies GrioProfileBriefResponse, {
      status: 404,
    });
  }

  const { facts, header } = loaded.turn;
  const kundliFirst = new URL(req.url).searchParams.get("kundli") !== "0";
  const sections = facts.sections.sections;

  return NextResponse.json({
    ok: true,
    header,
    suggestions: openingSuggestions(facts, { kundliFirst }),
    signals: {
      familyKnown: sections.family.facts.length > 0,
      lifestyleKnown: sections.lifestyle.facts.length > 0,
      kundliAvailable: kundliAvailable(facts),
      overlapCount: facts.evidence.rows.filter((r) => r.status === "match").length,
      missingCount: Object.values(sections).filter((s) => s.missing.length > 0).length,
      preferenceState: facts.evidence.preferenceState,
    },
  } satisfies GrioProfileBriefResponse);
}
