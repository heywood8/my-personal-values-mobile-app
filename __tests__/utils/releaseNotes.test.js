import { formatReleaseDate, parseReleaseNotes, stripMarkdown } from '../../app/utils/releaseNotes';

/**
 * The input here is real: release-please writes the bodies these functions have
 * to survive, and the shape below is copied from this repository's own releases.
 */
const RELEASE_PLEASE_BODY = `## [0.4.0](https://github.com/heywood8/my-personal-values-mobile-app/compare/values-v0.3.0...values-v0.4.0) (2026-08-13)


### Features

* open the first run on the deck, with the settings on card one ([#28](https://github.com/heywood8/my-personal-values-mobile-app/issues/28)) ([0998c27](https://github.com/heywood8/my-personal-values-mobile-app/commit/0998c27))


### Bug Fixes

* **web:** stop re-asking the language and scale questions ([#25](https://github.com/heywood8/my-personal-values-mobile-app/issues/25))
`;

describe('stripMarkdown', () => {
  it('keeps link text and drops the URL', () => {
    // Two thirds of a release-please bullet is commit URL; on a phone the text
    // is the only part worth the width.
    expect(stripMarkdown('* fixed [#25](https://example.test/pull/25)')).toBe('• fixed #25');
  });

  it('turns list markers into bullets and unwraps emphasis', () => {
    expect(stripMarkdown('- **web:** a *fix* in `db.js`')).toBe('• web: a fix in db.js');
  });

  it('collapses the blank-line runs release-please leaves between sections', () => {
    expect(stripMarkdown('one\n\n\n\ntwo')).toBe('one\n\ntwo');
  });

  it('is empty rather than "null" for a release with no body', () => {
    expect(stripMarkdown(null)).toBe('');
    expect(stripMarkdown(undefined)).toBe('');
  });
});

describe('parseReleaseNotes', () => {
  it('lifts the date out of the heading and drops the line', () => {
    // The version and date are already shown beside the notes; printing the
    // heading too shows both twice.
    const { date, body } = parseReleaseNotes(RELEASE_PLEASE_BODY, '0.4.0');

    expect(date).toBe('2026-08-13');
    expect(body).not.toMatch(/0\.4\.0/);
    expect(body).toContain('• open the first run on the deck');
    expect(body).toContain('web: stop re-asking');
  });

  it('keeps a body that does not open with a version heading', () => {
    const { date, body } = parseReleaseNotes('Handwritten notes.\n\n- one thing', '0.4.0');

    expect(date).toBeNull();
    expect(body).toBe('Handwritten notes.\n\n• one thing');
  });

  it('does not eat a heading that is just a section title', () => {
    const { body } = parseReleaseNotes('### Features\n\n* a feature', '0.4.0');

    expect(body).toContain('Features');
    expect(body).toContain('• a feature');
  });

  it('handles an empty release body', () => {
    expect(parseReleaseNotes('', '0.4.0')).toEqual({ date: null, body: '' });
    expect(parseReleaseNotes(null, '0.4.0')).toEqual({ date: null, body: '' });
  });
});

describe('formatReleaseDate', () => {
  it('prefers the API timestamp, which carries a time of day', () => {
    const label = formatReleaseDate('2026-08-13T07:31:15Z', '2026-08-13', 'en-GB');

    expect(label).toContain('2026');
    expect(label).toContain('·');
  });

  it('falls back to the bare date lifted out of the heading', () => {
    expect(formatReleaseDate(null, '2026-08-13')).toBe('2026-08-13');
  });

  it('falls back when the timestamp is unparseable rather than printing "Invalid Date"', () => {
    expect(formatReleaseDate('not a date', '2026-08-13')).toBe('2026-08-13');
  });

  it('is null when there is no date at all', () => {
    expect(formatReleaseDate(null, null)).toBeNull();
  });
});
