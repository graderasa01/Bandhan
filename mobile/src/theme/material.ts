import { Platform } from "react-native";
import { GLASS_CONTROL, glassBody, type GlassValues } from "~/shared/theme/glass";
import type { RoomId } from "./rooms";

/**
 * THE MATERIAL — one description of what every pane in the app is made of,
 * resolved once per room and read by every surface (`GlassSurface` and the
 * components built on it). Components ask only for a *level*:
 *
 *   soft     nested information, chips, quiet rows
 *   default  ordinary cards and sheets
 *   strong   the review, modals, the action surfaces
 *
 * and get the same three weights of the same glass — or, in Classic, of the
 * same paper. Nothing on a screen picks its own body, rim or shadow.
 *
 * ## Where the numbers come from
 *
 * The drawn rooms are the web's measured material (globals.css: "THE GLASS
 * MATERIAL SYSTEM" for Satin, `.bt-glass` for Day, the Night block, "THE PAPER
 * ROOM" for Classic). A room with the admin's photo wears the web's clear
 * glass ("THE PHOTO ROOM"), built from the admin's knobs through the web's own
 * `glassBody` ladder (`src/shared/theme/glass.ts`, copied from lib/theme).
 *
 * ## Every admin knob, and what it becomes here
 *
 *   transparency, tint, tint strength
 *                 the body colour and its three weights (`glassBody`, exact)
 *   blur          web: the CSS blur (exact) · iOS: BlurView intensity ≈ px × 2.2
 *                 · Android: no live blur (cost) — a smoked body instead, whose
 *                 thickness follows transparency and the blur itself, so the
 *                 knob still reads (`smokedAlpha`)
 *   brightness    web: backdrop `brightness()` (exact) · native: a veil inside
 *                 the pane — black at 1−b below 100%, white above — which is
 *                 the same multiply on what is seen through the glass
 *   visibility    web: backdrop `contrast()` (exact) · native: a mid-grey veil
 *                 at 1−v, which *is* contrast(v): x·v + 127.5·(1−v)
 *   saturation    web: backdrop `saturate()` (exact) · iOS: the vibrant system
 *                 material above 130% (it boosts colour through the glass), a
 *                 neutral grey veil below 100% · Android: the smoked body shifts
 *                 from neutral to warm with it
 *   reflection    the sheen across the face and the lit lip (× reflection/50)
 *   edge          the rim, its width, the dark contact line, hairlines (× edge/50)
 *   shadow opacity / blur / spread / depth
 *                 the drop as a real CSS-style `boxShadow` (both platforms on
 *                 the new architecture), near layer as set, far layer at the
 *                 web's measured ratio
 */

export type SurfaceLevel = "soft" | "default" | "strong";

export interface SurfaceMaterial {
  /** Body over a live blur (iOS, web). */
  body: string;
  /** Body where nothing is blurred behind it (Android, a pane inside a pane) — thicker, so type reads. */
  bodySolid: string;
  /** Blur in CSS px (0 = none). */
  blur: number;
  /** The lit 150° rim, as the four sides a native border can colour. */
  rim: { top: string; left: string; right: string; bottom: string };
  rimWidth: number;
  /** Reflection across the face, top-left to foot; null = none (paper). */
  sheen: { colors: readonly [string, string, ...string[]]; locations: readonly [number, number, ...number[]] } | null;
  /** The lit inner edge, as inset box-shadows. */
  lip: string;
  /** The drop, as a box-shadow list (contact line first). */
  shadow: string;
  /** Paper only: a second, inner gold rule — the invitation-card border. */
  innerRule: string | null;
}

export interface Material {
  kind: "glass" | "paper";
  /** The admin's photo is behind the glass. */
  photo: boolean;
  /** What the pane does to the room seen through it (the web's backdrop-filter after the blur). */
  view: { brightness: number; visibility: number; saturation: number };
  /** iOS BlurView tint. */
  blurTint: BlurTint;
  soft: SurfaceMaterial;
  default: SurfaceMaterial;
  strong: SurfaceMaterial;
  /** Opaque — anything that comes up over live content (sheets, menus). */
  raised: string;
  /** A soft shadow for type standing on clear glass over a photo; null elsewhere. */
  textShadow: { color: string; radius: number; offsetY: number } | null;
}

export type BlurTint =
  | "dark"
  | "light"
  | "default"
  | "systemThinMaterialDark"
  | "systemThinMaterialLight"
  | "systemUltraThinMaterialDark";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

