import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { useFakeLocalStorage } from '../../test-utils/fakeLocalStorage';
import AppInitializer from '../../app/screens/AppInitializer';
import { __resetDatabaseHandleForTests, resetDatabase } from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
import { getAssessments } from '../../app/services/AssessmentsDB';
import { getBooleanPreference, getPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { localDateKey } from '../../app/utils/dateUtils';
import { SCALE_IDS } from '../../app/utils/scales';

/**
 * Where the app opens, on the first launch and the fiftieth.
 *
 * There is no setup sequence any more: the first run opens on the first card,
 * with the language and scale switches on it. So the whole of a first run is the
 * deck, and the deck is long — 47 cards is more than one sitting for most
 * readers. "What happens when you come back" is therefore not an edge case here,
 * it is the normal path, and getting it wrong means starting the deck over.
 *
 * Two failures put a reader back at the start, and both are exercised below:
 * onboarding state that was never persisted, and onboarding state persisted into
 * a database the web target then lost (via the localStorage mirror). The relaunch
 * is a real one — the tree is unmounted and rendered again, so every provider
 * re-reads from storage exactly as it does on a cold start.
 */

/**
 * The first run ends where the tab shell begins, and this file is about the run.
 * Standing in for `SimpleTabs` keeps three screens, the history charts and the
 * CSV panel out of a test that never shows any of them — and gives the "we got
 * all the way through" assertions something to look for.
 */
jest.mock('../../app/navigation/SimpleTabs', () => {
  const ReactModule = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    // Pressable rather than Text so a test can also ask the shell to start a
    // recalibration, which is the one thing the real tabs do that matters here.
    default: ({ onStartCalibration }) => ReactModule.createElement(
      Pressable,
      { testID: 'main-app', onPress: onStartCalibration },
      ReactModule.createElement(Text, null, 'main app'),
    ),
  };
});

const press = async (testID) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/**
 * Render the app shell. Each test waits for the screen it expects — the shell
 * shows a spinner until every stored preference has been read back, which is the
 * point of the exercise.
 */
const launch = () => render(<AppInitializer />, { wrapper: AllProviders });

/** The first run opens straight on the deck; wait for it to deal. */
const waitForTheDeck = async () => {
  await waitFor(() => expect(screen.getByTestId('scale-input')).toBeTruthy());
};

/** Rate one card and finish, which is what completes onboarding. */
const finishTheRun = async () => {
  await press('scale-step-3');
  await press('assessment-finish');
  await waitFor(() => expect(screen.getByTestId('dialog-action-0')).toBeTruthy());
  await press('dialog-action-0');
  await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
};

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('the first launch', () => {
  it('opens on the deck, with no questions in front of it', async () => {
    await launch();

    await waitForTheDeck();
    // The two settings that used to be full screens are on the card instead.
    expect(screen.getByTestId('calibration-settings')).toBeTruthy();
    expect(screen.getByTestId('calibration-language')).toBeTruthy();
    expect(screen.getByTestId('calibration-scale')).toBeTruthy();
  });

  it('offers no way out of a run that has nowhere to go back to', async () => {
    await launch();
    await waitForTheDeck();

    // No results yet means no screen behind this one, so no close button.
    expect(screen.queryByTestId('assessment-exit')).toBeNull();
  });

  it('hides the settings once the deck has moved past the first card', async () => {
    await launch();
    await waitForTheDeck();

    await press('assessment-next');

    expect(screen.queryByTestId('calibration-settings')).toBeNull();
  });

  it('says what the deck is for, and goes on saying it past the first card', async () => {
    // Unlike the settings panel, which has been answered in practice once the
    // reader is on card two. The expectation this heads off — that 47 answers
    // buy a reading of some kind — is formed while answering, so the note has to
    // survive the card it started on.
    await launch();
    await waitForTheDeck();
    expect(screen.getByTestId('purpose-note')).toBeTruthy();

    await press('assessment-next');

    expect(screen.getByTestId('purpose-note')).toBeTruthy();
  });

  it('shows a close button again on a later recalibration', async () => {
    await launch();
    await waitForTheDeck();
    await finishTheRun();

    // Started from the main app this time, so there is a screen to close onto.
    await press('main-app');

    await waitForTheDeck();
    expect(screen.getByTestId('assessment-exit')).toBeTruthy();
  });
});

describe('the settings on the first card', () => {
  it('switches the language in place', async () => {
    await launch();
    await waitForTheDeck();

    await press('calibration-language-ru');

    await waitFor(() => expect(screen.getByTestId('assessment-finish')).toHaveTextContent('Завершить'));
    expect(await getPreference(PREF_KEYS.LANGUAGE)).toBe('ru');
  });

  it('switches the scale in place, redrawing the buttons under it', async () => {
    await launch();
    await waitForTheDeck();

    // The default scale is 1..5, so a tenth step exists only after the switch.
    expect(screen.queryByTestId('scale-step-10')).toBeNull();

    await press('calibration-scale-numeric10');

    await waitFor(() => expect(screen.getByTestId('scale-step-10')).toBeTruthy());
    expect(await getPreference(PREF_KEYS.SCALE)).toBe(SCALE_IDS.NUMERIC_10);
  });

  it('re-expresses answers already given rather than dropping them', async () => {
    await launch();
    await waitForTheDeck();

    // Top of a 1..5 scale on the first card, then switch to 1..10.
    await press('scale-step-5');
    await press('assessment-prev');
    await press('calibration-scale-numeric10');

    // The same statement, in the new scale's terms: the top step is still the
    // top step, and the answer was not quietly lost with the old numbering.
    await waitFor(() => expect(screen.getByTestId('scale-step-10')).toBeSelected());
  });
});

