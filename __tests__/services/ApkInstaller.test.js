/**
 * The Android half of the updater, against a fake filesystem.
 *
 * What is worth testing here is not that expo-file-system works — it is the two
 * decisions this module makes on the user's behalf: what filename it is willing
 * to write into a directory that sits beside the app's database, and when it
 * deletes a download rather than handing it to the package installer.
 */

const CACHE = 'file:///cache/';
const DOCS = 'file:///docs/';

// A tiny in-memory filesystem, keyed by URI.
let mockFiles;

const setFile = (name, { size = 1024, content = null, modificationTime = 0 } = {}) => {
  mockFiles.set(`${CACHE}${name}`, { size, content, modificationTime });
};

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(async (uri) => {
    const file = mockFiles.get(uri);
    return file
      ? { exists: true, size: file.size, modificationTime: file.modificationTime }
      : { exists: false };
  }),
  readDirectoryAsync: jest.fn(async (dir) => (
    [...mockFiles.keys()].filter((uri) => uri.startsWith(dir)).map((uri) => uri.slice(dir.length))
  )),
  readAsStringAsync: jest.fn(async (uri, { position = 0, length } = {}) => {
    const file = mockFiles.get(uri);
    if (!file) throw new Error(`no such file: ${uri}`);
    const bytes = file.content ?? new Uint8Array(file.size);
    const slice = bytes.slice(position, length == null ? undefined : position + length);
    return Buffer.from(slice).toString('base64');
  }),
  writeAsStringAsync: jest.fn(async (uri, text) => {
    mockFiles.set(uri, { size: text.length, content: Buffer.from(text), modificationTime: 0 });
  }),
  deleteAsync: jest.fn(async (uri) => { mockFiles.delete(uri); }),
  getContentUriAsync: jest.fn(async (uri) => `content://${uri}`),
  createDownloadResumable: jest.fn(),
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(async () => ({ resultCode: -1 })),
}));

const FileSystem = require('expo-file-system/legacy');
const IntentLauncher = require('expo-intent-launcher');
const {
  checkAlreadyDownloaded,
  cleanupOldApks,
  installApk,
  listDownloadedApks,
  sanitizeFilename,
  verifyApkStructure,
  verifyCachedApk,
} = require('../../app/services/ApkInstaller');

/** Bytes that pass the ZIP-structure check: a local header, then an EOCD. */
const intactZip = (size = 512) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  bytes.set([0x50, 0x4b, 0x05, 0x06], size - 22);
  return bytes;
};

/** Bytes of a download that stopped partway: header present, EOCD missing. */
const truncatedZip = (size = 512) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  return bytes;
};

beforeEach(() => {
  mockFiles = new Map();
  jest.clearAllMocks();
});

describe('sanitizeFilename', () => {
  it('cannot be walked out of the cache directory', () => {
    // The cache sits beside the app's databases, and the name comes off the end
    // of a URL — so this is the only thing between a crafted release asset and
    // an overwritten values.db.
    const walked = sanitizeFilename('../../../databases/values.db.apk');

    // The separator is what makes a traversal; a dot in a filename is ordinary,
    // and `.apk` needs one, so dots are kept and slashes are not.
    expect(walked).not.toContain('/');
    expect(walked).toBe('.._.._.._databases_values.db.apk');
  });

  it('keeps an ordinary release asset name intact', () => {
    expect(sanitizeFilename('values-values-v0.4.0.apk')).toBe('values-values-v0.4.0.apk');
  });

  it('falls back for anything that is not an APK', () => {
    expect(sanitizeFilename('payload.sh')).toBe('values-update.apk');
    expect(sanitizeFilename('.apk')).toBe('values-update.apk');
    expect(sanitizeFilename(null)).toBe('values-update.apk');
  });
});

describe('listDownloadedApks', () => {
  it('lists APKs newest first, with the version read off the name', () => {
    setFile('values-values-v0.3.0.apk', { modificationTime: 100 });
    setFile('values-values-v0.5.0.apk', { modificationTime: 300 });
    setFile('notes.csv', { modificationTime: 400 });

    return listDownloadedApks().then((apks) => {
      expect(apks.map((a) => a.version)).toEqual(['0.5.0', '0.3.0']);
      expect(apks.every((a) => a.filename.endsWith('.apk'))).toBe(true);
    });
  });

  it('is empty rather than throwing when the directory cannot be read', async () => {
    FileSystem.readDirectoryAsync.mockRejectedValueOnce(new Error('EACCES'));

    expect(await listDownloadedApks()).toEqual([]);
  });
});

