import {
  ALIGNMENT_CSV_HEADER,
  buildAlignmentCsv,
  parseAlignmentCsv,
  applyAlignmentCsv,
} from '../../app/services/AlignmentCsv';
import { CSV_HEADER, parseRecordsCsv } from '../../app/services/RecordsCsv';
import {
  startCheckin,
  saveAlignment,
  getCheckins,
  getAlignmentHistory,
} from '../../app/services/AlignmentDB';
import { seedDefaultValues, getAllValues } from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

/**
 * The check-ins file, out and back in.
 *
 * The load-bearing property is that it is a SECOND file: a records file and a
 * check-ins file must each be unreadable as the other, or an older release —
 * which knows nothing about the wheel — would import ten alignment scores as ten
 * importance ratings and replace the record they were meant to sit beside.
 */

const TODAY = '2026-02-02';
const EARLIER = '2026-02-01';

beforeEach(async () => {
  __resetDatabaseHandleForTests();
  await seedDefaultValues();
});

const checkIn = async (dateKey, scores) => {
  const checkin = await startCheckin({ today: dateKey });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveAlignment(checkin.id, valueId, score);
  }
};

// toCsv writes CRLF, which is what RFC 4180 says and what a spreadsheet expects.
const linesOf = (csv) => csv.trim().split(/\r?\n/);
const rowsOf = (csv) => linesOf(csv).slice(1);

describe('the file', () => {
  it('names its columns, denominator included', async () => {
    await checkIn(TODAY, { love: 7 });

    const csv = await buildAlignmentCsv();
    expect(linesOf(csv)[0]).toBe(ALIGNMENT_CSV_HEADER.join(','));
    // A 7 means nothing without the 10 beside it, and a file already saved to
    // somebody's phone cannot be migrated the way a database row can.
    expect(rowsOf(csv)[0]).toBe('2026-02-02,love,love,7,10');
  });

  it('writes one row per score, oldest date first', async () => {
    await checkIn(EARLIER, { love: 3 });
    await checkIn(TODAY, { love: 8, health: 5 });

    expect(rowsOf(await buildAlignmentCsv())).toHaveLength(3);
    expect(rowsOf(await buildAlignmentCsv())[0]).toContain(EARLIER);
  });

  it("renders names through the caller's resolver", async () => {
    await checkIn(TODAY, { love: 7 });
    const csv = await buildAlignmentCsv(() => 'Любовь');
    expect(rowsOf(csv)[0]).toBe('2026-02-02,love,Любовь,7,10');
  });

  it('cannot be mistaken for a records file, in either direction', async () => {
    await checkIn(TODAY, { love: 7 });

    // The records importer asks for `assessed_on`; this file does not have one,
    // so it declines instead of writing alignment scores in as ratings.
    expect(parseRecordsCsv(await buildAlignmentCsv()).error).toBe('no_columns');

    const records = [CSV_HEADER.join(','), '2026-02-02,numeric5,love,Love,5,1'].join('\n');
    expect(parseAlignmentCsv(records).error).toBe('no_columns');
  });
});

describe('reading one back', () => {
  const file = (...rows) => [ALIGNMENT_CSV_HEADER.join(','), ...rows].join('\n');

  it('groups rows into one record per date', () => {
    const plan = parseAlignmentCsv(file(
      '2026-02-01,love,Love,3,10',
      '2026-02-02,love,Love,8,10',
      '2026-02-02,health,Health,5,10',
    ));

    expect(plan.error).toBeNull();
    expect(plan.records.map((r) => r.checkedOn)).toEqual(['2026-02-01', '2026-02-02']);
    expect(plan.ratings).toBe(3);
  });

  it('reads a file written before the denominator column existed', () => {
    const plan = parseAlignmentCsv([
      'checked_on,value_key,value_name,score',
      '2026-02-02,love,Love,8',
    ].join('\n'));

    // There has only ever been one wheel, so a file with no `rings` is a
    // ten-ring file by definition.
    expect(plan.ratings).toBe(1);
    expect(plan.skipped).toBe(0);
  });

  it('skips a row measured on a wheel this release cannot draw', () => {
    const plan = parseAlignmentCsv(file(
      '2026-02-02,love,Love,3,5',
      '2026-02-02,health,Health,8,10',
    ));

    // Rescaling would restate an answer nobody gave.
    expect(plan.ratings).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it('skips a row that is not a position on the wheel, and counts it', () => {
    const plan = parseAlignmentCsv(file(
      '2026-02-02,love,Love,0,10',
      '2026-02-02,health,Health,11,10',
      '2026-02-02,order,Order,seven,10',
      'not-a-date,humour,Humour,5,10',
      '2026-02-02,mastery,Mastery,6,10',
    ));

    expect(plan.ratings).toBe(1);
    expect(plan.skipped).toBe(4);
  });

  it('says so when there is nothing usable in it', () => {
    expect(parseAlignmentCsv('').error).toBe('empty');
    expect(parseAlignmentCsv(file('not-a-date,love,Love,5,10')).error).toBe('empty');
  });
});

describe('writing one in', () => {
  const file = (...rows) => [ALIGNMENT_CSV_HEADER.join(','), ...rows].join('\n');
  const apply = (text, resolveName) => applyAlignmentCsv(
    parseAlignmentCsv(text).records,
    resolveName,
  );

  it('writes every score against the date the file names', async () => {
    await apply(file('2026-02-01,love,Love,3,10', '2026-02-02,health,Health,8,10'));

    expect(await getAlignmentHistory()).toMatchObject([
      { checkedOn: '2026-02-01', key: 'love', score: 3 },
      { checkedOn: '2026-02-02', key: 'health', score: 8 },
    ]);
  });

  it('is idempotent: importing twice leaves what importing once did', async () => {
    const text = file('2026-02-02,love,Love,8,10', '2026-02-02,health,Health,5,10');
    await apply(text);
    await apply(text);

    expect(await getCheckins()).toHaveLength(1);
    expect(await getAlignmentHistory()).toHaveLength(2);
  });

  it('replaces a date rather than merging into it', async () => {
    await checkIn('2026-02-02', { love: 2, order: 9 });
    await apply(file('2026-02-02,love,Love,8,10'));

    // A file is a statement about that date; a score it does not mention is not
    // one this record still makes.
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 8 }]);
  });

  it('matches a value this install has never seen by name, then adds it', async () => {
    const summary = await apply(file('2026-02-02,sea_swimming,Sea swimming,7,10'));

    expect(summary.valuesCreated).toBe(1);
    const added = (await getAllValues()).find((value) => value.customName === 'Sea swimming');
    expect(added).toBeTruthy();
    expect(await getAlignmentHistory()).toMatchObject([{ valueId: added.id, score: 7 }]);
  });

  it('matches by rendered name when the key is unknown', async () => {
    const summary = await apply(
      file('2026-02-02,unknown_key,Любовь,7,10'),
      (value) => (value.key === 'love' ? 'Любовь' : value.key),
    );

    expect(summary.valuesCreated).toBe(0);
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 7 }]);
  });

  it('survives a full round trip', async () => {
    await checkIn(EARLIER, { love: 3, health: 10 });
    await checkIn(TODAY, { love: 8 });
    const exported = await buildAlignmentCsv();

    __resetDatabaseHandleForTests();
    await seedDefaultValues();
    await apply(exported);

    expect(await buildAlignmentCsv()).toBe(exported);
  });
});
