import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Role, SiteTheme, ThemePack } from "@prisma/client";
import { isValidHex, pickForeground } from "@/lib/theme/contrast";

/**
 * Site-wide colour theme, admin-controlled from /admin/theme — same
 * "in-process cache, short TTL" shape as lib/ai/aiConfigService.ts, because
 * the root layout reads this on every request and a DB round trip there on
 * every page load would be wasteful for a value that only an admin changes,
 * rarely. A DB hiccup must not take the whole site down, so this never
 * throws — it falls back to KUNDAN (the app's original, always-safe look).
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; theme: SiteTheme } | null = null;

const DEFAULT_THEME: SiteTheme = {
  id: "default",
  pack: "KUNDAN",
  customPrimary: null,
  customPrimaryText: null,
  customAccent: null,
  customAccentText: null,
  customSignal: null,
  updatedAt: new Date(0),
  updatedBy: null,
};

async function loadTheme(): Promise<SiteTheme> {
  const row = await prisma.siteTheme.findUnique({ where: { id: "default" } });
  return row ?? DEFAULT_THEME;
}

/** The five identity colours a CUSTOM theme actually carries — everything
 *  else (neutrals, warn/danger/info) stays whatever KUNDAN already has, so a
 *  free colour pick can never touch a token D-21 already audited. */
export type CustomThemeVars = {
  "--bt-primary": string;
  "--bt-primary-hover": string;
  "--bt-primary-fg": string;
  "--bt-primary-text": string;
  "--bt-accent": string;
  "--bt-accent-hover": string;
  "--bt-accent-fg": string;
  "--bt-accent-text": string;
  "--bt-trust": string;
};

export type ActiveTheme = {
  pack: ThemePack;
  /** Only set when pack === "CUSTOM" — inline style overrides for <html>. */
  customVars: CustomThemeVars | null;
};

function buildCustomVars(theme: SiteTheme): CustomThemeVars | null {
  if (theme.pack !== "CUSTOM") return null;
  const primary = theme.customPrimary ?? "#c9a96e";
  const primaryText = theme.customPrimaryText ?? "#806634";
  const accent = theme.customAccent ?? "#4a1119";
  const accentText = theme.customAccentText ?? "#4a1119";
  const signal = theme.customSignal ?? "#1f7a5a";

  return {
    "--bt-primary": primary,
    // No separate hover shade for a free-picked colour — Button's existing
    // hover lift/shadow (translate-y, shadow-gold) still gives feedback
    // without risking a second, unaudited hex.
    "--bt-primary-hover": primary,
    "--bt-primary-fg": pickForeground(primary),
    "--bt-primary-text": primaryText,
    "--bt-accent": accent,
    "--bt-accent-hover": accent,
    "--bt-accent-fg": pickForeground(accent),
    "--bt-accent-text": accentText,
    "--bt-trust": signal,
  };
}

/** The live theme every page render should apply — cached, never throws. */
export async function getActiveTheme(): Promise<ActiveTheme> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { pack: cache.theme.pack, customVars: buildCustomVars(cache.theme) };
  }
  try {
    const theme = await loadTheme();
    cache = { at: Date.now(), theme };
    return { pack: theme.pack, customVars: buildCustomVars(theme) };
  } catch (err) {
    console.error(
      "[theme] DB read failed, falling back to KUNDAN:",
      err instanceof Error ? err.message : String(err),
    );
    return { pack: "KUNDAN", customVars: null };
  }
}

/** For the admin page — always fresh, never the stale in-process cache. */
export async function getSiteThemeForAdmin(): Promise<SiteTheme> {
  return loadTheme();
}

export type ThemeUpdateResult = { ok: true } | { ok: false; error: string; message: string; status: number };

export async function setThemePack(params: {
  pack: Extract<ThemePack, "KUNDAN" | "RAAT" | "KAAGAZ">;
  actorId: string;
  actorRole: Role;
}): Promise<ThemeUpdateResult> {
  const { pack, actorId, actorRole } = params;
  const existing = await loadTheme();

  await prisma.$transaction(async (tx) => {
    await tx.siteTheme.upsert({
      where: { id: "default" },
      create: { id: "default", pack, updatedBy: actorId },
      update: {
        pack,
        // Switching to a preset clears any saved custom values — a later
        // "Custom" pick starts fresh rather than resurrecting stale hexes.
        customPrimary: null,
        customPrimaryText: null,
        customAccent: null,
        customAccentText: null,
        customSignal: null,
        updatedBy: actorId,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "SITE_THEME_PACK_CHANGED",
        targetType: "site_theme",
        targetId: "default",
        previousValue: existing.pack,
        newValue: pack,
      },
    });
  });

  cache = null;
  return { ok: true };
}

const CUSTOM_FIELDS = ["primary", "primaryText", "accent", "accentText", "signal"] as const;
export type CustomThemeInput = Record<(typeof CUSTOM_FIELDS)[number], string>;

export async function setCustomTheme(params: {
  colors: CustomThemeInput;
  actorId: string;
  actorRole: Role;
}): Promise<ThemeUpdateResult> {
  const { colors, actorId, actorRole } = params;

  for (const field of CUSTOM_FIELDS) {
    if (!isValidHex(colors[field])) {
      return {
        ok: false,
        error: "INVALID_HEX",
        message: `${field} ek valid hex colour nahi hai (jaise #7A1F2B).`,
        status: 422,
      };
    }
  }

  const existing = await loadTheme();

  await prisma.$transaction(async (tx) => {
    await tx.siteTheme.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        pack: "CUSTOM",
        customPrimary: colors.primary,
        customPrimaryText: colors.primaryText,
        customAccent: colors.accent,
        customAccentText: colors.accentText,
        customSignal: colors.signal,
        updatedBy: actorId,
      },
      update: {
        pack: "CUSTOM",
        customPrimary: colors.primary,
        customPrimaryText: colors.primaryText,
        customAccent: colors.accent,
        customAccentText: colors.accentText,
        customSignal: colors.signal,
        updatedBy: actorId,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: "SITE_THEME_CUSTOM_UPDATED",
        targetType: "site_theme",
        targetId: "default",
        previousValue: existing.pack === "CUSTOM" ? JSON.stringify(existing) : existing.pack,
        newValue: JSON.stringify(colors),
      },
    });
  });

  cache = null;
  return { ok: true };
}
