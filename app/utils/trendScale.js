/**
 * The one time axis every history chart is drawn against.
 *
 * The x axis is time-proportional, not one-slot-per-calibration: three runs on
 * consecutive days followed by one six months later is a real shape, and evenly
 * spacing them would draw a steady drift that never happened.
 *
 * It lives here rather than inside the chart because there are now two charts —
 * the overlay and the sparkline on every grid card — and a grid of small
 * multiples only reads as a comparison if every cell is plotted against the
 * *same* axis. Two copies of this mapping is exactly how one of them ends up
 * spacing its points evenly while the other does not.
 */

import { parseDateKey } from './dateUtils';

/**
 * A function mapping a date key onto 0..1 across the span of `dates`.
 *
 * A single date — or several that land on the same day — has no span to divide
 * by, so everything pins to the middle of the plot rather than to a division by
 * zero. The result is clamped, so a point outside the range (a value rated on a
 * date the caller did not list) lands on an edge instead of off the canvas.
 *
 * @param {Array<string>} dates every calibration date, in any order
 */
export function timeAxis(dates) {
  const times = (dates || []).map((key) => parseDateKey(key).getTime());
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  const span = max - min;

  return (dateKey) => {
    if (span <= 0) return 0.5;
    const time = parseDateKey(dateKey).getTime();
    return Math.min(Math.max((time - min) / span, 0), 1);
  };
}
