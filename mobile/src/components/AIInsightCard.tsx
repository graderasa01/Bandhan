import { Sparkles, X } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "~/theme";
import { PrimaryButton, SecondaryButton } from "./Button";
import { GlassCard } from "./GlassCard";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface AIInsightCardProps {
  /** The small label — "Grio ka sujhav", "Profile tip". */
  eyebrow?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onDismiss?: () => void;
  children?: ReactNode;
}

/**
 * Where the AI speaks up — used only when it has something useful to say
 * about *this* moment (a missing field that people look for, a better first
 * line). Gold-rimmed so it reads as a suggestion, never as a system alert, and
 * always dismissible.
 */
export const AIInsightCard = memo(function AIInsightCard({
  eyebrow = "Grio ka sujhav",
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onDismiss,
  children,
}: AIInsightCardProps) {
  const t = useTheme();
  return (
    <GlassCard active padding={16}>
      <View style={styles.head}>
        <View style={[styles.seal, { backgroundColor: t.dark ? "rgba(255,228,135,0.14)" : "rgba(201,169,110,0.16)" }]}>
          <Icon icon={Sparkles} size={16} tone="gold" />
        </View>
        <Text variant="label" tone="gold" style={styles.eyebrow}>
          {eyebrow}
        </Text>
        {onDismiss ? (
          <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Icon icon={X} size={16} tone="muted" />
          </Pressable>
        ) : null}
      </View>
      <Text variant="h3" style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="secondary" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {children}
      {actionLabel || secondaryLabel ? (
        <View style={styles.actions}>
          {secondaryLabel && onSecondary ? <SecondaryButton label={secondaryLabel} onPress={onSecondary} size="sm" fullWidth={false} style={styles.flex} /> : null}
          {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} size="sm" fullWidth={false} style={styles.flex} /> : null}
        </View>
      ) : null}
    </GlassCard>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  seal: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eyebrow: { flex: 1 },
  title: { marginTop: 10 },
  body: { marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  flex: { flex: 1 },
});
