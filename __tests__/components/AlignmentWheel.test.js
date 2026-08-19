import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
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

  it('lays no hit layer over a wheel nobody is listening to', async () => {
    await mount({ sectors: [sector('love', 1, 8), sector('health', 2, 3)] });
    expect(screen.queryByTestId('alignment-wheel-hit')).toBeNull();
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

/**
 * Pointing at a sector.
 *
 * `onLayout` never fires under RNTL, so the wheel is at its fallback size here —
 * which is exactly what the geometry below is measured against: a 360px canvas,
 * so its centre is at 180 and the hit disc reaches the edge of it. Twelve
 * o'clock is the first sector, and the angles are asserted as numbers in
 * __tests__/utils/wheelGeometry.test.js.
 */
describe('pointing at a sector', () => {
  const CENTRE = 180;
  const TOP = { locationX: CENTRE, locationY: 10 };
  // Two sectors, so the first is the right half of the wheel and the second is
  // the left: nine o'clock is the one nobody has scored.
  const LEFT = { locationX: 10, locationY: CENTRE };
  const CORNER = { locationX: 2, locationY: 2 };

  const mouse = (offsetX, offsetY) => ({ offsetX, offsetY, pointerType: 'mouse' });

  const pointable = async (props) => {
    const onActivate = jest.fn();
    await mount({
      sectors: [sector('love', 1, 8), sector('health', 2, undefined)],
      onActivate,
      ...props,
    });
    return { onActivate, hit: screen.getByTestId('alignment-wheel-hit') };
  };

  it('hands back the value under a tap, which is the phone half of this', async () => {
    const { onActivate, hit } = await pointable();

    await act(async () => { fireEvent.press(hit, { nativeEvent: TOP }); });
    expect(onActivate).toHaveBeenCalledWith('love');
  });

  it('answers for a sector that has never been scored', async () => {
    // There is no shape on the canvas for `health` at all — the hit test is
    // asked of the geometry precisely so a blank sector can still be pointed at.
    const { onActivate, hit } = await pointable();

    await act(async () => { fireEvent.press(hit, { nativeEvent: LEFT }); });
    expect(onActivate).toHaveBeenCalledWith('health');
  });

  it('lets a tap on the marked sector put it back', async () => {
    // A phone has no pointer to move away, so the gesture that marked it is the
    // only one there is to unmark it with.
    const { onActivate, hit } = await pointable({ activeValueId: 'love' });

    await act(async () => { fireEvent.press(hit, { nativeEvent: TOP }); });
    expect(onActivate).toHaveBeenCalledWith(null);
  });

  it('holds a sector a click lands on, because the mouse is still over it', async () => {
    // The pointer marked that sector on its way to the click, and clearing it
    // would blank the panel until the hand twitched and put it back.
    const { onActivate, hit } = await pointable({ activeValueId: 'love' });

    await act(async () => { fireEvent(hit, 'pointerMove', { nativeEvent: mouse(CENTRE, 10) }); });
    await act(async () => { fireEvent.press(hit, { nativeEvent: TOP }); });

    expect(onActivate).toHaveBeenLastCalledWith('love');
  });

  it('points at nothing outside the disc', async () => {
    const { onActivate, hit } = await pointable();

    await act(async () => { fireEvent.press(hit, { nativeEvent: CORNER }); });
    expect(onActivate).toHaveBeenCalledWith(null);
  });

  it('follows a mouse across the wheel, and lets go when it leaves', async () => {
    const { onActivate, hit } = await pointable();

    await act(async () => { fireEvent(hit, 'pointerMove', { nativeEvent: mouse(CENTRE, 10) }); });
    expect(onActivate).toHaveBeenLastCalledWith('love');

    await act(async () => { fireEvent(hit, 'pointerMove', { nativeEvent: mouse(10, CENTRE) }); });
    expect(onActivate).toHaveBeenLastCalledWith('health');

    await act(async () => { fireEvent(hit, 'pointerLeave', { nativeEvent: mouse(0, 0) }); });
    expect(onActivate).toHaveBeenLastCalledWith(null);
  });

  it('ignores the pointer events a touch emits on the web', async () => {
    // A finger on a web page fires pointermove and then pointerleave the instant
    // it lifts — which would wipe the selection the tap had just made.
    const { onActivate, hit } = await pointable();
    const touch = { offsetX: CENTRE, offsetY: 10, pointerType: 'touch' };

    await act(async () => { fireEvent(hit, 'pointerMove', { nativeEvent: touch }); });
    await act(async () => { fireEvent(hit, 'pointerLeave', { nativeEvent: touch }); });

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('marks the sector out to the rim, not out to what has been answered', async () => {
    // Most of a wheel is unanswered on most days, so a mark that only covered
    // the fill would be no mark at all on the sector that most needs one.
    await mount({
      sectors: [sector('love', 1, 8), sector('health', 2, undefined)],
      activeValueId: 'health',
    });

    expect(screen.getByTestId('alignment-sector-highlight')).toBeTruthy();
  });

  it('marks nothing when nothing is being pointed at', async () => {
    await mount({ sectors: [sector('love', 1, 8), sector('health', 2, 3)] });
    expect(screen.queryByTestId('alignment-sector-highlight')).toBeNull();
  });

  it('marks a lone sector as the circle it is drawn as', async () => {
    await mount({ sectors: [sector('love', 1, 7)], activeValueId: 'love' });

    const mark = screen.getByTestId('alignment-sector-highlight');
    expect(mark.props.r).toBeGreaterThan(0);
    expect(mark.props.d).toBeUndefined();
  });

  it('ignores a value that is not on this wheel', async () => {
    // Another record's wheel is drawn from different rows, and a leftover
    // selection must not mark whichever sector happens to sit there now.
    await mount({
      sectors: [sector('love', 1, 8), sector('health', 2, 3)],
      activeValueId: 'order',
    });

    expect(screen.queryByTestId('alignment-sector-highlight')).toBeNull();
  });
});
