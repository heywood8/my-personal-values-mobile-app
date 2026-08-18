import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { useDialog } from '../contexts/DialogContext';
import AlignmentWheel from '../components/charts/AlignmentWheel';
import ScaleInput from '../components/ScaleInput';
import EmptyState from '../components/EmptyState';
import { valueName } from '../utils/valueNames';
import { formatDateKey, localDateKey } from '../utils/dateUtils';
import { ALIGNMENT_INPUT_SCALE, ALIGNMENT_MAX, trackedValues } from '../utils/alignment';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/**
 * The second list: how far behaviour matches the values that matter most.
 *
 * Membership is derived, not chosen. Whatever the last calibration put in the top
 * priority band is what today's wheel has sectors for — which is what keeps this
 * a second *list* rather than a second deck, and what stops it from quietly
 * becoming a place to track a value the reader already called peripheral.
 *
 * A PAST check-in is drawn from its own stored rows, never from today's
 * membership. That is the whole reason the record is worth keeping: a
 * recalibration changes what the wheel asks about, and redrawing June's answers
 * on July's wheel would show sectors that were never scored that day and hide the
 * ones that were.
 *
 * Nothing is prefilled. The deck refuses to seed a new day from the last run
 * because it would anchor the answer, and an alignment score is the more
 * anchor-prone of the two measurements — so the previous check-in appears as a
 * dashed shape behind the wheel, which is context, and its number appears beside
 * a row only once that row has been answered, which is feedback.
 */
const AlignmentScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { latest, results, isLoading: assessmentLoading } = useAssessment();
  const {
    checkins, history, todayScores, previous, entriesOn, previousBefore, isLoading,
    setAlignment, clearToday, deleteCheckin,
  } = useAlignment();

  // The date being looked at, or null for today — the only one that can be
  // answered, because a score written now belongs to now.
  const [viewing, setViewing] = useState(null);

  /**
   * What today's wheel has sectors for: the current ask, plus anything today
   * already carries an answer for.
   *
   * The second half is not defensive tidiness. Membership comes from the latest
   * *completed* assessment, and reopening a calibration clears `completed_at` —
   * so backing out of a recalibration can leave that query with nothing to return
   * while today's check-in sits fully answered in the database. Deriving the rows
   * from membership alone would show an empty wheel over real data with no way
   * back to it. A recalibration that merely moves a value out of the top band has
   * the same shape: this morning's score stays visible and editable for the rest
   * of the day rather than disappearing mid-sentence.
   */
  const tracked = useMemo(() => trackedValues(results), [results]);

  const todayRows = useMemo(() => {
    const today = localDateKey();
    const asked = new Set(tracked.map((value) => value.valueId));
    const carried = history.filter(
      (row) => row.checkedOn === today && !asked.has(row.valueId),
    );
    return [...tracked, ...carried];
  }, [tracked, history]);

  /**
   * The wheel being looked at, whichever it is.
   *
   * Numbering runs over whatever list this view holds, because a sector number is
   * a legend key for the wheel on screen and nothing more — it is never stored,
   * and it never lines a value up across two dates. That is what `valueId` is
   * for, and it is what the dashed outline and the "was" below are matched on.
   */
  const view = useMemo(() => {
    const entries = viewing ? entriesOn(viewing) : null;
    return {
      date: viewing || localDateKey(),
      isToday: !viewing,
      rows: (entries || todayRows).map((row, index) => ({ ...row, sector: index + 1 })),
      scores: entries
        ? new Map(entries.map((row) => [row.valueId, row.score]))
        : todayScores,
      previous: viewing ? previousBefore(viewing) : previous,
    };
  }, [viewing, entriesOn, todayRows, todayScores, previous, previousBefore]);

  const sectors = useMemo(() => view.rows.map((row) => ({
    valueId: row.valueId,
    key: row.key,
    sector: row.sector,
    score: view.scores.get(row.valueId),
  })), [view]);

  const ratedCount = useMemo(
    () => sectors.filter((sector) => sector.score !== undefined).length,
    [sectors],
  );

  /**
   * How many values each check-in actually holds. A day somebody tapped once and
   * a day they filled in completely are otherwise the same row — and the more
   * recent of the two is what every comparison on this screen is drawn against,
   * so its coverage is worth stating rather than leaving to be discovered.
   */
  const coverage = useMemo(() => {
    const counts = new Map();
    for (const row of history) {
      counts.set(row.checkedOn, (counts.get(row.checkedOn) ?? 0) + 1);
    }
    counts.set(localDateKey(), todayScores.size);
    return counts;
  }, [history, todayScores]);

  const handleDelete = useCallback((checkin) => {
    showDialog(
      t('alignment_delete_confirm_title'),
      t('alignment_delete_confirm_message', {
        date: formatDateKey(checkin.checkedOn, language),
      }),
      [
        { text: t('cancel') },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            // Or the screen would go on showing a wheel that no longer exists.
            setViewing((current) => (current === checkin.checkedOn ? null : current));
            deleteCheckin(checkin.id).catch((e) => {
              console.error('[Alignment] Failed to delete a check-in:', e);
            });
          },
        },
      ],
    );
  }, [showDialog, t, language, deleteCheckin]);

  if (assessmentLoading || isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Guarded on the rows and the records, not on the ranking: a wheel that still
  // holds answers is never traded for an empty screen.
  if (todayRows.length === 0 && checkins.length === 0) {
    const nothingRanked = !latest || results.length === 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="target"
          title={t(nothingRanked ? 'alignment_empty_title' : 'alignment_none_title')}
          body={t(nothingRanked ? 'alignment_empty_body' : 'alignment_none_body')}
          // Offered only where it is genuinely the next step. Where a ranking
          // exists but nothing reached the top of it, a button back into the deck
          // would read as "your answers were wrong"; the wheel appears on its own
          // the next time something does reach the top.
          actionLabel={nothingRanked ? t('results_start') : undefined}
          onAction={nothingRanked ? onStartCalibration : undefined}
          testID={nothingRanked ? 'alignment-empty' : 'alignment-none'}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="alignment-screen"
    >
      <View style={styles.inner}>
        {view.isToday ? (
          <>
            <Text style={[styles.meta, { color: colors.mutedText }]}>
              {latest
                ? `${t('alignment_value_count', { count: view.rows.length })} · ${t('alignment_from_calibration', { date: formatDateKey(latest.assessedOn, language) })}`
                : t('alignment_value_count', { count: view.rows.length })}
            </Text>
            <Text style={[styles.intro, { color: colors.mutedText }]}>{t('alignment_intro')}</Text>
          </>
        ) : (
          <View
            style={[styles.viewingBanner, { backgroundColor: colors.selected }]}
            testID="alignment-viewing"
          >
            <Text style={[styles.viewingTitle, { color: colors.text }]}>
              {t('alignment_viewing_title', { date: formatDateKey(view.date, language) })}
            </Text>
            <Text style={[styles.intro, { color: colors.mutedText }]}>
              {t('alignment_viewing_body')}
            </Text>
            <Button
              mode="contained-tonal"
              onPress={() => setViewing(null)}
              style={styles.backToToday}
              testID="alignment-back-to-today"
            >
              {t('alignment_back_to_today')}
            </Button>
          </View>
        )}

        {/* The two annotations from the instrument, kept as sentences on the
            app's type scale rather than pushed inside the SVG. Position carries
            the binding — the rim's sentence above the wheel, the centre's below
            it — and `alignment_row_hint` names both ends in words for the reader
            who is about to answer. */}
        <Text style={[styles.edgeLabel, { color: colors.text }]} testID="alignment-outer-label">
          {t('alignment_outer_label')}
        </Text>

        <AlignmentWheel
          sectors={sectors}
          previousScores={view.previous?.scores}
          accessibilityLabel={t('alignment_wheel_label', {
            rated: ratedCount,
            total: view.rows.length,
          })}
        />

        <Text style={[styles.edgeLabel, { color: colors.text }]} testID="alignment-inner-label">
          {t('alignment_inner_label')}
        </Text>

        {view.isToday && (
          <Text style={[styles.status, { color: colors.mutedText }]} testID="alignment-status">
            {ratedCount > 0
              ? t('alignment_checked_today', { rated: ratedCount, total: view.rows.length })
              : t('alignment_not_checked_today')}
          </Text>
        )}

        {!!view.previous && (
          <Text
            style={[styles.status, { color: colors.mutedText }]}
            testID="alignment-previous-hint"
          >
            {t('alignment_previous_hint', {
              date: formatDateKey(view.previous.checkedOn, language),
              count: view.previous.count,
            })}
          </Text>
        )}

        {view.isToday && (
          <Text style={[styles.rowHint, { color: colors.mutedText }]}>
            {t('alignment_row_hint')}
          </Text>
        )}

        <View style={styles.rows}>
          {sectors.map((sector, index) => {
            const rated = sector.score !== undefined;
            // Shown only once this row has been answered: feedback on what was
            // just given, rather than a number sitting above the buttons while
            // the reader is still deciding.
            const was = rated ? view.previous?.scores.get(sector.valueId) : undefined;

            return (
              <View
                key={sector.valueId}
                style={[styles.row, { borderColor: colors.border }]}
                testID={`alignment-row-${sector.key}`}
              >
                <View style={styles.rowHeader}>
                  {/* The number IS the sector's label on the wheel — this list is
                      the legend, which is what lets the wheel stay readable at
                      twenty-five values as well as at eight. */}
                  <View style={[styles.badge, { backgroundColor: colors.selected }]}>
                    <Text style={[styles.badgeLabel, { color: colors.text }]}>
                      {String(sector.sector)}
                    </Text>
                  </View>

                  <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                    {valueName(view.rows[index], t)}
                  </Text>

                  <Text style={[styles.score, { color: colors.mutedText }]}>
                    {rated ? `${sector.score}/${ALIGNMENT_MAX}` : t('alignment_unrated')}
                  </Text>

                  {view.isToday && rated && (
                    <IconButton
                      icon="close"
                      size={16}
                      iconColor={colors.mutedText}
                      accessibilityLabel={t('alignment_clear')}
                      onPress={() => clearToday(sector.valueId)}
                      testID={`alignment-clear-${sector.key}`}
                    />
                  )}
                </View>

                {/* The dashed outline is a shape, and a shape cannot be read
                    aloud — this is the same comparison in words. */}
                {was !== undefined && (
                  <Text
                    style={[styles.was, { color: colors.mutedText }]}
                    testID={`alignment-was-${sector.key}`}
                  >
                    {t('alignment_was', { score: `${was}/${ALIGNMENT_MAX}` })}
                  </Text>
                )}

                {view.isToday && (
                  <ScaleInput
                    scaleId={ALIGNMENT_INPUT_SCALE}
                    value={sector.score}
                    onChange={(score) => setAlignment(sector.valueId, score)}
                    testIDPrefix={`alignment-${sector.key}`}
                  />
                )}
              </View>
            );
          })}
        </View>

        {checkins.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('alignment_records_title')}
            </Text>
            <Text style={[styles.status, { color: colors.mutedText }]}>
              {t('alignment_records_count', { count: checkins.length })}
            </Text>

            {[...checkins].reverse().map((checkin) => {
              const open = viewing === checkin.checkedOn;
              return (
                <View
                  key={checkin.id}
                  style={[styles.recordRow, { borderBottomColor: colors.border }]}
                  testID={`checkin-${checkin.checkedOn}`}
                >
                  {/* A dated record whose only affordance is a delete button is
                      not a tracked list. Tapping one redraws the wheel above as
                      it was filled in that day. */}
                  <Pressable
                    style={styles.recordOpen}
                    onPress={() => setViewing(open ? null : checkin.checkedOn)}
                    accessibilityRole="button"
                    accessibilityLabel={t('alignment_open_record')}
                    accessibilityState={{ selected: open }}
                    testID={`open-checkin-${checkin.checkedOn}`}
                  >
                    <Text
                      style={[styles.recordDate, { color: open ? colors.primary : colors.text }]}
                    >
                      {formatDateKey(checkin.checkedOn, language)}
                    </Text>
                    <Text style={[styles.recordCoverage, { color: colors.mutedText }]}>
                      {t('alignment_record_coverage', {
                        count: coverage.get(checkin.checkedOn) ?? 0,
                      })}
                    </Text>
                  </Pressable>
                  <IconButton
                    icon="trash-can-outline"
                    size={20}
                    iconColor={colors.mutedText}
                    accessibilityLabel={t('alignment_delete_record')}
                    onPress={() => handleDelete(checkin)}
                    testID={`delete-checkin-${checkin.checkedOn}`}
                  />
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  backToToday: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  badge: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: SPACING.xs,
  },
  badgeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
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
  edgeLabel: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginVertical: SPACING.sm,
    textAlign: 'center',
  },
  fill: {
    flex: 1,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  intro: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  meta: {
    fontSize: FONT_SIZE.sm,
  },
  name: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
  recordCoverage: {
    fontSize: FONT_SIZE.sm,
  },
  recordDate: {
    fontSize: FONT_SIZE.base,
  },
  recordOpen: {
    flex: 1,
    paddingVertical: SPACING.sm,
  },
  recordRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  row: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  rowHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.md,
  },
  rows: {
    marginTop: SPACING.xs,
  },
  score: {
    fontSize: FONT_SIZE.sm,
  },
  section: {
    marginTop: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  status: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  viewingBanner: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  viewingTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  was: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
});

AlignmentScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default AlignmentScreen;
