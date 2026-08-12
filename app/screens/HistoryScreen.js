import React, { useMemo, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import TrendChart, { markerShape } from '../components/charts/TrendChart';
import EmptyState from '../components/EmptyState';
import { seriesColor, MAX_TRACKED_SERIES } from '../styles/chartPalette';
import { valueName } from '../utils/valueNames';
import { formatDateKey } from '../utils/dateUtils';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/** The dot/square/triangle glyph that stands in for a marker shape in the legend. */
const LEGEND_GLYPH = {
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
  diamond: 'rhombus',
  plus: 'plus-thick',
};

/**
 * How values moved between calibrations.
 *
 * Everything here reads the NORMALISED score, which is what makes a history
 * spanning a change of rating scale comparable at all (see app/utils/scales.js).
 *
 * Only a handful of values are plotted at once. That is the categorical-palette
 * ceiling talking: past about five lines, no set of hues stays tellable apart
 * under colour-vision deficiency, and the honest fix is fewer series rather than
 * more colours. The selector below the chart doubles as the legend.
 */
const HistoryScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors, mode } = useThemeColors();
  const { showDialog } = useDialog();
  const { history, assessments, isLoading, deleteAssessment } = useAssessment();

  // [{ valueId, slot }] — the slot is assigned on selection and held until
  // deselection, so removing one line never repaints the others.
  const [selection, setSelection] = useState([]);

  const { dates, byValue, movers } = useMemo(() => {
    const dateSet = [];
    const values = new Map();

    for (const row of history) {
      if (!dateSet.includes(row.assessedOn)) dateSet.push(row.assessedOn);

      if (!values.has(row.valueId)) {
        values.set(row.valueId, {
          valueId: row.valueId,
          key: row.key,
          isCustom: row.isCustom,
          customName: row.customName,
          points: [],
        });
      }
      values.get(row.valueId).points.push({
        assessedOn: row.assessedOn,
        normalized: row.normalized,
        score: row.score,
      });
    }

    dateSet.sort();

    // Movement is measured between the two most recent calibrations. Comparing
    // against the very first one instead would answer a different question
    // ("how far have I come"), and the one people check after a recalibration is
    // "what changed this time".
    const previousDate = dateSet[dateSet.length - 2];
    const latestDate = dateSet[dateSet.length - 1];

    const moved = [];
    if (previousDate && latestDate) {
      for (const value of values.values()) {
        const before = value.points.find((p) => p.assessedOn === previousDate);
        const after = value.points.find((p) => p.assessedOn === latestDate);
        // A value only rated in one of the two runs has no delta to report —
        // showing it as a full-height rise would be an artefact of it being new.
        if (!before || !after) continue;
        const delta = after.normalized - before.normalized;
        if (delta !== 0) moved.push({ ...value, delta, before, after });
      }
      moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }

    return { dates: dateSet, byValue: values, movers: moved };
  }, [history]);

  // Seed the chart with the values that actually moved — the interesting lines,
  // rather than the alphabetically first ones. Falls back to the strongest values
  // when nothing moved (or there is only one calibration).
  useEffect(() => {
    if (selection.length > 0 || byValue.size === 0) return;

    const seed = movers.length > 0
      ? movers.slice(0, 3).map((m) => m.valueId)
      : [...byValue.values()]
        .sort((a, b) => {
          const aLast = a.points[a.points.length - 1]?.normalized ?? 0;
          const bLast = b.points[b.points.length - 1]?.normalized ?? 0;
          return bLast - aLast;
        })
        .slice(0, 3)
        .map((v) => v.valueId);

    setSelection(seed.map((valueId, slot) => ({ valueId, slot })));
  }, [movers, byValue, selection.length]);

  const toggleValue = useCallback((valueId) => {
    setSelection((prev) => {
      const existing = prev.find((s) => s.valueId === valueId);
      if (existing) return prev.filter((s) => s.valueId !== valueId);
      if (prev.length >= MAX_TRACKED_SERIES) return prev;
      // Lowest free slot, so a colour freed by a deselection is reused rather
      // than the palette running off its end.
      const taken = new Set(prev.map((s) => s.slot));
      let slot = 0;
      while (taken.has(slot)) slot += 1;
      return [...prev, { valueId, slot }];
    });
  }, []);

  const series = useMemo(() => selection
    .map(({ valueId, slot }) => {
      const value = byValue.get(valueId);
      if (!value) return null;
      return {
        valueId,
        slot,
        name: valueName(value, t),
        points: value.points,
      };
    })
    .filter(Boolean), [selection, byValue, t]);

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

  const sortedValues = [...byValue.values()].sort((a, b) => {
    const aLast = a.points[a.points.length - 1]?.normalized ?? 0;
    const bLast = b.points[b.points.length - 1]?.normalized ?? 0;
    return bLast - aLast;
  });

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="history-screen"
    >
      <View style={styles.inner}>
        <Text style={[styles.meta, { color: colors.mutedText }]}>
          {t('history_records_count', { count: assessments.length })}
        </Text>

        {assessments.length < 2 ? (
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
              movers.slice(0, 6).map((mover) => {
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

        {dates.length > 0 && series.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('history_chart_title')}
            </Text>
            <TrendChart series={series} dates={dates} />

            {/* The legend IS the selector: colour is bound to a name and a shape
                in the same row that toggles the line. */}
            <View style={styles.legend}>
              {sortedValues.map((value) => {
                const selected = selection.find((s) => s.valueId === value.valueId);
                const atCap = !selected && selection.length >= MAX_TRACKED_SERIES;
                const color = selected ? seriesColor(selected.slot, mode) : colors.mutedText;

                return (
                  <Pressable
                    key={value.valueId}
                    onPress={() => toggleValue(value.valueId)}
                    disabled={atCap}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!selected, disabled: atCap }}
                    accessibilityLabel={valueName(value, t)}
                    testID={`legend-${value.key}`}
                    style={[
                      styles.legendChip,
                      {
                        backgroundColor: selected ? colors.selected : colors.surface,
                        borderColor: selected ? color : colors.border,
                      },
                      atCap && styles.legendChipDisabled,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={selected ? LEGEND_GLYPH[markerShape(selected.slot)] : 'circle-outline'}
                      size={12}
                      color={color}
                    />
                    <Text
                      numberOfLines={1}
                      style={[styles.legendLabel, { color: colors.text }]}
                    >
                      {valueName(value, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
    paddingTop: SPACING.md,
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
    marginTop: SPACING.md,
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
  legendChipDisabled: {
    opacity: 0.45,
  },
  legendLabel: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
  meta: {
    fontSize: FONT_SIZE.sm,
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
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
  },
  noticeBody: {
    fontSize: FONT_SIZE.md,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  noticeTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
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
    marginBottom: SPACING.sm,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
});

HistoryScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default HistoryScreen;
