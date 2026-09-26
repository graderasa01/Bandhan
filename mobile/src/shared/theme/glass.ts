// GENERATED from lib/theme/glass.ts by mobile/scripts/sync-catalog.ts — do not edit.
// The web file is the one source of truth: change it there, then run
// `npm run sync-catalog` in mobile/. `npm run check-catalog` fails on drift.

import { contrastRatio, isValidHex } from "./contrast";

/**
 * THE GLASS CONTROL — the numbers behind the clear glass a photo room wears,
 * and who decides them.
 *
 * A room with a photo (/admin/theme) re-cuts the app's glass as clear glass
 * (globals.css, "THE PHOTO ROOM"). That material has knobs — how much body it
 * has, how far it blurs, how dark it takes the photo behind it, how much it
 * shines — and every knob reaches the page as a `--room-glass-*` custom
 * property on <html>. This module owns those numbers:
 *
 *   GlassValues     every knob, in the units the admin's sliders show
 *   GLASS_CONTROLS  the knobs as data — label, range, unit, named bands. The
 *                   admin screen, the API's validation and `normalizeGlass`
 *                   all read this one list, so a new knob is one entry here
 *                   and one line of the CSS recipe.
 *   resolveGlass    the one place a mode is decided:
 *                     manual → the admin's values, exactly as set
 *                     auto   → the glass as it shipped, with its darkness
 *                              worked out from the photo (`autoBrightness`)
 *   glassVars       GlassValues → the custom properties the CSS reads
 *
 * Both modes end in the same `GlassValues` and go through the same
 * `glassVars`, so there is one recipe in the stylesheet and nothing in it
 * knows which mode produced its numbers.
 *
 * Pure and client-safe: the root layout, the admin preview and the upload
 * service run the same functions, so the preview is what a member gets.
 */

/** The two screens an admin tunes apart. Desktop is the app's own desktop layout — see `DESKTOP_MIN_WIDTH` in lib/theme/rooms.ts. */
export const GLASS_DEVICES = ["mobile", "desktop"] as const;
export type GlassDevice = (typeof GLASS_DEVICES)[number];

export const GLASS_DEVICE_LABEL: Record<GlassDevice, string> = { mobile: "Mobile", desktop: "Desktop" };

export function otherDevice(device: GlassDevice): GlassDevice {
  return device === "mobile" ? "desktop" : "mobile";
}

export const GLASS_MODES = ["auto", "manual"] as const;
export type GlassMode = (typeof GLASS_MODES)[number];

export type GlassValues = {
  /** % — how much of the photo the glass body lets through. 0 = a solid white slab. */
  transparency: number;
  /** px — backdrop blur. */
  blur: number;
  /** % — `brightness()` on what is seen through the glass. 100 = untouched. */
  brightness: number;
  /** % — `saturate()` on what is seen through the glass. */
  saturation: number;
  /** % — `contrast()` on what is seen through the glass: 100 = every detail, lower = a frosted haze. */
  visibility: number;
  /** #rrggbb — the colour laid over the glass. */
  tint: string;
  /** % — how strongly `tint` is laid over it. */
  tintStrength: number;
  /** % — the sheen across the face and the lit top edge. 50 = as shipped. */
  reflection: number;
  /** % — the rim and every hairline edge. 50 = as shipped. */
  edge: number;
  /** % — the drop shadow's darkness. */
  shadowOpacity: number;
  /** px */
  shadowBlur: number;
  /** px — negative pulls the shadow in under the pane. */
  shadowSpread: number;
  /** px — how far below the pane the shadow falls. */
  shadowDepth: number;
};

export type GlassKnob = Exclude<keyof GlassValues, "tint">;

/** A room's glass: whose numbers win, and the admin's numbers per device (null until set). */
export type RoomGlass = {
  mode: GlassMode;
  mobile: GlassValues | null;
  desktop: GlassValues | null;
};

export const DEFAULT_ROOM_GLASS: RoomGlass = { mode: "auto", mobile: null, desktop: null };

/* ------------------------------------------------------------ the knobs */

export type GlassGroup = "body" | "view" | "light" | "shadow";

