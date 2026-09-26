import { router } from "expo-router";
import { CircleUserRound, Clapperboard, Heart, MessageCircle, Search, Sparkles, WandSparkles } from "lucide-react-native";
import { memo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { GlassCard, GrioSeal, Text } from "~/components";
import { GrioPill } from "./components/GrioPill";
import { useOpenGrio } from "./GrioProvider";

/**
 * Grio on Home — the day, one tap from each question a member actually asks
 * here. Every chip is the same turn as typing it into Grio (dashboard context,
 * so the conversation opens on the day's briefing); Search is the one plain
 * door. Counts are the app's own nav counts, and a chip carries one only when
 * it is real — never a placeholder number.
 */
export const GrioDashboardCard = memo(function GrioDashboardCard({
  unread,
  pendingInterests,
  profileComplete,
}: {
  unread: number;
  pendingInterests: number;
  profileComplete: boolean;
}) {
  const openGrio = useOpenGrio();
  const ask = (question: string) => openGrio({ kind: "dashboard" }, { ask: question });
  return (
    <GlassCard padding={16}>
      <View style={styles.head}>
        <GrioSeal size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Grio se poochhiye</Text>
          <Text variant="small" tone="secondary">
            Aaj ke rishtey, messages, profile — poochhiye ya kahiye, Grio dikha dega.
          </Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.rail}>
        <GrioPill tone="action" icon={Clapperboard} label="Today's Profiles" onPress={() => ask("Aaj ke profiles dikhao")} />
        <GrioPill
          icon={MessageCircle}
          label={unread > 0 ? `Unread Messages · ${unread}` : "Unread Messages"}
          onPress={() => ask("Mere unread messages kya hain?")}
        />
        <GrioPill
          icon={Heart}
          label={pendingInterests > 0 ? `Pending Interests · ${pendingInterests}` : "Pending Interests"}
          onPress={() => ask("Mera abhi kya pending hai?")}
        />
        {!profileComplete ? <GrioPill icon={CircleUserRound} label="Complete My Profile" onPress={() => ask("Meri profile me kya incomplete hai?")} /> : null}
        <GrioPill icon={WandSparkles} label="Improve My Profile" onPress={() => ask("Meri profile me kya sudhaar kar sakta hoon?")} />
        <GrioPill icon={Search} label="Search Profiles" onPress={() => router.navigate("/search")} />
        <GrioPill icon={Sparkles} label="Ask Grio" onPress={() => openGrio({ kind: "dashboard" })} />
      </ScrollView>
    </GlassCard>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  rail: { marginTop: 12, marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
});
