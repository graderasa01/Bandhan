/**
 * The raw BandhanTak colours, as the web measured them (app/globals.css —
 * the Kundan wine/gold scales, "THE GLASS MATERIAL SYSTEM" and the room
 * blocks). Nothing in a screen reads these directly: screens read the
 * semantic tokens in `rooms.ts`, so a room can repaint the whole app.
 */
export const palette = {
  // Wine — the seal, the ink, the one interactive colour.
  wine50: "#fbeef0",
  wine100: "#f5d8dc",
  wine200: "#e6a9b2",
  wine300: "#cf6e7d",
  wine400: "#a63a4c",
  wine500: "#7a1f2b",
  wine600: "#63161f",
  wine700: "#4a1119",
  wine800: "#330b11",
  wine900: "#1e0609",

  // The chosen chip / primary action, measured off the satin reference.
  accent: "#8c2233",
  accentLit: "#a92f44",
  accentDeep: "#450b1c",
  accentFg: "#fff5f2",

  // Gold — rationed: a label, a rim, a hairline. Never body text.
  gold50: "#fff9ed",
  gold100: "#fff6e7",
  gold200: "#fff0cb",
  gold300: "#ebd3a0",
  gold400: "#ddac51",
  gold500: "#c9a96e",
  gold600: "#a88848",
  gold700: "#806634",
  gold800: "#574424",
  gold900: "#2e2413",
  goldBright: "#ffe487",
  goldDeep: "#f0c370",
  goldPale: "#fff1c6",
  foilLight: "#e8cf7a",
  foil: "#d4af37",
  foilDark: "#94751f",

  // The satin room, in the order the eye meets it.
  roomCream: "#fdeed2",
  roomChampagne: "#f0d2ab",
  roomBronze: "#a87a5f",
  roomWine: "#5c1420",
  roomWineDeep: "#2a0710",
  roomGround: "#2a161a",

  // Paper (Classic).
  paper: "#fffdf9",
  paperIvory: "#fbf6ee",
  paperHairline: "#f1e4d4",
  ink: "#1a1512",
  inkMuted: "#6b5d52",
  inkSubtle: "#9a8b7d",

  // Signals.
  live: "#37db96",
  trust: "#1f7a5a",
  danger: "#a92a1c",
  dangerSoft: "#f0867f",
  warn: "#9a6512",
  warnSoft: "#f0c473",
  info: "#2456c9",
  infoSoft: "#9cb8f8",

  white: "#ffffff",
  black: "#000000",
} as const;
