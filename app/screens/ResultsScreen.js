import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button, TextInput, Switch } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { useCsvTransfer } from '../hooks/useCsvTransfer';
import { useResultsShare } from '../hooks/useResultsShare';
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
 *
 * Two ways out of the screen, and they are not the same thing. The CSV file is a
 * backup — it comes back in through import, and it is the only backup there is.
 * The link is for somebody else: it carries this ranking inside itself and lands
 * as a read-only page, so a friend needs no app, no account and no copy of the
 * database. The link is shown as well as sent, because what is being handed over
 * is the data itself and an app that promises nothing leaves the device should
 * say precisely what does.
 *
 * The wheel can go with it, and it is a switch rather than a default. Importance
 * is a list of what you care about; alignment is a list of where you are falling
 * short of it, and the second is not automatically as easy to hand somebody as
 * the first. The switch also starts off on every visit — deliberately not
 * persisted, so the decision is made about *this* link rather than inherited from
 * one made weeks ago — and the line under it names the date and the number of
 * answers that would travel, because that is the actual thing leaving the device.
 */
const ResultsScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { latest, results, isLoading, hasResults } = useAssessment();
  const { latestCheckin } = useAlignment();
  const { exportCsv, busy } = useCsvTransfer();
  const { shareResults, busy: sharing, link } = useResultsShare();

  const [sort, setSort] = useState(SORT_DESC);
  const [includeAlignment, setIncludeAlignment] = useState(false);

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
          mode="contained-tonal"
          icon="share-variant"
          onPress={() => shareResults({ includeAlignment })}
          disabled={sharing}
          style={styles.share}
          testID="results-share"
        >
          {t('share_action')}
        </Button>
        <Text style={[styles.note, { color: colors.mutedText }]}>
          {t('share_hint')}
        </Text>

        {/* Offered only where there is a check-in to offer. A switch promising to
            send a wheel nobody has filled in would be a choice about nothing. */}
        {!!latestCheckin && (
          <View style={styles.shareOption}>
            <View style={styles.shareOptionRow}>
              <Text style={[styles.shareOptionLabel, { color: colors.text }]}>
                {t('share_include_alignment')}
              </Text>
              <Switch
                value={includeAlignment}
                onValueChange={setIncludeAlignment}
                accessibilityLabel={t('share_include_alignment')}
                testID="results-share-alignment"
              />
            </View>
            {includeAlignment && (
              <Text
                style={[styles.note, { color: colors.mutedText }]}
                testID="results-share-alignment-hint"
              >
                {t('share_include_alignment_hint', {
                  count: latestCheckin.count,
                  date: formatDateKey(latestCheckin.checkedOn, language),
                })}
              </Text>
            )}
          </View>
        )}

        {/* Read-only rather than hidden: this is the ranking, encoded, and the
            reader is about to hand it to somebody. It is also the way to copy the
            link on a browser that refused the clipboard. */}
        {!!link && (
          <TextInput
            mode="outlined"
            dense
            multiline
            editable={false}
            selectTextOnFocus
            label={t('share_link_label')}
            value={link}
            style={styles.link}
            testID="results-share-link"
          />
        )}

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
        <Text style={[styles.note, { color: colors.mutedText }]}>
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
    marginTop: SPACING.xl,
  },
  fill: {
    flex: 1,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  link: {
    // A share link is a long string. Boxed and scrollable rather than allowed to
    // grow: it is there to be selected, not to be read.
    marginTop: SPACING.sm,
    maxHeight: 96,
  },
  meta: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.md,
  },
  note: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
  recalibrate: {
    marginTop: SPACING.md,
  },
  rowHint: {
    fontSize: FONT_SIZE.sm,
  },
  share: {
    marginTop: SPACING.xxl,
  },
  shareOption: {
    marginTop: SPACING.md,
  },
  shareOptionLabel: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
  shareOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
});

ResultsScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default ResultsScreen;
