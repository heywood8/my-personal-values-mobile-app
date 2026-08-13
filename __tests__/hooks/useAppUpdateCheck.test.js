import React from 'react';
import PropTypes from 'prop-types';
import { Platform, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import useAppUpdateCheck, { MIN_CHECK_INTERVAL_MS, SNOOZE_MS } from '../../app/hooks/useAppUpdateCheck';
import { checkForAppUpdate } from '../../app/services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

/**
 * When the app is allowed to interrupt someone about a new version, and — more
 * of the code — when it is not.
 */

jest.mock('../../app/services/AppUpdateService', () => ({
  ...jest.requireActual('../../app/services/AppUpdateService'),
  checkForAppUpdate: jest.fn(),
}));

const nativeOS = Platform.OS;

const AVAILABLE = {
  success: true,
  isUpdateAvailable: true,
  currentVersion: '0.4.0',
  latestVersion: '0.5.0',
  downloadUrl: 'https://example.test/values-v0.5.0.apk',
  checksumUrl: 'https://example.test/values-v0.5.0.apk.sha256',
  newerReleases: [{ version: '0.5.0', notes: '* a change' }],
};

// A probe that renders what the hook decided, so assertions read off the DOM
// rather than off a returned object that may not have settled yet.
let latest;
function Probe({ enabled = true }) {
  latest = useAppUpdateCheck({ enabled });
  return <Text testID="pending">{latest.pendingUpdate?.latestVersion || 'none'}</Text>;
}

Probe.propTypes = { enabled: PropTypes.bool };

const pending = () => screen.getByTestId('pending').props.children;

beforeEach(async () => {
  Platform.OS = 'android';
  latest = null;
  jest.clearAllMocks();
  await __resetDatabaseHandleForTests();
  checkForAppUpdate.mockResolvedValue(AVAILABLE);
});

afterEach(() => {
  Platform.OS = nativeOS;
});

describe('useAppUpdateCheck', () => {
  it('surfaces a newer release once the first idle check comes back', async () => {
    await render(<Probe />);
    await act(async () => {});

    expect(checkForAppUpdate).toHaveBeenCalled();
    expect(pending()).toBe('0.5.0');
  });

  it('never checks where an update could not be installed', async () => {
    // Off Android the check would find a release the app can do nothing with.
    for (const os of ['web', 'ios']) {
      Platform.OS = os;
      jest.clearAllMocks();

      await render(<Probe />);
      await act(async () => {});

      expect(checkForAppUpdate).not.toHaveBeenCalled();
      expect(pending()).toBe('none');
    }
  });

  it('stays quiet while the deck is open', async () => {
    // Nothing is asked in front of the deck, and an available update is not an
    // exception: the release is still there when the run finishes.
    await render(<Probe enabled={false} />);
    await act(async () => {});

    expect(checkForAppUpdate).not.toHaveBeenCalled();
    expect(pending()).toBe('none');
  });

  it('does not ask GitHub again within the throttle window', async () => {
    // Coming back to the app fires a foreground check every time; unauthenticated
    // GitHub allows sixty requests an hour from the whole network.
    await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());

    await render(<Probe />);
    await act(async () => {});

    expect(checkForAppUpdate).not.toHaveBeenCalled();
  });

  it('checks again once the window has passed', async () => {
    await setPreference(
      PREF_KEYS.UPDATE_LAST_CHECK_AT,
      new Date(Date.now() - MIN_CHECK_INTERVAL_MS - 1000).toISOString(),
    );

    await render(<Probe />);
    await act(async () => {});

    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(pending()).toBe('0.5.0');
  });

  it('ignores the throttle for a check the user asked for', async () => {
    await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString());
    await render(<Probe />);
    await act(async () => {});

    await act(async () => { await latest.checkNow({ force: true }); });

    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('records the check even when it failed, so a rate limit is not hammered', async () => {
    checkForAppUpdate.mockResolvedValue({ success: false, errorCode: 'rate_limited' });

    await render(<Probe />);
    await act(async () => {});

    expect(await getPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT)).toBeTruthy();
    expect(pending()).toBe('none');
  });

  it('"later" closes the prompt and writes a dated snooze', async () => {
    await render(<Probe />);
    await act(async () => {});
    expect(pending()).toBe('0.5.0');

    await act(async () => { latest.dismiss(); });

    expect(pending()).toBe('none');
    expect(await getPreference(PREF_KEYS.UPDATE_SNOOZED_VERSION)).toBe('0.5.0');

    const until = new Date(await getPreference(PREF_KEYS.UPDATE_SNOOZE_UNTIL)).getTime();
    expect(until).toBeGreaterThan(Date.now());
    expect(until).toBeLessThanOrEqual(Date.now() + SNOOZE_MS);
  });

  it('honours a snooze written by a previous run of the app', async () => {
    // The whole point of persisting it: "later" that only lasted the session
    // would re-ask on the next launch, which is most of the way to every launch.
    await setPreference(PREF_KEYS.UPDATE_SNOOZED_VERSION, '0.5.0');
    await setPreference(
      PREF_KEYS.UPDATE_SNOOZE_UNTIL,
      new Date(Date.now() + SNOOZE_MS).toISOString(),
    );

    await render(<Probe />);
    await act(async () => {});

    expect(checkForAppUpdate).toHaveBeenCalled();
    expect(pending()).toBe('none');
  });

  it('prompts for a newer version even inside another version\'s snooze', async () => {
    await setPreference(PREF_KEYS.UPDATE_SNOOZED_VERSION, '0.5.0');
    await setPreference(
      PREF_KEYS.UPDATE_SNOOZE_UNTIL,
      new Date(Date.now() + SNOOZE_MS).toISOString(),
    );
    checkForAppUpdate.mockResolvedValue({ ...AVAILABLE, latestVersion: '0.6.0' });

    await render(<Probe />);
    await act(async () => {});

    expect(pending()).toBe('0.6.0');
  });

  it('prompts again once the snooze has expired', async () => {
    await setPreference(PREF_KEYS.UPDATE_SNOOZED_VERSION, '0.5.0');
    await setPreference(PREF_KEYS.UPDATE_SNOOZE_UNTIL, new Date(Date.now() - 1000).toISOString());

    await render(<Probe />);
    await act(async () => {});

    expect(pending()).toBe('0.5.0');
  });

  it('"update now" hands back the update and stops re-prompting for it', async () => {
    // The Android installer can be backed out of, which returns to a running app
    // that must not immediately re-ask about the version it just offered.
    await render(<Probe />);
    await act(async () => {});

    let accepted;
    await act(async () => { accepted = latest.accept(); });

    expect(accepted).toMatchObject({ latestVersion: '0.5.0', downloadUrl: AVAILABLE.downloadUrl });
    expect(pending()).toBe('none');

    await act(async () => { await latest.checkNow({ force: true }); });
    expect(pending()).toBe('none');
  });

  it('says nothing when the app is already on the latest release', async () => {
    checkForAppUpdate.mockResolvedValue({
      success: true, isUpdateAvailable: false, currentVersion: '0.4.0',
    });

    await render(<Probe />);
    await act(async () => {});

    expect(pending()).toBe('none');
  });
});
