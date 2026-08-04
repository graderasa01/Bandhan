/**
 * M01A — Design Token Constants
 * 
 * All design tokens are defined as CSS custom properties in app/globals.css.
 * This file provides TypeScript constants for programmatic reference where needed.
 */

export const COLORS = {
  bg: 'var(--color-bg)',
  bgSoft: 'var(--color-bg-soft)',
  surface: 'var(--color-surface)',
  surfaceSoft: 'var(--color-surface-soft)',
  primary: 'var(--color-primary)',
  primaryDark: 'var(--color-primary-dark)',
  primarySoft: 'var(--color-primary-soft)',
  trust: 'var(--color-trust)',
  trustSoft: 'var(--color-trust-soft)',
  warning: 'var(--color-warning)',
  warningSoft: 'var(--color-warning-soft)',
  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  info: 'var(--color-info)',
  infoSoft: 'var(--color-info-soft)',
  text: 'var(--color-text)',
  textMuted: 'var(--color-text-muted)',
  textInverse: 'var(--color-text-inverse)',
  border: 'var(--color-border)',
  borderFocus: 'var(--color-border-focus)',
} as const;

export const FONTS = {
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
} as const;

export const TEXT_SIZES = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  base: 'var(--text-base)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)',
  '4xl': 'var(--text-4xl)',
} as const;

export const FONT_WEIGHTS = {
  normal: 'var(--font-normal)',
  medium: 'var(--font-medium)',
  semibold: 'var(--font-semibold)',
  bold: 'var(--font-bold)',
} as const;

export const LINE_HEIGHTS = {
  tight: 'var(--leading-tight)',
  normal: 'var(--leading-normal)',
  relaxed: 'var(--leading-relaxed)',
} as const;

export const SPACING = {
  '1': 'var(--space-1)',
  '2': 'var(--space-2)',
  '3': 'var(--space-3)',
  '4': 'var(--space-4)',
  '5': 'var(--space-5)',
  '6': 'var(--space-6)',
  '8': 'var(--space-8)',
  '10': 'var(--space-10)',
  '12': 'var(--space-12)',
  '16': 'var(--space-16)',
} as const;

export const RADII = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
} as const;

export const SHADOWS = {
  none: 'var(--shadow-none)',
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  drawer: 'var(--shadow-drawer)',
} as const;

export const Z_INDEX = {
  base: 'var(--z-base)',
  dropdown: 'var(--z-dropdown)',
  sticky: 'var(--z-sticky)',
  fixed: 'var(--z-fixed)',
  drawer: 'var(--z-drawer)',
  modal: 'var(--z-modal)',
  tooltip: 'var(--z-tooltip)',
} as const;

export const TRANSITIONS = {
  fast: 'var(--transition-fast)',
  base: 'var(--transition-base)',
  slow: 'var(--transition-slow)',
} as const;

export const TOUCH = {
  min: 'var(--touch-min)',
} as const;
