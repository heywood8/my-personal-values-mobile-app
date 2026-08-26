import {
  getHistory,
  startAssessment,
  saveRating,
  completeAssessment,
  clearRatingsForAssessment,
} from './AssessmentsDB';
import {
  getAlignmentHistory,
  startCheckin,
  saveAlignment,
  clearAlignmentsForCheckin,
} from './AlignmentDB';
import { getAllValues } from './ValuesDB';
import { toCsv, parseCsv, rowsToObjects } from '../utils/csv';
import { SCALE_IDS, isValidScaleId, isValidScore } from '../utils/scales';
import { isValidAlignmentScore, ALIGNMENT_RINGS } from '../utils/alignment';

/**
 * The backup: everything this app holds, as one CSV file, out and back in.
 *
 * The app keeps everything on the device and talks to no server, which is a
 * privacy property worth having and a liability the moment someone changes phone
 * or clears a browser. A file the user holds is the whole backup story here, and
 * CSV rather than a private format because the other half of the job is reading
 * your own history in a spreadsheet.
 *
 * ONE file, not two. Both lists — how much each value matters (the ranking) and
 * how far behaviour matches it (the wheel's check-ins) — travel together, because
 * "back up my data" that only backs up half of it is the kind of thing a reader
 * discovers on the day they needed the other half. They used to be two files for
 * a real reason: ten rows of alignment scores appended to a *records* file would
 * be read by any already-shipped release as ten importance ratings against that
 * date, silently replacing the record they were meant to sit beside. What makes
 * one file safe is the header. This file names no column an older release looks
 * for — it has `kind` and `date` where the records file had `assessed_on` — so a
 * release that predates this format refuses it by name ("that is not a records
 * file") instead of half-reading it. Both old shapes still import here, because
 * files older releases wrote are sitting on people's phones:
 *
 *   kind,date,scale,value_key,value_name,score,normalized,rings
 *   importance,2026-08-12,numeric5,love,Love,5,1,
 *   alignment,2026-08-12,,love,Love,7,,10
 *
 * A row carries only the columns its kind has. An importance row has a `scale`,
 * because a raw 4 means different things on 1..5 and 1..10, and a `normalized`
 * reading so the file is legible next to a ranking. An alignment row has neither
 * and carries `rings` instead — the denominator, in the file rather than only in
 * the database because a database row can be migrated when the instrument changes
 * and a file on somebody's phone cannot. A 7 means nothing without the 10 beside
 * it.
 *
 * `value_key` is what import matches on; `value_name` is there so the file is
 * legible, and is the fallback when a key is unknown to this install. Import
 * recomputes `normalized` from `score` and `scale` rather than trusting the
 * column — the two have to agree, and the one that can be edited in a spreadsheet
 * is not the one to believe. Columns stay additive: add one, never rename one.
 */

export const BACKUP_CSV_HEADER = [
  'kind', 'date', 'scale', 'value_key', 'value_name', 'score', 'normalized', 'rings',
];

export const KIND = { ALIGNMENT: 'alignment', IMPORTANCE: 'importance' };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const normaliseName = (name) => String(name ?? '').trim().toLowerCase();

/** Four decimals is past the resolution of every scale and keeps the file readable. */
const formatNormalized = (normalized) => String(Math.round(normalized * 10000) / 10000);

const nameOf = (row, resolveName) => (
  resolveName ? resolveName(row) : (row.customName || row.key)
);

/**
 * Everything on the device, as the table both carriers write.
 *
 * Rows rather than text, because the same table travels two ways: a CSV file,
 * and a Google spreadsheet's cells (see app/services/GoogleSheets.js). One
 * builder, so a column added for the file is a column the sheet gets too.
 *
 * The ranking comes first, then the check-ins — the order they have to be
 * imported in (the wheel's sectors are derived from a completed ranking), so the
 * file reads in the order it is applied. Ranking rows are grouped by date, oldest
 * first, and within a date the strongest value comes first: the order the results
 * screen reads in, so the file and the screen tell the same story in the same
 * sequence. Check-in rows keep deck order within a date, which is what the query
 * returns — an alignment score says how far out on the wheel a value sits, not
 * where it stands against the others, so sorting by it would invent an ordering
 * the screen never shows.
 *
 * @param {(value: object) => string} resolveName renders a value's display name
 *   (the caller owns translation, so this takes the app's `valueName`).
 */
export async function buildBackupRows(resolveName) {
  const history = await getHistory();
  const checkins = await getAlignmentHistory();

  const ranked = [...history].sort((a, b) => (
    a.assessedOn === b.assessedOn
      ? b.normalized - a.normalized
      : a.assessedOn.localeCompare(b.assessedOn)
  ));

  return [
    BACKUP_CSV_HEADER,
    ...ranked.map((row) => [
      KIND.IMPORTANCE,
      row.assessedOn,
      row.scale,
      row.key,
      nameOf(row, resolveName),
      row.score,
      formatNormalized(row.normalized),
      '',
    ]),
    ...checkins.map((row) => [
      KIND.ALIGNMENT,
      row.checkedOn,
      '',
      row.key,
      nameOf(row, resolveName),
      row.score,
      '',
      ALIGNMENT_RINGS,
    ]),
  ];
}

