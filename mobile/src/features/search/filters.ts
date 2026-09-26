import { DISCOVER, FILTER_BY_KEY, cmToHeight } from "~/catalog";
import type { DiscoverFilters } from "~/types/api";

export type FilterKey = keyof DiscoverFilters;

/** One removable chip per active filter value — the row above the results. */
export interface ActiveChip {
  id: string;
  key: FilterKey;
  label: string;
  value?: string;
}

function numberLabel(key: FilterKey, v: number): string {
  if (key === "minAge") return `${v}+ saal`;
  if (key === "maxAge") return `≤ ${v} saal`;
  if (key === "minHeightCm") return `${cmToHeight(v)}+`;
  if (key === "maxHeightCm") return `≤ ${cmToHeight(v)}`;
  if (key === "minTrustScore") return `Trust ${v}+`;
  if (key === "minCompleteness") return `Profile ${v}%+`;
  return String(v);
}

export function activeChips(filters: DiscoverFilters): ActiveChip[] {
  const out: ActiveChip[] = [];
  for (const [rawKey, value] of Object.entries(filters)) {
    const key = rawKey as FilterKey;
    if (value === undefined || value === null || value === "" || value === false) continue;
    const def = FILTER_BY_KEY[key];
    if (Array.isArray(value)) {
      value.forEach((v) => out.push({ id: `${key}:${v}`, key, label: v, value: v }));
    } else if (typeof value === "number") {
      out.push({ id: key, key, label: numberLabel(key, value) });
    } else if (typeof value === "boolean") {
      out.push({ id: key, key, label: def?.label ?? key });
    } else {
      out.push({ id: key, key, label: key === "lookingForGender" ? (value === "Ladki" ? "Ladkiyan" : "Ladke") : `${def?.label ?? key}: ${value}` });
    }
  }
  return out;
}

export function removeChip(filters: DiscoverFilters, chip: ActiveChip): DiscoverFilters {
  const next: DiscoverFilters = { ...filters };
  const current = next[chip.key];
  if (Array.isArray(current) && chip.value !== undefined) {
    const rest = current.filter((v) => v !== chip.value);
    (next as Record<string, unknown>)[chip.key] = rest.length ? rest : undefined;
  } else {
    delete next[chip.key];
  }
  return next;
}

/** Filters that count toward the badge — the gender default is not a filter the member chose. */
export function countActive(filters: DiscoverFilters): number {
  return activeChips(filters).filter((c) => c.key !== "lookingForGender").length;
}

export function clean(filters: DiscoverFilters): DiscoverFilters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as DiscoverFilters;
}

export const AGE_LIMITS = { min: DISCOVER.minAge, max: DISCOVER.maxAge };
export const HEIGHT_LIMITS = { min: DISCOVER.minHeightCm, max: DISCOVER.maxHeightCm };
