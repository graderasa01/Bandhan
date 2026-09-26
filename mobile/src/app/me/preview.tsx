import { ProfileDetails } from "~/features/profile/ProfileDetails";

/** "View Profile" — the member's own profile, as others see it. */
export default function MyProfilePreview() {
  return <ProfileDetails profileId="me" />;
}
