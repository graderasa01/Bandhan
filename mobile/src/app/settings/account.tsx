import * as WebBrowser from "expo-web-browser";
import { BadgeCheck, KeyRound, Mail, Smartphone, Trash2 } from "lucide-react-native";
import { Alert, Platform, View } from "react-native";
import { GlassCard, ListRow, Pill, Screen, ScreenHeader, Text } from "~/components";
import { WEB_ORIGIN } from "~/services/config";
import { useSession } from "~/store/session";

/** The account behind the profile: contact, verification, password, deletion. */
export default function Account() {
  const user = useSession((s) => s.user);

  const requestDeletion = () => {
    const open = () => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/safety`);
    if (Platform.OS === "web") return open();
    Alert.alert(
      "Account delete karna hai?",
      "Account aur profile hamesha ke liye hat jayenge. Abhi ye request support team poori karti hai — agle kadam website par.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", style: "destructive", onPress: open },
      ],
    );
  };

  return (
    <Screen header={<ScreenHeader title="Account" />}>
      <View style={{ gap: 16 }}>
        <GlassCard padding={16}>
          <Text variant="caption" tone="muted">
            Account holder
          </Text>
          <Text variant="h2">{user?.full_name ?? ""}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {user?.mobile_verified_at || user?.email_verified_at ? <Pill label="Contact verified" tone="success" icon={BadgeCheck} /> : <Pill label="Not verified" tone="gold" />}
          </View>
        </GlassCard>

        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={Smartphone} title="Mobile" value={user?.mobile ? `+91 ${user.mobile}` : "—"} />
            <ListRow icon={Mail} title="Email" value={user?.email ?? "—"} />
            <ListRow
              icon={KeyRound}
              title="Password"
              subtitle="Badalne ke liye reset link"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/forgot-password`)}
              last
            />
          </View>
        </GlassCard>

        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={Trash2} title="Delete Account" subtitle="Profile aur saara data hamesha ke liye" danger onPress={requestDeletion} last />
          </View>
        </GlassCard>
      </View>
    </Screen>
  );
}