describe('cleanupOldApks', () => {
  it('keeps the newest few and deletes the rest', async () => {
    for (let i = 1; i <= 5; i += 1) setFile(`values-v0.${i}.0.apk`, { modificationTime: i * 100 });

    await cleanupOldApks(CACHE, 3);

    const left = (await listDownloadedApks()).map((a) => a.version);
    expect(left).toEqual(['0.5.0', '0.4.0', '0.3.0']);
  });

  it('deletes nothing when there are fewer than the limit', async () => {
    setFile('values-v0.4.0.apk');

    await cleanupOldApks(CACHE, 3);

    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});

describe('checkAlreadyDownloaded', () => {
  it('finds the cached file for a release download URL', async () => {
    setFile('values-values-v0.4.0.apk');

    expect(await checkAlreadyDownloaded('https://example.test/d/values-values-v0.4.0.apk', CACHE))
      .toBe(`${CACHE}values-values-v0.4.0.apk`);
  });

  it('ignores a zero-byte file left by a download that never started', async () => {
    setFile('values-values-v0.4.0.apk', { size: 0 });

    expect(await checkAlreadyDownloaded('https://example.test/d/values-values-v0.4.0.apk', CACHE))
      .toBeNull();
  });

  it('does not claim some other download when the URL has no filename', async () => {
    // Both would sanitize to the same fallback name, and installing an unrelated
    // APK because a URL was shaped oddly is worse than offering nothing.
    setFile('values-update.apk');

    expect(await checkAlreadyDownloaded('https://example.test/download?id=7', CACHE)).toBeNull();
  });
});

describe('verifyApkStructure', () => {
  it('accepts a file that opens and closes like a ZIP', async () => {
    const bytes = intactZip();
    setFile('good.apk', { size: bytes.length, content: bytes });

    expect(await verifyApkStructure(`${CACHE}good.apk`)).toBe(true);
  });

  it('rejects a truncated download — the file Android calls "a problem"', async () => {
    const bytes = truncatedZip();
    setFile('cut.apk', { size: bytes.length, content: bytes });

    expect(await verifyApkStructure(`${CACHE}cut.apk`)).toBe(false);
  });

  it('rejects something that is not an archive at all', async () => {
    const bytes = new Uint8Array(512);
    bytes.set([0x3c, 0x68, 0x74, 0x6d], 0); // an HTML error page saved as .apk
    setFile('html.apk', { size: bytes.length, content: bytes });

    expect(await verifyApkStructure(`${CACHE}html.apk`)).toBe(false);
  });

  it('rejects a file too small to hold an EOCD record', async () => {
    setFile('tiny.apk', { size: 4, content: new Uint8Array(4) });

    expect(await verifyApkStructure(`${CACHE}tiny.apk`)).toBe(false);
  });

  it('assumes intact when the file cannot be read, because its answer deletes', async () => {
    setFile('unreadable.apk');
    FileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('EIO'));

    expect(await verifyApkStructure(`${CACHE}unreadable.apk`)).toBe(true);
  });
});

describe('verifyCachedApk', () => {
  const url = 'https://example.test/d/values-v0.4.0.apk';
  const checksumUrl = 'https://example.test/d/values-v0.4.0.apk.sha256';

  const cacheIntact = () => {
    const bytes = intactZip();
    setFile('values-v0.4.0.apk', { size: bytes.length, content: bytes });
    return bytes;
  };

  const sha256Of = async (bytes) => {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  it('reports nothing cached when there is no file', async () => {
    expect(await verifyCachedApk(url, { cacheDir: CACHE })).toEqual({ exists: false });
  });

  it('confirms a file whose checksum matches', async () => {
    const bytes = cacheIntact();
    const hash = await sha256Of(bytes);
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => `${hash}  values-v0.4.0.apk` }));

    expect(await verifyCachedApk(url, { checksumUrl, cacheDir: CACHE, fetchImpl }))
      .toEqual({ exists: true, uri: `${CACHE}values-v0.4.0.apk`, verified: true });
  });

  it('deletes a file whose checksum does not match', async () => {
    cacheIntact();
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => `${'f'.repeat(64)}  values-v0.4.0.apk` }));

    expect(await verifyCachedApk(url, { checksumUrl, cacheDir: CACHE, fetchImpl }))
      .toEqual({ exists: false, corrupted: true });
    expect(mockFiles.has(`${CACHE}values-v0.4.0.apk`)).toBe(false);
  });

  it('falls back to the structure check when the release has no checksum', async () => {
    // Releases cut before the workflow started uploading one. `verified: false`
    // says the file is intact but unproven, which is still installable.
    cacheIntact();
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 404, text: async () => '' }));

    expect(await verifyCachedApk(url, { checksumUrl, cacheDir: CACHE, fetchImpl }))
      .toMatchObject({ exists: true, verified: false });
  });

  it('deletes a truncated download that has no checksum to judge it by', async () => {
    const bytes = truncatedZip();
    setFile('values-v0.4.0.apk', { size: bytes.length, content: bytes });

    expect(await verifyCachedApk(url, { cacheDir: CACHE }))
      .toEqual({ exists: false, corrupted: true });
    expect(mockFiles.has(`${CACHE}values-v0.4.0.apk`)).toBe(false);
  });
});

describe('installApk', () => {
  it('hands the installer a content URI with both flags it needs', async () => {
    await installApk(`${CACHE}values-v0.4.0.apk`);

    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
      'android.intent.action.VIEW',
      expect.objectContaining({
        data: `content://${CACHE}values-v0.4.0.apk`,
        // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK — without the
        // first the installer cannot read the file it was handed.
        flags: 1 | 268435456,
        type: 'application/vnd.android.package-archive',
      }),
    );
  });
});

describe('the documents directory', () => {
  it('is where a pre-update snapshot would land, not the cache', () => {
    // Guards a swap of the two constants: a "backup" written to the cache is one
    // the OS may clear before the user ever needs it.
    expect(FileSystem.documentDirectory).toBe(DOCS);
    expect(FileSystem.cacheDirectory).not.toBe(DOCS);
  });
});
