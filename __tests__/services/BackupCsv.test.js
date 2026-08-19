import {
  BACKUP_CSV_HEADER,
  buildBackupCsv,
  parseBackupCsv,
  applyBackupCsv,
} from '../../app/services/BackupCsv';
import {
  startAssessment,
  saveRating,
  completeAssessment,
  getRankedResults,
  getAssessments,
  getAssessmentByDate,
  getRatingsForAssessment,
} from '../../app/services/AssessmentsDB';
import {
  startCheckin,
  saveAlignment,
  getCheckins,
  getAlignmentHistory,
} from '../../app/services/AlignmentDB';
import { seedDefaultValues, getAllValues } from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { valueName } from '../../app/utils/valueNames';
import { parseCsv, rowsToObjects } from '../../app/utils/csv';
import { SCALE_IDS } from '../../app/utils/scales';
import en from '../../assets/i18n/en.json';

/**
 * The file is the whole backup story for an app that talks to no server, so what
 * matters is the round trip: what comes out has to go back in as the same data,
 * on a fresh install that has never seen it — and it is one file now, so "the
 * same data" means both lists, not the ranking with the wheel left behind.
 *
 * The other half is what the file does to an app that is not this one. A backup
 * must not read as a records file to a release that predates the format, or ten
 * alignment scores would land as ten importance ratings; and the two files older
 * releases wrote have to keep importing here, because they are sitting on
 * people's phones.
 */

const t = (key) => en[key] || key;
const resolveName = (value) => valueName(value, t);

const TODAY = '2026-08-12';
const EARLIER = '2026-07-01';

const completeRun = async (dateKey, scale, scores) => {
  const assessment = await startAssessment(scale, { today: dateKey });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveRating(assessment.id, valueId, score, scale);
  }
  await completeAssessment(assessment.id);
  return assessment;
};

const checkIn = async (dateKey, scores) => {
  const checkin = await startCheckin({ today: dateKey });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveAlignment(checkin.id, valueId, score);
  }
};

// toCsv writes CRLF, which is what RFC 4180 says and what a spreadsheet expects.
const linesOf = (csv) => csv.trim().split(/\r?\n/);
const rowsOf = (csv) => linesOf(csv).slice(1);

/** A file in the current format. */
const file = (...rows) => [BACKUP_CSV_HEADER.join(','), ...rows].join('\n');

const importFrom = (text, resolver = resolveName) => applyBackupCsv(parseBackupCsv(text), resolver);

beforeEach(async () => {
  __resetDatabaseHandleForTests();
  await seedDefaultValues();
});

describe('the file', () => {
  it('writes a header and one row per rating and per score', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5, love: 1 });
    await checkIn(TODAY, { love: 7 });

    const rows = parseCsv(await buildBackupCsv(resolveName));
    expect(rows[0]).toEqual(BACKUP_CSV_HEADER);
    expect(rows).toHaveLength(4);
  });

  it('names each value in the reader\'s language and states its scale', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 4 });

    const [record] = rowsToObjects(parseCsv(await buildBackupCsv(resolveName)));
    expect(record).toEqual({
      date: TODAY,
      kind: 'importance',
      normalized: '0.75',
      rings: '',
      scale: SCALE_IDS.NUMERIC_5,
      score: '4',
      value_key: 'love',
      value_name: 'Love',
    });
  });

  it('carries the denominator on a check-in row, and no scale', async () => {
    await checkIn(TODAY, { love: 7 });

    // A 7 means nothing without the 10 beside it, and a file already saved to
    // somebody's phone cannot be migrated the way a database row can.
    expect(rowsOf(await buildBackupCsv(resolveName))[0])
      .toBe('alignment,2026-08-12,,love,Love,7,,10');
  });

  it('reads like the app: the ranking first, oldest and strongest first', async () => {
    await completeRun(EARLIER, SCALE_IDS.NUMERIC_5, { love: 5 });
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 1, health: 5, love: 3 });
    await checkIn(TODAY, { love: 8 });

    const records = rowsToObjects(parseCsv(await buildBackupCsv(resolveName)));
    expect(records.map((r) => [r.kind, r.date, r.value_key])).toEqual([
      ['importance', EARLIER, 'love'],
      ['importance', TODAY, 'health'],
      ['importance', TODAY, 'love'],
      ['importance', TODAY, 'learning'],
      // The check-ins come after the ranking they hang off, which is the order
      // they have to be applied in.
      ['alignment', TODAY, 'love'],
    ]);
  });

  it('leaves an unfinished calibration out', async () => {
    const open = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(open.id, 'love', 5, SCALE_IDS.NUMERIC_5);

    expect(parseCsv(await buildBackupCsv(resolveName))).toHaveLength(1); // header only
  });

  it('cannot be read as a records file by a release that predates it', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 5 });
    await checkIn(TODAY, { love: 7 });

    // What every shipped release keys off is `assessed_on`. This file has no
    // such column, so an older app refuses it by name instead of importing a
    // wheel score as an importance rating.
    const columns = linesOf(await buildBackupCsv(resolveName))[0].split(',');
    expect(columns).not.toContain('assessed_on');
    expect(columns).not.toContain('checked_on');
  });
});

