/**
 * The second list: how far behaviour matches the values that matter most.
 *
 * The first list is importance — every value in the deck, ranked. This one is
 * the other half of the printed instrument: a wheel of ten rings, one sector per
 * very important value, filled from the centre outwards. The centre reads "my
 * behaviour does not correspond to my values"; the outer edge reads "I live
 * fully in accordance with my values". Filling it in is a *check-in*, and a
 * check-in is dated, so the wheel is trackable the same way the ranking is.
 *
 * Two decisions live here, and both are the reason this file exists rather than
 * the constants being scattered across the screen and the chart.
 */

import { SCALE_IDS, priorityBand } from './scales';

/**
 * Ten rings, and that is the scale.
 *
 * The importance scale is a preference: 1..5, 1..10 or three words, chosen on
 * the first card and stored per assessment, because the question "how much does
 * this matter" genuinely admits coarser and finer answers. Alignment does not
 * get that choice — the instrument is a wheel with ten rings drawn on it, and
 * "which ring am I on" is the whole question. One scale, forever, which is also
 * why `alignment_ratings` stores no normalised copy of the score: there is
 * nothing for it to be normalised against.
 */
export const ALIGNMENT_RINGS = 10;
export const ALIGNMENT_MIN = 1;
export const ALIGNMENT_MAX = ALIGNMENT_RINGS;

/**
 * The rating row is drawn by `ScaleInput`, which already knows how to lay ten
 * numbered buttons across a narrow phone. Passing it the 1..10 importance scale
 * is reuse of the *renderer*, not of the meaning: nothing about a check-in is
 * stored against a scale id, and changing the reader's importance scale leaves
 * every wheel exactly where it was.
 */
export const ALIGNMENT_INPUT_SCALE = SCALE_IDS.NUMERIC_10;

export function isValidAlignmentScore(score) {
  return Number.isInteger(score) && score >= ALIGNMENT_MIN && score <= ALIGNMENT_MAX;
}

/**
 * How much of a sector a score fills, as a fraction of the wheel's radius.
 *
 * Ring count, not a 0..1 remap: a 7 fills seven of the ten rings, which is what
 * the reader counted when they chose it. Mapping 1 onto an empty sector — the
 * 0..1 normalisation the importance scale uses — would draw "barely living this
 * one" and "not answered yet" identically.
 */
export function alignmentFraction(score) {
  if (!isValidAlignmentScore(score)) return 0;
  return score / ALIGNMENT_MAX;
}

/**
 * The priority band an alignment score sits in — what colours its sector.
 *
 * Banded on the SAME fraction the sector is drawn to, deliberately. A second
 * 0..1 reading of the score — the (score - min) / (max - min) the importance
 * scale uses — is a defensible number and would put the colour step one ring
 * away from where the fill steps, so a sector would change colour at a radius
 * the reader cannot see anything happening at. One mapping, and the colour and
 * the length say the same thing.
 */
export function alignmentBand(score) {
  return priorityBand(alignmentFraction(score));
}

/**
 * Whether a rating from the importance list counts as "very important".
 *
 * The wheel is only for those, which is what makes it a second list rather than
 * a second pass over the same 47 cards — nobody is asked to audit their
 * behaviour against a value they already said was peripheral.
 *
 * Read off the NORMALISED importance score, so the rule means one thing across
 * all three scales: it is the top priority band, `core`. On the qualitative
 * scale that band holds exactly the step labelled "Very important" and nothing
 * else; on 1..5 it is 4 and 5; on 1..10 it is 8, 9 and 10.
 *
 * The tighter reading — only the very top step — was rejected for a concrete
 * reason: on a ten-step scale a reader who never awards a 10 would open this
 * screen to an empty wheel and no way to understand why, having just told the
 * app that nine values matter enormously.
 */
export function isVeryImportant(normalized) {
  return priorityBand(normalized).id === 'core';
}

/**
 * The tracked list, from the latest calibration's ranked results.
 *
 * `getRankedResults()` already returns strongest-first, and that order is kept:
 * most important is at the top of every list in this app, and it is also sector
 * one on the wheel, drawn from twelve o'clock and running clockwise.
 *
 * Archived values are dropped, which is the one place this list is stricter than
 * the results screen. That screen shows a record, and a record has to stay
 * complete; this is a question being asked now, and asking somebody to audit
 * their behaviour against a card they took out of the deck — or one a release
 * retired out from under them, which `retireRemovedValues()` archives in bulk on
 * first launch after an upgrade — is asking about something they have already
 * said they are done with. Scores already recorded against such a value stay in
 * the database and in the export; it simply stops being asked about.
 *
 * `sector` is a position in THIS list and nothing more. It changes whenever the
 * ranking does, so it is a legend key for one screen and is never stored,
 * exported, or used to line a value up across two dates — that is what
 * `valueId` is for.
 */
export function trackedValues(results) {
  return (results || [])
    .filter((result) => isVeryImportant(result.normalized) && !result.archived)
    .map((result, index) => ({ ...result, sector: index + 1 }));
}
