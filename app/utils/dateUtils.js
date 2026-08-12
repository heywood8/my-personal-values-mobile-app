/**
 * Date handling for the "same day overwrites, another day is a new record" rule.
 *
 * The rule is about the user's calendar day, so the key is built from LOCAL date
 * parts. `toISOString().slice(0, 10)` would be the UTC day, which is a different
 * day for a good part of the world for a good part of every day: someone in UTC+3
 * recalibrating at 01:00 would land on yesterday's record and overwrite it.
 */

/** Local calendar date as 'YYYY-MM-DD'. */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse a 'YYYY-MM-DD' key back into a local Date at midnight. */
export function parseDateKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function isToday(key) {
  return key === localDateKey();
}

/** Whole days between two date keys — positive when `later` is after `earlier`. */
export function daysBetween(earlier, later) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = parseDateKey(earlier).getTime();
  const b = parseDateKey(later).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * A date key rendered for display. Locale-aware via Intl where the runtime has
 * it; the ISO key is a legible fallback rather than a crash.
 */
export function formatDateKey(key, language = 'en') {
  const date = parseDateKey(key);
  try {
    return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return key;
  }
}

/** Short axis label for the history chart — day and month, no year. */
export function formatDateKeyShort(key, language = 'en') {
  const date = parseDateKey(key);
  try {
    return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return key.slice(5);
  }
}