/** The same table as CSV text — what a file holds. */
export async function buildBackupCsv(resolveName) {
  return toCsv(await buildBackupRows(resolveName));
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
 * Read the rows of a file into the shape the rest of this module works in,
 * whichever of the three shapes the file is in.
 *
 * The two legacy shapes are named by their date column: `assessed_on` was the
 * records file, `checked_on` the check-ins file. Every row of such a file is of
 * one kind by definition, which is exactly what the unified file spells out per
 * row instead.
 *
 * @returns {{rows: Array, error: string|null}} `error` is a stable identifier
 *   ('no_columns'), not a message: the caller owns the wording and its language.
 */
const readRows = (parsed) => {
  const columns = Object.keys(parsed[0]);
  const hasIdentity = columns.includes('value_key') || columns.includes('value_name');
  const hasScore = columns.includes('score');

  const shape = columns.includes('kind') && columns.includes('date')
    ? { date: 'date', kind: null }
    : columns.includes('assessed_on')
      ? { date: 'assessed_on', kind: KIND.IMPORTANCE }
      : columns.includes('checked_on')
        ? { date: 'checked_on', kind: KIND.ALIGNMENT }
        : null;

  if (!shape || !hasScore || !hasIdentity) return { error: 'no_columns', rows: [] };

  return {
    error: null,
    rows: parsed.map((record) => ({
      date: record[shape.date],
      key: record.value_key || '',
      kind: shape.kind || String(record.kind || '').toLowerCase(),
      name: record.value_name || '',
      rings: record.rings,
      scale: record.scale,
      score: Number(record.score),
    })),
  };
};

/**
 * Group the importance rows into the records they describe.
 *
 * A record is a date: assessments store one scale, so the first named scale wins
 * for the day and a file that mixes them within a date is describing something
 * the app cannot hold.
 */
const collectImportance = (rows) => {
  const byDate = new Map();
  let skipped = 0;

  for (const row of rows) {
    if (!DATE_KEY.test(row.date) || !Number.isInteger(row.score) || (!row.key && !row.name)) {
      skipped++;
      continue;
    }

    if (!byDate.has(row.date)) {
      byDate.set(row.date, { assessedOn: row.date, rows: [], scale: null });
    }
    const group = byDate.get(row.date);
    if (!group.scale && isValidScaleId(row.scale)) group.scale = row.scale;
    group.rows.push({ key: row.key, name: row.name, score: row.score });
  }

  const records = [];
  let ratings = 0;

  for (const group of byDate.values()) {
    const scale = group.scale || inferScale(group.rows.map((row) => row.score));
    const rows_ = group.rows.filter((row) => {
      if (isValidScore(row.score, scale)) return true;
      // Out of the scale's range: a score of 8 in a 1..5 record is not a rating
      // this app can express, and clamping it would invent an answer.
      skipped++;
      return false;
    });
    if (rows_.length === 0) continue;
    ratings += rows_.length;
    records.push({ assessedOn: group.assessedOn, rows: rows_, scale });
  }

  records.sort((a, b) => a.assessedOn.localeCompare(b.assessedOn));

  return { ratings, records, skipped };
};

/** Group the alignment rows into the check-ins they describe. */
const collectAlignment = (rows) => {
  const byDate = new Map();
  let skipped = 0;

  for (const row of rows) {
    // An older file predates the column and is a ten-ring file by definition —
    // there has never been another. A file that names a different denominator is
    // a wheel this release cannot express, and rescaling it would restate an
    // answer nobody gave; those rows are skipped and counted.
    const rings = row.rings === undefined || row.rings === ''
      ? ALIGNMENT_RINGS
      : Number(row.rings);

    // A score outside the rings is not a position on this wheel, and clamping it
    // would invent one.
    if (
      !DATE_KEY.test(row.date)
      || rings !== ALIGNMENT_RINGS
      || !isValidAlignmentScore(row.score)
      || (!row.key && !row.name)
    ) {
      skipped++;
      continue;
    }

    if (!byDate.has(row.date)) byDate.set(row.date, { checkedOn: row.date, rows: [] });
    byDate.get(row.date).rows.push({ key: row.key, name: row.name, score: row.score });
  }

  const records = [...byDate.values()].filter((record) => record.rows.length > 0);
  records.sort((a, b) => a.checkedOn.localeCompare(b.checkedOn));

  return {
    ratings: records.reduce((sum, record) => sum + record.rows.length, 0),
    records,
    skipped,
  };
};

/**
 * Read a backup's rows into the records they describe, without touching the
 * database.
 *
 * A file's rows and a spreadsheet's cells arrive in the same shape — a header
 * row and the rows under it — so both are read here rather than each getting
 * its own reader.
 *
 * Split from the write so the UI can say what an import is about to do before it
 * does it — replacing a day's record is not something to discover afterwards.
 *
 * A file holding only one of the two lists is not an error: an old records file,
 * a backup taken before the reader had ever filled in the wheel, and a file
 * hand-trimmed in a spreadsheet all arrive that way. The missing half comes back
 * as zero records and the caller reports what actually landed.
 *
 * @returns {{importance: {records: Array, ratings: number},
 *            alignment: {records: Array, ratings: number},
 *            skipped: number, error: string|null}}
 *   `error` is a stable identifier ('empty' | 'no_columns'), not a message: the
 *   caller owns the wording and the language it is in.
 */
export function parseBackupRows(cells) {
  const parsed = rowsToObjects(cells);
  const empty = {
    alignment: { ratings: 0, records: [] },
    importance: { ratings: 0, records: [] },
    skipped: 0,
  };

  if (parsed.length === 0) return { ...empty, error: 'empty' };

  const { rows, error } = readRows(parsed);
  if (error) return { ...empty, error };

  // A row naming neither kind is not addressed to either list — counted, not
  // guessed at.
  const unknownKind = rows.filter(
    (row) => row.kind !== KIND.IMPORTANCE && row.kind !== KIND.ALIGNMENT,
  ).length;

  const importance = collectImportance(rows.filter((row) => row.kind === KIND.IMPORTANCE));
  const alignment = collectAlignment(rows.filter((row) => row.kind === KIND.ALIGNMENT));

  const nothing = importance.records.length === 0 && alignment.records.length === 0;

  return {
    alignment: { ratings: alignment.ratings, records: alignment.records },
    error: nothing ? 'empty' : null,
    importance: { ratings: importance.ratings, records: importance.records },
    skipped: importance.skipped + alignment.skipped + unknownKind,
  };
}

/** The same reading, from a file's text. */
export function parseBackupCsv(text) {
  return parseBackupRows(parseCsv(text));
}

/**
 * How a row in the file finds the value it is about.
 *
 * By key first, then by rendered name — a file from another device names the
 * same catalogue entries by the same keys, and a file someone typed in a
 * spreadsheet may only have the names. Anything still unmatched is skipped and
 * counted: the deck is the shipped catalogue and nothing else, so a row naming a
 * value this app does not have is a row it cannot express.
 *
 * @param {(value: object) => string} resolveName renders a catalogue value's name
 *   so the by-name fallback can match translated names.
 */
const valueIndex = (values, resolveName) => {
  const byKey = new Map();
  const byName = new Map();

  for (const value of values) {
    byKey.set(value.key, value.id);
    byKey.set(value.id, value.id);
    const rendered = resolveName ? resolveName(value) : null;
    for (const name of [rendered, value.customName]) {
      if (name && !byName.has(normaliseName(name))) byName.set(normaliseName(name), value.id);
    }
  }

  return (row) => byKey.get(row.key) || byName.get(normaliseName(row.name)) || null;
};

/**
 * Write a parsed backup into the database.
 *
 * The ranking goes first and the check-ins after it, and that order is not
 * cosmetic: the wheel's sectors are derived from a completed ranking, so
 * check-ins written first would be scores for a wheel with no sectors yet.
 *
 * Every record resolves through `startAssessment` / `startCheckin`, the app's
 * single paths to those rows and therefore the same-day rule: importing a date
 * that already has one reopens it rather than creating a second. The day's
 * existing answers are cleared first, so an import replaces a date rather than
 * merging into it — and importing a file twice leaves the same database as
 * importing it once.
 *
 * Either half may be empty, and an empty half writes nothing rather than
 * failing: half a backup is still worth landing.
 */
export async function applyBackupCsv(plan, resolveName) {
  const values = await getAllValues();
  const findValue = valueIndex(values, resolveName);

  const summary = {
    alignment: { ratings: 0, records: 0 },
    importance: { ratings: 0, records: 0 },
    skipped: 0,
  };

  /**
   * A day's rows, paired with the values they turned out to be about.
   *
   * Resolved before anything is written, because a record is *replaced* rather
   * than merged into: a day whose every row names a value this deck does not
   * have has nothing to put in its place, and clearing it first would delete a
   * record the file was supposed to restore.
   */
  const resolveRows = (rows) => {
    const resolved = [];
    for (const row of rows) {
      const valueId = findValue(row);
      if (valueId) resolved.push({ ...row, valueId });
      else summary.skipped++;
    }
    return resolved;
  };

  for (const record of plan.importance?.records ?? []) {
    const rows = resolveRows(record.rows);
    if (rows.length === 0) continue;

    const opened = await startAssessment(record.scale, { today: record.assessedOn });
    await clearRatingsForAssessment(opened.id);

    for (const row of rows) {
      await saveRating(opened.id, row.valueId, row.score, record.scale);
      summary.importance.ratings++;
    }

    await completeAssessment(opened.id);
    summary.importance.records++;
  }

  for (const record of plan.alignment?.records ?? []) {
    const rows = resolveRows(record.rows);
    if (rows.length === 0) continue;

    const checkin = await startCheckin({ today: record.checkedOn });
    await clearAlignmentsForCheckin(checkin.id);

    for (const row of rows) {
      await saveAlignment(checkin.id, row.valueId, row.score);
      summary.alignment.ratings++;
    }

    summary.alignment.records++;
  }

  return summary;
}
