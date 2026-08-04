import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";

/**
 * Stable, nav-linkable alias — callers never need to know their own profile
 * id. `/user/profile/[id]` already renders a fully-ungated view once the
 * viewer is the owner (see getProfileVisibility's isSelf branch), so this
 * page does nothing but resolve "me" to that real id and hand off.
 */
export default async function MyProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/profile/me");

  const profile = await getOrCreateProfile(user.id);
  redirect(`/user/profile/${profile.id}`);
}
