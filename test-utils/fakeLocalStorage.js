/**
 * A `localStorage` for tests.
 *
 * The jest environment has none — `globalThis.localStorage` is undefined there,
 * which is also what React Native looks like, so the preference mirror is inert
 * in every suite that does not ask for it. Installing this one is how a test
 * plays the web target.
 *
 * Implemented against the real `Storage` surface (`length`, `key(i)`) rather than
 * as a bare object: that is the API the mirror enumerates with, and a Map-backed
 * fake without it would pass while the browser failed.
 */
export function createFakeLocalStorage({ throwOnWrite = false } = {}) {
  const entries = new Map();

  return {
    get length() {
      return entries.size;
    },
    key(index) {
      return [...entries.keys()][index] ?? null;
    },
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      // Safari's private mode has the whole API and throws from here; so does a
      // store that is out of quota.
      if (throwOnWrite) throw new Error('QuotaExceededError');
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

/**
 * Install a fake `localStorage` for the duration of a test file, and reset both
 * it and the mirror's cached probe between tests.
 *
 * Call at describe scope. Returns a getter for the live store so a test can
 * inspect what was written, or replace it — `install(createFakeLocalStorage({
 * throwOnWrite: true }))` — to play a browser that refuses.
 */
export function useFakeLocalStorage() {
  // Required lazily: importing the mirror at module scope would resolve it
  // before jest has finished wiring the module registry for the suite.
  const { __resetPreferenceMirrorForTests } = require('../app/services/preferenceMirror');
  const original = globalThis.localStorage;

  const install = (store) => {
    globalThis.localStorage = store;
    __resetPreferenceMirrorForTests();
    return store;
  };

  beforeEach(() => {
    install(createFakeLocalStorage());
  });

  afterEach(() => {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
    __resetPreferenceMirrorForTests();
  });

  return {
    get: () => globalThis.localStorage,
    install,
  };
}
