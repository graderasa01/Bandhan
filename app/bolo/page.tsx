import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProviderKey } from "@/lib/ai/credentials";
import { getCurrentUser } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/postLoginPath";
import { otpChannelStatus } from "@/lib/services/auth/contactOtpService";
import { loadBoloMember } from "@/lib/services/bolo/completeService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import BoloExperience from "@/components/bolo/BoloExperience";

export const metadata: Metadata = {
  title: "Bol kar profile banayein — BandhanTak",
  description: "Grio se baat kijiye, 2 minute me shaadi ki profile taiyaar — bina lambe form ke.",
};

// Reads the session cookie and the admin's live settings, so it can't be
// prerendered.
export const dynamic = "force-dynamic";

/**
 * The spoken front door — and the one place an unfinished profile gets
 * finished.
 *
 *   - No session: a visitor. Profile first, then a number and a code (or,
 *     where no code can reach the number, a password of their own), then the
 *     account. This is where the landing page's "Bol kar profile banayein"
 *     lands.
 *   - A USER still INCOMPLETE: a member. They registered, signed in with
 *     Google or a code, or saved a draft halfway — every one of those lands
 *     here (`landingPathForRole`). Grio starts from what the profile already
 *     holds and asks only the rest; no number, no code, no second account.
 *   - Anyone else signed in has a home of their own and is sent there.
 *
 * No shell, not even `FocusShell`: the page draws its own one-line header
 * (`BoloHeader`) because that header carries the profile's progress, and a
 * sticky bar over a two-minute conversation is room the question needs. The
 * marketing header's Login / Register buttons stay out for the same reason as
 * before — they are the two things this page exists to make unnecessary. The
 * canvas island is kept for its tokens (the warm neutrals, the serif), not a
 * painted ground: the conversation sits on plain ivory.
 */
export default async function BoloPage() {
  const user = await getCurrentUser();
  if (user && !(user.role === "USER" && user.status === "INCOMPLETE")) {
    redirect(await postLoginPath(user));
  }

  const [member, geminiKey, rollout] = await Promise.all([
    user ? loadBoloMember(user) : Promise.resolve(null),
    getProviderKey("GEMINI"),
    getRollout("voiceOnboarding"),
  ]);
  const voiceAvailable = Boolean(geminiKey) && resolveAccess(rollout, false) !== "closed";

  return (
    <div className="bt-canvas bt-canvas--dense min-h-dvh bg-bg-subtle">
      <BoloExperience channels={otpChannelStatus()} voiceAvailable={voiceAvailable} member={member} />
    </div>
  );
}
