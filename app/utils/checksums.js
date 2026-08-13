/**
 * Reading a `sha256sum` output file.
 *
 * The release workflow uploads one beside each APK, named `<apk>.sha256`, so an
 * install that downloads its own update can tell a complete transfer from a
 * truncated or tampered one. Its own module rather than part of the update
 * service, because both halves of that service — the platform-neutral check and
 * the Android-only installer — need it, and neither should have to import the
 * other to get it.
 */

/**
 * The hex hash `sha256sum` recorded for `filename`, or null.
 *
 * The format is `<hash>␣␣<name>`, with a `*` prefixing the name in binary mode
 * and a path sometimes in front of it. A file that names something else is not
 * an error here — it is simply not about this APK.
 */
export const parseChecksumFile = (text, filename) => {
  if (!text || !filename) return null;

  for (const line of String(text).trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;

    const hash = parts[0];
    const name = parts[parts.length - 1].replace(/^\*/, '');
    if ((name === filename || name.endsWith(`/${filename}`)) && /^[0-9a-f]{64}$/i.test(hash)) {
      return hash.toLowerCase();
    }
  }

  return null;
};

/**
 * Fetch a release's checksum file and pull out the hash for `filename`.
 *
 * Null on any failure — an unreachable or unparseable checksum means "cannot
 * verify", which callers answer with a weaker check, never by refusing the
 * update or by treating the APK as bad.
 */
export const fetchExpectedChecksum = async (checksumUrl, filename, fetchImpl = fetch) => {
  try {
    const response = await fetchImpl(checksumUrl);
    if (!response.ok) return null;
    return parseChecksumFile(await response.text(), filename);
  } catch {
    return null;
  }
};
