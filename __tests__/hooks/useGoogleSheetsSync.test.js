import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { useGoogleSheetsSync } from '../../app/hooks/useGoogleSheetsSync';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import {
  startAssessment, saveRating, completeAssessment, getAssessments, getRankedResults,
} from '../../app/services/AssessmentsDB';
import { getAlignmentHistory } from '../../app/services/AlignmentDB';
import { getPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { accessToken } from '../../app/services/GoogleAuth';
import {
  findOrCreateSpreadsheet, findSpreadsheet, readSheetRows, writeSheetRows,
} from '../../app/services/GoogleSheets';
import { BACKUP_CSV_HEADER } from '../../app/services/BackupCsv';
import { SCALE_IDS } from '../../app/utils/scales';

/**
 * The spreadsheet is a second carrier for the backup, so what is worth testing
 * is that it stays one: the rows that go up are the file's rows, the rows that
 * come back land through the same confirmation, and a name that finds nothing
 * is reported rather than answered with a new empty spreadsheet.
 *
 * Google itself is mocked away — the calls it would receive are covered in
 * services/GoogleSheets.test.js. What is real here is the database underneath,
 * so an import is asserted by reading back what it wrote.
 */

jest.mock('../../app/services/GoogleAuth', () => ({
  accessToken: jest.fn(async () => 'test-token'),
  canUseGoogleSync: () => true,
  currentAccount: () => 'reader@example.test',
  isSignedIn: () => true,
  signOut: jest.fn(async () => {}),
}));

jest.mock('../../app/services/GoogleSheets', () => ({
  ...jest.requireActual('../../app/services/GoogleSheets'),
  findOrCreateSpreadsheet: jest.fn(async (name) => ({ created: true, id: 'sheet-id', name })),
  findSpreadsheet: jest.fn(async (name) => ({ id: 'sheet-id', name })),
  readSheetRows: jest.fn(async () => []),
  writeSheetRows: jest.fn(async (id, rows) => rows.length - 1),
}));

let api = null;

function Harness() {
  api = useGoogleSheetsSync();
  return (
    <>
      <Text testID="busy">{api.busy ? 'busy' : 'idle'}</Text>
      <Text testID="name">{api.sheetName}</Text>
    </>
  );
}

const mount = async () => {
  await render(<Harness />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('idle'));
  // The stored name is read on mount; a test that types before it lands would
  // have its name overwritten by the read.
  await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent(/\.xlsx$/));
};

const recordToday = async () => {
  await seedDefaultValues();
  const assessment = await startAssessment(SCALE_IDS.NUMERIC_5, { today: '2026-08-12' });
  await saveRating(assessment.id, 'love', 5, SCALE_IDS.NUMERIC_5);
  await completeAssessment(assessment.id);
};

const SHEET_ROWS = [
  BACKUP_CSV_HEADER,
  ['importance', '2026-08-12', 'numeric5', 'love', 'Love', 5, 1, ''],
  ['alignment', '2026-08-12', '', 'love', 'Love', 7, '', 10],
];

/** The dialog's last action is the affirmative one; the first is Cancel. */
const pressDialog = async (index) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(`dialog-action-${index}`));
  });
};

beforeEach(() => {
  __resetDatabaseHandleForTests();
  api = null;
  jest.clearAllMocks();
});

describe('saving', () => {
  it('says there is nothing to save rather than making an empty spreadsheet', async () => {
    await seedDefaultValues();
    await mount();

    await act(async () => { await api.saveToSheets(); });

    expect(screen.getByText('Nothing to save yet')).toBeTruthy();
    expect(findOrCreateSpreadsheet).not.toHaveBeenCalled();
  });

  it('writes the file\'s own rows into the reader\'s spreadsheet', async () => {
    await recordToday();
    await mount();

    await act(async () => { await api.saveToSheets(); });

    expect(findOrCreateSpreadsheet).toHaveBeenCalledWith('my-personal-values.xlsx', 'test-token');
    const [, rows] = writeSheetRows.mock.calls[0];
    // The same table the CSV file carries, header and all — one format, two
    // carriers.
    expect(rows[0]).toEqual(BACKUP_CSV_HEADER);
    expect(rows[1]).toEqual(['importance', '2026-08-12', 'numeric5', 'love', 'Love', 5, '1', '']);
    expect(screen.getByText('Saved to Google Sheets')).toBeTruthy();
  });

  it('uses the name the reader chose, and remembers it', async () => {
    await recordToday();
    await mount();

    await act(async () => { api.setName('  our-values.xlsx '); });
    await act(async () => { await api.saveToSheets(); });

    expect(findOrCreateSpreadsheet).toHaveBeenCalledWith('our-values.xlsx', 'test-token');
    // Remembered as a preference, so the next launch — and the reader's other
    // device, told the same name — reaches the same backup.
    expect(await getPreference(PREF_KEYS.GOOGLE_SHEET_NAME)).toBe('our-values.xlsx');
  });

  it('falls back to the default name when the box was emptied', async () => {
    await recordToday();
    await mount();

    await act(async () => { api.setName('   '); });
    await act(async () => { await api.saveToSheets(); });

    expect(findOrCreateSpreadsheet).toHaveBeenCalledWith('my-personal-values.xlsx', 'test-token');
  });

  it('does nothing at all when the sign-in was dismissed', async () => {
    accessToken.mockResolvedValueOnce(null);
    await recordToday();
    await mount();

    await act(async () => { await api.saveToSheets(); });

    // A dismissal is a decision, not a failure: nothing written, nothing said.
    expect(writeSheetRows).not.toHaveBeenCalled();
    expect(screen.queryByTestId('app-dialog')).toBeNull();
  });
});

describe('loading', () => {
  it('asks before it writes anything, and writes once confirmed', async () => {
    readSheetRows.mockResolvedValueOnce(SHEET_ROWS);
    await seedDefaultValues();
    await mount();

    await act(async () => { await api.loadFromSheets(); });

    expect(screen.getByText('Load this backup?')).toBeTruthy();
    expect(await getAssessments()).toHaveLength(0);

    await pressDialog(1);

    await waitFor(async () => expect(await getAssessments()).toHaveLength(1));
    const [record] = await getAssessments();
    expect((await getRankedResults(record.id)).map((row) => row.key)).toEqual(['love']);
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 7 }]);
  });

  it('reports a name that finds nothing rather than creating a spreadsheet', async () => {
    findSpreadsheet.mockResolvedValueOnce(null);
    await seedDefaultValues();
    await mount();

    await act(async () => { await api.loadFromSheets(); });

    expect(screen.getByText('No spreadsheet by that name')).toBeTruthy();
    expect(findOrCreateSpreadsheet).not.toHaveBeenCalled();
  });

  it('says so when the spreadsheet holds nothing this app can read', async () => {
    readSheetRows.mockResolvedValueOnce([]);
    await seedDefaultValues();
    await mount();

    await act(async () => { await api.loadFromSheets(); });

    expect(screen.getByText('Nothing to load')).toBeTruthy();
    expect(await getAssessments()).toHaveLength(0);
  });

  it('reports a refusal from Google in words rather than as a stray exception', async () => {
    readSheetRows.mockRejectedValueOnce(new Error('google_unauthorized'));
    await seedDefaultValues();
    await mount();

    await act(async () => { await api.loadFromSheets(); });

    expect(screen.getByText(/Google refused the request/)).toBeTruthy();
  });
});
