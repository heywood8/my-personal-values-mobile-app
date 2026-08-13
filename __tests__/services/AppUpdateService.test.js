import { Platform } from 'react-native';
import {
  canInstallUpdates,
  checkForAppUpdate,
  compareVersions,
  extractApkAsset,
  extractChecksumAsset,
  fetchActiveBuildRun,
  normalizeVersion,
  parseVersionFromRelease,
} from '../../app/services/AppUpdateService';

/**
 * The half of the updater that runs everywhere: what GitHub said, and what it
 * means. Nothing here touches the filesystem — the Android half lives behind a
 * dynamic import and is never loaded by these tests.
 */

const nativeOS = Platform.OS;
afterEach(() => { Platform.OS = nativeOS; });

const apk = (name) => ({ name, browser_download_url: `https://example.test/${name}` });

const release = (version, { assets = [apk(`values-values-v${version}.apk`)], body = null, publishedAt = null } = {}) => ({
  tag_name: `values-v${version}`,
  name: `values: v${version}`,
  html_url: `https://github.com/heywood8/my-personal-values-mobile-app/releases/tag/values-v${version}`,
  published_at: publishedAt,
  body,
  assets,
});

const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => payload,
});

/** A fetch that answers the releases endpoint, and 404s anything else. */
const releasesFetch = (releases, extra = {}) => jest.fn(async (url) => {
  if (url.includes('/releases')) return jsonResponse(releases);
  if (url.includes('/actions/workflows')) return jsonResponse(extra.runs ?? { workflow_runs: [] });
  return jsonResponse(null, { ok: false, status: 404 });
});

