import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Light tactile feedback on the moments that matter (a decision, a success). No-op on the web preview. */
export const haptics = {
  tap() {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  select() {
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
  },
  success() {
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warn() {
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
