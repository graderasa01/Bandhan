"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GrioProfileSection } from "@/lib/contracts/grioProfile";

/**
 * What one Grio conversation is *about*, when it is about anything.
 *
 * A union rather than an optional-field bag because the two scopes are two
 * different jobs with different permissions, and the compiler should be the
 * thing that stops them being confused:
 *
 *  - `match` — helping write a real message to someone who already said yes.
 *    Grio sees that thread's recent messages and may propose `<<<SEND>>>`.
 *  - `candidate` — Rishta Lens: explaining one opened profile's fit. Grio sees
 *    a dossier bounded by the viewer's own L1/L2/L3 level and may **not**
 *    propose sending anything, because there is no thread to send into.
 *
 * The API refuses a request carrying both, so a shape that could express both
 * would only be a way to build an error.
 *
 * `source` says where a candidate scope came from. A scope that came from the
 * screen ("reel", "page") *follows* the screen: swipe to the next person and
 * the conversation's subject moves with you, so Grio never keeps answering
 * about somebody who has scrolled away. A scope the member chose inside the
 * chat (a card's "Ask Grio", a name) stays put.
 */
export type GrioScope =
  | { kind: "match"; matchId: string; name: string }
  | { kind: "candidate"; profileId: string; name: string; source?: "reel" | "page" | "chat" };

/** The person a screen is showing right now — see `setPageProfile`. */
export interface GrioPageProfile {
  profileId: string;
  name: string;
  surface: "reel" | "page";
}

/**
 * Doors a screen can open for Grio — the reel's own kundli and details sheets.
 * Each returns false when it cannot (the person is no longer on that screen),
 * and the caller falls back to the profile page.
 */
export interface GrioPageActions {
  openKundli?: (profileId: string) => boolean;
  openSection?: (profileId: string, section: GrioProfileSection) => boolean;
}

interface GrioContextValue {
  isOpen: boolean;
  scope: GrioScope | null;
  /** Opens the panel, optionally pre-scoped, optionally with a question to ask straight away. */
  open: (scope?: GrioScope, opts?: { ask?: string }) => void;
  close: () => void;
  setScope: (scope: GrioScope | null) => void;
  /**
   * Whether this user's plan includes talking to Grio out loud (`grioVoice`).
   *
   * Resolved once on the server in `app/user/layout.tsx` and passed down,
   * rather than fetched by the chat: the layout already has the user, the
   * answer cannot change mid-session, and a client fetch would put a
   * plan-shaped round trip on every panel open for one boolean.
   */
  voiceEnabled: boolean;
  /** The profile on screen right now (the reel's current card, a profile page), or null. */
  pageProfile: GrioPageProfile | null;
  setPageProfile: (profile: GrioPageProfile | null) => void;
  /** A screen registers its sheets; returns the unregister function. */
  registerPageActions: (actions: GrioPageActions) => () => void;
  pageActions: () => GrioPageActions | null;
  /** A question queued by `open(…, { ask })`, taken once by the chat. */
  takePendingAsk: () => string | null;
  pendingAskVersion: number;
}

const GrioContext = createContext<GrioContextValue | null>(null);

export function useGrio() {
  const ctx = useContext(GrioContext);
  if (!ctx) throw new Error("useGrio must be used inside <GrioProvider>");
  return ctx;
}

/**
 * Lives in app/user/layout.tsx (not inside UserShell, which every page
 * remounts) so the panel — and whatever scope/conversation is mid-flight —
 * survives normal navigation between /user/* pages.
 */
export default function GrioProvider({
  children,
  voiceEnabled = false,
}: {
  children: ReactNode;
  voiceEnabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<GrioScope | null>(null);
  const [pageProfile, setPageProfile] = useState<GrioPageProfile | null>(null);
  const actionsRef = useRef<GrioPageActions | null>(null);
  const pendingAskRef = useRef<string | null>(null);
  const [pendingAskVersion, setPendingAskVersion] = useState(0);

  const open = useCallback(
    (nextScope?: GrioScope, opts?: { ask?: string }) => {
      if (nextScope) setScope(nextScope);
      else if (pageProfile) {
        // Opened from the bubble on a screen that is showing somebody: the
        // conversation is about them unless the member says otherwise.
        setScope((prev) =>
          prev?.kind === "candidate" && prev.profileId === pageProfile.profileId
            ? prev
            : { kind: "candidate", profileId: pageProfile.profileId, name: pageProfile.name, source: pageProfile.surface },
        );
      }
      if (opts?.ask?.trim()) {
        pendingAskRef.current = opts.ask.trim();
        setPendingAskVersion((v) => v + 1);
      }
      setIsOpen(true);
    },
    [pageProfile],
  );

  const close = useCallback(() => setIsOpen(false), []);

  // The screen moved on to somebody else: a scope that came *from* the screen
  // moves with it, so the next question is about the person actually showing.
  useEffect(() => {
    if (!pageProfile) return;
    setScope((prev) =>
      prev?.kind === "candidate" &&
      (prev.source === "reel" || prev.source === "page") &&
      prev.profileId !== pageProfile.profileId
        ? { kind: "candidate", profileId: pageProfile.profileId, name: pageProfile.name, source: prev.source }
        : prev,
    );
  }, [pageProfile]);

  const registerPageActions = useCallback((actions: GrioPageActions) => {
    actionsRef.current = actions;
    return () => {
      if (actionsRef.current === actions) actionsRef.current = null;
    };
  }, []);
  const pageActions = useCallback(() => actionsRef.current, []);

  const takePendingAsk = useCallback(() => {
    const q = pendingAskRef.current;
    pendingAskRef.current = null;
    return q;
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      scope,
      open,
      close,
      setScope,
      voiceEnabled,
      pageProfile,
      setPageProfile,
      registerPageActions,
      pageActions,
      takePendingAsk,
      pendingAskVersion,
    }),
    [isOpen, scope, open, close, voiceEnabled, pageProfile, registerPageActions, pageActions, takePendingAsk, pendingAskVersion],
  );

  return <GrioContext.Provider value={value}>{children}</GrioContext.Provider>;
}
