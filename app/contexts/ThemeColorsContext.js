import React, { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useThemeConfig } from './ThemeConfigContext';
import { DESTRUCTIVE } from '../styles/semanticColors';

const ThemeColorsContext = createContext({ colors: {} });

const lightTheme = {
  mode: 'light',
  colors: {
    background: '#f6f7f9',
    surface: '#ffffff',
    card: '#ffffff',
    primary: '#4F6BED',
    onPrimary: '#ffffff',
    secondary: '#e6e8ef',
    text: '#12141a',
    mutedText: '#646b7a',
    border: '#e3e6ec',
    inputBackground: '#ffffff',
    inputBorder: '#c9cedb',
    // Empty half of a bar or a track — visible against the surface, but never
    // competing with the filled half.
    track: '#e8eaf0',
    selected: '#e6ebfd',
    scrim: 'rgba(0,0,0,0.32)',
    modalBackground: 'rgba(0,0,0,0.5)',
    destructive: DESTRUCTIVE.light,
    danger: DESTRUCTIVE.light,
    error: DESTRUCTIVE.light,
    positive: '#2FA36B',
    negative: '#C0492E',
  },
};

const darkTheme = {
  mode: 'dark',
  colors: {
    background: '#101218',
    surface: '#181b23',
    card: '#1f232d',
    primary: '#8FA5FF',
    onPrimary: '#0d1020',
    secondary: '#2a2f3b',
    text: '#f2f4f8',
    mutedText: '#9aa3b4',
    border: '#2c313d',
    inputBackground: '#22262f',
    inputBorder: '#3a4150',
    track: '#262b36',
    selected: '#26304f',
    // M3 states the scrim as black at 32% regardless of scheme, and a dark
    // dialog needs the separation more, not less.
    scrim: 'rgba(0,0,0,0.32)',
    modalBackground: 'rgba(0,0,0,0.6)',
    destructive: DESTRUCTIVE.dark,
    danger: DESTRUCTIVE.dark,
    error: DESTRUCTIVE.dark,
    positive: '#5CC894',
    negative: '#FF8A6B',
  },
};

export const ThemeColorsProvider = ({ children }) => {
  const { colorScheme } = useThemeConfig();

  const value = useMemo(() => ({
    colors: colorScheme === 'dark' ? darkTheme.colors : lightTheme.colors,
    mode: colorScheme === 'dark' ? 'dark' : 'light',
  }), [colorScheme]);

  return (
    <ThemeColorsContext.Provider value={value}>
      {children}
    </ThemeColorsContext.Provider>
  );
};

ThemeColorsProvider.propTypes = {
  children: PropTypes.node,
};

export const useThemeColors = () => useContext(ThemeColorsContext);
