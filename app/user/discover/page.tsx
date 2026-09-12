import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getDiscoverySettings } from "@/lib/services/discovery/discoverySettingsService";
import { runDiscoverSearch } from "@/lib/services/discovery/discoverySearchService";
import { normalizeLooseFilters } from "@/lib/services/discovery/filterNormalizer";
import { assessPartnerPreferences, statedCities } from "@/lib/services/match/preferenceEvidence";
import { prisma } from "@/lib/db/prisma";
import {
  DISCOVER_PAGE_SIZE,
  hasAnySearchState,
  stateFromSearchParams,
  type DiscoverSearchResponse,
  type DiscoverUrlState,
  type LookingForGender,
} from "@/lib/discovery/contract";
import UserShell from "@/components/layout/UserShell";
import DiscoverClient from "./DiscoverClient";

export const dynamic = "force-dynamic";

/**
 * Advanced Discovery — AI-assisted search over exact, server-side filters.
 *
 * Order of the page (what the user sees, top to bottom): heading → AI search
 * box → the AI's understanding to confirm → active filter chips → results →
 * collapsed Simple Filters → collapsed Reel/recommendation settings. Search is
 * the job; the Reel controls are settings and sit last.
 *
 * FREE renders the same box and filter UI as every other plan — that is the
 * "useful preview" — but never gets a result: `/api/discover/search` and
 * `/api/discover/intent` both 403, and this page runs no server-side search for
 * a non-entitled user. `entitled` is the only thing decided here.
 *
 * ## Why the first page is fetched here
 *
 * An entitled member whose saved preference already says "25–30, Jaipur" should
 * see profiles on first paint, not a blank grid waiting on a client fetch. When
 * the URL carries a search (refresh, back), that search runs instead. When
 * neither exists — the member has never stated a preference — nothing runs and
 * the client shows the three-question setup card: no assumed pool, no
 * percentage, nothing invented.
 */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/discover");
  const t = await getT();
  const params = await searchParams;

  const [gate, settings, profile] = await Promise.all([
    isFeatureAvailable(user.id, "advancedDiscovery", (ctx) => ctx.features.advancedDiscovery),
    getDiscoverySettings(user.id),
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: { gender: true, currentCity: true, partnerPreferences: true },
    }),
  ]);

  const prefs = profile?.partnerPreferences ?? null;
  const preference = assessPartnerPreferences({ partnerPreferences: prefs });
  const savedLookingFor = prefs?.lookingForGender;
  const defaultLookingFor: LookingForGender | null =
    savedLookingFor === "Ladka" || savedLookingFor === "Ladki"
      ? savedLookingFor
      : profile?.gender === "Ladka"
        ? "Ladki"
        : profile?.gender === "Ladki"
          ? "Ladka"
          : null;

  // URL first; otherwise the saved preference becomes the starting search —
  // through the same normaliser the AI output uses, so "Delhi NCR" (a
  // preference option) lands as the state it is, and "Kahin bhi" adds nothing.
  const fromUrl = stateFromSearchParams(params);
  let initialState: DiscoverUrlState = fromUrl;
  if (!hasAnySearchState(fromUrl) && preference.state !== "NOT_PROVIDED") {
    const cities = statedCities(prefs).map((c) => (c === "Isi sheher me" ? profile?.currentCity ?? "" : c)).filter(Boolean);
    const derived = normalizeLooseFilters({
      lookingForGender: defaultLookingFor ?? undefined,
      minAge: prefs?.minAge ?? undefined,
      maxAge: prefs?.maxAge ?? undefined,
      cities,
    });
    initialState = { filters: derived.filters, mode: "strict", sort: "newest", behaviorMode: "none", query: "" };
  }

  let initialSearch: DiscoverSearchResponse | null = null;
  if (gate.allowed && (hasAnySearchState(fromUrl) || preference.state !== "NOT_PROVIDED")) {
    const outcome = await runDiscoverSearch(user.id, {
      filters: initialState.filters,
      mode: initialState.mode,
      sort: initialState.sort,
      behaviorMode: initialState.behaviorMode,
      cursor: null,
      pageSize: DISCOVER_PAGE_SIZE,
    });
    if (outcome.ok) initialSearch = outcome;
  }

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-3">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">{t("discover.title", "Discover")}</h1>
          <p className="mt-1 text-[0.875rem] text-muted">
            {t("discover.subtitle", "Likh kar ya bol kar batayein — AI aapki baat filters me badalta hai, profiles asli data se aati hain.")}
          </p>
        </header>

        <DiscoverClient
          entitled={gate.allowed}
          initialSettings={settings}
          viewer={{ city: profile?.currentCity ?? null, defaultLookingFor }}
          preferenceState={preference.state}
          initialState={initialState}
          initialSearch={initialSearch}
        />
      </div>
    </UserShell>
  );
}