type RGB = readonly [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function rgba([r, g, b]: RGB, a: number): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${r3(clamp(a, 0, 1))})`;
}

export function hexRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * A 150° rim gradient (top-left → foot) as four border sides: the top and left
 * catch the lamp, the right runs along the dim middle of the stops, the foot
 * lifts again — the same shape a painted border-box gradient has.
 */
function rimSides(stops: readonly string[]): SurfaceMaterial["rim"] {
  const s = [...stops];
  return { top: s[0]!, left: s[1] ?? s[0]!, right: s[2] ?? s[1] ?? s[0]!, bottom: s[s.length - 1]! };
}

/** RN's boxShadow takes the CSS syntax; px units spelled out. */
function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`;
}

/* ------------------------------------------------------------------ */
/* the drawn rooms                                                     */
/* ------------------------------------------------------------------ */

const ANDROID = Platform.OS === "android";

/** Satin — `.glass-theme` in globals.css, measured off the reference. */
function satin(): Material {
  const body: RGB = [118, 103, 92];
  const rim = rimSides(["rgba(255,253,247,1)", "rgba(255,241,211,0.64)", "rgba(246,219,175,0.3)", "rgba(255,247,223,0.96)"]);
  const sheen = {
    colors: ["rgba(255,247,230,0.17)", "rgba(255,241,216,0.07)", "rgba(255,238,210,0)", "rgba(46,16,18,0.06)", "rgba(34,10,14,0.14)"],
    locations: [0, 0.24, 0.5, 0.8, 1],
  } as const;
  const lip =
    "inset 0px 1.4px 0px rgba(255,253,243,0.74), inset 0px 11px 13px -12px rgba(255,246,222,0.62), inset 0px -1.4px 0px rgba(255,244,218,0.48)";
  const level = (alpha: number, solid: number, blur: number, shadow: string): SurfaceMaterial => ({
    body: rgba(body, alpha),
    bodySolid: rgba(body, solid),
    blur,
    rim,
    rimWidth: 1.4,
    sheen,
    lip,
    shadow,
    innerRule: null,
  });
  return {
    kind: "glass",
    photo: false,
    view: { brightness: 1, visibility: 1, saturation: 1 },
    blurTint: "dark",
    soft: level(0.5, 0.66, 6, "0px 0px 0px 1px rgba(34,13,13,0.36), 0px 0px 10px 0px rgba(255,224,164,0.16), 0px 12px 24px -14px rgba(24,8,12,0.5)"),
    default: level(
      0.64,
      0.8,
      9,
      "0px 0px 0px 1px rgba(34,13,13,0.48), 0px 0px 20px 0px rgba(255,222,158,0.2), 0px 6px 14px -4px rgba(30,10,12,0.5), 0px 26px 52px -22px rgba(26,8,12,0.6)",
    ),
    strong: level(
      0.76,
      0.9,
      16,
      "0px 0px 0px 1px rgba(34,13,13,0.5), 0px 0px 16px 0px rgba(255,224,164,0.22), 0px 4px 10px -2px rgba(30,10,12,0.56), 0px 28px 56px -22px rgba(26,8,12,0.7)",
    ),
    raised: "rgb(46,20,27)",
    textShadow: null,
  };
}

/** Day — `.bt-glass`: thick greige glass over graphite and plum. */
function day(): Material {
  const rim = rimSides(["rgba(255,246,232,0.62)", "rgba(255,240,222,0.4)", "rgba(255,240,222,0.28)", "rgba(255,236,214,0.3)"]);
  const sheen = { colors: ["rgba(255,248,238,0.14)", "rgba(255,236,214,0.04)", "rgba(255,236,214,0)"], locations: [0, 0.5, 1] } as const;
  const lip = "inset 0px 1px 0px rgba(255,246,232,0.3)";
  const level = (body: string, solid: string, blur: number, shadow: string): SurfaceMaterial => ({
    body,
    bodySolid: solid,
    blur,
    rim,
    rimWidth: 1.5,
    sheen,
    lip,
    shadow,
    innerRule: null,
  });
  return {
    kind: "glass",
    photo: false,
    view: { brightness: 1, visibility: 1, saturation: 1 },
    blurTint: "dark",
    soft: level("rgba(104,92,84,0.62)", "rgba(104,92,84,0.72)", 5, "0px 10px 24px -20px rgba(0,0,0,0.8)"),
    default: level("rgba(102,90,82,0.8)", "rgba(102,90,82,0.88)", 9, "0px 0px 0px 1px rgba(20,10,8,0.3), 0px 14px 30px -22px rgba(0,0,0,0.9)"),
    strong: level("rgba(112,98,88,0.86)", "rgba(112,98,88,0.94)", 16, "0px 0px 0px 1px rgba(20,10,8,0.36), 0px 18px 36px -22px rgba(0,0,0,0.95)"),
    raised: "rgb(58,36,34)",
    textShadow: null,
  };
}