export const GLASS_GROUPS: readonly { id: GlassGroup; label: string; note: string }[] = [
  { id: "body", label: "Glass Body", note: "Glass khud kitna thos hai aur uspar kaunsa rang" },
  { id: "view", label: "Through the Glass", note: "Glass ke peeche ki photo kaisi dikhe" },
  { id: "light", label: "Highlight & Edge", note: "Chamak aur kinara" },
  { id: "shadow", label: "Shadow", note: "Glass ke neeche ki parchhai" },
];

export type GlassControl = {
  key: GlassKnob;
  group: GlassGroup;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit: "%" | "px";
  /** Named stretches of the range: a value is named by the first band whose `upTo` it does not pass. */
  bands?: readonly (readonly [upTo: number, name: string])[];
};

export const GLASS_CONTROLS: readonly GlassControl[] = [
  {
    key: "transparency",
    group: "body",
    label: "Glass Transparency",
    hint: "0% = lagbhag thos, 100% = sabse zyada aar-paar.",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    bands: [
      [10, "Almost solid"],
      [40, "Soft glass"],
      [70, "Normal glass"],
      [92, "Clear glass"],
      [98, "Very transparent"],
      [100, "Nearly invisible"],
    ],
  },
  {
    key: "tintStrength",
    group: "body",
    label: "Tint Overlay",
    hint: "Glass ke upar chune hue rang ki parat — photo phir bhi dikhti rahe.",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    bands: [
      [0, "None"],
      [12, "Subtle"],
      [30, "Light"],
      [55, "Medium"],
      [100, "Strong"],
    ],
  },
  {
    key: "blur",
    group: "view",
    label: "Blur",
    hint: "0 = peeche sab saaf, zyada = frosted glass.",
    min: 0,
    max: 60,
    step: 1,
    unit: "px",
    bands: [
      [0, "No blur"],
      [4, "Very low"],
      [10, "Low"],
      [20, "Medium"],
      [34, "High"],
      [60, "Strong frosted"],
    ],
  },
  {
    key: "brightness",
    group: "view",
    label: "Brightness",
    hint: "Glass kitna gehra ya roshan dikhe — background ki roshni se apne aap nahi badlega.",
    min: 40,
    max: 160,
    step: 1,
    unit: "%",
    bands: [
      [69, "Dark"],
      [89, "Slightly dark"],
      [110, "Neutral"],
      [130, "Bright"],
      [160, "Very bright"],
    ],
  },
  {
    key: "visibility",
    group: "view",
    label: "Background Visibility",
    hint: "Glass ke through photo kitni saaf dikhe — kam karne par haze, jaise frosted glass.",
    min: 10,
    max: 100,
    step: 1,
    unit: "%",
    bands: [
      [30, "Strong frosted"],
      [55, "Hazy"],
      [80, "Soft"],
      [99, "Clear"],
      [100, "Fully visible"],
    ],
  },
  {
    key: "saturation",
    group: "view",
    label: "Saturation",
    hint: "Glass ke peeche photo ke rang kitne gehre.",
    min: 0,
    max: 250,
    step: 5,
    unit: "%",
    bands: [
      [30, "Grey"],
      [80, "Soft"],
      [120, "Natural"],
      [190, "Rich"],
      [250, "Vivid"],
    ],
  },
  {
    key: "reflection",
    group: "light",
    label: "Highlight / Reflection",
    hint: "Glass ke chehre ki chamak aur upar ka roshan kinara.",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    bands: [
      [0, "Off"],
      [30, "Very subtle"],
      [60, "Premium"],
      [85, "Reflective"],
      [100, "Strong reflective"],
    ],
  },
  {
    key: "edge",
    group: "light",
    label: "Border / Edge",
    hint: "Glass ka kinara — bahut halka se tez tak.",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    bands: [
      [0, "Off"],
      [20, "Very subtle"],
      [40, "Subtle"],
      [60, "Normal"],
      [80, "Strong"],
      [100, "Very strong"],
    ],
  },
  {
    key: "shadowOpacity",
    group: "shadow",
    label: "Shadow Opacity",
    hint: "Parchhai kitni gehri.",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    bands: [
      [0, "None"],
      [20, "Light"],
      [45, "Medium"],
      [70, "Deep"],
      [100, "Very deep"],
    ],
  },
  {
    key: "shadowBlur",
    group: "shadow",
    label: "Shadow Blur",
    hint: "Parchhai kitni narm (phaili hui).",
    min: 0,
    max: 80,
    step: 1,
    unit: "px",
  },
  {
    key: "shadowSpread",
    group: "shadow",
    label: "Shadow Spread",
    hint: "Minus = parchhai glass ke neeche simti hui, plus = chaaron taraf phaili.",
    min: -40,
    max: 24,
    step: 1,
    unit: "px",
  },
  {
    key: "shadowDepth",
    group: "shadow",
    label: "Shadow Depth",
    hint: "Parchhai kitni neeche gire — glass kitna utha hua lage (intensity).",
    min: 0,
    max: 48,
    step: 1,
    unit: "px",
  },
];

