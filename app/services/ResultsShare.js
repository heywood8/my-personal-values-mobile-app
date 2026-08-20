import { isValidScaleId, isValidScore, normalizeScore, SCALE_IDS } from '../utils/scales';
import { isValidAlignmentScore } from '../utils/alignment';
import { SHARE_SLOTS, shareIndexOf, shareKeyAt } from './shareIndex';

/**
 * A calibration result, as a link you can hand to somebody.
 *
 * There is no server behind this app and there is not going to be one, so a
 * shared result cannot be a row somewhere with a short id pointing at it. The
 * link carries the reading itself — the date, the scale, and one score per rated
 * value — packed into a single opaque parameter. The page that opens it needs
 * nothing but that string, which is what lets the whole feature work on a static
 * export served from GitHub Pages.
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
 * - **Values travel as identity, not as names.** A slot number resolves to a
 *   key and the key is named by the app that *opens* the link, in the language
 *   its reader is using, so a ranking shared in Russian reads in English on the
 *   other side. Text travels only for a value the other side could not possibly
 *   name for itself.
 * - **Nothing is written.** Opening a link renders a reading and never touches
 *   the local database. The same-day rule (see AssessmentsDB) would make an
 *   import overwrite the reader's own record for that date, and a friend's
 *   ranking is not a backup of yours. The CSV import is the door for records
 *   that are meant to land.
 * - **The format is versioned**, for the same reason the CSV files are: a link
 *   lives in somebody's chat history, and the app that finally opens it may be
 *   older or newer than the one that wrote it. A code from a newer format is
 *   reported as such rather than half-read, and every older format this module
 *   has ever written is still read.
 *
 * The wheel travels too, when the sender asks for it — as its OWN block beside
 * the ranking, never folded into it. Importance and alignment are two different
 * questions and one number cannot answer both, which is the same separation the
 * backup file's `kind` column keeps.
 *
 * It is asked for per share and not remembered. "How much this matters to me"
 * and "how far I am from living it" are not equally comfortable things to hand
 * over, and a switch left on would answer the second one silently the next time.
 *
 * ## What the body looks like
 *
 * Since the deck stopped being editable, both ends of a link hold the same 47
 * cards — so the code does not name them. Format 2 is a byte string: a five-byte
 * header, then sections, then base64url. Roughly 60 characters for a full
 * ranking where format 1 needed 820, because three quarters of that was the
 * keys — `assertiveness` spelled out once per card, on both sides of a link
 * where both sides already knew it.
 *
 *     [format][scale][assessedOn: 3 bytes signed day]
 *     [type][length: 2 bytes][bytes] ...
 *
 * A value is a *slot* in `shareIndex.js` and its score is the four bits at that
 * slot — zero meaning "not rated", which no scale can express, so nothing is
 * ambiguous. The wheel is a second block of the same shape, dated, and present
 * only when it was asked for. Anything the slot list cannot hold — a value from
 * a newer catalogue, one of the custom values old installs still carry — goes in
 * a third section as text, which is the only place a name is ever written.
 *
 * The sections are what carries the property the columns used to: a reader takes
 * the types it knows and **skips the rest by length**, so a later release can add
 * a block without this one misreading it. That is stronger than the trailing
 * column it replaces, which only worked as long as the new thing was last.
 *
 * Format 1 — rows of percent-encoded fields, each naming its value — is still
 * read, and still written, though only by the tests: a reader has to be
 * exercised against a code from a version that is not current, and codes from
 * that version are in people's chat histories.
 */

/** The query parameter a shared link carries. */
export const SHARE_PARAM = 'r';

/**
 * The payload layout.
 *
 * 2 since the ranking became positional. That needed the bump — a format 1
 * reader takes the first field of a row as a value's key, and would have read a
 * slot number as the name of a value it has never heard of rather than refusing
 * the code. With the bump it says "this link is from a newer version", which is
 * the truth and is actionable.
 *
 * Bump it again only when an older reader would *misread* a newer code. Adding a
 * section is not that: unknown types are skipped by their length.
 */
export const SHARE_FORMAT = 2;

/** The last format that spelled its values out. Read forever, written by tests. */
const LEGACY_FORMAT = 1;

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
export const DEFAULT_SHARE_URL = 'https://values.heywood8.com/';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// What a code looks like from the outside: a base36 fingerprint, a dot, and a
// base64url body. Checked before the fingerprint is compared, so that "this was
// never a share code" and "this was one and arrived damaged" stay two different
// things to tell somebody.
const STAMP_SHAPE = /^[0-9a-z]+$/;
const BODY_SHAPE = /^[A-Za-z0-9_-]+$/;

