import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import {
  searchDiscoveryCandidates,
  DISCOVERY_MAX_PAGE_SIZE,
  type DiscoverySearchFilters,
} from "@/lib/services/discovery/discoverySearchService";

export const runtime = "nodejs";

const QuerySchema = z.object({
  name: z.string().trim().max(80).optional(),
  minAge: z.coerce.number().int().min(18).max(100).optional(),
  maxAge: z.coerce.number().int().min(18).max(100).optional(),
  cities: z.string().trim().max(300).optional(),
  education: z.string().trim().max(80).optional(),
  professionCategory: z.string().trim().max(80).optional(),
  maritalStatus: z.string().trim().max(40).optional(),
  diet: z.string().trim().max(40).optional(),
  smoking: z.string().trim().max(40).optional(),
  drinking: z.string().trim().max(40).optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  minTrustScore: z.coerce.number().int().min(0).max(100).optional(),
  cursor: z.string().trim().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(DISCOVERY_MAX_PAGE_SIZE).optional(),
});

/**
 * Advanced search. Plan-gated server-side (`advancedDiscovery`) — a FREE
 * request never reaches `searchDiscoveryCandidates`, so the screen can render
 * a full preview of the filter UI (the client's job) while the API itself
 * never leaks a single paid result. See the brief's "server APIs must enforce
 * the plan gate and must not return paid results."
 */
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, code: "plan", message: "Advanced Discovery search abhi aapke plan me available nahi hai." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", message: parsed.error.issues[0]?.message ?? "Search params valid nahi hain." },
      { status: 422 },
    );
  }
  const q = parsed.data;

  if (q.minAge != null && q.maxAge != null && q.minAge > q.maxAge) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "Min age, max age se zyada nahi ho sakti." }, { status: 422 });
  }

  const filters: DiscoverySearchFilters = {
    nameQuery: q.name?.trim() || null,
    minAge: q.minAge ?? null,
    maxAge: q.maxAge ?? null,
    cities: q.cities
      ? q.cities.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 10)
      : [],
    education: q.education?.trim() || null,
    professionCategory: q.professionCategory?.trim() || null,
    maritalStatus: q.maritalStatus?.trim() || null,
    diet: q.diet?.trim() || null,
    smoking: q.smoking?.trim() || null,
    drinking: q.drinking?.trim() || null,
    verifiedOnly: q.verifiedOnly ?? false,
    minTrustScore: q.minTrustScore ?? null,
    cursor: q.cursor ?? null,
    pageSize: q.pageSize ?? DISCOVERY_MAX_PAGE_SIZE,
  };

  const page = await searchDiscoveryCandidates(user.id, filters);
  return NextResponse.json({ ok: true, ...page });
}
