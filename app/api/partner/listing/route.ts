import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/requirePartner";
import { parseJsonBody } from "@/app/api/_shared/responses";
import {
  getListing,
  saveListing,
  setAvailability,
  setServiceAreas,
} from "@/lib/services/marketplace/partnerListingService";

export const runtime = "nodejs";

const BodySchema = z.object({
  isListed: z.boolean(),
  headline: z.string().max(90).nullable().optional(),
  about: z.string().max(900).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(30)).max(8),
  cities: z.array(z.object({ city: z.string().trim().min(2).max(60), state: z.string().max(60).nullable().optional() })).max(12),
  acceptingBookings: z.boolean(),
  weeklyCapacity: z.number().int().min(0).max(50),
  capacityNote: z.string().max(200).nullable().optional(),
});

/** The partner's own shopfront. `partnerId` comes from `requirePartner`, so
 *  there is no id in the body a caller could point at somebody else's listing. */
export async function GET() {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE", "INACTIVE"]);
  if (!partner) return response;
  return NextResponse.json(await getListing(partner.id));
}

export async function POST(req: Request) {
  const { partner, response } = await requirePartner(["APPROVED", "ACTIVE"]);
  if (!partner) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Listing ki detail theek nahi hai." }, { status: 422 });
  }

  const listing = await saveListing(partner.id, {
    isListed: parsed.data.isListed,
    headline: parsed.data.headline ?? null,
    about: parsed.data.about ?? null,
    languages: parsed.data.languages,
  });
  if (!listing.ok) {
    return NextResponse.json({ error: listing.error, message: listing.message }, { status: listing.status });
  }

  const areas = await setServiceAreas(partner.id, parsed.data.cities);
  if (!areas.ok) return NextResponse.json({ error: areas.error, message: areas.message }, { status: areas.status });

  const availability = await setAvailability(partner.id, {
    acceptingBookings: parsed.data.acceptingBookings,
    weeklyCapacity: parsed.data.weeklyCapacity,
    note: parsed.data.capacityNote ?? null,
  });
  if (!availability.ok) {
    return NextResponse.json({ error: availability.error, message: availability.message }, { status: availability.status });
  }

  return NextResponse.json(await getListing(partner.id));
}
