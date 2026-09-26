import { router } from "expo-router";
import { CircleCheck, Sparkles } from "lucide-react-native";
import { View } from "react-native";
import { AIInsightCard, ErrorState, GlassCard, Icon, Pill, PrimaryButton, ProgressRing, Screen, ScreenHeader, Skeleton, Text } from "~/components";
import { profileSuggestions } from "~/features/assistant/suggestions";
import { useOpenGrio } from "~/features/grio/GrioProvider";
import { useMyProfile } from "~/hooks/queries";

/** Profile improvement — the few things that would change the most, in order, each one tap from being fixed. */
export default function Improve() {
  const me = useMyProfile();
  const openGrio = useOpenGrio();
  const suggestions = profileSuggestions(me.data);

  return (
    <Screen header={<ScreenHeader title="Improve with AI" />}>
      {me.isPending ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={110} radius={20} />
          <Skeleton height={140} radius={20} />
        </View>
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <View style={{ gap: 14 }}>
          <GlassCard padding={16}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <ProgressRing percent={me.data.completionPercent} size={70} />
              <View style={{ flex: 1 }}>
                <Text variant="h3">{suggestions.length ? `${suggestions.length} cheezein profile ko behtar bana sakti hain` : "Profile bahut achhi hai!"}</Text>
                <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
                  Sabse zyada asar wali pehle.
                </Text>
              </View>
            </View>
          </GlassCard>

          {suggestions.length === 0 ? (
            <GlassCard active padding={16}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Icon icon={CircleCheck} size={22} tone="success" />
                <Text variant="body" style={{ flex: 1 }}>
                  Sab zaroori baatein bhari hui hain. Grio se bio ya pehli baat-cheet par sujhav le sakte hain.
                </Text>
              </View>
            </GlassCard>
          ) : (
            suggestions.map((s) => (
              <AIInsightCard
                key={s.key}
                eyebrow={s.impact === "high" ? "Sabse zyada asar" : "Achha rahega"}
                title={s.title}
                body={s.body}
                actionLabel={s.actionLabel}
                onAction={() => router.push(s.route)}
              >
                <View style={{ marginTop: 8 }}>
                  <Pill label={s.impact === "high" ? "High impact" : "Medium impact"} tone={s.impact === "high" ? "gold" : "neutral"} />
                </View>
              </AIInsightCard>
            ))
          )}

          <PrimaryButton
            label="Ask Grio to Review"
            icon={Sparkles}
            onPress={() => openGrio({ kind: "general" }, { ask: "Meri profile ko aur behtar kaise banaun?" })}
          />
        </View>
      )}
    </Screen>
  );
}
