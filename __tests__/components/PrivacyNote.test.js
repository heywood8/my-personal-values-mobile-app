import React from 'react';
import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import PrivacyNote from '../../app/components/PrivacyNote';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import en from '../../assets/i18n/en.json';
import ru from '../../assets/i18n/ru.json';

/**
 * The note exists only on web, so it is the one piece of UI a native-only test
 * run would never reach. `Platform.OS` is a plain property on the module the
 * test environment resolves, so flipping it renders the branch the browser gets.
 */

const nativeOS = Platform.OS;

afterEach(() => {
  Platform.OS = nativeOS;
});

describe('PrivacyNote', () => {
  it('tells a web visitor their data never leaves the machine', async () => {
    Platform.OS = 'web';
    await render(<PrivacyNote />, { wrapper: ThemeOnlyProviders });

    expect(screen.getByTestId('privacy-note')).toBeTruthy();
    expect(screen.getByText(en.privacy_local_only_title)).toBeTruthy();
    expect(screen.getByText(en.privacy_local_only)).toBeTruthy();
  });

  it('stays out of the way on a phone, where nobody suspects a server', async () => {
    await render(<PrivacyNote />, { wrapper: ThemeOnlyProviders });

    expect(Platform.OS).not.toBe('web');
    expect(screen.queryByTestId('privacy-note')).toBeNull();
  });

  it('makes both claims — nothing stored elsewhere, nothing sent — in both locales', async () => {
    // The reassurance is the whole point of the component: a translation that
    // keeps the title but loses "nothing is sent anywhere" answers half the
    // question someone came to Settings to ask.
    for (const copy of [en, ru]) {
      expect(copy.privacy_local_only_title).toBeTruthy();
      expect(copy.privacy_local_only.length).toBeGreaterThan(copy.privacy_local_only_title.length);
    }
    expect(en.privacy_local_only).toMatch(/never sent anywhere|sent anywhere/i);
    expect(ru.privacy_local_only).toMatch(/не отправляется/i);
  });
});
