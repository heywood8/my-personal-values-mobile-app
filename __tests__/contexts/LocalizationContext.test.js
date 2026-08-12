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
import { setPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

function Probe() {
  const { t, language, isFirstLaunch, isLoading } = useLocalization();
  if (isLoading) return <Text testID="state">loading</Text>;
  return (
    <>
      <Text testID="state">{isFirstLaunch ? 'first-launch' : 'ready'}</Text>
      <Text testID="language">{language}</Text>
      <Text testID="translated">{t('welcome_title')}</Text>
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
      expect(typeof loadTranslations(lang).welcome_title).toBe('string');
    });
  });

  it('returns undefined for an unknown language', () => {
    expect(loadTranslations('zz')).toBeUndefined();
  });

  it('translate() works outside React', () => {
    expect(translate('ru', 'welcome_title')).toBe('Добро пожаловать');
    expect(translate('ru', 'assessment_progress', { current: 1, total: 5 })).toBe('1 из 5');
  });
});

describe('LocalizationProvider', () => {
  it('reports a first launch when no language is stored', async () => {
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('first-launch'));
    expect(screen.getByTestId('language')).toHaveTextContent('en');
  });

  it('loads a stored language and skips first launch', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');

    await renderProbe();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('language')).toHaveTextContent('ru');
    expect(screen.getByTestId('translated')).toHaveTextContent('Добро пожаловать');
  });

  it('ignores a stored language it cannot load', async () => {
    // A locale removed in a later release must not leave the app rendering raw keys.
    await setPreference(PREF_KEYS.LANGUAGE, 'kl');

    await renderProbe();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('first-launch'));
    expect(screen.getByTestId('language')).toHaveTextContent('en');
  });

  it('interpolates through t()', async () => {
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('interpolated')).toHaveTextContent('3 of 48'));
  });

  it('returns to first launch when the database is reset', async () => {
    await setPreference(PREF_KEYS.LANGUAGE, 'ru');
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));

    await act(async () => {
      appEvents.emit(EVENTS.DATABASE_RESET);
    });

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('first-launch'));
    expect(screen.getByTestId('language')).toHaveTextContent('en');
  });
});
