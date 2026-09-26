import { BadgeCheck } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "~/theme";
import type { PhotoLock } from "~/types/api";
import { Icon } from "./Icon";
import { SmartImage } from "./SmartImage";

export interface AvatarProps {
  uri: string | null | undefined;
  name: string;
  size?: number;
  lock?: PhotoLock;
  verified?: boolean;
  /** Gold ring — the member's own avatar, or an unread / active state. */
  ring?: boolean;
  online?: boolean;
}

export const Avatar = memo(function Avatar({ uri, name, size = 48, lock = "open", verified, ring, online }: AvatarProps) {
  const t = useTheme();
  const inner = ring ? size - 6 : size;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, borderColor: ring ? t.colors.gold : "transparent", borderWidth: ring ? 1.6 : 0 },
        ]}
      >
        <SmartImage
          uri={uri}
          name={name}
          lock={lock}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
          placeholderSize="sm"
          showLockLine={false}
        />
      </View>
      {verified ? (
        <View style={[styles.badge, { backgroundColor: t.colors.sheet, right: -2, bottom: -2 }]}>
          <Icon icon={BadgeCheck} size={Math.max(14, size * 0.3)} color={t.colors.success} strokeWidth={2.2} />
        </View>
      ) : null}
      {online ? <View style={[styles.dot, { backgroundColor: t.colors.live, borderColor: t.colors.sheet }]} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  ring: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", borderRadius: 12, padding: 1 },
  dot: { position: "absolute", right: 1, top: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
