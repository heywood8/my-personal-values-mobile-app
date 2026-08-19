import React, { useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import TrendChart from '../components/charts/TrendChart';
import TrendGrid from '../components/charts/TrendGrid';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { MAX_TRACKED_SERIES } from '../styles/chartPalette';
import { valueName } from '../utils/valueNames';
import { formatDateKey } from '../utils/dateUtils';
import { timeAxis } from '../utils/trendScale';
import {
  buildTrendSeries, computeMovers, defaultTrackedIds, pointOn,
} from '../utils/history';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH, LINE_HEIGHT, LETTER_SPACING,
} from '../styles/designTokens';

/** How many lines the overlay chart opens with, when there is movement to show. */
const SEEDED_FOCUS = 3;
/** How many movers the summary lists before it stops being a summary. */
const MOVERS_SHOWN = 5;

/**
 * How values moved between calibrations.
 *
 * The screen is read in two layers, and the split is what lets it show ten or
 * twenty values at once when the old single chart could only show five.
 *
 * The GRID is the default reading: one small multiple per tracked value, all on
 * the same time axis and the same absolute 0..1 scale, each card carrying its
 * own name, level and movement. Identity is carried by position and label, so
 * the count is bounded by the screen rather than by the palette.
 *
 * The OVERLAY is the second reading, for the question a grid cannot answer —
 * did these two cross, and when. That one is bounded by the categorical palette,
 * because it is the only place a line's identity rests on its hue; past about
 * five, no set of hues stays tellable apart under colour-vision deficiency. The
 * grid doubles as its legend: a focused card takes its line's colour and marker
 * glyph, so the binding from line to name is a card, not a swatch.
 *
 * Everything here reads the NORMALISED score, which is what makes a history
 * spanning a change of rating scale comparable at all (see app/utils/scales.js).
 */
const HistoryScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const {
    history, assessments, results, isLoading, deleteAssessment,
  } = useAssessment();

  // Both selections start as null meaning "whatever the defaults say", rather
  // than being seeded into state by an effect. An effect would have to re-run
  // whenever the ranking reloads — after a delete, say — and would then either
  // overwrite a selection the reader had made or go stale against a value that
  // no longer exists. Falling through to a computed default until the reader
  // touches something has neither failure.
  const [tracked, setTracked] = useState(null);
  const [focus, setFocus] = useState(null);
  const [managing, setManaging] = useState(false);

  const { dates, values } = useMemo(() => buildTrendSeries(history), [history]);
  const byValue = useMemo(
    () => new Map(values.map((value) => [value.valueId, value])),
    [values],
  );
  const movers = useMemo(() => computeMovers(values, dates), [values, dates]);
  const axis = useMemo(() => timeAxis(dates), [dates]);

  // The grid's order, and the default membership, both come from the CURRENT
  // ranking rather than from the history rows: "the ten that matter most" is a
  // present-tense question, and the history is a record of every answer ever
  // given, including for values that have since dropped away.
  const rankIndex = useMemo(
    () => new Map(results.map((result, index) => [result.valueId, index])),
    [results],
  );
  const defaults = useMemo(() => defaultTrackedIds(results), [results]);
  const trackedIds = tracked ?? defaults;

  const seededFocus = useMemo(() => {
    if (dates.length < 2) return [];
    // The lines worth opening on are the ones that moved — the interesting
    // ones, rather than the strongest, which a reader can already see are
    // strongest from the grid. Falls back to the top of the list when nothing
    // moved at all.
    const inGrid = new Set(trackedIds);
    const moved = movers
      .filter((mover) => inGrid.has(mover.valueId))
      .slice(0, SEEDED_FOCUS)
      .map((mover) => mover.valueId);
    const seed = moved.length > 0 ? moved : trackedIds.slice(0, SEEDED_FOCUS);
    return seed.map((valueId, slot) => ({ valueId, slot }));
  }, [movers, trackedIds, dates.length]);

  const focusList = focus ?? seededFocus;

  const toggleFocus = useCallback((valueId) => {
    const existing = focusList.find((entry) => entry.valueId === valueId);
    if (existing) {
      setFocus(focusList.filter((entry) => entry.valueId !== valueId));
      return;
    }
    if (focusList.length >= MAX_TRACKED_SERIES) return;
    // Lowest free slot, so a colour freed by a deselection is reused rather than
    // the palette running off its end.
    const taken = new Set(focusList.map((entry) => entry.slot));
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    setFocus([...focusList, { valueId, slot }]);
  }, [focusList]);

  const toggleTracked = useCallback((valueId) => {
    if (trackedIds.includes(valueId)) {
      setTracked(trackedIds.filter((id) => id !== valueId));
      // A value that leaves the grid leaves the chart with it — the grid is the
      // chart's legend, and a line with nothing naming it is the exact thing the
      // two layers exist to avoid.
      setFocus(focusList.filter((entry) => entry.valueId !== valueId));
      return;
    }
    setTracked([...trackedIds, valueId]);
  }, [trackedIds, focusList]);

  const resetTracked = useCallback(() => {
    setTracked(null);
    setFocus(null);
  }, []);

  const gridItems = useMemo(() => {
    const previousDate = dates[dates.length - 2];
    const latestDate = dates[dates.length - 1];

    return trackedIds
      .map((valueId) => {
        const value = byValue.get(valueId);
        if (!value || value.points.length === 0) return null;
        const before = pointOn(value, previousDate);
        const after = pointOn(value, latestDate);
        return {
          ...value,
          name: valueName(value, t),
          latest: value.points[value.points.length - 1],
          // Null rather than zero when the value was not in both runs: a value
          // first rated last week has not "held steady", it has no delta at all.
          delta: before && after ? after.normalized - before.normalized : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aRank = rankIndex.get(a.valueId) ?? Number.MAX_SAFE_INTEGER;
        const bRank = rankIndex.get(b.valueId) ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return b.latest.normalized - a.latest.normalized;
      });
  }, [trackedIds, byValue, dates, rankIndex, t]);

  const series = useMemo(() => focusList
    .map(({ valueId, slot }) => {
      const value = byValue.get(valueId);
      if (!value) return null;
      return {
        valueId, slot, name: valueName(value, t), points: value.points,
      };
    })
    .filter(Boolean), [focusList, byValue, t]);

  const selectable = useMemo(() => [...values]
    .map((value) => ({ ...value, name: valueName(value, t) }))
    .sort((a, b) => {
      const aRank = rankIndex.get(a.valueId) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rankIndex.get(b.valueId) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name, language);
    }), [values, rankIndex, t, language]);

  const handleDelete = useCallback((assessment) => {
    showDialog(
      t('history_delete_confirm_title'),
      t('history_delete_confirm_message', {
        date: formatDateKey(assessment.assessedOn, language),
      }),
      [
        { text: t('cancel') },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteAssessment(assessment.id).catch((e) => {
              console.error('[History] Failed to delete a calibration:', e);
            });
          },
        },
      ],
    );
  }, [showDialog, t, language, deleteAssessment]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (assessments.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="chart-line-variant"
          title={t('history_empty_title')}
          body={t('history_empty_body')}
          actionLabel={t('results_start')}
          onAction={onStartCalibration}
          testID="history-empty"
        />
      </View>
    );
  }

  const hasTrend = dates.length > 1;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="history-screen"
    >
      <View style={styles.inner}>
        <ScreenHeader
          title={t('tab_history')}
          meta={t('history_records_count', { count: assessments.length })}
        >
          {hasTrend && (
            <Text style={[styles.meta, { color: colors.mutedText }]}>
              {t('history_span', {
                from: formatDateKey(dates[0], language),
                to: formatDateKey(dates[dates.length - 1], language),
              })}
            </Text>
          )}
        </ScreenHeader>

        {!hasTrend ? (
          <View style={[styles.notice, { backgroundColor: colors.selected }]}>
            <Text style={[styles.noticeTitle, { color: colors.text }]}>
              {t('history_needs_two_title')}
            </Text>
            <Text style={[styles.noticeBody, { color: colors.mutedText }]}>
              {t('history_needs_two_body')}
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('history_movers_title')}
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.mutedText }]}>
              {t('history_movers_since', {
                date: formatDateKey(dates[dates.length - 2], language),
              })}
            </Text>

            {movers.length === 0 ? (
              <Text style={[styles.sectionMeta, { color: colors.mutedText }]}>
                {t('history_nothing_moved')}
              </Text>
            ) : (
              movers.slice(0, MOVERS_SHOWN).map((mover) => {
                const rose = mover.delta > 0;
                return (
                  <View key={mover.valueId} style={styles.moverRow} testID={`mover-${mover.key}`}>
                    <MaterialCommunityIcons
                      name={rose ? 'arrow-up' : 'arrow-down'}
                      size={18}
                      color={rose ? colors.positive : colors.negative}
                    />
                    <Text numberOfLines={1} style={[styles.moverName, { color: colors.text }]}>
                      {valueName(mover, t)}
                    </Text>
                    {/* The direction is stated in words as well as by arrow and
                        colour, so it survives a monochrome or CVD reading. */}
                    <Text style={[styles.moverDelta, { color: colors.mutedText }]}>
                      {`${rose ? t('history_rose') : t('history_fell')} ${Math.round(Math.abs(mover.delta) * 100)}%`}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {gridItems.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('history_chart_title')}
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.mutedText }]}>
              {hasTrend ? t('history_grid_caption') : t('history_grid_caption_single')}
            </Text>

            {hasTrend && (
              series.length > 0 ? (
                <View style={styles.overlay}>
                  <TrendChart series={series} dates={dates} />
                </View>
              ) : (
                <Text style={[styles.overlayEmpty, { color: colors.mutedText }]}>
                  {t('history_compare_empty', { count: MAX_TRACKED_SERIES })}
                </Text>
              )
            )}

            <TrendGrid
              items={gridItems}
              axis={axis}
              focus={focusList}
              onToggle={toggleFocus}
              canFocusMore={focusList.length < MAX_TRACKED_SERIES}
              trend={hasTrend}
            />

            <View style={styles.manageBar}>
              <Pressable
                onPress={() => setManaging((open) => !open)}
                accessibilityRole="button"
                aria-expanded={managing}
                testID="history-manage-toggle"
                style={styles.manageButton}
              >
                <MaterialCommunityIcons
                  name={managing ? 'chevron-up' : 'tune-variant'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.manageLabel, { color: colors.primary }]}>
                  {managing ? t('history_manage_hide') : t('history_manage_show')}
                </Text>
              </Pressable>
              <Text style={[styles.manageCount, { color: colors.mutedText }]}>
                {t('history_manage_count', {
                  count: trackedIds.length,
                  total: values.length,
                })}
              </Text>
            </View>

            {managing && (
              <View testID="history-manage-panel">
                <View style={styles.legend}>
                  {selectable.map((value) => {
                    const selected = trackedIds.includes(value.valueId);
                    return (
                      <Pressable
                        key={value.valueId}
                        onPress={() => toggleTracked(value.valueId)}
                        accessibilityRole="checkbox"
                        aria-checked={selected}
                        accessibilityLabel={value.name}
                        testID={`legend-${value.key}`}
                        style={[
                          styles.legendChip,
                          {
                            backgroundColor: selected ? colors.selected : colors.surface,
                            borderColor: selected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={selected ? 'check-circle' : 'circle-outline'}
                          size={13}
                          color={selected ? colors.primary : colors.mutedText}
                        />
                        <Text
                          numberOfLines={1}
                          style={[styles.legendLabel, { color: colors.text }]}
                        >
                          {value.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={resetTracked}
                  accessibilityRole="button"
                  testID="history-manage-reset"
                  style={styles.manageButton}
                >
                  <MaterialCommunityIcons name="restore" size={16} color={colors.primary} />
                  <Text style={[styles.manageLabel, { color: colors.primary }]}>
                    {t('history_manage_reset')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('history_records_title')}
          </Text>
          {[...assessments].reverse().map((assessment) => (
            <View
              key={assessment.id}
              style={[styles.recordRow, { borderBottomColor: colors.border }]}
              testID={`record-${assessment.assessedOn}`}
            >
              <Text style={[styles.recordDate, { color: colors.text }]}>
                {formatDateKey(assessment.assessedOn, language)}
              </Text>
              <IconButton
                icon="trash-can-outline"
                size={20}
                iconColor={colors.mutedText}
                accessibilityLabel={t('history_delete_record')}
                onPress={() => handleDelete(assessment)}
                testID={`delete-${assessment.assessedOn}`}
              />
            </View>
          ))}
        </View>
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
    paddingTop: SPACING.lg,
  },
  fill: {
    flex: 1,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  legendChip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    maxWidth: '100%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  legendLabel: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
  manageBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  manageButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  manageCount: {
    fontSize: FONT_SIZE.sm,
  },
  manageLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  meta: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
  },
  moverDelta: {
    fontSize: FONT_SIZE.sm,
  },
  moverName: {
    flex: 1,
    fontSize: FONT_SIZE.md,
  },
  moverRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  notice: {
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.md,
    padding: SPACING.lg,
  },
  noticeBody: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md * LINE_HEIGHT.relaxed,
    marginTop: SPACING.xs,
  },
  noticeTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: '700',
    letterSpacing: LETTER_SPACING.snug,
  },
  overlay: {
    marginBottom: SPACING.lg,
    marginTop: SPACING.sm,
  },
  overlayEmpty: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.lg,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  recordDate: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
  recordRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  section: {
    marginTop: SPACING.xxl,
  },
  sectionMeta: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginBottom: SPACING.sm,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    letterSpacing: LETTER_SPACING.tight,
    lineHeight: FONT_SIZE.xl * LINE_HEIGHT.heading,
  },
});

HistoryScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default HistoryScreen;
