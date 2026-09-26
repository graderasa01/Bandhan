import { SHIPPED_GLASS, normalizeGlass, type GlassValues } from "~/shared/theme/glass";
import { contrastRatio, pickForeground } from "~/shared/theme/contrast";
import { blurIntensity, hexRgb, photoMaterial, rgba, type Material } from "./material";
import { ROOMS, type RoomId, type Theme } from "./rooms";

/**
 * The one place a screen's look is decided: the member's room, the admin's
 * photo and glass for it, and the admin's brand colours — in, one `Theme` out.
 * Every component reads the result; none of them knows which of the three
 * produced a value.
 *
 *   drawn room     the room's own measured material (`drawnMaterial`)
 *   photo room     the web's clear glass from the admin's knobs, on the Satin
 *                  base — exactly as the web does it (`PHOTO_GLASS` in
 *                  lib/theme/rooms.ts): whatever room carries a photo, the app
 *                  wears the measured /bolo material re-cut as clear glass
 *   brand          a CUSTOM pick's colours become the accent / signal tokens
 *                  (see `applyBrand`); the curated packs keep the room's own
 */

/** The admin's glass knobs (`GlassValues` in the web's lib/theme/glass.ts). */
export type AdminGlass = GlassValues;
export { SHIPPED_GLASS };

export interface ThemeBackground {
  imageUrl: string;
  backdropUrl?: string | null;
  width: number;
  height: number;
  color: string;
  dim: number;
  focusX: number;
  focusY: number;
}

export interface ThemeBrand {
  pack: string;
  custom: {
    primary: string;
    primaryFg: string;
    primaryText: string;
    accent: string;
    accentFg: string;
    accentText: string;
    signal: string;
  } | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function shade(hex: string, amount: number): string {
  const rgb = hexRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const out = rgb.map((c) => Math.round(c + (target - c) * t));
  return `#${out.map((c) => clamp(c, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Lift a colour towards white until it reads at `min`:1 on `ground` — admin colours never make information unreadable. */
function readableOn(hex: string, ground: string, min: number): string {
  let out = hex;
  for (let step = 0; step < 12 && contrastRatio(out, ground) < min; step++) out = shade(out, 0.12);
  return out;
}

/** The tokens every component read before the material existed — derived from it now, so there is one source. */
function withMaterial(theme: Theme, material: Material): Theme {
  return {
    ...theme,
    material,
    colors: {
      ...theme.colors,
      glass: material.default.body,
      glassSoft: material.soft.body,
      glassStrong: material.strong.body,
      sheet: material.raised,
    },
    glass: {
      blurIntensity: blurIntensity(material.default.blur),
      blurTint: material.blurTint,
      android: {
        glass: material.default.bodySolid,
        glassSoft: material.soft.bodySolid,
        glassStrong: material.strong.bodySolid,
      },
    },
  };
}

/**
 * A room with the admin's photo behind it wears clear glass (the web's "THE
 * PHOTO ROOM"): light type with a soft shadow over a thin body, every number
 * from the admin's knobs.
 */
function photoTheme(room: RoomId, values: GlassValues): Theme {
  const base = ROOMS.terrace;
  const material = photoMaterial(values);
  const edge = values.edge / 50;
  const line = (k: number) => `rgba(255,255,255,${Math.round(k * Math.max(0.5, edge) * 1000) / 1000})`;
  return withMaterial(
    {
      ...base,
      room,
      label: ROOMS[room].label,
      photo: true,
      dark: true,
      statusBar: "light",
      colors: {
        ...base.colors,
        text: "#ffffff",
        textSecondary: "rgba(255,255,255,0.88)",
        textMuted: "rgba(255,255,255,0.72)",
        heading: "#ffffff",
        input: "rgba(20,10,12,0.32)",
        chip: material.soft.body,
        chipText: "#ffffff",
        rim: `rgba(255,255,255,${Math.round(Math.min(1, 0.26 * edge) * 1000) / 1000})`,
        hairline: line(0.2),
        divider: line(0.14),
        tabBar: material.raised,
      },
    },
    material,
  );
}

/**
 * The admin's CUSTOM brand colours, in the roles they play on the web: on
 * Classic (paper) the primary is the gold plate a filled action is cut from and
 * the accent text is the wine ink; on the glass rooms the accent is the one
 * filled, decisive colour. The signal is success/live everywhere. Foregrounds
 * come from the server already contrast-picked, and any colour used as text is
 * lifted until it reads on the room — a free pick can never cost legibility.
 */
function applyBrand(theme: Theme, brand: ThemeBrand | null): Theme {
  const c = brand?.custom;
  if (!c) return theme;
  const colors = { ...theme.colors };
  const gradients = { ...theme.gradients };
  if (theme.room === "paper" && !theme.photo) {
    colors.accent = c.primary;
    colors.accentLit = shade(c.primary, 0.18);
    colors.accentDeep = shade(c.primary, -0.18);
    colors.accentFg = c.primaryFg;
    colors.textOnAccent = c.primaryFg;
    colors.accentSoft = rgba(hexRgb(c.primary), 0.2);
    colors.gold = readableOn(c.primaryText, colors.background, 3);
    colors.heading = c.accentText;
    colors.link = c.accentText;
    colors.chipSelected = c.accentText;
    colors.chipSelectedText = pickForeground(c.accentText);
    colors.success = c.signal;
    gradients.accent = [colors.accentLit, c.primary, colors.accentDeep];
  } else {
    colors.accent = c.accent;
    colors.accentLit = shade(c.accent, 0.2);
    colors.accentDeep = shade(c.accent, -0.35);
    colors.accentFg = c.accentFg;
    colors.textOnAccent = c.accentFg;
    colors.accentSoft = rgba(hexRgb(c.accent), 0.38);
    colors.chipSelected = c.accent;
    colors.chipSelectedText = c.accentFg;
    // On a dark room a brand green made for paper would sink — lift it until it reads.
    colors.success = readableOn(c.signal, "#2a161a", 3);
    colors.live = colors.success;
    gradients.accent = [colors.accentLit, c.accent, colors.accentDeep];
  }
  return { ...theme, colors, gradients };
}

export function resolveTheme(input: {
  room: RoomId;
  background: ThemeBackground | null;
  glass: unknown;
  brand: ThemeBrand | null;
}): Theme {
  const photo = input.background !== null && input.room !== "paper";
  const theme = photo ? photoTheme(input.room, normalizeGlass(input.glass ?? SHIPPED_GLASS)) : withMaterial(ROOMS[input.room], ROOMS[input.room].material);
  return applyBrand(theme, input.brand);
}
