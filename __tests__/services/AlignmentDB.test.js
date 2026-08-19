import {
  startCheckin,
  saveAlignment,
  clearAlignment,
  clearAlignmentsForCheckin,
  deleteCheckin,
  getCheckins,
  getCheckinByDate,
  getAlignmentHistory,
} from '../../app/services/AlignmentDB';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests, queryAll, executeQuery } from '../../app/services/db';
import { localDateKey } from '../../app/utils/dateUtils';

/**
 * The second list's storage, and mostly the same three questions its older twin
 * answers: one record per calendar day, one score per value in it, and what
 * happens to a score when the value under it goes away.
 *
 * The database here is real SQLite (see jest.setup.js), so the same-day rule and
 * the cascades are genuinely exercised rather than asserted against a stub that
 * agrees with the test.
 */

const TODAY = localDateKey();
const YESTERDAY = '2026-01-02';
const EARLIER = '2026-01-01';

beforeEach(async () => {
  __resetDatabaseHandleForTests();
  await seedDefaultValues();
});

/** Fill in a wheel on a given date. */
const checkIn = async (dateKey, scores) => {
  const checkin = await startCheckin({ today: dateKey });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveAlignment(checkin.id, valueId, score);
  }
  return checkin;
};

describe('the same-day rule', () => {
  it('creates one check-in the first time a day is written to', async () => {
    const checkin = await startCheckin({ today: TODAY });

    expect(checkin.checkedOn).toBe(TODAY);
    expect(checkin.isRecheck).toBe(false);
    expect(await getCheckinByDate(TODAY)).toMatchObject({ id: checkin.id });
  });

  it('resolves back to the same row on the same day, scores and all', async () => {
    const first = await checkIn(TODAY, { love: 4 });
    const again = await startCheckin({ today: TODAY });

    expect(again.id).toBe(first.id);
    expect(again.isRecheck).toBe(true);
    // Reopening is not clearing: today's answers are still there to be edited.
    const history = await getAlignmentHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ valueId: 'love', score: 4 });
  });

  it('starts a new record on another day', async () => {
    const yesterday = await checkIn(YESTERDAY, { love: 4 });
    const today = await checkIn(TODAY, { love: 8 });

    expect(today.id).not.toBe(yesterday.id);
    expect((await getCheckins()).map((c) => c.checkedOn)).toEqual([YESTERDAY, TODAY]);
  });

  it('refuses a second row for a date at the database level', async () => {
    await startCheckin({ today: TODAY });
    await expect(executeQuery(
      `INSERT INTO alignment_checkins (id, checked_on, created_at, updated_at)
       VALUES ('duplicate', ?, '', '')`,
      [TODAY],
    )).rejects.toThrow();
  });
});

describe('scoring', () => {
  it('replaces an answer rather than stacking a second', async () => {
    const checkin = await checkIn(TODAY, { love: 4 });
    await saveAlignment(checkin.id, 'love', 9);

    const history = await getAlignmentHistory();
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(9);
  });

  it('rejects a score that is not a position on the wheel', async () => {
    const checkin = await startCheckin({ today: TODAY });

    await expect(saveAlignment(checkin.id, 'love', 0)).rejects.toThrow(/outside 1\.\.10/);
    await expect(saveAlignment(checkin.id, 'love', 11)).rejects.toThrow(/outside 1\.\.10/);
    await expect(saveAlignment(checkin.id, 'love', 7.5)).rejects.toThrow(/outside 1\.\.10/);
    expect(await getAlignmentHistory()).toEqual([]);
  });

  it('records when the check-in last changed', async () => {
    const checkin = await checkIn(TODAY, { love: 4 });
    const [row] = await queryAll(
      'SELECT created_at, updated_at FROM alignment_checkins WHERE id = ?',
      [checkin.id],
    );
    // The row has no state of its own, so this column is only true if the
    // writers of its scores keep it so.
    expect(row.updated_at >= row.created_at).toBe(true);
  });

  it('empties one sector without touching the rest', async () => {
    const checkin = await checkIn(TODAY, { love: 4, health: 8 });
    await clearAlignment(checkin.id, 'love');

    expect((await getAlignmentHistory()).map((r) => r.valueId)).toEqual(['health']);
  });

  it('empties a whole day for an import to write into', async () => {
    const checkin = await checkIn(TODAY, { love: 4, health: 8 });
    await clearAlignmentsForCheckin(checkin.id);

    expect(await getAlignmentHistory()).toEqual([]);
    // The record itself survives — the next score given today belongs in it.
    expect(await getCheckinByDate(TODAY)).toMatchObject({ id: checkin.id });
  });
});

