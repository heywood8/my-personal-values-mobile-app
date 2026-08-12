import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Appearance } from 'react-native';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';

const ThemeConfigContext = createContext({
  theme: 'system',
  colorScheme: 'light',
  setTheme: () => {},
});

export const ThemeConfigProvider = ({ children }) => {
  const [theme, setThemeState] = useState('system'); // 'light' | 'dark' | 'system'
  const [osColorScheme, setOsColorScheme] = useState(Appearance.getColorScheme() || 'light');

  useEffect(() => {
    getPreference(PREF_KEYS.THEME, 'system')
      .then((stored) => {
        if (stored) setThemeState(stored);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setOsColorScheme(colorScheme || 'light'));
    setOsColorScheme(Appearance.getColorScheme() || 'light');
    return () => sub.remove();
  }, []);

  const colorScheme = theme === 'system' ? osColorScheme : theme;

  const setTheme = useCallback(async (newTheme) => {
    setThemeState(newTheme);
    try {
      await setPreference(PREF_KEYS.THEME, newTheme);
    } catch (e) {
      console.warn('[Theme] Could not persist the theme:', e);
    }
  }, []);

  const value = useMemo(
    () => ({ theme, colorScheme, setTheme }),
    [theme, colorScheme, setTheme],
  );

  return (
    <ThemeConfigContext.Provider value={value}>
      {children}
    </ThemeConfigContext.Provider>
  );
};

ThemeConfigProvider.propTypes = {
  children: PropTypes.node,
};

export const useThemeConfig = () => useContext(ThemeConfigContext);
