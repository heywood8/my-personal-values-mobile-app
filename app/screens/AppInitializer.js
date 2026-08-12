import React, { useState, useCallback, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import { getBooleanPreference, PREF_KEYS } from '../services/PreferencesDB';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import ScaleSelectionScreen from './ScaleSelectionScreen';
import AssessmentScreen from './AssessmentScreen';
import SimpleTabs from '../navigation/SimpleTabs';
import { formatDateKey } from '../utils/dateUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Decides which of four things the app is currently showing.
 *
 * The first run is a sequence — language, then scale, then the deck — and each
 * step is only "done" once its result is persisted, so closing the app at any
 * point resumes at the same step rather than starting over. `onboardingComplete`
 * is a separate fact from "a language is set" precisely because the gap between
 * them is the deck, which someone can abandon halfway.
 */
const STEP = {
  LOADING: 'loading',
  LANGUAGE: 'language',
  SCALE: 'scale',
  CALIBRATION: 'calibration',
  MAIN: 'main',
};

const AppInitializer = () => {
  const { isFirstLaunch, isLoading, setFirstLaunchComplete, t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { scale, setScale, isLoading: assessmentLoading, hasResults } = useAssessment();

  const [onboardingComplete, setOnboardingComplete] = useState(null);
  // Set while the user is in the deck. Distinct from the onboarding step so a
  // recalibration from the main app takes the same route as the first one.
  const [calibrating, setCalibrating] = useState(false);
  // Set once the scale step has been passed in THIS first-run sequence.
  const [scaleChosen, setScaleChosen] = useState(false);

  useEffect(() => {
    let mounted = true;
    getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, false)
      .then((done) => { if (mounted) setOnboardingComplete(done); })
      .catch(() => { if (mounted) setOnboardingComplete(false); });
    return () => { mounted = false; };
  }, []);

  // A data reset drops the flag along with everything else, which sends the app
  // back to the language picker.
  useEffect(() => appEvents.on(EVENTS.DATABASE_RESET, () => {
    setOnboardingComplete(false);
    setScaleChosen(false);
    setCalibrating(false);
  }), []);

  const handleLanguageSelected = useCallback(async (selectedLanguage) => {
    try {
      await setFirstLaunchComplete(selectedLanguage);
    } catch (error) {
      console.error('Failed to set the language:', error);
    }
  }, [setFirstLaunchComplete]);

  const handleScaleSelected = useCallback(async (selectedScale) => {
    await setScale(selectedScale);
    setScaleChosen(true);
    setCalibrating(true);
  }, [setScale]);

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
    // Abandoning the very first deck leaves the app with no results to show, so
    // it stays in onboarding and the deck is what reopens next time.
    setScaleChosen(false);
  }, []);

  // While the stored preferences are still loading, render nothing so the native
  // splash stays up rather than flashing the picker.
  const step = (() => {
    if (isLoading || onboardingComplete === null || assessmentLoading) return STEP.LOADING;
    if (isFirstLaunch) return STEP.LANGUAGE;
    if (calibrating) return STEP.CALIBRATION;
    if (!onboardingComplete && !hasResults) return scaleChosen ? STEP.CALIBRATION : STEP.SCALE;
    return STEP.MAIN;
  })();

  switch (step) {
  case STEP.LOADING:
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );

  case STEP.LANGUAGE:
    return <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />;

  case STEP.SCALE:
    return (
      <ScaleSelectionScreen
        initialScale={scale}
        onScaleSelected={handleScaleSelected}
      />
    );

  case STEP.CALIBRATION:
    return (
      <AssessmentScreen
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
