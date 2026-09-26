import { router } from "expo-router";
import { Camera, Heart, PenLine } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { BrandMark, GlassCard, ListRow, PrimaryButton, Screen, Text } from "~/components";
import { useMyProfile } from "~/hooks/queries";
import { useSession } from "~/store/session";
import { haptics } from "~/utils/haptics";

/** The moment a profile goes live — and the two things that make it get answers. */
export default function SetupComplete() {
  const me = useMyProfile();
  const refresh = useSession((s) => s.refresh);
  const markActive = useSession((s) => s.markActive);

  useEffect(() => {
    haptics.success();
    markActive();
    void refresh();
  }, [markActive, refresh]);

  const values = me.data?.values ?? {};
  const suggestions = [
    !(me.data?.photos.length ?? 0) && { icon: Camera, title: "Add a photo", subtitle: "Photo wali profiles ko kai guna zyada jawab milte hain", route: "/setup/photos" },
    !values.partnerAgeRange && { icon: Heart, title: "Partner preferences", subtitle: "Reel aapki pasand ke hisaab se chunegi", route: "/setup/preferences" },
    !values.aboutMe && { icon: PenLine, title: "About me", subtitle: "Grio 3 drafts bana dega — aap chuniye", route: "/setup/about" },
  ].filter(Boolean) as Array<{ icon: typeof Camera; title: string; subtitle: string; route: string }>;

  return (
    <Screen footer={<PrimaryButton label="Explore Matches" onPress={() => router.replace("/home")} />}>
      <View style={styles.hero}>
        <Animated.View entering={ZoomIn.springify().damping(12)}>
          <BrandMark size={96} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(250).duration(500)} style={{ gap: 8 }}>
          <Text variant="display" center>
            Mubarak ho!
          </Text>
          <Text variant="h3" tone="gold" center>
            Aapki profile ab live hai
          </Text>
          <Text variant="body" tone="secondary" center>
            Ab rishte aapko dekh sakte hain aur aap Reel me roz naye, chune hue profiles dekhenge.
          </Text>
        </Animated.View>
      </View>
      {suggestions.length ? (
        <Animated.View entering={FadeIn.delay(500)}>
          <Text variant="label" tone="gold" style={{ marginBottom: 8 }}>
            Aur behtar banaiye
          </Text>
          <GlassCard padding={4}>
            <View style={{ paddingHorizontal: 12 }}>
              {suggestions.map((s, i) => (
                <ListRow key={s.title} icon={s.icon} title={s.title} subtitle={s.subtitle} onPress={() => router.push(s.route)} last={i === suggestions.length - 1} />
              ))}
            </View>
          </GlassCard>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 18, paddingVertical: 36 },
});
