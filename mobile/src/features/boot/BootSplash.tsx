import { WifiOff } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark, GlassCard, Icon, PrimaryButton, RoomBackground, Text } from "~/components";
import { layout } from "~/theme";

/**
 * The seal on the room — what shows between the native splash and the first
 * screen, and the one place a launch without signal can say so. `onRetry`
 * turns it into that offline card; without it the seal just breathes.
 */
export function BootSplash({ onRetry }: { onRetry?: () => void }) {
  const insets = useSafeAreaInsets();
  const glow = useSharedValue(0.94);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1.04, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow]);
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: glow.value }] }));

  return (
    <View style={styles.root}>
      <RoomBackground />
      <Animated.View style={styles.center} entering={FadeIn.duration(400)}>
        <Animated.View style={mark}>
          <BrandMark size={96} />
        </Animated.View>
        <Text variant="display" style={styles.word} center>
          BandhanTak
        </Text>
        <Text variant="body" tone="secondary" center>
          Rishta, bharose ke saath
        </Text>
      </Animated.View>

      {onRetry ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.offline, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <GlassCard padding={16}>
            <View style={styles.offlineRow}>
              <Icon icon={WifiOff} size={20} tone="gold" />
              <View style={styles.flex}>
                <Text variant="bodyStrong">Internet nahi mil raha</Text>
                <Text variant="small" tone="secondary">
                  Connection check karke dobara try kijiye — aap logged in hi hain.
                </Text>
              </View>
            </View>
          </GlassCard>
          <PrimaryButton label="Try Again" onPress={onRetry} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  word: { marginTop: 14 },
  offline: {
    gap: 12,
    paddingHorizontal: layout.gutter,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
  },
  offlineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 2 },
});
