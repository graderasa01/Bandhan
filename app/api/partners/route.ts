import { NextResponse } from "next/server";
import { getMarketplaceFacets, searchPartners } from "@/lib/services/marketplace/marketplaceSearchService";
import { SERVICE_KINDS } from "@/lib/services/marketplace/servicePolicy";
import type { PartnerServiceKind } from "@prisma/client";

export const runtime = "nodejs";

const VALID_KINDS = new Set(SERVICE_KINDS.map((s) => s.kind));

/**
 * The public marketplace search.
 *
 * Unauthenticated on purpose: `/partners` is a shopfront, and requiring a login
 * to see who is available would make the marketplace invisible to exactly the
 * people it is meant to reach. What makes that safe is that nothing in a card
 * belongs to a member — see `marketplaceSearchService`'s header for the full
 * list of what a card may contain, which notably has no contact field at all.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");

  const [partners, facets] = await Promise.all([
    searchPartners({
      city: url.searchParams.get("city"),
      language: url.searchParams.get("language"),
      kind: kindParam && VALID_KINDS.has(kindParam as PartnerServiceKind) ? (kindParam as PartnerServiceKind) : null,
      availableOnly: url.searchParams.get("available") === "1",
    }),
    getMarketplaceFacets(),
  ]);

  return NextResponse.json({ partners, facets });
}