/** Night — the lamp-lit room: warm amber glass, gold structural edges. */
function night(): Material {
  const rim = rimSides(["rgba(255,244,224,0.56)", "rgba(255,236,206,0.36)", "rgba(255,236,206,0.3)", "rgba(255,230,192,0.24)"]);
  const sheen = {
    colors: ["rgba(255,192,120,0.2)", "rgba(246,170,94,0.13)", "rgba(232,152,82,0.09)"],
    locations: [0, 0.46, 1],
  } as const;
  const lip = "inset 0px 1px 0px rgba(255,241,216,0.16)";
  const level = (body: string, solid: string, blur: number, shadow: string): SurfaceMaterial => ({
    body,
    bodySolid: solid,
    blur,
    rim,
    rimWidth: 1.2,
    sheen,
    lip,
    shadow,
    innerRule: null,
  });
  return {
    kind: "glass",
    photo: false,
    view: { brightness: 1, visibility: 1, saturation: 1 },
    blurTint: "dark",
    soft: level("rgba(72,44,18,0.48)", "rgba(62,38,16,0.66)", 5, "0px 10px 24px -20px rgba(0,0,0,0.8)"),
    default: level("rgba(72,44,18,0.62)", "rgba(62,38,16,0.8)", 9, "0px 0px 22px 0px rgba(247,194,100,0.12), 0px 14px 30px -22px rgba(0,0,0,0.9)"),
    strong: level("rgba(86,54,22,0.78)", "rgba(76,48,20,0.9)", 16, "0px 0px 22px 0px rgba(247,194,100,0.24), 0px 14px 30px -22px rgba(0,0,0,0.9)"),
    raised: "rgb(42,26,13)",
    textShadow: null,
  };
}

/**
 * Classic — paper, not glass with the blur off: an ivory card stock with a
 * warm hairline, a soft wine-tinted shadow, and on the important surfaces a
 * second gold rule inside the edge, the way a wedding card is bordered.
 */
function paper(): Material {
  const rim = rimSides(["#eadbc4", "#efe2cf", "#f1e4d4", "#e6d4b8"]);
  const level = (body: string, shadow: string, innerRule: string | null): SurfaceMaterial => ({
    body,
    bodySolid: body,
    blur: 0,
    rim,
    rimWidth: 1,
    sheen: null,
    lip: "inset 0px 1px 0px rgba(255,255,255,0.9)",
    shadow,
    innerRule,
  });
  return {
    kind: "paper",
    photo: false,
    view: { brightness: 1, visibility: 1, saturation: 1 },
    blurTint: "light",
    soft: level("#fbf3e8", "0px 1px 2px rgba(74,17,25,0.04)", null),
    default: level("#fffdf9", "0px 1px 2px rgba(74,17,25,0.05), 0px 12px 30px -14px rgba(74,17,25,0.16)", null),
    strong: level("#ffffff", "0px 1px 2px rgba(74,17,25,0.06), 0px 18px 40px -16px rgba(74,17,25,0.22)", "rgba(201,169,110,0.55)"),
    raised: "#fffdf9",
    textShadow: null,
  };
}

export function drawnMaterial(room: RoomId): Material {
  return room === "paper" ? paper() : room === "ivory" ? day() : room === "gold" ? night() : satin();
}

/* ------------------------------------------------------------------ */
/* the photo room — the admin's glass                                  */
/* ------------------------------------------------------------------ */

/**
 * Android has no live blur here: a smoked body stands in for the frost — as
 * thick as the admin's transparency asks, and thicker as the blur rises
 * (hiding what is behind the pane is what blur does for the type), never
 * thinner than reads. At the shipped glass it lands where it always did.
 */
function smokedAlpha(values: GlassValues, weight: number): number {
  const through = values.transparency / 100;
  const frost = clamp(values.blur / GLASS_CONTROL.blur.max, 0, 1);
  return clamp(0.3 + (1 - through) * 0.45 + frost * 0.3 + weight, 0.25, 0.95);
}

