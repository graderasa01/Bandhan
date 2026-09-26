import { memo } from "react";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSvgId } from "~/hooks/useSvgId";

/**
 * The BandhanTak seal — maroon, two interlocking gold-foil rings ("bandhan" =
 * bond). Drawn from the same geometry as public/brand/bandhantak-header-mark.svg.
 */
export const BrandMark = memo(function BrandMark({ size = 48, seal = true }: { size?: number; seal?: boolean }) {
  const foil = useSvgId("bt-foil");
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id={foil} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#e8cf7a" />
          <Stop offset="0.45" stopColor="#d4af37" />
          <Stop offset="1" stopColor="#94751f" />
        </LinearGradient>
      </Defs>
      {seal ? (
        <>
          <Rect x="1" y="1" width="38" height="38" rx="11" fill="#4a1119" />
          <Rect x="1" y="1" width="38" height="38" rx="11" fill="none" stroke={`url(#${foil})`} strokeWidth="1.25" opacity={0.55} />
        </>
      ) : null}
      <Circle cx="16" cy="20" r="7.5" fill="none" stroke={`url(#${foil})`} strokeWidth="2.25" />
      <Circle cx="24" cy="20" r="7.5" fill="none" stroke={`url(#${foil})`} strokeWidth="2.25" opacity={0.75} />
    </Svg>
  );
});
