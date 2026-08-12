/**
 * A copy of `app_metadata` kept in the browser's `localStorage`.
 *
 * The database is the store of record on every platform. On web it lives in the
 * origin-private file system, which a browser can decline to provide — a private
 * window, a blocked worker, storage the user cleared — and `db.js` then falls
 * back to an in-memory database so the app still runs. Everything works until the
 * tab is reloaded.
 *
 * The preferences are what make that reload hurt. Losing a few ratings is a
 * disappointment; losing the language, the scale and the onboarding flag puts a
 * returning reader back at the language picker and then through all 47 cards
 * again, every single time. So the preference table — and only it: a handful of
 * short strings, nothing a chart reads — is mirrored here, into the one web store
 * that keeps working when OPFS does not.
 *
 * The mirror is written beside every preference write (`PreferencesDB`) and
 * folded back into the database when it opens (`restoreMirroredPreferences` in
 * `db.js`). Where both have a key, the database wins: this fills gaps, it does
 * not override.
 *
 * `localStorage` is asked for by capability rather than by platform, the way
 * `fileTransfer.js` asks for a file dialog. React Native has no `localStorage` at
 * all, so the predicate is already false there; and on web the property can exist
 * and still be unusable — Safari's private mode throws from the setter rather
 * than from the getter — so the only honest probe is a write.
 */

/** Namespaced so a `clear()` here cannot touch anything else on the origin. */
const KEY_PREFIX = 'values.pref.';

const PROBE_KEY = `${KEY_PREFIX}__probe__`;

// undefined = not probed yet, null = unavailable. Probed once: the answer cannot
// change within a session, and every preference write asks.
let probed;

function storage() {
  if (probed !== undefined) return probed;
  probed = null;
  try {
    const candidate = globalThis.localStorage;
    if (candidate) {
      candidate.setItem(PROBE_KEY, '1');
      candidate.removeItem(PROBE_KEY);
      probed = candidate;
    }
  } catch (error) {
    console.warn('[preferenceMirror] localStorage is unavailable:', error);
  }
  return probed;
}

/** Whether preferences can be kept outside the database on this platform. */
export function canMirrorPreferences() {
  return storage() !== null;
}

/** The mirrored value for a preference key, or null. */
export function readMirroredPreference(key) {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(KEY_PREFIX + key);
  } catch (error) {
    console.warn('[preferenceMirror] Could not read:', key, error);
    return null;
  }
}

/** Every mirrored preference, keyed as `app_metadata` keys them. */
export function readAllMirroredPreferences() {
  const store = storage();
  if (!store) return {};
  const mirrored = {};
  try {
    for (let index = 0; index < store.length; index++) {
      const storedKey = store.key(index);
      if (!storedKey || !storedKey.startsWith(KEY_PREFIX) || storedKey === PROBE_KEY) continue;
      const value = store.getItem(storedKey);
      if (value !== null) mirrored[storedKey.slice(KEY_PREFIX.length)] = value;
    }
  } catch (error) {
    console.warn('[preferenceMirror] Could not read the mirror:', error);
  }
  return mirrored;
}

/**
 * Mirror one preference.
 *
 * Never throws. A full or disabled store is a degraded mirror, not a failed
 * preference — the database write is the one that matters, and reporting this
 * one upward would turn "the browser is out of quota" into "changing the
 * language failed".
 */
export function writeMirroredPreference(key, value) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY_PREFIX + key, String(value));
  } catch (error) {
    console.warn('[preferenceMirror] Could not write:', key, error);
  }
}

/** Drop one preference from the mirror. */
export function deleteMirroredPreference(key) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY_PREFIX + key);
  } catch (error) {
    console.warn('[preferenceMirror] Could not delete:', key, error);
  }
}

/**
 * Drop every mirrored preference.
 *
 * Called by `resetDatabase()`. Without it a reset would clear `app_metadata` and
 * then have the mirror hand the language and the onboarding flag straight back on
 * the next open, which is the opposite of what the user asked for.
 */
export function clearMirroredPreferences() {
  const store = storage();
  if (!store) return;
  try {
    const keys = [];
    for (let index = 0; index < store.length; index++) {
      const storedKey = store.key(index);
      if (storedKey && storedKey.startsWith(KEY_PREFIX)) keys.push(storedKey);
    }
    for (const storedKey of keys) store.removeItem(storedKey);
  } catch (error) {
    console.warn('[preferenceMirror] Could not clear the mirror:', error);
  }
}

/** Test seam: forget the probed store so the next call re-detects it. */
export function __resetPreferenceMirrorForTests() {
  probed = undefined;
}
