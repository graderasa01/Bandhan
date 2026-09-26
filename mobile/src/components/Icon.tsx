import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { useTheme } from "~/theme";
import type { TextTone } from "./Text";

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  tone?: TextTone;
  /** Overrides `tone`. */
  color?: string;
  strokeWidth?: number;
}

/** Lucide — the same icon family the web app uses — coloured from the room. */
export const Icon = memo(function Icon({ icon: Glyph, size = 20, tone = "primary", color, strokeWidth = 1.9 }: IconProps) {
  const t = useTheme();
  const c = t.colors;
  const resolved =
    color ??
    {
      primary: c.text,
      secondary: c.textSecondary,
      muted: c.textMuted,
      heading: c.heading,
      gold: c.gold,
      link: c.link,
      accent: t.dark ? c.accentLit : c.accent,
      onAccent: c.accentFg,
      onPhoto: c.onPhoto,
      onPhotoMuted: c.onPhotoMuted,
      success: c.success,
      danger: c.danger,
      warn: c.warn,
    }[tone];
  return <Glyph size={size} color={resolved} strokeWidth={strokeWidth} />;
});
