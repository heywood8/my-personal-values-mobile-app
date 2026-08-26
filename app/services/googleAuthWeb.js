/**
 * The browser half of signing in: Google Identity Services, loaded on demand.
 *
 * A browser page cannot do the code-for-token exchange a phone does — Google
 * requires a client secret from a Web client at the token endpoint, and a secret
 * shipped inside a static export is not a secret. GIS is the way a page without a
 * server gets a token: a popup, and an access token handed back to a callback.
 *
 * The script is fetched from Google the first time somebody presses sign in, and
 * never before. This app otherwise talks to nobody, and a page that pulls a
 * Google script on load has already told Google about every reader who opened it.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// The load is shared: two presses before the script arrives wait on one request.
let loading = null;

const oauth2 = () => globalThis.google?.accounts?.oauth2 || null;

function loadGoogleIdentity() {
  const ready = oauth2();
  if (ready) return Promise.resolve(ready);

  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => {
        const loaded = oauth2();
        if (loaded) resolve(loaded);
        else reject(new Error('google_unavailable'));
      });
      script.addEventListener('error', () => {
        // Cleared so a later attempt can retry: the usual cause is a network
        // that was not there a moment ago, or a blocker the reader can turn off.
        loading = null;
        reject(new Error('google_unavailable'));
      });
      document.head.appendChild(script);
    });
  }

  return loading;
}

/**
 * Open Google's popup and come back with a token.
 *
 * @returns {Promise<{accessToken: string, expiresIn: number}|null>} null when the
 *   popup was closed without a decision.
 */
export async function requestToken({ clientId, scopes }) {
  const identity = await loadGoogleIdentity();

  return new Promise((resolve, reject) => {
    const client = identity.initTokenClient({
      callback: (response) => {
        if (response?.error) {
          // The reader closing the consent screen arrives as an error like any
          // other, and is not one.
          if (response.error === 'access_denied') resolve(null);
          else reject(new Error(response.error));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresIn: Number(response.expires_in) || 3600,
        });
      },
      client_id: clientId,
      error_callback: (error) => {
        if (error?.type === 'popup_closed') resolve(null);
        else reject(new Error(error?.type || 'google_unavailable'));
      },
      scope: scopes.join(' '),
    });

    client.requestAccessToken();
  });
}
