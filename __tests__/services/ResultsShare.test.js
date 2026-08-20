import {
  SHARE_FORMAT,
  buildSharePayload,
  encodeShareCode,
  decodeShareCode,
  sharedResultItems,
  readShareCode,
} from '../../app/services/ResultsShare';
import { SCALE_IDS } from '../../app/utils/scales';
import catalogue from '../../app/defaults/defaultValues.json';
import en from '../../assets/i18n/en.json';

/**
 * The format is the contract between two installs that never meet: one writes a
 * link, some other version of the app reads it, possibly months later and in
 * another language. So what is asserted here is the round trip, and every way
 * the trip can fail — a link cut in half by a chat client, a code from a newer
 * release, a score that does not belong to the scale it claims.
 */

const t = (key) => en[key] || key;

const assessment = { assessedOn: '2026-08-12', scale: SCALE_IDS.NUMERIC_5 };

const results = [
  { key: 'love', valueId: 'love', isCustom: false, customName: null, score: 5, normalized: 1 },
  { key: 'health', valueId: 'health', isCustom: false, customName: null, score: 4, normalized: 0.75 },
  { key: 'learning', valueId: 'learning', isCustom: false, customName: null, score: 1, normalized: 0 },
];

const codeFor = (rows = results, meta = assessment, alignment = null) => encodeShareCode(
  buildSharePayload(meta, rows, (value) => value.customName || value.key, alignment),
);

/** A check-in as the share hook hands it over: keyed by value id, with its date. */
const checkin = (scores, checkedOn = '2026-08-13') => ({
  checkedOn,
  scores: new Map(Object.entries(scores)),
});

/** A code with a header and rows this release would never write itself. */
const handMade = ([format, assessedOn, scale, checkedOn = null], entries = [['love', 5]]) => encodeShareCode({
  format,
  assessedOn,
  scale,
  checkedOn,
  entries: entries.map(([key, score, name = '', alignment = null]) => ({
    key, score, name, alignment,
  })),
});

// A deliberate second implementation of the envelope, so a test can take a
// real code apart and put a different one together. If this ever disagrees
// with the module, one of the two has changed the format.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const fingerprint = (body) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36);
};

const bytesOf = (code) => {
  const body = code.slice(code.indexOf('.') + 1);
  let bits = 0;
  let width = 0;
  const out = [];
  for (const char of body) {
    bits = (bits << 6) | ALPHABET.indexOf(char);
    width += 6;
    if (width >= 8) {
      width -= 8;
      out.push((bits >> width) & 0xff);
    }
  }
  return out;
};

const codeOf = (bytes) => {
  let body = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1] || 0, bytes[i + 2] || 0];
    body += ALPHABET[a >> 2] + ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) body += ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) body += ALPHABET[c & 0x3f];
  }
  return `${fingerprint(body)}.${body}`;
};

