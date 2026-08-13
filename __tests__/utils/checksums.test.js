import { fetchExpectedChecksum, parseChecksumFile } from '../../app/utils/checksums';

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('parseChecksumFile', () => {
  it('reads the format sha256sum actually writes', () => {
    // Two spaces between hash and name, which is what the release workflow's
    // `sha256sum values-values-v0.4.0.apk` produces.
    expect(parseChecksumFile(`${HASH}  values-values-v0.4.0.apk\n`, 'values-values-v0.4.0.apk'))
      .toBe(HASH);
  });

  it('strips the binary-mode marker from the name', () => {
    expect(parseChecksumFile(`${HASH} *values.apk`, 'values.apk')).toBe(HASH);
  });

  it('ignores a leading directory on the recorded name', () => {
    expect(parseChecksumFile(`${HASH}  ./dist/values.apk`, 'values.apk')).toBe(HASH);
  });

  it('picks the line for this APK out of a multi-asset file', () => {
    const text = `${OTHER}  values-v0.3.0.apk\n${HASH}  values-v0.4.0.apk\n`;
    expect(parseChecksumFile(text, 'values-v0.4.0.apk')).toBe(HASH);
  });

  it('is null when the file names some other file', () => {
    // Not an error: it means "this checksum is not about our download", and the
    // caller falls back to the structural check rather than deleting anything.
    expect(parseChecksumFile(`${HASH}  something-else.apk`, 'values.apk')).toBeNull();
  });

  it('rejects a line whose hash is not a SHA-256', () => {
    expect(parseChecksumFile('deadbeef  values.apk', 'values.apk')).toBeNull();
  });

  it('lowercases, so a mixed-case file still compares equal', () => {
    expect(parseChecksumFile(`${'A'.repeat(64)}  values.apk`, 'values.apk')).toBe('a'.repeat(64));
  });

  it('is null for empty input', () => {
    expect(parseChecksumFile('', 'values.apk')).toBeNull();
    expect(parseChecksumFile(`${HASH}  values.apk`, null)).toBeNull();
  });
});

describe('fetchExpectedChecksum', () => {
  it('returns the hash the release recorded', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => `${HASH}  values.apk` }));

    expect(await fetchExpectedChecksum('https://example.test/x.sha256', 'values.apk', fetchImpl))
      .toBe(HASH);
  });

  it('is null — never a throw — when the checksum asset 404s', async () => {
    // A release cut before the workflow uploaded checksums has none. That must
    // degrade to a weaker check, not fail the update.
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 404, text: async () => '' }));

    expect(await fetchExpectedChecksum('https://example.test/x.sha256', 'values.apk', fetchImpl))
      .toBeNull();
  });

  it('is null when the network fails mid-fetch', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('offline'); });

    expect(await fetchExpectedChecksum('https://example.test/x.sha256', 'values.apk', fetchImpl))
      .toBeNull();
  });
});
