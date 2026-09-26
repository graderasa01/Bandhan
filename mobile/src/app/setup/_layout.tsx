import { Stack } from "expo-router";
import { useTheme } from "~/theme";

export default function SetupLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: t.colors.background } }} />;
}
