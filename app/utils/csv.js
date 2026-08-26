/**
 * CSV, by hand.
 *
 * A records file has to open in a spreadsheet and come back in again unharmed,
 * and the values in it are free text in two languages — a Russian value name
 * contains commas often enough that "join with a comma" is not a serialiser.
 * This is RFC 4180: fields are quoted when they contain a delimiter, a quote or a
 * newline, and a quote inside a quoted field is doubled.
 *
 * The parser is the strict inverse, with two concessions to what actually lands
 * in the file input: a leading BOM (Excel writes one, and it would otherwise
 * become part of the first header name) and CRLF line endings.
 */

const NEEDS_QUOTING = /[",\r\n]/;

const escapeField = (field) => {
  const text = field === null || field === undefined ? '' : String(field);
  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Serialise rows (an array of arrays) into CSV text with CRLF line endings. */
export function toCsv(rows) {
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

/**
 * Parse CSV text into an array of rows. Blank lines are dropped — a trailing
 * newline is the normal shape of a text file, not an empty record.
 */
export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };

  const endRow = () => {
    endField();
    // A row of one empty field is a blank line, not a record.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && !started) {
      quoted = true;
      started = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\r') {
      // Swallow the LF of a CRLF pair; a lone CR is a line ending too.
      if (source[i + 1] === '\n') i++;
      endRow();
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
      started = true;
    }
  }

  // Whatever is still buffered when the text ends is the last row, unless the
  // file ended on a newline and nothing followed it.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * Turn parsed rows into objects keyed by their header name.
 *
 * Header names are lower-cased and trimmed, so a file that came back from a
 * spreadsheet as "Assessed_On" still lines up. A short row is padded rather than
 * rejected: a missing optional column is the caller's business, not the parser's.
 *
 * Cells are coerced to text, not assumed to be text: the same shape arrives from
 * the Sheets API, which hands a numeric cell back as a number.
 */
export function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((name) => String(name).trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = String(row[index] ?? '').trim();
    });
    return record;
  });
}
