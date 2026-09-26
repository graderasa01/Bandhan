import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Push notifications — the device half.
 *
 * What exists today: the server writes every event (new interest, accepted
 * interest, match, message, profile/AI reminder) through `createNotice()`,
 * which the app's inbox and badges already read. What this file adds is the
 * phone side: permission, the Android channel, the Expo push token, and
 * routing a tapped notification to the right screen (`data.href`).
 *
 * What is still to do (server): `createNotice()` fans out to web push only.
 * Delivering to phones needs a token table + a send through the Expo push
 * service — see mobile/README.md "Next integration tasks". Until then
 * `registerDevice()` gets the token and says the server step is pending.
 */

let handlerConfigured = false;

export function configureNotifications() {
  if (handlerConfigured || Platform.OS === "web") return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync("default", {
      name: "Rishtey aur messages",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#8c2233",
    });
  }
}

export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

export async function pushPermission(): Promise<PushPermission> {
  if (Platform.OS === "web" || !Device.isDevice) return "unsupported";
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (Platform.OS === "web" || !Device.isDevice) return "unsupported";
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export type RegisterResult =
  | { ok: true; token: string; serverRegistered: false }
  | { ok: false; reason: "unsupported" | "denied" | "no_project" | "failed" };

export async function registerDevice(): Promise<RegisterResult> {
  const permission = await pushPermission();
  if (permission === "unsupported") return { ok: false, reason: "unsupported" };
  if (permission !== "granted") return { ok: false, reason: "denied" };

  // An Expo push token is issued per EAS project (`eas init` writes the id).
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: "no_project" };

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data, serverRegistered: false };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
