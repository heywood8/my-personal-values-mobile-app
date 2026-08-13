import React, { useState, useCallback, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import { getBooleanPreference, PREF_KEYS } from '../services/PreferencesDB';
import AssessmentScreen from './AssessmentScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { formatDateKey } from '../utils/dateUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Decides which of three things the app is currently showing.
 *
 * There is no setup sequence in front of the deck. A first run opens on the first
 * card, with the language and scale switches sitting on that card — the two
 * questions that used to be full screens of their own, asked before the reader
 * had seen anything they applied to. Both have a working default, so the only
 * step left is the one the app is for, and it is the one that resumes: closing
 * the app mid-deck comes back to the same card rather than to a question.
 */
const STEP = {
  LOADING: 'loading',
  CALIBRATION: 'calibration',
  MAIN: 'main',
};

const AppInitializer = () => {
  const { isLoading, t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { isLoading: assessmentLoading, hasResults } = useAssessment();

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

  // While the stored preferences are still loading, render nothing so the native
  // splash stays up rather than flashing a half-configured deck.
  const step = (() => {
    if (isLoading || onboardingComplete === null || assessmentLoading) return STEP.LOADING;
    if (calibrating) return STEP.CALIBRATION;
    if (!onboardingComplete && !hasResults) return STEP.CALIBRATION;
    return STEP.MAIN;
  })();

  // Leaving the deck needs somewhere to land, and on a first run there is
  // nowhere: no results, so no main screen. The exit is hidden rather than made
  // to fail, and the deck itself is the whole of that run.
  const canLeaveTheDeck = onboardingComplete === true || hasResults;

  switch (step) {
  case STEP.LOADING:
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );

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
    return <SimpleTabs onStartCalibration={() => setCalibrating(true)} />;
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
