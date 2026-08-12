import React from 'react';
import { Platform } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../../app/screens/SettingsScreen';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import en from '../../assets/i18n/en.json';

/**
 * The privacy note is the one thing on this screen that exists only on web, so
 * it is the one thing a native-only test run would never see. `Platform.OS` is a
 * plain property on the module the test environment resolves, so flipping it is
 * enough to render the branch the browser gets.
 */

const nativeOS = Platform.OS;

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

afterEach(() => {
  Platform.OS = nativeOS;
});

const mountSettings = async () => {
  await render(<SettingsScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });
  // The screen paints before the assessment context settles; waiting on a
  // control that is always present keeps the async load inside act().
  await waitFor(() => expect(screen.getByTestId('settings-reset')).toBeTruthy());
};

describe('the local-only data notice', () => {
  it('tells a web visitor their data never leaves the machine', async () => {
    Platform.OS = 'web';
    await mountSettings();

    expect(screen.getByTestId('settings-privacy-note')).toBeTruthy();
    expect(screen.getByText(en.privacy_local_only_title)).toBeTruthy();
    expect(screen.getByText(en.privacy_local_only)).toBeTruthy();
  });

  it('stays out of the way on a phone, where nobody suspects a server', async () => {
    await mountSettings();

    expect(Platform.OS).not.toBe('web');
    expect(screen.queryByTestId('settings-privacy-note')).toBeNull();
  });

  it('sits with the data controls rather than at the bottom of the screen', async () => {
    // Next to "reset all data" is where someone reads about where their data
    // lives; below the version string is where they never scroll to.
    Platform.OS = 'web';
    await mountSettings();

    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf(en.settings_data)).toBeLessThan(tree.indexOf('settings-privacy-note'));
    expect(tree.indexOf('settings-privacy-note')).toBeLessThan(tree.indexOf('settings-reset'));
  });
});
