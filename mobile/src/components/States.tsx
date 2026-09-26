import type { LucideIcon } from "lucide-react-native";
import { CloudOff, Inbox, RefreshCw } from "lucide-react-native";
import { memo, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { ApiError } from "~/services/api/client";
import { radius, useTheme } from "~/theme";
import { PrimaryButton, SecondaryButton } from "./Button";
import { GlassCard } from "./GlassCard";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Full-area loading — a spinner and one honest line. Prefer `Skeleton` where the layout is known. */
export const LoadingState = memo(function LoadingState({ label = "Load ho raha hai…" }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={t.colors.gold} size="large" />
      <Text variant="small" tone="secondary" center>
        {label}
      </Text>
    </View>
  );
});

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** "Nothing here yet" — always with the next thing to do, never a blank screen. */
export const EmptyState = memo(function EmptyState({
  icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const t = useTheme();
  return (
    <GlassCard padding={24} style={styles.card}>
      <View style={styles.inner}>
        <View style={[styles.seal, { backgroundColor: t.colors.accentSoft, borderColor: t.colors.rim }]}>
          <Icon icon={icon} size={26} tone="gold" />
        </View>
        <Text variant="h3" center>
          {title}
        </Text>
        {description ? (
          <Text variant="body" tone="secondary" center>
            {description}
          </Text>
        ) : null}
        {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} size="md" style={styles.action} /> : null}
        {secondaryLabel && onSecondary ? <SecondaryButton label={secondaryLabel} onPress={onSecondary} size="md" /> : null}
      </View>
    </GlassCard>
  );
});

/** Something failed — say what, and offer the retry. */
export const ErrorState = memo(function ErrorState({
  error,
  onRetry,
  title,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const offline = error instanceof ApiError && error.isNetwork;
  const message =
    error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kuch galat ho gaya — dobara try karein.";
  return (
    <EmptyState
      icon={offline ? CloudOff : RefreshCw}
      title={title ?? (offline ? "Internet nahi mil raha" : "Load nahi ho paaya")}
      description={message}
      actionLabel={onRetry ? "Try Again" : undefined}
      onAction={onRetry}
    />
  );
});

/** A shimmering block that holds a layout's place while it loads. */
export const Skeleton = memo(function Skeleton({
  width = "100%",
  height = 16,
  radius: r = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.9, { duration: 900 }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: t.colors.glassSoft }, animated, style]} />;
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32, minHeight: 200 },
  card: { marginVertical: 12 },
  inner: { alignItems: "center", gap: 10 },
  seal: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 4 },
  action: { marginTop: 8, alignSelf: "stretch" },
});
