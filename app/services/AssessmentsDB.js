import uuid from 'react-native-uuid';
import { queryAll, queryFirst, executeQuery, withTransaction } from './db';
import { localDateKey } from '../utils/dateUtils';
import { normalizeScore, denormalizeScore, isValidScore, getScale } from '../utils/scales';

const rowToAssessment = (row) => ({
  id: row.id,
  assessedOn: row.assessed_on,
  scale: row.scale,
  completedAt: row.completed_at ?? null,
  isComplete: !!row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToRating = (row) => ({
  id: row.id,
  assessmentId: row.assessment_id,
  valueId: row.value_id,
  score: row.score,
  normalized: row.normalized,
});

/** The assessment recorded on a given local date, or null. */
export async function getAssessmentByDate(dateKey) {
  const row = await queryFirst('SELECT * FROM assessments WHERE assessed_on = ?', [dateKey]);
  return row ? rowToAssessment(row) : null;
}

/** Every assessment, oldest first — the order the history chart plots. */
export async function getAssessments({ completedOnly = false } = {}) {
  const rows = await queryAll(
    `SELECT * FROM assessments
      ${completedOnly ? 'WHERE completed_at IS NOT NULL' : ''}
      ORDER BY assessed_on ASC`,
  );
  return rows.map(rowToAssessment);
}

/** The most recent finished assessment — what the results screen shows. */
export async function getLatestCompletedAssessment() {
  const row = await queryFirst(
    `SELECT * FROM assessments
      WHERE completed_at IS NOT NULL
      ORDER BY assessed_on DESC
      LIMIT 1`,
  );
  return row ? rowToAssessment(row) : null;
}

export async function getCompletedAssessmentCount() {
  const row = await queryFirst(
    'SELECT COUNT(*) AS count FROM assessments WHERE completed_at IS NOT NULL',
  );
  return row?.count ?? 0;
}

/**
 * Resolve the assessment a calibration started *now* should write into.
 *
 * This is where the same-day rule lives. `assessed_on` is UNIQUE, so today either
 * already has a row — in which case the run reopens it and overwrites its ratings
 * — or it does not, and a new record is created. Nothing else in the app has to
 * know about the rule; it falls out of resolving through this function.
 *
 * If the scale preference changed since a same-day run, the existing raw scores
 * are re-expressed in the new scale rather than left behind in the old one. The
 * normalised values are what carry over, so nobody's answers are discarded — a 4
 * out of 5 reopens as an 8 out of 10, which is the same statement.
 */
export async function startAssessment(scaleId, { today = localDateKey() } = {}) {
  const existing = await getAssessmentByDate(today);
  const now = new Date().toISOString();

  if (!existing) {
    const id = String(uuid.v4());
    await executeQuery(
      `INSERT INTO assessments (id, assessed_on, scale, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [id, today, scaleId, now, now],
    );
    return { id, assessedOn: today, scale: scaleId, completedAt: null, isComplete: false, isRecalibration: false };
  }

  if (existing.scale !== scaleId) {
    await rescaleAssessment(existing.id, scaleId);
  }

  // Reopened for editing: clearing completed_at means an abandoned recalibration
  // does not leave the day looking finished when half its cards are stale.
  await executeQuery(
    'UPDATE assessments SET scale = ?, completed_at = NULL, updated_at = ? WHERE id = ?',
    [scaleId, now, existing.id],
  );

  return { ...existing, scale: scaleId, completedAt: null, isComplete: false, isRecalibration: true };
}

/**
 * Re-express every raw score of an assessment in a different scale, keeping the
 * normalised position fixed. Rounding to the target scale's steps is lossy in one
 * direction (10 steps into 3 cannot round-trip), which is why `normalized` is
 * recomputed from the NEW raw score afterwards — the stored pair must always
 * agree, or the charts and the numbers on screen would tell different stories.
 */
async function rescaleAssessment(assessmentId, scaleId) {
  const rows = await queryAll('SELECT * FROM ratings WHERE assessment_id = ?', [assessmentId]);
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  await withTransaction(async () => {
    for (const row of rows) {
      const score = denormalizeScore(row.normalized, scaleId);
      await executeQuery(
        'UPDATE ratings SET score = ?, normalized = ?, updated_at = ? WHERE id = ?',
        [score, normalizeScore(score, scaleId), now, row.id],
      );
    }
  });
}

/**
 * Record one value's score. Upsert on (assessment, value): re-rating a card
 * during the same run replaces the earlier answer rather than stacking a second.
 */
export async function saveRating(assessmentId, valueId, score, scaleId) {
  if (!isValidScore(score, scaleId)) {
    const scale = getScale(scaleId);
    throw new Error(`Score ${score} is outside ${scale.id} (${scale.min}..${scale.max})`);
  }

  const now = new Date().toISOString();
  const existing = await queryFirst(
    'SELECT id FROM ratings WHERE assessment_id = ? AND value_id = ?',
    [assessmentId, valueId],
  );

  const normalized = normalizeScore(score, scaleId);

  if (existing) {
    await executeQuery(
      'UPDATE ratings SET score = ?, normalized = ?, updated_at = ? WHERE id = ?',
      [score, normalized, now, existing.id],
    );
    return existing.id;
  }

  const id = String(uuid.v4());
  await executeQuery(
    `INSERT INTO ratings (id, assessment_id, value_id, score, normalized, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, assessmentId, valueId, score, normalized, now, now],
  );
  return id;
}

/** Drop a single answer, putting the card back into the unrated pile. */
export async function clearRating(assessmentId, valueId) {
  await executeQuery(
    'DELETE FROM ratings WHERE assessment_id = ? AND value_id = ?',
    [assessmentId, valueId],
  );
}

/**
 * Drop every answer of one assessment, keeping the record itself.
 *
 * Used by the CSV import, which replaces a day rather than merging into it: an
 * imported file is a statement about that date, and leaving behind ratings it
 * does not mention would make re-importing the same file produce a different
 * record each time.
 */
export async function clearRatingsForAssessment(assessmentId) {
  await executeQuery('DELETE FROM ratings WHERE assessment_id = ?', [assessmentId]);
}

/** Every rating of one assessment, keyed by value id for O(1) lookup in the deck. */
export async function getRatingsForAssessment(assessmentId) {
  const rows = await queryAll('SELECT * FROM ratings WHERE assessment_id = ?', [assessmentId]);
  return rows.map(rowToRating);
}

/** Mark the run finished. */
export async function completeAssessment(assessmentId) {
  const now = new Date().toISOString();
  await executeQuery(
    'UPDATE assessments SET completed_at = ?, updated_at = ? WHERE id = ?',
    [now, now, assessmentId],
  );
}

/** Delete an assessment and, by cascade, its ratings. */
export async function deleteAssessment(assessmentId) {
  await executeQuery('DELETE FROM assessments WHERE id = ?', [assessmentId]);
}

/**
 * An assessment's ratings joined to the catalogue, ranked.
 *
 * Sorted descending — most important first — so a list read top-down starts with
 * what matters most, which is the order the deck itself now presents ("very
 * important" at the top of the card). The results screen can flip it, and the
 * other end is worth reading too: the bottom is where the things you keep saying
 * yes to but do not actually care about collect.
 */
export async function getRankedResults(assessmentId) {
  const rows = await queryAll(
    `SELECT r.id, r.score, r.normalized, r.value_id,
            v.key, v.is_custom, v.custom_name
       FROM ratings r
       JOIN personal_values v ON v.id = r.value_id
      WHERE r.assessment_id = ?
      ORDER BY r.normalized DESC, v.display_order ASC`,
    [assessmentId],
  );

  return rows.map((row) => ({
    ratingId: row.id,
    valueId: row.value_id,
    key: row.key,
    isCustom: row.is_custom === 1,
    customName: row.custom_name ?? null,
    score: row.score,
    normalized: row.normalized,
  }));
}

/**
 * Every completed assessment's ratings for one value, oldest first — one value's
 * line on the history chart.
 */
export async function getValueTrend(valueId) {
  const rows = await queryAll(
    `SELECT a.assessed_on, a.scale, r.score, r.normalized
       FROM ratings r
       JOIN assessments a ON a.id = r.assessment_id
      WHERE r.value_id = ? AND a.completed_at IS NOT NULL
      ORDER BY a.assessed_on ASC`,
    [valueId],
  );

  return rows.map((row) => ({
    assessedOn: row.assessed_on,
    scale: row.scale,
    score: row.score,
    normalized: row.normalized,
  }));
}

/**
 * The whole history in one query: every completed assessment's ratings, joined to
 * the catalogue. The history screen derives its trends and its movers from this
 * single read rather than issuing a query per value — with 47 values
 * and a row per calibration, the entire dataset is smaller than the round trips
 * would be.
 */
export async function getHistory() {
  const rows = await queryAll(
    `SELECT a.id AS assessment_id, a.assessed_on, a.scale,
            r.value_id, r.score, r.normalized,
            v.key, v.is_custom, v.custom_name
       FROM assessments a
       JOIN ratings r ON r.assessment_id = a.id
       JOIN personal_values v ON v.id = r.value_id
      WHERE a.completed_at IS NOT NULL
      ORDER BY a.assessed_on ASC, v.display_order ASC`,
  );

  return rows.map((row) => ({
    assessmentId: row.assessment_id,
    assessedOn: row.assessed_on,
    scale: row.scale,
    valueId: row.value_id,
    key: row.key,
    isCustom: row.is_custom === 1,
    customName: row.custom_name ?? null,
    score: row.score,
    normalized: row.normalized,
  }));
}
