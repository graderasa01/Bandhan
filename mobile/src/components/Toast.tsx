import { CircleAlert, CircleCheck, Info } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { layout, radius, useTheme } from "~/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

type Tone = "success" | "error" | "info";

interface ToastState {
  current: { id: number; message: string; tone: Tone } | null;
  show(message: string, tone?: Tone): void;
  hide(): void;
}

const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, tone = "info") => set({ current: { id: Date.now(), message, tone } }),
  hide: () => set({ current: null }),
}));

/** `toast.success("Interest bhej diya")` — from anywhere, no hook needed. */
export const toast = {
  success: (m: string) => useToastStore.getState().show(m, "success"),
  error: (m: string) => useToastStore.getState().show(m, "error"),
  info: (m: string) => useToastStore.getState().show(m, "info"),
};

/** Rendered once at the root. One message at a time, auto-hides, announced to screen readers. */
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hide, current.tone === "error" ? 4200 : 2800);
    return () => clearTimeout(timer);
  }, [current, hide]);

  if (!current) return null;
  const icon = current.tone === "success" ? CircleCheck : current.tone === "error" ? CircleAlert : Info;
  const color = current.tone === "success" ? t.colors.success : current.tone === "error" ? t.colors.danger : t.colors.gold;

  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + 8 }]}>
      <Animated.View
        key={current.id}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(180)}
        style={[styles.toast, { backgroundColor: t.colors.sheet, borderColor: t.colors.rim }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Icon icon={icon} size={20} color={color} />
        <Text variant="bodyStrong" style={styles.text}>
          {current.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center", paddingHorizontal: layout.gutter, zIndex: 1000 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: layout.maxContentWidth,
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  text: { flex: 1 },
});
