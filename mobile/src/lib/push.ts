import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

// How a notification behaves when it arrives while the app is foregrounded.
// SDK 56: use shouldShowBanner/shouldShowList (shouldShowAlert is deprecated).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Ask for permission, get this device's Expo push token, and register it with
// our backend so /api/requests can notify it. Returns the token or null.
//
// Note: push tokens only work on a physical device in a dev/production build —
// never on a simulator, and (since SDK 53) never in Expo Go. That's expected;
// we test push on a real-device dev build.
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  if (!projectId) {
    // Set once we run `eas init`. Without it getExpoPushTokenAsync can't attribute the token.
    console.warn("No EAS projectId yet — run `eas init` before testing push.");
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/register-push", { method: "POST", json: { expo_token: token } });
    return token;
  } catch (e) {
    console.warn("Push registration failed:", e);
    return null;
  }
}
