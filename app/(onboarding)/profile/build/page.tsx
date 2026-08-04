import type { Metadata } from "next";
import InterviewMode from "@/components/profile/InterviewMode";

// The root layout appends "· BandhanTak" — don't repeat it here.
export const metadata: Metadata = {
  title: "Profile banayein",
};

export default function ProfileBuildPage() {
  return <InterviewMode />;
}
