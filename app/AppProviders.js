import React from 'react';
import PropTypes from 'prop-types';
import { PaperProvider } from 'react-native-paper';
import { LocalizationProvider } from './contexts/LocalizationContext';
import { ThemeConfigProvider } from './contexts/ThemeConfigContext';
import { ThemeColorsProvider } from './contexts/ThemeColorsContext';
import { DialogProvider } from './contexts/DialogContext';
import { ValuesProvider } from './contexts/ValuesContext';
import { AssessmentProvider } from './contexts/AssessmentContext';
import { AlignmentProvider } from './contexts/AlignmentContext';
import { UpdateDownloadProvider } from './contexts/UpdateDownloadContext';
import { useMaterialTheme } from './hooks/useMaterialTheme';

/**
 * Paper, themed from this app's palette. Its own component because the theme
 * comes from a hook that has to run *below* the theme providers and *above*
 * PaperProvider.
 */
function ThemedPaperProvider({ children }) {
  return <PaperProvider theme={useMaterialTheme()}>{children}</PaperProvider>;
}

ThemedPaperProvider.propTypes = {
  children: PropTypes.node,
};

/**
 * The app's whole provider stack, in one place.
 *
 * Exported as a component rather than spelled out inside App.js so the tests can
 * mount the *same* stack instead of a copy. That is not tidiness: an earlier
 * version had the two lists in different orders, with PaperProvider below
 * DialogProvider in the app and above it in the test harness. Every test passed
 * and the app died on the first render, because DialogProvider renders a Paper
 * `Portal` and a Portal above its PaperProvider throws. One list cannot drift
 * from itself.
 *
 * Order is load-bearing throughout:
 *   Localization   reads the database and owns first-launch state; everything
 *                  below it renders text that needs t().
 *   ThemeConfig →  ThemeColors    colours derive from the resolved scheme.
 *   ThemedPaper    must be ABOVE anything that renders a Portal — which means
 *                  above DialogProvider.
 *   Dialog         needs t() and colours to render its own surface.
 *   Values         seeds the catalogue.
 *   Assessment     joins against the catalogue, so it waits on Values rather
 *                  than racing it.
 *   Alignment      the second list. Below Assessment because the alignment
 *                  screen reads both — which values are very important comes
 *                  from up there, the scores against them from here.
 *   UpdateDownload holds one APK download for the whole app, so it has to sit
 *                  above every screen that can start or report one — the
 *                  settings panel and the update prompt both read this one.
 *                  It depends on nothing above it; the position is about
 *                  outliving its consumers, not about what it needs.
 */
export default function AppProviders({ children }) {
  return (
    <LocalizationProvider>
      <ThemeConfigProvider>
        <ThemeColorsProvider>
          <ThemedPaperProvider>
            <DialogProvider>
              <ValuesProvider>
                <AssessmentProvider>
                  <AlignmentProvider>
                    <UpdateDownloadProvider>
                      {children}
                    </UpdateDownloadProvider>
                  </AlignmentProvider>
                </AssessmentProvider>
              </ValuesProvider>
            </DialogProvider>
          </ThemedPaperProvider>
        </ThemeColorsProvider>
      </ThemeConfigProvider>
    </LocalizationProvider>
  );
}

AppProviders.propTypes = {
  children: PropTypes.node,
};
