import { redirect } from "next/navigation";

/**
 * Retired route.
 *
 * Profile building moved out of the dashboard shell into `/profile/build`
 * (route group `(onboarding)`). Keeping this path as a redirect rather than
 * deleting it means old links, bookmarks and the trust-score page's
 * "complete your profile" CTAs still land somewhere correct.
 */
export default function ProfileSetupPage() {
  redirect("/profile/build");
}
