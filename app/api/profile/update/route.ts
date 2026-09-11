import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { saveDraft } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { activateIfReady } from "@/lib/services/profile/readinessService";

export const runtime = "nodejs";

// Same underlying upsert as save-draft — M03E lists /update (PATCH, post-
// submit edits) and /save-draft (POST, pre-submit) separately, but both are
// "merge these field values in", so they share one service.
export async function PATCH(req: Request) {
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
  // A post-submit edit can also be the edit that finally clears the minimum
  // gate (or the one that fixes an invalid value), so this path goes through
  // the same single activation call the autosave does.
  const { view, profileStatus } = await activateIfReady(user.id, profile);
  const { percent, missingFields } = computeCompletion(profile);

  return NextResponse.json({
    profileId: profile.id,
    profileStatus,
    values: view.values,
    completionPercent: percent,
    missingFields,
    isLive: view.activatedOnServer,
    readiness: {
      ready: view.readiness.ready,
      done: view.readiness.done,
      total: view.readiness.total,
      blockers: view.readiness.blockers,
    },
  });
}
