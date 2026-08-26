import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

/**
 * The phone half of signing in: the system browser, and PKCE.
 *
 * An installed app cannot hold a client secret either, and Google's answer for
 * one is the authorisation-code flow with PKCE — no secret, and a code that is
 * worthless to anything but the app that asked for it. `expo-auth-session` owns
 * the awkward parts (the verifier, the challenge, the redirect back into the
 * app); what is left here is the client ID and the endpoints.
 *
 * The redirect is the reversed client ID, because that is the scheme Google
 * registers for an Android or iOS client — `app.config.js` adds it to the app's
 * schemes from the same environment variable, so the two cannot drift apart.
 */

// Lets a redirect that arrives while an auth session is open close it, rather
// than leaving the browser sitting on Google's blank landing page.
WebBrowser.maybeCompleteAuthSession();

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

/**
 * `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.
 *
 * Exported because app.config.js needs the same answer at build time and one of
 * the two being wrong is a redirect the app never receives.
 */
export const reversedClientId = (clientId) => {
  const id = String(clientId || '').replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${id}`;
};

/**
 * Open the system browser and come back with a token.
 *
 * @returns {Promise<{accessToken: string, expiresIn: number}|null>} null when the
 *   reader dismissed the browser without deciding.
 */
export async function requestToken({ clientId, scopes }) {
  const redirectUri = AuthSession.makeRedirectUri({
    native: `${reversedClientId(clientId)}:/oauthredirect`,
  });

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes,
    usePKCE: true,
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result?.type !== 'success' || !result.params?.code) return null;

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      extraParams: { code_verifier: request.codeVerifier },
      redirectUri,
    },
    DISCOVERY,
  );

  return {
    accessToken: token.accessToken,
    expiresIn: Number(token.expiresIn) || 3600,
  };
}
