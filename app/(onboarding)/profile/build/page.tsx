import type { Metadata } from "next";
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
export default function ProfileBuildPage() {
  return <InterviewMode />;
}