// The text sections' escaping is a URL's own: every field is percent-encoded,
// which is what carries a Cyrillic value name through without a TextEncoder, a
// Buffer or any other thing that exists on two of this app's three platforms and
// not the third. The two delimiters are characters `encodeURIComponent` would
// otherwise leave alone, so they are escaped by hand below — a value named
// "Fun!" must not split a row in two.
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
// halfway through. One character in, one byte — which is as true of the packed
// body as it was of the percent-encoded one.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE = new Map([...ALPHABET].map((char, index) => [char, index]));

const toBase64Url = (bytes) => {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i);
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes.charCodeAt(i + 1) : 0;
    const c = hasC ? bytes.charCodeAt(i + 2) : 0;

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
  let bytes = '';

  for (const char of body) {
    const value = REVERSE.get(char);
    if (value === undefined) return null;
    bits = (bits << 6) | value;
    width += 6;
    if (width >= 8) {
      width -= 8;
      bytes += String.fromCharCode((bits >> width) & 0xff);
    }
  }

  return bytes;
};

/**
 * FNV-1a over the encoded body, base36.
 *
 * Short on purpose — seven characters at the front of a link. It catches the
 * damage links actually take (a truncated copy, a line break swallowed by a chat
 * client, a character dropped by hand) and is not pretending to catch a
 * determined edit: anyone can recompute it, which is the point of a checksum and
 * the reason this is not a signature.
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
 * The scales, as the byte one of them travels in.
 *
 * Frozen in the same sense `SHARE_INDEX` is: a slot here is a promise to every
 * link already sent. A scale this app does not have is written as `UNKNOWN_SCALE`
 * rather than guessed at, because reading a ranking on the wrong scale rescales
 * every score in it silently.
 */
const SHARE_SCALES = [SCALE_IDS.NUMERIC_5, SCALE_IDS.NUMERIC_10, SCALE_IDS.QUALITATIVE];
const UNKNOWN_SCALE = 0xff;

const SECTION_SCORES = 1;
const SECTION_WHEEL = 2;
const SECTION_EXTRA = 3;

// Header: format, scale, and the three bytes of the date.
const HEADER_BYTES = 5;

// A day count, signed, so a date before 1970 is a date and not a wraparound; the
// three bytes reach some twenty thousand years either way, which is more than any
// date a 'YYYY-MM-DD' key can spell. The lowest value is kept back to mean "this
// payload's date was not a date at all", so a malformed one arrives as malformed
// rather than as an arbitrary day in the Bronze Age.
const MS_PER_DAY = 86400000;
const DAY_NONE = -0x800000;

const dayNumber = (key) => {
  const text = String(key ?? '');
  if (!DATE_KEY.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  // Built at a safe year and moved, because Date.UTC reads a two-digit year as
  // 19xx and a share code is not the place to lose a century.
  const utc = new Date(Date.UTC(2000, month - 1, day));
  utc.setUTCFullYear(year);
  return Math.round(utc.getTime() / MS_PER_DAY);
};

const dateFromDay = (day) => {
  if (day === DAY_NONE) return '';
  const date = new Date(day * MS_PER_DAY);
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
};

const writeDay = (day) => [(day >> 16) & 0xff, (day >> 8) & 0xff, day & 0xff];

const readDay = (bytes, at) => {
  const raw = ((bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2]) >>> 0;
  return raw & 0x800000 ? raw - 0x1000000 : raw;
};

/**
 * One score per slot, two slots to the byte, and no trailing zeroes.
 *
 * The tail is dropped because it is a run of "not rated" and the reader knows
 * how many slots there are: a wheel scored on eight values writes three bytes,
 * not thirty-seven, and a ranking that never touched the retired end of the list
 * stops where the shipped deck does.
 */
const packNibbles = (nibbles) => {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    bytes.push((((nibbles[i] || 0) & 0x0f) << 4) | ((nibbles[i + 1] || 0) & 0x0f));
  }
  while (bytes.length > 0 && bytes[bytes.length - 1] === 0) bytes.pop();
  return bytes;
};

/**
 * The inverse, for as many slots as this build has — a byte the block never got
 * round to writing reads as two unrated slots. A block from a release whose
 * catalogue is longer is read up to this one's last slot and no further; the
 * values beyond it are ones this app could not name anyway.
 */
const unpackNibbles = (bytes, count) => {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const byte = bytes[i >> 1] || 0;
    out.push(i % 2 === 0 ? (byte >> 4) & 0x0f : byte & 0x0f);
  }
  return out;
};

const pushSection = (bytes, type, body) => {
  bytes.push(type, (body.length >> 8) & 0xff, body.length & 0xff, ...body);
};

const asciiBytes = (text) => Array.from(text, (char) => char.charCodeAt(0));

