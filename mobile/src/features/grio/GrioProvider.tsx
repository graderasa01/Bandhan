import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { create, useStore } from "zustand";
import { toast } from "~/components";
import { refreshAfterGrio } from "~/hooks/queries";
import { IS_MOCK, WEB_ORIGIN } from "~/services/config";
import { useSession } from "~/store/session";
import { haptics } from "~/utils/haptics";
import { createGrioEngine, type GrioEngine, type GrioState } from "./engine/engine";
import { liveGrioTransport } from "./engine/transport.live";
import { mockGrioTransport } from "./engine/transport.mock";
import type { GrioEffects, GrioEntry } from "./engine/types";

/**
 * One Grio for the whole signed-in app.
 *
 * The engine (and so the conversation) lives here, above the navigator, so it
 * survives moving between screens and closing / reopening the Grio room — the
 * web keeps its overlay mounted on every `/user/*` page for the same reason.
 * This file only binds the engine's side effects to the app: the router, the
 * toast, haptics, React Query refreshes, the website in the in-app browser.
 *
 * Signing out drops the conversation — whoever signs in next on this phone sees
 * nothing of the last member's Grio.
 */

const GrioContext = createContext<GrioEngine | null>(null);

/** Screens a member reaches only once their profile is live (the navigator's `active` guard). */
const ACTIVE_ONLY = /^\/(home|search|reels|interests|chats|kundli|lane\/|profile\/|chat\/)/;

export function GrioProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [engine] = useState(() => {
    const effects: GrioEffects = {
      navigate(route) {
        if (ACTIVE_ONLY.test(route) && useSession.getState().user?.status !== "ACTIVE") return false;
        // `navigate` unwinds to a screen already in the stack (a tab, the
        // profile Grio was opened from) and pushes anything else over Grio, so
        // Back returns to the conversation.
        router.navigate(route);
        return true;
      },
      openWebsite(path) {
        void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${path}`).catch(() => toast.error("Website nahi khul payi."));
      },
      toast(tone, message) {
        if (tone === "success") toast.success(message);
        else if (tone === "error") toast.error(message);
        else toast.info(message);
      },
      haptic(kind) {
        if (kind === "success") haptics.success();
        else if (kind === "warn") haptics.warn();
        else haptics.tap();
      },
      refresh(event) {
        refreshAfterGrio(qc, event);
      },
      dismiss() {
        if (router.canGoBack()) router.back();
        else router.replace("/home");
      },
    };
    return createGrioEngine(IS_MOCK ? mockGrioTransport : liveGrioTransport, effects);
  });

  useEffect(
    () =>
      useSession.subscribe((next, prev) => {
        if (prev.status === "signedIn" && next.status !== "signedIn") engine.reset();
      }),
    [engine],
  );

  return <GrioContext.Provider value={engine}>{children}</GrioContext.Provider>;
}

export function useGrio(): GrioEngine {
  const engine = useContext(GrioContext);
  if (!engine) throw new Error("useGrio must be used inside <GrioProvider>");
  return engine;
}

/** A slice of the conversation, re-rendering only when it changes. */
export function useGrioState<T>(selector: (state: GrioState) => T): T {
  return useStore(useGrio().store, selector);
}

/**
 * Opens the Grio room with a screen's context — the person on the reel card,
 * the open chat, the member's search. The ids are the app's own; nothing a
 * model wrote can reach here. `ask` is sent at once, exactly as if typed.
 */
export function useOpenGrio() {
  const engine = useGrio();
  return useCallback(
    (entry: GrioEntry, opts?: { ask?: string }) => {
      engine.open(entry, opts);
      router.navigate("/grio");
    },
    [engine],
  );
}

/* ------------------------------------------------------------------ */
/* what the screen under the launcher is about                         */
/* ------------------------------------------------------------------ */

interface ScreenContextState {
  entry: GrioEntry | null;
  set(entry: GrioEntry | null): void;
}

/** The context the floating Grio button opens with — published by the focused screen. */
export const useGrioScreen = create<ScreenContextState>((set) => ({ entry: null, set: (entry) => set({ entry }) }));

/**
 * A screen says what it is about while it is focused (Search: the member's
 * filters), so the launcher opens Grio already knowing. Cleared on blur.
 */
export function useGrioScreenContext(entry: GrioEntry | null) {
  const key = entry ? JSON.stringify(entry) : "";
  useFocusEffect(
    useCallback(() => {
      const value = key ? (JSON.parse(key) as GrioEntry) : null;
      useGrioScreen.getState().set(value);
      return () => {
        if (useGrioScreen.getState().entry === value) useGrioScreen.getState().set(null);
      };
    }, [key]),
  );
}
