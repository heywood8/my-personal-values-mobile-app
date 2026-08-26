import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Signing in to Google, for the one thing this app asks Google for: a
 * spreadsheet of the reader's own data, in the reader's own Drive.
 *
 * Everything else here stays on the device (see the note in services/db.js), so
 * this is the one door out — and it is a door nobody walks through by accident.
 * It opens only when a client ID was configured for the platform the app is
 * running on, which is what `canUseGoogleSync()` answers: a build with no ID
 * does not show the panel at all, rather than showing a button that fails on
 * press. Asked as a predicate, like `canPickFile()` in utils/fileTransfer.js.
 *
 * The token lives in this module and nowhere else. It is never written to the
 * preferences, which are mirrored into `localStorage` on the web — a credential
 * any script on the origin can read is not a credential this app is willing to
 * keep, and there is nowhere else on a web target to put one. So a session lasts
 * as long as the app is open: signing in is a tap, taken from the button press
 * that already had to happen for a sync to start.
 *
 * The platform halves live in `googleAuthWeb.js` and `googleAuthNative.js` and
 * are reached with `await import()`, the way AppUpdateService reaches
 * ApkInstaller. The web half fetches Google's script from accounts.google.com,
 * and doing that on load would put a request to Google in the page of a reader
 * who never asked for any of this.
 */

/**
 * What is asked for, and deliberately no more.
 *
 * `drive.file` is per-file access to files this app created — it cannot list,
 * read or touch anything else in the Drive, which is the whole reason it is the
 * scope rather than `drive` or `spreadsheets`. The consequence is worth knowing:
 * a spreadsheet the reader made by hand is invisible here even when its name
 * matches, so the app makes its own the first time it saves.
 *
 * `email` is what names the account in the panel. Writing into somebody's Drive
 * without saying which account is signed in is the kind of thing that ends with
 * a backup in the wrong Google account.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'email',
];

/** Treat a token as spent a minute early, so a sync does not start on one about to expire. */
const EXPIRY_MARGIN_MS = 60 * 1000;

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// { accessToken, expiresAt, email } — memory only, see the note above.
let session = null;

/**
 * The OAuth client for this platform, as configured at build time.
 *
 * Three of them because Google issues one per client type and they are not
 * interchangeable: a Web client authorises an origin, an Android client a
 * package plus signing certificate, an iOS client a bundle ID.
 */
export function googleClientId() {
  const configured = Constants.expoConfig?.extra?.google || {};
  if (Platform.OS === 'android') return configured.androidClientId || null;
  if (Platform.OS === 'ios') return configured.iosClientId || null;
  return configured.webClientId || null;
}

/** Whether this build can sign in to Google at all. */
export function canUseGoogleSync() {
  return !!googleClientId();
}

/** The account this session is signed in as, or null. */
export function currentAccount() {
  return session?.email ?? null;
}

/** Whether a usable token is in hand right now. */
export function isSignedIn() {
  return !!session && session.expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

const driver = () => (
  Platform.OS === 'web'
    ? import('./googleAuthWeb')
    : import('./googleAuthNative')
);

/**
 * The address behind the token, best effort.
 *
 * A failed lookup is not a failed sign-in — the token still works and the sync
 * can run; the panel just says "signed in" without naming the account.
 */
async function fetchEmail(accessToken) {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const profile = await response.json();
    return profile?.email || null;
  } catch (error) {
    console.warn('[GoogleAuth] Could not read the account address:', error);
    return null;
  }
}

/**
 * Ask Google for a token, opening whatever this platform opens.
 *
 * @returns {Promise<{email: string|null}|null>} null when the reader closed the
 *   window without deciding — a dismissal is an answer, not a failure, and the
 *   caller says nothing about it.
 */
export async function signIn() {
  const clientId = googleClientId();
  if (!clientId) throw new Error('google_not_configured');

  const { requestToken } = await driver();
  const granted = await requestToken({ clientId, scopes: GOOGLE_SCOPES });
  if (!granted?.accessToken) return null;

  session = {
    accessToken: granted.accessToken,
    email: await fetchEmail(granted.accessToken),
    expiresAt: Date.now() + (Number(granted.expiresIn) || 3600) * 1000,
  };

  return { email: session.email };
}

/**
 * A token to call the APIs with, signing in first if there is not one.
 *
 * @returns {Promise<string|null>} null when the sign-in was dismissed.
 */
export async function accessToken() {
  if (isSignedIn()) return session.accessToken;
  const signed = await signIn();
  return signed ? session.accessToken : null;
}

/**
 * Drop the session, and tell Google to drop it too.
 *
 * Revoking rather than only forgetting: the grant is what would let a later
 * sign-in skip the consent screen, and "sign out" that leaves the app permanently
 * authorised is not what it says it is. A revoke that fails still clears the
 * session — the local half of signing out is the half the reader asked for.
 */
export async function signOut() {
  const token = session?.accessToken;
  session = null;
  if (!token) return;

  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch (error) {
    console.warn('[GoogleAuth] Could not revoke the token:', error);
  }
}

/** Forget the session without touching the network — for tests. */
export function __resetGoogleAuthForTests() {
  session = null;
}
