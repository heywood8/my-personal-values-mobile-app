import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import LanguageSelectionScreen from '../../app/screens/LanguageSelectionScreen';
import { availableLanguages } from '../../app/contexts/LocalizationContext';

/**
 * This screen mounts before any provider — there is no stored language yet — so
 * it is rendered bare, exactly as AppInitializer renders it.
 */

// React 19 renders concurrently, so a state update triggered by an event is not
// guaranteed to be committed by the time the next line runs. act() flushes it.
const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

describe('LanguageSelectionScreen', () => {
  it('offers exactly the languages the app ships', async () => {
    await render(<LanguageSelectionScreen onLanguageSelected={jest.fn()} />);

    expect(availableLanguages).toEqual(['en', 'ru']);
    availableLanguages.forEach((code) => {
      expect(screen.getByTestId(`language-${code}`)).toBeTruthy();
    });
  });

  it('names each language in its own script', async () => {
    await render(<LanguageSelectionScreen onLanguageSelected={jest.fn()} />);

    // Someone whose phone is in a language they cannot read has to recognise
    // their own; "Russian" does not help them, "Русский" does.
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('starts with continue disabled and nothing selected', async () => {
    const onLanguageSelected = jest.fn();
    await render(<LanguageSelectionScreen onLanguageSelected={onLanguageSelected} />);

    const continueButton = screen.getByTestId('language-continue');
    expect(continueButton.props.accessibilityState.disabled).toBe(true);

    await press(continueButton);
    expect(onLanguageSelected).not.toHaveBeenCalled();
  });

  it('enables continue once a language is chosen, and reports the choice', async () => {
    const onLanguageSelected = jest.fn();
    await render(<LanguageSelectionScreen onLanguageSelected={onLanguageSelected} />);

    await press(screen.getByTestId('language-ru'));
    expect(screen.getByTestId('language-ru').props.accessibilityState.selected).toBe(true);

    await press(screen.getByTestId('language-continue'));
    expect(onLanguageSelected).toHaveBeenCalledWith('ru');
  });

  it('previews the interface in the language under the finger', async () => {
    await render(<LanguageSelectionScreen onLanguageSelected={jest.fn()} />);

    // English until a choice is made…
    expect(screen.getByText('Welcome')).toBeTruthy();

    await press(screen.getByTestId('language-ru'));

    // …then the whole screen answers in the chosen language, which is the
    // confirmation that the choice landed.
    expect(screen.getByText('Добро пожаловать')).toBeTruthy();
    expect(screen.getByText('Продолжить')).toBeTruthy();
  });

  it('lets the choice be changed before continuing', async () => {
    const onLanguageSelected = jest.fn();
    await render(<LanguageSelectionScreen onLanguageSelected={onLanguageSelected} />);

    await press(screen.getByTestId('language-ru'));
    await press(screen.getByTestId('language-en'));

    expect(screen.getByTestId('language-ru').props.accessibilityState.selected).toBe(false);
    await press(screen.getByTestId('language-continue'));
    expect(onLanguageSelected).toHaveBeenCalledWith('en');
  });
});
