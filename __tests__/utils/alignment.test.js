import {
  ALIGNMENT_MAX,
  ALIGNMENT_MIN,
  ALIGNMENT_RINGS,
  alignmentBand,
  alignmentFraction,
  isValidAlignmentScore,
  isVeryImportant,
  trackedValues,
} from '../../app/utils/alignment';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';

/**
 * The two rules that decide what the wheel is: which values are on it, and how
 * far out a score sits.
 *
 * Membership is the one worth pinning hardest. "Only for those values that are
 * very important" has to mean one thing across three scales that do not share a
 * range, and the way it does that is the normalised score and the top priority
 * band — so the interesting assertions are the boundaries on each scale, not the
 * middle of any of them.
 */

const normalised = (score, scale) => normalizeScore(score, scale);

const ranked = (entries) => entries.map(([key, score, scale, extra = {}]) => ({
  valueId: key,
  key,
  isCustom: false,
  customName: null,
  score,
  normalized: normalised(score, scale),
  ...extra,
}));

describe('the alignment scale', () => {
  it('is ten rings, and only ten', () => {
    expect(ALIGNMENT_RINGS).toBe(10);
    expect([ALIGNMENT_MIN, ALIGNMENT_MAX]).toEqual([1, 10]);
  });

  it('accepts whole scores inside the rings and nothing else', () => {
    expect(isValidAlignmentScore(1)).toBe(true);
    expect(isValidAlignmentScore(10)).toBe(true);
    expect(isValidAlignmentScore(0)).toBe(false);
    expect(isValidAlignmentScore(11)).toBe(false);
    expect(isValidAlignmentScore(7.5)).toBe(false);
    expect(isValidAlignmentScore('7')).toBe(false);
    expect(isValidAlignmentScore(undefined)).toBe(false);
  });

  it('fills as many rings as the score counts', () => {
    // Ring count, not a 0..1 remap. A 1 has to put ink on the wheel, or "barely
    // living this one" and "not answered yet" are the same picture.
    expect(alignmentFraction(1)).toBeCloseTo(0.1);
    expect(alignmentFraction(7)).toBeCloseTo(0.7);
    expect(alignmentFraction(10)).toBe(1);
  });

  it('draws nothing for an answer that was never given', () => {
    expect(alignmentFraction(undefined)).toBe(0);
    expect(alignmentFraction(null)).toBe(0);
    expect(alignmentFraction(0)).toBe(0);
  });

  it('colours a sector by the same fraction it is drawn to', () => {
    // One mapping from score to position, so the colour steps where the fill
    // does rather than a ring away from it.
    expect(alignmentBand(10).id).toBe('core');
    expect(alignmentBand(8).id).toBe('core');
    expect(alignmentBand(6).id).toBe('important');
    expect(alignmentBand(3).id).toBe('secondary');
    expect(alignmentBand(1).id).toBe('peripheral');
  });
});

describe('what counts as very important', () => {
  it('is the top step and nothing else on the qualitative scale', () => {
    const qual = (score) => isVeryImportant(normalised(score, SCALE_IDS.QUALITATIVE));
    expect(qual(3)).toBe(true); // "Very important", in so many words
    expect(qual(2)).toBe(false);
    expect(qual(1)).toBe(false);
  });

  it('is the top two steps on the five-step scale', () => {
    const five = (score) => isVeryImportant(normalised(score, SCALE_IDS.NUMERIC_5));
    expect([five(5), five(4)]).toEqual([true, true]);
    expect(five(3)).toBe(false);
  });

  it('is eight and up on the ten-step scale', () => {
    const ten = (score) => isVeryImportant(normalised(score, SCALE_IDS.NUMERIC_10));
    expect([ten(10), ten(9), ten(8)]).toEqual([true, true, true]);
    expect(ten(7)).toBe(false);
  });
});

describe('trackedValues', () => {
  it('keeps only the top band, in the order the ranking gave', () => {
    const tracked = trackedValues(ranked([
      ['health', 5, SCALE_IDS.NUMERIC_5],
      ['love', 4, SCALE_IDS.NUMERIC_5],
      ['order', 3, SCALE_IDS.NUMERIC_5],
      ['humour', 1, SCALE_IDS.NUMERIC_5],
    ]));

    expect(tracked.map((value) => value.key)).toEqual(['health', 'love']);
  });

  it('numbers the sectors from one, strongest first', () => {
    const tracked = trackedValues(ranked([
      ['health', 5, SCALE_IDS.NUMERIC_5],
      ['love', 4, SCALE_IDS.NUMERIC_5],
    ]));

    expect(tracked.map((value) => value.sector)).toEqual([1, 2]);
  });

  it('leaves out a value the catalogue currently has archived', () => {
    // The results screen shows a record and has to stay complete; this is a
    // question being asked now, and a card the deck no longer deals is not one
    // to ask about. It matters on upgrade too: retireRemovedValues() archives
    // every dropped catalogue entry in bulk, ratings and all.
    const results = ranked([
      ['health', 5, SCALE_IDS.NUMERIC_5],
      ['fame', 5, SCALE_IDS.NUMERIC_5],
    ]);

    expect(trackedValues(results, new Set(['fame'])).map((v) => v.key)).toEqual(['health']);
  });

  it('answers restoring as readily as archiving', () => {
    // The whole reason the archived set is passed in rather than read off the
    // ranking: the ranking is a snapshot re-read when an assessment changes,
    // while archiving and restoring change the catalogue. Reading the snapshot
    // made the rule work in one direction only.
    const results = ranked([
      ['health', 5, SCALE_IDS.NUMERIC_5],
      ['fame', 5, SCALE_IDS.NUMERIC_5],
    ]);

    expect(trackedValues(results, new Set(['fame'])).map((v) => v.key)).toEqual(['health']);
    expect(trackedValues(results, new Set()).map((v) => v.key)).toEqual(['health', 'fame']);
  });

  it('ignores an `archived` flag carried on the ranking itself', () => {
    // If a snapshot ever grows one again, it must not become a second source
    // that disagrees with the catalogue.
    const results = ranked([['fame', 5, SCALE_IDS.NUMERIC_5, { archived: true }]]);

    expect(trackedValues(results, new Set()).map((v) => v.key)).toEqual(['fame']);
  });

  it('is empty rather than guessing when nothing reached the top', () => {
    expect(trackedValues(ranked([['order', 3, SCALE_IDS.NUMERIC_5]]))).toEqual([]);
    expect(trackedValues([])).toEqual([]);
    expect(trackedValues(undefined)).toEqual([]);
  });
});
