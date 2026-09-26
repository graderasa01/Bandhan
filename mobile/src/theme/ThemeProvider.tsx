import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { resolveMediaUrl } from "~/services/api/client";
import { themeService } from "~/services/theme";
import { usePrefs } from "~/store/prefs";
import type { ThemeConfigResponse, ThemeRoomConfig } from "~/types/api";
import { resolveTheme } from "./glass";
import { isRoomId, type RoomId, type Theme } from "./rooms";

interface ThemeContextValue {
  theme: Theme;
  roomId: RoomId;
  /** The admin's mobile photo for this room, if any. */
  background: ThemeRoomConfig["background"];
  /** Every room's mobile photo (Classic never has one) — what the room picker shows as its swatch. */
  roomBackgrounds: Partial<Record<RoomId, NonNullable<ThemeRoomConfig["background"]>>>;
  /** Whose numbers the glass is: the admin's (manual) or worked out from the photo (auto). Null without a photo. */
  glassMode: ThemeRoomConfig["glassMode"];
  enabledRooms: RoomId[];
  setRoom(room: RoomId | null): void;
  /**
   * Ask the server again now, past every HTTP cache — Appearance's "Refresh
   * Theme", and anything testing an admin change. Resolves true when the
   * server answered, false when the phone's last good look stood in.
   */
  refresh(): Promise<boolean>;
  refreshing: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The room a member lands in: their own choice while the admin keeps it on, else the admin's default. */
function resolveRoom(chosen: RoomId | null, config: ThemeConfigResponse): RoomId {
  const enabled = config.enabled.filter(isRoomId);
  if (chosen && enabled.includes(chosen)) return chosen;
  return isRoomId(config.defaultRoom) ? config.defaultRoom : "terrace";
}

export const THEME_QUERY_KEY = ["theme-config"] as const;

/**
 * The admin's look, applied to the whole app without a store release:
 *
 *   launch        the last good theme from the phone (read before the splash
 *                 lifts — no flash), then the server's
 *   foreground    asked again whenever the app comes back (React Query's focus
 *                 = AppState "active", wired in the root layout)
 *   expiry        again once the answer is five minutes old
 *   on demand     `refresh()`
 *
 * Every screen reads `useTheme()` and paints from the resolved tokens, so one
 * admin change repaints everything at once.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const chosen = usePrefs((s) => s.room);
  const setRoom = usePrefs((s) => s.setRoom);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: THEME_QUERY_KEY,
    // Wrapped: React Query passes its own context as the first argument.
    queryFn: () => themeService.config(),
    // The service answers offline itself (the last good look), so a fetch is
    // never parked waiting for the network — a "Refresh Theme" tapped with no
    // signal says so at once instead of spinning until it returns.
    networkMode: "always",
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: true,
    initialData: themeService.initial,
    // The stored theme is only a starting point: ask the server on launch too.
    initialDataUpdatedAt: 0,
  });
  const config = query.data ?? themeService.builtIn;
  const refreshing = query.isFetching;

  const refresh = useCallback(async () => {
    await queryClient.fetchQuery({
      queryKey: THEME_QUERY_KEY,
      queryFn: () => themeService.config({ fresh: true }),
      networkMode: "always",
      staleTime: 0,
    });
    return themeService.answeredByServer();
  }, [queryClient]);

  const value = useMemo<ThemeContextValue>(() => {
    const roomId = resolveRoom(chosen, config);
    const roomConfig = config.rooms.find((r) => r.id === roomId);
    const background = roomId === "paper" ? null : (roomConfig?.background ?? null);
    const roomBackgrounds: ThemeContextValue["roomBackgrounds"] = {};
    for (const room of config.rooms) {
      if (isRoomId(room.id) && room.id !== "paper" && room.background) roomBackgrounds[room.id] = room.background;
    }
    return {
      theme: resolveTheme({ room: roomId, background, glass: roomConfig?.glass ?? null, brand: config.brand ?? null }),
      roomId,
      background,
      roomBackgrounds,
      glassMode: background ? (roomConfig?.glassMode ?? null) : null,
      enabledRooms: config.enabled.filter(isRoomId),
      setRoom,
      refresh,
      refreshing,
    };
  }, [chosen, config, setRoom, refresh, refreshing]);

  // Every room's photo into the disk cache as soon as it is known, so a room
  // switch — or the next launch without signal — shows it at once.
  const photos = useMemo(
    () =>
      config.rooms
        .flatMap((r) => (r.background ? [r.background.backdropUrl, r.background.imageUrl] : []))
        .map((u) => resolveMediaUrl(u))
        .filter((u): u is string => Boolean(u)),
    [config.rooms],
  );
  const prefetch = useCallback(() => {
    if (photos.length > 0) void Image.prefetch(photos, "memory-disk").catch(() => false);
  }, [photos]);
  useEffect(prefetch, [prefetch]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useThemeRoom() {
  return useThemeContext();
}

/**
 * Theme-aware StyleSheets, built once per resolved theme and cached:
 *
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.colors.glass } }));
 *   function Card() { const s = useStyles(); ... }
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
