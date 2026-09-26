import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { layout } from "~/theme";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** Show the back control (default true). */
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  /** Large display title under the bar, for top-level screens. */
  large?: boolean;
}

/** The top bar of a pushed screen: back, a centred title, up to two actions. */
export const ScreenHeader = memo(function ScreenHeader({ title, subtitle, back = true, onBack, right, large }: ScreenHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {back ? (
            <IconButton
              icon={ChevronLeft}
              label="Back"
              size={42}
              onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace("/home"))}
            />
          ) : null}
        </View>
        {!large && title ? (
          <View style={styles.center}>
            <Text variant="title" tone="heading" numberOfLines={1} center>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={1} center>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.center} />
        )}
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      {large && title ? (
        <View style={styles.large}>
          <Text variant="h1">{title}</Text>
          {subtitle ? (
            <Text variant="body" tone="secondary" style={{ marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  bar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  side: { width: 96, flexDirection: "row" },
  right: { justifyContent: "flex-end", gap: 8 },
  center: { flex: 1, alignItems: "center" },
  large: { paddingHorizontal: layout.gutter, paddingBottom: 8 },
});
