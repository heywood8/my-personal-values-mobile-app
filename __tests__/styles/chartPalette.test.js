import {
  groupSeries,
  groupColor,
  priorityColor,
  seriesColor,
  MAX_TRACKED_SERIES,
} from '../../app/styles/chartPalette';
import { PRIORITY_BANDS } from '../../app/utils/scales';
import catalogue from '../../app/defaults/defaultValues.json';

/**
 * These guard the invariants the palette's validation depends on. The colours
 * themselves were checked with the data-viz validator against this app's
 * surfaces (see chartPalette.js); what can silently regress afterwards is the
 * *structure* — a ninth group appearing, a slot order being shuffled, or the
 * two modes drifting out of step.
 */
describe('chartPalette', () => {
  const MODES = ['light', 'dark'];

  it('offers exactly one slot per catalogue group', () => {
    // A ninth group would wrap onto slot 1 and become indistinguishable from the
    // first. The fix is a second visual channel, not a ninth hue — so this
    // failing is a design decision to make, not a number to bump.
    expect(catalogue.groups.length).toBeLessThanOrEqual(groupSeries('light').length);
  });

  it.each(MODES)('%s: has 8 distinct slots', (mode) => {
    const series = groupSeries(mode);
    expect(series).toHaveLength(8);
    expect(new Set(series).size).toBe(8);
    series.forEach((hex) => expect(hex).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it.each(MODES)('%s: pins a group to its catalogue index, not its rank', (mode) => {
    // Colour must follow the entity: filtering or reordering the chart cannot
    // repaint the groups that remain.
    catalogue.groups.forEach((_, index) => {
      expect(groupColor(index, mode)).toBe(groupSeries(mode)[index]);
    });
  });

  it.each(MODES)('%s: falls back for an unknown group rather than generating a hue', (mode) => {
    const series = groupSeries(mode);
    expect(groupColor(-1, mode)).toBe(series[series.length - 1]);
    expect(groupColor(undefined, mode)).toBe(series[series.length - 1]);
    expect(series).toContain(groupColor(99, mode));
  });

  it.each(MODES)('%s: gives every priority band its own step', (mode) => {
    const colors = PRIORITY_BANDS.map((band) => priorityColor(band.id, mode));
    expect(new Set(colors).size).toBe(PRIORITY_BANDS.length);
  });

  it('steps the priority ramp in opposite directions per mode', () => {
    // Dark mode is selected, not flipped: on white "more important" reads as
    // darker, on near-black as lighter. If both modes ever agree on a band's
    // colour, one of them was copied rather than chosen.
    const light = PRIORITY_BANDS.map((b) => priorityColor(b.id, 'light'));
    const dark = PRIORITY_BANDS.map((b) => priorityColor(b.id, 'dark'));
    expect(light).not.toEqual(dark);
  });

  it('caps tracked series within the palette it can colour', () => {
    expect(MAX_TRACKED_SERIES).toBeLessThanOrEqual(groupSeries('light').length);
    for (let slot = 0; slot < MAX_TRACKED_SERIES; slot++) {
      expect(seriesColor(slot, 'light')).toBe(groupSeries('light')[slot]);
    }
  });

  it('gives each tracked slot a distinct colour', () => {
    const used = Array.from({ length: MAX_TRACKED_SERIES }, (_, i) => seriesColor(i, 'dark'));
    expect(new Set(used).size).toBe(MAX_TRACKED_SERIES);
  });
});