describe('reading a file back', () => {
  it('groups rows into one record per date, per list', () => {
    const plan = parseBackupCsv(file(
      'importance,2026-07-01,numeric5,love,Love,1,0,',
      'importance,2026-08-12,numeric5,love,Love,5,1,',
      'importance,2026-08-12,numeric5,learning,Self-development,2,0.25,',
      'alignment,2026-08-12,,love,Love,8,,10',
    ));

    expect(plan.error).toBeNull();
    expect(plan.importance.records.map((r) => r.assessedOn)).toEqual([EARLIER, TODAY]);
    expect(plan.importance.ratings).toBe(3);
    expect(plan.alignment.records.map((r) => r.checkedOn)).toEqual([TODAY]);
    expect(plan.alignment.ratings).toBe(1);
  });

  it('rejects a file that is not one of ours', () => {
    expect(parseBackupCsv('name,phone\nAda,555').error).toBe('no_columns');
    expect(parseBackupCsv('').error).toBe('empty');
  });

  it('counts a row that names neither list rather than guessing at it', () => {
    const plan = parseBackupCsv(file(
      'mood,2026-08-12,,love,Love,5,,',
      'importance,2026-08-12,numeric5,love,Love,5,1,',
    ));

    expect(plan.importance.ratings).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it('skips a row with no date, no score or no identity', () => {
    const plan = parseBackupCsv(file(
      'importance,yesterday,numeric5,love,,5,,',
      'importance,2026-08-12,numeric5,love,,,,',
      'importance,2026-08-12,numeric5,,,3,,',
      'importance,2026-08-12,numeric5,learning,,4,,',
    ));

    expect(plan.importance.ratings).toBe(1);
    expect(plan.skipped).toBe(3);
  });

  it('skips a score the record\'s scale cannot express', () => {
    // Clamping an 8 into a 1..5 record would invent an answer nobody gave.
    const plan = parseBackupCsv(file(
      'importance,2026-08-12,numeric5,love,,8,,',
      'importance,2026-08-12,numeric5,learning,,4,,',
    ));

    expect(plan.importance.ratings).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it('infers a numeric scale when the file does not name one', () => {
    const five = parseBackupCsv(file('importance,2026-08-12,,love,,4,,'));
    expect(five.importance.records[0].scale).toBe(SCALE_IDS.NUMERIC_5);

    const ten = parseBackupCsv(file(
      'importance,2026-08-12,,love,,4,,',
      'importance,2026-08-12,,learning,,9,,',
    ));
    expect(ten.importance.records[0].scale).toBe(SCALE_IDS.NUMERIC_10);
  });

  it('takes the first named scale for a date and holds a record to it', () => {
    const plan = parseBackupCsv(file(
      'importance,2026-08-12,numeric10,love,,9,,',
      'importance,2026-08-12,qualitative,learning,,2,,',
    ));

    expect(plan.importance.records[0].scale).toBe(SCALE_IDS.NUMERIC_10);
    expect(plan.importance.ratings).toBe(2);
  });

  it('skips a check-in row measured on a wheel this release cannot draw', () => {
    const plan = parseBackupCsv(file(
      'alignment,2026-08-12,,love,,3,,5',
      'alignment,2026-08-12,,health,,8,,10',
    ));

    // Rescaling would restate an answer nobody gave.
    expect(plan.alignment.ratings).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it('skips a check-in row that is not a position on the wheel, and counts it', () => {
    const plan = parseBackupCsv(file(
      'alignment,2026-08-12,,love,,0,,10',
      'alignment,2026-08-12,,health,,11,,10',
      'alignment,2026-08-12,,order,,seven,,10',
      'alignment,not-a-date,,humour,,5,,10',
      'alignment,2026-08-12,,mastery,,6,,10',
    ));

    expect(plan.alignment.ratings).toBe(1);
    expect(plan.skipped).toBe(4);
  });

  it('says so when there is nothing usable in it', () => {
    expect(parseBackupCsv(file('importance,not-a-date,numeric5,love,,5,,')).error).toBe('empty');
  });
});

describe('a file holding only half of it', () => {
  // Not an error in either direction: a backup taken before the reader had ever
  // filled in the wheel has no check-ins, and a file trimmed in a spreadsheet
  // can arrive either way round.
  it('imports a ranking with no check-ins beside it', async () => {
    const summary = await importFrom(file('importance,2026-08-12,numeric5,love,,5,,'));

    expect(summary.importance).toEqual({ ratings: 1, records: 1 });
    expect(summary.alignment).toEqual({ ratings: 0, records: 0 });
    expect(await getCheckins()).toHaveLength(0);
  });

  it('imports check-ins with no ranking beside them', async () => {
    const summary = await importFrom(file('alignment,2026-08-12,,love,,7,,10'));

    expect(summary.importance).toEqual({ ratings: 0, records: 0 });
    expect(summary.alignment).toEqual({ ratings: 1, records: 1 });
    expect(await getAssessments()).toHaveLength(0);
  });
});

describe('files older releases wrote', () => {
  // Both are sitting on people's phones, and the reader who needs them is the
  // one who has just lost everything else.
  it('reads a records file', async () => {
    const summary = await importFrom([
      'assessed_on,scale,value_key,value_name,score,normalized',
      '2026-08-12,numeric5,love,Love,5,1',
      '2026-08-12,numeric5,learning,Self-development,2,0.25',
    ].join('\n'));

    expect(summary.importance).toEqual({ ratings: 2, records: 1 });
    expect((await getRankedResults((await getAssessmentByDate(TODAY)).id)).map((r) => r.key))
      .toEqual(['love', 'learning']);
  });

  it('reads a check-ins file, denominator column or not', async () => {
    // There has only ever been one wheel, so a file with no `rings` is a
    // ten-ring file by definition.
    const summary = await importFrom([
      'checked_on,value_key,value_name,score',
      '2026-08-12,love,Love,8',
    ].join('\n'));

    expect(summary.alignment).toEqual({ ratings: 1, records: 1 });
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 8 }]);
  });
});

describe('a round trip through the file', () => {
  it('restores both lists on an install that has never seen them', async () => {
    await completeRun(EARLIER, SCALE_IDS.NUMERIC_10, { love: 9, learning: 2 });
    await completeRun(TODAY, SCALE_IDS.QUALITATIVE, { love: 3, learning: 1, health: 2 });
    await checkIn(EARLIER, { love: 3, health: 10 });
    await checkIn(TODAY, { love: 8 });
    const csv = await buildBackupCsv(resolveName);

    // A different device: the catalogue is seeded, nothing else exists.
    __resetDatabaseHandleForTests();
    await seedDefaultValues();

    const summary = await importFrom(csv);

    expect(summary).toEqual({
      alignment: { ratings: 3, records: 2 },
      importance: { ratings: 5, records: 2 },
      skipped: 0,
    });
    expect((await getAssessments({ completedOnly: true })).map((a) => a.assessedOn))
      .toEqual([EARLIER, TODAY]);

    const restored = await getAssessmentByDate(TODAY);
    expect(restored.scale).toBe(SCALE_IDS.QUALITATIVE);
    expect((await getRankedResults(restored.id)).map((r) => [r.key, r.score])).toEqual([
      ['love', 3],
      ['health', 2],
      ['learning', 1],
    ]);
    expect(await buildBackupCsv(resolveName)).toBe(csv);
  });

  it('recomputes normalized from the score rather than trusting the column', async () => {
    // The column is informative — and editable in a spreadsheet. The pair has to
    // agree, so the one that cannot be edited into nonsense wins.
    await importFrom(file('importance,2026-08-12,numeric5,love,,5,0.01,'));

    const [rating] = await getRatingsForAssessment((await getAssessmentByDate(TODAY)).id);
    expect(rating).toMatchObject({ normalized: 1, score: 5 });
  });

  it('replaces a date it already has instead of merging into it', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 1, learning: 1, health: 1 });
    await checkIn(TODAY, { love: 2, order: 9 });
    const before = await getAssessmentByDate(TODAY);

    await importFrom(file(
      'importance,2026-08-12,numeric5,love,,5,,',
      'alignment,2026-08-12,,love,,8,,10',
    ));

    // The same-day rule still holds: one record for the date, reopened rather
    // than duplicated — and it now says exactly what the file said. A score the
    // file does not mention is not one this record still makes.
    expect(await getAssessments()).toHaveLength(1);
    const after = await getAssessmentByDate(TODAY);
    expect(after.id).toBe(before.id);
    expect((await getRankedResults(after.id)).map((r) => [r.key, r.score])).toEqual([['love', 5]]);
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 8 }]);
  });

  it('is idempotent — importing the same file twice changes nothing', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 5, learning: 2 });
    await checkIn(TODAY, { love: 8, health: 5 });
    const csv = await buildBackupCsv(resolveName);

    await importFrom(csv);
    await importFrom(csv);

    expect(await getAssessments()).toHaveLength(1);
    expect(await getCheckins()).toHaveLength(1);
    expect(await buildBackupCsv(resolveName)).toBe(csv);
  });

  it('marks an imported record complete, so it reaches the results screen', async () => {
    await importFrom(file('importance,2026-08-12,numeric5,love,,5,,'));

    expect(await getAssessments({ completedOnly: true })).toHaveLength(1);
  });
});

