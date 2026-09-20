import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/_shared/responses";
import { requireUser } from "@/lib/auth/requireUser";
import { getLibraryPage } from "@/lib/data/reelLibraryData";
import { parseDiscoverFilters } from "@/lib/discovery/contract";
import { REEL_LANES, type ReelLibraryPage } from "@/lib/contracts/reelLibrary";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

/**
 * Meri List — one filtered page of one lane (D-91b).
 *
 * Unlike `/api/discover/search` this carries no plan gate. Every row it can
 * return is something this member already did: somebody they swiped past,
 * liked, sent an interest to, or is already talking to. Charging for a look at
 * your own history would be the clearest possible version of the thing D-90
 * decided against.
 *
 * The filters are the same `DiscoverFilters` the search sheet builds, parsed
 * by the same validator — so a filter that is legal in search is legal here,
 * and one that isn't is rejected identically.
 */

const BodySchema = z
  .object({
    lane: z.enum(REEL_LANES as [string, ...string[]]),
    filters: z.unknown().optional(),
    cursor: z.string().min(1).max(40).nullable().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jsonResult = await parseJsonBody(req);
  if (!jsonResult.ok) return jsonResult.response;

  const parsed = BodySchema.safeParse(jsonResult.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, lane: "VIEWED", cards: [], nextCursor: null, total: 0, message: parsed.error.issues[0]?.message ?? "Request valid nahi hai." } satisfies ReelLibraryPage,
      { status: 422 },
    );
  }

  const filters = parseDiscoverFilters(parsed.data.filters ?? {});
  if (!filters.ok) {
    return NextResponse.json(
      { ok: false, lane: parsed.data.lane as ReelLibraryPage["lane"], cards: [], nextCursor: null, total: 0, message: filters.message } satisfies ReelLibraryPage,
      { status: 422 },
    );
  }

  const t = await getT();
  const page = await getLibraryPage(
    user.id,
    parsed.data.lane as ReelLibraryPage["lane"],
    filters.filters,
    parsed.data.cursor ?? null,
    t,
  );
  return NextResponse.json(page);
}
