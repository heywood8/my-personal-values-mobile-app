import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { fetchExpectedChecksum } from '../utils/checksums';

/**
 * The Android half of the updater: files on disk, and the package installer.
 *
 * Everything in here touches expo-file-system or expo-intent-launcher, neither
 * of which means anything on web. Nothing imports this module directly —
 * AppUpdateService reaches it with `await import()` from behind
 * `canInstallUpdates()`, so the web bundle never evaluates it.
 */

// Cached APKs to keep. Each is 30-50MB, and only the newest is ever installed;
// the couple behind it are there so a downgrade after a bad release does not
// need the network.
const APK_KEEP_COUNT = 3;
// Pre-update CSV snapshots to keep, for the same reason and at a thousandth of
// the size.
const SNAPSHOT_KEEP_COUNT = 3;

const FALLBACK_APK_NAME = 'values-update.apk';

/**
 * A filename safe to write into the cache directory.
 *
 * The name comes off the end of a URL, and the cache directory sits beside the
 * app's databases: an unfiltered `../../../databases/values.db` would be a path
 * traversal straight onto the user's records.
 */
export const sanitizeFilename = (raw) => {
  if (!raw || typeof raw !== 'string') return FALLBACK_APK_NAME;
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.toLowerCase().endsWith('.apk') && safe.length > 4 ? safe : FALLBACK_APK_NAME;
};

const filenameFromUrl = (downloadUrl) => {
  const raw = (String(downloadUrl).split('/').pop() || '').split('?')[0] || null;
  return { raw, filename: sanitizeFilename(raw) };
};

// Release APKs are named after their tag (`values-values-v0.4.0.apk`), so the
// version is readable straight off a cached file.
const versionFromFilename = (name) => {
  const match = name.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null;
};

