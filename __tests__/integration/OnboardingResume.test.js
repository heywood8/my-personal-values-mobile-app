import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { useFakeLocalStorage } from '../../test-utils/fakeLocalStorage';
import AppInitializer from '../../app/screens/AppInitializer';
import { __resetDatabaseHandleForTests, resetDatabase } from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
import { getPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
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
