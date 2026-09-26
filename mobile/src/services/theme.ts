import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { IS_MOCK } from "./config";
import { api } from "./api/client";
import type { ThemeConfigResponse } from "~/types/api";

/**
 * The look an admin configured on /admin/theme — which rooms are on, the
 * default, each photo room's mobile background and resolved glass, and the
 * site's brand colours (`GET /api/mobile/theme`). Read-only: the app consumes
 * the theme, it never edits it (that stays in the web admin).
 *
 * ## Never unusable, never flashing
 *
 * Every answer is validated before the app believes it; a broken or partial
 * one is ignored rather than half-applied. The last good answer is kept on
 * the phone, and launch starts from it — so a member whose admin set a photo
 * room does not see the drawn room for a second first, and a phone with no
 * signal still opens in the room it last had. With nothing stored and no
 * server, the built-in rooms stand in: a theme is decoration, and decoration
 * never blocks the app.
 */

const ROOM_ID = z.enum(["terrace", "ivory", "gold", "paper"]);
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const GlassSchema = z
  .object({
    transparency: z.number(),
    blur: z.number(),
    brightness: z.number(),
    saturation: z.number(),
    visibility: z.number(),
    tint: z.string(),
    tintStrength: z.number(),
    reflection: z.number(),
    edge: z.number(),
    shadowOpacity: z.number(),
    shadowBlur: z.number(),
    shadowSpread: z.number(),
    shadowDepth: z.number(),
  })
  .partial()
  .passthrough();

const RoomSchema = z.object({
  id: ROOM_ID,
  label: z.string(),
  enabled: z.boolean(),
  background: z
    .object({
      imageUrl: z.string().min(1),
      backdropUrl: z.string().nullish(),
      width: z.number(),
      height: z.number(),
      color: z.string(),
      dim: z.number(),
      focusX: z.number(),
      focusY: z.number(),
      own: z.boolean().optional(),
    })
    .nullable(),
  glass: GlassSchema.nullable(),
  glassMode: z.enum(["auto", "manual"]).nullish(),
});

const ThemeSchema = z.object({
  ok: z.literal(true),
  defaultRoom: ROOM_ID,
  enabled: z.array(ROOM_ID).min(1),
  rooms: z.array(RoomSchema).min(1),
  brand: z
    .object({
      pack: z.string(),
      custom: z
        .object({
          primary: HEX,
          primaryFg: HEX,
          primaryText: HEX,
          accent: HEX,
          accentFg: HEX,
          accentText: HEX,
          signal: HEX,
        })
        .nullable(),
    })
    .nullish(),
});

const BUILT_IN: ThemeConfigResponse = {
  ok: true,
  defaultRoom: "terrace",
  enabled: ["terrace", "ivory", "gold", "paper"],
  rooms: [
    { id: "terrace", label: "Satin", enabled: true, background: null, glass: null },
    { id: "ivory", label: "Day", enabled: true, background: null, glass: null },
    { id: "gold", label: "Night", enabled: true, background: null, glass: null },
    { id: "paper", label: "Classic", enabled: true, background: null, glass: null },
  ],
  brand: null,
};

const CACHE_KEY = "bt-theme-config:v1";

/** The last good theme this phone saw, read once at launch (before the splash lifts). */
let cached: ThemeConfigResponse | null = null;
let cacheRead: Promise<void> | null = null;
/** Whether the latest `config()` was answered by the server (false: the phone's copy stood in). */
let lastFromServer = false;

function parse(raw: unknown): ThemeConfigResponse | null {
  const result = ThemeSchema.safeParse(raw);
  return result.success ? (result.data as ThemeConfigResponse) : null;
}

export const themeService = {
  builtIn: BUILT_IN,

  /** Resolves once the stored theme (if any) is in memory — the launch waits on it, so the first frame is the right room. */
  hydrate(): Promise<void> {
    if (!cacheRead) {
      cacheRead = (async () => {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          cached = raw ? parse(JSON.parse(raw)) : null;
        } catch {
          cached = null;
        }
      })();
    }
    return cacheRead;
  },

  /** What to paint before the server answers: the last good theme, else the built-in rooms. */
  initial(): ThemeConfigResponse {
    return cached ?? BUILT_IN;
  },

  /**
   * The admin's current theme. Unreachable or malformed → the last good one
   * (or the built-in rooms). A good answer is stored for the next launch.
   *
   * `fresh` is for an asked-for refresh: the route lets a response be cached
   * for a minute, and the platform's URL cache (iOS, a browser) honours that,
   * so a stamped URL — one no cache has seen — goes past it. The server's own
   * short in-process cache still applies (lib/services/theme).
   */
  async config(opts?: { fresh?: boolean }): Promise<ThemeConfigResponse> {
    lastFromServer = false;
    if (IS_MOCK) return cached ?? BUILT_IN;
    const path = opts?.fresh ? `/api/mobile/theme?_=${Date.now()}` : "/api/mobile/theme";
    let fresh: ThemeConfigResponse | null = null;
    try {
      fresh = parse(await api<unknown>(path, { auth: false, timeoutMs: 12_000 }));
    } catch {
      fresh = null;
    }
    if (!fresh) return cached ?? BUILT_IN;
    cached = fresh;
    lastFromServer = true;
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
    return fresh;
  },

  /** Whether the latest `config()` came from the server rather than the phone's last good copy. */
  answeredByServer(): boolean {
    return lastFromServer;
  },
};
