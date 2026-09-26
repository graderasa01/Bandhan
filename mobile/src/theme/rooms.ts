import { drawnMaterial, type BlurTint, type Material } from "./material";
import { palette } from "./palette";

/**
 * The four looks — "rooms" — the web's theme button cycles through
 * (lib/theme/rooms.ts), restated as React Native tokens:
 *
 *   terrace  "Satin"   — champagne satin + wine, clear warm glass (the default)
 *   ivory    "Day"     — graphite and plum, thick glass
 *   gold     "Night"   — lamp-lit, champagne on amber glass
 *   paper    "Classic" — cream paper, wine ink, gold plate; no glass at all
 *
 * Which rooms are on, which is the default, and the photo + glass an admin put
 * behind one come from the server (`/api/mobile/theme`) — the app only
 * consumes them. Every screen reads the semantic names below, never a hex, so
 * one room object repaints the whole app.
 */
export type RoomId = "terrace" | "ivory" | "gold" | "paper";

export const ROOM_IDS: RoomId[] = ["terrace", "ivory", "gold", "paper"];

export const ROOM_LABEL: Record<RoomId, string> = {
  terrace: "Satin",
  ivory: "Day",
  gold: "Night",
  paper: "Classic",
};

export type Gradient = readonly [string, string, ...string[]];

export interface ThemeColors {
  text: string;
  textSecondary: string;
  textMuted: string;
  heading: string;
  gold: string;
  link: string;
  textOnAccent: string;
  /** Text over a photo — always light, whatever the room (a stranger's photo is never ours to predict). */
  onPhoto: string;
  onPhotoMuted: string;

  background: string;
  glass: string;
  glassSoft: string;
  glassStrong: string;
  /** Opaque — anything that comes up over live content (sheets, menus). */
  sheet: string;
  input: string;
  overlay: string;
  scrim: string;
  tabBar: string;

  rim: string;
  hairline: string;
  divider: string;
  focus: string;

  accent: string;
  accentLit: string;
  accentDeep: string;
  accentFg: string;
  accentSoft: string;

  chip: string;
  chipText: string;
  chipSelected: string;
  chipSelectedText: string;

  success: string;
  successBg: string;
  warn: string;
  warnBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  live: string;
  shadow: string;
}

export interface Theme {
  room: RoomId;
  label: string;
  /** Light type on dark glass (Satin / Day / Night) vs ink on paper (Classic). */
  dark: boolean;
  statusBar: "light" | "dark";
  colors: ThemeColors;
  gradients: {
    accent: Gradient;
    foil: Gradient;
    sheen: Gradient;
    room: Gradient;
    photoFade: Gradient;
  };
  glass: {
    /** iOS / web backdrop blur strength, 0 = no blur view at all. */
    blurIntensity: number;
    blurTint: BlurTint;
    /**
     * Android draws no real blur by default (expo-blur needs a BlurTargetView
     * wrapping the page, which costs frames on a long list). Its panes get a
     * thicker body instead, so text never sits on an unblurred background.
     */
    android: { glass: string; glassSoft: string; glassStrong: string };
  };
  /** True when the room is showing an admin's photo (clear glass over it). */
  photo: boolean;
  /**
   * What every pane is made of, at its three weights — see ./material.ts.
   * The `colors.glass*` and `glass.*` tokens above are derived from it by the
   * resolver (./glass.ts), so there is one source for both.
   */
  material: Material;
}

const common = {
  onPhoto: "#fffdf8",
  onPhotoMuted: "rgba(255,253,248,0.78)",
  scrim: "rgba(20,6,10,0.55)",
  live: palette.live,
};

