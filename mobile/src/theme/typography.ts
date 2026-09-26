import type { TextStyle } from "react-native";

/**
 * Inter for reading, Playfair Display for the few words that should feel
 * like an invitation card — the same pairing the web loads in app/layout.tsx.
 * Keys are the `@expo-google-fonts` export names registered in `useAppFonts`.
 */
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  display: "PlayfairDisplay_600SemiBold",
  displayBold: "PlayfairDisplay_700Bold",
} as const;

type Variant =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "title"
  | "body"
  | "bodyStrong"
  | "small"
  | "smallStrong"
  | "caption"
  | "label"
  | "button"
  | "buttonSmall";

/**
 * One type scale for the whole app. Sizes are for a 360–430pt wide phone and
 * are never scaled with the screen — system font size (accessibility) still
 * applies, capped per component with `maxFontSizeMultiplier` where a layout
 * would break.
 */
export const typeScale: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 40 },
  h1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 33 },
  h2: { fontFamily: fonts.display, fontSize: 21, lineHeight: 28 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  title: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18.5 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18.5 },
  caption: { fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15 },
  // The web's `gold-label`: an uppercase micro-heading.
  label: { fontFamily: fonts.semibold, fontSize: 10.5, lineHeight: 14, letterSpacing: 1.4, textTransform: "uppercase" },
  button: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 20 },
  buttonSmall: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
};

export type TypeVariant = Variant;
