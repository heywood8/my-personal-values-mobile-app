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
  // Panels and cards that sit on the background as objects rather than as
  // boxed-off regions of the page. One step above `lg`, so a card is visibly
  // softer than the controls inside it and the two never read as the same
  // surface stacked twice.
  xl: 20,
  // Material 3's `corner.extra-large`, for surfaces that float free of what is
  // behind them — dialogs, sheets, and the calibration card.
  xxl: 28,
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
  // The one size used for a screen's own name, and nothing else. It is roughly
  // twice the body size, which is what makes a page read as having a top rather
  // than as starting mid-sentence.
  hero: 32,
};

/**
 * Line heights, as multiples rather than pixels.
 *
 * A `lineHeight` written into a StyleSheet is left exactly where it was written
 * while React Native scales the `fontSize` under it with the reader's font-size
 * setting — at 200% that prints the text on top of itself. So these are factors
 * to multiply a font size by, and anything that also has to survive a font-scale
 * change multiplies by `PixelRatio.getFontScale()` as well (see DeckCardText).
 *
 * `tight` is for display sizes, where the default leading looks loose and airy;
 * `body` is the reading default; `relaxed` is for the small print, which needs
 * more air per line, not less, to stay readable at 12–14px.
 */
export const LINE_HEIGHT = {
  tight: 1.15,
  heading: 1.25,
  body: 1.4,
  relaxed: 1.5,
};

/**
 * Letter spacing.
 *
 * Large type sets too loose at its default tracking and small type sets too
 * tight, so the two ends are corrected in opposite directions: `tight` on
 * anything from `xl` up, `wide` on the small all-caps-ish labels that name a
 * section. Body text is left alone — tracking body copy is how a page starts
 * looking designed at the cost of being read.
 */
export const LETTER_SPACING = {
  tight: -0.5,
  snug: -0.2,
  normal: 0,
  wide: 0.8,
};

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// ============ ELEVATION ============

/**
 * The shadow scale, as `boxShadow` strings.
 *
 * Three levels and no more: 1 for a resting card, 2 for a control that is
 * currently chosen, 3 for something floating over the page. Anything that needs
 * a fourth is asking for a different layout.
 *
 * `boxShadow` rather than the `shadow*` props, which react-native-web 0.21 warns
 * are deprecated and which never had an Android implementation at all — the new
 * architecture (this app enables it) renders `boxShadow` natively on both
 * platforms, so one string covers Android, iOS and the browser.
 *
 * Mode matters, and not only for the alpha. A shadow is the absence of light, so
 * on a dark surface it barely reads at any opacity — what separates a dark card
 * from a dark background is that the card is *lighter*, which the palette already
 * does. So the dark scale is deliberately shallower and tighter: enough to seat
 * an element, not enough to look like soot.
 */
const SHADOW = {
  light: {
    1: '0px 1px 2px rgba(18, 20, 26, 0.06), 0px 2px 8px rgba(18, 20, 26, 0.05)',
    2: '0px 2px 4px rgba(18, 20, 26, 0.08), 0px 6px 16px rgba(18, 20, 26, 0.08)',
    3: '0px 6px 12px rgba(18, 20, 26, 0.10), 0px 16px 32px rgba(18, 20, 26, 0.12)',
  },
  dark: {
    1: '0px 1px 2px rgba(0, 0, 0, 0.30)',
    2: '0px 2px 6px rgba(0, 0, 0, 0.38)',
    3: '0px 8px 20px rgba(0, 0, 0, 0.46)',
  },
};

/**
 * A shadow style for a level and a colour scheme.
 *
 * Returns a style object rather than a string so a caller can spread it into an
 * array of styles without remembering the property name, and so level 0 can be
 * an empty object instead of a special case at every call site.
 */
export const elevation = (level, mode) => {
  const scale = mode === 'dark' ? SHADOW.dark : SHADOW.light;
  const shadow = scale[level];
  return shadow ? { boxShadow: shadow } : {};
};

// Space above the first element on a screen that owns its own scroll view.
export const TOP_CONTENT_SPACING = 32;

// Maximum width for centred content. Phones never reach it; on a tablet or a
// browser window it stops a 47-item list from stretching to 1600px, where the
// label and its bar end up too far apart to read as one row.
export const CONTENT_MAX_WIDTH = 560;
