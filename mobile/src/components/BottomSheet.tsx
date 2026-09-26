import { X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, radius, useTheme } from "~/theme";
import { GlassSurface } from "./GlassSurface";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned under the scrolling body — Apply / Save. */
  footer?: ReactNode;
  /** Fraction of the screen the sheet may take (default 0.88). */
  maxHeight?: number;
  scroll?: boolean;
}

const SHEET_RADIUS = radius.xl;

/**
 * GlassSheet — the app's one sheet: filters, quick field edits, Ask Grio,
 * pickers, confirmations with context. It is the room's strongest pane (rim,
 * lit lip, sheen — or Classic's card stock with its gold rule) with an opaque
 * body: nothing that comes up over live content is read through (the web's
 * rule). Slides up from the foot, closes on the backdrop, the ✕ and Android
 * back; its lower corners run off the bottom of the screen, so it reads as
 * rising from the edge rather than floating above it.
 */
export function BottomSheet({ visible, onClose, title, subtitle, children, footer, maxHeight = 0.88, scroll = true }: BottomSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // Opening mounts at once (during render, so the first frame already has the
  // sheet); closing unmounts only after the slide-down has played.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
      return;
    }
    progress.set(withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System }));
    const timer = setTimeout(() => setMounted(false), 210);
    return () => clearTimeout(timer);
  }, [visible, progress]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height * 0.6 }] }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.overlay }, backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheetSlot, { maxHeight: height * maxHeight + SHEET_RADIUS }, sheet]} accessibilityViewIsModal>
          <GlassSurface
            level="strong"
            radius={SHEET_RADIUS}
            bodyOverride={t.material.raised}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + SHEET_RADIUS }]}
          >
            <View style={[styles.handle, { backgroundColor: t.colors.hairline }]} />
            {title ? (
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text variant="h2">{title}</Text>
                  {subtitle ? (
                    <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <IconButton icon={X} label="Close" size={38} onPress={onClose} />
              </View>
            ) : null}
            {scroll ? (
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.body, styles.bodyContent]}>{children}</View>
            )}
            {footer ? <View style={[styles.footer, { borderTopColor: t.colors.divider }]}>{footer}</View> : null}
          </GlassSurface>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The same component under the component-family name. */
export const GlassSheet = BottomSheet;

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheetSlot: { width: "100%", maxWidth: layout.maxContentWidth + 40, alignSelf: "center", marginBottom: -SHEET_RADIUS },
  sheet: { flexShrink: 1 },
  handle: { alignSelf: "center", width: 42, height: 4.5, borderRadius: 3, marginTop: 10, marginBottom: 4 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: layout.gutter, paddingTop: 8, paddingBottom: 8 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingHorizontal: layout.gutter, paddingTop: 4, paddingBottom: 16 },
  footer: { paddingHorizontal: layout.gutter, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
