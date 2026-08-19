import {
  COMPARE_METRICS,
  COMPARE_ORDERS,
  compareValues,
  comparisonSummary,
} from '../../app/utils/comparison';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';

/**
 * Two people's answers, matched up.
 *
 * The interesting cases are all about disagreement of one kind or another: two
 * different scales, a value only one of you rated, two custom values that happen
 * to share a word. What is asserted here is that none of them turns into a
 * comparison the data does not support.
 */

const mineRow = (key, score, scale = SCALE_IDS.NUMERIC_5) => ({
  valueId: key,
  key,
  isCustom: false,
  customName: null,
  score,
  normalized: normalizeScore(score, scale),
});

const theirRow = (key, score, { scale = SCALE_IDS.NUMERIC_5, alignment = null, custom = false } = {}) => ({
  valueId: key,
  key,
  isCustom: custom,
  customName: custom ? key : null,
  score,
  normalized: normalizeScore(score, scale),
  alignment,
});

const keys = (rows) => rows.map((row) => row.key);

describe('comparing two rankings', () => {
  it('matches values on their key and keeps both raw scores', () => {
    const [row] = compareValues({
      mine: [mineRow('love', 5)],
      theirs: [theirRow('love', 3)],
    });

    expect(row.mine.score).toBe(5);
    expect(row.theirs.score).toBe(3);
  });

  it('compares across two different scales, on the one column both measured', () => {
    // A 4 out of 5 and an 8 out of 10 are the same answer given twice; comparing
    // the raw numbers would call the second one twice the first.
    const [row] = compareValues({
      mine: [mineRow('love', 4, SCALE_IDS.NUMERIC_5)],
      theirs: [theirRow('love', 8, { scale: SCALE_IDS.NUMERIC_10 })],
    });

    expect(row.gap).toBeCloseTo(Math.abs(0.75 - 7 / 9), 5);
    expect(row.gap).toBeLessThan(0.05);
    // Each side still prints the number its owner actually chose.
    expect([row.mine.score, row.theirs.score]).toEqual([4, 8]);
  });

  it('leaves a value only one of you rated without a gap at all', () => {
    // Not a gap of zero, and not the widest one either: there is no second
    // answer to be far from.
    const [row] = compareValues({
      mine: [mineRow('love', 5)],
      theirs: [],
    });

    expect(row.gap).toBeNull();
    expect(row.theirs).toBeNull();
  });

  it('never matches two custom values, because neither key means anything abroad', () => {
    // Both people wrote "Sailing"; the keys are uuids minted on two phones, and
    // nothing on either side says those are the same value.
    const rows = compareValues({
      mine: [{ ...mineRow('uuid-mine', 5), isCustom: true, customName: 'Sailing' }],
      theirs: [theirRow('uuid-theirs', 5, { custom: true })],
    });

    expect(rows).toHaveLength(2);
  });

  it('names a value the way this reader’s own catalogue does', () => {
    // The sender called it custom because their build had no card for it. Mine
    // does, and mine is walked first, so the row is not marked as untranslatable.
    const [row] = compareValues({
      mine: [mineRow('love', 5)],
      theirs: [theirRow('love', 4, { custom: true })],
    });

    expect(row.isCustom).toBe(false);
  });
});

describe('the order rows come back in', () => {
  const mine = [mineRow('love', 5), mineRow('health', 3), mineRow('learning', 1)];
  const theirs = [theirRow('learning', 5), theirRow('health', 3), theirRow('love', 1)];

  it('puts the strongest of the two readings at the top by default', () => {
    // Most important is at the top everywhere in this app, and a comparison is
    // not an exception — even where the two of you disagree about which value
    // that is.
    const rows = compareValues({ mine, theirs, order: COMPARE_ORDERS.RANK });

    expect(keys(rows)).toEqual(['love', 'learning', 'health']);
  });

  it('puts the widest disagreement at the top when asked', () => {
    const rows = compareValues({ mine, theirs, order: COMPARE_ORDERS.GAP });

    expect(keys(rows).slice(0, 2).sort()).toEqual(['learning', 'love']);
    expect(keys(rows)[2]).toBe('health');
  });

  it('sorts a value only one of you rated below everything comparable', () => {
    const rows = compareValues({
      mine: [...mine, mineRow('humour', 5)],
      theirs,
      order: COMPARE_ORDERS.GAP,
    });

    expect(keys(rows)[keys(rows).length - 1]).toBe('humour');
  });
});

describe('comparing the wheels', () => {
  it('reads the reader’s scores by value id and the sender’s off the link', () => {
    const rows = compareValues({
      mine: [mineRow('love', 5), mineRow('health', 5)],
      theirs: [theirRow('love', 5, { alignment: 3 }), theirRow('health', 5)],
      myAlignment: new Map([['love', 9]]),
      metric: COMPARE_METRICS.ALIGNMENT,
    });

    const love = rows.find((row) => row.key === 'love');
    expect([love.mine.score, love.theirs.score]).toEqual([9, 3]);
    // A value on both rankings but on neither wheel is not part of this list at
    // all — the wheel only ever asks about the top band, so most values have no
    // reading on either side and a page of empty bars compares nothing.
    expect(keys(rows)).toEqual(['love']);
  });

  it('draws one ring out of ten as a real answer, not as an empty bar', () => {
    // The wheel's own rule: the centre means "my behaviour does not match this
    // value", and an unanswered sector is a different thing entirely.
    const [row] = compareValues({
      mine: [mineRow('love', 5)],
      theirs: [theirRow('love', 5, { alignment: 1 })],
      myAlignment: new Map([['love', 10]]),
      metric: COMPARE_METRICS.ALIGNMENT,
    });

    expect(row.theirs.fraction).toBeCloseTo(0.1, 5);
    expect(row.mine.fraction).toBe(1);
  });

  it('keeps a value only one of you answered, with the other side empty', () => {
    const [row] = compareValues({
      mine: [mineRow('love', 5)],
      theirs: [theirRow('love', 5, { alignment: 6 })],
      metric: COMPARE_METRICS.ALIGNMENT,
    });

    expect(row.mine).toBeNull();
    expect(row.theirs.score).toBe(6);
  });
});

describe('what the comparison adds up to', () => {
  it('counts what you share, what only you have, and what only they have', () => {
    const rows = compareValues({
      mine: [mineRow('love', 5), mineRow('health', 4)],
      theirs: [theirRow('love', 5), theirRow('humour', 2)],
    });

    expect(comparisonSummary(rows)).toEqual(expect.objectContaining({
      total: 3,
      shared: 1,
      onlyMine: 1,
      onlyTheirs: 1,
    }));
  });

  it('reads closeness off the values you both answered, and nothing else', () => {
    // A value only one of you rated says nothing about how alike two answers
    // are; folding it in would let a longer list read as disagreement.
    const rows = compareValues({
      mine: [mineRow('love', 5), mineRow('health', 5)],
      theirs: [theirRow('love', 5)],
    });

    expect(comparisonSummary(rows).closeness).toBe(100);
  });

  it('has no closeness to report when nothing was answered by both', () => {
    const rows = compareValues({ mine: [mineRow('love', 5)], theirs: [] });

    expect(comparisonSummary(rows).closeness).toBeNull();
  });

  it('counts the values you both put at the very top', () => {
    const rows = compareValues({
      mine: [mineRow('love', 5), mineRow('health', 5), mineRow('learning', 1)],
      theirs: [theirRow('love', 5), theirRow('health', 2), theirRow('learning', 1)],
    });

    expect(comparisonSummary(rows).bothTop).toBe(1);
  });
});
