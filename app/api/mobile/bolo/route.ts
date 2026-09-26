import { NextResponse } from "next/server";
import { getProviderKey } from "@/lib/ai/credentials";
import { getCurrentUser } from "@/lib/auth/session";
import { otpChannelStatus } from "@/lib/services/auth/contactOtpService";
import { loadBoloMember } from "@/lib/services/bolo/completeService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";

export const runtime = "nodejs";

/**
 * What the native app's spoken front door needs before its first frame — the
 * same three facts `app/bolo/page.tsx` works out on the server for the web:
 *
 *   - `member`: a signed-in member whose profile is not live yet, picked up
 *     where the profile already is (`loadBoloMember`); null for a visitor.
 *   - `voiceAvailable`: a Gemini key is set and the `voiceOnboarding` switch is
 *     not OFF — the server's word, so the app shows the right first screen.
 *   - `channels`: which contacts a one-time code can reach, so the last step is
 *     worded honestly (a code where one can go, a password where none can).
 *
 * Signed in and already past onboarding (live, or not a member account): 409 —
 * the web page redirects that person home, and the app does the same.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (user && !(user.role === "USER" && user.status === "INCOMPLETE")) {
    return NextResponse.json(
      { ok: false, error: "NOT_INCOMPLETE", message: "Profile pehle se poori hai." },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }

  const [member, geminiKey, rollout] = await Promise.all([
    user ? loadBoloMember(user) : Promise.resolve(null),
    getProviderKey("GEMINI"),
    getRollout("voiceOnboarding"),
  ]);

  return NextResponse.json(
    {
      ok: true,
      member,
      voiceAvailable: Boolean(geminiKey) && resolveAccess(rollout, false) !== "closed",
      channels: otpChannelStatus(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