export const GLASS_CONTROL: Record<GlassKnob, GlassControl> = Object.fromEntries(
  GLASS_CONTROLS.map((control) => [control.key, control]),
) as Record<GlassKnob, GlassControl>;

/** The colours offered for the tint; any other hex can be picked by hand. */
export const TINT_SWATCHES: readonly { name: string; hex: string }[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Ivory", hex: "#fff3dc" },
  { name: "Champagne", hex: "#e9c89a" },
  { name: "Grey", hex: "#8c8c8c" },
  { name: "Wine", hex: "#4a1119" },
  { name: "Smoke", hex: "#000000" },
];

export function bandOf(control: GlassControl, value: number): string | null {
  if (!control.bands) return null;
  return control.bands.find(([upTo]) => value <= upTo)?.[1] ?? control.bands[control.bands.length - 1][1];
}

export function formatKnob(control: GlassControl, value: number): string {
  return `${value}${control.unit}`;
}

/* ---------------------------------------------------- the shipped glass */

/**
 * The clear glass exactly as it shipped — and the fallbacks written into the
 * CSS recipe are these same numbers, so a page without the room's rule still
 * gets it. Auto mode is this with `brightness` worked out per photo.
 */
export const SHIPPED_GLASS: GlassValues = {
  transparency: 90,
  blur: 24,
  brightness: 80,
  saturation: 170,
  visibility: 100,
  tint: "#ffffff",
  tintStrength: 0,
  reflection: 50,
  edge: 50,
  shadowOpacity: 42,
  shadowBlur: 28,
  shadowSpread: -12,
  shadowDepth: 10,
};

function clampKnob(control: GlassControl, value: number): number {
  const stepped = Math.round(value / control.step) * control.step;
  return Math.min(control.max, Math.max(control.min, stepped));
}

/**
 * Anything that claims to be glass values — a stored JSON column, a request
 * body — as values every knob can take: each number clamped to its range and
 * step, anything missing or broken taken from `fallback`. A knob added later
 * therefore needs no migration: old rows simply get its shipped value.
 */
export function normalizeGlass(input: unknown, fallback: GlassValues = SHIPPED_GLASS): GlassValues {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: GlassValues = { ...fallback };
  for (const control of GLASS_CONTROLS) {
    const value = source[control.key];
    if (typeof value === "number" && Number.isFinite(value)) out[control.key] = clampKnob(control, value);
  }
  if (typeof source.tint === "string" && isValidHex(source.tint)) out.tint = source.tint.toLowerCase();
  return out;
}

export function parseRoomGlass(input: unknown): RoomGlass {
  if (!input || typeof input !== "object") return DEFAULT_ROOM_GLASS;
  const source = input as Record<string, unknown>;
  return {
    mode: source.mode === "manual" ? "manual" : "auto",
    mobile: source.mobile ? normalizeGlass(source.mobile) : null,
    desktop: source.desktop ? normalizeGlass(source.desktop) : null,
  };
}

export function sameGlass(a: GlassValues, b: GlassValues): boolean {
  return a.tint === b.tint && GLASS_CONTROLS.every((control) => a[control.key] === b[control.key]);
}

/* ------------------------------------------------- values → the pane */

/* How the pane's other weights relate to the card's own alpha: a chip is a
   little lighter, a control and the heading-carrying cards a little heavier,
   a hover heavier still, the page slab almost nothing. Written as exponents on
   what the glass lets through, so every weight reaches 0 together at 100%
   transparency and 1 together at 0% — and at the shipped 90% they land
   exactly on the measured ladder (0.08 / 0.1 / 0.13 / 0.17 / 0.03). */
