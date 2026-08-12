import {
  PREF_KEYS,
  getPreference,
  setPreference,
  getBooleanPreference,
  setBooleanPreference,
  getJsonPreference,
  setJsonPreference,
  deletePreference,
  getAllPreferences,
} from '../../app/services/PreferencesDB';
import { __resetDatabaseHandleForTests, resetDatabase } from '../../app/services/db';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('PreferencesDB', () => {
  it('returns the default for a key that was never set', async () => {
    expect(await getPreference(PREF_KEYS.LANGUAGE)).toBeNull();
    expect(await getPreference(PREF_KEYS.LANGUAGE, 'en')).toBe('en');
  });

  it('round-trips a value', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');
    expect(await getPreference(PREF_KEYS.LANGUAGE)).toBe('ru');
  });

  it('overwrites rather than accumulating', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');
    await setPreference(PREF_KEYS.LANGUAGE, 'en');
    expect(await getPreference(PREF_KEYS.LANGUAGE)).toBe('en');
    expect(Object.keys(await getAllPreferences())).toEqual([PREF_KEYS.LANGUAGE]);
  });

  it('stringifies non-string values on the way in', async () => {
    await setPreference('a_number', 42);
    expect(await getPreference('a_number')).toBe('42');
  });

  describe('booleans', () => {
    it('round-trip', async () => {
      await setBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, true);
      expect(await getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE)).toBe(true);

      await setBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, false);
      expect(await getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE)).toBe(false);
    });

    it('fall back to the default when unset', async () => {
      expect(await getBooleanPreference('never_set', false)).toBe(false);
      expect(await getBooleanPreference('never_set', true)).toBe(true);
    });
  });

  describe('JSON', () => {
    it('round-trips an object', async () => {
      await setJsonPreference('shape', { a: 1, b: ['x'] });
      expect(await getJsonPreference('shape')).toEqual({ a: 1, b: ['x'] });
    });

    it('returns the default rather than throwing on malformed JSON', async () => {
      await setPreference('shape', 'not json{');
      expect(await getJsonPreference('shape', { fallback: true })).toEqual({ fallback: true });
    });
  });

  it('deletes a key', async () => {
    await setPreference(PREF_KEYS.THEME, 'dark');
    await deletePreference(PREF_KEYS.THEME);
    expect(await getPreference(PREF_KEYS.THEME)).toBeNull();
  });

  it('is cleared by a database reset', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');
    await setPreference(PREF_KEYS.THEME, 'dark');

    await resetDatabase();

    // Clearing the language is what sends the app back to the first-run picker.
    expect(await getAllPreferences()).toEqual({});
  });
});