describe('values the file names but this install does not have', () => {
  it('matches a catalogue value by its translated name when the key is wrong', async () => {
    await importFrom(file('importance,2026-08-12,numeric5,,Self-development,5,,'));

    const [rating] = await getRatingsForAssessment((await getAssessmentByDate(TODAY)).id);
    expect(rating.valueId).toBe('learning');
  });

  it('matches a check-in row by rendered name when the key is unknown', async () => {
    const summary = await importFrom(
      file('alignment,2026-08-12,,unknown_key,Любовь,7,,10'),
      (value) => (value.key === 'love' ? 'Любовь' : value.key),
    );

    expect(summary.skipped).toBe(0);
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 7 }]);
  });

  it('skips a row naming a value the deck does not have, and counts it', async () => {
    // Nothing is invented to hold it: the deck is the shipped catalogue, and a
    // value of the reader's own is not something this app makes any more.
    const summary = await importFrom(file(
      'importance,2026-08-12,numeric5,3f1a-uuid,Sailing,4,,',
      'importance,2026-08-12,numeric5,love,Love,5,,',
    ));

    expect(summary.importance).toEqual({ ratings: 1, records: 1 });
    expect(summary.skipped).toBe(1);
    expect((await getAllValues()).some((v) => v.isCustom)).toBe(false);
  });

  it('leaves a date alone when it can match nothing on it', async () => {
    // Clearing a record first is how an import replaces a date. A file whose
    // every row for that date is unusable has nothing to put in its place, so it
    // must not get as far as clearing.
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 5 });

    const summary = await importFrom(file('importance,2026-08-12,numeric5,3f1a-uuid,Sailing,4,,'));

    expect(summary.importance).toEqual({ ratings: 0, records: 0 });
    expect(summary.skipped).toBe(1);
    const kept = await getAssessmentByDate(TODAY);
    expect((await getRankedResults(kept.id)).map((r) => [r.key, r.score])).toEqual([['love', 5]]);
  });
});
