import { useMemo } from "react";
import type { Theme } from "./rooms";
import { useTheme } from "./ThemeProvider";

/**
 * The controls that stand on somebody's photograph — the reel's side rail,
 * its Skip bar, the lens pills, the dots, a banner over the top of a card.
 *
 * A stranger's photo is never ours to predict, so two things never change
 * with the room: the body is always smoke and the type always light — that is
 * what keeps a white label readable over a white wall. Everything else is the
 * room's and the admin's:
 *
 *   rim        the material's own lit edge, thinned for a small control —
 *              so the admin's Edge knob (and each room's rim colour) shows
 *   smoke      in a photo room, as thick as the admin's glass makes Android's
 *              smoked pane (transparency and blur, `bodySolid`), clamped to
 *              the range where light type still reads; the drawn rooms keep
 *              the measured reel values
 *   chosen     a saved / active control wears the room's accent and gold
 *
 * One function, read by every photo control, so a room or an admin change
 * repaints all of them at once and none picks its own rgba.
 */
export interface PhotoChrome {
  /** Round controls, pills. */
  body: string;
  /** Text-bearing bars (Skip, banners) — a little thicker. */
  bodyStrong: string;
  rim: string;
  rimWidth: number;
  /** A chosen control (Saved): the room's accent… */
  activeBody: string;
  /** …with the room's gold. */
  activeRim: string;
  /** The chosen lens: an ivory plate with ink on it. */
  selectedBody: string;
  selectedText: string;
  text: string;
  textMuted: string;
  /** Photo dots: the current one and the rest. */
  dot: string;
  dotDim: string;
  /** Warm highlight on a photo (a reason line's spark, the "add your photo" banner). */
  highlight: string;
  highlightRim: string;
}

const SMOKE = "18,8,11";

function alphaOf(color: string): number {
  const m = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i.exec(color);
  return m ? Number(m[1]) : 1;
}

/** `color` at `alpha` — for `#rrggbb`, `rgb()` and `rgba()`; anything else is returned as it is. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const rgb = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color);
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${a})`;
  return color;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function photoChrome(t: Theme): PhotoChrome {
  const m = t.material;
  const smoke = m.photo ? clamp(alphaOf(m.soft.bodySolid), 0.36, 0.62) : 0.45;
  const rimTop = m.soft.rim.top;
  const highlight = t.dark ? t.colors.gold : "#ffe487";
  const rimAlpha = m.kind === "paper" ? 0.5 : clamp(alphaOf(rimTop) * 0.32, 0.12, 0.42);
  return {
    body: `rgba(${SMOKE},${smoke})`,
    bodyStrong: `rgba(${SMOKE},${clamp(smoke + 0.1, 0.46, 0.72)})`,
    rim: withAlpha(rimTop, rimAlpha),
    // The material's own rim weight (the admin's Edge knob in a photo room), eased for a small control.
    rimWidth: Math.round(clamp(m.soft.rimWidth * 0.8, 1, 1.6) * 100) / 100,
    activeBody: withAlpha(t.colors.accent, 0.86),
    activeRim: highlight,
    selectedBody: "rgba(255,253,248,0.94)",
    selectedText: "#2a0710",
    text: t.colors.onPhoto,
    textMuted: t.colors.onPhotoMuted,
    dot: t.colors.onPhoto,
    dotDim: "rgba(255,255,255,0.35)",
    highlight,
    highlightRim: withAlpha(highlight, 0.38),
  };
}

/** The photo chrome of the room on screen — recomputed only when the room (or the admin's glass) changes. */
export function usePhotoChrome(): PhotoChrome {
  const t = useTheme();
  return useMemo(() => photoChrome(t), [t]);
}
