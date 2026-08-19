import {
  startAssessment,
  saveRating,
  clearRating,
  completeAssessment,
  deleteAssessment,
  getAssessmentByDate,
  getAssessments,
  getLatestCompletedAssessment,
  getCompletedAssessmentCount,
  getRatingsForAssessment,
  getRankedResults,
  getValueTrend,
  getHistory,
} from '../../app/services/AssessmentsDB';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests, queryAll, executeQuery } from '../../app/services/db';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';
import { localDateKey } from '../../app/utils/dateUtils';

const TODAY = localDateKey();
const YESTERDAY = '2026-01-01';
const EARLIER = '2025-12-01';

beforeEach(async () => {
  __resetDatabaseHandleForTests();
  await seedDefaultValues();
});

/** Rate a handful of values and finish the run. */
async function completeRun(dateKey, scale, scores) {
  const assessment = await startAssessment(scale, { today: dateKey });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveRating(assessment.id, valueId, score, scale);
  }
  await completeAssessment(assessment.id);
  return assessment;
}

describe('the same-day rule', () => {
  it('creates a new record on a day that has none', async () => {
    const first = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });

    expect(first.assessedOn).toBe(TODAY);
    expect(first.isRecalibration).toBe(false);
    expect(await getAssessmentByDate(TODAY)).toMatchObject({ id: first.id });
  });

  it('reopens the SAME record when calibrating again the same day', async () => {
    const first = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(first.id, 'learning', 2, SCALE_IDS.NUMERIC_5);
    await completeAssessment(first.id);

    const second = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });

    expect(second.id).toBe(first.id);
    expect(second.isRecalibration).toBe(true);
    expect(await getAssessments()).toHaveLength(1);
  });

  it('overwrites the day\'s answers rather than stacking a second set', async () => {
    const first = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(first.id, 'learning', 2, SCALE_IDS.NUMERIC_5);
    await completeAssessment(first.id);

    const second = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(second.id, 'learning', 5, SCALE_IDS.NUMERIC_5);
    await completeAssessment(second.id);

    const ratings = await getRatingsForAssessment(second.id);
    const learning = ratings.filter((r) => r.valueId === 'learning');
    expect(learning).toHaveLength(1);
    expect(learning[0].score).toBe(5);
  });

  it('creates a SEPARATE record on a different day', async () => {
    await completeRun(YESTERDAY, SCALE_IDS.NUMERIC_5, { learning: 2 });
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5 });

    const all = await getAssessments();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.assessedOn)).toEqual([YESTERDAY, TODAY]);
    expect(await getCompletedAssessmentCount()).toBe(2);
  });

  it('enforces one record per day at the database level', async () => {
    await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    // The UNIQUE constraint on assessed_on is what makes the rule structural
    // rather than a thing every caller has to remember.
    const rows = await queryAll('SELECT assessed_on FROM assessments');
    expect(rows).toHaveLength(1);
  });

  it('marks a reopened record incomplete until it is finished again', async () => {
    const first = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(first.id, 'learning', 2, SCALE_IDS.NUMERIC_5);
    await completeAssessment(first.id);
    expect(await getLatestCompletedAssessment()).not.toBeNull();

    await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    // An abandoned recalibration must not leave the day looking finished while
    // half its cards are stale.
    expect(await getLatestCompletedAssessment()).toBeNull();
  });
});

describe('changing scale mid-day', () => {
  it('re-expresses the day\'s existing answers in the new scale', async () => {
    const first = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(first.id, 'learning', 5, SCALE_IDS.NUMERIC_5); // top of 1..5
    await saveRating(first.id, 'love', 1, SCALE_IDS.NUMERIC_5); // bottom
    await completeAssessment(first.id);

    const second = await startAssessment(SCALE_IDS.NUMERIC_10, { today: TODAY });
    expect(second.scale).toBe(SCALE_IDS.NUMERIC_10);

    const ratings = await getRatingsForAssessment(second.id);
    const byValue = Object.fromEntries(ratings.map((r) => [r.valueId, r]));

    // The position is preserved, not the number: top of 1..5 becomes top of 1..10.
    expect(byValue.learning.score).toBe(10);
    expect(byValue.learning.normalized).toBe(1);
    expect(byValue.love.score).toBe(1);
    expect(byValue.love.normalized).toBe(0);
  });

  it('keeps score and normalized consistent after a lossy conversion', async () => {
    const first = await startAssessment(SCALE_IDS.NUMERIC_10, { today: TODAY });
    await saveRating(first.id, 'learning', 7, SCALE_IDS.NUMERIC_10);
    await completeAssessment(first.id);

    // 10 steps into 3 cannot round-trip, so the stored pair must agree with the
    // NEW score or the charts and the on-screen number would disagree.
    const second = await startAssessment(SCALE_IDS.QUALITATIVE, { today: TODAY });
    const [rating] = await getRatingsForAssessment(second.id);

    expect(rating.normalized).toBe(normalizeScore(rating.score, SCALE_IDS.QUALITATIVE));
    expect([1, 2, 3]).toContain(rating.score);
  });

  it('leaves an earlier day\'s record on its original scale', async () => {
    await completeRun(YESTERDAY, SCALE_IDS.NUMERIC_5, { learning: 4 });
    await startAssessment(SCALE_IDS.QUALITATIVE, { today: TODAY });

    const yesterday = await getAssessmentByDate(YESTERDAY);
    expect(yesterday.scale).toBe(SCALE_IDS.NUMERIC_5);
    const [rating] = await getRatingsForAssessment(yesterday.id);
    expect(rating.score).toBe(4);
  });
});

