/** 4-point spacing scale. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 44,
} as const;

export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const layout = {
  /** Side gutter on every screen. */
  gutter: 16,
  /** Content never stretches wider than this — tablets, landscape, the web preview. */
  maxContentWidth: 520,
  /** Minimum touch target (Android 48dp / iOS 44pt — the larger wins). */
  touch: 48,
  /** The floating tab bar's own height, above the home indicator. */
  tabBarHeight: 64,
  /**
   * Space a scrolling tab screen leaves at its foot so the last row clears the
   * floating bar — and Grio's launcher, which floats just above it.
   */
  tabBarClearance: 150,
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
} as const;
