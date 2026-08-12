import {
  localDateKey,
  parseDateKey,
  isToday,
  daysBetween,
  formatDateKey,
  formatDateKeyShort,
} from '../../app/utils/dateUtils';

describe('dateUtils', () => {
  describe('localDateKey', () => {
    it('formats a date as YYYY-MM-DD with zero padding', () => {
      expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('uses local calendar parts, not UTC', () => {
      // 23:30 local on the 12th is already the 13th in UTC for anywhere east of
      // Greenwich. Keying off UTC would make a late-evening recalibration
      // overwrite the wrong day's record.
      const lateEvening = new Date(2026, 7, 12, 23, 30, 0);
      expect(localDateKey(lateEvening)).toBe('2026-08-12');
      expect(localDateKey(lateEvening).slice(0, 10))
        .toBe(`${lateEvening.getFullYear()}-08-12`);
    });

    it('defaults to now', () => {
      expect(localDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseDateKey', () => {
    it('round-trips with localDateKey', () => {
      const key = '2026-03-09';
      expect(localDateKey(parseDateKey(key))).toBe(key);
    });

    it('parses to local midnight', () => {
      const parsed = parseDateKey('2026-03-09');
      expect(parsed.getHours()).toBe(0);
      expect(parsed.getMonth()).toBe(2);
      expect(parsed.getDate()).toBe(9);
    });
  });

  it('isToday only matches the current local day', () => {
    expect(isToday(localDateKey())).toBe(true);
    expect(isToday('1999-01-01')).toBe(false);
  });

  describe('daysBetween', () => {
    it('counts whole days forwards and backwards', () => {
      expect(daysBetween('2026-01-01', '2026-01-02')).toBe(1);
      expect(daysBetween('2026-01-02', '2026-01-01')).toBe(-1);
      expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
      expect(daysBetween('2026-01-01', '2026-02-01')).toBe(31);
    });

    it('is unaffected by a daylight-saving transition', () => {
      // Across a DST boundary the elapsed milliseconds are 23h or 25h, not 24h;
      // rounding is what keeps the answer a whole number of calendar days.
      expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
      expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    });
  });

  describe('formatting', () => {
    it('renders a readable date in both languages', () => {
      expect(formatDateKey('2026-08-12', 'en')).toMatch(/2026/);
      expect(formatDateKey('2026-08-12', 'ru')).toMatch(/2026/);
      expect(formatDateKeyShort('2026-08-12', 'en')).not.toMatch(/2026/);
    });

    it('falls back to the raw key rather than throwing', () => {
      expect(typeof formatDateKey('2026-08-12', 'zz')).toBe('string');
    });
  });
});
