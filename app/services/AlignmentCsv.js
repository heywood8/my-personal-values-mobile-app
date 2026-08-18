import {
  getAlignmentHistory,
  startCheckin,
  saveAlignment,
  clearAlignmentsForCheckin,
} from './AlignmentDB';
import { getAllValues, addCustomValue } from './ValuesDB';
import { toCsv, parseCsv, rowsToObjects } from '../utils/csv';
import { isValidAlignmentScore, ALIGNMENT_RINGS } from '../utils/alignment';

/**
 * The check-ins as a CSV file, out and back in.
 *
 * A SECOND file, not extra rows in the records one, and that is the whole
 * decision here. The records file is the only backup this app has, so it has to
 * keep reading files older releases wrote — and the reverse also has to hold: a
 * file this release writes must not poison an older release that reads it. Ten
 * rows of alignment scores appended to a records file would be read by any
 * shipped version as ten *importance* ratings against that date, silently
 * replacing the record they were meant to sit beside. Two files cannot do that
 * to each other, and each one still opens in a spreadsheet as the single legible
 * table it is.
 *
 *   checked_on,value_key,value_name,score,rings
 *   2026-08-12,love,Love,7,10
 *
 * There is no `normalized` column — the wheel has ten rings and always will, so
 * the raw score is already comparable across every check-in (see
 * app/utils/alignment.js, and the note on the missing column in
 * app/db/schema.js). `rings` is the denominator, and it is here rather than in
 * the database for one reason: a row in the database can be migrated when the
 * instrument changes, and a file somebody saved to their phone last year cannot.
 * A 7 means nothing without the 10 beside it. Columns stay additive here for the
 * same reason they do in the records file — add one, never rename one.
 */

export const ALIGNMENT_CSV_HEADER = ['checked_on', 'value_key', 'value_name', 'score', 'rings'];

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const normaliseName = (name) => String(name ?? '').trim().toLowerCase();

/**
 * Every check-in as CSV text, oldest first.
 *
 * Within a date the rows keep deck order, which is what the query returns.
 * Unlike the records file there is no ranking here to mirror: an alignment score
 * says how far out on the wheel a value sits, not where it stands against the
 * others, so sorting by it would invent an ordering the screen never shows.
 */
export async function buildAlignmentCsv(resolveName) {
  const history = await getAlignmentHistory();

  return toCsv([
    ALIGNMENT_CSV_HEADER,
    ...history.map((row) => [
      row.checkedOn,
      row.key,
      resolveName ? resolveName(row) : (row.customName || row.key),
      row.score,
      ALIGNMENT_RINGS,
    ]),
  ]);
}

/**
 * Read a check-ins file into the records it describes, without touching the
 * database — the same split the records import makes, so the confirmation can
 * state what is about to happen before it happens.
 *
 * @returns {{records: Array, ratings: number, skipped: number, error: string|null}}
 *   `error` is a stable identifier ('empty' | 'no_columns'), not a message.
 */
export function parseAlignmentCsv(text) {
  const parsed = rowsToObjects(parseCsv(text));
  const empty = { records: [], ratings: 0, skipped: 0 };

  if (parsed.length === 0) return { ...empty, error: 'empty' };

  const columns = Object.keys(parsed[0]);
  const hasIdentity = columns.includes('value_key') || columns.includes('value_name');
  if (!columns.includes('checked_on') || !columns.includes('score') || !hasIdentity) {
    return { ...empty, error: 'no_columns' };
  }

  const byDate = new Map();
  let skipped = 0;

  for (const record of parsed) {
    const checkedOn = record.checked_on;
    const score = Number(record.score);
    const key = record.value_key || '';
    const name = record.value_name || '';

    // An older file predates the column and is a ten-ring file by definition —
    // there has never been another. A file that names a different denominator is
    // a wheel this release cannot express, and rescaling it would restate an
    // answer nobody gave; those rows are skipped and counted.
    const rings = record.rings === undefined || record.rings === ''
      ? ALIGNMENT_RINGS
      : Number(record.rings);

    // A score outside the rings is not a position on this wheel, and clamping it
    // would invent one.
    if (
      !DATE_KEY.test(checkedOn)
      || rings !== ALIGNMENT_RINGS
      || !isValidAlignmentScore(score)
      || (!key && !name)
    ) {
      skipped++;
      continue;
    }

    if (!byDate.has(checkedOn)) byDate.set(checkedOn, { checkedOn, rows: [] });
    byDate.get(checkedOn).rows.push({ key, name, score });
  }

  const records = [...byDate.values()].filter((record) => record.rows.length > 0);
  records.sort((a, b) => a.checkedOn.localeCompare(b.checkedOn));

  const ratings = records.reduce((sum, record) => sum + record.rows.length, 0);

  return { records, ratings, skipped, error: records.length === 0 ? 'empty' : null };
}

/**
 * Write parsed check-ins into the database.
 *
 * Every record resolves through `startCheckin()`, the app's single path to a
 * check-in row and therefore the same-day rule: importing a date that already has
 * one reopens it rather than creating a second. Its existing scores are cleared
 * first, so importing a file twice leaves the same database as importing it once.
 *
 * A value is matched by key, then by name, and anything still unmatched is added
 * as a custom value — the same three steps the records import takes, and what
 * makes a file from another device import as scores rather than as nothing.
 */
export async function applyAlignmentCsv(records, resolveName) {
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
    const checkin = await startCheckin({ today: record.checkedOn });
    await clearAlignmentsForCheckin(checkin.id);

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

      await saveAlignment(checkin.id, valueId, row.score);
      ratings++;
    }
  }

  return { records: records.length, ratings, valuesCreated, skipped };
}
