import type { ThemeColors } from "~/theme";
import type { KundliTone } from "~/types/api";

/**
 * A kundli tone in the room's own status colours. A low total is `caution`,
 * never `danger` — information a family weighs, not a verdict the app hands
 * down (the web's GunaMilanCard rule).
 */
export function kundliToneColors(c: ThemeColors, tone: KundliTone): { fg: string; bg: string } {
  if (tone === "ok") return { fg: c.success, bg: c.successBg };
  if (tone === "info") return { fg: c.info, bg: c.infoBg };
  return { fg: c.warn, bg: c.warnBg };
}

/** The classical bands, as `KundliMilanList` colours a row it only has the band name for. */
export function bandTone(band: string | null): KundliTone {
  if (band === "Uttam" || band === "Shubh") return "ok";
  if (band === "Madhyam") return "info";
  return "caution";
}
