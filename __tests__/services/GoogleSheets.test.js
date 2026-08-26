import {
  DEFAULT_SPREADSHEET_NAME,
  createSpreadsheet,
  findOrCreateSpreadsheet,
  findSpreadsheet,
  readSheetRows,
  spreadsheetName,
  spreadsheetUrl,
  writeSheetRows,
} from '../../app/services/GoogleSheets';

/**
 * What this module owes the rest of the app is a spreadsheet that holds a
 * backup and nothing else's idea of one, so the tests are about the three
 * things that would quietly ruin that: finding the right file, replacing its
 * contents rather than overwriting the front of them, and saying which failure
 * happened in words the caller can translate.
 */

const TOKEN = 'test-token';

const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  json: async () => payload,
  ok,
  status,
});

/** A query parameter as Google receives it — URLSearchParams writes spaces as '+'. */
const param = (url, key) => new URL(url).searchParams.get(key);

/** The last call's URL and parsed body, for asserting what Google was asked. */
const callAt = (fetchMock, index) => {
  const [url, options] = fetchMock.mock.calls[index];
  return { body: options?.body ? JSON.parse(options.body) : null, options, url };
};

afterEach(() => {
  delete global.fetch;
});

describe('naming', () => {
  it('falls back to the default when the box was left empty', () => {
    expect(spreadsheetName('   ')).toBe(DEFAULT_SPREADSHEET_NAME);
    expect(spreadsheetName(null)).toBe(DEFAULT_SPREADSHEET_NAME);
    expect(spreadsheetName('  my values.xlsx ')).toBe('my values.xlsx');
  });

  it('points at a spreadsheet by id', () => {
    expect(spreadsheetUrl('abc123')).toContain('/spreadsheets/d/abc123');
  });
});

describe('finding the backup', () => {
  it('asks Drive for spreadsheets of that name, newest first', async () => {
    global.fetch = jest.fn(async () => jsonResponse({
      files: [
        { id: 'newer', modifiedTime: '2026-08-12T10:00:00Z', name: 'my-personal-values.xlsx' },
        { id: 'older', modifiedTime: '2026-01-01T10:00:00Z', name: 'my-personal-values.xlsx' },
      ],
    }));

    const found = await findSpreadsheet(DEFAULT_SPREADSHEET_NAME, TOKEN);

    expect(found).toEqual({ id: 'newer', name: 'my-personal-values.xlsx' });
    const { url, options } = callAt(global.fetch, 0);
    expect(url).toContain('drive/v3/files');
    expect(param(url, 'q')).toContain("name = 'my-personal-values.xlsx'");
    expect(param(url, 'q')).toContain('trashed = false');
    expect(param(url, 'q')).toContain('application/vnd.google-apps.spreadsheet');
    expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('escapes a quote in the name rather than building a broken query', async () => {
    // A Drive query is a string with quoted literals in it, so an apostrophe in
    // "Nina's values" ends the literal early and the search fails as a syntax
    // error — on a name the reader is perfectly entitled to choose.
    global.fetch = jest.fn(async () => jsonResponse({ files: [] }));

    await findSpreadsheet("Nina's values", TOKEN);

    expect(param(callAt(global.fetch, 0).url, 'q')).toContain("name = 'Nina\\'s values'");
  });

  it('comes back empty rather than guessing at another file', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ files: [] }));
    expect(await findSpreadsheet('nothing-here.xlsx', TOKEN)).toBeNull();
  });
});

describe('making one', () => {
  it('creates a spreadsheet under the chosen name', async () => {
    global.fetch = jest.fn(async () => jsonResponse({
      properties: { title: 'my-personal-values.xlsx' },
      spreadsheetId: 'made',
    }));

    const created = await createSpreadsheet(DEFAULT_SPREADSHEET_NAME, TOKEN);

    expect(created).toEqual({ id: 'made', name: 'my-personal-values.xlsx' });
    expect(callAt(global.fetch, 0).body).toEqual({
      properties: { title: 'my-personal-values.xlsx' },
    });
  });

  it('only creates one when the search found nothing', async () => {
    global.fetch = jest.fn(async (url) => (
      url.includes('drive/v3/files')
        ? jsonResponse({ files: [{ id: 'existing', name: 'kept.xlsx' }] })
        : jsonResponse({ spreadsheetId: 'made' })
    ));

    expect(await findOrCreateSpreadsheet('kept.xlsx', TOKEN)).toEqual({
      created: false,
      id: 'existing',
      name: 'kept.xlsx',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('writing the backup', () => {
  it('clears the sheet before it appends, and counts the records it wrote', async () => {
    global.fetch = jest.fn(async () => jsonResponse({}));
    const rows = [['kind', 'date'], ['importance', '2026-08-12'], ['alignment', '2026-08-12']];

    const written = await writeSheetRows('sheet-id', rows, TOKEN);

    // A shorter save left under a longer one would build a file that is half of
    // one history and half of another.
    expect(callAt(global.fetch, 0).url).toContain('/values/A:Z:clear');
    const append = callAt(global.fetch, 1);
    expect(append.url).toContain('/values/A1:append');
    expect(append.url).toContain('valueInputOption=RAW');
    expect(append.url).toContain('insertDataOption=INSERT_ROWS');
    expect(append.body.values).toEqual(rows);
    // The header row is not a record.
    expect(written).toBe(2);
  });
});

describe('reading it back', () => {
  it('hands back the rows as they came', async () => {
    const rows = [['kind', 'date'], ['importance', '2026-08-12']];
    global.fetch = jest.fn(async () => jsonResponse({ values: rows }));

    expect(await readSheetRows('sheet-id', TOKEN)).toEqual(rows);
  });

  it('reads an untouched spreadsheet as no rows rather than as a failure', async () => {
    // Sheets omits `values` entirely for an empty range.
    global.fetch = jest.fn(async () => jsonResponse({ range: 'Sheet1!A1:Z1000' }));

    expect(await readSheetRows('sheet-id', TOKEN)).toEqual([]);
  });
});

describe('when Google says no', () => {
  it('names an expired or withdrawn grant', async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, { ok: false, status: 401 }));
    await expect(findSpreadsheet('x', TOKEN)).rejects.toThrow('google_unauthorized');
  });

  it('names a refusal separately from an unreachable network', async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, { ok: false, status: 500 }));
    await expect(findSpreadsheet('x', TOKEN)).rejects.toThrow('google_failed');

    global.fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(findSpreadsheet('x', TOKEN)).rejects.toThrow('google_offline');
  });
});
