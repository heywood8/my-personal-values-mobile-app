import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ComparisonBars from '../../app/components/charts/ComparisonBars';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { COMPARE_METRICS, compareValues } from '../../app/utils/comparison';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import en from '../../assets/i18n/en.json';

/**
 * Two answers to one question, drawn as two bars.
 *
 * What is asserted is the reading, not the pixels: whose bar is whose, that a
 * side which never answered draws nothing rather than an empty-looking zero, and
 * that a score is printed in the words of the scale it was given on — the two
 * sides need not have used the same one.
 */

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

const mineRow = (key, score, scale = SCALE_IDS.NUMERIC_5) => ({
  valueId: key,
  key,
  isCustom: false,
  customName: null,
  score,
  normalized: normalizeScore(score, scale),
});

const theirRow = (key, score, scale = SCALE_IDS.NUMERIC_10, alignment = null) => ({
  ...mineRow(key, score, scale),
  alignment,
});

const SIDES = [
  { id: 'mine', label: en.compare_you, slot: 0, scaleId: SCALE_IDS.NUMERIC_5 },
  { id: 'theirs', label: en.compare_them, slot: 1, scaleId: SCALE_IDS.NUMERIC_10 },
];

const mount = async (rows, props = {}) => {
  await render(
    <ComparisonBars
      rows={rows}
      sides={SIDES}
      metric={COMPARE_METRICS.IMPORTANCE}
      {...props}
    />,
    { wrapper: ThemeOnlyProviders },
  );
};

describe('ComparisonBars', () => {
  it('draws one row per value, with a bar for each side that answered', async () => {
    await mount(compareValues({
      mine: [mineRow('love', 5)],
      theirs: [theirRow('love', 7)],
    }));

    expect(screen.getByTestId('compare-row-love')).toBeTruthy();
    expect(screen.getByTestId('compare-fill-love-mine')).toBeTruthy();
    expect(screen.getByTestId('compare-fill-love-theirs')).toBeTruthy();
  });

  it('prints each score in the words of the scale it was given on', async () => {
    await mount(compareValues({
      mine: [mineRow('love', 3, SCALE_IDS.QUALITATIVE)],
      theirs: [theirRow('love', 7)],
    }), {
      sides: [
        { ...SIDES[0], scaleId: SCALE_IDS.QUALITATIVE },
        SIDES[1],
      ],
    });

    // A 3 on the three-word scale is not a 3 out of 10, and neither side is
    // restated in the other's units.
    expect(screen.getByText(en.scale_qual_high)).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('draws nothing at all for a side that never answered', async () => {
    await mount(compareValues({
      mine: [mineRow('love', 5)],
      theirs: [],
    }));

    expect(screen.getByTestId('compare-fill-love-mine')).toBeTruthy();
    // Not a zero-length bar: on this chart that would read as "worth nothing to
    // them" rather than as "they never said".
    expect(screen.queryByTestId('compare-fill-love-theirs')).toBeNull();
  });

  it('says the missing answer out loud, since a blank track cannot', async () => {
    await mount(compareValues({
      mine: [mineRow('love', 5)],
      theirs: [],
    }));

    expect(screen.getByLabelText(`Love. ${en.compare_you}: 5, ${en.compare_them}: ${en.compare_missing}`))
      .toBeTruthy();
  });

  it('prints a wheel score out of ten, whatever importance scale is in use', async () => {
    await mount(
      compareValues({
        mine: [mineRow('love', 5)],
        theirs: [theirRow('love', 7, SCALE_IDS.NUMERIC_10, 4)],
        myAlignment: new Map([['love', 9]]),
        metric: COMPARE_METRICS.ALIGNMENT,
      }),
      { metric: COMPARE_METRICS.ALIGNMENT },
    );

    expect(screen.getByText('9/10')).toBeTruthy();
    expect(screen.getByText('4/10')).toBeTruthy();
  });

  it('names one side only where only one is being drawn', async () => {
    await mount(
      compareValues({
        theirs: [theirRow('love', 7, SCALE_IDS.NUMERIC_10, 4)],
        metric: COMPARE_METRICS.ALIGNMENT,
      }),
      {
        metric: COMPARE_METRICS.ALIGNMENT,
        sides: [SIDES[1]],
      },
    );

    expect(screen.getByTestId('compare-fill-love-theirs')).toBeTruthy();
    // With nobody to tell them apart from, the "You / Them" column would be a
    // word repeated down the page.
    expect(screen.queryByTestId('comparison-who-sizer')).toBeNull();
  });
});
