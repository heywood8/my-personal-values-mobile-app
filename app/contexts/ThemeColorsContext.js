import React, { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useThemeConfig } from './ThemeConfigContext';
import { DESTRUCTIVE } from '../styles/semanticColors';

const ThemeColorsContext = createContext({ colors: {} });

/**
 * Two schemes, as plain objects.
 *
 * One entry in each is not free to move: `surface` is the exact colour the chart
 * palette in styles/chartPalette.js was validated against — #ffffff on light,
 * #181b23 on dark — and every contrast figure in that file's header is a figure
 * against these two. Repainting a surface silently invalidates the validation
 * that makes the categorical series safe for a colour-vision-deficient reader,
 * and nothing on screen would look wrong while it did. Everything else here is
 * ordinary palette work.
 */

const lightTheme = {
  mode: 'light',
  colors: {
    // A shade deeper than it was, and that is what buys the whole elevation
    // scale: a white card only reads as lifted off the page if the page is not
    // also white. `surface` cannot move to make that gap (see above), so the
    // background does.
    background: '#eceff5',
    surface: '#ffffff',
    card: '#ffffff',
    // Chrome indigo, deliberately a different hue from the data blue in
    // chartPalette.js. Deeper than the #4F6BED it replaces: that sat at exactly
    // 4.51:1 on white, which is a pass with no headroom at all — a contained
    // button's white label had nothing left to give at any font size. This is
    // 6.1:1, and it reads as ink rather than as a link.
    primary: '#3D55D4',
    onPrimary: '#ffffff',
    secondary: '#e4e7f0',
    text: '#12141a',
    // 6.1:1 on white, up from 5.35:1 — the small print is where this app puts
    // most of what it has to say, so it is the last place to spend contrast.
    mutedText: '#5b6273',
    border: '#e1e5ee',
    inputBackground: '#ffffff',
    inputBorder: '#c6ccdb',
    // Empty half of a bar or a track — visible against the surface, but never
    // competing with the filled half. It has to clear the *background* too, not
    // only `surface`: the ranked list's tracks sit on whatever is behind them,
    // and a track the same value as the page is a bar with no far end.
    track: '#dadfea',
    selected: '#e7ebfc',
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
    // Same move as the light scheme, in the other direction: the background
    // drops away from `surface` so a card is the lighter thing. On a dark
    // scheme that separation is the *only* one available — a shadow on near
    // black is invisible however it is tuned.
    background: '#0c0e13',
    surface: '#181b23',
    card: '#21252f',
    primary: '#93A8FF',
    onPrimary: '#0d1020',
    secondary: '#2a2f3b',
    text: '#f2f4f8',
    mutedText: '#9ea7b8',
    border: '#2f3542',
    inputBackground: '#22262f',
    inputBorder: '#3a4150',
    track: '#272c38',
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
