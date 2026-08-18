import { Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import { SHARE_PARAM, DEFAULT_SHARE_URL, readShareCode } from '../services/ResultsShare';

/**
 * The platform half of a shared link: where it points, how it leaves this
 * device, and how it is read on arrival.
 *
 * Same division as RecordsCsv.js and fileTransfer.js — the format lives in the
 * service, the platform lives here — and the same rule about which is asked:
 * a screen calls these and reacts to what comes back, rather than branching on
 * `Platform` itself.
 *
 * Sending works everywhere. On the web a link goes to the browser's own share
 * sheet where there is one and to the clipboard where there is not; on a phone
 * it goes to the system share sheet, which is where a chat app is.
 *
 * Receiving is the web's alone, and deliberately so. A phone would need a deep
 * link registered against `com.heywood8.values://`, which only opens for someone
 * who already has the app installed — the opposite of the thing being built. So
 * every link points at the published web export, which opens in whatever browser
 * the friend already has, and a phone that wants the numbers has the CSV import.
 */

const hasDom = () => Platform.OS === 'web' && typeof document !== 'undefined';

const currentLocation = () => (hasDom() && typeof window !== 'undefined' ? window.location : null);

/**
 * The address a link made here should point at.
 *
 * A copy of the app running on the web shares itself — including a local export
 * or a fork's own deployment, which is what makes a link work at all when the
 * site is not the one below. Everywhere else there is no URL to read, so the
 * published site is the fallback.
 */
export function shareBaseUrl() {
  const location = currentLocation();
  if (location?.origin && location.origin !== 'null') {
    return `${location.origin}${location.pathname || '/'}`;
  }
  return Constants.expoConfig?.extra?.shareUrl || DEFAULT_SHARE_URL;
}

/** A share code as the link that carries it. */
export function buildShareUrl(code, base = shareBaseUrl()) {
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${SHARE_PARAM}=${encodeURIComponent(code)}`;
}

/** The code this app was opened with, if it was opened with one. */
export function currentShareCode() {
  const location = currentLocation();
  if (!location) return null;
  return readShareCode(`${location.search || ''}${location.hash || ''}`);
}

/**
 * Take the code back out of the address bar.
 *
 * Called when the reader closes a shared ranking, so that reloading the tab
 * afterwards lands in their own app rather than back in somebody else's results.
 * A relative path rather than a rebuilt absolute URL: `file://` reports its
 * origin as the string "null", and `history` refuses the URL that builds.
 */
export function clearShareCode() {
  const location = currentLocation();
  if (!location || typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    window.history.replaceState(null, '', location.pathname || '/');
  } catch {
    // A sandboxed frame can refuse this. The link stays in the address bar,
    // which is untidy rather than broken — the screen has already closed.
  }
}

/** Put `text` on the clipboard, however this browser allows it. */
async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied, or an insecure context — the older path below still works in
      // both, which is the whole reason it is still here.
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

/**
 * Hand `url` to whatever this platform sends things with.
 *
 * @returns {Promise<'shared'|'copied'|'cancelled'|'unavailable'>} — four
 *   outcomes because they need four different things said afterwards, and
 *   "unavailable" is not a failure: the caller shows the link so it can be
 *   copied by hand.
 */
export async function shareLink(url, { subject } = {}) {
  if (hasDom()) {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: subject, url });
        return 'shared';
      } catch (error) {
        // A dismissed sheet is a decision, not a fault. Anything else (no user
        // gesture, an unsupported payload) falls through to the clipboard.
        if (error?.name === 'AbortError') return 'cancelled';
      }
    }
    return (await copyToClipboard(url)) ? 'copied' : 'unavailable';
  }

  const result = await Share.share({ message: url, title: subject });
  return result?.action === Share.dismissedAction ? 'cancelled' : 'shared';
}
