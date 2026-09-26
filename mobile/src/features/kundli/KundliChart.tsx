import { memo } from "react";
import Svg, { G, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "~/theme";
import type { KundliGraha } from "~/types/api";

/** Devanagari abbreviations — what every printed kundli a family has seen uses (the web's `KundliChartSvg`). */
const GRAHA_SHORT: Record<string, string> = {
  Surya: "सू",
  Chandra: "चं",
  Mangal: "मं",
  Budh: "बु",
  Guru: "गु",
  Shukra: "शु",
  Shani: "शनि",
  Rahu: "रा",
  Ketu: "के",
};

/** Polygon points and label anchor for each of the twelve houses — the web chart's own geometry. */
const HOUSES: ReadonlyArray<{ points: string; cx: number; cy: number }> = [
  { points: "150,0 225,75 150,150 75,75", cx: 150, cy: 62 },
  { points: "0,0 150,0 75,75", cx: 75, cy: 30 },
  { points: "0,0 75,75 0,150", cx: 32, cy: 78 },
  { points: "0,150 75,75 150,150 75,225", cx: 75, cy: 150 },
  { points: "0,150 75,225 0,300", cx: 32, cy: 222 },
  { points: "0,300 75,225 150,300", cx: 75, cy: 272 },
  { points: "150,300 75,225 150,150 225,225", cx: 150, cy: 238 },
  { points: "150,300 225,225 300,300", cx: 225, cy: 272 },
  { points: "300,300 225,225 300,150", cx: 268, cy: 222 },
  { points: "300,150 225,225 150,150 225,75", cx: 225, cy: 150 },
  { points: "300,150 225,75 300,0", cx: 268, cy: 78 },
  { points: "300,0 225,75 150,0", cx: 225, cy: 30 },
];

/**
 * The North Indian (diamond) kundli: twelve houses in fixed positions, the
 * rashi numbers moving between them. With no lagna the caller passes the
 * Moon's rashi for house 1 — a Chandra Kundli, labelled as one under it.
 */
export const KundliChart = memo(function KundliChart({ lagnaRashi, grahas, size }: { lagnaRashi: number; grahas: KundliGraha[]; size: number }) {
  const t = useTheme();
  const c = t.colors;
  const byHouse: string[][] = HOUSES.map(() => []);
  for (const g of grahas) {
    const house = ((g.rashi - lagnaRashi + 12) % 12) + 1;
    byHouse[house - 1]!.push(GRAHA_SHORT[g.graha] ?? g.graha.slice(0, 2));
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessibilityLabel="Janm kundli — North Indian chart">
      <Rect x={0} y={0} width={300} height={300} fill={c.chip} />
      {HOUSES.map((h, i) => (
        <Polygon key={i} points={h.points} fill="none" stroke={c.gold} strokeOpacity={0.5} strokeWidth={1.25} />
      ))}
      <Rect x={0} y={0} width={300} height={300} fill="none" stroke={c.gold} strokeWidth={2.5} />
      {HOUSES.map((h, i) => {
        const rashi = ((lagnaRashi + i - 1) % 12) + 1;
        const planets = byHouse[i]!;
        const top = h.cy - (planets.length > 3 ? 16 : 10);
        return (
          <G key={`l-${i}`}>
            <SvgText x={h.cx} y={top} textAnchor="middle" fill={c.textMuted} fontSize={13} fontWeight="600">
              {String(rashi)}
            </SvgText>
            {planets.map((p, pi) => (
              <SvgText
                key={`${p}-${pi}`}
                x={h.cx + (planets.length > 3 ? (pi % 2 === 0 ? -17 : 17) : 0)}
                y={top + 15 + Math.floor(planets.length > 3 ? pi / 2 : pi) * 14}
                textAnchor="middle"
                fill={t.dark ? c.gold : c.heading}
                fontSize={13}
                fontWeight="700"
              >
                {p}
              </SvgText>
            ))}
          </G>
        );
      })}
    </Svg>
  );
});
