import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { submitProfile } from "@/lib/services/profile/submitService";
import { refreshSession } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const t = await getT();

  const result = await submitProfile(user.id, t);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "VALIDATION_FAILED",
        message: "Profile submit karne se pehle ye fields bhar dijiye.",
        missing_required_fields: result.missingFields,
      },
      { status: 422 },
    );
  }

  // submitProfile() just flipped the User row to ACTIVE — without re-signing
  // the cookie, middleware's JWT-only status check (see middleware.ts) keeps
  // reading the old INCOMPLETE claim and bounces every /user/reel-style route
  // back to /profile/build until the user logs out and back in. Same fix as
  // save-draft/route.ts's justActivated branch.
  await refreshSession({ id: user.id, role: user.role, status: "ACTIVE" }, req);

  console.info(`[profile:submit] user=${user.id} profile=${result.profile.id}`);
  return NextResponse.json({ ok: true, profileStatus: result.profile.profileStatus });
}
