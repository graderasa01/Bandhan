import { router } from "expo-router";
import { Bell, CircleHelp, Heart, LogOut, Palette, ShieldCheck, UserRound } from "lucide-react-native";
import { Alert, Platform, View } from "react-native";
import { GlassCard, ListRow, Screen, ScreenHeader, Text } from "~/components";
import { APP_VERSION, DATA_MODE } from "~/services/config";
import { useSession } from "~/store/session";
import { useThemeRoom } from "~/theme";

/** Settings — account, privacy, notifications, preferences, look, help, and logout. Member settings only; admin stays on the web. */
export default function Settings() {
  const signOut = useSession((s) => s.signOut);
  const user = useSession((s) => s.user);
  const { theme } = useThemeRoom();

  const confirmLogout = () => {
    if (Platform.OS === "web") return void signOut();
    Alert.alert("Logout karein?", "Is phone se aap sign out ho jayenge. Dobara login OTP ya password se hoga.", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <View style={{ gap: 16 }}>
        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={UserRound} title="Account" subtitle={user?.mobile ? `+91 ${user.mobile}` : (user?.email ?? undefined)} onPress={() => router.push("/settings/account")} />
            <ListRow icon={ShieldCheck} title="Privacy" subtitle="Photo privacy, incognito, search consent" onPress={() => router.push("/me/visibility")} />
            <ListRow icon={Bell} title="Notifications" onPress={() => router.push("/settings/notifications")} />
            <ListRow icon={Heart} title="Partner Preferences" subtitle="Reel aur search inhi se chalte hain" onPress={() => router.push("/setup/preferences")} />
            <ListRow icon={Palette} title="Appearance" value={theme.label} onPress={() => router.push("/settings/appearance")} last />
          </View>
        </GlassCard>

        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={CircleHelp} title="Help & Safety" onPress={() => router.push("/settings/help")} />
            <ListRow icon={LogOut} title="Logout" danger onPress={confirmLogout} last />
          </View>
        </GlassCard>

        <Text variant="caption" tone="muted" center>
          BandhanTak · v{APP_VERSION}
          {DATA_MODE === "mock" ? " · Demo data" : ""}
        </Text>
      </View>
    </Screen>
  );
}
