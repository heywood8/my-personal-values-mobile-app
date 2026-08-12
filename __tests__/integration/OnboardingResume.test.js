import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { useFakeLocalStorage } from '../../test-utils/fakeLocalStorage';
import AppInitializer from '../../app/screens/AppInitializer';
import { __resetDatabaseHandleForTests, resetDatabase } from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

/**
 * Where the app opens, on the second launch and the fiftieth.
 *
 * The first run is a sequence — language, scale, deck — and the whole of it is
 * long: 47 cards is more than one sitting for most readers. So "what happens when
 * you come back" is not an edge case here, it is the normal path, and getting it
 * wrong means being asked the same two questions every time.
 *
 * Two different failures put a reader back at the start, and both are exercised
 * below: onboarding state that was never persisted at all (the scale step), and
 * onboarding state that was persisted into a database the web target then lost
 * (the language, via the localStorage mirror). The relaunch is a real one — the
 * tree is unmounted and rendered again, so every provider re-reads from storage
 * exactly as it does on a cold start.
 */

/**
 * The onboarding sequence ends where the tab shell begins, and this file is about
 * the sequence. Standing in for `SimpleTabs` keeps three screens, the history
 * charts and the CSV panel out of a test that never shows any of them — and
 * gives the "we got all the way through" assertions something to look for.
 */
jest.mock('../../app/navigation/SimpleTabs', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactModule.createElement(Text, { testID: 'main-app' }, 'main app'),
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

/** Rate one card and finish, which is what completes onboarding. */
const finishTheRun = async () => {
  await press('scale-step-8');
  await press('assessment-finish');
  await waitFor(() => expect(screen.getByTestId('dialog-action-0')).toBeTruthy());
  await press('dialog-action-0');
  await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
};

/** Walk the first run as far as the deck. */
const walkToTheDeck = async () => {
  await waitFor(() => expect(screen.getByTestId('language-en')).toBeTruthy());
  await press('language-en');
  await press('language-continue');

  await waitFor(() => expect(screen.getByTestId('scale-selection')).toBeTruthy());
  await press('scale-option-numeric10');
  await press('scale-continue');

  await waitFor(() => expect(screen.getByTestId('scale-input')).toBeTruthy());
};

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('coming back to an unfinished first run', () => {
  it('reopens the deck instead of asking about the scale again', async () => {
    const first = await launch();
    await walkToTheDeck();

    // A relaunch, with everything the first one stored still in place.
    await first.unmount();
    await launch();

    await waitFor(() => expect(screen.getByTestId('scale-input')).toBeTruthy());
    expect(screen.queryByTestId('scale-selection')).toBeNull();
    expect(screen.queryByTestId('language-list')).toBeNull();
  });

  it('reopens the scale question if that is where the reader stepped back to', async () => {
    const first = await launch();
    await walkToTheDeck();

    // Leaving the first deck has nowhere to go but back a step — there are no
    // results yet, so there is no main screen to land on. Index 1 is the
    // confirming action; index 0 cancels.
    await press('assessment-exit');
    await waitFor(() => expect(screen.getByTestId('dialog-action-1')).toBeTruthy());
    await press('dialog-action-1');
    await waitFor(() => expect(screen.getByTestId('scale-selection')).toBeTruthy());

    await first.unmount();
    await launch();

    await waitFor(() => expect(screen.getByTestId('scale-selection')).toBeTruthy());
    expect(screen.queryByTestId('scale-input')).toBeNull();
  });

  it('opens the main app once the first calibration is finished', async () => {
    const first = await launch();
    await walkToTheDeck();
    await finishTheRun();

    await first.unmount();
    await launch();

    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
  });

  it('starts over after a data reset', async () => {
    const first = await launch();
    await walkToTheDeck();

    await act(async () => {
      await resetDatabase();
      appEvents.emit(EVENTS.DATABASE_RESET);
    });

    await first.unmount();
    await launch();

    await waitFor(() => expect(screen.getByTestId('language-list')).toBeTruthy());
  });
});

describe('coming back on the web, where the database can be lost', () => {
  useFakeLocalStorage();

  it('keeps the language and the scale through an emptied database', async () => {
    const first = await launch();
    await walkToTheDeck();

    // What a reload looks like when OPFS is unavailable: the preferences the
    // mirror kept are all that comes back.
    await first.unmount();
    __resetDatabaseHandleForTests();
    await launch();

    // Straight back into the deck: language answered, scale answered.
    await waitFor(() => expect(screen.getByTestId('scale-input')).toBeTruthy());
    expect(screen.queryByTestId('language-list')).toBeNull();
    expect(screen.queryByTestId('scale-selection')).toBeNull();
  });

  it('does not re-run onboarding for someone who already finished it', async () => {
    const first = await launch();
    await walkToTheDeck();
    await finishTheRun();

    // The records are gone with the database — that much a mirror of the
    // preferences cannot help with. What it does prevent is greeting someone who
    // has already been through all 47 cards as a first-time visitor.
    await first.unmount();
    __resetDatabaseHandleForTests();
    await launch();

    await waitFor(() => expect(screen.getByTestId('main-app')).toBeTruthy());
  });

  it('asks again when there is no mirror to fall back on', async () => {
    const first = await launch();
    await walkToTheDeck();

    await first.unmount();
    globalThis.localStorage.clear();
    __resetDatabaseHandleForTests();
    await launch();

    await waitFor(() => expect(screen.getByTestId('language-list')).toBeTruthy());
  });
});
