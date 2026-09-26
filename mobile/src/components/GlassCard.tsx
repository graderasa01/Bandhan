import { memo, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { radius as R, type SurfaceLevel } from "~/theme";
import { GlassSurface } from "./GlassSurface";
import { PressableScale } from "./PressableScale";

export type GlassLevel = SurfaceLevel;

export interface GlassCardProps {
  children?: ReactNode;
  level?: GlassLevel;
  /** A chosen / live surface — gold rim. */
  active?: boolean;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** A card inside other glass: no second blur (the web drops it too). */
  flat?: boolean;
}

/**
 * The content card — `GlassSurface` with padding, and, when it does
 * something, the shared spring press. Its material (Satin glass, the admin's
 * clear glass over a photo, Classic paper) is the room's, never its own.
 */
export const GlassCard = memo(function GlassCard({
  children,
  level = "default",
  active = false,
  padding = 16,
  radius = R.lg,
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
  flat = false,
}: GlassCardProps) {
  if (onPress || onLongPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        scaleTo={0.985}
        style={[{ borderRadius: radius }, style]}
      >
        <GlassSurface level={level} active={active} radius={radius} nested={flat} style={{ padding }}>
          {children}
        </GlassSurface>
      </PressableScale>
    );
  }

  return (
    <GlassSurface level={level} active={active} radius={radius} nested={flat} style={[{ padding }, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </GlassSurface>
  );
});
