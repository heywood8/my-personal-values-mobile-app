import { isValidScaleId, isValidScore, normalizeScore } from '../utils/scales';
import { isValidAlignmentScore } from '../utils/alignment';

/**
 * A calibration result, as a link you can hand to somebody.
 *
 * There is no server behind this app and there is not going to be one, so a
 * shared result cannot be a row somewhere with a short id pointing at it. The
 * link carries the reading itself — the date, the scale, and one key-and-score
 * row per rated value — packed into a single opaque parameter. The page that
 * opens it needs nothing but that string, which is what lets the whole feature
 * work on a static export served from GitHub Pages.
 *
 * The string is an *encoding*, not encryption. Anybody holding the link can read
 * what is in it; who gets the link is the only access control there is, and the
 * screen that offers it says so. The fingerprint in front of the body
 * (`<hash>.<body>`) is an integrity check and nothing else — chat clients wrap
 * long URLs, people copy them by hand out of a message, and a code that lost its
 * last twenty characters has to say "this link is broken" rather than quietly
 * render a shorter ranking. It is not a signature and proves nothing about who
 * made the link.
 *
 * Three properties are load-bearing:
 *
 * - **Values travel as keys, not as names.** `love` is resolved by the app that
 *   opens the link, in the language *its* reader is using, so a ranking shared in
 *   Russian reads in English on the other side. A custom value has no key anyone
 *   else knows, so it — and only it — travels as text.
 * - **Nothing is written.** Opening a link renders a reading and never touches
 *   the local database. The same-day rule (see AssessmentsDB) would make an
 *   import overwrite the reader's own record for that date, and a friend's
 *   ranking is not a backup of yours. The CSV import is the door for records
 *   that are meant to land.
 * - **The format is versioned and additive**, for the same reason the CSV files
 *   are: a link lives in somebody's chat history, and the app that finally opens
 *   it may be older or newer than the one that wrote it. A code from a newer
 *   format is reported as such rather than half-read.
 *
 * The wheel travels too, when the sender asks for it — as its OWN column beside
 * each value's importance score, never folded into it. Importance and alignment
 * are two different questions and one number cannot answer both, which is the
 * same separation the two CSV files keep. What forced *those* apart was that an
 * already-shipped release would misread alignment scores appended to a records
 * file as importance ratings for that date; a trailing column an older reader
 * has never heard of is ignored instead, which is what lets one link carry both
 * lists without breaking the app that opened it yesterday.
 *
 * It is asked for per share and not remembered. "How much this matters to me"
 * and "how far I am from living it" are not equally comfortable things to hand
 * over, and a switch left on would answer the second one silently the next time.
 */

/** The query parameter a shared link carries. */
export const SHARE_PARAM = 'r';

/**
 * The payload layout. Bump it only when an older reader would *misread* a newer
 * code — adding a trailing column is not that, since a reader takes the columns
 * it knows and ignores the rest.
 *
 * Still 1 with the wheel in it, and that is the rule being applied rather than an
 * omission: the check-in's date is a fourth header column and a value's alignment
 * score is a fourth column on its row, so a release that predates both reads the
 * ranking exactly as it always did and never sees the rest.
 */
export const SHARE_FORMAT = 1;

/**
 * Where a shared link points when the app making it is not itself on the web.
 *
 * A phone has no URL of its own to hand out, and `com.heywood8.values://` only
 * opens for somebody who already has the app — which is the opposite of sharing
 * with a friend. So a link always points at the published web export (the site
 * `.github/workflows/deploy-web.yml` publishes), which opens in any browser and
 * needs nothing installed. A fork can point its own builds elsewhere with
 * EXPO_SHARE_URL; see app.config.js.
 */
export const DEFAULT_SHARE_URL = 'https://heywood8.github.io/my-personal-values-mobile-app/';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// What a code looks like from the outside: a base36 fingerprint, a dot, and a
// base64url body. Checked before the fingerprint is compared, so that "this was
// never a share code" and "this was one and arrived damaged" stay two different
// things to tell somebody.
const STAMP_SHAPE = /^[0-9a-z]+$/;
const BODY_SHAPE = /^[A-Za-z0-9_-]+$/;

