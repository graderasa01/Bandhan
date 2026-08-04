"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface GrioScope {
  matchId: string;
  name: string;
}

interface GrioContextValue {
  isOpen: boolean;
  scope: GrioScope | null;
  /** Opens the panel, optionally pre-scoped to one match (the in-chat entry point). */
  open: (scope?: GrioScope) => void;
  close: () => void;
  setScope: (scope: GrioScope | null) => void;
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
export default function GrioProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<GrioScope | null>(null);

  const open = useCallback((nextScope?: GrioScope) => {
    if (nextScope) setScope(nextScope);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ isOpen, scope, open, close, setScope }), [isOpen, scope, open, close]);

  return <GrioContext.Provider value={value}>{children}</GrioContext.Provider>;
}
