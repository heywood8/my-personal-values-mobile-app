import {
  categoricalSeries,
  priorityColor,
  seriesColor,
  MAX_TRACKED_SERIES,
} from '../../app/styles/chartPalette';
import { PRIORITY_BANDS } from '../../app/utils/scales';

/**
 * These guard the invariants the palette's validation depends on. The colours
 * themselves were checked with the data-viz validator against this app's
 * surfaces (see chartPalette.js); what can silently regress afterwards is the
 * *structure* — a slot order being shuffled, a slot being added past the point
 * where hues stay tellable apart, or the two modes drifting out of step.
 */
describe('chartPalette', () => {
  const MODES = ['light', 'dark'];

  it.each(MODES)('%s: has 8 distinct slots', (mode) => {
    const series = categoricalSeries(mode);
    expect(series).toHaveLength(8);
    expect(new Set(series).size).toBe(8);
    series.forEach((hex) => expect(hex).toMatch(/^#[0-9a-f]{6}$/i));
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
    // A sixth line would wrap onto a slot already in use and become
    // indistinguishable from it. The fix is a second visual channel, not a ninth
    // hue — so this failing is a design decision to make, not a number to bump.
    expect(MAX_TRACKED_SERIES).toBeLessThanOrEqual(categoricalSeries('light').length);
    for (let slot = 0; slot < MAX_TRACKED_SERIES; slot++) {
      expect(seriesColor(slot, 'light')).toBe(categoricalSeries('light')[slot]);
    }
  });

  it('holds a slot to its position rather than to a series rank', () => {
    // Colour must follow the entity: deselecting one line cannot repaint the
    // ones that remain, which is why a slot is assigned once and held.
    MODES.forEach((mode) => {
      const series = categoricalSeries(mode);
      series.forEach((hex, index) => expect(seriesColor(index, mode)).toBe(hex));
      // Past the end it wraps rather than inventing a hue.
      expect(series).toContain(seriesColor(series.length + 1, mode));
    });
  });

  it('gives each tracked slot a distinct colour', () => {
    const used = Array.from({ length: MAX_TRACKED_SERIES }, (_, i) => seriesColor(i, 'dark'));
    expect(new Set(used).size).toBe(MAX_TRACKED_SERIES);
  });
});
