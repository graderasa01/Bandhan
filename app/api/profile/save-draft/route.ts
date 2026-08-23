import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { saveDraft } from "@/lib/services/profile/draftService";
import { submitProfile } from "@/lib/services/profile/submitService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { refreshSession } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
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

  let body: { values?: unknown; meta?: unknown; fillingFor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Request JSON padha nahi ja saka." }, { status: 400 });
  }

  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: "values object hona chahiye." }, { status: 422 });
  }

  const profile = await saveDraft(user.id, values as Record<string, string>);

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
    ? await setRespondentType(profile.id, fillingFor)
    : profile.respondentType;

  if (body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
    await saveFieldProvenance(profile.id, body.meta as Record<string, FieldMetaInput>, respondentType);
  }
  const { percent, missingFields, isLive, draftValues, isFullySubmittable } = computeCompletion(profile);

  let profileStatus = profile.profileStatus;
  let justActivated = false;

  // The moment every required field is filled, the account unlocks Reel /
  // Matches / Messages on its own — nobody was ever shown a separate
  // "Submit profile" button, so gating activation on one would have meant
  // it could never actually fire (see the bug this fixes: users stuck
  // INCOMPLETE forever, bounced off every gated page). `refreshSession`
  // re-signs the cookie so middleware's JWT-only status check sees ACTIVE
  // on the very next navigation, not just the DB.
  if (isFullySubmittable && profile.profileStatus !== "SUBMITTED" && profile.profileStatus !== "VERIFIED") {
    const t = await getT();
    const result = await submitProfile(user.id, t);
    if (result.ok) {
      profileStatus = result.profile.profileStatus;
      justActivated = true;
      await refreshSession({ id: user.id, role: user.role, status: "ACTIVE" }, req);
    }
  }

  return NextResponse.json({
    profileId: profile.id,
    profileStatus,
    values: draftValues,
    completionPercent: percent,
    missingFields,
    isLive,
    justActivated,
  });
}
