import React, { useState, useCallback, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { getBooleanPreference, PREF_KEYS } from '../services/PreferencesDB';
import useAppUpdateCheck from '../hooks/useAppUpdateCheck';
import AssessmentScreen from './AssessmentScreen';
import SharedResultsScreen from './SharedResultsScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import UpdateDownloadBanner from '../components/UpdateDownloadBanner';
import UpdatePrompt from '../components/UpdatePrompt';
import { formatDateKey } from '../utils/dateUtils';
import { currentShareCode, clearShareCode } from '../utils/linkSharing';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Decides which of four things the app is currently showing.
 *
 * There is no setup sequence in front of the deck. A first run opens on the first
 * card, with the language and scale switches sitting on that card — the two
 * questions that used to be full screens of their own, asked before the reader
 * had seen anything they applied to. Both have a working default, so the only
 * step left is the one the app is for, and it is the one that resumes: closing
 * the app mid-deck comes back to the same card rather than to a question.
 *
 * The fourth is a different kind of thing: a shared ranking, which is not a step
 * in this app's own sequence but the reason a visitor arrived at all. It comes
 * before everything else — including the deck on a first run — because somebody
 * who followed a friend's link came to read that link, and it asks nothing,
 * writes nothing and is closed in one tap.
 */
const STEP = {
  LOADING: 'loading',
  SHARED: 'shared',
  CALIBRATION: 'calibration',
  MAIN: 'main',
};

const AppInitializer = () => {
  const { isLoading, t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { isLoading: assessmentLoading, hasResults } = useAssessment();
  const { startDownload } = useUpdateDownload();

  // Read once, at mount: the address bar is the input, and re-reading it later
  // would fight the `history.replaceState` that closing the screen performs.
  const [sharedCode, setSharedCode] = useState(currentShareCode);

  const [onboardingComplete, setOnboardingComplete] = useState(null);
  // Set while the user is in the deck. Distinct from the onboarding step so a
  // recalibration from the main app takes the same route as the first one.
  const [calibrating, setCalibrating] = useState(false);

  useEffect(() => {
    let mounted = true;
    getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, false)
      .then((done) => { if (mounted) setOnboardingComplete(done); })
      .catch(() => { if (mounted) setOnboardingComplete(false); });
    return () => { mounted = false; };
  }, []);

  // A data reset drops the flag along with everything else, which sends the app
  // back to a first run. Nothing is written back here — the reset has just
  // emptied the table, and re-storing "not complete" would only put a row back
  // into a table the user asked to be empty.
  useEffect(() => appEvents.on(EVENTS.DATABASE_RESET, () => {
    setOnboardingComplete(false);
    setCalibrating(false);
  }), []);

  const handleCalibrationFinished = useCallback((summary) => {
    setCalibrating(false);
    setOnboardingComplete(true);
    showDialog(
      t('assessment_saved_title'),
      summary.isRecalibration
        ? t('assessment_saved_overwrite')
        : t('assessment_saved_new', { date: formatDateKey(summary.assessedOn, language) }),
      [{ text: t('assessment_see_results') }],
    );
  }, [showDialog, t, language]);

  const handleCalibrationExit = useCallback(() => {
    setCalibrating(false);
  }, []);

  // Closing a shared ranking takes the code out of the URL as well as off the
  // screen, so that reloading the tab afterwards lands the reader in their own
  // app rather than back in somebody else's results.
  const handleSharedClose = useCallback(() => {
    clearShareCode();
    setSharedCode(null);
  }, []);

  // While the stored preferences are still loading, render nothing so the native
  // splash stays up rather than flashing a half-configured deck.
  const step = (() => {
    // Localisation gates everything: there is nothing to render before there are
    // words to render it in.
    if (isLoading) return STEP.LOADING;
    // A shared ranking is entirely contained in the link, so it does not wait on
    // the database, the catalogue or the onboarding flag — none of which it reads.
    if (sharedCode) return STEP.SHARED;
    if (onboardingComplete === null || assessmentLoading) return STEP.LOADING;
    if (calibrating) return STEP.CALIBRATION;
    if (!onboardingComplete && !hasResults) return STEP.CALIBRATION;
    return STEP.MAIN;
  })();

  // Leaving the deck needs somewhere to land, and on a first run there is
  // nowhere: no results, so no main screen. The exit is hidden rather than made
  // to fail, and the deck itself is the whole of that run.
  const canLeaveTheDeck = onboardingComplete === true || hasResults;

  // Nothing is asked in front of the deck, and that includes this. An available
  // update is not more urgent than the run the user is in the middle of, so the
  // check only runs on the main screens; a version found there is still there
  // when the deck is closed.
  const { pendingUpdate, dismiss, accept } = useAppUpdateCheck({ enabled: step === STEP.MAIN });

  const handleUpdateAccept = useCallback(() => {
    const update = accept();
    if (!update) return;
    startDownload(update.downloadUrl, {
      checksumUrl: update.checksumUrl,
      onError: () => showDialog(t('error'), t('update_download_failed'), [{ text: t('ok') }]),
    });
  }, [accept, startDownload, showDialog, t]);

  switch (step) {
  case STEP.LOADING:
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );

  case STEP.SHARED:
    return <SharedResultsScreen code={sharedCode} onClose={handleSharedClose} />;

  case STEP.CALIBRATION:
    return (
      <AssessmentScreen
        canExit={canLeaveTheDeck}
        onExit={handleCalibrationExit}
        onFinished={handleCalibrationFinished}
      />
    );

  case STEP.MAIN:
  default:
    return (
      <>
        <SimpleTabs onStartCalibration={() => setCalibrating(true)} />
        <UpdateDownloadBanner />
        <UpdatePrompt
          update={pendingUpdate}
          onDismiss={dismiss}
          onAccept={handleUpdateAccept}
        />
      </>
    );
  }
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export default AppInitializer;
