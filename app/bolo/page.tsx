import type { Metadata } from "next";
import { getProviderKey } from "@/lib/ai/credentials";
import { redirectSignedInUser } from "@/lib/auth/postLoginPath";
import { otpChannelStatus } from "@/lib/services/auth/contactOtpService";
import { getRollout, resolveAccess } from "@/lib/services/flags/featureFlagService";
import FocusShell from "@/components/layout/FocusShell";
import BoloExperience from "@/components/bolo/BoloExperience";

export const metadata: Metadata = {
  title: "Bol kar profile banayein — BandhanTak",
  description: "Grio se baat kijiye, 2 minute me shaadi ki profile taiyaar — bina form, bina password.",
};

// Reads the session cookie (redirectSignedInUser) and the admin's live
// settings, so it can't be prerendered.
export const dynamic = "force-dynamic";

/**
 * The spoken front door. Public: this is where the landing page's "Bol kar
 * profile banayein" lands, and where a family with no account starts.
 *
 * A signed-in member has a builder of their own (`/profile/build`), so they
 * are sent there rather than offered a second account.
 *
 * `FocusShell`, not `PublicShell`: the marketing header's Login / Register
 * buttons are the two things this page exists to make unnecessary.
 */
export default async function BoloPage() {
  await redirectSignedInUser();

  const [geminiKey, rollout] = await Promise.all([getProviderKey("GEMINI"), getRollout("voiceOnboarding")]);
  const voiceAvailable = Boolean(geminiKey) && resolveAccess(rollout, false) !== "closed";

  return (
    <FocusShell>
      <BoloExperience channels={otpChannelStatus()} voiceAvailable={voiceAvailable} />
    </FocusShell>
  );
}