// Four bits hold 1..15. Every scale's steps and every one of the wheel's rings
// fit; a number that does not is not silently truncated — its value takes the
// long way round, as text, or loses its wheel reading, which the reader would
// have refused anyway.
const fitsNibble = (value) => Number.isInteger(value) && value >= 1 && value <= 0x0f;

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
    // Dated only where there is something to date. A header naming a check-in
    // none of the rows carries a score from would be a date with no reading
    // behind it, and the screen on the other side prints that date.
    checkedOn: entries.some((entry) => entry.alignment !== null) ? alignment.checkedOn : null,
    entries,
  };
}

/**
 * A payload as the byte string that goes in the body — the current format.
 *
 * Everything that can be a slot is one. An entry is only kept out of the packed
 * block for a reason the block cannot express: a key this build has no slot for,
 * a name that would otherwise be lost, or a score too large for four bits. Those
 * go to the text section, which is what the whole code used to be.
 */
const packBody = (payload, format) => {
  const scaleSlot = SHARE_SCALES.indexOf(payload.scale);
  const bytes = [
    format & 0xff,
    scaleSlot < 0 ? UNKNOWN_SCALE : scaleSlot,
    ...writeDay(dayNumber(payload.assessedOn) ?? DAY_NONE),
  ];

  const scores = new Array(SHARE_SLOTS).fill(0);
  const wheel = new Array(SHARE_SLOTS).fill(0);
  const extra = [];

  for (const entry of payload.entries || []) {
    const slot = shareIndexOf(entry.key);
    const score = Number(entry.score);

    if (slot < 0 || entry.name || !fitsNibble(score)) {
      extra.push(entry);
      continue;
    }

    scores[slot] = score;
    const alignment = Number(entry.alignment);
    if (fitsNibble(alignment)) wheel[slot] = alignment;
  }

  pushSection(bytes, SECTION_SCORES, packNibbles(scores));

  if (payload.checkedOn) {
    pushSection(bytes, SECTION_WHEEL, [
      ...writeDay(dayNumber(payload.checkedOn) ?? DAY_NONE),
      ...packNibbles(wheel),
    ]);
  }

  if (extra.length > 0) {
    const rows = extra.map((entry) => {
      const row = [entry.key, entry.name || '', entry.score];
      if (entry.alignment != null) row.push(entry.alignment);
      return row;
    });
    pushSection(bytes, SECTION_EXTRA, asciiBytes(serialize(rows)));
  }

  return String.fromCharCode(...bytes);
};

/**
 * A payload as format 1's body: a header row, then one row per value naming it.
 *
 * Nothing in the app writes this any more. It is kept because the reader for it
 * has to be exercised against a code this release would not produce, and because
 * the shape it documents is the shape of every link sent before the deck stopped
 * being editable.
 */
const writeLegacyBody = (payload) => {
  const header = [LEGACY_FORMAT, payload.assessedOn, payload.scale];
  if (payload.checkedOn) header.push(payload.checkedOn);

  return serialize([
    header,
    ...(payload.entries || []).map((entry) => {
      const row = [entry.key, entry.score];
      // The name column is written only when it carries something the other side
      // cannot work out for itself — or when the alignment column behind it
      // needs a place to sit.
      if (entry.name || entry.alignment != null) row.push(entry.name || '');
      if (entry.alignment != null) row.push(entry.alignment);
      return row;
    }),
  ]);
};

/** A payload as the string that goes in the URL. */
export function encodeShareCode(payload) {
  // The payload's own format rather than this module's constant: everything
  // built here is current, but a reader has to be exercised against a code from
  // a version that is not.
  const format = payload.format ?? SHARE_FORMAT;
  const body = toBase64Url(
    format === LEGACY_FORMAT ? writeLegacyBody(payload) : packBody(payload, format),
  );

  return `${fingerprint(body)}.${body}`;
}

/**
 * One value's wheel score, or null where it is absent, empty, or does not name
 * one of the wheel's ten rings.
 */
const readAlignment = (field) => {
  const text = String(field ?? '').trim();
  if (!text) return null;
  const score = Number(text);
  return isValidAlignmentScore(score) ? score : null;
};

/**
 * The header and the raw rows of a packed body, or the reason it cannot be read.
 *
 * Rows come back in the order they will be shown — strongest first, like every
 * other list in this app. That ordering is *recovered* rather than carried: a
 * packed block is in catalogue order, and `getRankedResults` sorts by score and
 * then by the deck's own order, which is what a slot number is. Sending the
 * ranking's order as well would be sending the same fact twice.
 */
