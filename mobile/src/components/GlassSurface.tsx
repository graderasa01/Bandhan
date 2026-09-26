import { LinearGradient } from "expo-linear-gradient";
import { forwardRef, memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { radius as R, useTheme, type SurfaceLevel } from "~/theme";
import { GlassBackdrop, LIVE_BLUR } from "./GlassBackdrop";

export interface GlassSurfaceProps extends Omit<ViewProps, "style"> {
  children?: ReactNode;
  /** soft = nested/quiet, default = cards and sheets, strong = review, modals, actions. */
  level?: SurfaceLevel;
  radius?: number;
  /** A chosen / live surface — the gold rim. */
  active?: boolean;
  /** A pane inside a pane: no second blur, the lighter body (one blurred surface per pixel, as on the web). */
  nested?: boolean;
  /** The drop shadow (default on). Off for flush surfaces — a row inside a list, a sheet's own body. */
  shadow?: boolean;
  /** Replace the body colour (the chosen chip's wine, a smoked bar over a photo) — rim and light stay the material's. */
  bodyOverride?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * THE pane. Every glass (or paper) surface in the app is this, at one of three
 * levels — the material itself comes from the resolved theme (`t.material`,
 * theme/material.ts), never from the caller:
 *
 *   Satin / Day / Night   blurred translucent glass with a lit rim
 *   a photo room          the admin's clear glass — every knob applied
 *   Classic               opaque ivory card stock, warm hairline, no blur,
 *                         and on `strong` a second gold rule inside the edge
 *
 * Layers, bottom to top: the backdrop (blur and the view veils), the body, the
 * sheen, the rim with its lit lip, the paper's inner rule — then the content,
 * in normal flow, so the caller's padding and layout apply as written. The
 * drop is a real `boxShadow` on the outside.
 */
export const GlassSurface = memo(
  forwardRef<View, GlassSurfaceProps>(function GlassSurface(
    { children, level = "default", radius = R.lg, active = false, nested = false, shadow = true, bodyOverride, style, ...rest },
    ref,
  ) {
    const t = useTheme();
    const m = t.material;
    const s = m[level];
    const body = bodyOverride ?? (nested || LIVE_BLUR || m.kind === "paper" ? s.body : s.bodySolid);
    const gold = t.colors.gold;

    return (
      <View ref={ref} {...rest} style={[styles.root, { borderRadius: radius }, shadow ? { boxShadow: s.shadow } : null, style]}>
        <View style={[StyleSheet.absoluteFill, styles.under, { borderRadius: radius, overflow: "hidden" }]} pointerEvents="none">
          {/* A nested pane sees the room through its parent, already filtered —
              it neither blurs nor darkens again. Every other pane keeps its view
              filters even at an admin's zero blur: brightness, Background
              Visibility and saturation are knobs of their own, as on the web. */}
          {nested ? null : <GlassBackdrop material={m} blur={s.blur} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: body }]} />
          {s.sheen ? (
            <LinearGradient colors={s.sheen.colors} locations={s.sheen.locations} start={{ x: 0.1, y: 0 }} end={{ x: 0.75, y: 1 }} style={StyleSheet.absoluteFill} />
          ) : null}
        </View>
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.under,
            {
              borderRadius: radius,
              borderWidth: active ? Math.max(1.4, s.rimWidth) : s.rimWidth,
              borderTopColor: active ? gold : s.rim.top,
              borderLeftColor: active ? gold : s.rim.left,
              borderRightColor: active ? gold : s.rim.right,
              borderBottomColor: active ? gold : s.rim.bottom,
              boxShadow: s.lip,
            },
          ]}
        />
        {s.innerRule ? (
          <View
            pointerEvents="none"
            style={[styles.innerRule, styles.under, { borderRadius: Math.max(0, radius - 5), borderColor: active ? gold : s.innerRule }]}
          />
        ) : null}
        {children}
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  // The pane is its own stacking context and every material layer sits under
  // its content — on the web a positioned layer would otherwise paint over an
  // icon or a text field that is not itself positioned.
  root: { zIndex: 0 },
  under: { zIndex: -1 },
  innerRule: { position: "absolute", top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1 },
});
