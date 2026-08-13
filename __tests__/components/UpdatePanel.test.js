import React from 'react';
import PropTypes from 'prop-types';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import UpdatePanel from '../../app/components/UpdatePanel';
import { UpdateDownloadProvider } from '../../app/contexts/UpdateDownloadContext';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import {
  canInstallUpdates,
  checkForAppUpdate,
  installApk,
  listDownloadedApks,
  verifyCachedApk,
} from '../../app/services/AppUpdateService';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import en from '../../assets/i18n/en.json';

/**
 * The manual check in Settings. Every branch it can land on is a different thing
 * to tell the user, and getting one wrong means a button that does nothing or a
 * "you're up to date" over an available release.
 */

jest.mock('../../app/services/AppUpdateService', () => ({
  ...jest.requireActual('../../app/services/AppUpdateService'),
  canInstallUpdates: jest.fn(() => true),
  checkForAppUpdate: jest.fn(),
  installApk: jest.fn(),
  listDownloadedApks: jest.fn(async () => []),
  verifyCachedApk: jest.fn(async () => ({ exists: false })),
}));

function Wrapper({ children }) {
  return (
    <ThemeOnlyProviders>
      <UpdateDownloadProvider>{children}</UpdateDownloadProvider>
    </ThemeOnlyProviders>
  );
}

Wrapper.propTypes = { children: PropTypes.node };

const renderPanel = async () => {
  await render(<UpdatePanel />, { wrapper: Wrapper });
  await act(async () => {});
};

const tapCheck = async () => {
  await act(async () => { fireEvent.press(screen.getByTestId('update-check')); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  canInstallUpdates.mockReturnValue(true);
  listDownloadedApks.mockResolvedValue([]);
  verifyCachedApk.mockResolvedValue({ exists: false });
  await __resetDatabaseHandleForTests();
});

describe('UpdatePanel', () => {
  it('is absent where an APK cannot be installed', async () => {
    // Not a disabled button: on web the app updates by being reloaded, and on
    // iOS there is nothing this could do at all.
    canInstallUpdates.mockReturnValue(false);

    await renderPanel();

    expect(screen.queryByTestId('update-panel')).toBeNull();
    expect(listDownloadedApks).not.toHaveBeenCalled();
  });

  it('offers a download when a newer release has an APK', async () => {
    checkForAppUpdate.mockResolvedValue({
      success: true,
      isUpdateAvailable: true,
      currentVersion: '0.4.0',
      latestVersion: '0.5.0',
      downloadUrl: 'https://example.test/values-v0.5.0.apk',
      checksumUrl: 'https://example.test/values-v0.5.0.apk.sha256',
      newerReleases: [{ version: '0.5.0', notes: '## 0.5.0 (2026-08-20)\n\n* something new' }],
    });

    await renderPanel();
    await tapCheck();

    expect(screen.getByTestId('update-download')).toBeTruthy();
    expect(screen.queryByTestId('update-install-cached')).toBeNull();
    // The heading is dropped and the bullet kept — see app/utils/releaseNotes.js.
    expect(screen.getByTestId('update-notes').props.children).toContain('• something new');
  });

  it('offers to install rather than re-download a file already verified in the cache', async () => {
    checkForAppUpdate.mockResolvedValue({
      success: true,
      isUpdateAvailable: true,
      currentVersion: '0.4.0',
      latestVersion: '0.5.0',
      downloadUrl: 'https://example.test/values-v0.5.0.apk',
      newerReleases: [],
    });
    verifyCachedApk.mockResolvedValue({ exists: true, uri: 'file:///cache/values-v0.5.0.apk', verified: true });

    await renderPanel();
    await tapCheck();

    expect(screen.getByTestId('update-install-cached')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId('update-install-cached')); });
    expect(installApk).toHaveBeenCalledWith('file:///cache/values-v0.5.0.apk');
  });

  it('re-offers the download when the cached file turned out to be corrupt', async () => {
    // verifyCachedApk deleted it, so "install" would launch an installer that
    // Android rejects.
    checkForAppUpdate.mockResolvedValue({
      success: true,
      isUpdateAvailable: true,
      currentVersion: '0.4.0',
      latestVersion: '0.5.0',
      downloadUrl: 'https://example.test/values-v0.5.0.apk',
      newerReleases: [],
    });
    verifyCachedApk.mockResolvedValue({ exists: false, corrupted: true });

    await renderPanel();
    await tapCheck();

    expect(screen.getByTestId('update-download')).toBeTruthy();
    expect(screen.queryByTestId('update-install-cached')).toBeNull();
  });

  it('says so plainly when there is nothing newer', async () => {
    checkForAppUpdate.mockResolvedValue({
      success: true, isUpdateAvailable: false, currentVersion: '0.4.0',
    });

    await renderPanel();
    await tapCheck();

    expect(screen.getByText(en.update_up_to_date.replace('{{version}}', '0.4.0'))).toBeTruthy();
  });

  it('explains that a published release is still being built', async () => {
    // The tag lands the moment release-please publishes; the EAS build that
    // attaches the APK runs afterwards. "Couldn't reach GitHub" would be a lie.
    checkForAppUpdate.mockResolvedValue({
      success: false,
      errorCode: 'releases_without_apks',
      currentVersion: '0.4.0',
      newerReleases: [{ version: '0.5.0', notes: null }],
      buildRun: { status: 'in_progress', elapsedMinutes: 9 },
    });

    await renderPanel();
    await tapCheck();

    expect(screen.getByText(en.update_building_title.replace('{{version}}', '0.5.0'))).toBeTruthy();
    expect(screen.getByText(en.update_building_elapsed.replace('{{minutes}}', '9'))).toBeTruthy();
  });

  it('distinguishes a rate limit from an unreachable GitHub', async () => {
    checkForAppUpdate.mockResolvedValue({
      success: false, errorCode: 'rate_limited', currentVersion: '0.4.0',
    });
    await renderPanel();
    await tapCheck();
    expect(screen.getByText(en.update_error_rate_limited)).toBeTruthy();

    checkForAppUpdate.mockResolvedValue({
      success: false, errorCode: 'network_error', currentVersion: '0.4.0',
    });
    await tapCheck();
    expect(screen.getByText(en.update_error_unreachable)).toBeTruthy();
  });

  it('lists a download left over from an install the user backed out of', async () => {
    // No check has been run — the file is listed on mount, because it is
    // installable right now.
    listDownloadedApks.mockResolvedValue([
      { uri: 'file:///cache/values-v0.5.0.apk', filename: 'values-v0.5.0.apk', version: '0.5.0', modificationTime: 2 },
    ]);

    await renderPanel();

    expect(screen.getByTestId('update-cached-apks')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByTestId('update-cached-0.5.0')); });
    expect(installApk).toHaveBeenCalledWith('file:///cache/values-v0.5.0.apk');
  });

  it('does not leave a spinner behind when the check itself throws', async () => {
    checkForAppUpdate.mockRejectedValue(new Error('boom'));

    await renderPanel();
    await tapCheck();

    expect(screen.getByTestId('update-check')).toBeTruthy();
    expect(screen.getByText(en.update_error_unreachable)).toBeTruthy();
  });
});
