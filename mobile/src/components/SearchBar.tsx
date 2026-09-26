import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { fonts, radius, useTheme } from "~/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  onFilterPress?: () => void;
  filterCount?: number;
  autoFocus?: boolean;
}

/** Search field with an attached filter button (and its active-filter count). */
export const SearchBar = memo(function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = "Search",
  onFilterPress,
  filterCount = 0,
  autoFocus,
}: SearchBarProps) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: t.colors.input, borderColor: t.colors.rim }]}>
        <Icon icon={Search} size={19} tone="muted" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textMuted}
          returnKeyType="search"
          autoFocus={autoFocus}
          style={[styles.input, { color: t.colors.text, fontFamily: fonts.regular }]}
          selectionColor={t.dark ? t.colors.gold : t.colors.heading}
          accessibilityLabel={placeholder}
          maxFontSizeMultiplier={1.3}
        />
        {value ? (
          <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon icon={X} size={18} tone="muted" />
          </Pressable>
        ) : null}
      </View>
      {onFilterPress ? (
        <Pressable
          onPress={onFilterPress}
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : "Filters"}
          style={({ pressed }) => [
            styles.filter,
            { backgroundColor: filterCount ? t.colors.accent : t.colors.input, borderColor: filterCount ? t.colors.accent : t.colors.rim, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Icon icon={SlidersHorizontal} size={20} color={filterCount ? t.colors.accentFg : t.colors.text} />
          {filterCount ? (
            <View style={[styles.count, { backgroundColor: t.colors.gold }]}>
              <Text variant="caption" style={{ color: "#2e2413", fontSize: 10 }} maxFontSizeMultiplier={1}>
                {filterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 8, outlineWidth: 0 },
  filter: { width: 50, height: 50, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  count: { position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
