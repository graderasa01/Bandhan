import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabBarProps } from "expo-router/tabs";
import type { LucideIcon } from "lucide-react-native";
import { Clapperboard, Heart, House, MessageCircle, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "~/components";
import { GrioLauncher } from "~/features/grio/GrioLauncher";
import { useCounts } from "~/hooks/queries";
import { layout, radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";

const TABS: Record<string, { label: string; icon: LucideIcon; badge?: "interests" | "messages" }> = {
  home: { label: "Home", icon: House },
  search: { label: "Search", icon: Search },
  reels: { label: "Reels", icon: Clapperboard },
  interests: { label: "Interests", icon: Heart, badge: "interests" },
  chats: { label: "Chats", icon: MessageCircle, badge: "messages" },
};

/**
 * The floating glass bottom bar — five places, labelled, with a badge only
 * where somebody is waiting on the member (the web's nav-counts rule). Reels
 * sits in the middle as the one raised action. Over the full-screen reel the
 * bar turns smoked so it never fights the photo.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme();
  const counts = useCounts();
  const [keyboard, setKeyboard] = useState(false);
  const onReels = state.routes[state.index]?.name === "reels";

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboard) return null;

  const body = onReels ? "rgba(18,8,10,0.58)" : Platform.OS === "android" ? t.colors.tabBar : t.room === "paper" ? t.colors.tabBar : t.colors.glassStrong;
  const focusedName = state.routes[state.index]?.name;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {/* Grio, one tap from every tab but the reel (its card has its own Ask Grio). */}
      {!onReels ? (
        <GrioLauncher
          bottom={Math.max(insets.bottom, 10) + layout.tabBarHeight + 12}
          fallback={focusedName === "home" ? { kind: "dashboard" } : { kind: "general" }}
        />
      ) : null}
      <View style={[styles.bar, { borderColor: onReels ? "rgba(255,255,255,0.18)" : t.colors.rim, shadowColor: t.colors.shadow }]}>
        {Platform.OS === "ios" || Platform.OS === "web" ? (
          <BlurView intensity={40} tint={t.dark || onReels ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: body }]} />
        {state.routes.map((route, index) => {
          const spec = TABS[route.name];
          if (!spec) return null;
          const focused = state.index === index;
          const count = spec.badge ? (counts.data?.[spec.badge] ?? 0) : 0;
          const center = route.name === "reels";
          const tint = focused ? (onReels || t.dark ? t.colors.gold : t.colors.heading) : onReels ? "rgba(255,253,248,0.78)" : t.colors.textMuted;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptics.select();
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={count ? `${spec.label}, ${count} new` : spec.label}
              style={styles.item}
            >
              {center ? (
                <View style={styles.centerWrap}>
                  <LinearGradient colors={t.gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.centerButton, { borderColor: t.colors.gold }]}>
                    <Icon icon={spec.icon} size={22} color={t.colors.accentFg} />
                  </LinearGradient>
                </View>
              ) : (
                <View>
                  <Icon icon={spec.icon} size={22} color={tint} strokeWidth={focused ? 2.3 : 1.9} />
                  {count > 0 ? (
                    <View style={[styles.badge, { backgroundColor: t.colors.accent, borderColor: body === "transparent" ? t.colors.sheet : t.colors.sheet }]}>
                      <Text variant="caption" style={{ color: t.colors.accentFg, fontSize: 10 }} maxFontSizeMultiplier={1}>
                        {count > 9 ? "9+" : count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
              <Text variant="caption" style={{ color: tint, fontSize: 10.5 }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                {spec.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, alignItems: "center" },
  bar: {
    flexDirection: "row",
    width: "100%",
    maxWidth: layout.maxContentWidth,
    height: layout.tabBarHeight,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 2 },
  centerWrap: { marginTop: -2 },
  centerButton: { width: 40, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  badge: {
    position: "absolute",
    top: -5,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
});
