import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { useResultsShare } from '../../app/hooks/useResultsShare';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import { insertOwnValue } from '../../test-utils/legacyValues';
import {
  startAssessment,
  saveRating,
  completeAssessment,
} from '../../app/services/AssessmentsDB';
import { startCheckin, saveAlignment } from '../../app/services/AlignmentDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { readShareCode, decodeShareCode } from '../../app/services/ResultsShare';
import { shareLink } from '../../app/utils/linkSharing';
import { localDateKey } from '../../app/utils/dateUtils';
import { SCALE_IDS } from '../../app/utils/scales';

// Only the platform half is stood in for: which of its four outcomes came back
// decides what the reader is told, and three of them cannot be produced from a
// test runner that has neither a share sheet nor a clipboard.
jest.mock('../../app/utils/linkSharing', () => ({
  ...jest.requireActual('../../app/utils/linkSharing'),
  shareLink: jest.fn(),
}));

/**
 * The whole point of the feature is the round trip, so that is what is asserted:
 * the string that leaves through the share sheet is read back the way the friend
 * on the other end will read it, and it has to say the same thing the results
 * screen does.
 */

let api = null;

function Harness() {
  api = useResultsShare();
  return <Text testID="link">{api.link || 'none'}</Text>;
}

const mount = async () => {
  await render(<Harness />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('link')).toBeTruthy());
};

const checkInToday = async (scores) => {
  const checkin = await startCheckin({ today: localDateKey() });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveAlignment(checkin.id, valueId, score);
  }
  return checkin;
};

const recordToday = async (scores) => {
  await seedDefaultValues();
  const assessment = await startAssessment(SCALE_IDS.NUMERIC_5, { today: localDateKey() });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveRating(assessment.id, valueId, score, SCALE_IDS.NUMERIC_5);
  }
  await completeAssessment(assessment.id);
  return assessment;
};

/** The ranking as it arrives on the other end. */
const shared = (url) => decodeShareCode(readShareCode(url));

beforeEach(() => {
  __resetDatabaseHandleForTests();
  api = null;
  // The default: the platform took it, and said so itself.
  shareLink.mockReset();
  shareLink.mockResolvedValue('shared');
});

describe('sharing a ranking', () => {
  it('sends a link that reads back as the same ranking', async () => {
    await recordToday({ love: 5, learning: 3, health: 1 });
    await mount();
    await waitFor(() => expect(api.busy).toBe(false));

    await act(async () => { await api.shareResults(); });

    expect(shareLink).toHaveBeenCalledTimes(1);
    const [url] = shareLink.mock.calls[0];
    const { payload, error } = shared(url);

    expect(error).toBeNull();
    expect(payload.assessedOn).toBe(localDateKey());
    expect(payload.scale).toBe(SCALE_IDS.NUMERIC_5);
    // Strongest first, the same direction the screen it was shared from reads in.
    expect(payload.entries.map((entry) => [entry.key, entry.score]))
      .toEqual([['love', 5], ['learning', 3], ['health', 1]]);
  });

  it('carries an unknown value by name, since no other install knows its key', async () => {
    await seedDefaultValues();
    const sailing = await insertOwnValue('3f1a-uuid', 'Sailing');
    await recordToday({ love: 5, [sailing]: 4 });
    await mount();

    await act(async () => { await api.shareResults(); });

    const [url] = shareLink.mock.calls[0];
    const { payload } = shared(url);
    const custom = payload.entries.find((entry) => entry.key === sailing);

    expect(custom.name).toBe('Sailing');
    // A catalogue value carries no name: the app that opens the link resolves it
    // in the language its own reader is using.
    expect(payload.entries.find((entry) => entry.key === 'love').name).toBe('');
  });

  it('keeps the link so the screen can show what is being handed over', async () => {
    await recordToday({ love: 5 });
    await mount();

    await act(async () => { await api.shareResults(); });

    await waitFor(() => expect(screen.getByTestId('link')).not.toHaveTextContent('none'));
    expect(shared(api.link).error).toBeNull();
  });

  it('says there is nothing to share rather than sending an empty link', async () => {
    await seedDefaultValues();
    await mount();

    await act(async () => { await api.shareResults(); });

    expect(screen.getByText('Nothing to share yet')).toBeTruthy();
    expect(shareLink).not.toHaveBeenCalled();
  });
});

describe('what the reader is told afterwards', () => {
  beforeEach(async () => {
    await recordToday({ love: 5 });
  });

  it('says nothing when the platform already showed a share sheet', async () => {
    shareLink.mockResolvedValue('shared');
    await mount();

    await act(async () => { await api.shareResults(); });

    // The sheet spoke for itself; a dialog on top of it would be one screen too
    // many for something that already happened.
    expect(screen.queryByTestId('app-dialog')).toBeNull();
  });

  it('announces a copy, which is otherwise invisible', async () => {
    shareLink.mockResolvedValue('copied');
    await mount();

    await act(async () => { await api.shareResults(); });

    expect(screen.getByText('Link copied')).toBeTruthy();
  });

  it('points at the box when the browser would take the link no other way', async () => {
    shareLink.mockResolvedValue('unavailable');
    await mount();

    await act(async () => { await api.shareResults(); });

    expect(screen.getByText('Copy the link yourself')).toBeTruthy();
    // The link is kept regardless of the outcome, which is what makes that
    // message actionable.
    expect(shared(api.link).error).toBeNull();
  });

  it('says nothing at all when the sheet was dismissed', async () => {
    shareLink.mockResolvedValue('cancelled');
    await mount();

    await act(async () => { await api.shareResults(); });

    expect(screen.queryByTestId('app-dialog')).toBeNull();
  });

  it('reports a failure rather than leaving the button looking dead', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    shareLink.mockRejectedValue(new Error('the share sheet fell over'));
    await mount();

    await act(async () => { await api.shareResults(); });

    expect(screen.getByText('the share sheet fell over')).toBeTruthy();
    logged.mockRestore();
  });
});

describe('the wheel, which goes only when it is asked for', () => {
  beforeEach(async () => {
    await recordToday({ love: 5, health: 4 });
    await checkInToday({ love: 9 });
  });

  it('is left out of an ordinary share', async () => {
    await mount();
    await waitFor(() => expect(api.busy).toBe(false));

    await act(async () => { await api.shareResults(); });

    const { payload } = shared(shareLink.mock.calls[0][0]);
    // The default, and the one a button press produces: a ranking, and nothing
    // about how far the sender is from living it.
    expect(payload.checkedOn).toBeNull();
    expect(payload.entries.every((entry) => entry.alignment === null)).toBe(true);
  });

  it('travels beside the ranking when it is, without disturbing it', async () => {
    await mount();
    await waitFor(() => expect(api.busy).toBe(false));

    await act(async () => { await api.shareResults({ includeAlignment: true }); });

    const { payload } = shared(shareLink.mock.calls[0][0]);
    expect(payload.checkedOn).toBe(localDateKey());
    expect(payload.entries.map((entry) => [entry.key, entry.score, entry.alignment]))
      .toEqual([['love', 5, 9], ['health', 4, null]]);
  });
});
