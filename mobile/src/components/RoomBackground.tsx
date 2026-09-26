import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinear, Path, RadialGradient, Stop } from "react-native-svg";
import { useSvgId } from "~/hooks/useSvgId";
import { resolveMediaUrl } from "~/services/api/client";
import { useThemeRoom, type RoomId } from "~/theme";

/**
 * The room behind every screen.
 *
 * Each look is drawn for a portrait phone rather than borrowed from the
 * desktop, and every one keeps the web's rule for the satin room: *drama at
 * the edges, the column calm*. Bright satin, pearls and bokeh live in the
 * margins and corners; the middle, where cards and text sit, stays a flat
 * mid-dark so glass over it keeps its contrast. The SVG uses `slice`, so it
 * covers any screen shape without stretching.
 *
 * When an admin has put a photo behind this room (/admin/theme, mobile slot),
 * that photo is shown instead — cropped around the admin's focus point and
 * dimmed by the admin's dim, the same numbers the web applies. Until the photo
 * itself has loaded, the server's 72px blurred copy of it stands in (then the
 * photo's average colour, if even that is not there yet), so the room is the
 * right one from the first frame and never a flat block.
 */

const VIEW = "0 0 400 860";

const Satin = memo(function Satin() {
  const id = useSvgId("satin");
  const u = (name: string) => `url(#${id}-${name})`;
  return (
    <Svg width="100%" height="100%" viewBox={VIEW} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgLinear id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3b161c" />
          <Stop offset="0.45" stopColor="#2c1419" />
          <Stop offset="1" stopColor="#1c080d" />
        </SvgLinear>
        <SvgLinear id={`${id}-sheetA`} x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fdeed2" stopOpacity="0.95" />
          <Stop offset="0.35" stopColor="#f0d2ab" stopOpacity="0.75" />
          <Stop offset="0.7" stopColor="#a87a5f" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#5c1420" stopOpacity="0" />
        </SvgLinear>
        <SvgLinear id={`${id}-sheetB`} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#f0d2ab" stopOpacity="0.8" />
          <Stop offset="0.4" stopColor="#a87a5f" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#5c1420" stopOpacity="0" />
        </SvgLinear>
        <SvgLinear id={`${id}-wine`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7a1f2b" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#2a0710" stopOpacity="0" />
        </SvgLinear>
        <RadialGradient id={`${id}-pearl`} cx="0.36" cy="0.32" r="0.72">
          <Stop offset="0" stopColor="#fff8ea" />
          <Stop offset="0.35" stopColor="#f0d2ab" />
          <Stop offset="0.75" stopColor="#a87a5f" />
          <Stop offset="1" stopColor="#3b161c" />
        </RadialGradient>
        <SvgLinear id={`${id}-crown`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1c080d" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#1c080d" stopOpacity="0" />
        </SvgLinear>
      </Defs>

      <Path d="M0 0H400V860H0Z" fill={u("ground")} />

      {/* Satin sheet sweeping in from the top-right. */}
      <Path d="M400 0 C 330 40, 300 120, 330 210 C 350 270, 400 300, 400 300 Z" fill={u("sheetA")} />
      <Path d="M400 40 C 350 90, 342 160, 372 230" stroke="#fff4dc" strokeOpacity="0.7" strokeWidth="1.6" fill="none" />
      <Path d="M258 0 C 300 30, 360 36, 400 22 L400 0 Z" fill={u("sheetA")} opacity="0.6" />

      {/* A wine fold down the left flank, and satin pooling at the foot. */}
      <Path d="M0 180 C 40 260, 36 380, 0 470 Z" fill={u("wine")} />
      <Path d="M0 860 C 40 760, 140 700, 240 720 C 320 736, 380 800, 400 860 Z" fill={u("sheetB")} />
      <Path d="M18 860 C 60 770, 150 724, 244 740" stroke="#fdeed2" strokeOpacity="0.55" strokeWidth="1.4" fill="none" />

      {/* Pearls — few, and mostly cut by the frame. */}
      <G>
        <Circle cx="392" cy="352" r="34" fill={u("pearl")} />
        <Circle cx="-6" cy="640" r="46" fill={u("pearl")} />
        <Circle cx="354" cy="690" r="14" fill={u("pearl")} opacity="0.9" />
        <Circle cx="30" cy="92" r="11" fill={u("pearl")} opacity="0.85" />
      </G>

      <Path d="M0 0H400V140H0Z" fill={u("crown")} />
    </Svg>
  );
});

const Day = memo(function Day() {
  const id = useSvgId("day");
  const u = (name: string) => `url(#${id}-${name})`;
  return (
    <Svg width="100%" height="100%" viewBox={VIEW} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgLinear id={`${id}-g`} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor="#4e2a22" />
          <Stop offset="0.5" stopColor="#2f1d1a" />
          <Stop offset="1" stopColor="#15100f" />
        </SvgLinear>
        <RadialGradient id={`${id}-plum`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#8e1a34" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#8e1a34" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${id}-champ`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#e7c489" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#e7c489" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d="M0 0H400V860H0Z" fill={u("g")} />
      <Ellipse cx="40" cy="120" rx="220" ry="200" fill={u("plum")} />
      <Ellipse cx="400" cy="30" rx="200" ry="160" fill={u("champ")} />
      <Ellipse cx="380" cy="820" rx="240" ry="200" fill={u("plum")} />
    </Svg>
  );
});

const BOKEH: Array<[number, number, number, number]> = [
  [60, 70, 28, 0.35], [350, 40, 42, 0.3], [300, 150, 18, 0.35], [20, 260, 22, 0.25], [385, 330, 30, 0.22],
  [40, 610, 34, 0.22], [360, 560, 16, 0.3], [330, 780, 44, 0.28], [90, 800, 22, 0.3], [200, 20, 12, 0.35],
];

const Night = memo(function Night() {
  const id = useSvgId("night");
  const u = (name: string) => `url(#${id}-${name})`;
  return (
    <Svg width="100%" height="100%" viewBox={VIEW} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgLinear id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4a2b12" />
          <Stop offset="0.45" stopColor="#2a1a0d" />
          <Stop offset="1" stopColor="#140b04" />
        </SvgLinear>
        <RadialGradient id={`${id}-lamp`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#ffd08a" stopOpacity="0.9" />
          <Stop offset="0.5" stopColor="#eec179" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#eec179" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#c08e38" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#c08e38" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d="M0 0H400V860H0Z" fill={u("g")} />
      <Ellipse cx="330" cy="60" rx="220" ry="180" fill={u("glow")} />
      {BOKEH.map(([cx, cy, r, o], i) => (
        <Circle key={i} cx={cx} cy={cy} r={r} fill={u("lamp")} opacity={o} />
      ))}
    </Svg>
  );
});

const Paper = memo(function Paper() {
  const id = useSvgId("paper");
  const u = (name: string) => `url(#${id}-${name})`;
  return (
    <Svg width="100%" height="100%" viewBox={VIEW} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgLinear id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fffdf9" />
          <Stop offset="0.6" stopColor="#fbf6ee" />
          <Stop offset="1" stopColor="#f6ecde" />
        </SvgLinear>
        <RadialGradient id={`${id}-warm`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#ebd3a0" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#ebd3a0" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d="M0 0H400V860H0Z" fill={u("g")} />
      <Ellipse cx="380" cy="10" rx="200" ry="150" fill={u("warm")} />
      <Path d="M300 0 C 330 40, 380 52, 400 50" stroke="#c9a96e" strokeOpacity="0.5" strokeWidth="1" fill="none" />
      <Path d="M0 820 C 60 800, 110 830, 150 860" stroke="#c9a96e" strokeOpacity="0.45" strokeWidth="1" fill="none" />
    </Svg>
  );
});

const ART: Record<RoomId, React.ComponentType> = { terrace: Satin, ivory: Day, gold: Night, paper: Paper };

export const RoomBackground = memo(function RoomBackground() {
  const { roomId, background, theme } = useThemeRoom();
  const Art = ART[roomId];

  if (background) {
    const uri = resolveMediaUrl(background.imageUrl);
    const backdrop = resolveMediaUrl(background.backdropUrl);
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: background.color || theme.colors.background }]} pointerEvents="none">
        {uri ? (
          <Image
            source={{ uri }}
            placeholder={backdrop ? { uri: backdrop } : undefined}
            placeholderContentFit="cover"
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={{ left: `${background.focusX}%`, top: `${background.focusY}%` }}
            cachePolicy="memory-disk"
            transition={250}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(20,10,12,${Math.min(0.9, Math.max(0, background.dim))})` }]} />
        <LinearGradient colors={["rgba(20,10,12,0.45)", "rgba(20,10,12,0)"]} style={styles.topShade} />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]} pointerEvents="none">
      <Art />
    </View>
  );
});

const styles = StyleSheet.create({
  topShade: { position: "absolute", left: 0, right: 0, top: 0, height: 140 },
});
