import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PROFILE_ONBOARDING } from "@/lib/auth/landingPath";
import InterviewMode from "@/components/profile/InterviewMode";

// The root layout appends "· BandhanTak" — don't repeat it here.
export const metadata: Metadata = {
  title: "Profile banayein",
};

// Build and edit only. Going live is not a screen here any more: the moment
// the server confirms the minimum profile, InterviewMode hands the user to
// `/user/dashboard?profile=live`, where a one-time banner says so and the
// day's rishtey are one tap away. Coming back to this URL later opens the
// editor directly.
//
// And not the first-time door either. A member whose account is still
// INCOMPLETE is sent to `/bolo`, where Grio carries on from whatever the
// profile already holds and asks only the rest — this page used to open on
// "who is this profile for?" all over again, however much of the profile
// existed. `?mode=manual` is the one exception: that link asks for the typed
// deck on purpose (Bolo's own "Fill Form Instead", Kundli's birth-time cards).
export default async function ProfileBuildPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams ?? Promise.resolve({ mode: undefined })]);
  if (user?.role === "USER" && user.status === "INCOMPLETE" && params.mode !== "manual") {
    redirect(PROFILE_ONBOARDING);
  }
  return <InterviewMode />;
}
