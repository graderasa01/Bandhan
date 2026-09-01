import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  DISCOVERY_MAX_PAGE_SIZE,
  searchDiscoveryCandidates,
  type DiscoverySearchFilters,
} from "@/lib/services/discovery/discoverySearchService";
import { hasDelegatedPermission } from "@/lib/services/managedProfile/delegationService";
import { recordConsentEvent } from "@/lib/services/managedProfile/consentLog";
import {
  DESK_SEARCH_DAILY_LIMIT,
  DESK_SEARCH_PAGE_SIZE,
  DESK_SEARCH_WINDOW_MS,
} from "./clientDeskPolicy";

/**
 * A partner searching **as** their client.
 *
 * ## There is no second search
 *
 * This calls `searchDiscoveryCandidates(ownerUserId, …)` — the member's own
 * function, with the member's own id as the viewer. Not a copy, not a
 * partner-flavoured variant, not a wider `where`. Everything that protects a
 * member from a stranger's search protects them here too, for free and by
 * construction: the blocked-user list, `isVisible`, the draft/deleted filter,
 * the gender-preference narrowing, and above all the fact that
 * `DiscoverySearchFilters` simply has no field for caste, religion, income,
 * gotra or manglik. A filter nobody wrote cannot be searched on — and now
 * cannot be searched on *by a partner either*.
 *
 * That is the whole answer to "partner cannot access unassigned profiles
 * beyond ordinary public eligibility": the partner's reach is exactly the
 * client's reach, and the client's reach is exactly what it was before any
 * partner existed.
 *
 * ## What is taken away again
 *
 * Two things the member gets and the partner does not:
 *
 *  - **Photos.** Stripped from every row. A page of twenty faces is the
 *    closest thing in this product to a bulk export of the most sensitive
 *    field, and a matchmaker curating on facts does not need it. The owner
 *    sees the real card, photo and all, in their approval queue — which is the
 *    moment a face is actually relevant to a decision.
 *  - **Volume.** `DESK_SEARCH_DAILY_LIMIT` searches per (partner, client) per
 *    rolling day. Enough for honest curation, nowhere near a scrape.
 *
 * ## And it is never quiet
 *
 * Every search writes a `PARTNER_SEARCH_RUN` consent event against the
 * *owner*, so it appears on their own `/user/profile/access` history. Someone
 * who can look through your eyes should not be able to do it unobserved, and
 * an audit the subject cannot read is an audit for somebody else's benefit.
 */

export interface ClientSearchInput {
  partnerUserId: string;
  partnerId: string;
  partnerLabel: string;
  ownerUserId: string;
  filters: Omit<DiscoverySearchFilters, "pageSize">;
}

/** Same row the member sees, minus the photo — see the header. */
export interface ClientSearchRow {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  trustScore: number | null;
  /** True when this candidate has already been proposed to this owner. */
  alreadyProposed: boolean;
}

export type ClientSearchResult =
  | { ok: true; rows: ClientSearchRow[]; nextCursor: string | null; searchesLeftToday: number }
  | { ok: false; error: string; message: string; status: number };

export async function searchForClient(input: ClientSearchInput): Promise<ClientSearchResult> {
  const allowed = await hasDelegatedPermission(input.partnerUserId, input.ownerUserId, "SEARCH_FOR_CLIENT");
  if (!allowed) {
    return {
      ok: false,
      error: "FORBIDDEN",
      message: "Is client ke liye search karne ki permission nahi hai.",
      status: 403,
    };
  }

  const since = new Date(Date.now() - DESK_SEARCH_WINDOW_MS);
  const used = await prisma.consentEvent.count({
    where: {
      kind: "PARTNER_SEARCH_RUN",
      ownerUserId: input.ownerUserId,
      actorUserId: input.partnerUserId,
      createdAt: { gt: since },
    },
  });
  if (used >= DESK_SEARCH_DAILY_LIMIT) {
    return {
      ok: false,
      error: "RATE_LIMITED",
      message: `Ek din me ${DESK_SEARCH_DAILY_LIMIT} search kaafi hain. Kal dobara.`,
      status: 429,
    };
  }

  const page = await searchDiscoveryCandidates(input.ownerUserId, {
    ...input.filters,
    pageSize: Math.min(DESK_SEARCH_PAGE_SIZE, DISCOVERY_MAX_PAGE_SIZE),
  });

  const proposed = await prisma.candidateProposal.findMany({
    where: {
      ownerUserId: input.ownerUserId,
      candidateProfileId: { in: page.results.map((r) => r.profileId) },
    },
    select: { candidateProfileId: true },
  });
  const proposedSet = new Set(proposed.map((p) => p.candidateProfileId));

  await recordConsentEvent({
    kind: "PARTNER_SEARCH_RUN",
    ownerUserId: input.ownerUserId,
    actorUserId: input.partnerUserId,
    actorLabel: input.partnerLabel,
    // A count, never the filters. The filters are the owner's own preferences
    // and putting them in a log row would be storing a profile of the profile.
    detail: `${page.results.length} profile mile`,
  });

  return {
    ok: true,
    rows: page.results.map((r) => ({
      profileId: r.profileId,
      displayName: r.displayName,
      age: r.age,
      city: r.city,
      education: r.education,
      professionCategory: r.professionCategory,
      maritalStatus: r.maritalStatus,
      trustScore: r.trustScore,
      alreadyProposed: proposedSet.has(r.profileId),
    })),
    nextCursor: page.nextCursor,
    searchesLeftToday: Math.max(0, DESK_SEARCH_DAILY_LIMIT - used - 1),
  };
}

/**
 * The client's own saved preferences, so the desk opens pre-filled with what
 * the *owner* said they want rather than what the partner assumes.
 *
 * Read-only, and only the fields `DiscoverySearchFilters` already accepts —
 * so a preference the search cannot express (caste, income) is not smuggled
 * onto the desk as a starting point either.
 */
export async function getClientSearchDefaults(ownerUserId: string): Promise<Partial<DiscoverySearchFilters>> {
  const profile = await prisma.profile.findUnique({
    where: { userId: ownerUserId },
    select: {
      partnerPreferences: {
        select: { minAge: true, maxAge: true, preferredCities: true, educationPreference: true },
      },
    },
  });
  const prefs = profile?.partnerPreferences;
  if (!prefs) return {};

  return {
    minAge: prefs.minAge,
    maxAge: prefs.maxAge,
    cities: prefs.preferredCities ?? [],
    education: prefs.educationPreference,
  };
}