const satin: Theme = {
  room: "terrace",
  material: drawnMaterial("terrace"),
  label: ROOM_LABEL.terrace,
  dark: true,
  statusBar: "light",
  photo: false,
  colors: {
    ...common,
    text: "#fffdf8",
    textSecondary: "#e7dfd5",
    textMuted: "#c5b7aa",
    heading: "#fffdf8",
    gold: palette.goldBright,
    link: palette.goldBright,
    textOnAccent: palette.accentFg,
    background: palette.roomGround,
    glass: "rgba(118,103,92,0.64)",
    glassSoft: "rgba(118,103,92,0.5)",
    glassStrong: "rgba(118,103,92,0.8)",
    sheet: "#2e141b",
    input: "rgba(46,20,27,0.55)",
    overlay: "rgba(20,6,10,0.62)",
    tabBar: "rgba(46,20,27,0.9)",
    rim: "rgba(255,241,211,0.46)",
    hairline: "rgba(255,241,211,0.2)",
    divider: "rgba(255,244,218,0.14)",
    focus: "rgba(244,164,164,0.6)",
    accent: palette.accent,
    accentLit: palette.accentLit,
    accentDeep: palette.accentDeep,
    accentFg: palette.accentFg,
    accentSoft: "rgba(140,34,51,0.38)",
    chip: "rgba(118,103,92,0.5)",
    chipText: "#fffdf8",
    chipSelected: "#8c2c38",
    chipSelectedText: palette.accentFg,
    success: palette.live,
    successBg: "rgba(55,219,150,0.16)",
    warn: palette.warnSoft,
    warnBg: "rgba(240,196,115,0.16)",
    danger: palette.dangerSoft,
    dangerBg: "rgba(240,134,127,0.16)",
    info: palette.infoSoft,
    infoBg: "rgba(156,184,248,0.16)",
    shadow: "#14060a",
  },
  gradients: {
    accent: [palette.accentLit, palette.accent, palette.accentDeep],
    foil: [palette.foilLight, palette.foil, palette.foilDark],
    sheen: ["rgba(255,247,230,0.16)", "rgba(255,241,216,0.05)", "rgba(255,238,210,0)", "rgba(34,10,14,0.12)"],
    room: [palette.roomWine, palette.roomGround, palette.roomWineDeep],
    photoFade: ["rgba(20,6,10,0)", "rgba(20,6,10,0.35)", "rgba(20,6,10,0.9)"],
  },
  glass: {
    blurIntensity: 28,
    blurTint: "dark",
    android: { glass: "rgba(118,103,92,0.8)", glassSoft: "rgba(118,103,92,0.66)", glassStrong: "rgba(118,103,92,0.9)" },
  },
};

const day: Theme = {
  room: "ivory",
  material: drawnMaterial("ivory"),
  label: ROOM_LABEL.ivory,
  dark: true,
  statusBar: "light",
  photo: false,
  colors: {
    ...satin.colors,
    text: "#fdf8f2",
    textSecondary: "#ebe0d8",
    textMuted: "#cbbdb2",
    heading: "#fdf8f2",
    gold: "#e7c489",
    link: "#e7c489",
    background: "#241716",
    glass: "rgba(102,90,82,0.8)",
    glassSoft: "rgba(104,92,84,0.62)",
    glassStrong: "rgba(112,98,88,0.88)",
    sheet: "#3a2422",
    input: "rgba(40,26,24,0.6)",
    tabBar: "rgba(58,36,34,0.92)",
    rim: "rgba(255,240,222,0.4)",
    hairline: "rgba(255,240,222,0.22)",
    divider: "rgba(255,240,222,0.14)",
    accent: "#8e1a34",
    accentLit: "#b93f5c",
    accentDeep: "#5a0f22",
    accentFg: "#fff6f8",
    accentSoft: "rgba(142,26,52,0.4)",
    chip: "rgba(104,92,84,0.62)",
    chipSelected: "#8e1a34",
    chipSelectedText: "#fff6f8",
    success: "#49c58c",
    successBg: "rgba(73,197,140,0.14)",
    warn: "#e0b86a",
    danger: "#f0867f",
    info: "#9cb8f8",
  },
  gradients: {
    ...satin.gradients,
    accent: ["#b93f5c", "#8e1a34", "#5a0f22"],
    room: ["#4e2a22", "#33201c", "#15100f"],
  },
  glass: {
    blurIntensity: 24,
    blurTint: "dark",
    android: { glass: "rgba(102,90,82,0.88)", glassSoft: "rgba(104,92,84,0.72)", glassStrong: "rgba(112,98,88,0.94)" },
  },
};

