import React from 'react';
import { Platform } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { AllProviders } from '../../test-utils/renderWithProviders';
import AppInitializer from '../../app/screens/AppInitializer';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { seedDefaultValues } from '../../app/services/ValuesDB';
import { buildSharePayload, encodeShareCode, SHARE_PARAM } from '../../app/services/ResultsShare';
import { SCALE_IDS } from '../../app/utils/scales';
import en from '../../assets/i18n/en.json';

/**
 * Where the app opens when somebody arrives on a friend's link.
 *
 * This is the one entry point that is not about the reader's own data, and it
 * has to work for a visitor who has never opened the app: no records, no
 * onboarding flag, nothing seeded. So the shared ranking comes before the deck —
 * before everything — and closing it hands the visitor their own first run,
 * with the code taken back out of the address bar so a reload does not return
 * them to somebody else's results.
 */

const code = encodeShareCode(buildSharePayload(
  { assessedOn: '2026-08-12', scale: SCALE_IDS.NUMERIC_5 },
  [{ key: 'love', isCustom: false, score: 5, normalized: 1 }],
  () => '',
));

const nativeOS = Platform.OS;
const originalWindow = Object.getOwnPropertyDescriptor(global, 'window');

const replaceState = jest.fn();

const arriveOn = (search) => {
  Platform.OS = 'web';
  Object.defineProperty(global, 'document', {
    value: { createElement: jest.fn(), body: { appendChild: jest.fn() } },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global, 'window', {
    value: {
      location: { origin: 'https://example.com', pathname: '/values/', search, hash: '' },
      history: { replaceState },
    },
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  __resetDatabaseHandleForTests();
  replaceState.mockClear();
});

afterEach(() => {
  Platform.OS = nativeOS;
  delete global.document;
  if (originalWindow) Object.defineProperty(global, 'window', originalWindow);
  else delete global.window;
});

describe('arriving on a shared link', () => {
  it('shows the shared ranking to a visitor who has never opened the app', async () => {
    arriveOn(`?${SHARE_PARAM}=${code}`);
    await render(<AppInitializer />, { wrapper: AllProviders });

    // Not the deck: this visitor came to read a link, and nothing here asks
    // anything of them.
    await waitFor(() => expect(screen.getByTestId('shared-results-screen')).toBeTruthy());
    expect(screen.queryByTestId('assessment-progress')).toBeNull();
    expect(screen.getByText(en.value_love)).toBeTruthy();
  });

  it('hands the visitor their own app when they close it', async () => {
    await seedDefaultValues();
    arriveOn(`?${SHARE_PARAM}=${code}`);
    await render(<AppInitializer />, { wrapper: AllProviders });
    await waitFor(() => expect(screen.getByTestId('shared-results-screen')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('shared-results-close'));
    });

    // A first run, since this visitor has no records — and the link is out of
    // the address bar, so reloading the tab keeps it that way.
    await waitFor(() => expect(screen.getByTestId('assessment-progress')).toBeTruthy());
    expect(replaceState).toHaveBeenCalledWith(null, '', '/values/');
  });

  it('opens normally when there is no link', async () => {
    arriveOn('');
    await render(<AppInitializer />, { wrapper: AllProviders });

    await waitFor(() => expect(screen.getByTestId('assessment-progress')).toBeTruthy());
    expect(screen.queryByTestId('shared-results-screen')).toBeNull();
  });
});
