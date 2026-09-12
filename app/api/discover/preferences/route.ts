import { NextResponse } from "next/server";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { parseDiscoverFilters } from "@/lib/discovery/contract";
import { preferenceInputFromFilters, savePartnerPreferenceFromSearch } from "@/lib/services/discovery/preferenceSetupService";

export const runtime = "nodejs";

/**
 * `POST /api/discover/preferences` — "Isse meri preference me save karein".
 *
 * Takes the *current search filters* and promotes exactly three of them (who,
 * age range, location) into `ProfilePartnerPreferences`. Explicit, optional,
 * and the only path from a search to a saved preference — the search itself
 * never writes here. Not plan-gated: a FREE member who fills the first-use
 * card is stating a preference about their own reel, which every plan has.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const body = (jsonResult.body ?? {}) as { filters?: unknown };
  const filters = parseDiscoverFilters(body.filters ?? {});
  if (!filters.ok) return NextResponse.json({ ok: false, message: filters.message }, { status: 422 });

  const input = preferenceInputFromFilters(filters.filters);
  if (!input.lookingForGender && input.minAge == null && input.maxAge == null && !input.cities?.length && !input.states?.length) {
    return NextResponse.json({ ok: false, message: "Save karne ke liye gender, age ya location me se kuch chahiye." }, { status: 422 });
  }

  const result = await savePartnerPreferenceFromSearch(user.id, input);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 404 });
  return NextResponse.json(result);
}
