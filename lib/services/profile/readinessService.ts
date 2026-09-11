import { prisma } from "@/lib/db/prisma";
import type { ProfileStatus, SignalSource } from "@prisma/client";
import {
  evaluateReadiness,
  fieldsNeedingReview,
  lifecycleFor,
  type ProfileLifecycle,
  type ProfileReadiness,
  type ReadinessMeta,
  type ReadinessMetaMap,
} from "@/lib/profile/readiness";
import type { ProfileValues } from "@/lib/profile/stages";
import { profileTablesToDraftValues } from "./fieldMapping";
import { getFieldProvenance, type FieldProvenanceView } from "./provenanceService";
import type { ProfileWithSubTables } from "./completionService";

/**
 * The server's answer to "may this profile be live, and is it?".
 *
 * `lib/profile/readiness.ts` holds the rule; this holds the two things only the
 * server can supply — the persisted provenance the rule needs as its third
 * input, and whether activation actually landed in the database.
 *
 * Every gate in the app (dashboard, Reel, submission, partner visibility,
 * Grio's context, the client draft) now reads its answer from here or from the
 * same pure rule over the same data. Before this, four of them disagreed; see
 * that file's header for the list.
 */

/**
 * A stored `SignalSource` reduced to the client's three-word vocabulary.
 *
 * The mapping is the inverse of `provenanceService`'s `SOURCE_MAP`, with one
 * addition it has no client word for: `PARTNER_ENTERED`/`FAMILY_ENTERED` are
 * treated as human-entered, because the only writer of those is the managed
 * draft review — i.e. a real owner accepting a real proposal. They are somebody's
 * typing, not a model's reading.
 */
export function readinessSourceFor(source: SignalSource): ReadinessMeta["source"] {
  switch (source) {
    case "AI_INFERRED":
      return "inferred";
    case "BIODATA_EXTRACTED":
      return "ai";
    case "USER_CONFIRMED_AI":
      // Stored only when the user confirmed it, so it is already vouched for —
      // `confirmed` on the row says so too, and both agree on purpose.
      return "ai";
    default:
      return "user";
  }
}

export function readinessMetaFromProvenance(
  rows: Map<string, FieldProvenanceView>,
): ReadinessMetaMap {
  const out: ReadinessMetaMap = {};
  for (const [key, row] of rows) {
    out[key] = { source: readinessSourceFor(row.source), confirmed: row.confirmed };
  }
  return out;
}

/** True when the server has persisted this profile as visible and submitted. */
export function isActivatedOnServer(profile: {
  profileStatus: ProfileStatus;
  isVisible: boolean;
}): boolean {
  return profile.isVisible && (profile.profileStatus === "SUBMITTED" || profile.profileStatus === "VERIFIED");
}

export interface ProfileReadinessView {
  readiness: ProfileReadiness;
  /** The raw provenance rows, so a caller that needs confidence/source text doesn't re-query. */
  provenance: Map<string, FieldProvenanceView>;
  /** Draft-shaped values read back out of the profile's own tables. */
  values: ProfileValues;
  meta: ReadinessMetaMap;
  /** Every field (not only the minimum eight) still holding an unconfirmed AI value. */
  reviewQueue: string[];
  lifecycle: ProfileLifecycle;
  /** The database's own answer, never the rule's opinion of it. */
  activatedOnServer: boolean;
}

/**
 * Readiness for a profile already loaded with `PROFILE_FULL_INCLUDE`.
 *
 * One extra query (the provenance rows), which is the price of the whole
 * "an unconfirmed AI value cannot activate a profile" guarantee.
 */
export async function getProfileReadiness(
  profile: ProfileWithSubTables,
): Promise<ProfileReadinessView> {
  const values = profileTablesToDraftValues({
    profile,
    basicDetails: profile.basicDetails,
    education: profile.education,
    profession: profile.profession,
    family: profile.family,
    lifestyle: profile.lifestyle,
    partnerPreferences: profile.partnerPreferences,
  });

  let provenance = new Map<string, FieldProvenanceView>();
  let meta: ReadinessMetaMap = {};
  try {
    provenance = await getFieldProvenance(profile.id);
    meta = readinessMetaFromProvenance(provenance);
  } catch (err) {
    // Same rule the config services follow: a DB hiccup must not invent a
    // *stricter* answer than the truth either. With no provenance the rule
    // falls back to "values only", which is what it did before this existed.
    console.error(
      "[profile:readiness] provenance read failed, evaluating on values only:",
      err instanceof Error ? err.message : String(err),
    );
  }

  const readiness = evaluateReadiness(values, meta);
  const activatedOnServer = isActivatedOnServer(profile);

  return {
    readiness,
    provenance,
    values,
    meta,
    reviewQueue: fieldsNeedingReview(values, meta),
    activatedOnServer,
    lifecycle: lifecycleFor({
      readiness,
      hasAnyValue: Object.values(values).some((v) => (v ?? "").trim().length > 0),
      activatedOnServer,
    }),
  };
}

/**
 * Flip the profile live when — and only when — the minimum rule passes.
 *
 * This replaces the old condition, which required *every* required field in
 * *every* stage before it would activate anything. Stage 2's four required
 * fields are what make a profile good; they were never what makes it visible,
 * and gating activation on them is why users finished the eight-field deck,
 * were congratulated, and then bounced off every gated page.
 *
 * Returns `justActivated` so the caller can re-sign the session cookie —
 * middleware reads status from the JWT, not the row.
 */
export async function activateIfReady(
  userId: string,
  profile: ProfileWithSubTables,
): Promise<{ view: ProfileReadinessView; justActivated: boolean; profileStatus: ProfileStatus }> {
  const view = await getProfileReadiness(profile);

  if (!view.readiness.ready || view.activatedOnServer) {
    return { view, justActivated: false, profileStatus: profile.profileStatus };
  }
  // A moderation decision is not something an autosave gets to undo. REJECTED
  // and BLOCKED profiles stay exactly where an admin put them, however complete
  // they become afterwards.
  if (profile.profileStatus === "REJECTED" || profile.profileStatus === "BLOCKED") {
    return { view, justActivated: false, profileStatus: profile.profileStatus };
  }

  // VERIFIED is a stronger state an admin granted; only the visibility flag
  // needs setting, never a walk back to SUBMITTED.
  const nextStatus: ProfileStatus = profile.profileStatus === "VERIFIED" ? "VERIFIED" : "SUBMITTED";

  await prisma.$transaction([
    prisma.profile.update({
      where: { id: profile.id },
      data: {
        profileStatus: nextStatus,
        submittedAt: profile.submittedAt ?? new Date(),
        isVisible: true,
      },
    }),
    // Only ever a promotion out of INCOMPLETE. `updateMany` with the status in
    // the filter is what keeps a SUSPENDED or BLOCKED account from being
    // silently reinstated by finishing a profile — the old `submitProfile` set
    // ACTIVE unconditionally.
    prisma.user.updateMany({
      where: { id: userId, status: "INCOMPLETE" },
      data: { status: "ACTIVE" },
    }),
  ]);

  return {
    view: { ...view, activatedOnServer: true, lifecycle: "live" },
    justActivated: true,
    profileStatus: nextStatus,
  };
}
