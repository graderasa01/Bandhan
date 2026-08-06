"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, type NavItem } from "@/components/layout/navItems";

const STORAGE_KEY = "bandhantak-recent-nav";
const MAX = 3;

/**
 * Most navigation is repetition — the same three or four screens, over and
 * over. Surfacing them saves the hub's whole search-or-scan step for the
 * common case.
 *
 * Only hub destinations are recorded. Recording every visited URL would fill
 * the row with individual profile pages, which are reached by tapping a face
 * and never by name.
 */
function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

export function recordVisit(pathname: string): void {
  if (!NAV_ITEMS.some((i) => i.href === pathname)) return;
  try {
    const next = [pathname, ...read().filter((h) => h !== pathname)].slice(0, MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — recents are a convenience, never a dependency.
  }
}

/**
 * Reads once on mount rather than tracking live: the row sits inside the hub,
 * and re-ordering it under the user's finger as they navigate would move the
 * target they were reaching for.
 */
export function useRecentPages(exclude?: string | null): NavItem[] {
  const [hrefs, setHrefs] = useState<string[]>([]);

  useEffect(() => {
    setHrefs(read());
  }, []);

  return hrefs
    .filter((h) => h !== exclude)
    .map((h) => NAV_ITEMS.find((i) => i.href === h))
    .filter((i): i is NavItem => Boolean(i));
}

/** Mounted once in UserShell so every hub destination is recorded as it's visited. */
export function useRecordVisit(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordVisit(pathname);
  }, [pathname]);
}
