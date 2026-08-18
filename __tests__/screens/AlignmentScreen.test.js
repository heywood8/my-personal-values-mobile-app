import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import AlignmentScreen from '../../app/screens/AlignmentScreen';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { seedDefaultValues, setValueArchived } from '../../app/services/ValuesDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
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

  it('drops a value archived while the screen is open', async () => {
    // The ranking is a snapshot — it is re-read when an assessment changes, and
    // archiving changes the catalogue instead. Reading only the snapshot leaves
    // the value on the wheel, and answerable, until the next launch.
    await rank({ health: 5, love: 5 });
    await mount();
    expect(rowKeys()).toEqual(['health', 'love']);

    await act(async () => {
      await setValueArchived('love', true);
      appEvents.emit(EVENTS.VALUES_CHANGED);
    });

    await waitFor(() => expect(rowKeys()).toEqual(['health']));
    expect(screen.queryByTestId('alignment-love-input')).toBeNull();
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

  it('keeps an answer given this session when a recalibration drops the value', async () => {
    // The recalibration lands while the screen is open, so the value leaves the
    // top band the instant it does. Its score for today is already in the
    // database; reading the carried rows off the re-read-on-event history copy
    // would take it off the wheel and leave it in the file.
    await rank({ health: 5, love: 5 });
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-love-step-4'));
    });
    await waitFor(async () => expect(await getAlignmentHistory()).toHaveLength(1));

    await act(async () => {
      const redone = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
      await saveRating(redone.id, 'love', 2, SCALE_IDS.NUMERIC_5);
      await completeAssessment(redone.id);
      appEvents.emit(EVENTS.ASSESSMENTS_CHANGED);
    });

    await waitFor(() => expect(rowKeys()).toContain('health'));
    expect(rowKeys()).toContain('love');
    expect(screen.getByTestId('alignment-status')).toHaveTextContent(/filled in: 1 of 2/);
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

describe('across midnight', () => {
  // A once-a-day app is exactly the kind that sits open on a phone while the
  // date changes underneath it.
  afterEach(() => { jest.useRealTimers(); });

  it("stops presenting yesterday's answers as today's", async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date(2026, 7, 18, 23, 55, 0));

    await rank({ health: 5, love: 5 }, { on: '2026-08-18' });
    await mount();
    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-health-step-7'));
    });
    await waitFor(async () => expect(await getAlignmentHistory()).toHaveLength(1));
    expect(screen.getByTestId('alignment-status')).toHaveTextContent(/filled in: 1 of 2/);

    jest.setSystemTime(new Date(2026, 7, 19, 0, 30, 0));
    // Any interaction re-renders; the date stamp is what makes the state correct
    // itself rather than carry yesterday forward.
    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-love-step-4'));
    });

    // Yesterday's 7 is not today's answer, and the clear button that would have
    // deleted nothing from the new day's record is not offered for it.
    await waitFor(() => expect(screen.getByTestId('alignment-status')).toHaveTextContent(/filled in: 1 of 2/));
    expect(screen.queryByTestId('alignment-clear-health')).toBeNull();
    expect(screen.getByTestId('alignment-clear-love')).toBeTruthy();

    // Both days are on record, each with its own answer.
    const stored = (await getAlignmentHistory()).map((row) => `${row.checkedOn}:${row.key}=${row.score}`);
    expect(stored.sort()).toEqual(['2026-08-18:health=7', '2026-08-19:love=4']);

    // And yesterday's row still says what it holds. Its score was written
    // optimistically and never re-read, so counting it off the history copy
    // would report a fully answered day as empty.
    expect(screen.getByTestId('checkin-2026-08-18')).toHaveTextContent(/filled in: 1/);
    expect(screen.getByTestId('checkin-2026-08-19')).toHaveTextContent(/filled in: 1/);
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

  it("lands on the live wheel when today's own record is tapped", async () => {
    // Today's row is in the records list like any other. Reading the date it
    // sets as "a past check-in" would render today out of `history` — which does
    // not hold the answers given in this session, because those are written
    // optimistically — and the screen went blank.
    await rank({ health: 5, love: 5 });
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByTestId('alignment-health-step-7'));
    });
    await waitFor(() => expect(screen.getByTestId(`checkin-${TODAY}`)).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId(`open-checkin-${TODAY}`));
    });

    expect(screen.queryByTestId('alignment-viewing')).toBeNull();
    expect(rowKeys().sort()).toEqual(['health', 'love']);
    expect(screen.getByTestId('alignment-sector-health')).toBeTruthy();
    // Still answerable, which is the whole difference between today and a record.
    expect(screen.getByTestId('alignment-love-input')).toBeTruthy();
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
