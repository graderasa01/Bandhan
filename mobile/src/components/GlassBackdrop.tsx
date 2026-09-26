import { BlurView } from "expo-blur";
import { memo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { blurIntensity, viewVeils, type Material } from "~/theme";

/**
 * What a pane does to the room behind it, natively (the web preview has its
 * own, exact version in GlassBackdrop.web.tsx):
 *
 *   iOS      a real BlurView at the level's blur, then the view veils —
 *            brightness, Background Visibility and low saturation, laid in the
 *            web filter's order (see `viewVeils`)
 *   Android  no live blur (it costs frames on every scroll), only the veils;
 *            the body above it is the thicker smoked one (`bodySolid`)
 */
export const GlassBackdrop = memo(function GlassBackdrop({ material, blur }: { material: Material; blur: number }) {
  const veils = viewVeils(material);
  const live = Platform.OS === "ios" && blur > 0 && material.kind === "glass";
  if (!live && veils.length === 0) return null;
  return (
    <>
      {live ? <BlurView intensity={blurIntensity(blur)} tint={material.blurTint} style={StyleSheet.absoluteFill} /> : null}
      {veils.map((color, i) => (
        <View key={i} style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
      ))}
    </>
  );
});

/** Whether this platform draws a live blur under panes (and so uses the thin body). */
export const LIVE_BLUR = Platform.OS === "ios";
