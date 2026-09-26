import * as WebBrowser from "expo-web-browser";
import { BookOpen, MessageCircleQuestion, PhoneCall, ShieldAlert, Sparkles } from "lucide-react-native";
import { Linking, View } from "react-native";
import { GlassCard, ListRow, Screen, ScreenHeader, Text } from "~/components";
import { useOpenGrio } from "~/features/grio/GrioProvider";
import { WEB_ORIGIN } from "~/services/config";

const TIPS = [
  "Pehli mulaqat hamesha public jagah par, ghar walon ko bata kar.",
  "Paise, OTP ya bank detail kisi ko kabhi na dein — chahe wajah kuch bhi ho.",
  "Video call se pehle personal number share karne ki jaldi nahi.",
  "Kuch galat lage to profile par Report dabaiye — aapka naam kabhi nahi bataya jaata.",
];

export default function Help() {
  const openGrio = useOpenGrio();
  return (
    <Screen header={<ScreenHeader title="Help & Safety" />}>
      <View style={{ gap: 16 }}>
        <GlassCard padding={16}>
          <Text variant="label" tone="gold">
            Surakshit rahiye
          </Text>
          {TIPS.map((tip) => (
            <Text key={tip} variant="body" tone="secondary" style={{ marginTop: 8 }}>
              • {tip}
            </Text>
          ))}
        </GlassCard>

        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={Sparkles} title="Ask Grio" subtitle="App ka koi bhi sawaal" onPress={() => openGrio({ kind: "general" })} />
            <ListRow icon={ShieldAlert} title="Safety Centre" subtitle="bandhantak.com/safety" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/safety`)} />
            <ListRow icon={BookOpen} title="How BandhanTak Works" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/how-it-works`)} />
            <ListRow icon={MessageCircleQuestion} title="Plans & Pricing" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/pricing`)} />
            <ListRow icon={PhoneCall} title="Emergency" subtitle="Khatre me hon to 112" onPress={() => void Linking.openURL("tel:112")} last />
          </View>
        </GlassCard>
      </View>
    </Screen>
  );
}
