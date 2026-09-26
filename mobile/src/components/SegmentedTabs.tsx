import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import { Text } from "./Text";

export interface SegmentedTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/**
 * The in-screen tab strip (Received / Sent / Matches, Meri List lanes). Fixed
 * order, never reshuffled — a rail that moves under the thumb is the one the
 * web already learned not to build.
 */
function SegmentedTabsInner<K extends string>({
  tabs,
  value,
  onChange,
  scrollable,
  fit,
}: {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  scrollable?: boolean;
  /** Each tab as wide as its label (a small toggle beside other content), instead of sharing the row equally. */
  fit?: boolean;
}) {
  const t = useTheme();
  const items = tabs.map((tab) => {
    const active = tab.key === value;
    return (
      <Pressable
        key={tab.key}
        onPress={() => {
          if (!active) haptics.select();
          onChange(tab.key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={tab.count ? `${tab.label}, ${tab.count}` : tab.label}
        style={[
          styles.tab,
          !scrollable && !fit && styles.flex,
          { backgroundColor: active ? t.colors.chipSelected : "transparent", borderRadius: radius.pill },
        ]}
      >
        <Text variant="smallStrong" style={{ color: active ? t.colors.chipSelectedText : t.colors.textSecondary }} numberOfLines={1}>
          {tab.label}
        </Text>
        {tab.count ? (
          <View style={[styles.count, { backgroundColor: active ? "rgba(255,255,255,0.22)" : t.colors.accentSoft }]}>
            <Text variant="caption" style={{ color: active ? t.colors.chipSelectedText : t.colors.text, fontSize: 10.5 }} maxFontSizeMultiplier={1}>
              {tab.count > 99 ? "99+" : tab.count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  });

  const rail = [styles.rail, { backgroundColor: t.colors.chip, borderColor: t.colors.rim }];
  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[rail, styles.scrollRail]} accessibilityRole="tablist">
        {items}
      </ScrollView>
    );
  }
  return (
    <View style={rail} accessibilityRole="tablist">
      {items}
    </View>
  );
}

export const SegmentedTabs = memo(SegmentedTabsInner) as typeof SegmentedTabsInner;

const styles = StyleSheet.create({
  rail: { flexDirection: "row", padding: 4, borderRadius: radius.pill, borderWidth: 1, gap: 4 },
  scrollRail: { paddingRight: 8 },
  tab: { height: 38, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  flex: { flex: 1 },
  count: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
});
