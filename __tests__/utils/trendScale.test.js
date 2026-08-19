import { timeAxis } from '../../app/utils/trendScale';

/**
 * The axis the overlay chart and every sparkline on the grid share. Its whole
 * job is that a gap in time is drawn as a gap.
 */
describe('timeAxis', () => {
  it('places dates in proportion to the time between them', () => {
    // Three runs a day apart, then one three months later. Evenly spaced slots
    // would draw a steady drift that never happened.
    const axis = timeAxis(['2026-01-01', '2026-01-02', '2026-01-03', '2026-04-01']);

    expect(axis('2026-01-01')).toBe(0);
    expect(axis('2026-04-01')).toBe(1);
    // Two days into a ninety-day span sits near the left edge, not a third in.
    expect(axis('2026-01-03')).toBeCloseTo(2 / 90, 2);
  });

  it('pins a single date to the middle rather than dividing by zero', () => {
    expect(timeAxis(['2026-01-01'])('2026-01-01')).toBe(0.5);
    expect(timeAxis([])('2026-01-01')).toBe(0.5);
  });

  it('clamps a date outside the listed span onto the edge', () => {
    const axis = timeAxis(['2026-01-01', '2026-01-31']);
    expect(axis('2025-12-01')).toBe(0);
    expect(axis('2026-03-01')).toBe(1);
  });
});
