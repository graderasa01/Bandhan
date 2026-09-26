import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { UserDto } from "~/types/api";

/**
 * Where the session token lives: the platform keychain (iOS Keychain /
 * Android Keystore-backed storage) on a phone. The web preview has no
 * keychain and uses localStorage — it is a development surface, not a
 * shipped client.
 *
 * Cached in memory after the first read so every request (and every gated
 * image, which needs the header synchronously) does not wait on the keychain.
 */
const KEY = "bt_session_token";
/** The member the token last belonged to — see `memberCache`. */
const MEMBER_KEY = "bt_session_member";

let cached: string | null | undefined;

function webStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

async function read(key: string): Promise<string | null> {
  return Platform.OS === "web" ? (webStorage()?.getItem(key) ?? null) : await SecureStore.getItemAsync(key);
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") webStorage()?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

async function remove(key: string): Promise<void> {
  if (Platform.OS === "web") webStorage()?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

export const tokenStore = {
  async get(): Promise<string | null> {
    if (cached !== undefined) return cached;
    try {
      cached = await read(KEY);
    } catch {
      cached = null;
    }
    return cached;
  },

  /** Synchronous — only valid after `get()` has run once (the session store does that at launch). */
  peek(): string | null {
    return cached ?? null;
  },

  async set(token: string): Promise<void> {
    cached = token;
    try {
      await write(KEY, token);
    } catch {
      // The in-memory copy still works for this launch; the next launch simply asks to log in.
    }
  },

  /** Signs this device out: the token and the member it belonged to go together. */
  async clear(): Promise<void> {
    cached = null;
    try {
      await remove(KEY);
      await remove(MEMBER_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

function isMember(value: unknown): value is UserDto {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.status === "string" && typeof v.role === "string" && typeof v.full_name === "string";
}

/**
 * The member the stored token last belonged to, kept beside it in the
 * keychain. Launch reads it before asking the server, so the app opens on the
 * right screen at once — and on the right one offline, where an ACTIVE member
 * used to be sent to profile setup because nobody knew their status yet. The
 * server's answer replaces it as soon as it arrives.
 */
export const memberCache = {
  async get(): Promise<UserDto | null> {
    try {
      const raw = await read(MEMBER_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isMember(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  async set(user: UserDto): Promise<void> {
    try {
      await write(MEMBER_KEY, JSON.stringify(user));
    } catch {
      // Only a faster next launch is lost.
    }
  },
};
