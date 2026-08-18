import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import AlignmentScreen from '../../app/screens/AlignmentScreen';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { seedDefaultValues, setValueArchived } from '../../app/services/ValuesDB';
import {
  startAssessment,
  saveRating,
  completeAssessment,
} from '../../app/services/AssessmentsDB';
import {
  startCheckin,
  saveAlignment,
  getAlignmentHistory,
  getCheckins,
} from '../../app/services/AlignmentDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { localDateKey } from '../../app/utils/dateUtils';
import { SCALE_IDS } from '../../app/utils/scales';

/**
 * The second list, end to end.
 *
 * What is worth asserting here is the membership rule — "only for those values
 * that are very important" — and the things that could quietly break it: an
 * archived value, a recalibration that was opened and abandoned, and a past
 * check-in being redrawn against today's ranking instead of its own rows.
 */

const TODAY = localDateKey();
const EARLIER = '2026-01-05';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

/** Rank some values and finish the run, so they become the current membership. */
const rank = async (scores, { scale = SCALE_IDS.NUMERIC_5, on = TODAY, finish = true } = {}) => {
  await seedDefaultValues();
  const assessment = await startAssessment(scale, { today: on });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveRating(assessment.id, valueId, score, scale);
  }
  if (finish) await completeAssessment(assessment.id);
  return assessment;
};

const checkIn = async (dateKey, scores) => {
  const checkin = await startCheckin({ today: dateKey });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveAlignment(checkin.id, valueId, score);
  }
};

const mount = async (testID = 'alignment-screen') => {
  await render(<AlignmentScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeTruthy());
};

const rowKeys = () => screen
  .getAllByTestId(/^alignment-row-/)
  .map((row) => row.props.testID.replace('alignment-row-', ''));

describe('who is on the wheel', () => {
  it('is the values in the top band, and nobody else', async () => {
    await rank({ health: 5, love: 4, order: 3, humour: 1 });
    await mount();

    expect(rowKeys()).toEqual(['health', 'love']);
  });

  it('drops a value the reader has since archived', async () => {
    // The results screen shows a record and stays complete; this asks a
    // present-tense question, and a card the deck no longer deals is not one to
    // ask about.
    await rank({ health: 5, love: 5 });
    await setValueArchived('love', true);
    await mount();

    expect(rowKeys()).toEqual(['health']);
  });

  it('says so, without sending the reader back through the deck, when nothing reached the top', async () => {
    await rank({ order: 3, humour: 2 });
    await mount('alignment-none');

    expect(screen.queryByTestId('alignment-none-action')).toBeNull();
  });

  it('offers the deck when nothing has been ranked at all', async () => {
    await seedDefaultValues();
    await mount('alignment-empty');

    expect(screen.getByTestId('alignment-empty-action')).toBeTruthy();
  });

  it('keeps today\'s answers when a recalibration is opened and abandoned', async () => {
    // Reopening clears `completed_at`, so the "latest completed assessment" can
    // become nothing at all while a fully answered check-in sits in the
    // database. Deriving the rows from membership alone would show an empty
    // wheel over live data with no way back to it.
    await rank({ health: 5, love: 5 });
    await checkIn(TODAY, { health: 7, love: 4 });
    await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });

    await mount();

    expect(rowKeys().sort()).toEqual(['health', 'love']);
    expect(screen.getByTestId('alignment-status')).toHaveTextContent(/filled in: 2 of 2/);
  });
});

describe('answering', () => {
  it('records a score against today, creating the check-in on the first tap', async () => {
    await rank({ health: 5 });
    await mount();

    expect(await getCheckins()).toHaveLength(0);

    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-health-step-7'));
    });

    await waitFor(async () => {
      expect(await getAlignmentHistory()).toMatchObject([
        { checkedOn: TODAY, key: 'health', score: 7 },
      ]);
    });
  });

  it('does not record a check-in for merely opening the screen', async () => {
    await rank({ health: 5 });
    await mount();

    expect(await getCheckins()).toHaveLength(0);
    expect(screen.getByTestId('alignment-status')).toBeTruthy();
  });

  it('empties a sector again on request', async () => {
    await rank({ health: 5 });
    await checkIn(TODAY, { health: 7 });
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-clear-health'));
    });

    await waitFor(async () => expect(await getAlignmentHistory()).toEqual([]));
  });
});

describe('the comparison with last time', () => {
  it('is a shape while the reader is deciding, and a number once they have', async () => {
    // The deck refuses to prefill a new day because it would anchor the answer.
    // The previous score is the same hazard printed above the buttons, so it
    // waits until there is an answer to compare it against.
    await rank({ health: 5, love: 5 });
    await checkIn(EARLIER, { health: 3, love: 9 });
    await mount();

    expect(screen.getByTestId('alignment-previous-hint')).toBeTruthy();
    expect(screen.queryByTestId('alignment-was-health')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-health-step-8'));
    });

    await waitFor(() => expect(screen.getByTestId('alignment-was-health')).toHaveTextContent(/was 3\/10/));
  });

  it('says how much of the earlier check-in there is to compare against', async () => {
    await rank({ health: 5, love: 5 });
    await checkIn(EARLIER, { health: 3 });
    await mount();

    // A day somebody tapped once and a day they filled in completely are
    // otherwise the same row, and the recent one is what every comparison here
    // is drawn against.
    expect(screen.getByTestId('alignment-previous-hint')).toHaveTextContent(/filled in there: 1/);
  });
});

describe('looking back', () => {
  it('draws a past check-in from its own rows, not from today\'s ranking', async () => {
    // Family was very important in January and was scored then; the July ranking
    // does not include it. Its wheel still has to show what it recorded.
    await rank({ health: 5, love: 5 });
    await checkIn(EARLIER, { order: 6, humour: 2 });
    await mount();

    expect(rowKeys()).toEqual(['health', 'love']);

    await act(async () => {
      fireEvent.press(screen.getByTestId(`open-checkin-${EARLIER}`));
    });

    expect(screen.getByTestId('alignment-viewing')).toBeTruthy();
    expect(rowKeys().sort()).toEqual(['humour', 'order']);
    // A past record is read, not edited — the same-day rule owns where a score
    // written now belongs.
    expect(screen.queryByTestId('alignment-order-input')).toBeNull();
  });

  it('comes back to today', async () => {
    await rank({ health: 5 });
    await checkIn(EARLIER, { order: 6 });
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`open-checkin-${EARLIER}`));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-back-to-today'));
    });

    expect(screen.queryByTestId('alignment-viewing')).toBeNull();
    expect(rowKeys()).toEqual(['health']);
  });

  it('lists a check-in only once it holds a score', async () => {
    await rank({ health: 5 });
    await checkIn(EARLIER, { order: 6 });
    await startCheckin({ today: TODAY });
    await mount();

    expect(screen.getByTestId(`checkin-${EARLIER}`)).toBeTruthy();
    expect(screen.queryByTestId(`checkin-${TODAY}`)).toBeNull();
  });
});
