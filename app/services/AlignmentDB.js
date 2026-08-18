import uuid from 'react-native-uuid';
import { queryAll, queryFirst, executeQuery } from './db';
import { localDateKey } from '../utils/dateUtils';
import { isValidAlignmentScore, ALIGNMENT_MIN, ALIGNMENT_MAX } from '../utils/alignment';

/**
 * The alignment check-ins — the second trackable list.
 *
 * Deliberately the same shape as AssessmentsDB, because it answers the same
 * questions about a different measurement: one record per calendar day, resolved
 * through a single function, with the day's rows replaced rather than stacked.
 * Two modules that behave alike are cheaper to hold in the head than one module
 * with a mode flag, and the two records genuinely differ — an assessment carries
 * a scale and a completion, a check-in carries neither.
 */

const rowToCheckin = (row) => ({
  id: row.id,
  checkedOn: row.checked_on,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** The check-in recorded on a given local date, or null. */
export async function getCheckinByDate(dateKey) {
  const row = await queryFirst('SELECT * FROM alignment_checkins WHERE checked_on = ?', [dateKey]);
  return row ? rowToCheckin(row) : null;
}

/**
 * Every check-in that actually says something, oldest first.
 *
 * "A check-in exists" means "a check-in has at least one score", and this
 * `EXISTS` is where that is decided. An assessment carries `completed_at` to keep
 * an open run out of the history list; a check-in has no such flag, so the rows
 * themselves are the evidence — and a row with none is reachable more than one
 * way: clearing the only score of a day, deleting a custom value whose score was
 * the day's only one, an import that created the row and then failed. Left in,
 * each of those would put a dated entry in the records list that opens onto
 * nothing.
 *
 * The empty row is not deleted, for the same reason an abandoned calibration is
 * not: the next score given that day belongs in it.
 */
export async function getCheckins() {
  const rows = await queryAll(
    `SELECT c.* FROM alignment_checkins c
      WHERE EXISTS (SELECT 1 FROM alignment_ratings a WHERE a.checkin_id = c.id)
      ORDER BY c.checked_on ASC`,
  );
  return rows.map(rowToCheckin);
}

/**
 * Resolve the check-in a rating given *now* should be written into.
 *
 * The same-day rule again, and the same implementation of it: `checked_on` is
 * UNIQUE, so today either already has a row — which this reopens, keeping the
 * scores already on it — or it does not, and one is created. Every write here
 * goes through this function, exactly as every assessment goes through
 * `startAssessment()`, so no caller has to remember the rule.
 *
 * Nothing calls it on screen entry. A check-in row is created by the first score
 * the reader actually gives, so opening the tab to look at last week's wheel does
 * not silently record today as a day they checked in.
 */
export async function startCheckin({ today = localDateKey() } = {}) {
  const existing = await getCheckinByDate(today);
  if (existing) return { ...existing, isRecheck: true };

  const id = String(uuid.v4());
  const now = new Date().toISOString();
  await executeQuery(
    `INSERT INTO alignment_checkins (id, checked_on, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [id, today, now, now],
  );
  return { id, checkedOn: today, createdAt: now, updatedAt: now, isRecheck: false };
}

/**
 * A check-in row has no state of its own beyond the day it names, so its
 * `updated_at` can only be true if the writers of its rows keep it so — the one
 * extra statement per tap is what stops the column from being a lie.
 */
const touchCheckin = (checkinId, now) => executeQuery(
  'UPDATE alignment_checkins SET updated_at = ? WHERE id = ?',
  [now, checkinId],
);

/**
 * Record one value's alignment. Upsert on (check-in, value): moving a value in
 * or out during the same day replaces the answer rather than stacking a second.
 */
export async function saveAlignment(checkinId, valueId, score) {
  if (!isValidAlignmentScore(score)) {
    throw new Error(`Alignment ${score} is outside ${ALIGNMENT_MIN}..${ALIGNMENT_MAX}`);
  }

  const now = new Date().toISOString();
  const existing = await queryFirst(
    'SELECT id FROM alignment_ratings WHERE checkin_id = ? AND value_id = ?',
    [checkinId, valueId],
  );

  if (existing) {
    await executeQuery(
      'UPDATE alignment_ratings SET score = ?, updated_at = ? WHERE id = ?',
      [score, now, existing.id],
    );
    await touchCheckin(checkinId, now);
    return existing.id;
  }

  const id = String(uuid.v4());
  await executeQuery(
    `INSERT INTO alignment_ratings (id, checkin_id, value_id, score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, checkinId, valueId, score, now, now],
  );
  await touchCheckin(checkinId, now);
  return id;
}

/** Drop a single answer, emptying that sector of the wheel again. */
export async function clearAlignment(checkinId, valueId) {
  await executeQuery(
    'DELETE FROM alignment_ratings WHERE checkin_id = ? AND value_id = ?',
    [checkinId, valueId],
  );
  await touchCheckin(checkinId, new Date().toISOString());
}

/**
 * Drop every answer of one check-in, keeping the record itself. Used by the CSV
 * import, which replaces a day rather than merging into it.
 */
export async function clearAlignmentsForCheckin(checkinId) {
  await executeQuery('DELETE FROM alignment_ratings WHERE checkin_id = ?', [checkinId]);
}

/** Delete a check-in and, by cascade, its ratings. */
export async function deleteCheckin(checkinId) {
  await executeQuery('DELETE FROM alignment_checkins WHERE id = ?', [checkinId]);
}

/**
 * Every check-in's ratings, joined to the catalogue, oldest first.
 *
 * One read for the whole history, for the same reason `getHistory()` is one read:
 * a handful of values across a handful of dates is smaller than the round trips
 * asking for them one at a time would be. The screen derives today's wheel and
 * the previous check-in's outline from this.
 */
export async function getAlignmentHistory() {
  const rows = await queryAll(
    `SELECT c.id AS checkin_id, c.checked_on,
            a.value_id, a.score,
            v.key, v.is_custom, v.custom_name
       FROM alignment_checkins c
       JOIN alignment_ratings a ON a.checkin_id = c.id
       JOIN personal_values v ON v.id = a.value_id
      ORDER BY c.checked_on ASC, v.display_order ASC`,
  );

  return rows.map((row) => ({
    checkinId: row.checkin_id,
    checkedOn: row.checked_on,
    valueId: row.value_id,
    key: row.key,
    isCustom: row.is_custom === 1,
    customName: row.custom_name ?? null,
    score: row.score,
  }));
}
