import { queryFirst, executeQuery, queryAll } from './db';

export const PREF_KEYS = {
  LANGUAGE: 'app_language',
  THEME: 'theme_preference',
  // The user's chosen rating scale, applied to the NEXT assessment. Existing
  // assessments keep the scale they were taken on (see app/db/schema.js).
  SCALE: 'rating_scale',
  // Set once the first calibration completes. Distinct from "a language is set":
  // someone can pick a language and close the app mid-deck, and should land back
  // in the deck rather than on an empty results screen.
  ONBOARDING_COMPLETE: 'onboarding_complete',
  // Sort direction on the results screen: 'asc' (low to high) or 'desc'.
  RESULTS_SORT: 'results_sort',
  // Results grouping: 'priority' or 'group'.
  RESULTS_VIEW: 'results_view',
  // Catalogue keys this install has already retired — see retireRemovedValues()
  // in ValuesDB. Remembering which ones were handled is what stops the retirement
  // from re-running on a value the user has since restored by hand.
  RETIRED_VALUES: 'retired_catalogue_values',
};

/**
 * Get a preference value.
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
    return defaultValue;
  }
};

/**
 * Set a preference value.
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
export const setPreference = async (key, value) => {
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

/** Delete a preference. */
export const deletePreference = async (key) => {
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
