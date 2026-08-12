import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useValues } from '../contexts/ValuesContext';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import RankedValueBars from '../components/charts/RankedValueBars';
import GroupBreakdown from '../components/charts/GroupBreakdown';
import SegmentedToggle from '../components/SegmentedToggle';
import EmptyState from '../components/EmptyState';
import { formatDateKey } from '../utils/dateUtils';
import { SPACING, FONT_SIZE, CONTENT_MAX_WIDTH } from '../styles/designTokens';

const VIEW_PRIORITY = 'priority';
const VIEW_GROUP = 'group';
const SORT_ASC = 'asc';
const SORT_DESC = 'desc';

/**
 * What the last calibration says.
 *
 * Two readings of the same data, because the brief asks for both: an ordering
 * (which values sit where, low to high) and a shape (which parts of life the
 * ordering favours). They are genuinely different questions, so they are a
 * switch rather than two screens.
 *
 * Sort defaults to ascending — lowest first. That is the deliberate default: a
 * ranked list read top-down usually gets read as "here is what I care about",
 * and the more useful half is the other end, where the things you keep spending
 * time on but do not actually value collect.
 */
const ResultsScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { groups } = useValues();
  const { latest, results, isLoading, hasResults } = useAssessment();

  const [view, setView] = useState(VIEW_PRIORITY);
  const [sort, setSort] = useState(SORT_ASC);

  // Both toggles persist — they are a reading preference, and resetting them on
  // every launch would make the screen feel like it forgot.
  useEffect(() => {
    Promise.all([
      getPreference(PREF_KEYS.RESULTS_VIEW, VIEW_PRIORITY),
      getPreference(PREF_KEYS.RESULTS_SORT, SORT_ASC),
    ]).then(([storedView, storedSort]) => {
      if (storedView === VIEW_PRIORITY || storedView === VIEW_GROUP) setView(storedView);
      if (storedSort === SORT_ASC || storedSort === SORT_DESC) setSort(storedSort);
    }).catch(() => {});
  }, []);

  const changeView = useCallback((next) => {
    setView(next);
    setPreference(PREF_KEYS.RESULTS_VIEW, next).catch(() => {});
  }, []);

  const changeSort = useCallback((next) => {
    setSort(next);
    setPreference(PREF_KEYS.RESULTS_SORT, next).catch(() => {});
  }, []);

  // getRankedResults already returns ascending, so descending is a reverse
  // rather than a re-sort with a different comparator — which keeps ties in a
  // stable, mirrored order instead of shuffling them.
  const ordered = useMemo(
    () => (sort === SORT_ASC ? results : [...results].reverse()),
    [results, sort],
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hasResults || !latest) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="scale-balance"
          title={t('results_empty_title')}
          body={t('results_empty_body')}
          actionLabel={t('results_start')}
          onAction={onStartCalibration}
          testID="results-empty"
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="results-screen"
    >
      <View style={styles.inner}>
        <Text style={[styles.meta, { color: colors.mutedText }]}>
          {`${t('results_calibrated_on', { date: formatDateKey(latest.assessedOn, language) })} · ${t('results_value_count', { count: results.length })}`}
        </Text>

        <View style={styles.controls}>
          <SegmentedToggle
            testID="results-view-toggle"
            value={view}
            onChange={changeView}
            options={[
              { value: VIEW_PRIORITY, label: t('results_view_priority') },
              { value: VIEW_GROUP, label: t('results_view_group') },
            ]}
          />
          {view === VIEW_PRIORITY && (
            <SegmentedToggle
              testID="results-sort-toggle"
              value={sort}
              onChange={changeSort}
              options={[
                { value: SORT_ASC, label: t('results_sort_asc') },
                { value: SORT_DESC, label: t('results_sort_desc') },
              ]}
            />
          )}
        </View>

        {view === VIEW_PRIORITY ? (
          <RankedValueBars items={ordered} scaleId={latest.scale} />
        ) : (
          <GroupBreakdown items={results} groups={groups} scaleId={latest.scale} />
        )}

        <Button
          mode="outlined"
          onPress={onStartCalibration}
          style={styles.recalibrate}
          testID="results-recalibrate"
        >
          {t('results_recalibrate')}
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  controls: {
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  fill: {
    flex: 1,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  meta: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.md,
  },
  recalibrate: {
    marginTop: SPACING.xxl,
  },
});

ResultsScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default ResultsScreen;