describe('a shared code', () => {
  it('survives the round trip', () => {
    const { payload, error } = decodeShareCode(codeFor());

    expect(error).toBeNull();
    expect(payload.format).toBe(SHARE_FORMAT);
    expect(payload.assessedOn).toBe('2026-08-12');
    expect(payload.scale).toBe(SCALE_IDS.NUMERIC_5);
    expect(payload.entries.map((entry) => [entry.key, entry.score]))
      .toEqual([['love', 5], ['health', 4], ['learning', 1]]);
  });

  it('keeps the order it was given — strongest first, like everything else', () => {
    const { payload } = decodeShareCode(codeFor());
    expect(payload.entries.map((entry) => entry.key)).toEqual(['love', 'health', 'learning']);
  });

  it('is made only of characters a URL can carry unescaped', () => {
    // Anything else and a chat client, a mail client or a QR generator gets to
    // decide where the link ends.
    expect(codeFor()).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('recomputes the normalised score rather than carrying it', () => {
    // The same rule as the CSV import: the score and the scale are what travel,
    // and the 0..1 reading every chart and band uses is derived from them, so the
    // pair cannot arrive disagreeing.
    const lying = [{ key: 'love', isCustom: false, score: 4, normalized: 0.1 }];
    const { payload } = decodeShareCode(codeFor(lying));

    expect(payload.entries[0].normalized).toBe(0.75);
  });

  it('carries a custom value by name, because no other install knows its key', () => {
    const { payload } = decodeShareCode(codeFor([
      { key: 'love', isCustom: false, score: 5, normalized: 1 },
      { key: 'a-uuid-from-another-phone', isCustom: true, customName: 'Sailing', score: 3, normalized: 0.5 },
    ]));

    expect(payload.entries[0].name).toBe('');
    expect(payload.entries[1].name).toBe('Sailing');
  });

  it('carries a name with a comma, a quote or Cyrillic in it', () => {
    const awkward = 'Спокойствие, "покой" и тире — всё сразу';
    const { payload } = decodeShareCode(codeFor([
      { key: 'x', isCustom: true, customName: awkward, score: 2, normalized: 0.25 },
    ]));

    expect(payload.entries[0].name).toBe(awkward);
  });

  it('holds the whole shipped deck in a link of a workable length', () => {
    // The real catalogue, because the length that matters is the one people
    // actually send: 47 real keys, every card rated.
    const deck = catalogue.values.map((value, i) => ({
      key: value.key, isCustom: false, score: (i % 5) + 1, normalized: 0,
    }));
    const code = codeFor(deck);

    expect(decodeShareCode(code).payload.entries).toHaveLength(catalogue.values.length);
    // Not a hard limit — a comfortable one, with room for the deck to grow. This
    // is around eighty characters with the URL in front of it: short enough to
    // read down the phone, to survive a chat client's line wrapping, and to be
    // copied by hand out of a message without losing the end of it.
    expect(code.length).toBeLessThan(120);
  });
});

describe('a code that cannot be trusted', () => {
  it('reports an edited body rather than reading it', () => {
    const code = codeFor();
    const edited = `${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`;

    expect(decodeShareCode(edited).error).toBe('corrupt');
  });

  it('reports a link that arrived in half', () => {
    // What actually happens to a long link: a chat client wraps it and only the
    // first line gets copied.
    expect(decodeShareCode(codeFor().slice(0, 30)).error).toBe('corrupt');
  });

  it('reports something that was never a code at all', () => {
    expect(decodeShareCode('hello').error).toBe('malformed');
    // Shaped nothing like a code, but full of dots — "not a share link" rather
    // than "your share link is damaged", which is a different thing to be told.
    expect(decodeShareCode('https://example.com/values/').error).toBe('malformed');
    expect(decodeShareCode('').error).toBe('empty');
    expect(decodeShareCode(null).error).toBe('empty');
  });

  it('reports a code from a newer format instead of half-reading it', () => {
    // The link lives in somebody's chat history and is opened by whatever
    // version they have. Reading a format this build does not know would be
    // reading columns that have moved.
    const { payload } = decodeShareCode(codeFor());
    const future = encodeShareCode({ ...payload, format: SHARE_FORMAT + 1 });

    expect(decodeShareCode(future).error).toBe('unsupported');
  });

  it('refuses a scale it does not have, rather than rescaling every score', () => {
    expect(decodeShareCode(handMade([SHARE_FORMAT, '2026-08-12', 'numeric7'])).error).toBe('malformed');
    expect(decodeShareCode(handMade([SHARE_FORMAT, 'last tuesday', 'numeric5'])).error).toBe('malformed');
  });

  it('drops a score the scale cannot express, and says how many', () => {
    const { payload, skipped } = decodeShareCode(
      handMade([SHARE_FORMAT, '2026-08-12', 'numeric5'], [['love', 5], ['health', 9], ['', 3]]),
    );

    expect(payload.entries.map((entry) => entry.key)).toEqual(['love']);
    expect(skipped).toBe(2);
  });

  it('reports a code with nothing left in it', () => {
    expect(decodeShareCode(handMade([SHARE_FORMAT, '2026-08-12', 'numeric5'], [['love', 9]])).error)
      .toBe('no_entries');
  });
});

describe('rendering what arrived', () => {
  it('names a catalogue value in the language of whoever opened the link', () => {
    const { payload } = decodeShareCode(codeFor());
    const [first] = sharedResultItems(payload, t);

    expect(first.isCustom).toBe(false);
    expect(first.key).toBe('love');
    // Not the sender's word for it — the reader's. Which is the whole reason the
    // code carries keys instead of names.
    expect(first.customName).toBeNull();
  });

  it('falls back to the text a custom value brought with it', () => {
    const { payload } = decodeShareCode(codeFor([
      { key: 'a-uuid', isCustom: true, customName: 'Sailing', score: 3, normalized: 0.5 },
    ]));
    const [item] = sharedResultItems(payload, t);

    expect(item.isCustom).toBe(true);
    expect(item.customName).toBe('Sailing');
  });

  it('falls back to the key for a value this build has never heard of', () => {
    // A link written by a newer release, whose catalogue has a card this one
    // does not: better the key than the string "value_sobriety".
    const { payload } = decodeShareCode(handMade(
      [SHARE_FORMAT, '2026-08-12', 'numeric5'], [['sobriety', 5]],
    ));
    const [item] = sharedResultItems(payload, t);

    expect(item.customName).toBe('sobriety');
  });

  it('gives every row the shape the ranked bars read', () => {
    const { payload } = decodeShareCode(codeFor());

    for (const item of sharedResultItems(payload, t)) {
      expect(item).toEqual(expect.objectContaining({
        valueId: expect.any(String),
        key: expect.any(String),
        score: expect.any(Number),
        normalized: expect.any(Number),
      }));
    }
  });
});

describe('the wheel, when it is sent along', () => {
  const withWheel = () => codeFor(results, assessment, checkin({ love: 8, health: 3 }));

  it('carries one check-in score per value, and the date it was filled in', () => {
    const { payload } = decodeShareCode(withWheel());

    expect(payload.checkedOn).toBe('2026-08-13');
    expect(payload.entries.map((entry) => [entry.key, entry.alignment]))
      .toEqual([['love', 8], ['health', 3], ['learning', null]]);
  });

  it('leaves the ranking exactly where it was', () => {
    // The wheel is its own block, so sending it cannot move, rescale or reorder
    // a single importance score. Two questions, two blocks — the same separation
    // the backup file's `kind` column keeps.
    const ranking = (code) => decodeShareCode(code).payload.entries
      .map((entry) => [entry.key, entry.score, entry.name]);

    expect(ranking(withWheel())).toEqual(ranking(codeFor()));
  });

  it('keeps a custom value’s name and its wheel score together', () => {
    // A value with no slot leaves the packed block entirely and travels as text,
    // wheel score and all — so the two halves of it must not come apart on the
    // way out.
    const rows = [
      { key: 'love', valueId: 'love', isCustom: false, score: 5, normalized: 1 },
      { key: 'a-uuid', valueId: 'a-uuid', isCustom: true, customName: 'Sailing', score: 3, normalized: 0.5 },
    ];
    const { payload } = decodeShareCode(
      codeFor(rows, assessment, checkin({ love: 9, 'a-uuid': 4 })),
    );

    expect(payload.entries).toEqual([
      expect.objectContaining({ key: 'love', name: '', score: 5, alignment: 9 }),
      expect.objectContaining({ key: 'a-uuid', name: 'Sailing', score: 3, alignment: 4 }),
    ]);
  });

  it('says nothing about the wheel when the sender kept it', () => {
    const { payload } = decodeShareCode(codeFor());

    expect(payload.checkedOn).toBeNull();
    expect(payload.entries.every((entry) => entry.alignment === null)).toBe(true);
  });

  it('drops a score the wheel cannot express without losing the row', () => {
    // The importance rating beside it is still a perfectly good answer, so this
    // costs the row its wheel reading and nothing else.
    const { payload, skipped } = decodeShareCode(handMade(
      [SHARE_FORMAT, '2026-08-12', 'numeric5', '2026-08-13'],
      [['love', 5, '', 11], ['health', 4, '', 7]],
    ));

    expect(payload.entries.map((entry) => entry.alignment)).toEqual([null, 7]);
    expect(skipped).toBe(0);
  });

  it('refuses to date a check-in that arrived with nothing in it', () => {
    const { payload } = decodeShareCode(handMade(
      [SHARE_FORMAT, '2026-08-12', 'numeric5', '2026-08-13'], [['love', 5]],
    ));

    expect(payload.checkedOn).toBeNull();
  });

  it('hands the wheel score on to whatever draws the list', () => {
    const { payload } = decodeShareCode(withWheel());
    const items = sharedResultItems(payload, t);

    expect(items.map((item) => item.alignment)).toEqual([8, 3, null]);
  });

  it('still holds the whole shipped deck, wheel and all, in a workable link', () => {
    const deck = catalogue.values.map((value, i) => ({
      key: value.key, valueId: value.key, isCustom: false, score: (i % 5) + 1, normalized: 0,
    }));
    const scores = Object.fromEntries(deck.slice(0, 12).map((value) => [value.key, 7]));
    const code = codeFor(deck, assessment, checkin(scores));

    expect(decodeShareCode(code).payload.entries).toHaveLength(catalogue.values.length);
    expect(code.length).toBeLessThan(160);
  });
});

describe('a code from before the deck was fixed', () => {
  /**
   * Format 1 named every value in every row. Nothing writes it now, but it is in
   * people's chat histories, so it is read forever — and this is the only place
   * that still writes one, precisely so the reader is exercised against a code
   * this release would never produce.
   */
  const legacy = (rows = results, meta = assessment, alignment = null) => encodeShareCode({
    ...buildSharePayload(meta, rows, (value) => value.customName || value.key, alignment),
    format: 1,
  });

  it('still reads, and says which format it came in', () => {
    const { payload, error } = decodeShareCode(legacy());

    expect(error).toBeNull();
    expect(payload.format).toBe(1);
    expect(payload.assessedOn).toBe('2026-08-12');
    expect(payload.entries.map((entry) => [entry.key, entry.score]))
      .toEqual([['love', 5], ['health', 4], ['learning', 1]]);
  });

  it('still carries the names and the wheel it was written with', () => {
    const rows = [
      { key: 'love', valueId: 'love', isCustom: false, score: 5, normalized: 1 },
      { key: 'a-uuid', valueId: 'a-uuid', isCustom: true, customName: 'Sailing', score: 3, normalized: 0.5 },
    ];
    const { payload } = decodeShareCode(legacy(rows, assessment, checkin({ love: 9, 'a-uuid': 4 })));

    expect(payload.checkedOn).toBe('2026-08-13');
    expect(payload.entries).toEqual([
      expect.objectContaining({ key: 'love', name: '', score: 5, alignment: 9 }),
      expect.objectContaining({ key: 'a-uuid', name: 'Sailing', score: 3, alignment: 4 }),
    ]);
  });

  it('is the length the current one is measured against', () => {
    // Three quarters of a format 1 code was the keys — `assertiveness` spelled
    // out once per card, in a link whose both ends already knew the deck by
    // heart. That is the whole of the difference.
    const deck = catalogue.values.map((value, i) => ({
      key: value.key, isCustom: false, score: (i % 5) + 1, normalized: 0,
    }));

    expect(legacy(deck).length).toBeGreaterThan(800);
    expect(codeFor(deck).length * 8).toBeLessThan(legacy(deck).length);
  });

  it('is refused if it claims to be the current format', () => {
    // A body of rows can only be format 1. One claiming otherwise did not come
    // from this module, and its columns are not where its header says they are —
    // so it is refused rather than read on the strength of its header.
    const rows = '2*2026-08-12*numeric5!love*5';
    const forged = codeOf(Array.from(rows, (char) => char.charCodeAt(0)));

    expect(decodeShareCode(forged).error).toBe('malformed');
  });
});

describe('what makes the code short', () => {
  it('never spells a shipped value out', () => {
    // The point of the whole format: `love` is a position, and the app that
    // opens the link is what names it — in its own reader's language.
    const body = String.fromCharCode(...bytesOf(codeFor()));

    expect(body).not.toContain('love');
    expect(body).not.toContain('health');
  });

  it('says nothing at all about the values nobody rated', () => {
    // A ranking of one is a handful of bytes, not a deck's worth of zeroes.
    const one = codeFor([{ key: 'acceptance', isCustom: false, score: 5, normalized: 1 }]);

    expect(one.length).toBeLessThan(25);
    expect(decodeShareCode(one).payload.entries).toEqual([
      expect.objectContaining({ key: 'acceptance', score: 5 }),
    ]);
  });

  it('still carries a value the catalogue has retired', () => {
    // Its ratings outlive its card, so its slot outlives its card too.
    const [retired] = catalogue.retired;
    const { payload } = decodeShareCode(codeFor([
      { key: retired, isCustom: false, score: 4, normalized: 0.75 },
    ]));

    expect(payload.entries[0].key).toBe(retired);
  });

  it('recovers the ranking’s order instead of carrying it', () => {
    // Scores travel in the deck's order, which is exactly the order
    // `getRankedResults` breaks ties by — so strongest-first can be worked out
    // on arrival rather than spelled out on the way.
    const { payload } = decodeShareCode(handMade(
      [SHARE_FORMAT, '2026-08-12', 'numeric5'],
      [['adventure', 3], ['acceptance', 5], ['love', 3]],
    ));

    expect(payload.entries.map((entry) => entry.key)).toEqual(['acceptance', 'adventure', 'love']);
  });

  it('skips a block from a later release rather than choking on it', () => {
    // What replaced format 1's "ignore the columns you do not know": a block
    // says how long it is, so an older reader can step over it and read the rest.
    const bytes = bytesOf(codeFor());
    const spliced = [...bytes.slice(0, 5), 99, 0, 2, 0xab, 0xcd, ...bytes.slice(5)];
    const { payload, error } = decodeShareCode(codeOf(spliced));

    expect(error).toBeNull();
    expect(payload.entries.map((entry) => entry.key)).toEqual(['love', 'health', 'learning']);
  });

  it('refuses a block that claims to be longer than the code', () => {
    // The other half of trusting a length: a truncated body must not be read as
    // far as the length says it goes.
    const bytes = bytesOf(codeFor());
    const lying = [...bytes.slice(0, 5), bytes[5], 0xff, 0xff, ...bytes.slice(8)];

    expect(decodeShareCode(codeOf(lying)).error).toBe('malformed');
  });
});

describe('finding a code in a URL', () => {
  it('reads the parameter out of a link, a query string or a fragment', () => {
    expect(readShareCode('https://example.com/values/?r=abc.def')).toBe('abc.def');
    expect(readShareCode('?r=abc.def')).toBe('abc.def');
    expect(readShareCode('#r=abc.def')).toBe('abc.def');
    expect(readShareCode('?lang=en&r=abc.def#top')).toBe('abc.def');
  });

  it('is null when there is no code to find', () => {
    expect(readShareCode('https://example.com/values/')).toBeNull();
    expect(readShareCode('')).toBeNull();
    expect(readShareCode(null)).toBeNull();
  });
});
