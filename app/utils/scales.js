/**
 * The three rating scales, and the arithmetic that lets them coexist.
 *
 * The scale is a per-assessment fact, not a global one (see app/db/schema.js), so
 * a history spanning a scale change contains runs measured differently. Every
 * rating therefore stores BOTH its raw score — the number the user actually
 * chose, which is what gets shown back to them — and that score normalised to
 * 0..1, which is what every chart, sort and delta reads. Comparing raw scores
 * across scales would silently rank a 4-out-of-5 below a 6-out-of-10.
 */

export const SCALE_IDS = {
  NUMERIC_5: 'numeric5',
  NUMERIC_10: 'numeric10',
  QUALITATIVE: 'qualitative',
};

const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

export const SCALES = {
  [SCALE_IDS.NUMERIC_5]: {
    id: SCALE_IDS.NUMERIC_5,
    labelKey: 'scale_numeric5',
    // A second, shorter name for the three-across switch on the deck, where
    // "Словами, а не цифрами" has about a third of a phone's width to sit in.
    shortLabelKey: 'scale_numeric5_short',
    hintKey: 'scale_numeric5_hint',
    min: 1,
    max: 5,
    steps: range(1, 5),
    // Numeric scales print the number itself; the qualitative one has words.
    stepLabelKeys: null,
  },
  [SCALE_IDS.NUMERIC_10]: {
    id: SCALE_IDS.NUMERIC_10,
    labelKey: 'scale_numeric10',
    shortLabelKey: 'scale_numeric10_short',
    hintKey: 'scale_numeric10_hint',
    min: 1,
    max: 10,
    steps: range(1, 10),
    stepLabelKeys: null,
  },
  [SCALE_IDS.QUALITATIVE]: {
    id: SCALE_IDS.QUALITATIVE,
    labelKey: 'scale_qualitative',
    shortLabelKey: 'scale_qualitative_short',
    hintKey: 'scale_qualitative_hint',
    min: 1,
    max: 3,
    steps: range(1, 3),
    stepLabelKeys: {
      1: 'scale_qual_low',
      2: 'scale_qual_mid',
      3: 'scale_qual_high',
    },
  },
};

export const SCALE_ORDER = [
  SCALE_IDS.NUMERIC_5,
  SCALE_IDS.NUMERIC_10,
  SCALE_IDS.QUALITATIVE,
];

export const DEFAULT_SCALE = SCALE_IDS.NUMERIC_5;

/** The scale definition for an id, falling back to the default for an unknown one. */
export function getScale(scaleId) {
  return SCALES[scaleId] || SCALES[DEFAULT_SCALE];
}

export function isValidScaleId(scaleId) {
  return Object.prototype.hasOwnProperty.call(SCALES, scaleId);
}

/** Whether `score` is one of the steps `scaleId` offers. */
export function isValidScore(score, scaleId) {
  const scale = getScale(scaleId);
  return Number.isInteger(score) && score >= scale.min && score <= scale.max;
}

/**
 * Map a raw score onto 0..1, where 0 is the least important step the scale can
 * express and 1 the most. Out-of-range scores are clamped rather than rejected —
 * a stored rating from a scale that later changed shape should still plot.
 */
export function normalizeScore(score, scaleId) {
  const scale = getScale(scaleId);
  const span = scale.max - scale.min;
  if (span <= 0) return 0;
  const clamped = Math.min(Math.max(score, scale.min), scale.max);
  return (clamped - scale.min) / span;
}

/**
 * The inverse: the step of `scaleId` that best represents a 0..1 position. Used
 * when a recalibration starts from a previous run measured on another scale, so
 * the cards open pre-filled at the nearest equivalent instead of blank.
 */
export function denormalizeScore(normalized, scaleId) {
  const scale = getScale(scaleId);
  const clamped = Math.min(Math.max(normalized, 0), 1);
  return Math.round(scale.min + clamped * (scale.max - scale.min));
}

/** How a single step is labelled: the number, or the qualitative word. */
export function scaleStepLabel(scaleId, step, t) {
  const scale = getScale(scaleId);
  const key = scale.stepLabelKeys?.[step];
  return key ? t(key) : String(step);
}

/**
 * How much of a bar a normalised score fills.
 *
 * Not the normalised score itself: a value sitting on the very bottom step still
 * needs a visible mark, and a zero-width bar reads as missing data rather than as
 * "this barely matters". So the 0..1 reading is squeezed into 0.04..1.
 *
 * The wheel deliberately does NOT do this — see `alignmentFraction`, where a
 * score of 1 fills one ring out of ten and an empty sector means "not answered
 * yet". The difference is the whole reason both live in code rather than in a
 * chart: importance has no "unanswered" state to protect, and alignment does.
 */
export const MIN_BAR_FRACTION = 0.04;

export function scoreFraction(normalized) {
  const clamped = Math.min(Math.max(normalized ?? 0, 0), 1);
  return MIN_BAR_FRACTION + clamped * (1 - MIN_BAR_FRACTION);
}

/**
 * Priority bands — the "by priority" grouping on the results screen.
 *
 * Cut on the normalised score rather than the raw one so the bands mean the same
 * thing on every scale. The qualitative scale only produces 0, 0.5 and 1, so it
 * populates `core`, `important` and `peripheral` and leaves `secondary` empty;
 * the results screen drops empty bands rather than drawing a hole.
 */
export const PRIORITY_BANDS = [
  { id: 'core', labelKey: 'priority_core', min: 0.75 },
  { id: 'important', labelKey: 'priority_important', min: 0.5 },
  { id: 'secondary', labelKey: 'priority_secondary', min: 0.25 },
  { id: 'peripheral', labelKey: 'priority_peripheral', min: 0 },
];

/** The band a normalised score falls into. Ordered high to low, so first match wins. */
export function priorityBand(normalized) {
  return PRIORITY_BANDS.find((band) => normalized >= band.min) || PRIORITY_BANDS[PRIORITY_BANDS.length - 1];
}