const LADDER = { soft: 0.7914, strong: 1.3218, hover: 1.7685, slab: 0.2891 } as const;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

export type GlassBody = {
  /** One colour for every weight — what `--glass-body` carries. */
  rgb: [number, number, number];
  alpha: number;
  soft: number;
  strong: number;
  hover: number;
  slab: number;
};

/**
 * The pane's body: the glass's own white (as much as `transparency` leaves),
 * with the tint laid over it (`tintStrength`). Two layers flattened into one
 * colour and one alpha per weight, because that is what every consumer
 * already reads — `.glass-surface`, `bg-surface`, `.bt-card`, the bottom bar —
 * so the tint reaches all of them rather than only the ones that paint a
 * background image. Rounded to what the stylesheet receives, so the contrast
 * sums below are made on the pane the browser actually draws.
 */
export function glassBody(values: GlassValues): GlassBody {
  const through = values.transparency / 100;
  const tint = values.tintStrength / 100;
  const frost = (k: number) => 1 - Math.pow(through, k);
  const over = (alpha: number) => r3(alpha + tint * (1 - alpha));
  const white = 1 - through;
  const alpha = over(white);
  const tintRgb = hexToRgb(values.tint);
  const rgb =
    alpha > 0
      ? (tintRgb.map((c) => Math.round((255 * white * (1 - tint) + c * tint) / alpha)) as [number, number, number])
      : ([255, 255, 255] as [number, number, number]);
  return {
    rgb,
    alpha,
    soft: over(frost(LADDER.soft)),
    strong: over(frost(LADDER.strong)),
    hover: over(frost(LADDER.hover)),
    slab: over(frost(LADDER.slab)),
  };
}

/** A strong edge is a slightly wider one too; below the shipped strength only its light changes. */
function rimWidth(edge: number): number {
  return edge <= 50 ? 1 : Math.round((1 + ((edge - 50) / 50) * 0.8) * 100) / 100;
}

export type GlassVar = `--room-glass-${string}`;

/**
 * GlassValues → the custom properties "THE PHOTO ROOM" in globals.css reads.
 * Knobs, not finished paint: the recipe (the gradient stops, the ratio
 * between a card's shadow and a chip's) stays in the stylesheet with the
 * rest of the material, and scales from these.
 */
export function glassVars(values: GlassValues): Record<GlassVar, string> {
  const body = glassBody(values);
  return {
    "--room-glass-body": body.rgb.join(" "),
    "--room-glass-alpha": String(body.alpha),
    "--room-glass-alpha-soft": String(body.soft),
    "--room-glass-alpha-strong": String(body.strong),
    "--room-glass-alpha-hover": String(body.hover),
    "--room-glass-alpha-slab": String(body.slab),
    "--room-glass-blur": `${values.blur}px`,
    "--room-glass-saturate": String(r3(values.saturation / 100)),
    "--room-glass-brightness": String(r3(values.brightness / 100)),
    "--room-glass-contrast": String(r3(values.visibility / 100)),
    "--room-glass-reflect": String(r3(values.reflection / 50)),
    "--room-glass-edge": String(r3(values.edge / 50)),
    "--room-glass-rim-width": `${rimWidth(values.edge)}px`,
    "--room-glass-shadow-alpha": String(r3(values.shadowOpacity / 100)),
    "--room-glass-shadow-blur": `${values.shadowBlur}px`,
    "--room-glass-shadow-spread": `${values.shadowSpread}px`,
    "--room-glass-shadow-y": `${values.shadowDepth}px`,
  };
}

/* ---------------------------------------------- reading on the glass */

/** Body text's bar — the same 4.5:1 D-21 holds every other colour to. */
export const READABLE = 4.5;

/** Rec.601 luma of a photo: its mean, and the brightest patch a pane can stand over. */
export type PhotoLuma = { lumaMean: number; lumaBright: number };

/** The photo room's scrim — the satin room's deepest wine. Same value as `.photo-room__scrim`; change one, change both. */
const SCRIM = [20, 10, 12] as const;
/** `--text-secondary` on the clear glass: white at 88%. `--text-primary` is white. */
const TEXT_SECONDARY_ALPHA = 0.88;

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The pane over a patch of photo of this luma, as the browser composes it:
 * the scrim takes `dim` of the photo, the backdrop filter brightens or darkens
 * it and pulls its contrast in, and the body lies on top at the heavier card
 * weight — the one body text actually sits on, so the sums are never kinder
 * than the page. The photo is treated as a grey of its own luma: luma is what
 * decides whether white type on it reads, which is also why saturation is
 * left out.
 */
