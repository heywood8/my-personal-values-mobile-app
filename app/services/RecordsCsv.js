import {
  getHistory,
  startAssessment,
  saveRating,
  completeAssessment,
  clearRatingsForAssessment,
} from './AssessmentsDB';
import { getAllValues, addCustomValue } from './ValuesDB';
import { toCsv, parseCsv, rowsToObjects } from '../utils/csv';
import { SCALE_IDS, isValidScaleId, isValidScore } from '../utils/scales';

/**
 * Calibration records as a CSV file, out and back in.
 *
 * The app keeps everything on the device and talks to no server, which is a
 * privacy property worth having and a liability the moment someone changes phone
 * or clears a browser. A file the user holds is the whole backup story here, and
 * CSV rather than a private format because the other half of the job is reading
 * your own history in a spreadsheet.
 *
 * The file is one row per rating, denormalised so that a single row means
 * something on its own:
 *
 *   assessed_on,scale,value_key,value_name,score,normalized
 *   2026-08-12,numeric5,love,Love,5,1
 *
 * `value_key` is what import matches on; `value_name` is there so the file is
 * legible, and is the fallback when a key is unknown to this install. Import
 * recomputes `normalized` from `score` and `scale` rather than trusting the
 * column — the two have to agree, and the one that can be edited in a spreadsheet
 * is not the one to believe.
 */

export const CSV_HEADER = ['assessed_on', 'scale', 'value_key', 'value_name', 'score', 'normalized'];

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const normaliseName = (name) => String(name ?? '').trim().toLowerCase();

/** Four decimals is past the resolution of every scale and keeps the file readable. */
const formatNormalized = (normalized) => String(Math.round(normalized * 10000) / 10000);

/**
 * Every completed record as CSV text.
 *
 * Rows are grouped by date, oldest first, and within a date the strongest value
 * comes first — the order the results screen reads in, so the file and the screen
 * tell the same story in the same sequence.
 *
 * @param {(value: object) => string} resolveName renders a value's display name
 *   (the caller owns translation, so this takes the app's `valueName`).
 */
export async function buildRecordsCsv(resolveName) {
  const history = await getHistory();
  const rows = [...history].sort((a, b) => (
    a.assessedOn === b.assessedOn
      ? b.normalized - a.normalized
      : a.assessedOn.localeCompare(b.assessedOn)
  ));

  return toCsv([
    CSV_HEADER,
    ...rows.map((row) => [
      row.assessedOn,
      row.scale,
      row.key,
      resolveName ? resolveName(row) : (row.customName || row.key),
      row.score,
      formatNormalized(row.normalized),
    ]),
  ]);
}

/**
 * The scale a record was taken on, when the file does not say.
 *
 * Only the numeric scales can be recovered from the scores themselves — a 1..3
 * column is a valid numeric5 record as well as a qualitative one, and guessing
 * "words" would relabel someone's numbers. So an unnamed scale resolves to a
 * numeric one, and a qualitative record has to name itself (as every file this
 * app writes does).
 */
const inferScale = (scores) => (
  scores.some((score) => score > 5) ? SCALE_IDS.NUMERIC_10 : SCALE_IDS.NUMERIC_5
);

/**
 * Read a CSV file into the records it describes, without touching the database.
 *
 * Split from the write so the UI can say what an import is about to do before it
 * does it — replacing a day's record is not something to discover afterwards.
 *
 * @returns {{records: Array, ratings: number, skipped: number, error: string|null}}
 *   `error` is a stable identifier ('empty' | 'no_columns'), not a message: the
 *   caller owns the wording and the language it is in.
 */
export function parseRecordsCsv(text) {
  const parsed = rowsToObjects(parseCsv(text));
  const empty = { records: [], ratings: 0, skipped: 0 };

  if (parsed.length === 0) return { ...empty, error: 'empty' };

  const columns = Object.keys(parsed[0]);
  const hasIdentity = columns.includes('value_key') || columns.includes('value_name');
  if (!columns.includes('assessed_on') || !columns.includes('score') || !hasIdentity) {
    return { ...empty, error: 'no_columns' };
  }

  const byDate = new Map();
  let skipped = 0;

  for (const record of parsed) {
    const assessedOn = record.assessed_on;
    const score = Number(record.score);
    const key = record.value_key || '';
    const name = record.value_name || '';

    if (!DATE_KEY.test(assessedOn) || !Number.isInteger(score) || (!key && !name)) {
      skipped++;
      continue;
    }

    if (!byDate.has(assessedOn)) {
      byDate.set(assessedOn, { assessedOn, scale: null, rows: [] });
    }
    const group = byDate.get(assessedOn);
    // First named scale wins for the day: assessments store one scale, and a file
    // that mixes them within a date is describing something the app cannot hold.
    if (!group.scale && isValidScaleId(record.scale)) group.scale = record.scale;
    group.rows.push({ key, name, score });
  }

  const records = [];
  let ratings = 0;

  for (const group of byDate.values()) {
    const scale = group.scale || inferScale(group.rows.map((row) => row.score));
    const rows = group.rows.filter((row) => {
      if (isValidScore(row.score, scale)) return true;
      // Out of the scale's range: a score of 8 in a 1..5 record is not a rating
      // this app can express, and clamping it would invent an answer.
      skipped++;
      return false;
    });
    if (rows.length === 0) continue;
    ratings += rows.length;
    records.push({ assessedOn: group.assessedOn, scale, rows });
  }

  records.sort((a, b) => a.assessedOn.localeCompare(b.assessedOn));

  return { records, ratings, skipped, error: records.length === 0 ? 'empty' : null };
}

/**
 * Write parsed records into the database.
 *
 * Every record resolves through `startAssessment`, which is the app's single path
 * to an assessment row and therefore the same-day rule: importing a date that
 * already has a record reopens it rather than creating a second. The day's
 * existing answers are cleared first, so an import replaces a date rather than
 * merging into it.
 *
 * A value is matched by key first, then by name; anything left is created as a
 * custom value, which is what makes a file from another device — or from a
 * spreadsheet someone typed by hand — import as something rather than as nothing.
 *
 * @param {(value: object) => string} resolveName renders a catalogue value's name
 *   so the by-name fallback can match translated names.
 */
export async function applyRecordsCsv(records, resolveName) {
  const values = await getAllValues();

  const byKey = new Map();
  const byName = new Map();
  const remember = (value) => {
    byKey.set(value.key, value.id);
    byKey.set(value.id, value.id);
    const rendered = resolveName ? resolveName(value) : null;
    for (const name of [rendered, value.customName]) {
      if (name && !byName.has(normaliseName(name))) byName.set(normaliseName(name), value.id);
    }
  };
  values.forEach(remember);

  let ratings = 0;
  let valuesCreated = 0;
  let skipped = 0;

  for (const record of records) {
    const opened = await startAssessment(record.scale, { today: record.assessedOn });
    await clearRatingsForAssessment(opened.id);

    for (const row of record.rows) {
      let valueId = byKey.get(row.key) || byName.get(normaliseName(row.name));

      if (!valueId) {
        if (!row.name) {
          skipped++;
          continue;
        }
        valueId = await addCustomValue({ name: row.name });
        valuesCreated++;
        remember({ id: valueId, key: valueId, customName: row.name, isCustom: true });
      }

      await saveRating(opened.id, valueId, row.score, record.scale);
      ratings++;
    }

    await completeAssessment(opened.id);
  }

  return { records: records.length, ratings, valuesCreated, skipped };
}
