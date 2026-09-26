import { Tabs } from "expo-router";
import { TabBar } from "~/features/navigation/TabBar";
import { useTheme } from "~/theme";

/** Home · Search · Reels · Interests · Chats. Profile and Settings live behind the avatar on Home. */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.colors.background }, animation: "fade" }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="reels" options={{ title: "Reels" }} />
      <Tabs.Screen name="interests" options={{ title: "Interests" }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
    </Tabs>
  );
}
