import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Checking GitHub for a newer build of this app, and installing it.
 *
 * There is no store listing. Releases are cut by release-please, an APK is built
 * on EAS and attached to the release by `.github/workflows/release-apk.yml`, and
 * this is how an install already on a phone learns that happened.
 *
 * The module splits in two on purpose. Everything here is `fetch` and string
 * comparison — it runs, and is tested, on every platform. Everything that
 * touches the filesystem or fires an Android intent lives in `ApkInstaller.js`
 * and is reached only through `await import()`, from behind `canInstallUpdates()`.
 * A static import would pull expo-intent-launcher — which has no web
 * implementation — into the web bundle's module graph and evaluate it on load.
 */

const GITHUB_OWNER = 'heywood8';
const GITHUB_REPO = 'my-personal-values-mobile-app';

const GITHUB_API_VERSION = '2022-11-28';
const UPDATE_CHECK_TIMEOUT_MS = 8000;

// GitHub orders /releases by publication date rather than by version, so a
// newer release can sit behind an older one that was edited later. Every page
// fetched is scanned rather than stopped at.
const MAX_RELEASES_TO_CHECK = 20;
// How many past releases the settings panel lists as a changelog.
const MAX_CHANGELOG_ENTRIES = 10;

// The workflow that builds the APK and attaches it to a release. A release tag
// that exists with no APK on it usually means this is still running.
const BUILD_WORKFLOW_FILE = 'release-apk.yml';

export const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

/** The version this install is running, as declared in app.config.js. */
export const currentAppVersion = () => Constants.expoConfig?.version || '0.0.0';

/**
 * Whether this platform can install an update the app downloaded itself.
 *
 * Android only: an APK plus `ACTION_VIEW` is the whole mechanism. The web build
 * updates by being reloaded, and iOS has no sideloading at all — on both, the
 * check would find a release it could do nothing with, so the feature is not
 * offered. Asked as a predicate rather than branched on in a screen, like
 * `canPickFile()` in app/utils/fileTransfer.js.
 */
export const canInstallUpdates = () => Platform.OS === 'android';

const normalizeVersion = (value) => {
  if (!value || typeof value !== 'string') return null;

  // Tags read `values-v0.4.0`, release names `values: v0.4.0`; both reduce to
  // the same three numbers.
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
};

export { normalizeVersion };

export const parseVersionFromRelease = (release) => {
  if (!release) return null;
  return normalizeVersion(release.tag_name) || normalizeVersion(release.name);
};

/** -1, 0 or 1. Two unparseable versions compare equal rather than throwing. */
export const compareVersions = (left, right) => {
  const parsedLeft = normalizeVersion(left);
  const parsedRight = normalizeVersion(right);

  if (!parsedLeft || !parsedRight) return 0;

  const leftParts = parsedLeft.split('.').map(Number);
  const rightParts = parsedRight.split('.').map(Number);

  for (let i = 0; i < 3; i += 1) {
    if (leftParts[i] > rightParts[i]) return 1;
    if (leftParts[i] < rightParts[i]) return -1;
  }

  return 0;
};

/**
 * The installable asset on a release.
 *
 * The `release` EAS profile builds one APK carrying every ABI, so there is
 * normally exactly one. The x86/arm64 preference below costs nothing and means
 * a later split into per-architecture assets — the other profiles in eas.json
 * already build those — does not silently start handing phones an x86 build,
 * because the API does not promise any particular asset order.
 */
export const extractApkAsset = (assets = []) => {
  if (!Array.isArray(assets)) return null;

  const apkAssets = assets.filter((asset) => (
    asset
    && typeof asset.name === 'string'
    && asset.name.toLowerCase().endsWith('.apk')
    && !!asset.browser_download_url
  ));

  const isX86 = (name) => /x86/i.test(name);
  const isArm64 = (name) => /arm64/i.test(name);

  return (
    apkAssets.find((asset) => isArm64(asset.name))
    || apkAssets.find((asset) => !isX86(asset.name))
    || apkAssets[0]
    || null
  );
};

