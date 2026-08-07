"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

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
 */
export type GrioScope =
  | { kind: "match"; matchId: string; name: string }
  | { kind: "candidate"; profileId: string; name: string };

interface GrioContextValue {
  isOpen: boolean;
  scope: GrioScope | null;
  /** Opens the panel, optionally pre-scoped to one match (the in-chat entry point). */
  open: (scope?: GrioScope) => void;
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

  const open = useCallback((nextScope?: GrioScope) => {
    if (nextScope) setScope(nextScope);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, scope, open, close, setScope, voiceEnabled }),
    [isOpen, scope, open, close, voiceEnabled],
  );

  return <GrioContext.Provider value={value}>{children}</GrioContext.Provider>;
}
