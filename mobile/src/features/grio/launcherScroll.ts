import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { create } from "zustand";

/**
 * Grio's floating launcher steps aside while the member reads.
 *
 * Scrolling down through a list hides it; any move back up (or being near the
 * top) brings it back. So at rest after reading down, nothing of the list —
 * a card's Interest button, a row's badge — sits under the launcher; it
 * returns the moment the member reaches back for it.
 */
export const useLauncherHidden = create<{ hidden: boolean; set(hidden: boolean): void }>((set) => ({
  hidden: false,
  set: (hidden) => set({ hidden }),
}));

const NOISE = 6;
const NEAR_TOP = 60;

/** `onScroll` for a tab screen's list. Resets on focus, so a new tab starts with the launcher shown. */
export function useLauncherScroll() {
  const last = useRef(0);
  useFocusEffect(
    useCallback(() => {
      last.current = 0;
      useLauncherHidden.getState().set(false);
    }, []),
  );
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - last.current;
    if (Math.abs(dy) < NOISE) return;
    last.current = y;
    const hide = dy > 0 && y > NEAR_TOP;
    if (useLauncherHidden.getState().hidden !== hide) useLauncherHidden.getState().set(hide);
  }, []);
}
