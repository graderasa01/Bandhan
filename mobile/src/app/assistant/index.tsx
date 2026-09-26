import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { MessagesSquare, Mic, ScanText, Search, Sparkles, WandSparkles } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { BrandMark, GlassCard, Icon, Screen, ScreenHeader, Text } from "~/components";
import { useOpenGrio } from "~/features/grio/GrioProvider";
import { useSession } from "~/store/session";
import { useTheme } from "~/theme";

const TOOLS: Array<{ icon: LucideIcon; title: string; body: string; route: string }> = [
  { icon: Mic, title: "Voice Profile Filling", body: "Boliye — Grio fields bharega, aap confirm karenge", route: "/assistant/voice" },
  { icon: WandSparkles, title: "Profile Improvement", body: "Kya missing hai jo log dhoondhte hain", route: "/assistant/improve" },
  { icon: ScanText, title: "Biodata se bhariye", body: "Paper biodata ki photo — Grio padh lega", route: "/me/biodata" },
  { icon: Search, title: "Search Assistance", body: "Seedhe shabdon me batao kaisa rishta chahiye", route: "/search" },
  { icon: MessagesSquare, title: "Chat with Grio", body: "Aaj ke rishtey, messages, profile — kuch bhi poochhiye ya kahiye", route: "/grio" },
];

/**
 * Grio, the AI companion — every AI tool in one place. The model behind each
 * is chosen on the server (/admin/ai-settings); no key or model lives in the
 * app, and nothing an AI reads is saved without the member confirming it.
 */
export default function AssistantHub() {
  const t = useTheme();
  // Search opens only once the member's own profile is live, as on the web.
  const active = useSession((s) => s.user?.status === "ACTIVE");
  const openGrio = useOpenGrio();
  const tools = TOOLS.filter((tool) => active || tool.route !== "/search");
  return (
    <Screen header={<ScreenHeader title="Grio AI" />}>
      <View style={styles.hero}>
        <BrandMark size={64} />
        <Text variant="h1" center>
          Namaste, main Grio hoon
        </Text>
        <Text variant="body" tone="secondary" center>
          Profile banane, behtar karne aur sahi rishta dhoondhne me madad karta hoon. Faisla hamesha aapka.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        {tools.map((tool) => (
          <GlassCard
            key={tool.title}
            padding={16}
            onPress={() =>
              tool.route === "/grio" ? openGrio({ kind: "general" }) : tool.route === "/search" ? router.navigate("/search") : router.push(tool.route)
            }
          >
            <View style={styles.row}>
              <View style={[styles.seal, { backgroundColor: t.colors.accentSoft, borderColor: t.colors.rim }]}>
                <Icon icon={tool.icon} size={22} tone="gold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{tool.title}</Text>
                <Text variant="small" tone="secondary">
                  {tool.body}
                </Text>
              </View>
              <Icon icon={Sparkles} size={16} tone="gold" />
            </View>
          </GlassCard>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, marginVertical: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  seal: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
