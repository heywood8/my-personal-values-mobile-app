import React from 'react';
import { Share } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import ResultsScreen from '../../app/screens/ResultsScreen';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import {
  startAssessment,
  saveRating,
  completeAssessment,
} from '../../app/services/AssessmentsDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { getPreference, setPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { readShareCode, decodeShareCode } from '../../app/services/ResultsShare';
import { localDateKey } from '../../app/utils/dateUtils';
import { SCALE_IDS } from '../../app/utils/scales';

/**
 * The screen's one job is an ordering, so that is what is asserted: which value
 * is at the top, and that the toggle can flip it.
 */

const recordToday = async (scores) => {
  await seedDefaultValues();
  const assessment = await startAssessment(SCALE_IDS.NUMERIC_5, { today: localDateKey() });
  for (const [valueId, score] of Object.entries(scores)) {
    await saveRating(assessment.id, valueId, score, SCALE_IDS.NUMERIC_5);
  }
  await completeAssessment(assessment.id);
};

const mount = async () => {
  await render(<ResultsScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('results-screen')).toBeTruthy());
};

const rankedKeys = () => screen
  .getAllByTestId(/^ranked-row-/)
  .map((row) => row.props.testID.replace('ranked-row-', ''));

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('ResultsScreen', () => {
  it('puts the most important value at the top', async () => {
    await recordToday({ love: 1, learning: 3, health: 5 });
    await mount();

    // The app reads strongest-first everywhere: the top of a rating card is
    // "very important", and so is the top of this list.
    expect(rankedKeys()).toEqual(['health', 'learning', 'love']);
  });

  it('flips to lowest-first on request, and remembers it', async () => {
    await recordToday({ love: 1, learning: 3, health: 5 });
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByTestId('results-sort-toggle-asc'));
    });

    expect(rankedKeys()).toEqual(['love', 'learning', 'health']);
    await waitFor(async () => {
      expect(await getPreference(PREF_KEYS.RESULTS_SORT)).toBe('asc');
    });
  });

  it('opens in the direction it was left in', async () => {
    await recordToday({ love: 1, health: 5 });
    await setPreference(PREF_KEYS.RESULTS_SORT, 'asc');
    await mount();

    await waitFor(() => expect(rankedKeys()).toEqual(['love', 'health']));
  });

  it('offers the record as a CSV file', async () => {
    await recordToday({ love: 5 });
    await mount();

    expect(screen.getByTestId('results-export-csv')).toBeTruthy();
  });

  it('offers the record as a link, and shows the one it made', async () => {
    // Two ways out of this screen and they are not the same: the file is a
    // backup that comes back in through import, the link is for somebody else.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await recordToday({ love: 5, health: 3 });
    await mount();

    // The link appears only once it has been asked for.
    expect(screen.queryByTestId('results-share-link')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('results-share'));
    });

    await waitFor(() => expect(screen.getByTestId('results-share-link')).toBeTruthy());
    const shownLink = screen.getByTestId('results-share-link').props.value;
    expect(decodeShareCode(readShareCode(shownLink)).payload.entries.map((entry) => entry.key))
      .toEqual(['love', 'health']);

    share.mockRestore();
  });

  it('says so when there is nothing to show', async () => {
    await seedDefaultValues();
    await render(<ResultsScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });

    await waitFor(() => expect(screen.getByTestId('results-empty')).toBeTruthy());
  });
});
