"use client";

import { cn } from "@/lib/utils";
import type { GrahaPosition } from "@/lib/contracts/kundli";
import type { Translate } from "@/lib/i18n/translate";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The North Indian (diamond) kundli — a square cut by both diagonals and an
 * inscribed diamond, giving twelve houses in fixed screen positions with the
 * rashi *numbers* moving between them.
 *
 * Two decisions worth naming:
 *
 *  - **North Indian, not South Indian.** The house positions are fixed and the
 *    signs rotate, which is the layout a Hindi-belt family recognises on sight.
 *    A South Indian chart would be simpler to draw (a fixed 4×4 grid) and would
 *    look wrong to the people this screen is for.
 *  - **Devanagari abbreviations inside the boxes.** सू / चं / मं is what is
 *    printed on every kundli a user has ever been handed, and it fits in a
 *    house a third the size of "Chandra". The full Hinglish names live in the
 *    table beneath the chart, so nothing here is the only place a name appears.
 *
 * Geometry is a plain 300×300 viewBox with `preserveAspectRatio`, so the chart
 * scales to any container without a single media query.
 */

function grahaShort(t: Translate): Record<string, string> {
  return {
    Surya: t("kundli.chartSvg.graha.Surya", "सू"),
    Chandra: t("kundli.chartSvg.graha.Chandra", "चं"),
    Mangal: t("kundli.chartSvg.graha.Mangal", "मं"),
    Budh: t("kundli.chartSvg.graha.Budh", "बु"),
    Guru: t("kundli.chartSvg.graha.Guru", "गु"),
    Shukra: t("kundli.chartSvg.graha.Shukra", "शु"),
    Shani: t("kundli.chartSvg.graha.Shani", "शनि"),
    Rahu: t("kundli.chartSvg.graha.Rahu", "रा"),
    Ketu: t("kundli.chartSvg.graha.Ketu", "के"),
  };
}

/** Polygon points and label anchor for each of the twelve houses. */
const HOUSES: ReadonlyArray<{ points: string; cx: number; cy: number }> = [
  { points: "150,0 225,75 150,150 75,75", cx: 150, cy: 62 },   // 1
  { points: "0,0 150,0 75,75", cx: 75, cy: 30 },               // 2
  { points: "0,0 75,75 0,150", cx: 32, cy: 78 },               // 3
  { points: "0,150 75,75 150,150 75,225", cx: 75, cy: 150 },   // 4
  { points: "0,150 75,225 0,300", cx: 32, cy: 222 },           // 5
  { points: "0,300 75,225 150,300", cx: 75, cy: 272 },         // 6
  { points: "150,300 75,225 150,150 225,225", cx: 150, cy: 238 }, // 7
  { points: "150,300 225,225 300,300", cx: 225, cy: 272 },     // 8
  { points: "300,300 225,225 300,150", cx: 268, cy: 222 },     // 9
  { points: "300,150 225,225 150,150 225,75", cx: 225, cy: 150 }, // 10
  { points: "300,150 225,75 300,0", cx: 268, cy: 78 },         // 11
  { points: "300,0 225,75 150,0", cx: 225, cy: 30 },           // 12
];

export interface KundliChartSvgProps {
  /** Rashi sitting in house 1. Everything else follows from it. */
  lagnaRashi: number;
  grahas: GrahaPosition[];
  className?: string;
}

export default function KundliChartSvg({ lagnaRashi, grahas, className }: KundliChartSvgProps) {
  const t = useT();
  const GRAHA_SHORT = grahaShort(t);
  // House n holds rashi (lagnaRashi + n - 1), wrapped to 1–12.
  const byHouse: string[][] = HOUSES.map(() => []);
  for (const g of grahas) {
    const house = ((g.rashi - lagnaRashi + 12) % 12) + 1;
    byHouse[house - 1].push(GRAHA_SHORT[g.graha] ?? g.graha.slice(0, 2));
  }

  return (
    <svg
      viewBox="0 0 300 300"
      role="img"
      aria-label={t("kundli.chartSvg.ariaLabel", "Janm kundli — North Indian chart")}
      className={cn("h-auto w-full max-w-[22rem]", className)}
    >
      <rect x="0" y="0" width="300" height="300" className="fill-surface-2" />

      {HOUSES.map((h, i) => (
        <polygon
          key={i}
          points={h.points}
          className="fill-transparent stroke-gold-600/50"
          strokeWidth={1.25}
        />
      ))}

      {/* Outer frame drawn last and heavier, so the diagonals tuck under it. */}
      <rect
        x="0"
        y="0"
        width="300"
        height="300"
        className="fill-none stroke-gold-700"
        strokeWidth={2.5}
      />

      {HOUSES.map((h, i) => {
        const rashi = ((lagnaRashi + i - 1) % 12) + 1;
        const planets = byHouse[i];
        // Stack planets around the anchor; the rashi number sits above them.
        const top = h.cy - (planets.length > 3 ? 16 : 10);
        return (
          <g key={`labels-${i}`}>
            <text
              x={h.cx}
              y={top}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              {rashi}
            </text>
            {planets.map((p, pi) => (
              <text
                key={p + pi}
                x={h.cx + (planets.length > 3 ? (pi % 2 === 0 ? -17 : 17) : 0)}
                y={top + 15 + Math.floor(planets.length > 3 ? pi / 2 : pi) * 14}
                textAnchor="middle"
                className="fill-wine-700"
                style={{ fontSize: 13, fontWeight: 700 }}
              >
                {p}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
