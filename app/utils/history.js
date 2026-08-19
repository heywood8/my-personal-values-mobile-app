/**
 * What the history screen reads, as plain functions over the rows.
 *
 * Everything here works on the NORMALISED score, which is what makes a history
 * spanning a change of rating scale comparable at all (see app/utils/scales.js).
 * Raw scores appear on the screen next to a date, never on an axis.
 */

import { isVeryImportant } from './alignment';

/**
 * How many values the screen tracks by default.
 *
 * Ten is a reading, not a limit: it is roughly what fits a phone screen as a
 * grid of small multiples without becoming a wall, and it is enough that a
 * reader recognises the list as "the ones I care about" rather than a sample.
 * `defaultTrackedIds()` widens it whenever the reader's own core band is bigger,
 * because that band is the answer they gave to exactly this question.
 */
export const MIN_TRACKED_VALUES = 10;

/**
 * Every value's trajectory, and the dates they were recorded on.
 *
 * One pass over `getHistory()`'s rows, which arrive oldest-first and in deck
 * order within a date — so each value's points come out oldest-first too, which
 * is what both charts assume.
 *
 * @param {Array} history rows from getHistory()
 * @returns {{dates: Array<string>, values: Array<object>}}
 */
export function buildTrendSeries(history) {
  const dates = [];
  const byValue = new Map();

  for (const row of history || []) {
    if (!dates.includes(row.assessedOn)) dates.push(row.assessedOn);

    if (!byValue.has(row.valueId)) {
      byValue.set(row.valueId, {
        valueId: row.valueId,
        key: row.key,
        isCustom: row.isCustom,
        customName: row.customName,
        points: [],
      });
    }
    byValue.get(row.valueId).points.push({
      assessedOn: row.assessedOn,
      normalized: row.normalized,
      score: row.score,
    });
  }

  dates.sort();

  return { dates, values: [...byValue.values()] };
}

/** A value's point on one date, or null if it was not rated that day. */
export function pointOn(value, dateKey) {
  if (!value || !dateKey) return null;
  return value.points.find((point) => point.assessedOn === dateKey) || null;
}

/**
 * How far each value moved between the two most recent calibrations.
 *
 * Comparing against the very first run instead would answer a different question
 * ("how far have I come"), and the one people check after a recalibration is
 * "what changed this time".
 *
 * Returned strongest movement first, and a value rated in only one of the two
 * runs is left out entirely — showing it as a full-height rise would be an
 * artefact of it being new rather than a change of mind.
 */
export function computeMovers(values, dates) {
  const previousDate = dates[dates.length - 2];
  const latestDate = dates[dates.length - 1];
  if (!previousDate || !latestDate) return [];

  const moved = [];
  for (const value of values) {
    const before = pointOn(value, previousDate);
    const after = pointOn(value, latestDate);
    if (!before || !after) continue;
    const delta = after.normalized - before.normalized;
    if (delta !== 0) moved.push({ ...value, delta, before, after });
  }

  moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return moved;
}

/**
 * The values the grid opens on: the current top ten, or the whole current core
 * band, whichever is longer.
 *
 * Both halves of that rule are the reader's own answer read back, and neither
 * alone is enough. The core band — the `very important` step, see
 * `isVeryImportant()` — is what they actually nominated, and on a generous
 * ranking it can run to twenty; cutting it at ten would drop values they had
 * just said matter most. But it can also be empty, on a cautious 1..10 ranking
 * where nothing was awarded an 8, and an empty band would open this screen on
 * nothing at all. The floor is what stops that.
 *
 * `ranked` must be strongest-first, which is what `getRankedResults()` returns.
 * That ordering is what makes the core band a *prefix* of the list, so both
 * halves of the rule reduce to one slice.
 *
 * @param {Array} ranked ranked results, strongest first
 * @param {number} minimum the floor, exposed for tests
 */
export function defaultTrackedIds(ranked, minimum = MIN_TRACKED_VALUES) {
  const list = ranked || [];
  const core = list.filter((result) => isVeryImportant(result.normalized)).length;
  return list.slice(0, Math.max(minimum, core)).map((result) => result.valueId);
}
