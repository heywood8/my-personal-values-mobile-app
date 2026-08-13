import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { canInstallUpdates, checkForAppUpdate } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';

/**
 * The background half of the updater: noticing a new release, and knowing when
 * not to mention it.
 *
 * Checks run when the app opens and whenever it comes back to the foreground —
 * not on a timer. A timer was the obvious thing and is the wrong thing here:
 * unauthenticated GitHub allows sixty requests an hour from an address, shared
 * with everyone else behind the same router, and this app is opened for a minute
 * a day. Two events plus the throttle below cover every moment a user could
 * plausibly act on the answer, at a handful of requests a day.
 */

// No two checks closer together than this, counted across restarts — a foreground
// event fires every time the user glances at another app and comes back.
export const MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// How long "later" silences a version. A newer one carries a different version
// and prompts as normal.
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{enabled?: boolean}} options `enabled` false suspends checking
 *   entirely — used to keep the prompt off the deck, which is the one screen
 *   this app never interrupts.
 * @returns {{pendingUpdate: object|null, dismiss: Function, accept: Function,
 *   checkNow: Function}}
 */
export function useAppUpdateCheck({ enabled = true } = {}) {
  const [pendingUpdate, setPendingUpdate] = useState(null);

  // Versions already answered this session. "Later" also writes a dated snooze
  // so the answer survives a restart; "update now" does not, because the install
  // either succeeds — and the version stops being newer — or the user backed out
  // of the Android installer and can be asked again tomorrow.
  const answeredRef = useRef(new Set());
  const runningRef = useRef(false);
  // Mirrors of state read inside callbacks that outlive a render.
  const pendingRef = useRef(null);
  const enabledRef = useRef(enabled);

  useEffect(() => { pendingRef.current = pendingUpdate; }, [pendingUpdate]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const shouldPrompt = useCallback(async (version) => {
    if (answeredRef.current.has(version)) return false;

    const [snoozedVersion, snoozeUntil] = await Promise.all([
      getPreference(PREF_KEYS.UPDATE_SNOOZED_VERSION),
      getPreference(PREF_KEYS.UPDATE_SNOOZE_UNTIL),
    ]);

    return !(snoozedVersion === version
      && snoozeUntil
      && new Date().toISOString() < snoozeUntil);
  }, []);

  /**
   * @param {{force?: boolean}} options `force` skips the interval throttle, for
   *   a check the user asked for by hand.
   */
  const checkNow = useCallback(async ({ force = false } = {}) => {
    if (!canInstallUpdates()) return null;
    // Never stack checks, and never replace a prompt that is already on screen
    // with the same answer computed again.
    if (runningRef.current || (!force && pendingRef.current)) return null;

    runningRef.current = true;
    try {
      if (!force) {
        const lastCheck = await getPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT);
        if (lastCheck && Date.now() - new Date(lastCheck).getTime() < MIN_CHECK_INTERVAL_MS) {
          return null;
        }
      }

      const result = await checkForAppUpdate();
      // Stamped even on failure: a rate-limited or offline check must not
      // retry on every foreground event.
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString())
        .catch(() => {});

      if (!result.success || !result.isUpdateAvailable) return result;
      if (!enabledRef.current || pendingRef.current) return result;
      if (!(await shouldPrompt(result.latestVersion))) return result;

      setPendingUpdate({
        latestVersion: result.latestVersion,
        currentVersion: result.currentVersion,
        downloadUrl: result.downloadUrl,
        checksumUrl: result.checksumUrl || null,
        releaseUrl: result.releaseUrl || null,
        publishedAt: result.publishedAt || null,
        newerReleases: result.newerReleases || [],
      });
      return result;
    } catch (error) {
      console.warn('[AppUpdate] Update check failed:', error?.message);
      return null;
    } finally {
      runningRef.current = false;
    }
  }, [shouldPrompt]);

  // "Later": quiet for the session, and for a day across restarts.
  const dismiss = useCallback(() => {
    const version = pendingRef.current?.latestVersion;
    setPendingUpdate(null);
    if (!version) return;

    answeredRef.current.add(version);
    const until = new Date(Date.now() + SNOOZE_MS).toISOString();
    Promise.all([
      setPreference(PREF_KEYS.UPDATE_SNOOZED_VERSION, version),
      setPreference(PREF_KEYS.UPDATE_SNOOZE_UNTIL, until),
    ]).catch((error) => {
      console.warn('[AppUpdate] Could not persist the update snooze:', error?.message);
    });
  }, []);

  // "Update now": the caller starts the download; all this does is close the
  // prompt and stop it reappearing behind the Android installer.
  const accept = useCallback(() => {
    const update = pendingRef.current;
    if (update?.latestVersion) answeredRef.current.add(update.latestVersion);
    setPendingUpdate(null);
    return update;
  }, []);

  useEffect(() => {
    if (!enabled || !canInstallUpdates()) return undefined;

    // Deferred to idle so the first check does not compete with opening the
    // database and rendering the first screen.
    const idleHandle = requestIdleCallback(() => { checkNow(); });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkNow();
    });

    return () => {
      cancelIdleCallback(idleHandle);
      subscription.remove();
    };
  }, [enabled, checkNow]);

  return { pendingUpdate, dismiss, accept, checkNow };
}

export default useAppUpdateCheck;
