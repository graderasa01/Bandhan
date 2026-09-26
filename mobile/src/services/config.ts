import { Platform } from "react-native";

/**
 * Build-time configuration. `EXPO_PUBLIC_*` values are inlined by the bundler
 * (see `.env.example`); nothing secret may ever live here — every AI, SMS and
 * payment key stays on the BandhanTak server.
 */

export type DataMode = "live" | "mock";

/**
 * `mock` runs the whole app on built-in sample data (no backend needed) — the
 * default for a bare `npx expo start`, so UI work never waits on a server.
 * Store builds set `live` in eas.json.
 */
export const DATA_MODE: DataMode = process.env.EXPO_PUBLIC_DATA_MODE === "live" ? "live" : "mock";
export const IS_MOCK = DATA_MODE === "mock";

const PRODUCTION_ORIGIN = "https://bandhantak.com";

/** The backend's own origin — used for links a member opens in the browser. */
export const WEB_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || PRODUCTION_ORIGIN).replace(/\/+$/, "");

/**
 * The web preview can call the API same-origin through the dev server's proxy
 * (metro.config.js) — a browser tab has CORS, a phone app does not.
 */
const WEB_API_PROXY = Platform.OS === "web" && process.env.EXPO_PUBLIC_WEB_API_PROXY === "1";

/** Prefix for every API call. */
export const API_BASE = WEB_API_PROXY ? "" : WEB_ORIGIN;

/**
 * Sent on every request. The server reads the session from the bearer token
 * instead of a cookie when it sees this (lib/auth/session.ts,
 * `NATIVE_CLIENT_HEADER`) and hands freshly minted tokens back in the body.
 */
export const CLIENT_HEADER_NAME = "x-bandhantak-client";
export const CLIENT_HEADER_VALUE = "mobile";

export const APP_VERSION = "1.0.0";
