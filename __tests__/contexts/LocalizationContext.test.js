import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import {
  LocalizationProvider,
  useLocalization,
  loadTranslations,
  interpolate,
  translate,
  availableLanguages,
} from '../../app/contexts/LocalizationContext';
import { getPreference, setPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';
import { detectDeviceLanguage } from '../../app/utils/languages';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

function Probe() {
  const { t, language, isLoading } = useLocalization();
  if (isLoading) return <Text testID="state">loading</Text>;
  return (
    <>
      <Text testID="state">ready</Text>
      <Text testID="language">{language}</Text>
      <Text testID="translated">{t('settings_language')}</Text>
      <Text testID="interpolated">{t('assessment_progress', { current: 3, total: 48 })}</Text>
    </>
  );
}

// RNTL 14's render is async (React 19); awaiting it is what flushes the initial
// commit before the first query runs.
const renderProbe = () => render(
  <LocalizationProvider>
    <Probe />
  </LocalizationProvider>,
);

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('{{a}} of {{b}}', { a: 1, b: 2 })).toBe('1 of 2');
  });

  it('leaves a placeholder with no matching param alone', () => {
    // Better a visible {{date}} in one string than a silent "undefined".
    expect(interpolate('on {{date}}', { other: 1 })).toBe('on {{date}}');
  });

  it('is a no-op without params', () => {
    expect(interpolate('plain text')).toBe('plain text');
  });
});

describe('loadTranslations', () => {
  it('resolves every advertised language', () => {
    expect(availableLanguages).toEqual(['en', 'ru']);
    availableLanguages.forEach((lang) => {
      expect(typeof loadTranslations(lang).app_name).toBe('string');
    });
  });

  it('returns undefined for an unknown language', () => {
    expect(loadTranslations('zz')).toBeUndefined();
  });

  it('translate() works outside React', () => {
    expect(translate('ru', 'settings_language')).toBe('Язык');
    expect(translate('ru', 'assessment_progress', { current: 1, total: 5 })).toBe('1 из 5');
  });
});

describe('detectDeviceLanguage', () => {
  // The language the app opens in is a guess now that nothing asks — so what it
  // guesses from is worth pinning down.
  it('matches a supported language regardless of region', () => {
    expect(detectDeviceLanguage(['en', 'ru'])).toBe('en');
    expect(detectDeviceLanguage(['en', 'ru'], 'ru')).toBe('en');
  });

  it('falls back when nothing the device asks for is supported', () => {
    expect(detectDeviceLanguage(['kl'], 'kl')).toBe('kl');
  });
});

describe('LocalizationProvider', () => {
  it('opens in a supported language when nothing is stored', async () => {
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(availableLanguages).toContain(screen.getByTestId('language').props.children);
  });

  it('loads a stored language', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');

    await renderProbe();

    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('ru'));
    expect(screen.getByTestId('translated')).toHaveTextContent('Язык');
  });

  it('ignores a stored language it cannot load', async () => {
    // A locale removed in a later release must not leave the app rendering raw keys.
    await setPreference(PREF_KEYS.LANGUAGE, 'kl');

    await renderProbe();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(availableLanguages).toContain(screen.getByTestId('language').props.children);
  });

  it('interpolates through t()', async () => {
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('interpolated')).toHaveTextContent('3 of 48'));
  });

  it('drops the chosen language when the database is reset', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('ru'));

    await act(async () => {
      appEvents.emit(EVENTS.DATABASE_RESET);
    });

    // Back to whatever the device says, which in a test environment is English —
    // the point being that the stored choice is gone, not that English wins.
    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent(
      detectDeviceLanguage(availableLanguages),
    ));
    expect(await getPreference(PREF_KEYS.LANGUAGE)).toBeNull();
  });
});
