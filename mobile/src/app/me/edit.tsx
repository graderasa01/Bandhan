import { router } from "expo-router";
import { Check, ChevronRight } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { AIInsightCard, GlassCard, Icon, Screen, ScreenHeader, Skeleton, Text } from "~/components";
import { stepProgress } from "~/features/profile-setup/steps";
import { useMyProfile } from "~/hooks/queries";
import { useTheme } from "~/theme";

/**
 * Edit Profile — the same small steps as setup, opened in any order. One
 * editor for both, so a value is asked and stored the same way whether the
 * profile is new or years old.
 */
export default function EditProfile() {
  const t = useTheme();
  const me = useMyProfile();
  const progress = stepProgress(me.data).filter((p) => p.step.key !== "review");

  return (
    <Screen header={<ScreenHeader title="Edit Profile" />}>
      <View style={{ gap: 12 }}>
        <AIInsightCard
          eyebrow="Jaldi bharna hai?"
          title="Boliye, Grio bhar dega"
          body="Ek-do minute apne baare me boliye — jo samajh aayega wo review ke liye dikhega."
          actionLabel="Fill with Voice"
          onAction={() => router.push("/assistant/voice")}
        />
        {me.isPending
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} radius={16} />)
          : progress.map(({ step, answered, total, done }) => (
              <GlassCard key={step.key} padding={14} onPress={() => router.push(`/setup/${step.key}`)}>
                <View style={styles.row}>
                  <View style={[styles.seal, { backgroundColor: done ? t.colors.successBg : t.colors.accentSoft }]}>
                    <Icon icon={done ? Check : step.icon} size={19} tone={done ? "success" : "gold"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{step.title}</Text>
                    <Text variant="small" tone="muted">
                      {step.key === "photos" ? `${me.data?.photos.length ?? 0} photos` : `${answered}/${total} bhare`}
                    </Text>
                  </View>
                  <Icon icon={ChevronRight} size={18} tone="muted" />
                </View>
              </GlassCard>
            ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  seal: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
