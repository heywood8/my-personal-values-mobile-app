/**
 * Chart colour, per mode.
 *
 * Two palettes, because two different jobs:
 *
 *   PRIORITY_RAMP is ORDINAL — one blue hue, stepped. It colours the ranked value
 *   list, whose job is magnitude (low → high), and a single hue stepped by rank is
 *   what makes 47 bars readable as an ordering rather than as 47 unrelated things.
 *
 *   CATEGORICAL_SERIES is CATEGORICAL — eight distinct hues in a FIXED order. It
 *   colours things whose job is identity: the lines on the trend chart. The order
 *   is the safety mechanism, not decoration — it was chosen so every adjacent pair
 *   clears the colour-vision-deficiency separation gate, so reordering the slots
 *   silently degrades it.
 *
 * Both were run through the data-viz palette validator against THIS app's exact
 * surfaces (#ffffff light, #181b23 dark) rather than eyeballed:
 *
 *   categorical light  — all pass; three slots (aqua, yellow, magenta) sit below
 *                        3:1 on white, which obligates visible direct labels.
 *                        Every surface that uses a categorical hue prints the
 *                        value's name next to it — the trend chart's legend is
 *                        also its selector — so that obligation is met; a future
 *                        chart that drops the labels would break it.
 *   categorical dark   — all pass, contrast included.
 *   ordinal both modes — monotone lightness, ≥0.06 ΔL between steps, pale end
 *                        clears 2:1 against the surface.
 *
 * The dark column is the same hues re-stepped for a dark surface — chosen for that
 * band, not flipped or lightened automatically.
 */

// Slot order is load-bearing. See above.
const CATEGORICAL_SERIES_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

const CATEGORICAL_SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

/**
 * Priority bands, palest = least important.
 *
 * Dark mode inverts the direction rather than the values: on white, "more
 * important" reads as darker; on near-black it reads as lighter. Both runs were
 * validated as ordinal ramps in their own mode.
 */
const PRIORITY_RAMP_LIGHT = {
  peripheral: '#86b6ef',
  secondary: '#5598e7',
  important: '#2a78d6',
  core: '#184f95',
};

const PRIORITY_RAMP_DARK = {
  peripheral: '#184f95',
  secondary: '#256abf',
  important: '#3987e5',
  core: '#86b6ef',
};

/** Categorical hues in slot order for a mode. */
export const categoricalSeries = (mode) => (
  mode === 'dark' ? CATEGORICAL_SERIES_DARK : CATEGORICAL_SERIES_LIGHT
);

/** The ordinal step for a priority band id. */
export const priorityColor = (bandId, mode) => {
  const ramp = mode === 'dark' ? PRIORITY_RAMP_DARK : PRIORITY_RAMP_LIGHT;
  return ramp[bandId] || ramp.peripheral;
};

/**
 * Line colour for a tracked value on the trend chart.
 *
 * `slot` is assigned when the value is selected and held until it is deselected,
 * so removing one line never repaints the others. The trend chart caps selection
 * at the length of this series for the same reason the palette stops at eight:
 * a ninth generated hue would not be tellable from an existing one.
 */
export const seriesColor = (slot, mode) => {
  const series = categoricalSeries(mode);
  return series[slot % series.length];
};

export const MAX_TRACKED_SERIES = 5;
