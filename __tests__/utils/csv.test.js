import { toCsv, parseCsv, rowsToObjects } from '../../app/utils/csv';

/**
 * The file has to survive a round trip through a spreadsheet, and the data in it
 * is free text in two languages — a Russian value name carries commas often
 * enough that "join with a comma" would corrupt real records rather than exotic
 * ones.
 */
describe('toCsv', () => {
  it('leaves plain fields alone', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('quotes a field containing a comma, a quote or a newline', () => {
    expect(toCsv([['Caring, and self-care']])).toBe('"Caring, and self-care"');
    expect(toCsv([['She said "no"']])).toBe('"She said ""no"""');
    expect(toCsv([['two\nlines']])).toBe('"two\nlines"');
  });

  it('writes numbers and empty cells without inventing anything', () => {
    expect(toCsv([['love', 5, null, undefined, '']])).toBe('love,5,,,');
  });
});

describe('parseCsv', () => {
  it('is the inverse of toCsv, awkward fields included', () => {
    const rows = [
      ['assessed_on', 'value_name', 'score'],
      ['2026-08-12', 'Caring, and self-care', '5'],
      ['2026-08-12', 'She said "no"', '1'],
      ['2026-08-12', 'two\nlines', '3'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('accepts CRLF, LF and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('strips the byte-order mark Excel writes', () => {
    // Left in place it becomes part of the first header name, and every lookup
    // for "assessed_on" misses.
    expect(parseCsv('\uFEFFassessed_on,score\n2026-08-12,5')[0][0]).toBe('assessed_on');
  });

  it('drops blank lines rather than reporting empty records', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('returns nothing for empty text', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
  });
});

describe('rowsToObjects', () => {
  it('keys each row by its header, normalising the header names', () => {
    const rows = [[' Assessed_On ', 'SCORE'], ['2026-08-12', ' 5 ']];
    expect(rowsToObjects(rows)).toEqual([{ assessed_on: '2026-08-12', score: '5' }]);
  });

  it('pads a short row instead of rejecting it', () => {
    const rows = [['a', 'b', 'c'], ['1']];
    expect(rowsToObjects(rows)).toEqual([{ a: '1', b: '', c: '' }]);
  });

  it('returns nothing when there is not even a header', () => {
    expect(rowsToObjects([])).toEqual([]);
  });
});
