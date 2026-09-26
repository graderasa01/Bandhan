import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Camera, ExternalLink, ImagePlus, ScanText } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AIInsightCard, GlassCard, Icon, ListRow, Screen, ScreenHeader, Text, toast } from "~/components";
import { ExtractionReview } from "~/features/assistant/ExtractionReview";
import { useMyProfile } from "~/hooks/queries";
import { ai, AiError, type ExtractedValue } from "~/services/ai";
import { WEB_ORIGIN } from "~/services/config";
import { pickPhoto } from "~/services/media";
import { useTheme } from "~/theme";

/**
 * Biodata, both directions:
 *   - in: a photo of the family's paper biodata → Grio reads it
 *     (`/api/profile/biodata`, vision) → the member ticks what is right;
 *   - out: the shareable biodata PDF, which the website builds.
 */
export default function Biodata() {
  const t = useTheme();
  const me = useMyProfile();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractedValue[] | null>(null);

  async function read(source: "camera" | "library") {
    const picked = await pickPhoto(source);
    if (!picked.ok) {
      if (picked.reason === "denied") toast.error("Permission chahiye — settings me allow kijiye.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await ai.readBiodata({ uri: picked.image.uri, mimeType: picked.image.mimeType, fillingFor: me.data?.fillingFor ?? "self" });
      if (!res.looksLikeBiodata) toast.info("Ye biodata jaisa nahi laga — jo mila wo neeche hai.");
      setResult(res.values);
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Biodata padha nahi ja saka.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<ScreenHeader title="Biodata" />}>
      <View style={{ gap: 16 }}>
        <AIInsightCard
          eyebrow="AI se profile bhariye"
          title="Paper wala biodata hai?"
          body="Uski saaf photo lijiye — Grio padh kar fields nikalega. Save sirf wahi hoga jo aap tick karenge."
        />
        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow icon={Camera} title="Take photo of biodata" subtitle="Achhi roshni me, poora page frame me" onPress={() => void read("camera")} />
            <ListRow icon={ImagePlus} title="Choose from gallery" subtitle="JPG / PNG photo" onPress={() => void read("library")} last />
          </View>
        </GlassCard>

        {busy ? (
          <GlassCard padding={20}>
            <View style={{ alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={t.colors.gold} />
              <Text variant="small" tone="secondary">
                Grio biodata padh raha hai… (10-20 second)
              </Text>
            </View>
          </GlassCard>
        ) : null}

        {result && me.data ? (
          <ExtractionReview
            values={result}
            current={me.data.values}
            onSaved={() => {
              setResult(null);
              router.push("/setup");
            }}
          />
        ) : null}

        <GlassCard padding={4}>
          <View style={{ paddingHorizontal: 12 }}>
            <ListRow
              icon={ScanText}
              title="Download biodata PDF"
              subtitle="Website par banta hai — family ke saath share kijiye"
              right={<Icon icon={ExternalLink} size={16} tone="muted" />}
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/user/biodata`)}
              last
            />
          </View>
        </GlassCard>
      </View>
    </Screen>
  );
}
