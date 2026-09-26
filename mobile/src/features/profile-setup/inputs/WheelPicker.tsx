import { memo, useEffect, useRef } from "react";
import { FlatList, Platform, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Text } from "~/components";
import { radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";

const ITEM = 44;
const VISIBLE = 5;

/**
 * A snap wheel — the phone-native way to pick one of a long ordered list
 * (height, a date part, an hour). Tapping a row also selects it, so the wheel
 * works for people who don't scroll-flick, and with a screen reader.
 *
 * `unset`: nothing chosen yet. The wheel still rests somewhere, but nothing is
 * drawn as the answer — a highlighted "1 Jan 1998" that was never picked looks
 * saved and is not, which is how a required date went missing unnoticed.
 */
export const WheelPicker = memo(function WheelPicker({
  values,
  index,
  onChange,
  label,
  width,
  unset = false,
}: {
  values: string[];
  index: number;
  onChange: (index: number) => void;
  label?: string;
  width?: number;
  unset?: boolean;
}) {
  const t = useTheme();
  const list = useRef<FlatList<string>>(null);
  const safeIndex = Math.max(0, Math.min(values.length - 1, index));
  const last = useRef(safeIndex);

  useEffect(() => {
    if (last.current !== safeIndex) {
      last.current = safeIndex;
      list.current?.scrollToOffset({ offset: safeIndex * ITEM, animated: true });
    }
  }, [safeIndex]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    if (i !== last.current || unset) {
      last.current = i;
      haptics.select();
      onChange(i);
    }
  };

  return (
    <View style={[styles.wrap, width ? { width } : styles.flex]}>
      {label ? (
        <Text variant="label" tone="gold" center style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.window, { height: ITEM * VISIBLE, backgroundColor: t.colors.input, borderColor: t.colors.hairline }]}>
        <View
          pointerEvents="none"
          style={[
            styles.band,
            { top: ITEM * 2, height: ITEM },
            unset
              ? { backgroundColor: "transparent", borderColor: t.colors.hairline, borderStyle: "dashed" }
              : { backgroundColor: t.colors.accentSoft, borderColor: t.colors.rim },
          ]}
        />
        <FlatList
          ref={list}
          data={values}
          keyExtractor={(v, i) => `${v}-${i}`}
          getItemLayout={(_, i) => ({ length: ITEM, offset: ITEM * i, index: i })}
          initialScrollIndex={safeIndex}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: ITEM * 2 }}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={Platform.OS === "web" ? settle : undefined}
          nestedScrollEnabled
          renderItem={({ item, index: i }) => {
            const selected = !unset && i === safeIndex;
            return (
              <Pressable
                onPress={() => {
                  last.current = i;
                  haptics.select();
                  onChange(i);
                  list.current?.scrollToOffset({ offset: i * ITEM, animated: true });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={item}
                style={styles.item}
              >
                <Text variant={selected ? "bodyStrong" : "body"} tone={selected ? "heading" : "muted"} maxFontSizeMultiplier={1.1}>
                  {item}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  flex: { flex: 1 },
  label: { marginBottom: 2 },
  window: { borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  band: { position: "absolute", left: 6, right: 6, borderRadius: radius.sm, borderWidth: 1 },
  item: { height: ITEM, alignItems: "center", justifyContent: "center" },
});
