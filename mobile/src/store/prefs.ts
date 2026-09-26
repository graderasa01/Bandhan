import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RoomId } from "~/theme/rooms";

/**
 * Small per-device choices — never anything another device or the server
 * needs to know. (Privacy settings live on the server; see settingsService.)
 */
interface PrefsState {
  onboardingSeen: boolean;
  /** The member's chosen room; null = the admin's default. */
  room: RoomId | null;
  /** Reel gesture coach shown once. */
  reelCoachSeen: boolean;
  /** Push permission asked once from our own explainer, never on first launch. */
  pushAsked: boolean;
  setOnboardingSeen(): void;
  setRoom(room: RoomId | null): void;
  setReelCoachSeen(): void;
  setPushAsked(): void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      onboardingSeen: false,
      room: null,
      reelCoachSeen: false,
      pushAsked: false,
      setOnboardingSeen: () => set({ onboardingSeen: true }),
      setRoom: (room) => set({ room }),
      setReelCoachSeen: () => set({ reelCoachSeen: true }),
      setPushAsked: () => set({ pushAsked: true }),
    }),
    {
      name: "bt-prefs",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Resolves once the persisted prefs have loaded (the splash waits on it). */
export function prefsHydrated(): Promise<void> {
  if (usePrefs.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = usePrefs.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
