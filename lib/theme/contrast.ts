/**
 * WCAG 2.1 relative-luminance + contrast ratio — the same maths D-21
 * documents by hand in app/globals.css's header comment. Pure and
 * client-safe (no server-only imports) so the admin custom-colour picker
 * can show a live pass/fail badge as someone types a hex value, before
 * anything is saved.
 */

function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

/** WCAG contrast ratio, 1:1 (no contrast) to 21:1 (black on white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

export type ContrastVerdict = "body" | "large" | "fail";

/** D-21's own thresholds: 4.5:1 clears body text, 3:1 clears large text/fills/borders only. */
export function contrastVerdict(ratio: number): ContrastVerdict {
  if (ratio >= 4.5) return "body";
  if (ratio >= 3) return "large";
  return "fail";
}

export const CONTRAST_VERDICT_LABEL: Record<ContrastVerdict, string> = {
  body: "Body text ke liye theek",
  large: "Sirf bade text/fill ke liye",
  fail: "Bahut halka — text ke liye mat use karein",
};

/**
 * Whichever of pure black/white reads better on a given fill — used to
 * auto-derive a custom colour's foreground (the text/icon colour drawn ON
 * TOP of an admin-chosen fill) so a free colour pick can never ship
 * illegible button text, regardless of which hex was chosen.
 */
export function pickForeground(fillHex: string): "#000000" | "#ffffff" {
  return contrastRatio(fillHex, "#ffffff") >= contrastRatio(fillHex, "#000000") ? "#ffffff" : "#000000";
}
