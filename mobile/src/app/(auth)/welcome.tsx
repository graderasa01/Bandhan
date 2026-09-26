import { router } from "expo-router";
import { BadgeCheck, Lock, Mic, Users } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { BrandMark, GlassCard, Icon, PrimaryButton, Screen, SecondaryButton, Text } from "~/components";
import { IS_MOCK } from "~/services/config";
import { MOCK_EXISTING_MOBILE, MOCK_OTP } from "~/mocks/mockDb";

const PROMISES = [
  { icon: BadgeCheck, text: "Verified profiles" },
  { icon: Lock, text: "Photo privacy" },
  { icon: Users, text: "Family ke saath" },
];

export default function Welcome() {
  return (
    <Screen
      footer={
        <View style={styles.actions}>
          {/* The front door is the conversation: profile first, the number at the end. */}
          <PrimaryButton label="Create Profile" icon={Mic} onPress={() => router.push("/bolo")} />
          <Text variant="caption" tone="secondary" center style={styles.caption}>
            Bol kar profile banayein — Grio se baat karke, tap karke ya likh kar. 2 minute.
          </Text>
          <SecondaryButton label="Login" onPress={() => router.push("/login")} />
          {IS_MOCK ? (
            <Text variant="caption" tone="muted" center>
              Demo mode: login ke liye {MOCK_EXISTING_MOBILE} aur OTP {MOCK_OTP}
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={styles.hero}>
        <Animated.View entering={FadeInDown.duration(600)} style={styles.brand}>
          <BrandMark size={84} />
          <Text variant="display" center style={styles.title}>
            BandhanTak
          </Text>
          <Text variant="h3" tone="gold" center>
            Rishta, bharose ke saath
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={{ width: "100%" }}>
          <Text variant="body" tone="secondary" center style={styles.lead}>
            Parivaar ki tarah sochne wala matrimony app — serious rishte, asli log, aur aapki privacy har kadam par.
          </Text>
          <GlassCard level="soft" padding={14} style={styles.promises}>
            <View style={styles.promiseRow}>
              {PROMISES.map((p) => (
                <View key={p.text} style={styles.promise}>
                  <Icon icon={p.icon} size={22} tone="gold" />
                  <Text variant="caption" tone="secondary" center>
                    {p.text}
                  </Text>
                </View>
              ))}
            </View>
          </GlassCard>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, paddingVertical: 24 },
  brand: { alignItems: "center", gap: 6 },
  title: { marginTop: 12 },
  lead: { marginHorizontal: 8 },
  promises: { marginTop: 22 },
  promiseRow: { flexDirection: "row", justifyContent: "space-around" },
  promise: { alignItems: "center", gap: 6, flex: 1 },
  actions: { gap: 12 },
  caption: { marginTop: -4, marginBottom: 2 },
});
