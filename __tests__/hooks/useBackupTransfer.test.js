import React from 'react';
import { Text, Share } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { useBackupTransfer } from '../../app/hooks/useBackupTransfer';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { getAssessments, getRankedResults } from '../../app/services/AssessmentsDB';
import { getCheckins, getAlignmentHistory } from '../../app/services/AlignmentDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

/**
 * The hook is where an import stops being a parse and becomes a write, so what
 * is worth testing is the gate: nothing reaches the database until the reader
 * has been told what it is about to do, and a file that says nothing usable
 * never gets that far.
 *
 * The other half is the report. One file carries both lists and either may be
 * missing, so what the reader is told has to be what actually landed — a line
 * about check-ins is absent when the file had none, rather than claiming zero.
 */

let api = null;

function Harness() {
  api = useBackupTransfer();
  return <Text testID="busy">{api.busy ? 'busy' : 'idle'}</Text>;
}

const mount = async () => {
  await render(<Harness />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('idle'));
};

const CSV = [
  'kind,date,scale,value_key,value_name,score,normalized,rings',
  'importance,2026-08-12,numeric5,love,Love,5,1,',
  'importance,2026-08-12,numeric5,learning,Self-development,2,0.25,',
  'alignment,2026-08-12,,love,Love,7,,10',
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

    expect(screen.getByText('Load this backup?')).toBeTruthy();
    // Still nothing in the database — the confirmation is a gate, not a notice.
    expect(await getAssessments()).toHaveLength(0);
  });

  it('writes both lists once confirmed, and says what it did', async () => {
    await mount();
    await act(async () => { await api.importText(CSV); });

    await pressDialog(1);

    await waitFor(async () => expect(await getAssessments()).toHaveLength(1));
    const [record] = await getAssessments();
    expect((await getRankedResults(record.id)).map((r) => r.key)).toEqual(['love', 'learning']);
    expect(await getAlignmentHistory()).toMatchObject([{ key: 'love', score: 7 }]);
    expect(screen.getByText('Loading finished')).toBeTruthy();
    expect(screen.getByText(/Calibrations: 1, ratings: 2\./)).toBeTruthy();
    expect(screen.getByText(/Check-ins: 1, scores: 1\./)).toBeTruthy();
  });

  it('writes nothing when the reader cancels', async () => {
    await mount();
    await act(async () => { await api.importText(CSV); });

    await pressDialog(0);

    expect(await getAssessments()).toHaveLength(0);
  });

  it('reports a file that is not a backup, without asking', async () => {
    await mount();

    await act(async () => { await api.importText('name,phone\nAda,555'); });

    expect(screen.getByText('That is not a backup file')).toBeTruthy();
    expect(await getAssessments()).toHaveLength(0);
  });

  it('reports a file with nothing usable in it', async () => {
    await mount();

    await act(async () => {
      await api.importText('kind,date,value_key,score\nimportance,yesterday,love,5');
    });

    expect(screen.getByText('Nothing to load')).toBeTruthy();
  });

  it('says nothing about a list the file does not carry', async () => {
    await mount();
    await act(async () => {
      await api.importText([
        'kind,date,scale,value_key,value_name,score',
        'importance,2026-08-12,numeric5,love,Love,5',
      ].join('\n'));
    });

    await pressDialog(1);

    await waitFor(() => expect(screen.getByText(/Calibrations: 1, ratings: 1\./)).toBeTruthy());
    // A "Check-ins: 0" line would read as a failure; its absence reads as what
    // it is — the file did not have any.
    expect(screen.queryByText(/Check-ins:/)).toBeNull();
    expect(await getCheckins()).toHaveLength(0);
  });

  it('counts the rows it could not use', async () => {
    await mount();
    await act(async () => {
      await api.importText([
        'kind,date,scale,value_key,value_name,score',
        'importance,2026-08-12,numeric5,another-devices-uuid,Sailing,4',
        'importance,2026-08-12,numeric5,love,Love,5',
      ].join('\n'));
    });

    await pressDialog(1);

    // One dialog body, so the counts are matched inside it rather than as
    // separate lines.
    await waitFor(() => expect(screen.getByText(/Rows skipped: 1\./)).toBeTruthy());
  });

  it('says so when a readable file lands nothing at all', async () => {
    await mount();
    await act(async () => {
      await api.importText([
        'kind,date,scale,value_key,value_name,score',
        'importance,2026-08-12,numeric5,another-devices-uuid,Sailing,4',
      ].join('\n'));
    });

    await pressDialog(1);

    await waitFor(() => expect(
      screen.getByText(/Nothing could be loaded from that file\./),
    ).toBeTruthy());
  });
});

describe('exporting', () => {
  it('says there is nothing to save rather than writing an empty file', async () => {
    const share = jest.spyOn(Share, 'share');
    await mount();

    await act(async () => { await api.exportBackup(); });

    expect(screen.getByText('Nothing to save yet')).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
    share.mockRestore();
  });

  it('hands the file to the platform once there is something in it', async () => {
    // Off the web there is no download to trigger, so the share sheet is where a
    // file goes; the hook's job is to build it and let the platform place it.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await mount();
    await act(async () => { await api.importText(CSV); });
    await pressDialog(1);
    await waitFor(async () => expect(await getAssessments()).toHaveLength(1));

    await act(async () => { await api.exportBackup(); });

    expect(share).toHaveBeenCalledTimes(1);
    const [{ message, title }] = share.mock.calls[0];
    expect(title).toMatch(/^values-backup-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(message).toContain('kind,date,scale,value_key,value_name,score,normalized,rings');
    expect(message).toContain('importance,2026-08-12,numeric5,love,Love,5,1,');
    expect(message).toContain('alignment,2026-08-12,,love,Love,7,,10');
    share.mockRestore();
  });
});
