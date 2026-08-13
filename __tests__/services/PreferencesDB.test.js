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
import { __resetDatabaseHandleForTests, resetDatabase, getDatabase } from '../../app/services/db';
import { readAllMirroredPreferences } from '../../app/services/preferenceMirror';
import { useFakeLocalStorage } from '../../test-utils/fakeLocalStorage';

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

    // Clearing the onboarding flag is what sends the app back to a first run.
    expect(await getAllPreferences()).toEqual({});
  });

  /**
   * The web target, where the database can be handed back empty on every reload
   * (see app/services/preferenceMirror.js). `__resetDatabaseHandleForTests()`
   * reproduces that exactly: the expo-sqlite mock opens a brand new in-memory
   * database each time, so what survives is what the mirror kept.
   */
  describe('mirrored into localStorage', () => {
    useFakeLocalStorage();

    it('survives a database that comes back empty', async () => {
      await setPreference(PREF_KEYS.LANGUAGE, 'ru');
      await setPreference(PREF_KEYS.SCALE, 'numeric10');
      await setBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, true);

      __resetDatabaseHandleForTests();

      expect(await getPreference(PREF_KEYS.LANGUAGE)).toBe('ru');
      expect(await getPreference(PREF_KEYS.SCALE)).toBe('numeric10');
      expect(await getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE)).toBe(true);
    });

    it('does not resurrect a preference that was deleted', async () => {
      await setPreference(PREF_KEYS.LANGUAGE, 'ru');
      await deletePreference(PREF_KEYS.LANGUAGE);

      __resetDatabaseHandleForTests();

      expect(await getPreference(PREF_KEYS.LANGUAGE)).toBeNull();
    });

    it('does not resurrect anything after a reset', async () => {
      await setPreference(PREF_KEYS.LANGUAGE, 'ru');
      await setPreference(PREF_KEYS.THEME, 'dark');

      await resetDatabase();
      expect(readAllMirroredPreferences()).toEqual({});

      __resetDatabaseHandleForTests();

      expect(await getAllPreferences()).toEqual({});
    });

    it('loses to the database where both have a key', async () => {
      await setPreference(PREF_KEYS.LANGUAGE, 'ru');

      // The two are written together, so they only diverge if one of the writes
      // failed — and then the database is the one that counts.
      globalThis.localStorage.setItem('values.pref.app_language', 'en');

      expect(await getPreference(PREF_KEYS.LANGUAGE)).toBe('ru');
    });

    it('backs the read up when the database read itself fails', async () => {
      await setPreference(PREF_KEYS.LANGUAGE, 'ru');

      const failing = jest.spyOn(console, 'error').mockImplementation(() => {});
      const db = await getDatabase();
      const original = db.getFirstAsync;
      db.getFirstAsync = async () => { throw new Error('storage went away'); };

      try {
        expect(await getPreference(PREF_KEYS.LANGUAGE)).toBe('ru');
      } finally {
        db.getFirstAsync = original;
        failing.mockRestore();
      }
    });
  });
});
