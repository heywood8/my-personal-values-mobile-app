/**
 * The backup, as a spreadsheet in the reader's own Google Drive.
 *
 * Same table as the CSV file, cell for cell: `buildBackupRows()` fills it and
 * `parseBackupRows()` reads it back (see services/BackupCsv.js). One format, two
 * carriers — a column added for the file is a column the sheet gets, and a sheet
 * downloaded as CSV imports through the file door without anything having to
 * agree twice.
 *
 * What this module does not have is a database or an opinion about the reader's
 * data: it takes rows, puts them in a named spreadsheet, and hands rows back.
 * Deciding what to do with them is the import's job, so a sync that lands
 * somebody else's numbers still goes through the same confirmation a file does.
 *
 * The scope is `drive.file` — per-file access to files this app created — so
 * every call here is against a file the app made itself. A spreadsheet the
 * reader created by hand is invisible to the search below even when the name
 * matches exactly, which is why "save" makes its own the first time and finds it
 * every time after.
 */

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/**
 * What the spreadsheet is called when the reader has not said.
 *
 * The extension is part of the name rather than a fact about the file: a Google
 * spreadsheet has no extension, and this is what somebody looking for their
 * backup in a Drive listing expects to see.
 */
export const DEFAULT_SPREADSHEET_NAME = 'my-personal-values.xlsx';

/**
 * The cells the backup lives in.
 *
 * Whole columns rather than a row count: the table is eight columns wide today
 * and a new one is meant to be addable in BackupCsv.js alone. A sheet this app
 * created has Google's default twenty-six, so the range is inside the grid.
 */
const SHEET_RANGE = 'A:Z';

/** A name that will not be mistaken for "the reader left the box empty". */
export const spreadsheetName = (raw) => {
  const trimmed = String(raw ?? '').trim();
  return trimmed || DEFAULT_SPREADSHEET_NAME;
};

/** Where a spreadsheet can be opened, so the app can offer the reader the link. */
export const spreadsheetUrl = (spreadsheetId) => (
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
);

/**
 * One call to Google, with the failures named rather than described.
 *
 * The identifiers are stable ('google_unauthorized', 'google_failed') because
 * the caller owns the wording and the language it is in — the same division the
 * backup parser keeps.
 */
async function call(url, token, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : null),
        ...options.headers,
      },
    });
  } catch (error) {
    // No network, or a browser that blocked the request outright.
    console.error('[GoogleSheets] Request failed:', error);
    throw new Error('google_offline', { cause: error });
  }

  if (response.status === 401 || response.status === 403) {
    // The token expired mid-sync, or the grant was withdrawn from the Google
    // account page while the app was open.
    throw new Error('google_unauthorized');
  }

  if (!response.ok) {
    console.error('[GoogleSheets] Google refused the request:', response.status, url);
    throw new Error('google_failed');
  }

  return response.status === 204 ? null : response.json();
}

/** A single-quoted string inside a Drive query, with its quotes escaped. */
const quoted = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * The app's spreadsheet with this name, or null.
 *
 * Two files can carry one name in Drive — a second "save" under a name the
 * reader had already used elsewhere in the app's own files, say — so the most
 * recently touched one wins. That is the one a reader who just saved is thinking
 * of, and it is the one the next save writes to, so the two agree.
 */
export async function findSpreadsheet(name, token) {
  const query = [
    `name = ${quoted(spreadsheetName(name))}`,
    `mimeType = ${quoted(SPREADSHEET_MIME)}`,
    'trashed = false',
  ].join(' and ');

  const url = `${DRIVE_FILES_URL}?${new URLSearchParams({
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
    q: query,
    spaces: 'drive',
  })}`;

  const found = await call(url, token);
  const file = found?.files?.[0];
  return file ? { id: file.id, name: file.name } : null;
}

/** Make one, and hand back the same shape `findSpreadsheet` does. */
export async function createSpreadsheet(name, token) {
  const created = await call(SHEETS_URL, token, {
    body: JSON.stringify({ properties: { title: spreadsheetName(name) } }),
    method: 'POST',
  });

  return { id: created.spreadsheetId, name: created.properties?.title || spreadsheetName(name) };
}

/** The one to write to: the app's file of that name, or a new one. */
export async function findOrCreateSpreadsheet(name, token) {
  const existing = await findSpreadsheet(name, token);
  if (existing) return { ...existing, created: false };
  return { ...(await createSpreadsheet(name, token)), created: true };
}

/**
 * Replace the sheet's contents with `rows`.
 *
 * Cleared and then appended rather than written in place, and both halves are
 * deliberate. A backup is a snapshot: leaving the tail of a longer previous save
 * under a shorter new one would build a file that is half of one history and
 * half of another. And appending is what grows the grid — a plain write past the
 * default thousand rows is refused by the API, which is exactly what a few years
 * of daily check-ins is.
 */
export async function writeSheetRows(spreadsheetId, rows, token) {
  await call(`${SHEETS_URL}/${spreadsheetId}/values/${SHEET_RANGE}:clear`, token, {
    body: JSON.stringify({}),
    method: 'POST',
  });

  const params = new URLSearchParams({
    insertDataOption: 'INSERT_ROWS',
    // RAW: a date written as a formatted value comes back as whatever the
    // reader's locale renders it as, and `2026-08-12` is what the importer reads.
    valueInputOption: 'RAW',
  });

  await call(`${SHEETS_URL}/${spreadsheetId}/values/A1:append?${params}`, token, {
    body: JSON.stringify({ majorDimension: 'ROWS', values: rows }),
    method: 'POST',
  });

  // The header row does not count as a record.
  return Math.max(rows.length - 1, 0);
}

/** The sheet's rows, header included, in the shape `parseBackupRows()` reads. */
export async function readSheetRows(spreadsheetId, token) {
  const params = new URLSearchParams({
    // Unformatted, for the same reason the write is RAW.
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const read = await call(
    `${SHEETS_URL}/${spreadsheetId}/values/${SHEET_RANGE}?${params}`,
    token,
  );

  return read?.values ?? [];
}
