import { Check } from "lucide-react-native";
import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Appear, GlassSurface, Icon, Text } from "~/components";
import { useTheme } from "~/theme";

export interface BubbleContent {
  /** A new id is a new answer — the only thing that animates. */
  id: number;
  text: string;
  /** `accepted`: in the draft, ticked. `sent`: typed to a live Grio, not saved yet. */
  state: "accepted" | "sent";
}

/**
 * The latest answer, in the member's own corner (the web's `AnswerBubble`):
 * one bubble, not a chat log — "Aap · 12 May 1995 ✓" — and the next answer
 * replaces it. It shows what the draft *accepted*, never a raw transcript.
 */
export const AnswerBubble = memo(function AnswerBubble({ content }: { content: BubbleContent | null }) {
  if (!content) return null;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite" accessibilityLabel={`Aap: ${content.text}`}>
      <Appear key={content.id} from="below" distance={8} duration={260} style={styles.slot}>
        <GlassSurface level="soft" radius={999} style={styles.bubble}>
          <Text variant="smallStrong" style={styles.you}>
            Aap
          </Text>
          <Text variant="small" tone="muted">
            ·
          </Text>
          <Text variant="small" tone={content.state === "sent" ? "secondary" : "primary"} numberOfLines={1} style={styles.value}>
            {content.text}
          </Text>
          {content.state === "accepted" ? <Tick /> : <Dots />}
        </GlassSurface>
      </Appear>
    </View>
  );
});

const Tick = memo(function Tick() {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(80, withTiming(1, { duration: 120 }));
    scale.value = withDelay(80, withSpring(1, { damping: 8, stiffness: 260 }));
  }, [opacity, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.tick, style]}>
      <Icon icon={Check} size={14} color="#ffffff" strokeWidth={3.4} />
    </Animated.View>
  );
});

const Dots = memo(function Dots() {
  const t = useTheme();
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 180} color={t.colors.gold} />
      ))}
    </View>
  );
});

const Dot = memo(function Dot({ delay, color }: { delay: number; color: string }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.3, { duration: 420 })), -1, false));
  }, [delay, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
});

const styles = StyleSheet.create({
  row: { alignItems: "flex-end", minHeight: 44, marginTop: 13 },
  slot: { maxWidth: "88%" },
  bubble: { flexDirection: "row", alignItems: "center", gap: 8, height: 41, paddingLeft: 17, paddingRight: 10 },
  you: { fontSize: 13.5 },
  value: { flexShrink: 1, fontSize: 13.5 },
  tick: { width: 23, height: 23, borderRadius: 12, backgroundColor: "#37db96", alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 4, paddingHorizontal: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
