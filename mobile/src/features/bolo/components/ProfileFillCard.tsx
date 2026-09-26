import { Check, Pencil, User, Users } from "lucide-react-native";
import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { GlassSurface, Icon, PressableScale, ProgressBar, Text } from "~/components";
import { MINIMUM_LIVE_FIELDS, isValidFieldValue } from "~/shared/readiness";
import { displayDate } from "~/shared/bolo/questions";
import type { BoloValues } from "~/shared/bolo/draft";
import type { FillingFor } from "~/types/api";
import { useTheme } from "~/theme";

/**
 * The profile, as the eight rows a live profile needs (the web's
 * `ProfileFillCard`), each ticking over from "…" to its value the moment an
 * answer is accepted — with a brief glow on the row that just filled. Folded
 * in the sheet while the conversation runs, and the review screen itself once
 * everything is in: tap a row to correct it (a glass editor sheet).
 */
export const ProfileFillCard = memo(function ProfileFillCard({
  values,
  fillingFor,
  editable,
  onEdit,
  highlight,
  showHeader = true,
  level = "default",
}: {
  values: BoloValues;
  fillingFor: FillingFor | null;
  editable: boolean;
  onEdit?: (key: string) => void;
  highlight?: string[];
  showHeader?: boolean;
  level?: "soft" | "default" | "strong";
}) {
  const t = useTheme();
  const done = MINIMUM_LIVE_FIELDS.filter((f) => isValidFieldValue(f, values[f.key])).length;
  const total = MINIMUM_LIVE_FIELDS.length;
  const title = fillingFor === "son" ? "Bete ki profile" : fillingFor === "daughter" ? "Beti ki profile" : "Aapki profile";

  return (
    <GlassSurface level={level} radius={24}>
      {/* The clip lives inside the pane: on the pane itself it would cut off its own shadow. */}
      <View style={styles.clip}>
      {showHeader ? (
        <View style={[styles.header, { borderBottomColor: t.colors.divider }]}>
          <View style={[styles.ring, { borderColor: t.colors.gold }]}>
            <Icon icon={fillingFor === "son" || fillingFor === "daughter" ? Users : User} size={17} tone="gold" />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{title}</Text>
            <Text variant="caption" tone="muted">
              {done}/{total} bhar gaye
            </Text>
          </View>
          <View style={styles.bar}>
            <ProgressBar percent={(done / total) * 100} />
          </View>
        </View>
      ) : null}
      {MINIMUM_LIVE_FIELDS.map((field, i) => (
        <Row
          key={field.key}
          label={field.label}
          value={values[field.key] ?? ""}
          display={field.key === "dateOfBirth" && values[field.key] ? displayDate(values[field.key]!) : (values[field.key] ?? "")}
          valid={isValidFieldValue(field, values[field.key])}
          flash={highlight?.includes(field.key) ?? false}
          last={i === MINIMUM_LIVE_FIELDS.length - 1}
          onEdit={editable && onEdit ? () => onEdit(field.key) : undefined}
        />
      ))}
      </View>
    </GlassSurface>
  );
});

const Row = memo(function Row({
  label,
  value,
  display,
  valid,
  flash,
  last,
  onEdit,
}: {
  label: string;
  value: string;
  display: string;
  valid: boolean;
  flash: boolean;
  last: boolean;
  onEdit?: () => void;
}) {
  const t = useTheme();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (flash) glow.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 1100 }));
  }, [flash, glow]);
  const flashColor = t.colors.successBg;
  const style = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(glow.value, [0, 1], ["rgba(0,0,0,0)", flashColor]) }));

  const content = (
    <Animated.View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.colors.divider }, style]}>
      <View style={[styles.tick, valid ? { backgroundColor: t.colors.success, borderColor: t.colors.success } : { borderColor: t.colors.hairline }]}>
        {valid ? <Icon icon={Check} size={13} color="#ffffff" strokeWidth={3} /> : null}
      </View>
      <View style={styles.flex}>
        <Text variant="label" tone="muted" style={styles.label}>
          {label}
        </Text>
        <Text variant={valid ? "bodyStrong" : "body"} tone={valid ? "primary" : "muted"} numberOfLines={1}>
          {value ? display : onEdit ? "Tap karke bharein" : "…"}
        </Text>
      </View>
      {onEdit ? <Icon icon={Pencil} size={16} tone="muted" /> : null}
    </Animated.View>
  );

  if (!onEdit) return content;
  return (
    <PressableScale onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${label}${value ? `, ${display}` : ""}`} scaleTo={0.99}>
      {content}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  clip: { borderRadius: 24, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ring: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  bar: { width: 80 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, letterSpacing: 1 },
});
