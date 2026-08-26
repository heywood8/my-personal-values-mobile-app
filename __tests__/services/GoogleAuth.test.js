import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  __resetGoogleAuthForTests,
  accessToken,
  canUseGoogleSync,
  currentAccount,
  googleClientId,
  isSignedIn,
  signIn,
  signOut,
} from '../../app/services/GoogleAuth';
import { requestToken } from '../../app/services/googleAuthWeb';

/**
 * The sign-in's job is to hold a token for exactly as long as the app is open
 * and no longer, and to be absent entirely from a build that was never given a
 * client ID. Both are properties a UI test would not see: an unconfigured build
 * simply renders no panel, which looks the same as a panel nobody pressed.
 */

jest.mock('../../app/services/googleAuthWeb', () => ({ requestToken: jest.fn() }));

const nativeOS = Platform.OS;

const configure = (google) => {
  Constants.expoConfig.extra = google ? { google } : {};
};

beforeEach(() => {
  Platform.OS = 'web';
  __resetGoogleAuthForTests();
  requestToken.mockReset();
  configure({ webClientId: 'web-client', androidClientId: 'android-client' });
  global.fetch = jest.fn(async () => ({
    json: async () => ({ email: 'reader@example.test' }),
    ok: true,
    status: 200,
  }));
});

afterEach(() => {
  Platform.OS = nativeOS;
  configure(null);
  delete global.fetch;
});

describe('what this build can do', () => {
  it('takes the client ID for the platform it is running on', () => {
    expect(googleClientId()).toBe('web-client');
    Platform.OS = 'android';
    expect(googleClientId()).toBe('android-client');
    // No iOS client was configured, and an Android one is not a substitute.
    Platform.OS = 'ios';
    expect(googleClientId()).toBeNull();
  });

  it('offers nothing at all when no client ID was configured', async () => {
    configure(null);
    expect(canUseGoogleSync()).toBe(false);
    // Pressed anyway — from a stale render, say — it names the reason rather
    // than opening an empty popup.
    await expect(signIn()).rejects.toThrow('google_not_configured');
  });
});

describe('a session', () => {
  it('keeps the token for as long as the app is open, and names the account', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token-1', expiresIn: 3600 });

    expect(await signIn()).toEqual({ email: 'reader@example.test' });
    expect(currentAccount()).toBe('reader@example.test');
    expect(isSignedIn()).toBe(true);

    // A second sync reuses the token rather than reopening Google's popup.
    expect(await accessToken()).toBe('token-1');
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('signs in by itself when a sync needs a token and there is none', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token-1', expiresIn: 3600 });

    expect(await accessToken()).toBe('token-1');
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('asks again once the token is spent', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token-1', expiresIn: 1 });
    await signIn();

    // A minute of margin, so a sync never starts on a token about to expire.
    expect(isSignedIn()).toBe(false);
    requestToken.mockResolvedValue({ accessToken: 'token-2', expiresIn: 3600 });
    expect(await accessToken()).toBe('token-2');
  });

  it('is signed in even when Google would not say who by', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token-1', expiresIn: 3600 });
    global.fetch = jest.fn(async () => ({ json: async () => ({}), ok: false, status: 403 }));

    expect(await signIn()).toEqual({ email: null });
    expect(isSignedIn()).toBe(true);
  });

  it('treats a closed popup as a decision, not a failure', async () => {
    requestToken.mockResolvedValue(null);

    expect(await signIn()).toBeNull();
    expect(await accessToken()).toBeNull();
    expect(isSignedIn()).toBe(false);
  });

  it('revokes the grant on the way out, not just the copy in memory', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token-1', expiresIn: 3600 });
    await signIn();

    await signOut();

    expect(isSignedIn()).toBe(false);
    expect(currentAccount()).toBeNull();
    const revoked = global.fetch.mock.calls.find(([url]) => String(url).includes('revoke'));
    expect(revoked[0]).toContain('token=token-1');
  });

  it('still signs out when the revoke could not be sent', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token-1', expiresIn: 3600 });
    await signIn();
    global.fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });

    await signOut();

    expect(isSignedIn()).toBe(false);
  });
});
