/**
 * Chart colour, per mode.
 *
 * Two palettes, because two different jobs:
 *
 *   PRIORITY_RAMP is ORDINAL — one blue hue, stepped. It colours the ranked value
 *   list, whose job is magnitude (low → high), and a single hue stepped by rank is
 *   what makes 74 bars readable as an ordering rather than as 74 unrelated things.
 *
 *   GROUP_SERIES is CATEGORICAL — eight distinct hues in a FIXED order. It colours
 *   things whose job is identity: the group chips, the group breakdown, the trend
 *   lines. The order is the safety mechanism, not decoration — it was chosen so
 *   every adjacent pair clears the colour-vision-deficiency separation gate, so
 *   reordering the groups silently degrades it.
 *
 * Both were run through the data-viz palette validator against THIS app's exact
 * surfaces (#ffffff light, #181b23 dark) rather than eyeballed:
 *
 *   categorical light  — all pass; three slots (aqua, yellow, magenta) sit below
 *                        3:1 on white, which obligates visible direct labels.
 *                        Every surface that uses a group hue prints its name and
 *                        number next to it, so that obligation is met; a future
 *                        chart that drops the labels would break it.
 *   categorical dark   — all pass, contrast included.
 *   ordinal both modes — monotone lightness, ≥0.06 ΔL between steps, pale end
 *                        clears 2:1 against the surface.
 *
 * The dark column is the same hues re-stepped for a dark surface — chosen for that
 * band, not flipped or lightened automatically.
 */

// Slot order is load-bearing. See above.
const GROUP_SERIES_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

const GROUP_SERIES_DARK = [
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
export const groupSeries = (mode) => (mode === 'dark' ? GROUP_SERIES_DARK : GROUP_SERIES_LIGHT);

/**
 * The hue for a value group. `groupIndex` is the group's position in the
 * catalogue's declared order, which is what pins a group to a slot — so a group
 * keeps its colour no matter which subset is on screen. Colour follows the
 * entity, never its rank.
 */
export const groupColor = (groupIndex, mode) => {
  const series = groupSeries(mode);
  // A custom value in an unrecognised group falls back to the last slot rather
  // than to a generated ninth hue, which would be indistinguishable under CVD.
  if (!Number.isInteger(groupIndex) || groupIndex < 0) return series[series.length - 1];
  return series[groupIndex % series.length];
};

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
  const series = groupSeries(mode);
  return series[slot % series.length];
};

export const MAX_TRACKED_SERIES = 5;
