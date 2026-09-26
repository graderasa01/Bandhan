import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Film, ShieldCheck, Sparkles } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark, GhostButton, GlassCard, Icon, PrimaryButton, RoomBackground, Text } from "~/components";
import { usePrefs } from "~/store/prefs";
import { layout, radius, useTheme } from "~/theme";

interface Slide {
  key: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
}

const SLIDES: Slide[] = [
  {
    key: "trust",
    icon: ShieldCheck,
    eyebrow: "Bharosa pehle",
    title: "Asli log, saaf irade",
    body: "Har profile ka trust score, verified photo aur mobile — taaki aap sirf serious rishton se milein.",
    points: ["Photo tabhi dikhti hai jab dono taraf bharosa ho", "Aapki jaankari aapke control me"],
  },
  {
    key: "reel",
    icon: Film,
    eyebrow: "Rishta Reel",
    title: "Roz naye, sahi rishte",
    body: "Aapki pasand, soch aur parivaar ke hisaab se chune hue profiles — ek-ek karke, aaram se.",
    points: ["Interest bhejiye, shortlist kijiye", "Match hone par baat shuru"],
  },
  {
    key: "grio",
    icon: Sparkles,
    eyebrow: "Grio, aapka AI saathi",
    title: "Bolkar profile banaiye",
    body: "Type karna zaroori nahi — boliye, Grio sun kar profile bhar dega. Aap har cheez dekh kar confirm karte hain.",
    points: ["Hindi, Hinglish ya apni bhasha me", "Behtar profile ke liye smart sujhav"],
  },
];

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

export default function Onboarding() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const setSeen = usePrefs((s) => s.setOnboardingSeen);
  const [index, setIndex] = useState(0);
  // The slide is sized to the list rather than stretched into it: on the web
  // the list's cell wrapper does not stretch its child, and a slide only as
  // tall as its content sat at the top with the screen's lower half empty.
  const [listHeight, setListHeight] = useState(0);
  const list = useRef<FlatList<Slide>>(null);
  // Stable for the list's whole life — FlatList does not allow swapping it.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }, []);

  const finish = () => {
    setSeen();
    router.replace("/welcome");
  };
  const next = () => {
    if (index >= SLIDES.length - 1) return finish();
    list.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <View style={styles.root}>
      <RoomBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.brand}>
          <BrandMark size={34} />
          <Text variant="h3" tone="heading">
            BandhanTak
          </Text>
        </View>
        <GhostButton label="Skip" onPress={finish} size="sm" />
      </View>

      <FlatList
        ref={list}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        style={styles.list}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }, listHeight > 0 && { height: listHeight }]}>
            <Animated.View entering={FadeInDown.duration(500)} style={styles.slideInner}>
              <View style={[styles.seal, { borderColor: t.colors.rim, backgroundColor: t.colors.accentSoft }]}>
                <Icon icon={item.icon} size={40} tone="gold" strokeWidth={1.6} />
              </View>
              <Text variant="label" tone="gold" center>
                {item.eyebrow}
              </Text>
              <Text variant="display" center>
                {item.title}
              </Text>
              <Text variant="body" tone="secondary" center style={styles.body}>
                {item.body}
              </Text>
              <GlassCard level="soft" padding={14} style={styles.points}>
                {item.points.map((p) => (
                  <View key={p} style={styles.point}>
                    <View style={[styles.dot, { backgroundColor: t.colors.gold }]} />
                    <Text variant="small" tone="primary" style={{ flex: 1 }}>
                      {p}
                    </Text>
                  </View>
                ))}
              </GlassCard>
            </Animated.View>
          </View>
        )}
      />

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.dots} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.pageDot,
                { backgroundColor: i === index ? t.colors.gold : t.colors.hairline, width: i === index ? 22 : 8 },
              ]}
            />
          ))}
        </View>
        <PrimaryButton label={index === SLIDES.length - 1 ? "Get Started" : "Next"} onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: layout.gutter },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  list: { flex: 1 },
  slide: { justifyContent: "center", paddingHorizontal: layout.gutter + 8 },
  slideInner: { alignItems: "center", gap: 12, maxWidth: layout.maxContentWidth, alignSelf: "center", width: "100%" },
  seal: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  body: { maxWidth: 360 },
  points: { alignSelf: "stretch", marginTop: 12 },
  point: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bottom: { paddingHorizontal: layout.gutter, gap: 18, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  pageDot: { height: 8, borderRadius: radius.pill },
});
