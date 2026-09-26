import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { saveDraft } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { activateIfReady, getProfileReadiness } from "@/lib/services/profile/readinessService";
import { refreshSession } from "@/lib/auth/session";
import {
  RESPONDENT_FOR_FILLING,
  saveFieldProvenance,
  setRespondentType,
  type FieldMetaInput,
} from "@/lib/services/profile/provenanceService";
import type { FillingFor } from "@/lib/contracts/interview";

export const runtime = "nodejs";

const FILLING_FOR = new Set(Object.keys(RESPONDENT_FOR_FILLING));

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { values?: unknown; meta?: unknown; fillingFor?: unknown; activate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "values object hona chahiye." }, { status: 422 });
  }

  const saved = await saveDraft(user.id, values as Record<string, string>);

  // Provenance and "who is answering" ride along with the same autosave rather
  // than getting their own endpoint: they describe the values in this very
  // request, and a second round-trip is a second chance for the two to end up
  // describing different things. Both are optional — an older client that
  // sends only `values` keeps working exactly as before.
  const fillingFor =
    typeof body.fillingFor === "string" && FILLING_FOR.has(body.fillingFor)
      ? (body.fillingFor as FillingFor)
      : null;
  const respondentType = fillingFor
    ? await setRespondentType(saved.id, fillingFor)
    : saved.respondentType;

  if (body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
    await saveFieldProvenance(saved.id, body.meta as Record<string, FieldMetaInput>, respondentType);
  }

  // Provenance is written *before* readiness is evaluated, deliberately: this
  // request's own confirmations are part of the answer. Evaluating first would
  // mean a user's "haan, sahi hai" tap needed a second save before it counted
  // — and `activateIfReady` re-reads the provenance rows this call just wrote.
  //
  // `activate: false` saves without going live: the native app's spoken flow
  // (Bolo) keeps each answer on the server as it is given, so the full form
  // opened halfway shows it, but the profile only goes live from its review,
  // through `/api/bolo/complete` — the same "review, then live" the web's
  // /bolo keeps. Absent (every other caller), autosave activates as always.
  const hold = body.activate === false;
  const { view, justActivated, profileStatus } = hold
    ? { view: await getProfileReadiness(saved), justActivated: false, profileStatus: saved.profileStatus }
    : await activateIfReady(user.id, saved);

  if (justActivated) {
    // `refreshSession` re-signs the cookie so middleware's JWT-only status
    // check sees ACTIVE on the very next navigation, not just the DB.
    await refreshSession({ id: user.id, role: user.role, status: "ACTIVE" }, req);
  }

  const { percent, missingFields } = computeCompletion(saved);

  return NextResponse.json({
    profileId: saved.id,
    profileStatus,
    values: view.values,
    completionPercent: percent,
    /** Every required field still open, all stages — the "complete profile" list. */
    missingFields,
    /**
     * The authoritative answer, and the only one a screen may render as "live":
     * the server has persisted activation. A save that never lands leaves this
     * false, so an offline client cannot paint a success state.
     */
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
    justActivated,
  });
}
