import { Check, ChevronDown, User } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { GlassSurface, Icon, PressableScale, Text } from "~/components";

/**
 * The profile, folded to one line while the conversation runs (the web's
 * `ProfileSheet` trigger): eight rows on screen during a two-minute
 * conversation would turn it back into the form it replaced, so the card
 * waits behind "Profile · 3 details ✓" and opens as a sheet.
 */
export const ProfileRow = memo(function ProfileRow({ done, onOpen }: { done: number; onOpen: () => void }) {
  const count = done === 1 ? "1 detail" : `${done} details`;
  return (
    <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Profile, ${done > 0 ? count : "abhi khaali"}. Open`} scaleTo={0.985}>
      <GlassSurface level="soft" radius={999} style={styles.row}>
        <Icon icon={User} size={26} tone="gold" strokeWidth={1.6} />
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.line}>
            Profile
            <Text variant="body" tone="muted">
              {" · "}
            </Text>
            {done > 0 ? (
              <Text variant="body">{count}</Text>
            ) : (
              <Text variant="body" tone="secondary">
                abhi khaali
              </Text>
            )}
          </Text>
          {done > 0 ? <Icon icon={Check} size={17} strokeWidth={2.4} /> : null}
        </View>
        <Icon icon={ChevronDown} size={22} tone="secondary" strokeWidth={1.8} />
      </GlassSurface>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 54, paddingLeft: 16, paddingRight: 14 },
  text: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  line: { fontSize: 14.5, flexShrink: 1 },
});
