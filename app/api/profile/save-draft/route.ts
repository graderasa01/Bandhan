import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { saveDraft } from "@/lib/services/profile/draftService";
import { submitProfile } from "@/lib/services/profile/submitService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { refreshSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: { values?: unknown };
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
    const result = await submitProfile(user.id);
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
