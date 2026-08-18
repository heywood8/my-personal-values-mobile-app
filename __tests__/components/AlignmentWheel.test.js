import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AlignmentWheel from '../../app/components/charts/AlignmentWheel';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { ALIGNMENT_RINGS } from '../../app/utils/alignment';

/**
 * Structure only, on purpose.
 *
 * The maths is asserted as numbers in __tests__/utils/wheelGeometry.test.js,
 * because that is the half a render test cannot see: under jest an SVG element
 * takes a negative radius and a `d` full of NaN without complaint, and colours
 * arrive as processed integers rather than the hex the palette handed over. What
 * this file is for is the wiring — that a scored value gets a sector and an
 * unscored one does not, that the grid is there to count against, and that the
 * previous check-in is drawn only when there is one.
 */

const sector = (key, sectorNumber, score) => ({
  valueId: key, key, sector: sectorNumber, score,
});

const mount = async (props) => render(
  <AlignmentWheel {...props} />,
  { wrapper: ThemeOnlyProviders },
);

describe('AlignmentWheel', () => {
  it('draws a sector for every value that has been scored', async () => {
    await mount({
      sectors: [sector('love', 1, 8), sector('health', 2, 3), sector('order', 3, 10)],
    });

    expect(screen.getByTestId('alignment-sector-love')).toBeTruthy();
    expect(screen.getByTestId('alignment-sector-health')).toBeTruthy();
    expect(screen.getByTestId('alignment-sector-order')).toBeTruthy();
  });

  it('leaves an unanswered sector blank rather than drawing it at the centre', async () => {
    // The centre is a position with a meaning of its own — "my behaviour does
    // not correspond to this value" — so an unanswered sector must not be drawn
    // in ink at all, or every day before the reader checks in is a picture of
    // total failure.
    await mount({ sectors: [sector('love', 1, 8), sector('health', 2, undefined)] });

    expect(screen.getByTestId('alignment-sector-love')).toBeTruthy();
    expect(screen.queryByTestId('alignment-sector-health')).toBeNull();
  });

  it('draws the ten rings a score is counted against', async () => {
    await mount({ sectors: [sector('love', 1, 8)] });

    expect(screen.getAllByTestId(/^alignment-ring-/)).toHaveLength(ALIGNMENT_RINGS);
  });

  it('renders without measurement, which is all a render test ever gets', async () => {
    // `onLayout` never fires under RNTL. A component gated on it draws nothing
    // here and nothing on the first web paint either.
    await mount({ sectors: [sector('love', 1, 8)] });

    expect(screen.getByTestId('alignment-wheel-svg')).toBeTruthy();
  });

  it('draws a single value as a full circle', async () => {
    // A one-sector wedge spans the whole turn, and SVG draws no arc between two
    // identical points — the wheel would be an empty disc.
    await mount({ sectors: [sector('love', 1, 7)] });

    const only = screen.getByTestId('alignment-sector-love');
    expect(only.props.r).toBeGreaterThan(0);
    expect(only.props.d).toBeUndefined();
  });

  it('draws no previous check-in when there is none', async () => {
    await mount({ sectors: [sector('love', 1, 8), sector('health', 2, 3)] });

    expect(screen.queryByTestId('alignment-previous-outline')).toBeNull();
  });

  it('draws the previous check-in behind the current fill', async () => {
    await mount({
      sectors: [sector('love', 1, 8), sector('health', 2, 3)],
      previousScores: new Map([['love', 4], ['health', 9]]),
    });

    // Every sector answered last time, so the outline closes into a ring.
    expect(screen.getByTestId('alignment-previous-outline').props.d.endsWith('Z')).toBe(true);
  });

  it('skips a value the previous check-in never scored', async () => {
    // Two check-ins routinely cover different value sets, so the outline is
    // matched on value id and breaks where the earlier record said nothing.
    await mount({
      sectors: [sector('love', 1, 8), sector('health', 2, 3), sector('order', 3, 5)],
      previousScores: new Map([['love', 4]]),
    });

    const outline = screen.getByTestId('alignment-previous-outline');
    expect(outline.props.d).toContain('M ');
    expect(outline.props.d.endsWith('Z')).toBe(false);
  });

  it('draws nothing at all when no value is on the wheel', async () => {
    await mount({ sectors: [] });
    expect(screen.queryByTestId('alignment-wheel')).toBeNull();
  });

  it('carries a summary for a reader who cannot see it', async () => {
    await mount({
      sectors: [sector('love', 1, 8)],
      accessibilityLabel: 'Alignment wheel, filled in: 1 of 1',
    });

    const wheel = screen.getByTestId('alignment-wheel');
    expect(wheel.props.accessible).toBe(true);
    expect(wheel.props.accessibilityLabel).toBe('Alignment wheel, filled in: 1 of 1');
  });
});
