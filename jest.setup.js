
// --- Expo SDK 56 "winter" runtime compatibility (Jest 30) ---
// jest-expo's preset eagerly loads `expo/src/winter`, which installs WinterCG
// globals (URL, URLSearchParams, TextDecoder, structuredClone, …) as *lazy*
// getters that require() their implementation on first access. Jest 30's stricter
// `throwIfBetweenTests` guard throws when such a require() fires asynchronously
// after a test's scope has closed, which otherwise crashes suites at import time.
// Force each lazy global to resolve now, during setup (a valid require scope).
for (const name of [
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoderStream',
  'URL',
  'URLSearchParams',
  'DOMException',
  'structuredClone',
  '__ExpoImportMetaRegistry',
  'fetch',
]) {
  try {
    void global[name];
  } catch {
    // intentionally ignored — a global that throws is permanently undefined,
    // which is also fine: no between-tests require can fire afterwards.
  }
}

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Tells React it is running under a test renderer, so state updates from resolved
// promises are flushed through act() instead of warning and landing a render
// late. Without it, a provider that reads a preference on mount can settle after
// the assertion that was waiting for it.
global.IS_REACT_ACT_ENVIRONMENT = true;

// React Native provides these; the jest-expo environment does not.
if (typeof global.requestIdleCallback === 'undefined') {
  global.requestIdleCallback = (cb) =>
    setImmediate(() => cb({ didTimeout: false, timeRemaining: () => 50 }));
}
if (typeof global.cancelIdleCallback === 'undefined') {
  global.cancelIdleCallback = (id) => clearImmediate(id);
}

/**
 * expo-sqlite, backed by real SQLite.
 *
 * Node 22 ships `node:sqlite`, so the mock can be a thin async adapter over an
 * actual database rather than a pile of hand-written stubs. That matters more
 * here than usual: the app's central rule — one record per calendar day, same
 * day overwrites — is enforced by a UNIQUE constraint, and its history survives
 * a deleted calibration because of ON DELETE CASCADE. A stub that returns
 * canned rows would assert that the *test's* idea of those rules holds, not
 * SQLite's. The migrations are also run for real, so a broken generated
 * migration fails the suite instead of shipping.
 *
 * Only the async API is implemented, matching app/services/db.js — which is
 * async-only so the web build works (see the note there). A sync call added by
 * mistake fails loudly here rather than silently only in a browser.
 */
jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');

  const wrap = (db) => ({
    execAsync: async (sql) => { db.exec(sql); },

    runAsync: async (sql, params = []) => {
      const result = db.prepare(sql).run(...params);
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowId: Number(result.lastInsertRowid ?? 0),
      };
    },

    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params).map((row) => ({ ...row })),

    getFirstAsync: async (sql, params = []) => {
      const row = db.prepare(sql).get(...params);
      return row === undefined ? null : { ...row };
    },

    withTransactionAsync: async (work) => {
      db.exec('BEGIN');
      try {
        await work();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    closeAsync: async () => { db.close(); },
  });

  return {
    // Every open is its own in-memory database, so a test that calls
    // __resetDatabaseHandleForTests() starts from a genuinely empty schema.
    openDatabaseAsync: jest.fn(async () => wrap(new DatabaseSync(':memory:'))),
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

// Sequential rather than random: a failing assertion that prints an id is much
// easier to trace, and nothing in the app depends on ids being unguessable.
jest.mock('react-native-uuid', () => {
  let counter = 0;
  return {
    __esModule: true,
    default: {
      v4: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    },
  };
});

// Every suite opens a fresh database and so replays the migrations, which log a
// line each. Useful in the app, pure noise across a hundred test files — the
// warn and error channels stay untouched so real problems still surface.
const originalLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[db] Applied migration')) return;
  originalLog(...args);
};