// The payload is a list of rows of fields, and its escaping is a URL's own:
// every field is percent-encoded, which is what carries a Cyrillic value name
// through without a TextEncoder, a Buffer or any other thing that exists on two
// of this app's three platforms and not the third. The two delimiters are
// characters `encodeURIComponent` would otherwise leave alone, so they are
// escaped by hand below — a value named "Fun!" must not split a row in two.
const FIELD_SEPARATOR = '*';
const ROW_SEPARATOR = '!';
const LEFT_ALONE = /[!'()*~]/g;

const escapeField = (value) => encodeURIComponent(String(value ?? ''))
  .replace(LEFT_ALONE, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** Rows of fields as one line of ASCII. */
const serialize = (rows) => rows
  .map((row) => row.map(escapeField).join(FIELD_SEPARATOR))
  .join(ROW_SEPARATOR);

/** The inverse. Null — never a half-read list — if any field fails to decode. */
const deserialize = (text) => {
  try {
    return text.split(ROW_SEPARATOR).map((row) => row.split(FIELD_SEPARATOR).map(decodeURIComponent));
  } catch {
    // A percent escape that survived the alphabet check but does not decode:
    // damage that happened to land on a legal character boundary.
    return null;
  }
};

// Base64, URL alphabet, unpadded: exactly the characters that survive a URL, an
// SMS and a copy-paste out of a chat window without being escaped or linkified
// halfway through. The input is already ASCII, so one character is one byte.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE = new Map([...ALPHABET].map((char, index) => [char, index]));

const toBase64Url = (ascii) => {
  let out = '';

  for (let i = 0; i < ascii.length; i += 3) {
    const a = ascii.charCodeAt(i);
    const hasB = i + 1 < ascii.length;
    const hasC = i + 2 < ascii.length;
    const b = hasB ? ascii.charCodeAt(i + 1) : 0;
    const c = hasC ? ascii.charCodeAt(i + 2) : 0;

    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    if (hasB) out += ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    if (hasC) out += ALPHABET[c & 0x3f];
  }

  return out;
};

/** The inverse. Null — never a partial string — for anything not in the alphabet. */
const fromBase64Url = (body) => {
  let bits = 0;
  let width = 0;
  let ascii = '';

  for (const char of body) {
    const value = REVERSE.get(char);
    if (value === undefined) return null;
    bits = (bits << 6) | value;
    width += 6;
    if (width >= 8) {
      width -= 8;
      ascii += String.fromCharCode((bits >> width) & 0xff);
    }
  }

  return ascii;
};

/**
 * FNV-1a over the encoded body, base36.
 *
 * Short on purpose — seven characters at the front of a link that is already
 * long. It catches the damage links actually take (a truncated copy, a line
 * break swallowed by a chat client, a character dropped by hand) and is not
 * pretending to catch a determined edit: anyone can recompute it, which is the
 * point of a checksum and the reason this is not a signature.
 */
const fingerprint = (body) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body.charCodeAt(i);
    // Multiply by the FNV prime (16777619) in 32-bit space, via shifts, because
    // the plain product overflows a double's exact-integer range.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36);
};

/**
 * The ranking on screen, as the object a code is made of.
 *
 * @param {{assessedOn: string, scale: string}} assessment
 * @param {Array} results rows from `getRankedResults`, strongest first.
 * @param {(value: object) => string} resolveName renders a value's display name;
 *   used for custom values only, which are the ones no other install can name.
 * @param {{checkedOn: string, scores: Map<string, number>}} [alignment] one
 *   check-in to send beside the ranking, or nothing at all. Keyed by `valueId`,
 *   because that is what an alignment row is stored against — a value the
 *   ranking does not carry simply never finds its score here, which is also what
 *   keeps the wheel's own membership rule out of this file.
 */
export function buildSharePayload(assessment, results, resolveName, alignment = null) {
  const checkedScores = alignment?.scores;

  const entries = (results || []).map((row) => ({
    key: row.key,
    name: row.isCustom ? (resolveName?.(row) || row.customName || row.key) : '',
    score: row.score,
    normalized: row.normalized,
    alignment: checkedScores?.get(row.valueId) ?? null,
  }));

  return {
    format: SHARE_FORMAT,
    assessedOn: assessment.assessedOn,
    scale: assessment.scale,
    // Dated only where there is something to date. A header column naming a
    // check-in none of the rows carries a score from would be a date with no
    // reading behind it, and the screen on the other side prints that date.
    checkedOn: entries.some((entry) => entry.alignment !== null) ? alignment.checkedOn : null,
    entries,
  };
}

/**
 * A payload as the string that goes in the URL.
 *
 * The first row is the header — format, date, scale, and the check-in's date
 * where one is coming along — and every row after it is one rated value: its
 * key, its raw score, a name only where the other side could not work one out
 * for itself, and its alignment score where the sender chose to send the wheel.
 *
 * Columns are positional, so a later one drags the earlier ones along: a value
 * with an alignment score but no name of its own writes the name column empty
 * rather than letting its score slide into it. A column with nothing to say is
 * left off the end instead, which is what keeps a link carrying the ranking
 * alone exactly the length it has always been.
 */
export function encodeShareCode(payload) {
  const header = [
    // The payload's own format rather than this module's constant: everything
    // built here is current, but a reader has to be exercised against a code
    // from a version that is not.
    payload.format ?? SHARE_FORMAT,
    payload.assessedOn,
    payload.scale,
  ];
  if (payload.checkedOn) header.push(payload.checkedOn);

  const rows = [
    header,
    ...payload.entries.map((entry) => {
      const row = [entry.key, entry.score];
      // The name column is written only when it carries something the other side
      // cannot work out for itself — or when the alignment column behind it
      // needs a place to sit.
      if (entry.name || entry.alignment != null) row.push(entry.name || '');
      if (entry.alignment != null) row.push(entry.alignment);
      return row;
    }),
  ];

  const body = toBase64Url(serialize(rows));
  return `${fingerprint(body)}.${body}`;
}

/**
 * One value's wheel score, or null where the column is absent, empty, or does not
 * name one of the wheel's ten rings.
 */
const readAlignment = (field) => {
  const text = String(field ?? '').trim();
  if (!text) return null;
  const score = Number(text);
  return isValidAlignmentScore(score) ? score : null;
};

/**
 * Read a code back.
 *
 * @returns {{payload: object|null, skipped: number, error: string|null}} `error`
 *   is a stable identifier — 'empty' | 'malformed' | 'corrupt' | 'unsupported' |
 *   'no_entries' — not a message: the caller owns the wording and its language.
 */
export function decodeShareCode(code) {
  const trimmed = String(code ?? '').trim();
  const failed = (error) => ({ payload: null, skipped: 0, error });

  if (!trimmed) return failed('empty');

  const separator = trimmed.indexOf('.');
  if (separator <= 0 || separator === trimmed.length - 1) return failed('malformed');

  const stamp = trimmed.slice(0, separator);
  const body = trimmed.slice(separator + 1);
  if (!STAMP_SHAPE.test(stamp) || !BODY_SHAPE.test(body)) return failed('malformed');
  // Damage next: a link that arrived incomplete is a different thing to tell
  // somebody than a link that was never one.
  if (fingerprint(body) !== stamp) return failed('corrupt');

  const text = fromBase64Url(body);
  // Belt and braces: BODY_SHAPE has already rejected anything outside the
  // alphabet, so this can only fire if that check is ever loosened.
  if (text === null) return failed('malformed');

  const rows = deserialize(text);
  if (rows === null) return failed('malformed');

  const [header, ...entryRows] = rows;
  if (!header) return failed('malformed');

  const format = Number(header[0]);
  if (!Number.isInteger(format) || format < 1) return failed('malformed');
  if (format > SHARE_FORMAT) return failed('unsupported');

  const assessedOn = String(header[1] ?? '');
  const scale = String(header[2] ?? '');
  const checkedOn = String(header[3] ?? '').trim();
  if (!DATE_KEY.test(assessedOn)) return failed('malformed');
  // An unknown scale would silently rescale every score in the link. A code this
  // format can hold names one of the three scales this app has.
  if (!isValidScaleId(scale)) return failed('malformed');

  const entries = [];
  let skipped = 0;

  for (const row of entryRows) {
    const key = String(row[0] ?? '').trim();
    const score = Number(row[1]);
    const name = String(row[2] ?? '').trim();

    // Same rule as the CSV import: the score and the scale are trusted, and
    // `normalized` — what every band, colour and sort reads — is recomputed from
    // them rather than carried, so the pair cannot disagree.
    if (!key || !isValidScore(score, scale)) {
      skipped++;
      continue;
    }

    entries.push({
      key,
      name,
      score,
      normalized: normalizeScore(score, scale),
      // An unreadable alignment column costs the row its wheel reading and
      // nothing else — the importance rating beside it is still a perfectly good
      // answer, so this is not one of the skips.
      alignment: readAlignment(row[3]),
    });
  }

  if (entries.length === 0) return failed('no_entries');

  return {
    payload: {
      format,
      assessedOn,
      scale,
      // Kept only alongside the scores it dates, so a payload can never claim a
      // check-in that arrived with nothing in it.
      checkedOn: DATE_KEY.test(checkedOn) && entries.some((entry) => entry.alignment !== null)
        ? checkedOn
        : null,
      entries,
    },
    skipped,
    error: null,
  };
}

/**
 * A decoded payload as rows the ranked bar chart can draw.
 *
 * The name resolution is the interesting half. A key this install knows is
 * translated here, in this reader's language — which is why the code carries
 * keys at all. Anything else is rendered as the text the link brought with it
 * (a custom value), or as the key itself when it brought none (a value from a
 * catalogue newer than this build). Both are handed on as `isCustom`, since
 * "there is nothing to translate this into" is exactly what that flag means to
 * every renderer downstream.
 */
export function sharedResultItems(payload, t) {
  return (payload?.entries || []).map((entry) => {
    const nameKey = `value_${entry.key}`;
    const known = t(nameKey) !== nameKey;

    return {
      valueId: entry.key,
      key: entry.key,
      isCustom: !known,
      customName: known ? null : (entry.name || entry.key),
      score: entry.score,
      normalized: entry.normalized,
      // Null where the sender kept their wheel to themselves, which is most
      // links: everything reading this list has to handle a row without one.
      alignment: entry.alignment ?? null,
    };
  });
}

/** Pull a share code out of a URL, a query string or a fragment. Null if there is none. */
export function readShareCode(url) {
  const match = String(url ?? '').match(new RegExp(`[?&#]${SHARE_PARAM}=([^&#\\s]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
