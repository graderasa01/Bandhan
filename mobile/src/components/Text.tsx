import { memo } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { typeScale, useTheme, type TypeVariant } from "~/theme";

export type TextTone =
  | "primary"
  | "secondary"
  | "muted"
  | "heading"
  | "gold"
  | "link"
  | "accent"
  | "onAccent"
  | "onPhoto"
  | "onPhotoMuted"
  | "success"
  | "danger"
  | "warn";

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  center?: boolean;
}

/**
 * The only text component screens use. Colour comes from the room, size from
 * the one type scale; system font size still applies, capped where a layout
 * would otherwise break (headings and buttons tighter than body copy).
 */
export const Text = memo(function Text({ variant = "body", tone, center, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const t = useTheme();
  const c = t.colors;
  const resolvedTone: TextTone = tone ?? (variant === "h1" || variant === "h2" || variant === "display" ? "heading" : "primary");
  const color = {
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
  }[resolvedTone];

  const cap = maxFontSizeMultiplier ?? (variant === "body" || variant === "small" ? 1.4 : 1.25);

  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={cap}
      style={[
        typeScale[variant],
        { color },
        center && { textAlign: "center" },
        // Light type over a room photo keeps a soft shadow, as the web's clear glass does.
        t.photo && t.dark && { textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
        style,
      ]}
    />
  );
});
