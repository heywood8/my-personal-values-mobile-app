import React from 'react';
import { Text, Share } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { useCsvTransfer } from '../../app/hooks/useCsvTransfer';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { getAssessments, getRankedResults } from '../../app/services/AssessmentsDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

/**
 * The hook is where an import stops being a parse and becomes a write, so what
 * is worth testing is the gate: nothing reaches the database until the reader
 * has been told what it is about to do, and a file that says nothing usable
 * never gets that far.
 */

let api = null;

function Harness() {
  api = useCsvTransfer();
  return <Text testID="busy">{api.busy ? 'busy' : 'idle'}</Text>;
}

const mount = async () => {
  await render(<Harness />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('idle'));
};

const CSV = [
  'assessed_on,scale,value_key,value_name,score,normalized',
  '2026-08-12,numeric5,love,Love,5,1',
  '2026-08-12,numeric5,learning,Self-development,2,0.25',
].join('\n');

/** The dialog's last action is the affirmative one; the first is Cancel. */
const pressDialog = async (index) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(`dialog-action-${index}`));
  });
};

beforeEach(() => {
  __resetDatabaseHandleForTests();
  api = null;
});

describe('importing', () => {
  it('asks before it writes anything', async () => {
    await mount();

    await act(async () => { await api.importText(CSV); });

    expect(screen.getByText('Import these records?')).toBeTruthy();
    // Still nothing in the database — the confirmation is a gate, not a notice.
    expect(await getAssessments()).toHaveLength(0);
  });

  it('writes the records once confirmed, and says what it did', async () => {
    await mount();
    await act(async () => { await api.importText(CSV); });

    await pressDialog(1);

    await waitFor(async () => expect(await getAssessments()).toHaveLength(1));
    const [record] = await getAssessments();
    expect((await getRankedResults(record.id)).map((r) => r.key)).toEqual(['love', 'learning']);
    expect(screen.getByText('Import finished')).toBeTruthy();
  });

  it('writes nothing when the reader cancels', async () => {
    await mount();
    await act(async () => { await api.importText(CSV); });

    await pressDialog(0);

    expect(await getAssessments()).toHaveLength(0);
  });

  it('reports a file that is not a records file, without asking', async () => {
    await mount();

    await act(async () => { await api.importText('name,phone\nAda,555'); });

    expect(screen.getByText('That is not a records file')).toBeTruthy();
    expect(await getAssessments()).toHaveLength(0);
  });

  it('reports a records file with nothing usable in it', async () => {
    await mount();

    await act(async () => {
      await api.importText('assessed_on,value_key,score\nyesterday,love,5');
    });

    expect(screen.getByText('Nothing to import')).toBeTruthy();
  });

  it('counts the values it had to add and the rows it could not use', async () => {
    await mount();
    await act(async () => {
      await api.importText([
        'assessed_on,scale,value_key,value_name,score',
        '2026-08-12,numeric5,another-devices-uuid,Sailing,4',
        '2026-08-12,numeric5,nothing-doing,,4',
      ].join('\n'));
    });

    await pressDialog(1);

    // One dialog body, so the counts are matched inside it rather than as
    // separate lines.
    await waitFor(() => expect(screen.getByText(/1 values were added to your deck\./)).toBeTruthy());
    expect(screen.getByText(/1 rows were skipped\./)).toBeTruthy();
  });
});

describe('exporting', () => {
  it('says there is nothing to save rather than writing an empty file', async () => {
    const share = jest.spyOn(Share, 'share');
    await mount();

    await act(async () => { await api.exportCsv(); });

    expect(screen.getByText('Nothing to save yet')).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
    share.mockRestore();
  });

  it('hands the file to the platform once there is a record', async () => {
    // Off the web there is no download to trigger, so the share sheet is where a
    // file goes; the hook's job is to build it and let the platform place it.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await mount();
    await act(async () => { await api.importText(CSV); });
    await pressDialog(1);
    await waitFor(async () => expect(await getAssessments()).toHaveLength(1));

    await act(async () => { await api.exportCsv(); });

    expect(share).toHaveBeenCalledTimes(1);
    const [{ message, title }] = share.mock.calls[0];
    expect(title).toMatch(/^values-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(message).toContain('assessed_on,scale,value_key,value_name,score,normalized');
    expect(message).toContain('2026-08-12,numeric5,love,Love,5,1');
    share.mockRestore();
  });
});
