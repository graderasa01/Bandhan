import "server-only";
import type { PlaceCandidate } from "@/lib/contracts/kundli";
import { IST_ZONE, resolvePlace as resolveStaticPlace, type Place } from "./places";
import { IST_OFFSET_MINUTES, offsetForDate } from "./timezone";

export { localToUtc, offsetForDate, offsetMinutesAt } from "./timezone";

/**
 * Birth place → a place the chart can actually be computed for.
 *
 * ## The ladder
 *
 *  1. **The static table** (`places.ts`) — ~170 Indian cities, no network,
 *     answers instantly and covers where most people this app serves were
 *     born. Always tried first.
 *  2. **A geocoder**, only when the table has no answer and one is configured
 *     (`KUNDLI_GEOCODER`). Nominatim needs no key but does need a contact
 *     address per its usage policy; OpenCage needs a key and also returns the
 *     timezone, which is the harder half of the problem.
 *  3. **Nothing.** No provider, a provider that is down, a query that matches
 *     nothing — the answer is `unresolved`, and the chart is built without a
 *     lagna and says so. A wrong lagna from a default city is the one thing
 *     this module exists to never produce.
 *
 * ## Timezone is part of the answer
 *
 * A birth time is local time; the sky is UTC. For an Indian birth that is a
 * constant +5:30, but a person born in Dubai, London or New Jersey needs the
 * offset *for that date* — including whatever daylight-saving rule applied
 * that year. Node's ICU knows every IANA zone's history, so given a zone id
 * the offset is computed here (`offsetMinutesAt`), not looked up in a table
 * that would be wrong the year a country changed its rules.
 *
 * When a geocoder finds a place but cannot name its zone, the place is still
 * returned with `timeZoneId: null`; `chart.ts` then reads the time as IST,
 * drops the lagna, and records the `timezone-unknown` assumption — visible,
 * never silent.
 *
 * ## Ambiguity
 *
 * "Aurangabad" is in Maharashtra and in Bihar; "Bilaspur" is in Chhattisgarh
 * and in Himachal. When the geocoder returns more than one place of the same
 * name in different regions and the typed text did not say which, the answer
 * is `ambiguous` with the candidates — the form asks, the person picks, and
 * the pick comes back as a `PlaceCandidate` that is used verbatim.
 *
 * No key is ever read from anywhere but the environment.
 */

export type PlaceResolution =
  | { status: "resolved"; place: Place }
  | { status: "ambiguous"; candidates: PlaceCandidate[] }
  | { status: "unresolved"; reason: "empty" | "no-match" | "no-provider" | "provider-error" };

export type GeocoderName = "static" | "nominatim" | "opencage";

/** A geocoder's answer, before the timezone/offset step. */
export interface GeoHit {
  name: string;
  region: string;
  lat: number;
  lon: number;
  countryCode: string | null;
  timeZoneId: string | null;
  source: "nominatim" | "opencage";
}

export interface GeocoderProvider {
  name: GeocoderName;
  search(query: string): Promise<GeoHit[]>;
}

/**
 * Countries with one civil timezone, for a geocoder (Nominatim) that names
 * the country but not the zone. Multi-zone countries are deliberately absent:
 * a Texas birth read as New York time is a wrong chart, and the honest answer
 * there is "timezone unknown" until a zone-aware geocoder (OpenCage) is used.
 */
const SINGLE_ZONE_COUNTRIES: Record<string, string> = {
  in: "Asia/Kolkata",
  np: "Asia/Kathmandu",
  bd: "Asia/Dhaka",
  lk: "Asia/Colombo",
  pk: "Asia/Karachi",
  bt: "Asia/Thimphu",
  mm: "Asia/Yangon",
  ae: "Asia/Dubai",
  qa: "Asia/Qatar",
  sa: "Asia/Riyadh",
  kw: "Asia/Kuwait",
  bh: "Asia/Bahrain",
  om: "Asia/Muscat",
  sg: "Asia/Singapore",
  my: "Asia/Kuala_Lumpur",
  hk: "Asia/Hong_Kong",
  jp: "Asia/Tokyo",
  kr: "Asia/Seoul",
  th: "Asia/Bangkok",
  gb: "Europe/London",
  ie: "Europe/Dublin",
  de: "Europe/Berlin",
  fr: "Europe/Paris",
  nl: "Europe/Amsterdam",
  it: "Europe/Rome",
  ke: "Africa/Nairobi",
  za: "Africa/Johannesburg",
  mu: "Indian/Mauritius",
  nz: "Pacific/Auckland",
};

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

