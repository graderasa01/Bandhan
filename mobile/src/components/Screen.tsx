import { StatusBar } from "expo-status-bar";
import { forwardRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, useTheme } from "~/theme";
import { RoomBackground } from "./RoomBackground";

export interface ScreenProps {
  children?: ReactNode;
  /** Wrap the body in a ScrollView (default true). */
  scroll?: boolean;
  /** Side gutters on the body (default true). */
  padded?: boolean;
  /** Sits above the body, outside the scroll — a header, a tab strip. */
  header?: ReactNode;
  /** Pinned to the foot above the home indicator — the screen's main action. */
  footer?: ReactNode;
  /** Leave room at the foot for the floating tab bar. */
  tabBar?: boolean;
  /** Shift content up with the keyboard (forms, chat). Default true. */
  keyboard?: boolean;
  /** Draw the status-bar inset at the top (default true; false when a header already does). */
  topInset?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** The scrolling body's scroll events (a tab screen tells Grio's launcher when it is being read). */
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  contentStyle?: StyleProp<ViewStyle>;
  background?: boolean;
}

/**
 * Every screen's frame: the room behind it, the status bar in the room's
 * colour, safe areas (notches, home indicators, Android edge-to-edge),
 * keyboard avoidance, the phone-width content column, and room for the
 * floating tab bar — so no screen re-solves any of it.
 */
export const Screen = forwardRef<ScrollView, ScreenProps>(function Screen(
  {
    children,
    scroll = true,
    padded = true,
    header,
    footer,
    tabBar = false,
    keyboard = true,
    topInset = true,
    refreshControl,
    onScroll,
    contentStyle,
    background = true,
  },
  ref,
) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = tabBar ? layout.tabBarClearance + insets.bottom : footer ? 16 : Math.max(insets.bottom, 16) + 8;

  const column = (
    <View style={[styles.column, padded && styles.padded, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      {background ? <RoomBackground /> : null}
      <StatusBar style={t.statusBar} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "web" ? undefined : "padding"}
        enabled={keyboard && Platform.OS !== "web"}
      >
        <View style={[styles.root, { paddingTop: topInset ? insets.top : 0 }]}>
          {header}
          {scroll ? (
            <ScrollView
              ref={ref}
              style={styles.root}
              contentContainerStyle={{ paddingBottom: bottomPad, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              onScroll={onScroll}
              scrollEventThrottle={onScroll ? 32 : undefined}
            >
              {column}
            </ScrollView>
          ) : (
            <View style={[styles.root, { paddingBottom: tabBar ? layout.tabBarClearance + insets.bottom : 0 }]}>{column}</View>
          )}
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + (tabBar ? layout.tabBarHeight : 0) }]}>
              <View style={styles.footerColumn}>{footer}</View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { flex: 1, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  padded: { paddingHorizontal: layout.gutter },
  footer: { paddingTop: 10, paddingHorizontal: layout.gutter },
  footerColumn: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
});
