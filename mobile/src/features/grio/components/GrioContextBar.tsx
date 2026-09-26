import { BadgeCheck, MessageCircle, Search, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GlassSurface, Icon, IconButton, Skeleton, SmartImage, Text } from "~/components";
import { radius, useTheme } from "~/theme";
import { firstNameOf } from "~/utils/names";
import { useGrio, useGrioState } from "../GrioProvider";

/**
 * What this conversation is about, pinned under the header for as long as it
 * is: the open profile (face only when the photo gate opens it — the header
 * arrives from the server already gated), the match a message is for, or the
 * member's search. Always with a way out (✕ → general conversation).
 */
export const GrioContextBar = memo(function GrioContextBar() {
  const engine = useGrio();
  const t = useTheme();
  const scope = useGrioState((s) => s.scope);
  const brief = useGrioState((s) => s.brief);
  const discovery = useGrioState((s) => s.discovery);

  if (scope?.kind === "candidate") {
    const header = brief?.profileId === scope.profileId && brief.data?.ok ? (brief.data.header ?? null) : null;
    const loading = brief?.profileId === scope.profileId && brief.data === null;
    const title = header ? `${header.name}${header.age ? `, ${header.age}` : ""}` : scope.name;
    const sub = header ? [header.city, header.headline].filter(Boolean).join(" · ") : null;
    return (
      <GlassSurface level="default" radius={radius.lg} style={styles.card}>
        <Pressable
          onPress={() => engine.openProfile(scope.profileId)}
          accessibilityRole="button"
          accessibilityLabel={`${title}. View profile`}
          style={styles.who}
        >
          <SmartImage
            uri={header?.photoUrl ?? null}
            name={header?.name ?? scope.name}
            lock={header?.photoLock ?? "open"}
            style={styles.avatar}
            placeholderSize="sm"
            showLockLine={false}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {title}
              </Text>
              {header?.verified ? <Icon icon={BadgeCheck} size={15} tone="success" /> : null}
            </View>
            {sub ? (
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {sub}
              </Text>
            ) : loading ? (
              <Skeleton width={120} height={10} radius={5} />
            ) : null}
            <Text variant="caption" tone="gold" numberOfLines={1}>
              {header ? `${header.levelLabel} · View profile` : "View profile"}
            </Text>
          </View>
        </Pressable>
        <IconButton icon={X} label={`Stop talking about ${firstNameOf(scope.name)}`} size={36} variant="plain" onPress={() => engine.setScope(null)} />
      </GlassSurface>
    );
  }

  if (scope?.kind === "match" || discovery) {
    const isMatch = scope?.kind === "match";
    const label = isMatch ? `${firstNameOf(scope.name)} ke liye message` : `Search: ${discovery?.summary?.trim() || "aapke filters"}`;
    return (
      <View style={styles.chipRow}>
        <GlassSurface level="soft" radius={radius.pill} shadow={false} style={styles.chip}>
          <Icon icon={isMatch ? MessageCircle : Search} size={14} tone="gold" />
          <Text variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {label}
          </Text>
          <Pressable
            onPress={() => (isMatch ? engine.setScope(null) : engine.open({ kind: "general" }))}
            accessibilityRole="button"
            accessibilityLabel={isMatch ? "Stop writing to this match" : "Clear search context"}
            hitSlop={10}
          >
            <Icon icon={X} size={15} color={t.colors.textMuted} />
          </Pressable>
        </GlassSurface>
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingLeft: 10, paddingRight: 4 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  chipRow: { flexDirection: "row" },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 7, maxWidth: "100%" },
});
