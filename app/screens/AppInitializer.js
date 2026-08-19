import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { useDialog } from '../contexts/DialogContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { getBooleanPreference, setBooleanPreference, PREF_KEYS } from '../services/PreferencesDB';
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
 *
 * With one exception, and it is the deck: a visitor can start rating from that
 * screen, so a run in progress outranks the link that sent them into it. The code
 * is kept while they rate, which is what makes finishing land back on the link
 * with both rankings on it — the only way a comparison reaches somebody who
 * arrived without an app at all. It is also why leaving the deck is allowed on
 * that path: the first run's exit is hidden because there is nowhere to land, and
 * here there is.
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
  const {
    isLoading: assessmentLoading, hasResults, cancelCalibration, latest, results,
  } = useAssessment();
  const { latestCheckin } = useAlignment();
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

  /**
   * A CSV import from the first card. That run is over: the records it was for
   * have just arrived by another route, and there is a results screen to land on.
   *
   * The open session goes with it. It was dealt before those rows existed — its
   * deck predates any value the import had to create, and its "new record for
   * today" notice predates a file that may well have contained today. Left in
   * place it would be handed straight back to the next recalibration, which
   * starts from an existing session rather than dealing a fresh one.
   *
   * The flag is written for the same reason finishing the deck writes it: this
   * reader has been through the door, so deleting every record later should land
   * them on an empty results screen rather than back in a deck with no way out.
   */
  const handleImportedRecords = useCallback(() => {
    cancelCalibration();
    setCalibrating(false);
    setOnboardingComplete(true);
    setBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, true).catch((e) => {
      console.warn('[App] Could not persist the onboarding flag:', e);
    });
  }, [cancelCalibration]);

  // Closing a shared ranking takes the code out of the URL as well as off the
  // screen, so that reloading the tab afterwards lands the reader in their own
  // app rather than back in somebody else's results.
  const handleSharedClose = useCallback(() => {
    clearShareCode();
    setSharedCode(null);
  }, []);

  /**
   * Rate the deck from a friend's link, without losing the link.
   *
   * Nothing is cleared here on purpose: the code stays in state and in the
   * address bar, so finishing — or backing out — returns to the shared screen,
   * which by then has the reader's own ranking to set beside the sender's.
   */
  const handleSharedCalibrate = useCallback(() => {
    setCalibrating(true);
  }, []);

  /**
   * The reader's half of a comparison, gathered here because this is where both
   * contexts already are. The shared screen takes it as a prop and reads no
   * database of its own — see its own note about the visitor it exists for.
   */
  const ownReading = useMemo(() => (latest && results.length > 0
    ? { assessment: latest, results, alignment: latestCheckin }
    : null), [latest, results, latestCheckin]);

  // While the stored preferences are still loading, render nothing so the native
  // splash stays up rather than flashing a half-configured deck.
  const step = (() => {
    // Localisation gates everything: there is nothing to render before there are
    // words to render it in.
    if (isLoading) return STEP.LOADING;
    // Above the link, and only here: a deck the reader opened FROM the shared
    // screen is the one thing that outranks it, and `calibrating` is false until
    // they ask for one.
    if (calibrating) return STEP.CALIBRATION;
    // A shared ranking is entirely contained in the link, so it does not wait on
    // the database, the catalogue or the onboarding flag — none of which it reads.
    // The comparison beside it does, and arrives when it arrives.
    if (sharedCode) return STEP.SHARED;
    if (onboardingComplete === null || assessmentLoading) return STEP.LOADING;
    if (!onboardingComplete && !hasResults) return STEP.CALIBRATION;
    return STEP.MAIN;
  })();

  // Whether this reader has been through the door: a record of their own, or the
  // flag that says they finished a run. It is what decides both of the questions
  // below, and they are not the same question.
  const hasOwnRecords = onboardingComplete === true || hasResults;

  // Leaving the deck needs somewhere to land, and on a first run there is
  // nowhere: no results, so no main screen. The exit is hidden rather than made
  // to fail, and the deck itself is the whole of that run.
  //
  // A held share code is somewhere to land — the screen the reader started the
  // deck from — so a first run entered through a friend's link is the one that
  // can be backed out of.
  const canLeaveTheDeck = hasOwnRecords || !!sharedCode;

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
    return (
      <SharedResultsScreen
        code={sharedCode}
        onClose={handleSharedClose}
        own={ownReading}
        onCalibrate={handleSharedCalibrate}
      />
    );

  case STEP.CALIBRATION:
    return (
      <AssessmentScreen
        canExit={canLeaveTheDeck}
        // Asked separately from the exit, because a run started from a friend's
        // link has a way out and still no records — and somebody arriving with a
        // CSV file has no other door until it does.
        canImport={!hasOwnRecords}
        onExit={handleCalibrationExit}
        onFinished={handleCalibrationFinished}
        onImported={handleImportedRecords}
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
