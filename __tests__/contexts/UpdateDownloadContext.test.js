import React from 'react';
import PropTypes from 'prop-types';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { UpdateDownloadProvider, useUpdateDownload } from '../../app/contexts/UpdateDownloadContext';
import UpdateDownloadBanner from '../../app/components/UpdateDownloadBanner';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { downloadAndInstallApk } from '../../app/services/AppUpdateService';
import en from '../../assets/i18n/en.json';

/**
 * One download for the whole app, and the banner that is the only thing
 * reporting it.
 *
 * The download outlives the surface that started it — the prompt closes the
 * instant it is answered, and the Android installer does not appear until tens
 * of megabytes have arrived. Everything below is about that gap.
 */

jest.mock('../../app/services/AppUpdateService', () => ({
  ...jest.requireActual('../../app/services/AppUpdateService'),
  downloadAndInstallApk: jest.fn(),
}));

const URL = 'https://example.test/values-v0.5.0.apk';

let latest;
function Harness({ children }) {
  latest = useUpdateDownload();
  return children;
}

Harness.propTypes = { children: PropTypes.node };

function Wrapper({ children }) {
  return (
    <ThemeOnlyProviders>
      <UpdateDownloadProvider>
        <Harness>{children}</Harness>
      </UpdateDownloadProvider>
    </ThemeOnlyProviders>
  );
}

Wrapper.propTypes = { children: PropTypes.node };

const renderBanner = async () => {
  await render(<UpdateDownloadBanner />, { wrapper: Wrapper });
  await act(async () => {});
};

/** A download that hangs until the test releases it, so mid-flight is observable. */
const pausedDownload = () => {
  const handles = {};
  downloadAndInstallApk.mockImplementation((url, onProgress, options) => (
    new Promise((resolve, reject) => {
      Object.assign(handles, { onProgress, options, resolve, reject });
    })
  ));
  return handles;
};

beforeEach(() => {
  jest.clearAllMocks();
  latest = null;
});

describe('UpdateDownloadContext', () => {
  it('shows nothing at all while no download is running', async () => {
    await renderBanner();

    expect(screen.queryByTestId('update-download-banner')).toBeNull();
    expect(latest.isDownloading).toBe(false);
  });

  it('reports the transfer as a percentage', async () => {
    const handles = pausedDownload();
    await renderBanner();

    await act(async () => { latest.startDownload(URL); });
    expect(screen.getByTestId('update-download-banner')).toBeTruthy();

    await act(async () => { handles.onProgress(0.42); });
    expect(screen.getByText(en.update_downloading.replace('{{percent}}', '42'))).toBeTruthy();
  });

  it('names the two phases that have no byte count of their own', async () => {
    // Otherwise a full bar sits there through a checksum over 50MB and a CSV
    // snapshot, reading as a hang.
    const handles = pausedDownload();
    await renderBanner();
    await act(async () => { latest.startDownload(URL); });

    await act(async () => { handles.options.onPhaseChange('verifying'); });
    expect(screen.getByText(en.update_verifying)).toBeTruthy();

    await act(async () => { handles.options.onPhaseChange('backing_up'); });
    expect(screen.getByText(en.update_backing_up)).toBeTruthy();
  });

  it('resets progress on entering the verifying phase', async () => {
    const handles = pausedDownload();
    await renderBanner();
    await act(async () => { latest.startDownload(URL); });
    await act(async () => { handles.onProgress(1); });

    await act(async () => { handles.options.onPhaseChange('verifying'); });

    expect(latest.progress).toBe(0);
  });

  it('refuses a second download on top of the first', async () => {
    // Two taps in one tick both see no download in progress; a ref, not state,
    // is what makes the second one a no-op.
    pausedDownload();
    await renderBanner();

    await act(async () => {
      latest.startDownload(URL);
      latest.startDownload(URL);
    });

    expect(downloadAndInstallApk).toHaveBeenCalledTimes(1);
  });

  it('passes the release checksum through to the downloader', async () => {
    pausedDownload();
    await renderBanner();

    await act(async () => { latest.startDownload(URL, { checksumUrl: `${URL}.sha256` }); });

    expect(downloadAndInstallApk).toHaveBeenCalledWith(
      URL,
      expect.any(Function),
      expect.objectContaining({ checksumUrl: `${URL}.sha256` }),
    );
  });

  it('clears the banner and reports the failure when the download throws', async () => {
    const handles = pausedDownload();
    const onError = jest.fn();
    await renderBanner();
    await act(async () => { latest.startDownload(URL, { onError }); });

    await act(async () => { handles.reject(new Error('connection reset')); });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'connection reset' }));
    expect(screen.queryByTestId('update-download-banner')).toBeNull();
  });

  it('clears the banner once the installer has been handed the file', async () => {
    const handles = pausedDownload();
    await renderBanner();
    await act(async () => { latest.startDownload(URL); });

    await act(async () => { handles.resolve(); });

    expect(screen.queryByTestId('update-download-banner')).toBeNull();
    expect(latest.isDownloading).toBe(false);
  });

  it('can start another download after one failed', async () => {
    // The ref that blocks a concurrent start has to be released on the error
    // path too, or a failed download disables the button for the session.
    const handles = pausedDownload();
    await renderBanner();
    await act(async () => { latest.startDownload(URL, { onError: () => {} }); });
    await act(async () => { handles.reject(new Error('offline')); });

    await act(async () => { latest.startDownload(URL); });

    expect(downloadAndInstallApk).toHaveBeenCalledTimes(2);
  });

  it('cannot be used without its provider', async () => {
    // The alternative is a silent no-op download.
    function Orphan() {
      useUpdateDownload();
      return <Text>never rendered</Text>;
    }
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Orphan />)).rejects.toThrow(/UpdateDownloadProvider/);

    consoleError.mockRestore();
  });
});
