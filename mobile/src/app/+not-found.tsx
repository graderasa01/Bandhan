import { router } from "expo-router";
import { Compass } from "lucide-react-native";
import { EmptyState, Screen } from "~/components";

export default function NotFound() {
  return (
    <Screen>
      <EmptyState
        icon={Compass}
        title="Ye page nahi mila"
        description="Link purana ho sakta hai. Home par chaliye."
        actionLabel="Go Home"
        onAction={() => router.replace("/")}
      />
    </Screen>
  );
}
