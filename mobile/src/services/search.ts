import { IS_MOCK } from "./config";
import { ApiError, api } from "./api/client";
import { db, delay } from "~/mocks/mockDb";
import { MOCK_PEOPLE } from "~/mocks/people";
import type { DiscoverFilters, DiscoverIntentResponse, DiscoverMode, DiscoverResultCard, DiscoverSearchResponse, DiscoverSort } from "~/types/api";

/**
 * Advanced search — `/api/discover/search` (the typed POST contract) and its
 * AI half `/api/discover/intent` ("Jaipur me 26-30, MBA, veg" → filters).
 *
 * The filter vocabulary is the web's catalog (`FILTER_CATALOG`, bundled via
 * the catalog snapshot), so any filter the sheet can build is one the server
 * validates. The plan gate, consent-gated sensitive filters and the photo gate
 * are all enforced server-side; a 403 `plan` comes back as a readable error.
 */
export interface SearchRequest {
  filters: DiscoverFilters;
  sort?: DiscoverSort;
  mode?: DiscoverMode;
  cursor?: string | null;
}

export interface SearchService {
  search(req: SearchRequest): Promise<DiscoverSearchResponse>;
  intent(query: string, currentFilters: DiscoverFilters): Promise<DiscoverIntentResponse>;
}

const live: SearchService = {
  search: ({ filters, sort = "newest", mode = "strict", cursor = null }) =>
    api<DiscoverSearchResponse>("/api/discover/search", { body: { filters, sort, mode, cursor } }),
  intent: (query, currentFilters) =>
    api<DiscoverIntentResponse>("/api/discover/intent", {
      body: { query, currentFilters, allowClarification: true },
      timeoutMs: 45_000,
    }),
};

function matches(p: (typeof MOCK_PEOPLE)[number], f: DiscoverFilters): boolean {
  if (f.name && !p.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.minAge && p.age < f.minAge) return false;
  if (f.maxAge && p.age > f.maxAge) return false;
  if (f.cities?.length && !f.cities.includes(p.city)) return false;
  if (f.education?.length && !f.education.includes(p.education)) return false;
  if (f.diet?.length && !f.diet.includes(p.diet)) return false;
  if (f.motherTongue?.length && !f.motherTongue.includes(p.motherTongue)) return false;
  if (f.familyType?.length && !f.familyType.includes(p.familyType)) return false;
  if (f.verifiedOnly && !p.verified) return false;
  if (f.minTrustScore && p.trust < f.minTrustScore) return false;
  return true;
}

const mock: SearchService = {
  async search({ filters, sort = "newest" }) {
    await delay(500);
    const hits = MOCK_PEOPLE.filter((p) => matches(p, filters)).sort((a, b) => (sort === "trust" ? b.trust - a.trust : b.rank - a.rank));
    const results: DiscoverResultCard[] = hits.map((p) => {
      const card = db.cards.find((c) => c.id === p.id);
      return {
        profileId: p.id,
        displayName: p.name,
        age: p.age,
        city: p.city,
        education: p.education,
        profession: p.profession,
        professionCategory: null,
        maritalStatus: "Never Married",
        verified: p.verified,
        trustScore: p.trust,
        trustLabel: p.trust >= 80 ? "Strong" : "Achha",
        photoUrl: null,
        photoUnlocked: p.lock === "open",
        photoLock: p.lock,
        photoVerified: p.verified,
        shortlisted: card?.shortlisted ?? false,
        reason: { kind: "strict", text: "Aapke sabhi filters se match karta hai", matched: [], missed: [], unknown: [], total: 0, matchedCount: 0 },
      };
    });
    return {
      ok: true,
      results,
      nextCursor: null,
      countLabel: `${results.length} profiles`,
      suggestions: results.length === 0 ? [{ id: "widenAge", label: "Umar ki range badhaiye", filters: { ...filters, minAge: undefined, maxAge: undefined }, mode: "strict" }] : [],
    };
  },
  async intent(query) {
    await delay(900);
    const q = query.toLowerCase();
    const filters: DiscoverFilters = {};
    const ages = q.match(/(\d{2})\s*[-–to ]+\s*(\d{2})/);
    if (ages) {
      filters.minAge = Number(ages[1]);
      filters.maxAge = Number(ages[2]);
    }
    const city = MOCK_PEOPLE.map((p) => p.city).find((c) => q.includes(c.toLowerCase()));
    if (city) filters.cities = [city];
    if (/\bveg\b|vegetarian|shakahari/.test(q)) filters.diet = ["Veg"];
    if (/mba/.test(q)) filters.education = ["MBA"];
    if (/verified/.test(q)) filters.verifiedOnly = true;
    if (Object.keys(filters).length === 0) {
      throw new ApiError(422, "validation", "Is baat se koi filter nahi ban paya — sheher, umar ya padhai likh kar dekhiye.");
    }
    return {
      ok: true,
      summary: [
        filters.cities?.[0],
        filters.minAge ? `${filters.minAge}–${filters.maxAge} saal` : null,
        filters.education?.[0],
        filters.diet?.[0],
        filters.verifiedOnly ? "sirf verified" : null,
      ].filter(Boolean).join(" · "),
      filters,
      unresolvedRequests: [],
      clarificationQuestion: null,
      confidence: 0.8,
    };
  },
};

export const searchService: SearchService = IS_MOCK ? mock : live;
