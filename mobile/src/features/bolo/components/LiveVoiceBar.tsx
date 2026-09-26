import { Mic, MicOff } from "lucide-react-native";
import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GlassSurface, Icon, PressableScale, Text } from "~/components";
import { useTheme } from "~/theme";
import type { LiveStatus } from "../voice/types";

/**
 *   live    — a session is open: connecting, listening or speaking
 *   idle    — voice works here and nothing is running
 *   retry   — the last session ended on its own (network, silence, a limit)
 *   off     — voice is switched off, or this phone cannot do live audio
 *   leaving — `go_next` has run and the screen is on its way out
 */
export type VoiceBarMode = "live" | "idle" | "retry" | "off" | "leaving";

const HEARD_TAIL = 44;
const PEAKS = [0.18, 0.32, 0.46, 0.64, 1, 0.6, 0.26, 0.42, 0.72, 0.38, 0.2];

function tail(text: string): string | null {
  const said = text.trim();
  if (!said) return null;
  return said.length > HEARD_TAIL ? `…${said.slice(-HEARD_TAIL)}` : said;
}

/** Grio's gold waveform: moving on its own while she speaks, with the mic's level while she listens, faded at rest. */
const Waveform = memo(function Waveform({ mode, level }: { mode: "speaking" | "listening" | "rest"; level: number }) {
  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PEAKS.map((peak, i) => (
        <Bar key={i} peak={peak} index={i} mode={mode} level={level} />
      ))}
    </View>
  );
});

const Bar = memo(function Bar({ peak, index, mode, level }: { peak: number; index: number; mode: "speaking" | "listening" | "rest"; level: number }) {
  const t = useTheme();
  const lift = useSharedValue(0.42);
  useEffect(() => {
    cancelAnimation(lift);
    if (mode === "speaking") {
      lift.value = withDelay(
        (index * 97) % 530,
        withRepeat(withSequence(withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }), withTiming(0.35, { duration: 320 })), -1, true),
      );
    } else {
      lift.value = withTiming(mode === "listening" ? Math.min(1, 0.32 + level * 1.6) : 0.42, { duration: 140 });
    }
  }, [index, level, lift, mode]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: lift.value }] }));
  const rest = mode === "rest";
  return (
    <Animated.View
      style={[
        styles.waveBar,
        { height: `${Math.round(peak * 100)}%`, backgroundColor: rest ? "rgba(255,226,168,0.5)" : t.colors.gold },
        !rest && { boxShadow: `0px 0px 6px ${t.colors.gold}` },
        style,
      ]}
    />
  );
});

export const LiveVoiceBar = memo(function LiveVoiceBar({
  mode,
  status,
  level,
  muted,
  heard,
  said,
  onStart,
  onStop,
}: {
  mode: VoiceBarMode;
  status: LiveStatus;
  level: number;
  muted: boolean;
  heard: string;
  said: string;
  onStart: () => void;
  onStop: () => void;
}) {
  const t = useTheme();
  const connecting = mode === "live" && status === "connecting";
  const speaking = mode === "live" && status === "speaking";
  const heardLine = tail(heard);
  const grioLine = tail(said);
  const caption = "Beech mein bol sakte hain";

  let title: string;
  let sub: string | null;
  if (mode === "leaving") {
    title = "Chaliye — rishte khul rahe hain…";
    sub = grioLine;
  } else if (mode === "live") {
    if (connecting) {
      title = "Grio connect ho rahi hai…";
      sub = "Bas ek second";
    } else if (muted) {
      title = "Mic band hai";
      sub = "Mic dabakar phir bol sakte hain";
    } else if (speaking) {
      title = "Grio bol rahi hai";
      sub = grioLine ?? caption;
    } else {
      title = "Grio sun rahi hai";
      sub = (heardLine ? `“${heardLine}”` : null) ?? grioLine ?? caption;
    }
  } else if (mode === "retry") {
    title = "Grio ruk gayi";
    sub = "Jawab safe hain";
  } else if (mode === "off") {
    title = "Voice abhi band hai";
    sub = "Tap karke ya likh kar jawab dein";
  } else {
    title = "Grio se baat karein";
    sub = "Awaaz se jawab dein";
  }

  const wave = mode !== "live" || connecting || muted ? "rest" : speaking ? "speaking" : "listening";
  const live = mode === "live";

  return (
    <GlassSurface
      level="default"
      radius={999}
      active={live}
      style={[styles.bar, live && { boxShadow: `${t.material.default.shadow}, -2px 0px 16px -4px rgba(255,206,120,0.55), 2px 0px 16px -4px rgba(126,214,184,0.5)` }]}
      accessibilityLabel="Grio live voice"
    >
      <View style={[styles.bubble, { backgroundColor: t.material.kind === "paper" ? "#fbf3e8" : "rgba(20,10,12,0.28)", borderColor: t.colors.hairline }]}>
        {mode === "off" ? <Icon icon={MicOff} size={20} tone="secondary" /> : <Waveform mode={wave} level={level} />}
      </View>
      {live ? (
        <View
          style={[
            styles.dot,
            connecting
              ? { backgroundColor: "#f0c060", boxShadow: "0px 0px 10px rgba(240,192,96,0.7)" }
              : muted
                ? { backgroundColor: "rgba(255,255,255,0.3)" }
                : { backgroundColor: "#37db96", boxShadow: "0px 0px 11px rgba(55,219,150,0.72)" },
          ]}
        />
      ) : null}
      <View style={styles.words}>
        {live ? (
          <Text variant="label" tone="gold" style={{ fontSize: 9.5 }}>
            Live voice
          </Text>
        ) : null}
        <Text variant="bodyStrong" numberOfLines={1} style={styles.title} accessibilityLiveRegion="polite">
          {title}
        </Text>
        {sub ? (
          <Text variant="small" tone="secondary" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {live ? (
        <>
          <View style={[styles.rule, { backgroundColor: t.colors.hairline }]} />
          <PressableScale onPress={onStop} accessibilityRole="button" accessibilityLabel="Stop" hitSlop={6} style={[styles.stop, { borderColor: "rgba(255,226,168,0.78)" }]}>
            <View style={[styles.stopSquare, { backgroundColor: t.colors.accent }]} />
          </PressableScale>
        </>
      ) : null}
      {mode === "idle" || mode === "retry" ? (
        <PressableScale onPress={onStart} accessibilityRole="button" accessibilityLabel={mode === "retry" ? "Reconnect" : "Start"} style={[styles.start, { backgroundColor: t.colors.accent }]}>
          <Icon icon={Mic} size={16} color={t.colors.accentFg} />
          <Text variant="buttonSmall" style={{ color: t.colors.accentFg }}>
            {mode === "retry" ? "Reconnect" : "Start"}
          </Text>
        </PressableScale>
      ) : null}
    </GlassSurface>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", minHeight: 62, paddingLeft: 8, paddingRight: 9 },
  bubble: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  wave: { flexDirection: "row", alignItems: "center", gap: 2.4, height: 28, width: 34 },
  waveBar: { width: 2, borderRadius: 1 },
  dot: { width: 13, height: 13, borderRadius: 7, marginLeft: 11 },
  words: { flex: 1, marginLeft: 14, paddingVertical: 2, gap: 2 },
  title: { fontSize: 14.5, lineHeight: 18 },
  rule: { width: StyleSheet.hairlineWidth, height: 31, marginLeft: 10 },
  stop: { width: 42, height: 42, borderRadius: 21, marginLeft: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.4 },
  stopSquare: { width: 15, height: 15, borderRadius: 4 },
  start: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, marginLeft: 10 },
});
