import React, { useState, useCallback, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import { getBooleanPreference, setBooleanPreference, PREF_KEYS } from '../services/PreferencesDB';
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
  // Set once the scale step has been passed, and stored — null until read back.
  // It is a fact about the sequence, not about the scale: the preference records
  // which scale was picked, this records that the question was answered, and
  // keeping only the former is what used to re-ask it after every reload of an
  // unfinished first run.
  const [scaleChosen, setScaleChosen] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, false),
      getBooleanPreference(PREF_KEYS.ONBOARDING_SCALE_CHOSEN, false),
    ])
      .then(([done, chosen]) => {
        if (!mounted) return;
        setOnboardingComplete(done);
        setScaleChosen(chosen);
      })
      .catch(() => {
        if (!mounted) return;
        setOnboardingComplete(false);
        setScaleChosen(false);
      });
    return () => { mounted = false; };
  }, []);

  /** Move the scale step forward or back, remembering which for the next launch. */
  const rememberScaleChosen = useCallback(async (chosen) => {
    setScaleChosen(chosen);
    try {
      await setBooleanPreference(PREF_KEYS.ONBOARDING_SCALE_CHOSEN, chosen);
    } catch (error) {
      console.warn('[AppInitializer] Could not persist the onboarding step:', error);
    }
  }, []);

  // A data reset drops both flags along with everything else, which sends the app
  // back to the language picker. Nothing is written back here — the reset has
  // just emptied the table, and re-storing "not chosen" would only put a row
  // back into a table the user asked to be empty.
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
    await rememberScaleChosen(true);
    setCalibrating(true);
  }, [setScale, rememberScaleChosen]);

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
    // Abandoning the very first deck leaves the app with no results to show and
    // so no main screen to return to. The scale question is the way back out —
    // and stepping back is recorded, so a reload lands there too rather than
    // dropping the reader into the deck they just left.
    rememberScaleChosen(false);
  }, [rememberScaleChosen]);

  // While the stored preferences are still loading, render nothing so the native
  // splash stays up rather than flashing the picker.
  const step = (() => {
    if (isLoading || onboardingComplete === null || scaleChosen === null || assessmentLoading) {
      return STEP.LOADING;
    }
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