const FETCH_TIMEOUT_MS = 6000;

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenStreetMap Nominatim. Free, no key — but the usage policy asks for an
 * identifying User-Agent with a contact address, one request per second, and
 * no bulk use. `NOMINATIM_EMAIL` is that contact; without it the provider is
 * not used at all rather than used anonymously.
 */
function nominatimProvider(): GeocoderProvider | null {
  const email = (process.env.NOMINATIM_EMAIL ?? "").trim();
  if (!email) return null;
  const base = (process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  return {
    name: "nominatim",
    async search(query) {
      const url = `${base}/search?format=jsonv2&addressdetails=1&limit=6&featureType=settlement&q=${encodeURIComponent(query)}`;
      const raw = (await fetchJson(url, {
        "User-Agent": `BandhanTak-Kundli/1.0 (${email})`,
        Accept: "application/json",
      })) as Array<{
        lat?: string;
        lon?: string;
        name?: string;
        display_name?: string;
        address?: { state?: string; country?: string; country_code?: string; city?: string; town?: string; village?: string };
      }>;
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((hit) => {
        const lat = Number(hit.lat);
        const lon = Number(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        const a = hit.address ?? {};
        const name = hit.name || a.city || a.town || a.village || (hit.display_name ?? "").split(",")[0]?.trim();
        if (!name) return [];
        const countryCode = (a.country_code ?? "").toLowerCase() || null;
        return [
          {
            name,
            region: [a.state, a.country].filter(Boolean).join(", "),
            lat,
            lon,
            countryCode,
            timeZoneId: countryCode ? (SINGLE_ZONE_COUNTRIES[countryCode] ?? null) : null,
            source: "nominatim" as const,
          },
        ];
      });
    },
  };
}

/** OpenCage — keyed, and answers the timezone question itself. */
function opencageProvider(): GeocoderProvider | null {
  const key = (process.env.OPENCAGE_API_KEY ?? "").trim();
  if (!key) return null;
  return {
    name: "opencage",
    async search(query) {
      const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}&limit=6&no_annotations=0`;
      const raw = (await fetchJson(url, { Accept: "application/json" })) as {
        results?: Array<{
          geometry?: { lat?: number; lng?: number };
          components?: {
            city?: string;
            town?: string;
            village?: string;
            state?: string;
            country?: string;
            country_code?: string;
            _type?: string;
          };
          annotations?: { timezone?: { name?: string } };
        }>;
      };
      return (raw.results ?? []).flatMap((hit) => {
        const lat = hit.geometry?.lat;
        const lon = hit.geometry?.lng;
        if (typeof lat !== "number" || typeof lon !== "number") return [];
        const c = hit.components ?? {};
        const name = c.city || c.town || c.village;
        if (!name) return [];
        const countryCode = (c.country_code ?? "").toLowerCase() || null;
        return [
          {
            name,
            region: [c.state, c.country].filter(Boolean).join(", "),
            lat,
            lon,
            countryCode,
            timeZoneId: hit.annotations?.timezone?.name ?? (countryCode ? (SINGLE_ZONE_COUNTRIES[countryCode] ?? null) : null),
            source: "opencage" as const,
          },
        ];
      });
    },
  };
}

/** Which geocoder is configured — `KUNDLI_GEOCODER=static|nominatim|opencage`; default static (no network). */
export function configuredGeocoder(): GeocoderProvider | null {
  const wanted = (process.env.KUNDLI_GEOCODER ?? "static").trim().toLowerCase();
  if (wanted === "nominatim") return nominatimProvider();
  if (wanted === "opencage") return opencageProvider();
  return null;
}

/* ------------------------------------------------------------------ */
/* Cache — a birth place is asked about repeatedly; the geocoder is not */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; hits: GeoHit[] }>();

function cacheKey(provider: GeocoderName, query: string): string {
  return `${provider}:${query.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

async function searchCached(provider: GeocoderProvider, query: string): Promise<GeoHit[]> {
  const key = cacheKey(provider.name, query);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.hits;
  const hits = await provider.search(query);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), hits });
  return hits;
}

/* ------------------------------------------------------------------ */
/* The resolver                                                        */
/* ------------------------------------------------------------------ */

function candidateId(hit: GeoHit): string {
  return `${hit.lat.toFixed(4)},${hit.lon.toFixed(4)}`;
}

function toCandidate(hit: GeoHit): PlaceCandidate {
  return { id: candidateId(hit), name: hit.name, region: hit.region, lat: hit.lat, lon: hit.lon, timeZoneId: hit.timeZoneId };
}

function placeFromHit(hit: GeoHit, birth: { year: number; month1: number; day: number }): Place {
  const offset = hit.timeZoneId ? offsetForDate(hit.timeZoneId, birth.year, birth.month1, birth.day) : null;
  return {
    name: hit.region ? `${hit.name}, ${hit.region.split(",")[0]?.trim() ?? ""}`.replace(/,\s*$/, "") : hit.name,
    lat: hit.lat,
    lon: hit.lon,
    // A place without a zone keeps the IST reading — and `chart.ts` records
    // that as an assumption and refuses the lagna. Never a silent guess.
    tzOffsetMinutes: offset ?? IST_OFFSET_MINUTES,
    timeZoneId: offset === null ? null : hit.timeZoneId,
    source: hit.source,
  };
}

/** A candidate the person picked from an `ambiguous` answer — used verbatim, with its offset for the date. */
export function placeFromCandidate(candidate: PlaceCandidate, birth: { year: number; month1: number; day: number }): Place {
  const offset = candidate.timeZoneId ? offsetForDate(candidate.timeZoneId, birth.year, birth.month1, birth.day) : null;
  return {
    name: candidate.region ? `${candidate.name}, ${candidate.region.split(",")[0]?.trim() ?? ""}`.replace(/,\s*$/, "") : candidate.name,
    lat: candidate.lat,
    lon: candidate.lon,
    tzOffsetMinutes: offset ?? IST_OFFSET_MINUTES,
    timeZoneId: offset === null ? null : candidate.timeZoneId,
    source: "user",
  };
}

/**
 * Two geocoder hits are "the same place" when they sit within ~15 km: a
 * city centre and its railway station are one answer, not an ambiguity.
 */
function dedupe(hits: GeoHit[]): GeoHit[] {
  const out: GeoHit[] = [];
  for (const hit of hits) {
    const near = out.some((o) => Math.abs(o.lat - hit.lat) < 0.15 && Math.abs(o.lon - hit.lon) < 0.15);
    if (!near) out.push(hit);
  }
  return out;
}

/**
 * The static table first, then the configured geocoder. The birth date is
 * needed because the answer includes the UTC offset *for that date*.
 */
export async function resolveBirthPlace(
  input: string | null | undefined,
  birth: { year: number; month1: number; day: number },
  provider: GeocoderProvider | null = configuredGeocoder(),
): Promise<PlaceResolution> {
  const query = (input ?? "").trim();
  if (!query) return { status: "unresolved", reason: "empty" };

  const fromTable = resolveStaticPlace(query);
  if (fromTable) {
    const offset = offsetForDate(IST_ZONE, birth.year, birth.month1, birth.day) ?? IST_OFFSET_MINUTES;
    return { status: "resolved", place: { ...fromTable, tzOffsetMinutes: offset } };
  }

  if (!provider) return { status: "unresolved", reason: "no-provider" };

  let hits: GeoHit[];
  try {
    hits = dedupe(await searchCached(provider, query));
  } catch (err) {
    console.error(`[kundli:geocode] ${provider.name} failed:`, err instanceof Error ? err.message : String(err));
    return { status: "unresolved", reason: "provider-error" };
  }
  if (hits.length === 0) return { status: "unresolved", reason: "no-match" };

  // Same name, different regions, and the person typed only the name — ask.
  const typedRegion = /,/.test(query) || query.split(/\s+/).length >= 3;
  const sameName = hits.filter((h) => h.name.toLowerCase() === hits[0].name.toLowerCase());
  const distinctRegions = new Set(sameName.map((h) => h.region.toLowerCase()));
  if (!typedRegion && sameName.length > 1 && distinctRegions.size > 1) {
    return { status: "ambiguous", candidates: sameName.slice(0, 4).map(toCandidate) };
  }

  return { status: "resolved", place: placeFromHit(hits[0], birth) };
}

/** Test seam: forget every cached geocoder answer. */
export function resetGeocodeCache() {
  cache.clear();
}