describe('version parsing', () => {
  it('reads the three numbers out of this repository\'s tag shape', () => {
    // release-please prefixes the component name, so tags are `values-v0.4.0`
    // and never a bare `v0.4.0`.
    expect(normalizeVersion('values-v0.4.0')).toBe('0.4.0');
    expect(normalizeVersion('values: v1.12.3')).toBe('1.12.3');
    expect(normalizeVersion('0.4.0')).toBe('0.4.0');
  });

  it('drops leading zeroes so 0.04.0 and 0.4.0 are one version', () => {
    expect(normalizeVersion('v0.04.0')).toBe('0.4.0');
  });

  it('returns null for anything without a version in it', () => {
    expect(normalizeVersion('latest')).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
    expect(normalizeVersion(42)).toBeNull();
  });

  it('falls back to the release name when the tag has no version', () => {
    expect(parseVersionFromRelease({ tag_name: 'nightly', name: 'values: v0.5.1' })).toBe('0.5.1');
    expect(parseVersionFromRelease(null)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by each component in turn, not lexically', () => {
    // The bug this guards: '0.10.0' < '0.9.0' as strings.
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
    expect(compareVersions('0.4.0', '0.4.1')).toBe(-1);
    expect(compareVersions('values-v0.4.0', '0.4.0')).toBe(0);
  });

  it('treats an unreadable version as equal rather than newer', () => {
    // Anything else would let a junk tag advertise itself as an update.
    expect(compareVersions('nightly', '0.4.0')).toBe(0);
    expect(compareVersions('0.4.0', undefined)).toBe(0);
  });
});

describe('extractApkAsset', () => {
  it('ignores assets that are not a downloadable APK', () => {
    expect(extractApkAsset([
      { name: 'values-values-v0.4.0.apk' }, // no download URL
      { name: 'source.zip', browser_download_url: 'https://example.test/source.zip' },
      apk('values-values-v0.4.0.apk'),
    ]).name).toBe('values-values-v0.4.0.apk');
  });

  it('prefers arm64 and never picks x86 while a real-device build exists', () => {
    // The API does not promise an asset order, so the x86 build being listed
    // first must not decide this.
    const chosen = extractApkAsset([apk('values-v0.5.0_x86_64.apk'), apk('values-v0.5.0_arm64.apk')]);
    expect(chosen.name).toBe('values-v0.5.0_arm64.apk');
  });

  it('takes an x86-only release rather than offering nothing', () => {
    expect(extractApkAsset([apk('values-v0.5.0_x86_64.apk')]).name).toBe('values-v0.5.0_x86_64.apk');
  });

  it('is null with no assets at all', () => {
    expect(extractApkAsset([])).toBeNull();
    expect(extractApkAsset(undefined)).toBeNull();
  });
});

describe('extractChecksumAsset', () => {
  it('matches the checksum named after the APK, not some other one', () => {
    const assets = [
      apk('values-values-v0.4.0.apk'),
      { name: 'values-values-v0.3.0.apk.sha256', browser_download_url: 'https://example.test/old.sha256' },
      { name: 'values-values-v0.4.0.apk.sha256', browser_download_url: 'https://example.test/new.sha256' },
    ];
    expect(extractChecksumAsset(assets, 'values-values-v0.4.0.apk').browser_download_url)
      .toBe('https://example.test/new.sha256');
  });

  it('is null on a release cut before the workflow uploaded one', () => {
    expect(extractChecksumAsset([apk('values-values-v0.4.0.apk')], 'values-values-v0.4.0.apk')).toBeNull();
  });
});

describe('checkForAppUpdate', () => {
  it('offers the newest release that actually has an APK', async () => {
    const fetchImpl = releasesFetch([release('0.5.0'), release('0.6.0'), release('0.4.0')]);

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result).toMatchObject({ success: true, isUpdateAvailable: true, latestVersion: '0.6.0' });
    expect(result.downloadUrl).toContain('values-values-v0.6.0.apk');
  });

  it('scans every release rather than stopping at the first older one', async () => {
    // GitHub orders by publication date, so an edited old release can sit in
    // front of the newest one.
    const fetchImpl = releasesFetch([release('0.3.0'), release('0.4.0'), release('0.7.0')]);

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result.latestVersion).toBe('0.7.0');
  });

  it('reports being up to date when nothing newer exists', async () => {
    const fetchImpl = releasesFetch([release('0.4.0'), release('0.3.0')]);

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result).toMatchObject({ success: true, isUpdateAvailable: false, currentVersion: '0.4.0' });
    // The changelog is still returned — the settings panel lists it either way.
    expect(result.recentReleases.map((r) => r.version)).toEqual(['0.4.0', '0.3.0']);
  });

  it('does not offer a newer release whose APK is not attached yet', async () => {
    // The tag is pushed the moment release-please publishes; the EAS build that
    // produces the APK runs afterwards and can take an hour.
    const fetchImpl = releasesFetch([release('0.5.0', { assets: [] })], {
      runs: {
        workflow_runs: [{
          status: 'in_progress',
          run_started_at: new Date(Date.now() - 12 * 60000).toISOString(),
          html_url: 'https://github.test/run/1',
        }],
      },
    });

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result).toMatchObject({
      success: false,
      isUpdateAvailable: false,
      errorCode: 'releases_without_apks',
    });
    expect(result.newerReleases.map((r) => r.version)).toEqual(['0.5.0']);
    expect(result.buildRun).toMatchObject({ status: 'in_progress', elapsedMinutes: 12 });
  });

  it('prefers an older release that has an APK over a newer one that does not', async () => {
    const fetchImpl = releasesFetch([release('0.6.0', { assets: [] }), release('0.5.0')]);

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result).toMatchObject({ isUpdateAvailable: true, latestVersion: '0.5.0' });
  });

  it('names a rate limit separately from a network failure', async () => {
    // Unauthenticated GitHub allows sixty requests an hour per address, which a
    // shared network reaches without this app's help — "try in an hour" is a
    // different message from "check your connection".
    const fetchImpl = jest.fn(async () => jsonResponse(null, { ok: false, status: 403 }));

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result).toMatchObject({ success: false, errorCode: 'rate_limited', httpStatus: 403 });
  });

  it('resolves rather than throwing when the network is gone', async () => {
    // Every caller is a background check whose only response to a throw would
    // be to swallow it.
    const fetchImpl = jest.fn(async () => { throw new Error('offline'); });

    await expect(checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl }))
      .resolves.toMatchObject({ success: false, errorCode: 'network_error' });
  });

  it('reports a timeout as its own outcome', async () => {
    const fetchImpl = jest.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });

    await expect(checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl }))
      .resolves.toMatchObject({ errorCode: 'timeout' });
  });

  it('refuses to guess when it cannot read its own version', async () => {
    const fetchImpl = jest.fn();

    const result = await checkForAppUpdate({ currentVersion: 'dev', fetchImpl });

    expect(result).toMatchObject({ success: false, errorCode: 'invalid_current_version' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('carries each release\'s own download URL, so every one is installable', async () => {
    const fetchImpl = releasesFetch([
      release('0.6.0', { body: '## 0.6.0 (2026-08-20)\n\n* something' }),
      release('0.5.0', { body: '## 0.5.0 (2026-08-15)\n\n* something else' }),
    ]);

    const result = await checkForAppUpdate({ currentVersion: '0.4.0', fetchImpl });

    expect(result.newerReleases).toHaveLength(2);
    for (const entry of result.newerReleases) {
      expect(entry.downloadUrl).toContain(`v${entry.version}.apk`);
      expect(entry.notes).toBeTruthy();
    }
  });
});

describe('fetchActiveBuildRun', () => {
  it('is null when every run has completed', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({
      workflow_runs: [{ status: 'completed', run_started_at: new Date().toISOString() }],
    }));

    expect(await fetchActiveBuildRun({ fetchImpl })).toBeNull();
  });

  it('picks the most recently started of several active runs', async () => {
    const now = Date.now();
    const fetchImpl = jest.fn(async () => jsonResponse({
      workflow_runs: [
        { status: 'queued', run_started_at: new Date(now - 90 * 60000).toISOString(), html_url: 'old' },
        { status: 'in_progress', run_started_at: new Date(now - 5 * 60000).toISOString(), html_url: 'new' },
      ],
    }));

    expect(await fetchActiveBuildRun({ fetchImpl, now })).toMatchObject({
      htmlUrl: 'new',
      elapsedMinutes: 5,
    });
  });

  it('is null rather than an error when the Actions API is unreachable', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('offline'); });
    expect(await fetchActiveBuildRun({ fetchImpl })).toBeNull();
  });
});

describe('canInstallUpdates', () => {
  it('is Android only — the web build reloads and iOS cannot sideload', () => {
    Platform.OS = 'android';
    expect(canInstallUpdates()).toBe(true);

    for (const os of ['web', 'ios']) {
      Platform.OS = os;
      expect(canInstallUpdates()).toBe(false);
    }
  });
});
