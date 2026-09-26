import { router } from "expo-router";
import { Check, ChevronRight, Mic, Settings } from "lucide-react-native";
import { RefreshControl, StyleSheet, View } from "react-native";
import {
  AIInsightCard,
  ErrorState,
  GlassCard,
  Icon,
  IconButton,
  Pill,
  PrimaryButton,
  ProgressRing,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
} from "~/components";
import { nextStep, stepProgress } from "~/features/profile-setup/steps";
import { useMyProfile } from "~/hooks/queries";
import { useSession } from "~/store/session";
import { useTheme } from "~/theme";

const LIFECYCLE_LABEL: Record<string, { label: string; tone: "gold" | "success" | "neutral" | "info" }> = {
  empty: { label: "Shuru karein", tone: "neutral" },
  draft: { label: "Draft saved", tone: "neutral" },
  needs_review: { label: "Review baaki", tone: "info" },
  ready: { label: "Live hone ko taiyaar", tone: "gold" },
  live: { label: "Profile live", tone: "success" },
};

/**
 * The full form — every step of the profile, each one small. It is the
 * fallback, not the front door: an unfinished profile is finished in Bolo
 * (the conversation), and this is what its "Open Full Form" opens, for
 * whoever would rather see every field. Both write the same profile.
 */
export default function SetupOverview() {
  const t = useTheme();
  const me = useMyProfile();
  const active = useSession((s) => s.user?.status === "ACTIVE");
  const progress = stepProgress(me.data);
  const readiness = me.data?.readiness;
  const life = LIFECYCLE_LABEL[me.data?.lifecycle ?? "empty"] ?? LIFECYCLE_LABEL.empty!;

  return (
    <Screen
      header={
        <ScreenHeader
          title={active ? "Profile Setup" : "Full Form"}
          back
          onBack={() => (router.canGoBack() ? router.back() : router.replace(active ? "/home" : "/bolo"))}
          right={<IconButton icon={Settings} label="Settings" size={42} onPress={() => router.push("/settings")} />}
        />
      }
      refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} tintColor={t.colors.gold} />}
      footer={
        me.data ? (
          <PrimaryButton
            label={me.data.isLive ? "Go to Home" : "Continue Setup"}
            onPress={() => (me.data?.isLive && active ? router.replace("/home") : router.push(`/setup/${nextStep(me.data)}`))}
          />
        ) : null
      }
    >
      {me.isPending ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={130} radius={20} />
          <Skeleton height={110} radius={20} />
          <Skeleton height={64} radius={16} />
          <Skeleton height={64} radius={16} />
        </View>
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <View style={styles.stack}>
          <GlassCard padding={18}>
            <View style={styles.hero}>
              <ProgressRing percent={me.data.completionPercent} size={82} stroke={7} label="Profile completion" />
              <View style={{ flex: 1, gap: 6 }}>
                <Pill label={life.label} tone={life.tone} />
                <Text variant="h3">
                  {me.data.isLive ? "Aapki profile live hai" : `Live hone ke liye ${readiness?.done ?? 0}/${readiness?.total ?? 8} zaroori baatein`}
                </Text>
                <Text variant="small" tone="secondary">
                  {me.data.isLive
                    ? "Jitni poori profile, utne behtar rishte. Baaki steps kabhi bhi bhariye."
                    : "Naam, umar, kad, sheher, marital status, padhai aur kaam — itna hote hi profile live."}
                </Text>
              </View>
            </View>
          </GlassCard>

          {active ? (
            <AIInsightCard
              eyebrow="Grio se bolkar bhariye"
              title="Type karna zaroori nahi"
              body="Apne baare me boliye — Grio sun kar baaki fields bhar dega, aap har cheez check karke confirm karenge."
              actionLabel="Fill with Voice"
              onAction={() => router.push("/assistant/voice")}
            />
          ) : (
            <AIInsightCard
              eyebrow="Grio ke saath"
              title="Form ki jagah baat-cheet"
              body="Ek-ek sawaal, tap karke, likh kar ya bol kar — profile saamne bharti jaati hai. Yahan jo bhara wo wahan bhi dikhega."
              actionLabel="Talk to Grio"
              onAction={() => (router.canGoBack() ? router.back() : router.replace("/bolo"))}
            />
          )}

          <View style={{ gap: 10 }}>
            {progress.map(({ step, answered, total, done }) => (
              <GlassCard key={step.key} padding={14} onPress={() => router.push(`/setup/${step.key}`)} accessibilityLabel={`${step.title}, ${done ? "done" : `${answered} of ${total}`}`}>
                <View style={styles.row}>
                  <View style={[styles.seal, { backgroundColor: done ? t.colors.successBg : t.colors.accentSoft }]}>
                    <Icon icon={done ? Check : step.icon} size={19} tone={done ? "success" : "gold"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{step.title}</Text>
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {step.key === "photos"
                        ? done ? "Photo lag gayi" : "Abhi koi photo nahi"
                        : step.key === "review"
                          ? done ? "Profile live" : "Aakhri nazar"
                          : `${answered}/${total} bhare${step.optional ? " · optional" : ""}`}
                    </Text>
                  </View>
                  <Icon icon={ChevronRight} size={18} tone="muted" />
                </View>
              </GlassCard>
            ))}
          </View>

          <View style={styles.voiceRow}>
            <Icon icon={Mic} size={14} tone="muted" />
            <Text variant="caption" tone="muted">
              Har jawab apne aap save hota hai — baad me yahin se aage badhiye.
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16, paddingTop: 4 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  seal: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
});