/** Cached APKs, newest first. */
export const listDownloadedApks = async (cacheDir = FileSystem.cacheDirectory) => {
  try {
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    const apkFiles = files.filter((name) => name.toLowerCase().endsWith('.apk'));

    const withInfo = await Promise.all(apkFiles.map(async (name) => {
      const uri = `${cacheDir}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      return {
        uri,
        filename: name,
        version: versionFromFilename(name),
        modificationTime: info.modificationTime || 0,
      };
    }));

    return withInfo.sort((a, b) => b.modificationTime - a.modificationTime);
  } catch {
    return [];
  }
};

/** Drop all but the newest `keep` cached APKs. */
export const cleanupOldApks = async (cacheDir = FileSystem.cacheDirectory, keep = APK_KEEP_COUNT) => {
  const apks = await listDownloadedApks(cacheDir);
  if (apks.length <= keep) return;

  await Promise.all(apks.slice(keep).map(({ uri }) => (
    FileSystem.deleteAsync(uri, { idempotent: true })
  )));
};

/** The cached file for this download URL, if one is there and non-empty. */
export const checkAlreadyDownloaded = async (downloadUrl, cacheDir = FileSystem.cacheDirectory) => {
  const { raw, filename } = filenameFromUrl(downloadUrl);
  // A URL that did not end in a filename produced the fallback name, which is
  // some *other* download's file — not this one.
  if (filename === FALLBACK_APK_NAME && (!raw || !raw.toLowerCase().endsWith('.apk'))) return null;

  const localUri = `${cacheDir}${filename}`;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    return info.exists && info.size > 0 ? localUri : null;
  } catch {
    return null;
  }
};

// A lookup table beats atob() plus a charCodeAt loop, and the APK being hashed
// is tens of megabytes.
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 64; i += 1) table[alphabet.charCodeAt(i)] = i;
  return table;
})();

const base64ToBytes = (b64) => {
  const len = b64.length;
  const padding = (b64[len - 1] === '=') + (b64[len - 2] === '=');
  const byteLen = (len >>> 2) * 3 - padding;
  const out = new Uint8Array(byteLen);
  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const chunk = (BASE64_LOOKUP[b64.charCodeAt(i)] << 18)
      | (BASE64_LOOKUP[b64.charCodeAt(i + 1)] << 12)
      | (BASE64_LOOKUP[b64.charCodeAt(i + 2)] << 6)
      | BASE64_LOOKUP[b64.charCodeAt(i + 3)];
    if (j < byteLen) out[j++] = chunk >>> 16;
    if (j < byteLen) out[j++] = (chunk >>> 8) & 0xff;
    if (j < byteLen) out[j++] = chunk & 0xff;
  }
  return out;
};

/** SHA-256 of a file, hex. Hermes exposes the native Web Crypto digest. */
export const computeSha256 = async (fileUri) => {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// An APK is a ZIP: it opens with a local file header and closes with an End Of
// Central Directory record.
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const ZIP_EOCD = [0x50, 0x4b, 0x05, 0x06];         // PK\x05\x06
// The EOCD is 22 bytes plus a comment of at most 0xFFFF, so it is always inside
// the last ~64KB. Nothing beyond that ever needs reading.
const MAX_EOCD_SCAN = 22 + 0xffff;
const EOCD_MIN_SIZE = 22;

/**
 * A checksum-free integrity check: does this file still look like a whole ZIP?
 *
 * An interrupted download leaves a file that exists, has a size, and is missing
 * its tail — which is exactly what Android reports as "There's a problem with
 * the app file" after the user has already tapped install. Reading four bytes at
 * the front and 64KB at the back catches it without pulling 50MB into the heap.
 *
 * Returns true when the file cannot be read at all: an I/O error is not evidence
 * of corruption, and this function's answer gets a file deleted.
 */
export const verifyApkStructure = async (fileUri) => {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    const size = info?.size;
    if (!Number.isFinite(size) || size < EOCD_MIN_SIZE) return false;

    const headB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    const head = base64ToBytes(headB64);
    if (head.length < 4 || !ZIP_LOCAL_HEADER.every((byte, i) => head[i] === byte)) return false;

    const tailLen = Math.min(size, MAX_EOCD_SCAN);
    const tailB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: size - tailLen,
      length: tailLen,
    });
    const tail = base64ToBytes(tailB64);
    for (let i = tail.length - 4; i >= 0; i -= 1) {
      if (tail[i] === ZIP_EOCD[0] && tail[i + 1] === ZIP_EOCD[1]
        && tail[i + 2] === ZIP_EOCD[2] && tail[i + 3] === ZIP_EOCD[3]) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn('[AppUpdate] Could not read APK for a structure check; assuming intact:', error?.message);
    return true;
  }
};

/**
 * Is the cached download for this release safe to install?
 *
 * Two layers, because the strong one is not always available:
 *   1. the release's `.sha256`, when it has one and the hash can be computed;
 *   2. otherwise the ZIP-structure check above, which still catches a truncated
 *      transfer — the failure that actually happens.
 * A file that fails either is deleted, so the caller offers a fresh download
 * rather than an install that Android will reject.
 *
 * @returns {Promise<{exists: boolean, uri?: string, verified?: boolean, corrupted?: boolean}>}
 */
export const verifyCachedApk = async (downloadUrl, {
  checksumUrl = null,
  cacheDir = FileSystem.cacheDirectory,
  fetchImpl = fetch,
} = {}) => {
  const localUri = await checkAlreadyDownloaded(downloadUrl, cacheDir);
  if (!localUri) return { exists: false };

  const discard = async (reason) => {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    console.warn(`[AppUpdate] Discarded cached APK (${reason}):`, localUri);
    return { exists: false, corrupted: true };
  };

  if (checksumUrl) {
    const filename = localUri.split('/').pop();
    const expected = await fetchExpectedChecksum(checksumUrl, filename, fetchImpl);
    if (expected) {
      try {
        const actual = await computeSha256(localUri);
        if (actual !== expected) return discard('checksum mismatch');
        return { exists: true, uri: localUri, verified: true };
      } catch (error) {
        // Hashing reads the whole APK into the JS heap and can run out of it.
        // "Could not verify" is not "failed verification" — fall through.
        console.warn('[AppUpdate] Checksum could not be computed; falling back to the structure check:', error?.message);
      }
    }
  }

  const intact = await verifyApkStructure(localUri);
  if (!intact) return discard('truncated or not a ZIP');

  return { exists: true, uri: localUri, verified: false };
};

/** Hand a file to the Android package installer. */
export const installApk = async (localUri) => {
  const contentUri = await FileSystem.getContentUriAsync(localUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK — the installer is
    // another process and needs both to read the file and to own its own task.
    flags: 1 | 268435456,
    type: 'application/vnd.android.package-archive',
  });
};

/**
 * Write the CSV export to the documents directory before installing.
 *
 * The CSV file is the only backup this app has, and an update is the one moment
 * it is knowingly about to be replaced. `buildRecordsCsv` is called without a
 * name resolver, so the snapshot carries value keys rather than translated
 * names — which is what import matches on anyway.
 *
 * Never allowed to stop an install: a snapshot that could not be written is
 * logged, and the update proceeds.
 */
const writePreUpdateSnapshot = async () => {
  try {
    const { buildRecordsCsv } = await import('./RecordsCsv');
    const csv = await buildRecordsCsv();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const uri = `${FileSystem.documentDirectory}values-pre-update-${stamp}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv);

    const names = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
    const snapshots = names
      .filter((name) => name.startsWith('values-pre-update-') && name.endsWith('.csv'))
      .sort();
    // Timestamped names sort oldest-first, so the excess is at the front.
    for (const name of snapshots.slice(0, Math.max(0, snapshots.length - SNAPSHOT_KEEP_COUNT))) {
      await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${name}`, { idempotent: true });
    }
  } catch (error) {
    console.warn('[AppUpdate] Pre-update snapshot failed; installing anyway:', error?.message);
  }
};

/**
 * Download an APK, check it, snapshot the records, and open the installer.
 *
 * @param {string} downloadUrl
 * @param {(fraction: number) => void} [onProgress] 0..1 while downloading
 * @param {{checksumUrl?: string, fetchImpl?: Function, onPhaseChange?: Function}} [options]
 *   `onPhaseChange` reports 'verifying' and 'backing_up', the two stages after
 *   the transfer that have no progress of their own to report.
 */
export const downloadAndInstallApk = async (downloadUrl, onProgress, {
  checksumUrl = null,
  fetchImpl = fetch,
  onPhaseChange = null,
} = {}) => {
  const { filename } = filenameFromUrl(downloadUrl);
  const localUri = `${FileSystem.cacheDirectory}${filename}`;

  const download = FileSystem.createDownloadResumable(
    downloadUrl,
    localUri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (onProgress && totalBytesExpectedToWrite > 0) {
        onProgress(totalBytesWritten / totalBytesExpectedToWrite);
      }
    },
  );

  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error('Download failed');

  if (checksumUrl) {
    const expected = await fetchExpectedChecksum(checksumUrl, filename, fetchImpl);
    if (expected) {
      onPhaseChange?.('verifying');
      let actual = null;
      try {
        actual = await computeSha256(result.uri);
      } catch (error) {
        // Out of heap on a large APK. Unverifiable, not failed.
        console.warn('[AppUpdate] Checksum could not be computed; skipping verification:', error?.message);
      }
      if (actual !== null && actual !== expected) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error('APK checksum mismatch — the download was deleted');
      }
    } else {
      console.warn('[AppUpdate] No usable checksum for this release; skipping verification');
    }
  }

  onPhaseChange?.('backing_up');
  await writePreUpdateSnapshot();

  await cleanupOldApks();
  await installApk(result.uri);
};
