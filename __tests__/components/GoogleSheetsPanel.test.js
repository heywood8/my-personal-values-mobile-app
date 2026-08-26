import React from 'react';
import { render, screen } from '@testing-library/react-native';
import GoogleSheetsPanel from '../../app/components/GoogleSheetsPanel';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { setPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { canUseGoogleSync } from '../../app/services/GoogleAuth';
import en from '../../assets/i18n/en.json';

/**
 * The panel's first job is to not be there. A build with no Google client ID
 * configured — which is every default build and every fork until somebody sets
 * one up — must show nothing at all rather than a button that fails on press,
 * and that is exactly the state no manual pass through the app would notice.
 */

jest.mock('../../app/services/GoogleAuth', () => ({
  accessToken: jest.fn(async () => 'test-token'),
  canUseGoogleSync: jest.fn(() => true),
  currentAccount: () => null,
  isSignedIn: () => false,
  signOut: jest.fn(),
}));

beforeEach(() => {
  __resetDatabaseHandleForTests();
  canUseGoogleSync.mockReturnValue(true);
});

describe('GoogleSheetsPanel', () => {
  it('renders nothing where no Google client ID was configured', async () => {
    canUseGoogleSync.mockReturnValue(false);

    await render(<GoogleSheetsPanel />, { wrapper: AllProviders });

    expect(screen.queryByTestId('google-sheets-panel')).toBeNull();
  });

  it('offers the default spreadsheet name, and a sign-in that has not happened yet', async () => {
    await render(<GoogleSheetsPanel />, { wrapper: AllProviders });

    expect(await screen.findByTestId('google-sheets-panel')).toBeTruthy();
    expect(screen.getByTestId('sheets-name').props.value).toBe('my-personal-values.xlsx');
    expect(screen.getByText(en.sheets_sign_in)).toBeTruthy();
    // Save and load are offered before signing in: they ask for a token when
    // they need one, so a first sync is one press rather than two.
    expect(screen.getByTestId('sheets-save')).toBeTruthy();
    expect(screen.getByTestId('sheets-load')).toBeTruthy();
  });

  it('opens on the name this reader already chose', async () => {
    await setPreference(PREF_KEYS.GOOGLE_SHEET_NAME, 'our-values.xlsx');

    await render(<GoogleSheetsPanel />, { wrapper: AllProviders });

    expect(await screen.findByDisplayValue('our-values.xlsx')).toBeTruthy();
  });
});
