import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastHost } from "~/components";
import { BootSplash } from "~/features/boot/BootSplash";
import { GrioProvider } from "~/features/grio/GrioProvider";
import { ApiError } from "~/services/api/client";
import { configureNotifications } from "~/services/push";
import { themeService } from "~/services/theme";
import { prefsHydrated } from "~/store/prefs";
import { useSession } from "~/store/session";
import { ThemeProvider, useTheme } from "~/theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx is an answer, not a blip — retrying it only delays the message.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
});

// React Query's "window focus" on a phone is the app coming back to the foreground.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
}

function RootNavigator({ prefsReady }: { prefsReady: boolean }) {
  const t = useTheme();
  const status = useSession((s) => s.status);
  const active = useSession((s) => s.user?.status === "ACTIVE");
  const signedIn = status === "signedIn";

  // Not mounted until the session (and the onboarding flag) is known: mounted
  // early, every guard reads false, and the URL the app was opened with (a
  // notification, a shared link) is bounced to the anchor and lost before
  // anyone could judge it.
  if (status === "loading" || !prefsReady) return <BootSplash />;
  if (status === "offline") return <BootSplash onRetry={() => void useSession.getState().hydrate()} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: t.colors.background },
      }}
    >
      {/* The anchor — the splash, and where every guard change lands. */}
      <Stack.Screen name="index" options={{ animation: "fade" }} />

      {/* Bolo, outside both guards: a visitor starts it signed out and finishes
          it signed in, on the same screen (the done step must not be bounced). */}
      <Stack.Screen name="bolo" options={{ animation: "fade", gestureEnabled: false }} />

      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="setup" />
        <Stack.Screen name="me" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="assistant" />
        <Stack.Screen name="notifications" />
        {/* Grio's room — slides up over whatever it was opened from, and Back
            (or ✕, or "Grio band karo") returns there with the conversation kept. */}
        <Stack.Screen name="grio" options={{ animation: "slide_from_bottom" }} />

        <Stack.Protected guard={active}>
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          <Stack.Screen name="profile/[id]" />
          <Stack.Screen name="chat/[matchId]" />
          <Stack.Screen name="kundli" />
          <Stack.Screen name="lane/[lane]" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });
  const [prefsReady, setPrefsReady] = useState(false);
  const status = useSession((s) => s.status);

  useEffect(() => {
    configureNotifications();
    // The member's room choice and the last good admin theme, both from the
    // phone, before anything paints — the first frame is already the right room.
    void Promise.all([prefsHydrated(), themeService.hydrate()]).finally(() => setPrefsReady(true));
    void useSession.getState().hydrate();
    // Whoever signs in next on this phone must see nothing of the last member —
    // their chats, profile and interests leave the cache with them. The room
    // (public, not theirs) stays so the screen does not flash.
    return useSession.subscribe((next, prev) => {
      if (prev.status === "signedIn" && next.status === "signedOut") {
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "theme-config" });
      }
    });
  }, []);

  // The native splash stays up until the first real screen can be chosen: a
  // remembered member makes that instant; otherwise it waits on the server.
  const fontsDone = fontsLoaded || Boolean(fontError);
  const booted = fontsDone && prefsReady && status !== "loading";
  useEffect(() => {
    if (booted) void SplashScreen.hideAsync().catch(() => {});
  }, [booted]);

  // The native splash covers this: nothing is painted in a room that is not yet known.
  if (!fontsDone || !prefsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <GrioProvider>
              <RootNavigator prefsReady={prefsReady} />
            </GrioProvider>
            <ToastHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
