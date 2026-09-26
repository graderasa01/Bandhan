import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { fonts, useTheme } from "~/theme";
import { GlassSurface } from "./GlassSurface";
import { Text } from "./Text";

/**
 * The one thing Grio is asking right now — /bolo's question card (the web's
 * `GrioQuestion`), shared with the reel's full-screen questions so a question
 * looks the same wherever it is asked.
 *
 * A new question arrives as a card laid over the last one: in from the right
 * with a little scale, while the one it replaces recedes and dims beneath it.
 * Both are driven by plain shared values rather than layout animations — the
 * new card stays in the layout (so nothing below it jumps), the old one is an
 * overlay for a quarter of a second. With "reduce motion" on, both simply
 * appear and disappear.
 */

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Grio's seal: a warm double-ringed disc with her four-point spark. */
export const GrioSeal = memo(function GrioSeal({ size = 46 }: { size?: number }) {
  const t = useTheme();
  const paper = t.material.kind === "paper";
  return (
    <View
      style={[
        styles.seal,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: paper ? "#fbf3e8" : "rgba(140,82,34,0.34)",
          borderColor: paper ? t.colors.gold : "rgba(255,232,178,0.82)",
          boxShadow: paper
            ? "0px 6px 14px -8px rgba(74,17,25,0.35)"
            : "inset 0px 1.5px 0px rgba(255,246,224,0.34), 0px 0px 18px -2px rgba(240,186,92,0.34), 0px 10px 22px -14px rgba(20,7,5,0.8)",
        },
      ]}
    >
      <View style={[styles.sealInner, { borderRadius: size / 2, borderColor: paper ? "rgba(201,169,110,0.5)" : "rgba(255,236,192,0.34)" }]} />
      <Svg width={size / 2} height={size / 2} viewBox="0 0 24 24">
        <Path
          d="M10.6 3.1c.27 0 .5.19.57.45l.86 3.2c.3 1.13 1.19 2.02 2.32 2.32l3.2.86c.55.15.55.93 0 1.08l-3.2.86c-1.13.3-2.02 1.19-2.32 2.32l-.86 3.2c-.15.55-.93.55-1.08 0l-.86-3.2c-.3-1.13-1.19-2.02-2.32-2.32l-3.2-.86c-.55-.15-.55-.93 0-1.08l3.2-.86c1.13-.3 2.02-1.19 2.32-2.32l.86-3.2c.07-.26.3-.45.57-.45Z"
          fill="#f2a032"
          stroke="rgba(255,246,232,0.95)"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        <Path d="M18.6 2.6v3.3M20.25 4.25h-3.3" stroke="rgba(255,246,232,0.95)" strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
    </View>
  );
});

export interface GlassQuestionCardProps {
  /** A new id is a new question — that is what slides. */
  id: string;
  question: string;
  /** A quiet line above the question. */
  eyebrow?: ReactNode;
  /** The line under the question. */
  hint?: ReactNode;
  /** One word beside Grio's name, the moment after an answer lands ("Badhiya"). */
  ack?: string | null;
  /** "Grio", or who else is asking. */
  who?: string;
  /** Glow on the right edge while the voice is live. */
  live?: boolean;
  /** Question set smaller (reel questions over less room). */
  compact?: boolean;
  children?: ReactNode;
}

type Snapshot = Omit<GlassQuestionCardProps, "children" | "ack">;

export const GlassQuestionCard = memo(function GlassQuestionCard(props: GlassQuestionCardProps) {
  const [leaving, setLeaving] = useState<Snapshot | null>(null);
  const shown = useRef<Snapshot>(props);
  const enter = useSharedValue(1);

  // After every commit: if the id changed, what was on screen until now is the
  // card that leaves. Deliberately without a dependency list — the snapshot
  // must follow every prop (a hint that changed under the same question is the
  // hint that leaves) — and it cannot loop: it sets state only when the id
  // changed, and the next commit carries the same id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const before = shown.current;
    shown.current = props;
    if (before.id === props.id) return;
    setLeaving(before);
    enter.set(0);
    enter.set(withTiming(1, { duration: 340, easing: EASE, reduceMotion: ReduceMotion.System }));
  });

  // Its own timer, so an unrelated re-render (an ack appearing) can never keep it on screen.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), 260);
    return () => clearTimeout(timer);
  }, [leaving]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 44 }, { scale: 0.965 + 0.035 * enter.value }],
  }));

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      {leaving ? <LeavingCard snapshot={leaving} /> : null}
      <Animated.View style={style}>
        <CardBody {...props} />
      </Animated.View>
    </View>
  );
});

/** The card being replaced: an overlay that recedes and dims, then is gone. */
const LeavingCard = memo(function LeavingCard({ snapshot }: { snapshot: Snapshot }) {
  const out = useSharedValue(0);
  useEffect(() => {
    out.value = withTiming(1, { duration: 240, easing: EASE, reduceMotion: ReduceMotion.System });
  }, [out]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateX: -18 * out.value }, { scale: 1 - 0.06 * out.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.leaving, style]}>
      <CardBody {...snapshot} />
    </Animated.View>
  );
});

const CardBody = memo(function CardBody({ question, eyebrow, hint, ack, who = "Grio", live = false, compact = false, children }: GlassQuestionCardProps) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  // The web sets the question at clamp(25px, 8vw, 34px) so it composes on any phone.
  const size = compact ? Math.min(28, Math.max(22, width * 0.066)) : Math.min(34, Math.max(25, width * 0.08));
  return (
    <GlassSurface
      level="default"
      radius={30}
      style={[styles.card, live && { boxShadow: `${t.material.default.shadow}, 6px 0px 14px -6px rgba(143,227,198,0.55)` }]}
    >
      <View style={styles.sealSlot}>
        <GrioSeal />
      </View>
      <View style={styles.whoRow}>
        <Text variant="title" tone="gold" style={styles.who}>
          {who}
        </Text>
        {ack ? (
          <Text variant="body" tone="secondary">
            {` · ${ack}`}
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>
        {eyebrow ? (
          <Text variant="smallStrong" tone="secondary" style={styles.eyebrow}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          style={{ fontFamily: fonts.displayBold, fontSize: size, lineHeight: size * 1.16, color: t.colors.heading, letterSpacing: -0.1 }}
          maxFontSizeMultiplier={1.2}
        >
          {question}
        </Text>
        {hint ? (
          <Text variant="body" tone="secondary" style={[styles.hint, compact && { fontSize: 14.5 }]}>
            {hint}
          </Text>
        ) : null}
        {children}
      </View>
    </GlassSurface>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingLeft: 5, paddingTop: 5 },
  leaving: { position: "absolute", top: 5, left: 5, right: 0 },
  card: { paddingHorizontal: 21, paddingTop: 10, paddingBottom: 18, minHeight: 156 },
  sealSlot: { position: "absolute", left: -7, top: -7, zIndex: 2 },
  seal: { alignItems: "center", justifyContent: "center", borderWidth: 1.4 },
  sealInner: { position: "absolute", top: 4, left: 4, right: 4, bottom: 4, borderWidth: 1 },
  whoRow: { flexDirection: "row", alignItems: "center", marginLeft: 31, minHeight: 22 },
  who: { fontSize: 15.5 },
  body: { flexGrow: 1, justifyContent: "center", marginTop: 6 },
  eyebrow: { marginBottom: 8 },
  hint: { marginTop: 10, fontSize: 16, lineHeight: 21.5 },
});
