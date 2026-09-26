import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Heart, MessageCircle, Send, Sparkles } from "lucide-react-native";
import { Linking, Platform, View } from "react-native";
import { AIInsightCard, GlassCard, ListRow, PrimaryButton, Screen, ScreenHeader, Text, toast } from "~/components";
import { pushPermission, registerDevice, requestPushPermission } from "~/services/push";
import { usePrefs } from "~/store/prefs";

/**
 * Notifications — the phone's permission, asked from our own explainer (never
 * cold on first launch), and what the member will be told about. The events
 * are the server's `createNotice()` kinds; delivery to phones is the server
 * step listed in the README.
 */
export default function NotificationSettings() {
  const qc = useQueryClient();
  const setAsked = usePrefs((s) => s.setPushAsked);
  const permission = useQuery({ queryKey: ["push-permission"], queryFn: pushPermission });

  async function enable() {
    setAsked();
    const result = await requestPushPermission();
    void qc.invalidateQueries({ queryKey: ["push-permission"] });
    if (result === "granted") {
      const reg = await registerDevice();
      toast.success(reg.ok ? "Notifications on ho gaye" : "Permission mil gayi");
    } else if (result === "denied") {
      toast.error("Phone settings me BandhanTak ke notifications allow kijiye.");
    }
  }

  const status = permission.data;

  return (
    <Screen header={<ScreenHeader title="Notifications" />}>
      <View style={{ gap: 16 }}>
        {status === "unsupported" ? (
          <AIInsightCard eyebrow="Is device par" title="Push notifications phone app par milte hain" body="Web preview me notifications nahi aate — inbox me sab dikhta rahega." />
        ) : status !== "granted" ? (
          <GlassCard padding={18} active>
            <Text variant="h3">Koi jawab miss na ho</Text>
            <Text variant="body" tone="secondary" style={{ marginTop: 4 }}>
              Naya interest, match ya message aate hi aapko pata chalega. Naam lock screen par kabhi nahi dikhta.
            </Text>
            <PrimaryButton
              label={status === "denied" ? "Open Phone Settings" : "Turn On Notifications"}
              icon={BellRing}
              onPress={status === "denied" ? () => void Linking.openSettings() : () => void enable()}
              style={{ marginTop: 14 }}
            />
          </GlassCard>
        ) : (
          <GlassCard padding={16}>
            <Text variant="bodyStrong">Notifications on hain ✓</Text>
            <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
              {Platform.OS === "ios" ? "iPhone Settings" : "Phone settings"} se kabhi bhi band kar sakte hain.
            </Text>
          </GlassCard>
        )}

        <Text variant="label" tone="gold">
          Kin baaton par batayenge
        </Text>
        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={Send} title="New interests" subtitle="Kisi ne aapko interest bheja" />
            <ListRow icon={Heart} title="Matches & accepted interests" subtitle="Dono taraf se haan" />
            <ListRow icon={MessageCircle} title="New messages" subtitle="Aapke matches ke messages" />
            <ListRow icon={Sparkles} title="Profile reminders" subtitle="Grio ke kaam ke sujhav — kabhi-kabhi" last />
          </View>
        </GlassCard>
      </View>
    </Screen>
  );
}