function paneOver(luma: number, dim: number, values: GlassValues, body: GlassBody): number[] {
  const brightness = values.brightness / 100;
  const contrast = values.visibility / 100;
  return SCRIM.map((scrim, i) => {
    const behind = luma * (1 - dim) + scrim * dim;
    const lit = Math.min(255, behind * brightness);
    const seen = Math.min(255, Math.max(0, (lit - 127.5) * contrast + 127.5));
    return seen * (1 - body.strong) + body.rgb[i] * body.strong;
  });
}

function typeOn(pane: number[]) {
  const secondary = pane.map((c) => 255 * TEXT_SECONDARY_ALPHA + c * (1 - TEXT_SECONDARY_ALPHA));
  return {
    primary: contrastRatio("#ffffff", toHex(pane)),
    secondary: contrastRatio(toHex(secondary), toHex(pane)),
  };
}

const lumaOf = (rgb: number[]) => 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];

/**
 * What the glass's type measures over a photo, whoever set the glass:
 *
 *   average  body text (`--text-secondary`) over the photo's mean — most of a
 *            screen is paragraphs standing over the photo's ordinary tone.
 *   bright   headings (`--text-primary`) over the brightest patch a pane can
 *            stand on (`lumaBright`) — the sky, a haze band, a white dress.
 *
 * In manual mode this is advice, never a veto: the admin sees it and decides.
 */
export function glassReadability(photo: PhotoLuma, dim: number, values: GlassValues): { average: number; bright: number } {
  const body = glassBody(values);
  return {
    average: typeOn(paneOver(photo.lumaMean, dim, values, body)).secondary,
    bright: typeOn(paneOver(photo.lumaBright, dim, values, body)).primary,
  };
}

/* ------------------------------------------------------------- auto */

/** How far a photo may be dimmed. Past this it has stopped being a photo. */
export const DIM_MAX = 0.85;

/* Auto's own rules, as the photo room shipped them.

   GLASS_MIN    the darkest auto takes the glass (`brightness()` behind the
                pane). Below this a pane stops reading as glass and reads as
                smoke.
   GLASS_LOOK   how light a pane over the photo's ordinary tone may sit
                (Rec.601 luma). Keeps every photo's glass the same material
                rather than bright on one photo and murky on the next.
   GLASS_CLEAR  what `recommendDim` aims for: the photo dimmed just enough that
                the glass can stay at least this clear. */
const GLASS_MIN = 0.5;
const GLASS_LOOK = 96;
const GLASS_CLEAR = 0.62;

/**
 * Auto's one decision: how dark the glass takes what is behind it over this
 * photo at this dim, as clear as it can be while type on it still reads. A
 * dark photo gets clear glass (1); a bright sky gets a pane that takes the
 * light out of what is behind it. Everything else about auto's glass is
 * `SHIPPED_GLASS`.
 */
export function autoBrightness(photo: PhotoLuma, dim: number): number {
  for (let step = 100; step >= GLASS_MIN * 100; step--) {
    const values = { ...SHIPPED_GLASS, brightness: step };
    const body = glassBody(values);
    const ordinary = paneOver(photo.lumaMean, dim, values, body);
    const bright = paneOver(photo.lumaBright, dim, values, body);
    if (
      lumaOf(ordinary) <= GLASS_LOOK &&
      typeOn(ordinary).secondary >= READABLE &&
      typeOn(bright).primary >= READABLE
    ) {
      return step / 100;
    }
  }
  return GLASS_MIN;
}

/** The glass auto gives a photo — or, with no photo to measure, the glass as shipped. */
export function autoGlass(photo: PhotoLuma | null, dim: number): GlassValues {
  return photo ? { ...SHIPPED_GLASS, brightness: Math.round(autoBrightness(photo, dim) * 100) } : SHIPPED_GLASS;
}