export function photoMaterial(values: GlassValues): Material {
  const body = glassBody(values);
  const reflect = values.reflection / 50;
  const edge = values.edge / 50;
  const rimWidth = edge <= 1 ? 1 : Math.round((1 + (edge - 1) * 0.8) * 100) / 100;
  const white: RGB = [255, 255, 255];
  const rim = rimSides([
    rgba(white, 0.92 * edge),
    rgba(white, 0.4 * edge),
    rgba(white, 0.14 * edge),
    rgba(white, 0.5 * edge),
  ]);
  const sheen =
    reflect > 0
      ? ({
          colors: [rgba(white, 0.16 * reflect), rgba(white, 0.05 * reflect), rgba(white, 0), rgba(white, 0.03 * reflect)],
          locations: [0, 0.26, 0.5, 1],
        } as const)
      : null;
  const lip = `inset 0px 1px 0px ${rgba(white, 0.42 * reflect)}, inset 0px -1px 0px ${rgba(white, 0.07 * reflect)}`;

  // The drop — the web's `--glass-shadow*` recipe with the admin's four numbers.
  const y = values.shadowDepth;
  const b = values.shadowBlur;
  const s = values.shadowSpread;
  const a = values.shadowOpacity / 100;
  const black: RGB = [0, 0, 0];
  const contact = (k: number) => `0px 0px 0px 0.5px ${rgba(black, k * edge)}`;
  const shadowDefault = [
    contact(0.12),
    `0px ${px(y)} ${px(b)} ${px(s)} ${rgba(black, a)}`,
    `0px ${px(y * 2.8)} ${px(b * 2)} ${px(s * 2.5)} ${rgba(black, a * 0.857)}`,
  ].join(", ");
  const shadowSoft = [contact(0.1), `0px ${px(y * 0.6)} ${px(b * 0.5715)} ${px(s * 0.6667)} ${rgba(black, a * 0.857)}`].join(", ");
  const shadowStrong = [
    contact(0.14),
    `0px ${px(y * 1.6)} ${px(b * 1.4286)} ${px(s * 1.1667)} ${rgba(black, a * 1.19)}`,
    `0px ${px(y * 4)} ${px(b * 2.8572)} ${px(s * 3.3334)} ${rgba(black, a)}`,
  ].join(", ");

  // Android's smoked body: neutral smoke, warmed by saturation, tinted by the admin's tint.
  const tint = hexRgb(values.tint);
  const tintMix = values.tintStrength / 100;
  const smoke = mix(mix([22, 12, 14], [38, 16, 20], clamp((values.saturation - 100) / 150, 0, 1)), tint, tintMix * 0.6);

  const level = (alpha: number, weight: number, blur: number, shadow: string): SurfaceMaterial => ({
    body: rgba(body.rgb, alpha),
    bodySolid: rgba(smoke, smokedAlpha(values, weight)),
    blur,
    rim,
    rimWidth,
    sheen,
    lip,
    shadow,
    innerRule: null,
  });

  const saturation = values.saturation / 100;
  const blurTint: BlurTint = saturation >= 1.3 ? "systemThinMaterialDark" : "dark";

  return {
    kind: "glass",
    photo: true,
    view: { brightness: values.brightness / 100, visibility: values.visibility / 100, saturation },
    blurTint,
    soft: level(body.soft, -0.08, values.blur * 0.8334, shadowSoft),
    default: level(body.alpha, 0, values.blur, shadowDefault),
    strong: level(body.strong, 0.12, values.blur * 1.25, shadowStrong),
    // The web's `.bt-shell--deep` on a photo: smoked, never an opaque slab.
    raised: rgba(ANDROID ? [26, 14, 16] : [24, 12, 14], 0.94),
    textShadow: { color: "rgba(0,0,0,0.28)", radius: 2, offsetY: 1 },
  };
}

/* ------------------------------------------------------------------ */
/* what a pane does to the room behind it                              */
/* ------------------------------------------------------------------ */

/**
 * The web's backdrop-filter for a pane, exactly (web preview only). Empty when
 * it would change nothing — no blur and an untouched view.
 */
export function backdropFilter(material: Material, blur: number): string {
  const { brightness, visibility, saturation } = material.view;
  const parts: string[] = [];
  if (blur > 0) parts.push(`blur(${Math.round(blur * 10) / 10}px)`);
  if (saturation !== 1) parts.push(`saturate(${saturation})`);
  if (brightness !== 1) parts.push(`brightness(${brightness})`);
  if (visibility !== 1) parts.push(`contrast(${visibility})`);
  return parts.join(" ");
}

/**
 * The native stand-in for brightness / visibility / (low) saturation: veils
 * laid inside the pane over whatever is behind it, in the web filter's order.
 * Empty for a drawn room (its view is untouched).
 */
export function viewVeils(material: Material): string[] {
  const { brightness, visibility, saturation } = material.view;
  const veils: string[] = [];
  if (saturation < 1) veils.push(`rgba(128,128,128,${r3((1 - saturation) * 0.3)})`);
  if (brightness < 1) veils.push(`rgba(0,0,0,${r3(1 - brightness)})`);
  else if (brightness > 1) veils.push(`rgba(255,255,255,${r3(Math.min(0.35, (brightness - 1) * 0.6))})`);
  if (visibility < 1) veils.push(`rgba(128,128,128,${r3(1 - visibility)})`);
  return veils;
}

/** expo-blur's intensity for a CSS blur radius. */
export function blurIntensity(blurPx: number): number {
  return clamp(Math.round(blurPx * 2.2), 0, 100);
}
