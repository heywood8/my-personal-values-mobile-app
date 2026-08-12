import {
  SCALE_IDS,
  SCALES,
  SCALE_ORDER,
  DEFAULT_SCALE,
  getScale,
  isValidScaleId,
  isValidScore,
  normalizeScore,
  denormalizeScore,
  scaleStepLabel,
  priorityBand,
  PRIORITY_BANDS,
} from '../../app/utils/scales';

const t = (key) => key;

describe('scales', () => {
  it('declares every scale listed in SCALE_ORDER', () => {
    expect(SCALE_ORDER).toHaveLength(3);
    SCALE_ORDER.forEach((id) => expect(SCALES[id]).toBeDefined());
    expect(isValidScaleId(DEFAULT_SCALE)).toBe(true);
  });

  it('falls back to the default scale for an unknown id', () => {
    expect(getScale('nonsense')).toBe(SCALES[DEFAULT_SCALE]);
    expect(isValidScaleId('nonsense')).toBe(false);
  });

  describe('normalizeScore', () => {
    it('maps each scale onto the full 0..1 range', () => {
      expect(normalizeScore(1, SCALE_IDS.NUMERIC_5)).toBe(0);
      expect(normalizeScore(5, SCALE_IDS.NUMERIC_5)).toBe(1);
      expect(normalizeScore(1, SCALE_IDS.NUMERIC_10)).toBe(0);
      expect(normalizeScore(10, SCALE_IDS.NUMERIC_10)).toBe(1);
      expect(normalizeScore(1, SCALE_IDS.QUALITATIVE)).toBe(0);
      expect(normalizeScore(3, SCALE_IDS.QUALITATIVE)).toBe(1);
    });

    it('puts equivalent positions on different scales at the same value', () => {
      // The whole point of storing `normalized`: 3-of-5 and 5.5-of-10 are the
      // same statement, and a history spanning a scale change must plot them so.
      expect(normalizeScore(3, SCALE_IDS.NUMERIC_5)).toBe(0.5);
      expect(normalizeScore(2, SCALE_IDS.QUALITATIVE)).toBe(0.5);
    });

    it('clamps a score from outside the scale rather than extrapolating', () => {
      expect(normalizeScore(99, SCALE_IDS.NUMERIC_5)).toBe(1);
      expect(normalizeScore(-4, SCALE_IDS.NUMERIC_5)).toBe(0);
    });
  });

  describe('denormalizeScore', () => {
    it('round-trips within a scale', () => {
      for (const step of SCALES[SCALE_IDS.NUMERIC_10].steps) {
        const normalized = normalizeScore(step, SCALE_IDS.NUMERIC_10);
        expect(denormalizeScore(normalized, SCALE_IDS.NUMERIC_10)).toBe(step);
      }
    });

    it('converts a position across scales', () => {
      const half = normalizeScore(3, SCALE_IDS.NUMERIC_5);
      // Midway on 1..10 is 5.5, which has no step; rounding up is the documented
      // tie-break and is why saveRating recomputes `normalized` from the rounded
      // score rather than carrying the original across.
      expect(denormalizeScore(half, SCALE_IDS.NUMERIC_10)).toBe(6);
      expect(denormalizeScore(half, SCALE_IDS.QUALITATIVE)).toBe(2);
    });

    it('clamps a normalized value from outside 0..1', () => {
      expect(denormalizeScore(4, SCALE_IDS.NUMERIC_5)).toBe(5);
      expect(denormalizeScore(-1, SCALE_IDS.NUMERIC_5)).toBe(1);
    });
  });

  describe('isValidScore', () => {
    it('accepts only integer steps inside the scale', () => {
      expect(isValidScore(1, SCALE_IDS.NUMERIC_5)).toBe(true);
      expect(isValidScore(5, SCALE_IDS.NUMERIC_5)).toBe(true);
      expect(isValidScore(0, SCALE_IDS.NUMERIC_5)).toBe(false);
      expect(isValidScore(6, SCALE_IDS.NUMERIC_5)).toBe(false);
      expect(isValidScore(2.5, SCALE_IDS.NUMERIC_5)).toBe(false);
      expect(isValidScore(4, SCALE_IDS.QUALITATIVE)).toBe(false);
    });
  });

  describe('scaleStepLabel', () => {
    it('prints the number for numeric scales', () => {
      expect(scaleStepLabel(SCALE_IDS.NUMERIC_5, 4, t)).toBe('4');
      expect(scaleStepLabel(SCALE_IDS.NUMERIC_10, 10, t)).toBe('10');
    });

    it('prints a translated word for the qualitative scale', () => {
      expect(scaleStepLabel(SCALE_IDS.QUALITATIVE, 1, t)).toBe('scale_qual_low');
      expect(scaleStepLabel(SCALE_IDS.QUALITATIVE, 3, t)).toBe('scale_qual_high');
    });
  });

  describe('priorityBand', () => {
    it('assigns bands from the normalized score', () => {
      expect(priorityBand(1).id).toBe('core');
      expect(priorityBand(0.8).id).toBe('core');
      expect(priorityBand(0.6).id).toBe('important');
      expect(priorityBand(0.3).id).toBe('secondary');
      expect(priorityBand(0).id).toBe('peripheral');
    });

    it('covers the whole range with no gaps', () => {
      for (let n = 0; n <= 1.0001; n += 0.05) {
        expect(priorityBand(Math.min(n, 1))).toBeDefined();
      }
      expect(PRIORITY_BANDS[PRIORITY_BANDS.length - 1].min).toBe(0);
    });

    it('places every qualitative step in a band', () => {
      // The qualitative scale only produces 0, 0.5 and 1 — `secondary` is
      // legitimately unreachable for it, and the results screen drops empty bands.
      const bands = SCALES[SCALE_IDS.QUALITATIVE].steps
        .map((step) => priorityBand(normalizeScore(step, SCALE_IDS.QUALITATIVE)).id);
      expect(bands).toEqual(['peripheral', 'important', 'core']);
    });
  });
});
