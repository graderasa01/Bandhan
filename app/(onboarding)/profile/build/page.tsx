import type { Metadata } from "next";
import InterviewMode from "@/components/profile/InterviewMode";

// The root layout appends "· BandhanTak" — don't repeat it here.
export const metadata: Metadata = {
  title: "Profile banayein",
};

// The Samajh Map is not rendered here. It belongs to InterviewMode's "live"
// phase — the screen a user reaches once their profile is actually live —
// because a map of "where you stand" shown *during* the build would be a map
// of an empty account, drawn over the form that is filling it.
export default function ProfileBuildPage() {
  return <InterviewMode />;
}