/**
 * The other way a first run can end.
 *
 * Somebody changing phone, or coming back to a browser that lost its database,
 * already has their records in a CSV file — and every other door to that file is
 * in Settings, which is behind the tab shell, which a first run does not reach
 * until it has produced a record. Without a door on the card, restoring a backup
 * means answering all 47 cards and throwing the result away first.
 */
describe('arriving with a CSV file', () => {
  const fileFor = (date) => [
    'assessed_on,scale,value_key,value_name,score,normalized',
    `${date},numeric5,love,Love,5,1`,
    `${date},numeric5,learning,Self-development,2,0.25`,
  ].join('\n');

  /** Paste a file into the first card's import and agree to what it says it will do. */
  const importFromTheDeck = async (csv) => {
    await press('deck-csv-import-open');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('deck-csv-paste-input'), csv);
    });
    await press('deck-csv-paste-import');
    // The confirmation is a gate, not a notice: nothing is written until it is
    // answered, and the affirmative action is the second one.
    await press('dialog-action-1');
    await waitFor(() => expect(screen.getByText('Import finished')).toBeTruthy());
    await press('dialog-action-0');
  };

  it('takes the records rather than making the reader deal 47 cards first', async () => {
    await launch();
    await waitForTheDeck();

    await importFromTheDeck(fileFor('2026-08-12'));

    // The run is over: the records it was for arrived by another route.
    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
    expect(await getAssessments({ completedOnly: true })).toHaveLength(1);
  });

  it('does not greet the same reader as a first-time visitor next launch', async () => {
    const first = await launch();
    await waitForTheDeck();
    await importFromTheDeck(fileFor('2026-08-12'));
    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());

    // Written for the same reason finishing the deck writes it — so that
    // deleting every record later lands on an empty results screen rather than
    // back in a deck with no way out.
    expect(await getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE)).toBe(true);

    await first.unmount();
    await launch();

    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
  });

  it('deals the next recalibration from the imported rows, not from the run it interrupted', async () => {
    await launch();
    await waitForTheDeck();

    // A file that contains today, which is the day the interrupted run had
    // already opened a record for.
    await importFromTheDeck(fileFor(localDateKey()));
    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());

    await press('main-app');

    // The session the deck was holding was dealt before any of this existed: it
    // would open blank, calling today a new record. What opens instead knows
    // today has one and starts from the two answers that came out of the file.
    await waitForTheDeck();
    expect(screen.getByText('You already calibrated today. Finishing overwrites that record.')).toBeTruthy();
    expect(screen.getByText('2 rated')).toBeTruthy();
  });

  it('is not offered again once there is a settings screen holding it', async () => {
    await launch();
    await waitForTheDeck();
    expect(screen.getByTestId('deck-import')).toBeTruthy();

    await finishTheRun();
    await press('main-app');

    // There are records now, which means the tab shell — and the Settings screen
    // holding this same import — is reachable. A second door here would only be
    // one more thing to scroll past.
    await waitForTheDeck();
    expect(screen.queryByTestId('deck-import')).toBeNull();
  });
});

describe('coming back to an unfinished first run', () => {
  it('reopens the deck', async () => {
    const first = await launch();
    await waitForTheDeck();
    await press('scale-step-3');

    // A relaunch, with everything the first one stored still in place.
    await first.unmount();
    await launch();

    await waitForTheDeck();
    expect(screen.queryByTestId('main-app')).toBeNull();
  });

  it('opens the main app once the first calibration is finished', async () => {
    const first = await launch();
    await waitForTheDeck();
    await finishTheRun();

    await first.unmount();
    await launch();

    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
  });

  it('starts over after a data reset', async () => {
    const first = await launch();
    await waitForTheDeck();
    await finishTheRun();

    await act(async () => {
      await resetDatabase();
      appEvents.emit(EVENTS.DATABASE_RESET);
    });

    await first.unmount();
    await launch();

    // Back to a first run: the deck, settings and all, rather than the tabs.
    await waitForTheDeck();
    expect(screen.getByTestId('calibration-settings')).toBeTruthy();
    expect(screen.queryByTestId('main-app')).toBeNull();
  });
});

describe('coming back on the web, where the database can be lost', () => {
  useFakeLocalStorage();

  it('keeps the language and the scale through an emptied database', async () => {
    const first = await launch();
    await waitForTheDeck();
    await press('calibration-language-ru');
    await press('calibration-scale-qualitative');
    await waitFor(() => expect(screen.getByTestId('scale-step-3')).toHaveTextContent('Очень важно'));

    // What a reload looks like when OPFS is unavailable: the preferences the
    // mirror kept are all that comes back.
    await first.unmount();
    __resetDatabaseHandleForTests();
    await launch();

    await waitForTheDeck();
    // Both choices survived — the deck deals the words scale, in Russian.
    await waitFor(() => expect(screen.getByTestId('scale-step-3')).toHaveTextContent('Очень важно'));
    expect(screen.queryByTestId('scale-step-5')).toBeNull();
  });

  it('does not re-run onboarding for someone who already finished it', async () => {
    const first = await launch();
    await waitForTheDeck();
    await finishTheRun();

    // The records are gone with the database — that much a mirror of the
    // preferences cannot help with. What it does prevent is greeting someone who
    // has already been through all 47 cards as a first-time visitor.
    await first.unmount();
    __resetDatabaseHandleForTests();
    await launch();

    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
  });

  it('starts a fresh run when there is no mirror to fall back on', async () => {
    const first = await launch();
    await waitForTheDeck();
    await finishTheRun();

    await first.unmount();
    globalThis.localStorage.clear();
    __resetDatabaseHandleForTests();
    await launch();

    await waitForTheDeck();
    expect(screen.getByTestId('calibration-settings')).toBeTruthy();
  });
});
