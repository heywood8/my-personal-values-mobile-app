import {
  buildRecordsCsv,
  parseRecordsCsv,
  applyRecordsCsv,
  CSV_HEADER,
} from '../../app/services/RecordsCsv';
import {
  startAssessment,
  saveRating,
  completeAssessment,
  getRankedResults,
  getAssessments,
  getAssessmentByDate,
  getRatingsForAssessment,
} from '../../app/services/AssessmentsDB';
import { seedDefaultValues, getAllValues, addCustomValue } from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { valueName } from '../../app/utils/valueNames';
import { parseCsv, rowsToObjects } from '../../app/utils/csv';
import { SCALE_IDS } from '../../app/utils/scales';
import en from '../../assets/i18n/en.json';

/**
 * The file is the whole backup story for an app that talks to no server, so what
 * matters is the round trip: what comes out has to go back in as the same
 * records, on a fresh install that has never seen them.
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

beforeEach(async () => {
  __resetDatabaseHandleForTests();
  await seedDefaultValues();
});

describe('buildRecordsCsv', () => {
  it('writes a header and one row per rating', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5, love: 1 });

    const rows = parseCsv(await buildRecordsCsv(resolveName));
    expect(rows[0]).toEqual(CSV_HEADER);
    expect(rows).toHaveLength(3);
  });

  it('names each value in the reader\'s language and states its scale', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 4 });

    const [record] = rowsToObjects(parseCsv(await buildRecordsCsv(resolveName)));
    expect(record).toEqual({
      assessed_on: TODAY,
      scale: SCALE_IDS.NUMERIC_5,
      value_key: 'love',
      value_name: 'Love',
      score: '4',
      normalized: '0.75',
    });
  });

  it('reads like the results screen: oldest record first, strongest value first', async () => {
    await completeRun(EARLIER, SCALE_IDS.NUMERIC_5, { love: 5 });
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 1, health: 5, love: 3 });

    const records = rowsToObjects(parseCsv(await buildRecordsCsv(resolveName)));
    expect(records.map((r) => [r.assessed_on, r.value_key])).toEqual([
      [EARLIER, 'love'],
      [TODAY, 'health'],
      [TODAY, 'love'],
      [TODAY, 'learning'],
    ]);
  });

  it('leaves an unfinished calibration out', async () => {
    const open = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(open.id, 'love', 5, SCALE_IDS.NUMERIC_5);

    expect(parseCsv(await buildRecordsCsv(resolveName))).toHaveLength(1); // header only
  });
});

describe('parseRecordsCsv', () => {
  it('groups rows into one record per date', () => {
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,value_name,score,normalized',
      '2026-08-12,numeric5,love,Love,5,1',
      '2026-08-12,numeric5,learning,Self-development,2,0.25',
      '2026-07-01,numeric5,love,Love,1,0',
    ].join('\n'));

    expect(plan.error).toBeNull();
    expect(plan.records.map((r) => r.assessedOn)).toEqual([EARLIER, TODAY]);
    expect(plan.ratings).toBe(3);
  });

  it('rejects a file that is not a records file', () => {
    expect(parseRecordsCsv('name,phone\nAda,555').error).toBe('no_columns');
    expect(parseRecordsCsv('').error).toBe('empty');
  });

  it('skips a row with no date, no score or no identity', () => {
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,score',
      'yesterday,numeric5,love,5',
      '2026-08-12,numeric5,love,',
      '2026-08-12,numeric5,,3',
      '2026-08-12,numeric5,learning,4',
    ].join('\n'));

    expect(plan.ratings).toBe(1);
    expect(plan.skipped).toBe(3);
  });

  it('skips a score the record\'s scale cannot express', () => {
    // Clamping an 8 into a 1..5 record would invent an answer nobody gave.
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,score',
      '2026-08-12,numeric5,love,8',
      '2026-08-12,numeric5,learning,4',
    ].join('\n'));

    expect(plan.ratings).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it('infers a numeric scale when the file does not name one', () => {
    const five = parseRecordsCsv('assessed_on,value_key,score\n2026-08-12,love,4');
    expect(five.records[0].scale).toBe(SCALE_IDS.NUMERIC_5);

    const ten = parseRecordsCsv([
      'assessed_on,value_key,score',
      '2026-08-12,love,4',
      '2026-08-12,learning,9',
    ].join('\n'));
    expect(ten.records[0].scale).toBe(SCALE_IDS.NUMERIC_10);
  });

  it('takes the first named scale for a date and holds a record to it', () => {
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,score',
      '2026-08-12,numeric10,love,9',
      '2026-08-12,qualitative,learning,2',
    ].join('\n'));

    expect(plan.records[0].scale).toBe(SCALE_IDS.NUMERIC_10);
    expect(plan.ratings).toBe(2);
  });
});

describe('a round trip through the file', () => {
  it('restores the same records on an install that has never seen them', async () => {
    await completeRun(EARLIER, SCALE_IDS.NUMERIC_10, { love: 9, learning: 2 });
    await completeRun(TODAY, SCALE_IDS.QUALITATIVE, { love: 3, learning: 1, health: 2 });
    const csv = await buildRecordsCsv(resolveName);

    // A different device: the catalogue is seeded, nothing else exists.
    __resetDatabaseHandleForTests();
    await seedDefaultValues();

    const plan = parseRecordsCsv(csv);
    const summary = await applyRecordsCsv(plan.records, resolveName);

    expect(summary).toEqual({ records: 2, ratings: 5, valuesCreated: 0, skipped: 0 });
    expect((await getAssessments({ completedOnly: true })).map((a) => a.assessedOn))
      .toEqual([EARLIER, TODAY]);

    const restored = await getAssessmentByDate(TODAY);
    expect(restored.scale).toBe(SCALE_IDS.QUALITATIVE);
    expect((await getRankedResults(restored.id)).map((r) => [r.key, r.score])).toEqual([
      ['love', 3],
      ['health', 2],
      ['learning', 1],
    ]);
  });

  it('recomputes normalized from the score rather than trusting the column', async () => {
    // The column is informative — and editable in a spreadsheet. The pair has to
    // agree, so the one that cannot be edited into nonsense wins.
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,score,normalized',
      '2026-08-12,numeric5,love,5,0.01',
    ].join('\n'));
    await applyRecordsCsv(plan.records, resolveName);

    const [rating] = await getRatingsForAssessment((await getAssessmentByDate(TODAY)).id);
    expect(rating).toMatchObject({ score: 5, normalized: 1 });
  });

  it('replaces a date it already has instead of merging into it', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 1, learning: 1, health: 1 });
    const before = await getAssessmentByDate(TODAY);

    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,score',
      '2026-08-12,numeric5,love,5',
    ].join('\n'));
    await applyRecordsCsv(plan.records, resolveName);

    // The same-day rule still holds: one record for the date, reopened rather
    // than duplicated — and it now says exactly what the file said.
    expect(await getAssessments()).toHaveLength(1);
    const after = await getAssessmentByDate(TODAY);
    expect(after.id).toBe(before.id);
    expect((await getRankedResults(after.id)).map((r) => [r.key, r.score])).toEqual([['love', 5]]);
  });

  it('is idempotent — importing the same file twice changes nothing', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { love: 5, learning: 2 });
    const csv = await buildRecordsCsv(resolveName);

    await applyRecordsCsv(parseRecordsCsv(csv).records, resolveName);
    await applyRecordsCsv(parseRecordsCsv(csv).records, resolveName);

    expect(await getAssessments()).toHaveLength(1);
    expect(await buildRecordsCsv(resolveName)).toBe(csv);
  });

  it('marks an imported record complete, so it reaches the results screen', async () => {
    const plan = parseRecordsCsv('assessed_on,scale,value_key,score\n2026-08-12,numeric5,love,5');
    await applyRecordsCsv(plan.records, resolveName);

    expect(await getAssessments({ completedOnly: true })).toHaveLength(1);
  });
});

describe('values the file names but this install does not have', () => {
  it('adds a custom value for an unknown key, so nothing is silently dropped', async () => {
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,value_name,score',
      '2026-08-12,numeric5,3f1a-uuid,Sailing,4',
    ].join('\n'));
    const summary = await applyRecordsCsv(plan.records, resolveName);

    expect(summary).toMatchObject({ ratings: 1, valuesCreated: 1, skipped: 0 });
    const added = (await getAllValues()).find((v) => v.isCustom);
    expect(added.customName).toBe('Sailing');
  });

  it('matches a custom value it already has by name rather than adding a second', async () => {
    // The key is a UUID minted on the device that created it, so a file from
    // another device names the same value with a key this one has never seen.
    await addCustomValue({ name: 'Sailing' });

    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,value_name,score',
      '2026-08-12,numeric5,some-other-uuid,sailing,4',
    ].join('\n'));
    const summary = await applyRecordsCsv(plan.records, resolveName);

    expect(summary.valuesCreated).toBe(0);
    expect((await getAllValues()).filter((v) => v.isCustom)).toHaveLength(1);
  });

  it('matches a catalogue value by its translated name when the key is wrong', async () => {
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,value_name,score',
      '2026-08-12,numeric5,,Self-development,5',
    ].join('\n'));
    await applyRecordsCsv(plan.records, resolveName);

    const [rating] = await getRatingsForAssessment((await getAssessmentByDate(TODAY)).id);
    expect(rating.valueId).toBe('learning');
  });

  it('skips a row it can neither match nor name', async () => {
    const plan = parseRecordsCsv([
      'assessed_on,scale,value_key,value_name,score',
      '2026-08-12,numeric5,unknown-key,,4',
      '2026-08-12,numeric5,love,Love,5',
    ].join('\n'));
    const summary = await applyRecordsCsv(plan.records, resolveName);

    expect(summary).toMatchObject({ ratings: 1, valuesCreated: 0, skipped: 1 });
  });
});
