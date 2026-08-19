import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import HistoryScreen from '../../app/screens/HistoryScreen';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import {
  startAssessment,
  saveRating,
  completeAssessment,
} from '../../app/services/AssessmentsDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { MAX_TRACKED_SERIES } from '../../app/styles/chartPalette';
import { MIN_TRACKED_VALUES } from '../../app/utils/history';
import { SCALE_IDS } from '../../app/utils/scales';

/**
 * The screen's job is a default: open on the values the reader actually watches,
 * and let a handful of them be laid over one another. Both halves are asserted
 * here — how many cards the grid deals itself, and the ceiling on the overlay.
 */

const KEYS = [
  'acceptance', 'adventure', 'assertiveness', 'authenticity', 'caring',
  'compassion', 'connection', 'generosity', 'cooperation', 'courage',
  'creativity', 'curiosity', 'encouragement', 'honesty', 'health',
  'adaptability', 'freedom', 'friendliness',
];

const record = async (assessedOn, scores) => {
  const assessment = await startAssessment(SCALE_IDS.NUMERIC_10, { today: assessedOn });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveRating(assessment.id, valueId, score, SCALE_IDS.NUMERIC_10);
  }
  await completeAssessment(assessment.id);
};

/** `count` values scored `high`, the rest of `KEYS` scored `low`. */
const scores = (count, high = 9, low = 4) => Object.fromEntries(
  KEYS.map((key, index) => [key, index < count ? high : low]),
);

const mount = async () => {
  await render(<HistoryScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('history-screen')).toBeTruthy());
};

const cardKeys = () => screen
  .queryAllByTestId(/^trend-card-/)
  .map((card) => card.props.testID.replace('trend-card-', ''));

const focusedKeys = () => screen
  .queryAllByTestId(/^trend-card-/)
  .filter((card) => card.props.accessibilityState?.checked)
  .map((card) => card.props.testID.replace('trend-card-', ''));

const press = async (testID) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(async () => {
  __resetDatabaseHandleForTests();
  await seedDefaultValues();
});

describe('HistoryScreen: which values it opens on', () => {
  it('tracks the top ten when fewer than ten are very important', async () => {
    // Three in the core band, eighteen rated. Ten is the floor that stops a
    // cautious ranking opening this screen on almost nothing.
    await record('2026-01-01', scores(3));
    await mount();

    expect(cardKeys()).toHaveLength(MIN_TRACKED_VALUES);
    expect(cardKeys().slice(0, 3)).toEqual(['acceptance', 'adventure', 'assertiveness']);
  });

  it('widens to the whole core band when more than ten are very important', async () => {
    // Fourteen "very important" values: cutting at ten would drop four the
    // reader had just said matter most.
    await record('2026-01-01', scores(14));
    await mount();

    expect(cardKeys()).toHaveLength(14);
  });

  it('opens on nothing but a nudge before the first calibration', async () => {
    await render(<HistoryScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeTruthy());
    expect(cardKeys()).toEqual([]);
  });

  it('shows the grid on a single calibration, where the old chart was blank', async () => {
    await record('2026-01-01', scores(3));
    await mount();

    // One calibration is a position, not a trend: the cards are there, the
    // overlay is not.
    expect(cardKeys()).toHaveLength(MIN_TRACKED_VALUES);
    expect(screen.queryByTestId('trend-chart')).toBeNull();
    expect(screen.getByText(/One calibration so far/i)).toBeTruthy();
  });
});

describe('HistoryScreen: the overlay', () => {
  const twoRuns = async () => {
    await record('2026-01-01', scores(3));
    await record('2026-02-01', { ...scores(3), acceptance: 4, caring: 10 });
  };

  it('opens with the values that moved laid over one another', async () => {
    await twoRuns();
    await mount();

    expect(screen.getByTestId('trend-chart')).toBeTruthy();
    // `acceptance` fell and `caring` rose; nothing else changed.
    expect(focusedKeys().sort()).toEqual(['acceptance', 'caring']);
  });

  it('adds and removes a line when its card is tapped', async () => {
    await twoRuns();
    await mount();

    await press('trend-card-adventure');
    expect(focusedKeys()).toContain('adventure');

    await press('trend-card-adventure');
    expect(focusedKeys()).not.toContain('adventure');
  });

  it('never lays more lines over one another than the palette can tell apart', async () => {
    await twoRuns();
    await mount();

    for (const key of cardKeys()) {
      await press(`trend-card-${key}`);
    }

    expect(focusedKeys().length).toBeLessThanOrEqual(MAX_TRACKED_SERIES);
  });
});

describe('HistoryScreen: choosing the tracked set', () => {
  it('adds a value from outside the default set, and puts the default back', async () => {
    await record('2026-01-01', scores(3));
    await mount();

    const outside = KEYS[KEYS.length - 1];
    expect(cardKeys()).not.toContain(outside);

    await press('history-manage-toggle');
    await press(`legend-${outside}`);
    expect(cardKeys()).toContain(outside);
    expect(cardKeys()).toHaveLength(MIN_TRACKED_VALUES + 1);

    await press('history-manage-reset');
    expect(cardKeys()).toHaveLength(MIN_TRACKED_VALUES);
    expect(cardKeys()).not.toContain(outside);
  });

  it('drops a value from the grid when it is deselected', async () => {
    await record('2026-01-01', scores(3));
    await mount();

    await press('history-manage-toggle');
    await press('legend-acceptance');
    expect(cardKeys()).not.toContain('acceptance');
  });
});
