/**
 * Turning a GitHub release body into something readable in a phone dialog.
 *
 * release-please writes markdown: a `## 0.4.0 (2026-08-13)` heading, bullet
 * lists, bold text, and a commit link after every entry. React Native has no
 * markdown renderer here and does not need one — the notes are a short list of
 * changes, and what makes them unreadable on a small screen is the link syntax
 * and the trailing hashes, not the absence of styling.
 */

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

/**
 * Markdown down to plain text.
 *
 * Link text is kept and the URL dropped, which is the whole of the gain: a
 * release-please bullet is about a third commit-URL by length.
 */
export const stripMarkdown = (markdown) => String(markdown || '')
  .replace(/\r\n/g, '\n')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  // `[^\S\n]` rather than `\s`: `\s` matches newlines, so with `^…\s*` in
  // multiline mode the match starts on the blank line *above* a bullet and eats
  // the paragraph break with it.
  .replace(/^[^\S\n]*[-*+][^\S\n]+/gm, '• ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/**
 * Split a release body into its date and its body text.
 *
 * The first line is a heading repeating the version and the release date, both
 * of which the surrounding UI already shows — so the date is lifted out and the
 * line dropped rather than printed twice. A body that does not start that way is
 * returned whole.
 *
 * @returns {{date: string|null, body: string}}
 */
export const parseReleaseNotes = (notes, version) => {
  const lines = String(notes || '').replace(/\r\n/g, '\n').split('\n');

  const firstContent = lines.findIndex((line) => line.trim());
  if (firstContent < 0) return { date: null, body: '' };

  const heading = lines[firstContent];
  const trimmed = heading.trim();
  const looksLikeHeading = /^#{1,6}\s/.test(heading)
    && (DATE_RE.test(trimmed) || (version && trimmed.includes(version)));

  if (!looksLikeHeading) return { date: null, body: stripMarkdown(lines.join('\n')) };

  return {
    date: trimmed.match(DATE_RE)?.[1] || null,
    body: stripMarkdown(lines.slice(firstContent + 1).join('\n')),
  };
};

/**
 * "13 Aug 2026 · 09:31" for a release.
 *
 * Prefers GitHub's `published_at`, which carries a time; falls back to the bare
 * date lifted out of the release-note heading, which does not.
 */
export const formatReleaseDate = (publishedAt, fallbackDate = null, locale = undefined) => {
  if (publishedAt) {
    const parsed = new Date(publishedAt);
    if (!Number.isNaN(parsed.getTime())) {
      const date = parsed.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
      const time = parsed.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return `${date} · ${time}`;
    }
  }
  return fallbackDate;
};