const night: Theme = {
  room: "gold",
  material: drawnMaterial("gold"),
  label: ROOM_LABEL.gold,
  dark: true,
  statusBar: "light",
  photo: false,
  colors: {
    ...satin.colors,
    text: "#fdf7ec",
    textSecondary: "rgba(253,247,236,0.8)",
    textMuted: "rgba(253,247,236,0.6)",
    heading: "#fdf7ec",
    gold: "#eec179",
    link: "#f0c884",
    textOnAccent: "#33200f",
    background: "#1d1107",
    glass: "rgba(72,44,18,0.62)",
    glassSoft: "rgba(72,44,18,0.48)",
    glassStrong: "rgba(86,54,22,0.78)",
    sheet: "#2a1a0d",
    input: "rgba(26,15,6,0.55)",
    tabBar: "rgba(42,26,13,0.92)",
    rim: "rgba(255,226,178,0.36)",
    hairline: "rgba(255,236,206,0.18)",
    divider: "rgba(255,236,206,0.12)",
    focus: "rgba(238,193,121,0.6)",
    // Night's filled action is champagne with dark type, as on the web.
    accent: "#eec179",
    accentLit: "#ffe6b0",
    accentDeep: "#c08e38",
    accentFg: "#33200f",
    accentSoft: "rgba(238,193,121,0.22)",
    chip: "rgba(72,44,18,0.5)",
    chipText: "#fdf7ec",
    chipSelected: "#eec179",
    chipSelectedText: "#33200f",
    success: "#35c98a",
    successBg: "rgba(35,150,105,0.22)",
    warn: "#e9bd6a",
    warnBg: "rgba(190,140,50,0.2)",
    danger: "#f08a78",
    dangerBg: "rgba(160,60,45,0.24)",
    info: "#9cc0f8",
    infoBg: "rgba(60,90,160,0.22)",
    shadow: "#000000",
  },
  gradients: {
    ...satin.gradients,
    accent: ["#ffe6b0", "#eec179", "#c08e38"],
    room: ["#4a2b12", "#2a1a0d", "#1d1107"],
  },
  glass: {
    blurIntensity: 22,
    blurTint: "dark",
    android: { glass: "rgba(62,38,16,0.8)", glassSoft: "rgba(62,38,16,0.66)", glassStrong: "rgba(76,48,20,0.9)" },
  },
};

const classic: Theme = {
  room: "paper",
  material: drawnMaterial("paper"),
  label: ROOM_LABEL.paper,
  dark: false,
  statusBar: "dark",
  photo: false,
  colors: {
    ...common,
    text: palette.ink,
    textSecondary: palette.inkMuted,
    textMuted: palette.inkSubtle,
    heading: palette.wine700,
    gold: palette.gold700,
    link: palette.wine500,
    textOnAccent: palette.gold900,
    background: palette.paperIvory,
    glass: palette.paper,
    glassSoft: "#fbf3e8",
    glassStrong: palette.white,
    sheet: palette.paper,
    input: palette.white,
    overlay: "rgba(30,6,9,0.45)",
    tabBar: "rgba(255,253,249,0.97)",
    rim: palette.paperHairline,
    hairline: palette.paperHairline,
    divider: "#efe3d3",
    focus: "rgba(122,31,43,0.35)",
    // On paper the filled action is a gold plate; wine is ink and outline.
    accent: palette.gold500,
    accentLit: "#dcc08b",
    accentDeep: palette.gold600,
    accentFg: palette.gold900,
    accentSoft: "rgba(201,169,110,0.2)",
    chip: "#fbf3e8",
    chipText: palette.wine700,
    chipSelected: palette.wine700,
    chipSelectedText: palette.accentFg,
    success: palette.trust,
    successBg: "rgba(31,122,90,0.1)",
    warn: palette.warn,
    warnBg: "rgba(154,101,18,0.1)",
    danger: palette.danger,
    dangerBg: "rgba(169,42,28,0.08)",
    info: palette.info,
    infoBg: "rgba(36,86,201,0.08)",
    shadow: palette.wine700,
  },
  gradients: {
    accent: ["#dcc08b", palette.gold500, palette.gold600],
    foil: [palette.foilLight, palette.foil, palette.foilDark],
    sheen: ["rgba(255,255,255,0)", "rgba(255,255,255,0)"],
    room: ["#fffdf9", "#fbf6ee", "#f6ecde"],
    photoFade: ["rgba(20,6,10,0)", "rgba(20,6,10,0.35)", "rgba(20,6,10,0.9)"],
  },
  glass: {
    blurIntensity: 0,
    blurTint: "light",
    android: { glass: palette.paper, glassSoft: "#fbf3e8", glassStrong: palette.white },
  },
};

export const ROOMS: Record<RoomId, Theme> = {
  terrace: satin,
  ivory: day,
  gold: night,
  paper: classic,
};

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === "string" && (ROOM_IDS as string[]).includes(value);
}
