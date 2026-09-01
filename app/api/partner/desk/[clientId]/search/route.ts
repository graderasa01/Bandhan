import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { openClientDesk } from "@/lib/services/clientDesk/clientDeskService";
import { searchForClient } from "@/lib/services/clientDesk/clientSearchService";

export const runtime = "nodejs";

/**
 * The filters a partner may send.
 *
 * This list is deliberately a *subset* of `DiscoverySearchFilters` and, more
 * importantly, it cannot be a superset: there is no caste, religion, income,
 * gotra or manglik field here because there is none in the member's own search
 * either. A filter nobody wrote cannot be searched on — by anybody.
 */
const FiltersSchema = z.object({
  nameQuery: z.string().max(60).nullable().optional(),
  minAge: z.number().int().min(18).max(90).nullable().optional(),
  maxAge: z.number().int().min(18).max(90).nullable().optional(),
  cities: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  education: z.string().max(60).nullable().optional(),
  professionCategory: z.string().max(60).nullable().optional(),
  maritalStatus: z.string().max(40).nullable().optional(),
  diet: z.string().max(40).nullable().optional(),
  smoking: z.string().max(40).nullable().optional(),
  drinking: z.string().max(40).nullable().optional(),
  verifiedOnly: z.boolean().optional(),
  minTrustScore: z.number().int().min(0).max(100).nullable().optional(),
  cursor: z.string().max(80).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { user, partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner || !user) return response;

  const { clientId } = await params;
  // Assignment first, permission second — `searchForClient` re-checks the
  // permission itself, so a change of scope mid-session is caught on the very
  // next request rather than at the next page load.
  const desk = await openClientDesk(partner.id, clientId);
  if (!desk.ok) {
    return NextResponse.json({ error: desk.error, message: desk.message }, { status: desk.status });
  }

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = FiltersSchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Filters theek nahi hain." }, { status: 422 });
  }

  const f = parsed.data;
  const result = await searchForClient({
    partnerUserId: user.id,
    partnerId: partner.id,
    partnerLabel: partner.organizationName?.trim() || partner.fullName,
    ownerUserId: clientId,
    filters: {
      nameQuery: f.nameQuery ?? null,
      minAge: f.minAge ?? null,
      maxAge: f.maxAge ?? null,
      cities: f.cities ?? [],
      education: f.education ?? null,
      professionCategory: f.professionCategory ?? null,
      maritalStatus: f.maritalStatus ?? null,
      diet: f.diet ?? null,
      smoking: f.smoking ?? null,
      drinking: f.drinking ?? null,
      verifiedOnly: f.verifiedOnly ?? false,
      minTrustScore: f.minTrustScore ?? null,
      cursor: f.cursor ?? null,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({
    rows: result.rows,
    nextCursor: result.nextCursor,
    searchesLeftToday: result.searchesLeftToday,
  });
}
