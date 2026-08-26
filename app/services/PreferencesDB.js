import { queryFirst, executeQuery, queryAll } from './db';
import {
  readMirroredPreference,
  writeMirroredPreference,
  deleteMirroredPreference,
} from './preferenceMirror';

export const PREF_KEYS = {
  LANGUAGE: 'app_language',
  THEME: 'theme_preference',
  // The user's chosen rating scale, applied to the NEXT assessment. Existing
  // assessments keep the scale they were taken on (see app/db/schema.js).
  SCALE: 'rating_scale',
  // Set once the first calibration completes, and the only step marker there is:
  // nothing precedes the deck, so "has been through onboarding" and "has finished
  // a run" are the same fact. A first run interrupted mid-deck resumes in the
  // deck, because that is where it started.
  ONBOARDING_COMPLETE: 'onboarding_complete',
  // What the reader's backup spreadsheet in Google Drive is called. A
  // preference rather than a constant because it is the only handle on that
  // file: the app searches Drive by this name, so a reader with two devices
  // points both at one name and gets one backup.
  GOOGLE_SHEET_NAME: 'google_sheet_name',
  // Sort direction on the results screen: 'desc' (most important first, the
  // default) or 'asc'.
  RESULTS_SORT: 'results_sort',
  // Catalogue keys this install has already retired — see retireRemovedValues()
  // in ValuesDB. Remembering which ones were handled is what stops the retirement
  // from re-running on a value the user has since restored by hand.
  RETIRED_VALUES: 'retired_catalogue_values',
  // When this install last asked GitHub for a newer release (ISO). Read by the
  // throttle in useAppUpdateCheck: unauthenticated GitHub allows 60 requests an
  // hour from an address, shared with everyone else behind it.
  UPDATE_LAST_CHECK_AT: 'update_last_check_at',
  // The version the user was last prompted about and answered "later" to, with
  // the instant that answer stops applying (ISO). Together they are what makes
  // "later" survive a restart instead of re-asking on the next launch.
  UPDATE_SNOOZED_VERSION: 'update_snoozed_version',
  UPDATE_SNOOZE_UNTIL: 'update_snooze_until',
};

/**
 * Get a preference value.
 *
 * Reads the database, which is the store of record — the browser-local mirror
 * has already been folded into it by the time it opens (see
 * `restoreMirroredPreferences` in db.js), so the two agree. The mirror is only
 * consulted here when the read itself failed, where the alternative is handing
 * back a default and quietly restarting someone's onboarding.
 *
 * @param {string} key
 * @param {*} defaultValue returned when the preference is unset
 * @returns {Promise<string|null>}
 */
export const getPreference = async (key, defaultValue = null) => {
  try {
    const result = await queryFirst(
      'SELECT value FROM app_metadata WHERE key = ?',
      [key],
    );

    if (result && result.value !== null && result.value !== undefined) {
      return result.value;
    }

    return defaultValue;
  } catch (error) {
    console.error('[PreferencesDB] Error getting preference:', key, error);
    const mirrored = readMirroredPreference(key);
    return mirrored === null ? defaultValue : mirrored;
  }
};

/**
 * Set a preference value.
 *
 * The mirror is written first, and on purpose: it cannot throw, and a database
 * write that does should still leave the preference recorded somewhere the next
 * open can find it.
 *
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
export const setPreference = async (key, value) => {
  writeMirroredPreference(key, String(value));
  try {
    const now = new Date().toISOString();
    await executeQuery(
      `INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
       VALUES (?, ?, ?)`,
      [key, String(value), now],
    );
  } catch (error) {
    console.error('[PreferencesDB] Error setting preference:', key, error);
    throw error;
  }
};

/** Get a boolean preference ('1'/'0' as stored by setBooleanPreference). */
export const getBooleanPreference = async (key, defaultValue = false) => {
  const value = await getPreference(key);
  if (value === null) return defaultValue;
  return value === '1' || value === 'true';
};

export const setBooleanPreference = async (key, value) => {
  await setPreference(key, value ? '1' : '0');
};

/** Get a JSON preference, parsed. */
export const getJsonPreference = async (key, defaultValue = null) => {
  const value = await getPreference(key);
  if (value === null) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[PreferencesDB] Error parsing JSON preference:', key, error);
    return defaultValue;
  }
};

export const setJsonPreference = async (key, value) => {
  await setPreference(key, JSON.stringify(value));
};

/** Delete a preference, from the mirror as well — see setPreference for the order. */
export const deletePreference = async (key) => {
  deleteMirroredPreference(key);
  try {
    await executeQuery('DELETE FROM app_metadata WHERE key = ?', [key]);
  } catch (error) {
    console.error('[PreferencesDB] Error deleting preference:', key, error);
    throw error;
  }
};

/** Every preference as a plain object. */
export const getAllPreferences = async () => {
  try {
    const rows = await queryAll('SELECT key, value FROM app_metadata');
    const preferences = {};
    for (const row of rows) {
      preferences[row.key] = row.value;
    }
    return preferences;
  } catch (error) {
    console.error('[PreferencesDB] Error getting all preferences:', error);
    return {};
  }
};
