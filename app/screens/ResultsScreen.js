import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useCsvTransfer } from '../hooks/useCsvTransfer';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import RankedValueBars from '../components/charts/RankedValueBars';
import SegmentedToggle from '../components/SegmentedToggle';
import EmptyState from '../components/EmptyState';
import { formatDateKey } from '../utils/dateUtils';
import { SPACING, FONT_SIZE, CONTENT_MAX_WIDTH } from '../styles/designTokens';

const SORT_ASC = 'asc';
const SORT_DESC = 'desc';

/**
 * What the last calibration says: every rated value as an ordering.
 *
 * Sort defaults to descending — most important first. The whole app now reads
 * strongest-at-the-top, from the rating buttons on a card to this list, and a
 * single direction across both is what stops "up" meaning two things. The other
 * end is still worth reading, which is what the toggle is for: the bottom of a
 * values list is where the things you keep saying yes to but do not actually care
 * about collect.
 *
 * There used to be a second reading here, by value group. The groups are gone —
 * the source checklist is a flat list of values and this app now is too — so what
 * is left is the ranking, with each value's own description a hover or a tap away.
 */
const ResultsScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { latest, results, isLoading, hasResults } = useAssessment();
  const { exportCsv, busy } = useCsvTransfer();

  const [sort, setSort] = useState(SORT_DESC);

  // The toggle persists — it is a reading preference, and resetting it on every
  // launch would make the screen feel like it forgot.
  useEffect(() => {
    getPreference(PREF_KEYS.RESULTS_SORT, SORT_DESC)
      .then((storedSort) => {
        if (storedSort === SORT_ASC || storedSort === SORT_DESC) setSort(storedSort);
      })
      .catch(() => {});
  }, []);

  const changeSort = useCallback((next) => {
    setSort(next);
    setPreference(PREF_KEYS.RESULTS_SORT, next).catch(() => {});
  }, []);

  // getRankedResults already returns descending, so ascending is a reverse rather
  // than a re-sort with a different comparator — which keeps ties in a stable,
  // mirrored order instead of shuffling them.
  const ordered = useMemo(
    () => (sort === SORT_DESC ? results : [...results].reverse()),
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
            testID="results-sort-toggle"
            value={sort}
            onChange={changeSort}
            options={[
              { value: SORT_DESC, label: t('results_sort_desc') },
              { value: SORT_ASC, label: t('results_sort_asc') },
            ]}
          />
          <Text style={[styles.rowHint, { color: colors.mutedText }]}>
            {t('results_row_hint')}
          </Text>
        </View>

        <RankedValueBars items={ordered} scaleId={latest.scale} />

        <Button
          mode="outlined"
          icon="file-download-outline"
          onPress={exportCsv}
          disabled={busy}
          style={styles.export}
          testID="results-export-csv"
        >
          {t('csv_export')}
        </Button>
        {/* This button exports the ranking, which is what this screen is showing.
            A complete backup is two files now — the alignment check-ins are the
            other — and someone whose backup habit is this button would otherwise
            find that out at restore time. */}
        <Text style={[styles.exportNote, { color: colors.mutedText }]}>
          {t('csv_export_alignment_note')}
        </Text>

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
  export: {
    marginTop: SPACING.xxl,
  },
  exportNote: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.sm,
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
    marginTop: SPACING.md,
  },
  rowHint: {
    fontSize: FONT_SIZE.sm,
  },
});

ResultsScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default ResultsScreen;
