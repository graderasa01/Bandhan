import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { getProfileReadiness } from "@/lib/services/profile/readinessService";
import { FILLING_FOR_RESPONDENT } from "@/lib/services/profile/provenanceService";
import { canUsePhotoEnhance, canUsePhotoUltraEnhance } from "@/lib/services/plans/entitlements";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [profile, canPhotoEnhance, canPhotoUltraEnhance] = await Promise.all([
    getOrCreateProfile(user.id),
    canUsePhotoEnhance(user.id),
    canUsePhotoUltraEnhance(user.id),
  ]);
  const { percent, missingFields } = computeCompletion(profile);
  // `view.provenance` carries the full rows — confidence and the sentence a
  // value came from — which is what the review screen renders, so nothing here
  // needs a second provenance query.
  const view = await getProfileReadiness(profile);

  /**
   * Provenance, in the client draft's own `FieldMeta` shape.
   *
   * This is the fix for the failure the whole readiness rule rests on: the
   * client used to hydrate values from the server and metadata from
   * localStorage only. Clearing the cache, switching device or logging in
   * again therefore turned every unconfirmed AI reading into a plain,
   * confirmed-looking value — and a profile nobody had checked could go live
   * on the next autosave.
   */
  const meta = Object.fromEntries(
    [...view.provenance.entries()].map(([key, row]) => [
      key,
      {
        source:
          row.source === "AI_INFERRED"
            ? ("inferred" as const)
            : row.source === "BIODATA_EXTRACTED" || row.source === "USER_CONFIRMED_AI"
              ? ("ai" as const)
              : ("user" as const),
        confirmed: row.confirmed,
        // 0..100 in the column, 0..1 in the draft — same scale the extractor
        // produced, so a round trip can't inflate a 0.6 into 60.
        confidence: row.confidence === null ? undefined : row.confidence / 100,
        sourceSpan: row.sourceContext ?? undefined,
      },
    ]),
  );

  return NextResponse.json({
    canPhotoEnhance,
    canPhotoUltraEnhance,
    voiceSelfFillStatus: user.voiceSelfFillStatus,
    profileId: profile.id,
    profileStatus: profile.profileStatus,
    values: view.values,
    meta,
    fillingFor: FILLING_FOR_RESPONDENT[profile.respondentType] ?? "self",
    completionPercent: percent,
    missingFields,
    /** Server-persisted activation. The only thing a screen may call "live". */
    isLive: view.activatedOnServer,
    lifecycle: view.lifecycle,
    readiness: {
      ready: view.readiness.ready,
      done: view.readiness.done,
      total: view.readiness.total,
      blockers: view.readiness.blockers,
      needsReview: view.readiness.needsReview,
    },
    reviewQueue: view.reviewQueue,
    // Flat and small on purpose — PhotoUploadCard's whole read model, not a
    // relational shape callers have to know how to include themselves.
    photos: profile.photos
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        id: p.id,
        fileUrl: p.fileUrl,
        isPrimary: p.isPrimary,
        verificationStatus: p.verificationStatus,
        note: p.note,
        slotOrder: p.slotOrder,
        focalY: p.focalY,
      })),
  });
}
