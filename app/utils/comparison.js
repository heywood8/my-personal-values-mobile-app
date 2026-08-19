/**
 * Two readings of the same list, side by side.
 *
 * A shared link is somebody else's answers, and the question a reader who has
 * their own answers actually has is not "what did they say" but "where do we
 * differ". This builds that: one row per value, carrying each side's reading of
 * it, plus the two numbers a comparison is sorted and summarised by.
 *
 * Three things are worth knowing before changing any of it.
 *
 * **Comparison happens on the normalised score, never the raw one.** The scale
 * is a per-assessment fact, so a friend on 1..10 and a reader on three words are
 * routinely being compared here; a raw 4 means different things on each side.
 * The 0..1 column is the one thing the two installs measured the same way, which
 * is the whole reason every rating stores it. Each side's raw score is still
 * carried through, because that is the number its owner actually chose and the
 * one to print back at them — in their own scale's words.
 *
 * **Values are matched on `key`, and a custom value therefore never matches.**
 * A custom value's key is a uuid minted on the phone that created it, so two
 * people who both wrote "Sailing" have two different keys and get two rows. That
 * is the honest answer rather than a shortcoming: nothing on either side says
 * those are the same value, and matching them by name would silently merge two
 * strangers' words. The same fallback is what puts a value from a newer
 * catalogue in its own row instead of in nobody's.
 *
 * **The two metrics turn a score into a bar differently**, and both rules are
 * the ones their own screens already use: importance is squeezed away from zero
 * so the bottom step still draws (`scoreFraction`), while alignment is a count of
 * filled rings (`alignmentFraction`), where one ring out of ten is a real answer
 * and an empty bar means the wheel was never filled in for that value.
 */

import { alignmentFraction, isValidAlignmentScore } from './alignment';
import { priorityBand, scoreFraction } from './scales';

/** Which of the two lists is being compared. */
export const COMPARE_METRICS = {
  IMPORTANCE: 'importance',
  ALIGNMENT: 'alignment',
};

/**
 * How the rows are ordered.
 *
 * `RANK` is the default because most important is at the top everywhere in this
 * app, and a comparison is not an exception to that. `GAP` answers the other
 * question — where the two of you are furthest apart — which is the reason
 * somebody opened a comparison rather than a ranking.
 */
export const COMPARE_ORDERS = {
  RANK: 'rank',
  GAP: 'gap',
};

/** One side's answer for one value, or null where that side never gave one. */
const importanceReading = (row) => (row ? {
  score: row.score,
  normalized: row.normalized,
  fraction: scoreFraction(row.normalized),
} : null);

const alignmentReading = (score) => (isValidAlignmentScore(score) ? {
  score,
  // The ring count IS the 0..1 reading here — see `alignmentFraction`, and the
  // note in utils/alignment.js about why the wheel has no normalised column of
  // its own to read instead.
  normalized: alignmentFraction(score),
  fraction: alignmentFraction(score),
} : null);

const byRank = (a, b) => (
  b.top - a.top
  // A wider disagreement first among values you both put in the same place: the
  // top of this list is where the comparison is most worth reading.
  || (b.gap ?? -1) - (a.gap ?? -1)
  || a.seq - b.seq
);

const byGap = (a, b) => {
  // A value only one of you rated has no gap at all — not a gap of zero, and not
  // the widest one either. It sorts below everything that can actually be
  // compared, rather than being given a number it does not have.
  if ((a.gap === null) !== (b.gap === null)) return a.gap === null ? 1 : -1;
  return (b.gap ?? 0) - (a.gap ?? 0) || b.top - a.top || a.seq - b.seq;
};

/**
 * The reader's ranking and a shared one as one list of rows.
 *
 * @param {object} options
 * @param {Array} options.mine rows from `getRankedResults`, strongest first.
 * @param {Array} options.theirs rows from `sharedResultItems`, strongest first.
 * @param {Map<string, number>} [options.myAlignment] the reader's own check-in,
 *   keyed by value id. Only read for the alignment metric.
 * @param {string} [options.metric] which list to compare.
 * @param {string} [options.order] how to sort what comes back.
 * @returns {Array} rows of `{ key, isCustom, customName, mine, theirs, gap, top }`,
 *   where `gap` is null unless both sides answered and `top` is the stronger of
 *   the two readings — what "most important first" means when the two of you
 *   disagree about which value that is.
 */
export function compareValues({
  mine = [],
  theirs = [],
  myAlignment = null,
  metric = COMPARE_METRICS.IMPORTANCE,
  order = COMPARE_ORDERS.RANK,
} = {}) {
  const byKey = new Map();

  /**
   * The row a value belongs in, created on first sight.
   *
   * Identity is whoever names it first, and `mine` is walked first on purpose:
   * this build's own catalogue is the better authority on whether a key is a
   * card or a stranger's uuid, and it is this reader's language the name will be
   * printed in.
   */
  const slot = (row) => {
    const existing = byKey.get(row.key);
    if (existing) return existing;

    const created = {
      key: row.key,
      isCustom: !!row.isCustom,
      customName: row.customName ?? null,
      mine: null,
      theirs: null,
      // Insertion order, kept as the last tiebreak so two rows that agree on
      // everything else still come out in a stable, meaningful order: mine in
      // ranked order, then whatever only they rated.
      seq: byKey.size,
    };
    byKey.set(row.key, created);
    return created;
  };

  const isAlignment = metric === COMPARE_METRICS.ALIGNMENT;

  for (const row of mine) {
    slot(row).mine = isAlignment
      ? alignmentReading(myAlignment?.get(row.valueId))
      : importanceReading(row);
  }

  for (const row of theirs) {
    slot(row).theirs = isAlignment ? alignmentReading(row.alignment) : importanceReading(row);
  }

  const rows = [...byKey.values()]
    // On the alignment metric most values have no reading on either side — the
    // wheel only ever asks about the top band — and a list of empty bars is not
    // a comparison of anything.
    .filter((row) => row.mine || row.theirs)
    .map((row) => ({
      ...row,
      gap: row.mine && row.theirs ? Math.abs(row.mine.normalized - row.theirs.normalized) : null,
      top: Math.max(row.mine?.normalized ?? 0, row.theirs?.normalized ?? 0),
    }));

  return rows.sort(order === COMPARE_ORDERS.GAP ? byGap : byRank);
}

/** Whether a reading sits in the top priority band — the wheel's own rule. */
const isTop = (reading) => !!reading && priorityBand(reading.normalized).id === 'core';

/**
 * What the rows add up to, as the sentences above the list.
 *
 * `closeness` is the mean gap turned the right way round and expressed as a
 * percentage, over the values you BOTH answered. It is deliberately not computed
 * over everything: a value only one of you rated says nothing about how alike two
 * answers are, and folding it in would let a longer list read as disagreement.
 */
export function comparisonSummary(rows = []) {
  const shared = rows.filter((row) => row.mine && row.theirs);
  const gapSum = shared.reduce((total, row) => total + row.gap, 0);

  return {
    total: rows.length,
    shared: shared.length,
    onlyMine: rows.filter((row) => row.mine && !row.theirs).length,
    onlyTheirs: rows.filter((row) => !row.mine && row.theirs).length,
    bothTop: shared.filter((row) => isTop(row.mine) && isTop(row.theirs)).length,
    closeness: shared.length ? Math.round((1 - gapSum / shared.length) * 100) : null,
  };
}
