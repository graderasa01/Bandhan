import { useLocalSearchParams } from "expo-router";
import { ProfileDetails } from "~/features/profile/ProfileDetails";

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileDetails profileId={id} />;
}