describe('saveRating', () => {
  it('stores the raw score and its normalized position', async () => {
    const assessment = await startAssessment(SCALE_IDS.NUMERIC_10, { today: TODAY });
    await saveRating(assessment.id, 'learning', 8, SCALE_IDS.NUMERIC_10);

    const [rating] = await getRatingsForAssessment(assessment.id);
    expect(rating.score).toBe(8);
    expect(rating.normalized).toBeCloseTo(7 / 9, 6);
  });

  it('upserts rather than duplicating when a card is re-rated', async () => {
    const assessment = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(assessment.id, 'learning', 2, SCALE_IDS.NUMERIC_5);
    await saveRating(assessment.id, 'learning', 4, SCALE_IDS.NUMERIC_5);

    const ratings = await getRatingsForAssessment(assessment.id);
    expect(ratings).toHaveLength(1);
    expect(ratings[0].score).toBe(4);
  });

  it('rejects a score the scale cannot express', async () => {
    const assessment = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await expect(saveRating(assessment.id, 'learning', 9, SCALE_IDS.NUMERIC_5)).rejects.toThrow();
    await expect(saveRating(assessment.id, 'learning', 0, SCALE_IDS.NUMERIC_5)).rejects.toThrow();
    expect(await getRatingsForAssessment(assessment.id)).toHaveLength(0);
  });

  it('clearRating puts a card back into the unrated pile', async () => {
    const assessment = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(assessment.id, 'learning', 3, SCALE_IDS.NUMERIC_5);
    await clearRating(assessment.id, 'learning');
    expect(await getRatingsForAssessment(assessment.id)).toHaveLength(0);
  });
});

describe('getRankedResults', () => {
  it('returns values most-important first, joined to the catalogue', async () => {
    const assessment = await completeRun(TODAY, SCALE_IDS.NUMERIC_5, {
      learning: 5,
      love: 1,
      health: 3,
    });

    // Strongest first is the app's one direction: the top of the results list,
    // like the top of a rating card, is what matters most.
    const ranked = await getRankedResults(assessment.id);
    expect(ranked.map((r) => r.valueId)).toEqual(['learning', 'health', 'love']);
    expect(ranked[0]).toMatchObject({ key: 'learning', isCustom: false });
  });

  it('omits values that were left unrated', async () => {
    const assessment = await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5 });
    expect(await getRankedResults(assessment.id)).toHaveLength(1);
  });
});

describe('history', () => {
  it('returns only completed assessments', async () => {
    await completeRun(YESTERDAY, SCALE_IDS.NUMERIC_5, { learning: 2 });
    const open = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    await saveRating(open.id, 'learning', 5, SCALE_IDS.NUMERIC_5);

    const history = await getHistory();
    expect(history.map((h) => h.assessedOn)).toEqual([YESTERDAY]);
  });

  it('is comparable across a scale change', async () => {
    await completeRun(EARLIER, SCALE_IDS.NUMERIC_5, { learning: 5 });
    await completeRun(YESTERDAY, SCALE_IDS.NUMERIC_10, { learning: 10 });

    const trend = await getValueTrend('learning');
    expect(trend).toHaveLength(2);
    // Raw scores 5 and 10 look like a doubling; both are in fact the top of
    // their own scale, and `normalized` is what says so.
    expect(trend[0].score).toBe(5);
    expect(trend[1].score).toBe(10);
    expect(trend[0].normalized).toBe(1);
    expect(trend[1].normalized).toBe(1);
  });

  it('orders oldest first', async () => {
    await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5 });
    await completeRun(EARLIER, SCALE_IDS.NUMERIC_5, { learning: 1 });
    await completeRun(YESTERDAY, SCALE_IDS.NUMERIC_5, { learning: 3 });

    const trend = await getValueTrend('learning');
    expect(trend.map((p) => p.assessedOn)).toEqual([EARLIER, YESTERDAY, TODAY]);
  });
});

describe('deleteAssessment', () => {
  it('removes the record and cascades to its ratings', async () => {
    const assessment = await completeRun(TODAY, SCALE_IDS.NUMERIC_5, {
      learning: 5,
      love: 2,
    });
    expect(await queryAll('SELECT id FROM ratings')).toHaveLength(2);

    await deleteAssessment(assessment.id);

    expect(await getAssessmentByDate(TODAY)).toBeNull();
    // ON DELETE CASCADE, which only works because db.js turns foreign keys on
    // for the connection — SQLite has them off by default.
    expect(await queryAll('SELECT id FROM ratings')).toHaveLength(0);
  });

  it('leaves other days untouched', async () => {
    const older = await completeRun(YESTERDAY, SCALE_IDS.NUMERIC_5, { learning: 2 });
    const newer = await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5 });

    await deleteAssessment(newer.id);

    expect(await getAssessments()).toHaveLength(1);
    expect(await getRatingsForAssessment(older.id)).toHaveLength(1);
  });

  it('frees the day so a new record can be created for it', async () => {
    const assessment = await completeRun(TODAY, SCALE_IDS.NUMERIC_5, { learning: 5 });
    await deleteAssessment(assessment.id);

    const fresh = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
    expect(fresh.isRecalibration).toBe(false);
    expect(fresh.id).not.toBe(assessment.id);
  });
});

describe('deleting a value', () => {
  it('cascades to the ratings it collected', async () => {
    // Nothing in the app deletes a value — a catalogue entry archives instead,
    // so that a history chart reaching back past the change still resolves a
    // name. The constraint is still worth holding: a rating whose value is gone
    // is not a reading of anything.
    const assessment = await completeRun(TODAY, SCALE_IDS.NUMERIC_5, {
      learning: 5,
      love: 2,
      health: 4,
    });
    expect(await getRatingsForAssessment(assessment.id)).toHaveLength(3);

    await executeQuery("DELETE FROM personal_values WHERE id = 'health'");
    expect(await getRatingsForAssessment(assessment.id)).toHaveLength(2);
  });
});