describe('which check-ins count as records', () => {
  it('leaves out a day whose last score was cleared', async () => {
    // "A check-in exists" means "a check-in has at least one score" — the
    // sentence `completed_at` carries for an assessment, and which a check-in has
    // no flag for. Without it the records list holds a dated entry that opens
    // onto nothing.
    const checkin = await checkIn(TODAY, { love: 4 });
    await clearAlignment(checkin.id, 'love');

    expect(await getCheckins()).toEqual([]);
    expect(await getCheckinByDate(TODAY)).toMatchObject({ id: checkin.id });
  });

  it('lists them oldest first', async () => {
    await checkIn(TODAY, { love: 4 });
    await checkIn(EARLIER, { love: 6 });
    await checkIn(YESTERDAY, { love: 5 });

    expect((await getCheckins()).map((c) => c.checkedOn)).toEqual([EARLIER, YESTERDAY, TODAY]);
  });
});

describe('what a deletion takes with it', () => {
  it('cascades from the check-in to its scores', async () => {
    const checkin = await checkIn(TODAY, { love: 4, health: 8 });
    await checkIn(YESTERDAY, { love: 6 });

    await deleteCheckin(checkin.id);

    expect((await getAlignmentHistory()).map((r) => r.checkedOn)).toEqual([YESTERDAY]);
  });

  it('cascades from a deleted value to every check-in that scored it', async () => {
    // Nothing in the app deletes a value — a catalogue entry archives instead —
    // so the row goes out from under the scores directly. What is under test is
    // the constraint: a score with no value left to be about is not a reading.
    await checkIn(YESTERDAY, { health: 3 });
    await checkIn(TODAY, { health: 9, love: 5 });

    await executeQuery("DELETE FROM personal_values WHERE id = 'health'");

    const history = await getAlignmentHistory();
    expect(history.map((r) => r.valueId)).toEqual(['love']);
    // And the day that held nothing else stops being a record.
    expect((await getCheckins()).map((c) => c.checkedOn)).toEqual([TODAY]);
  });
});

describe('the history read', () => {
  it('joins each score to the value it is about, oldest date first', async () => {
    await checkIn(YESTERDAY, { love: 6 });
    await checkIn(TODAY, { health: 9 });

    const history = await getAlignmentHistory();
    expect(history).toMatchObject([
      { checkedOn: YESTERDAY, key: 'love', score: 6, isCustom: false },
      { checkedOn: TODAY, key: 'health', score: 9, isCustom: false },
    ]);
  });

  it('carries the wording of a value the reader added on an older release', async () => {
    // Nothing creates one any more, and the rows are still out there — their
    // name lives in the table rather than in a translation file, and the join
    // has to bring it along or a check-in prints a uuid.
    const now = new Date().toISOString();
    await executeQuery(
      `INSERT INTO personal_values
         (id, key, is_custom, custom_name, display_order, archived, created_at, updated_at)
       VALUES ('3f1a-uuid', '3f1a-uuid', 1, 'Sea swimming', 999, 0, ?, ?)`,
      [now, now],
    );
    await checkIn(TODAY, { '3f1a-uuid': 7 });

    expect(await getAlignmentHistory()).toMatchObject([
      { customName: 'Sea swimming', isCustom: true, score: 7 },
    ]);
  });
});
