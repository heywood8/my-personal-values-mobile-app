/**
 * Design tokens — the single source of spacing, sizing and type values.
 *
 * Principles: a 4px grid, a short radius scale, semantic names.
 */

// ============ SPACING (4px grid) ============
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// ============ BORDER RADIUS ============
export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  // Material 3's `corner.extra-large`, for surfaces that float free of what is
  // behind them — dialogs, sheets, and the calibration card.
  xl: 28,
  // Fully rounded. Not a size: past half the height it clamps, so it does not
  // compete with the scale above.
  pill: 999,
};

// ============ HEIGHTS ============
export const HEIGHTS = {
  input: 48,
  listItem: 56,
  // Rating buttons. At 1..10 there are ten of them across a phone screen, so the
  // width is what gives; the height stays at Android's 48px touch floor.
  scaleStep: 48,
  tabBar: 64,
  // Bars in the ranked results chart. Tight enough that a good chunk of 47
  // values is visible without scrolling, tall enough to hold a label.
  rankedBar: 34,
};

// ============ TYPOGRAPHY ============
export const FONT_SIZE = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  display: 28,
};

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// Space above the first element on a screen that owns its own scroll view.
export const TOP_CONTENT_SPACING = 32;

// Maximum width for centred content. Phones never reach it; on a tablet or a
// browser window it stops a 47-item list from stretching to 1600px, where the
// label and its bar end up too far apart to read as one row.
export const CONTENT_MAX_WIDTH = 560;
