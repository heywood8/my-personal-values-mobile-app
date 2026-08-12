import {
  canMirrorPreferences,
  readMirroredPreference,
  readAllMirroredPreferences,
  writeMirroredPreference,
  deleteMirroredPreference,
  clearMirroredPreferences,
  __resetPreferenceMirrorForTests,
} from '../../app/services/preferenceMirror';
import { createFakeLocalStorage, useFakeLocalStorage } from '../../test-utils/fakeLocalStorage';

describe('preferenceMirror', () => {
  describe('with a working localStorage', () => {
    const storage = useFakeLocalStorage();

    it('reports that it can mirror', () => {
      expect(canMirrorPreferences()).toBe(true);
    });

    it('round-trips a value', () => {
      writeMirroredPreference('app_language', 'ru');
      expect(readMirroredPreference('app_language')).toBe('ru');
    });

    it('returns null for a key it never wrote', () => {
      expect(readMirroredPreference('app_language')).toBeNull();
    });

    it('stringifies on the way in, like the preference table does', () => {
      writeMirroredPreference('a_number', 42);
      expect(readMirroredPreference('a_number')).toBe('42');
    });

    it('namespaces its keys', () => {
      writeMirroredPreference('app_language', 'ru');
      expect(storage.get().getItem('app_language')).toBeNull();
      expect(storage.get().getItem('values.pref.app_language')).toBe('ru');
    });

    it('deletes a single key', () => {
      writeMirroredPreference('app_language', 'ru');
      writeMirroredPreference('theme_preference', 'dark');

      deleteMirroredPreference('app_language');

      expect(readMirroredPreference('app_language')).toBeNull();
      expect(readMirroredPreference('theme_preference')).toBe('dark');
    });

    it('reads every mirrored preference back under its own key', () => {
      writeMirroredPreference('app_language', 'ru');
      writeMirroredPreference('rating_scale', 'numeric10');

      expect(readAllMirroredPreferences()).toEqual({
        app_language: 'ru',
        rating_scale: 'numeric10',
      });
    });

    it('leaves the rest of the origin alone when it clears', () => {
      storage.get().setItem('someone-elses-key', 'keep me');
      writeMirroredPreference('app_language', 'ru');

      clearMirroredPreferences();

      expect(readAllMirroredPreferences()).toEqual({});
      expect(storage.get().getItem('someone-elses-key')).toBe('keep me');
    });

    it('does not report the write probe as a preference', () => {
      expect(canMirrorPreferences()).toBe(true);
      expect(readAllMirroredPreferences()).toEqual({});
    });
  });

  describe('with no localStorage at all — every native platform', () => {
    const original = globalThis.localStorage;

    beforeEach(() => {
      delete globalThis.localStorage;
      __resetPreferenceMirrorForTests();
    });

    afterEach(() => {
      if (original === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = original;
      __resetPreferenceMirrorForTests();
    });

    it('reports that it cannot mirror, and every call is a no-op', () => {
      expect(canMirrorPreferences()).toBe(false);
      expect(() => writeMirroredPreference('app_language', 'ru')).not.toThrow();
      expect(readMirroredPreference('app_language')).toBeNull();
      expect(readAllMirroredPreferences()).toEqual({});
      expect(() => deleteMirroredPreference('app_language')).not.toThrow();
      expect(() => clearMirroredPreferences()).not.toThrow();
    });
  });

  describe('with a localStorage that refuses to write', () => {
    const storage = useFakeLocalStorage();

    beforeEach(() => {
      storage.install(createFakeLocalStorage({ throwOnWrite: true }));
    });

    it('fails the probe rather than the app', () => {
      expect(canMirrorPreferences()).toBe(false);
      expect(() => writeMirroredPreference('app_language', 'ru')).not.toThrow();
      expect(readMirroredPreference('app_language')).toBeNull();
    });
  });
});
