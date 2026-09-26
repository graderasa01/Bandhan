import { useWindowDimensions } from "react-native";
import { layout } from "~/theme";

/**
 * Screen-size facts for layout decisions — never for font sizes (those stay
 * fixed and respect the system text size). Widths are clamped to the content
 * column so a tablet or the web preview gets a phone-shaped layout, not a
 * stretched one.
 */
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const column = Math.min(width, layout.maxContentWidth);
  return {
    width,
    height,
    column,
    /** 320–359pt: small Androids, iPhone SE. */
    compact: width < 360,
    /** Short screens (landscape phones, small SE) — tighten vertical rhythm. */
    short: height < 700,
    largeText: fontScale > 1.2,
    /** Width of one card in a two-up grid inside the column. */
    gridCard: Math.floor((column - layout.gutter * 2 - 12) / 2),
  };
}
