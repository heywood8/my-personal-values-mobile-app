import React from 'react';
import PropTypes from 'prop-types';
import { PaperProvider } from 'react-native-paper';
import AppProviders from '../app/AppProviders';
import { LocalizationProvider } from '../app/contexts/LocalizationContext';
import { ThemeConfigProvider } from '../app/contexts/ThemeConfigContext';
import { ThemeColorsProvider } from '../app/contexts/ThemeColorsContext';

/**
 * Provider stacks for tests.
 *
 * Use them as:
 *
 *     await render(<Subject />, { wrapper: AllProviders });
 *
 * The `await` is required, not stylistic: React Native Testing Library 14 made
 * `render` asynchronous for React 19, and it returns a promise rather than the
 * query object older versions did. Forgetting it fails later, at the first query,
 * as "`render` function has not been called" — which reads like the render is
 * missing rather than un-awaited. Queries come from the module-scoped `screen`,
 * so each test imports `render` and `screen` from the library directly and only
 * takes the wrapper from here.
 */

/**
 * The app's real provider stack — the same component App.js mounts, not a copy of
 * its contents. Re-listing the providers here is how a test harness ends up
 * asserting against a tree the app never renders: an earlier version of this file
 * had PaperProvider above DialogProvider while App.js had it below, so every test
 * passed while the app threw on its first render (a Paper `Portal` above its
 * provider). Importing the stack makes that class of drift impossible.
 *
 * Real providers rather than stubbed context values, too — the providers are
 * where the interesting behaviour lives (seeding, the same-day rule, scale
 * persistence), and a test that swaps them for fixtures asserts against the
 * fixture instead of the app. The database underneath is a real in-memory SQLite
 * (see jest.setup.js), so these are integration tests that happen to be fast.
 */
export const AllProviders = AppProviders;

/**
 * Theme, localisation and Paper only — enough for a presentational component,
 * without paying for a catalogue seed and an assessment load on every render.
 * Kept in the same order as the corresponding prefix of AppProviders.
 */
export function ThemeOnlyProviders({ children }) {
  return (
    <LocalizationProvider>
      <ThemeConfigProvider>
        <ThemeColorsProvider>
          <PaperProvider>{children}</PaperProvider>
        </ThemeColorsProvider>
      </ThemeConfigProvider>
    </LocalizationProvider>
  );
}

ThemeOnlyProviders.propTypes = {
  children: PropTypes.node,
};
