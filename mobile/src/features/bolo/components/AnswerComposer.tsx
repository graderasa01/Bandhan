import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Mic, MicOff } from "lucide-react-native";
import { forwardRef, memo, useEffect } from "react";
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { GlassSurface, Icon, PressableScale } from "~/components";
import { fonts, useTheme } from "~/theme";

export type ComposerMicState = "idle" | "connecting" | "listening" | "speaking" | "muted";

/**
 * The one place to type — the web's `AnswerComposer`: the answer, the mic,
 * Send, and nothing else. The mic starts Grio when she is not live and pauses
 * the microphone when she is (it never ends the session — that is the voice
 * bar's Stop), so typing and tapping happen *inside* the conversation. It
 * rides above the keyboard with the screen (KeyboardAvoidingView upstream).
 */
export const AnswerComposer = memo(
  forwardRef<TextInput, {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder: string;
    busy?: boolean;
    disabled?: boolean;
    /** Null when voice is not available here. */
    mic?: { state: ComposerMicState; onPress: () => void } | null;
  }>(function AnswerComposer({ value, onChange, onSubmit, placeholder, busy = false, disabled = false, mic }, ref) {
    const t = useTheme();
    const canSend = value.trim().length > 0 && !busy && !disabled;
    const live = mic ? mic.state !== "idle" : false;
    const paper = t.material.kind === "paper";

    return (
      <GlassSurface level="strong" radius={34} style={styles.slab}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textMuted}
          multiline
          submitBehavior="submit"
          onSubmitEditing={() => canSend && onSubmit()}
          returnKeyType="send"
          autoComplete="off"
          accessibilityLabel="Jawab likhein"
          maxFontSizeMultiplier={1.3}
          style={[styles.input, { color: t.colors.text, fontFamily: fonts.regular }]}
          selectionColor={t.dark ? t.colors.gold : t.colors.heading}
        />
        {mic ? (
          <PressableScale
            onPress={mic.onPress}
            disabled={mic.state === "connecting" || disabled}
            accessibilityRole="button"
            accessibilityLabel={!live ? "Start Talking" : mic.state === "muted" ? "Unmute Mic" : "Mute Mic"}
            accessibilityState={{ selected: live ? mic.state === "muted" : undefined, disabled: mic.state === "connecting" || disabled }}
            style={[
              styles.mic,
              mic.state === "muted"
                ? { backgroundColor: paper ? "#f1e4d4" : "rgba(70,44,20,0.4)", borderColor: "rgba(255,226,178,0.28)" }
                : { backgroundColor: paper ? "#f8e3e0" : "rgba(168,62,66,0.42)", borderColor: paper ? "#c98b8f" : "rgba(255,186,182,0.72)" },
            ]}
          >
            {mic.state === "listening" ? <PulseRing color={paper ? "#b3565d" : "rgba(255,186,182,0.8)"} /> : null}
            {mic.state === "connecting" ? (
              <ActivityIndicator size="small" color={t.colors.text} />
            ) : (
              <Icon icon={mic.state === "muted" ? MicOff : Mic} size={21} strokeWidth={1.9} tone={paper ? "heading" : "primary"} />
            )}
          </PressableScale>
        ) : null}
        <View style={[styles.rule, { backgroundColor: t.colors.hairline }]} />
        <PressableScale onPress={onSubmit} disabled={!canSend} accessibilityRole="button" accessibilityLabel="Send" scaleTo={0.94} style={[styles.send, !canSend && { opacity: 0.55 }]}>
          <LinearGradient colors={t.gradients.accent} start={{ x: 0.2, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
          {busy ? <ActivityIndicator color={t.colors.accentFg} /> : <Icon icon={ArrowRight} size={26} strokeWidth={2.2} color={t.colors.accentFg} />}
        </PressableScale>
      </GlassSurface>
    );
  }),
);

/** The listening pulse around the mic — the one thing that moves while the member speaks. */
const PulseRing = memo(function PulseRing({ color }: { color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.35 }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pulse, { borderColor: color }, style]} />;
});

const styles = StyleSheet.create({
  slab: { flexDirection: "row", alignItems: "center", minHeight: 68, paddingLeft: 10, paddingRight: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
    fontSize: 15.5,
    lineHeight: 21,
    maxHeight: 112,
    paddingTop: Platform.OS === "ios" ? 10 : 6,
    paddingBottom: Platform.OS === "ios" ? 10 : 6,
    outlineWidth: 0,
  },
  mic: { width: 45, height: 45, borderRadius: 23, marginLeft: 8, alignItems: "center", justifyContent: "center", borderWidth: 1.4 },
  pulse: { borderRadius: 23, borderWidth: 2 },
  rule: { width: StyleSheet.hairlineWidth, height: 26, marginLeft: 9 },
  send: { width: 50, height: 50, borderRadius: 25, marginLeft: 9, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