/**
 * The least dim at which auto's glass can stay clear (`GLASS_CLEAR`) and type
 * on it still clears 4.5:1, in steps of 0.01. A dark photo needs none; a
 * bright one is taken back exactly as far as it has to be. Capped at
 * `DIM_MAX`: a photo that fails even there is a photo to replace, and the
 * admin screen says so rather than burying it under a black veil.
 */
export function recommendDim(photo: PhotoLuma): number {
  const steps = Math.round(DIM_MAX * 100);
  for (let step = 0; step <= steps; step++) {
    const dim = step / 100;
    const glass = autoGlass(photo, dim);
    const { average, bright } = glassReadability(photo, dim, glass);
    if (glass.brightness / 100 >= GLASS_CLEAR && average >= READABLE && bright >= READABLE) return dim;
  }
  return DIM_MAX;
}

/**
 * Final glass = the admin's values, or auto. The only branch on mode in the
 * product: in manual mode the admin's numbers go to the page untouched —
 * nothing about the photo moves them. A device with no manual numbers yet
 * (only possible from a hand-edited row) stays on auto rather than inventing
 * some.
 */
export function resolveGlass(glass: RoomGlass, device: GlassDevice, photo: PhotoLuma | null, dim: number): GlassValues {
  const manual = glass.mode === "manual" ? glass[device] : null;
  return manual ?? autoGlass(photo, dim);
}

/* ---------------------------------------------------------- presets */

export type GlassPreset = {
  id: string;
  name: string;
  values: GlassValues;
  /** One of the four the product ships with. Can be edited, and restored; never deleted. */
  builtIn: boolean;
  /** A built-in whose values an admin has changed. */
  edited: boolean;
  /** What Reset goes back to. Exactly one preset is the default. */
  isDefault: boolean;
};

/**
 * The four presets the product starts with. Starting points, not rules: an
 * admin can overwrite any of them from the sliders (the stored copy wins),
 * restore it, save new ones and pick which one Reset goes back to.
 *
 * "Default" is the shipped glass held at the darkness auto settles on for a
 * photo at its recommended dim (`GLASS_CLEAR`) — manual has no photo to ask,
 * so it gets the number auto most often lands on rather than the CSS's
 * generic fallback. Each preset was checked against the photos rooms have
 * carried so far at their recommended dim (scripts/theme-glass-check.ts):
 * body text and headings clear 4.5:1 on all of them.
 */
export const BUILTIN_GLASS_PRESETS: readonly { id: string; name: string; values: GlassValues }[] = [
  { id: "default", name: "Default", values: { ...SHIPPED_GLASS, brightness: Math.round(GLASS_CLEAR * 100) } },
  {
    id: "soft",
    name: "Soft Glass",
    values: {
      transparency: 82,
      blur: 32,
      brightness: 64,
      saturation: 140,
      visibility: 86,
      tint: "#1a0c10",
      tintStrength: 14,
      reflection: 42,
      edge: 40,
      shadowOpacity: 34,
      shadowBlur: 32,
      shadowSpread: -12,
      shadowDepth: 10,
    },
  },
  {
    id: "clear",
    name: "Clear Glass",
    values: {
      transparency: 97,
      blur: 10,
      brightness: 70,
      saturation: 130,
      visibility: 100,
      tint: "#ffffff",
      tintStrength: 0,
      reflection: 62,
      edge: 62,
      shadowOpacity: 30,
      shadowBlur: 24,
      shadowSpread: -10,
      shadowDepth: 8,
    },
  },
  {
    id: "strong",
    name: "Strong Glass",
    values: {
      transparency: 90,
      blur: 44,
      brightness: 80,
      saturation: 160,
      visibility: 72,
      tint: "#120a0c",
      tintStrength: 30,
      reflection: 74,
      edge: 74,
      shadowOpacity: 56,
      shadowBlur: 40,
      shadowSpread: -14,
      shadowDepth: 16,
    },
  },
];

export const DEFAULT_PRESET_ID = "default";

export const BUILTIN_PRESET_IDS: ReadonlySet<string> = new Set(BUILTIN_GLASS_PRESETS.map((preset) => preset.id));

/** The preset these values are exactly, if any — otherwise the screen calls them "Custom". */
export function matchPreset(values: GlassValues, presets: readonly GlassPreset[]): GlassPreset | null {
  return presets.find((preset) => sameGlass(preset.values, values)) ?? null;
}