const readPackedBody = (bytes) => {
  const format = bytes[0];
  if (format > SHARE_FORMAT) return { error: 'unsupported' };
  if (bytes.length < HEADER_BYTES) return { error: 'malformed' };

  const scale = SHARE_SCALES[bytes[1]] ?? '';
  const assessedOn = dateFromDay(readDay(bytes, 2));

  let scores = null;
  let wheel = null;
  let checkedOn = '';
  let extraRows = [];

  let at = HEADER_BYTES;
  while (at < bytes.length) {
    if (at + 3 > bytes.length) return { error: 'malformed' };
    const type = bytes[at];
    const length = (bytes[at + 1] << 8) | bytes[at + 2];
    const start = at + 3;
    const end = start + length;
    if (end > bytes.length) return { error: 'malformed' };
    const body = bytes.slice(start, end);

    if (type === SECTION_SCORES) {
      scores = unpackNibbles(body, SHARE_SLOTS);
    } else if (type === SECTION_WHEEL && body.length >= 3) {
      checkedOn = dateFromDay(readDay(body, 0));
      wheel = unpackNibbles(body.slice(3), SHARE_SLOTS);
    } else if (type === SECTION_EXTRA) {
      extraRows = deserialize(String.fromCharCode(...body));
      if (extraRows === null) return { error: 'malformed' };
    }
    // Any other type is a block from a release this one predates. Skipping it by
    // its length is the whole reason the length is written.

    at = end;
  }

  if (scores === null) return { error: 'malformed' };

  const rows = [];

  scores.forEach((score, slot) => {
    if (!score) return;
    rows.push({
      order: slot,
      key: shareKeyAt(slot),
      name: '',
      score,
      alignment: wheel?.[slot] || null,
    });
  });

  extraRows.forEach((row, index) => {
    rows.push({
      order: SHARE_SLOTS + index,
      key: String(row[0] ?? '').trim(),
      name: String(row[1] ?? '').trim(),
      score: Number(row[2]),
      alignment: row[3],
    });
  });

  const rank = (row) => (Number.isFinite(row.score) ? row.score : -Infinity);
  rows.sort((a, b) => rank(b) - rank(a) || a.order - b.order);

  return { format, assessedOn, scale, checkedOn, rows };
};

/** The same, for a body that spells its values out. */
const readLegacyBody = (text) => {
  const rows = deserialize(text);
  if (rows === null) return { error: 'malformed' };

  const [header, ...entryRows] = rows;
  if (!header) return { error: 'malformed' };

  const format = Number(header[0]);
  if (!Number.isInteger(format) || format < 1) return { error: 'malformed' };
  if (format > SHARE_FORMAT) return { error: 'unsupported' };
  // A body of rows can only be format 1. Anything else claiming to be one is not
  // a code this module ever wrote, and its columns are not where it says.
  if (format !== LEGACY_FORMAT) return { error: 'malformed' };

  return {
    format,
    assessedOn: String(header[1] ?? ''),
    scale: String(header[2] ?? ''),
    checkedOn: String(header[3] ?? '').trim(),
    rows: entryRows.map((row, index) => ({
      order: index,
      key: String(row[0] ?? '').trim(),
      name: String(row[2] ?? '').trim(),
      score: Number(row[1]),
      alignment: row[3],
    })),
  };
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

  const bytes = fromBase64Url(body);
  // Belt and braces: BODY_SHAPE has already rejected anything outside the
  // alphabet, so this can only fire if that check is ever loosened.
  if (bytes === null || bytes.length === 0) return failed('malformed');

  // Which of the two shapes this is. A packed body opens with its format as a
  // byte — 2, 3, one day — and a body of rows opens with the digit that spells
  // it, which is 0x31 and up. Nothing in between is either.
  const packed = bytes.charCodeAt(0) < 0x20;
  const read = packed
    ? readPackedBody(Array.from(bytes, (char) => char.charCodeAt(0)))
    : readLegacyBody(bytes);

  if (read.error) return failed(read.error);

  const { format, assessedOn, scale, checkedOn, rows } = read;

  if (!DATE_KEY.test(assessedOn)) return failed('malformed');
  // An unknown scale would silently rescale every score in the link. A code this
  // format can hold names one of the three scales this app has.
  if (!isValidScaleId(scale)) return failed('malformed');

  const entries = [];
  let skipped = 0;

  for (const row of rows) {
    // Same rule as the CSV import: the score and the scale are trusted, and
    // `normalized` — what every band, colour and sort reads — is recomputed from
    // them rather than carried, so the pair cannot disagree.
    if (!row.key || !isValidScore(row.score, scale)) {
      skipped++;
      continue;
    }

    entries.push({
      key: row.key,
      name: row.name,
      score: row.score,
      normalized: normalizeScore(row.score, scale),
      // An unreadable alignment costs the row its wheel reading and nothing else
      // — the importance rating beside it is still a perfectly good answer, so
      // this is not one of the skips.
      alignment: readAlignment(row.alignment),
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
 * identity instead of names. Anything else is rendered as the text the link
 * brought with it (a custom value), or as the key itself when it brought none (a
 * value from a catalogue newer than this build). Both are handed on as
 * `isCustom`, since "there is nothing to translate this into" is exactly what
 * that flag means to every renderer downstream.
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