/**
 * The `sha256sum`-format checksum uploaded beside the APK, named `<apk>.sha256`.
 * Absent on releases cut before the workflow started producing one, which is why
 * every caller treats a missing checksum as "verify by other means" rather than
 * as a failure.
 */
export const extractChecksumAsset = (assets = [], apkFilename) => {
  if (!Array.isArray(assets) || !apkFilename) return null;

  const expected = `${apkFilename}.sha256`;
  return assets.find((asset) => (
    asset && asset.name === expected && !!asset.browser_download_url
  )) || null;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = UPDATE_CHECK_TIMEOUT_MS, fetchImpl = fetch) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    return await fetchImpl(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const githubHeaders = (version) => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': `Values/${version}`,
  'X-GitHub-Api-Version': GITHUB_API_VERSION,
});

/**
 * Whether an APK build is running right now, for the release that has none yet.
 *
 * Deliberately not a percentage. The APK is compiled on EAS and the workflow
 * only waits on it — on the free tier that wait has been the whole of an hour,
 * and the job allows three — so elapsed time predicts nothing and a progress bar
 * derived from it would be a fabrication. What is true and useful is that a
 * build is in flight and how long it has been going, so that is what is
 * returned. `null` means no active run, or the API could not be reached.
 */
export const fetchActiveBuildRun = async ({
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) => {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${BUILD_WORKFLOW_FILE}/runs?per_page=10`;

  try {
    const response = await fetchWithTimeout(
      endpoint,
      { headers: githubHeaders(currentAppVersion()) },
      UPDATE_CHECK_TIMEOUT_MS,
      fetchImpl,
    );
    if (!response.ok) return null;

    const data = await response.json();
    const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];

    // "Active" is anything GitHub has not marked completed: queued, in_progress,
    // waiting on an approval, and so on.
    const active = runs.filter((run) => run && run.status && run.status !== 'completed');
    if (active.length === 0) return null;

    const startedMs = (run) => new Date(run.run_started_at || run.created_at || 0).getTime();
    active.sort((a, b) => startedMs(b) - startedMs(a));

    const run = active[0];
    const startMs = startedMs(run);
    const elapsedMinutes = Number.isFinite(startMs) && startMs > 0
      ? Math.max(0, Math.floor((now - startMs) / 60000))
      : null;

    return {
      status: run.status,
      elapsedMinutes,
      startedAt: run.run_started_at || run.created_at || null,
      htmlUrl: run.html_url || null,
    };
  } catch {
    return null;
  }
};

/**
 * Ask GitHub whether anything newer than this install has shipped.
 *
 * Always resolves; a failure is reported as `{ success: false, errorCode }`
 * rather than thrown, because every caller here is a background check whose only
 * possible response to a network error is to try again later.
 *
 * `errorCode: 'releases_without_apks'` is the one interesting failure: a newer
 * release exists but carries no APK, which on this repository means the EAS
 * build is still running. It comes back with the release notes and, when one is
 * running, the active build.
 */
export const checkForAppUpdate = async ({
  currentVersion = currentAppVersion(),
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
  fetchImpl = fetch,
} = {}) => {
  const currentNormalized = normalizeVersion(currentVersion);
  if (!currentNormalized) {
    return {
      success: false,
      isUpdateAvailable: false,
      currentVersion,
      errorCode: 'invalid_current_version',
    };
  }

  const releasesUrl = `https://github.com/${owner}/${repo}/releases`;
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${MAX_RELEASES_TO_CHECK}`;

  try {
    const response = await fetchWithTimeout(
      endpoint,
      { headers: githubHeaders(currentNormalized) },
      UPDATE_CHECK_TIMEOUT_MS,
      fetchImpl,
    );

    if (!response.ok) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        // Unauthenticated GitHub allows 60 requests an hour per address, and a
        // shared network reaches that without this app's help. Named separately
        // so the panel can say "try later" rather than "check your connection".
        errorCode: response.status === 403 || response.status === 429 ? 'rate_limited' : 'http_error',
        httpStatus: response.status,
      };
    }

    const releases = await response.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        errorCode: 'invalid_release_data',
      };
    }

    let bestRelease = null;      // highest version that actually has an APK
    let sawReleaseWithoutApk = false;
    const newerReleases = [];    // everything above the installed version
    const recentReleases = [];   // the changelog, newest first, any version

    for (const release of releases) {
      const version = parseVersionFromRelease(release);
      if (!version) continue;

      const apkAsset = extractApkAsset(release.assets);
      const checksumAsset = apkAsset ? extractChecksumAsset(release.assets, apkAsset.name) : null;
      // Each release carries its own download URL, so the panel can offer a
      // button per release rather than one action for the newest.
      const entry = {
        version,
        notes: release.body || null,
        hasApk: !!apkAsset,
        publishedAt: release.published_at || null,
        releaseUrl: release.html_url || null,
        downloadUrl: apkAsset ? apkAsset.browser_download_url : null,
        checksumUrl: checksumAsset ? checksumAsset.browser_download_url : null,
      };

      if (recentReleases.length < MAX_CHANGELOG_ENTRIES) {
        recentReleases.push(entry);
      }

      if (compareVersions(version, currentNormalized) <= 0) continue;

      newerReleases.push(entry);

      if (apkAsset) {
        if (!bestRelease || compareVersions(version, bestRelease.version) > 0) {
          bestRelease = entry;
        }
      } else {
        sawReleaseWithoutApk = true;
      }
    }

    // Highest version first, matching the rest of the app: every surface that
    // orders anything puts the top of the list first, and both consumers here
    // read element zero as "the newest". GitHub's own order is by publication
    // date, which is nearly always the same and occasionally is not.
    newerReleases.sort((a, b) => compareVersions(b.version, a.version));

    if (newerReleases.length === 0) {
      return {
        success: true,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        releasesUrl,
        recentReleases,
      };
    }

    if (!bestRelease) {
      // Newer releases exist but none of them has an APK yet.
      const buildRun = sawReleaseWithoutApk
        ? await fetchActiveBuildRun({ owner, repo, fetchImpl })
        : null;

      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        errorCode: sawReleaseWithoutApk ? 'releases_without_apks' : 'invalid_release_data',
        newerReleases,
        recentReleases,
        releasesUrl,
        buildRun,
      };
    }

    return {
      success: true,
      isUpdateAvailable: true,
      currentVersion: currentNormalized,
      latestVersion: bestRelease.version,
      downloadUrl: bestRelease.downloadUrl,
      checksumUrl: bestRelease.checksumUrl,
      releaseUrl: bestRelease.releaseUrl || releasesUrl,
      publishedAt: bestRelease.publishedAt,
      newerReleases,
      recentReleases,
      releasesUrl,
    };
  } catch (error) {
    return {
      success: false,
      isUpdateAvailable: false,
      currentVersion: currentNormalized,
      errorCode: error?.name === 'AbortError' ? 'timeout' : 'network_error',
    };
  }
};

// Loaded on demand so the module — and the two native packages it imports —
// stays out of every code path on web and iOS. See the note at the top.
const installer = () => import('./ApkInstaller');

/** Cached APKs this install has downloaded, newest first. Empty off Android. */
export const listDownloadedApks = async () => {
  if (!canInstallUpdates()) return [];
  return (await installer()).listDownloadedApks();
};

/** Hand a cached APK to the Android package installer. */
export const installApk = async (localUri) => {
  if (!canInstallUpdates()) throw new Error('Installing an APK is Android-only');
  return (await installer()).installApk(localUri);
};

/**
 * Whether the cached download for `downloadUrl` is present and intact.
 * See ApkInstaller for what "intact" checks; off Android there is no cache, so
 * the answer is always "nothing here".
 */
export const verifyCachedApk = async (downloadUrl, options = {}) => {
  if (!canInstallUpdates()) return { exists: false };
  return (await installer()).verifyCachedApk(downloadUrl, options);
};

/** Download the APK, verify it, then open the installer. */
export const downloadAndInstallApk = async (downloadUrl, onProgress, options = {}) => {
  if (!canInstallUpdates()) throw new Error('Installing an APK is Android-only');
  return (await installer()).downloadAndInstallApk(downloadUrl, onProgress, options);
};
