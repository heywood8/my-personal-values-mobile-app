import React, { memo, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { categoricalSeries } from '../../styles/chartPalette';
import { getScale, scaleStepLabel } from '../../utils/scales';
import { ALIGNMENT_MAX } from '../../utils/alignment';
import { COMPARE_METRICS } from '../../utils/comparison';
import { valueName } from '../../utils/valueNames';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '../../styles/designTokens';

/**
 * One value, twice: what each of two people answered about it.
 *
 * The ranked bars next door take a single hue stepped by band, because their job
 * is magnitude. This one's job is identity — *whose* answer is this — so the two
 * bars take two categorical hues, the first two slots of the validated ordered
 * set. Colour is never the only thing saying which is which: each bar carries the
 * word beside it and its own score at the end, which is also what the palette's
 * light-mode contrast note obliges any surface using those hues to do.
 *
 * A side with no answer draws no bar at all, over the same empty track. That is
 * the wheel's rule about "not answered" rather than the ranking's: a value only
 * one of you rated is a hole in the comparison, and a zero-length fill would
 * read as "they think this is worthless" instead. The em dash in the score
 * column says it in print, and the row's accessibility label says it in words.
 *
 * Both columns either side of the tracks are measured once and applied to every
 * row, so every track starts and ends at the same x. The same reason as
 * RankedValueBars: a row whose label happens to read "Very important" would
 * otherwise squeeze its own track and look like a shorter answer.
 */

/** What a side's reading prints at the end of its bar. */
const readingLabel = (reading, metric, scaleId, t) => {
  if (!reading) return null;
  return metric === COMPARE_METRICS.ALIGNMENT
    ? `${reading.score}/${ALIGNMENT_MAX}`
    : scaleStepLabel(scaleId, reading.score, t);
};

const MISSING_MARK = '—';

const ComparisonRow = memo(({ row, sides, metric, whoWidth, scoreWidth, showWho }) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();

  const name = valueName(row, t);
  const series = categoricalSeries(mode);

  const spoken = sides
    .map((side) => {
      const label = readingLabel(row[side.id], metric, side.scaleId, t);
      return `${side.label}: ${label || t('compare_missing')}`;
    })
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={`${name}. ${spoken}`}
      style={styles.row}
      testID={`compare-row-${row.key}`}
    >
      <Text numberOfLines={1} style={[styles.valueName, { color: colors.text }]}>
        {name}
      </Text>

      {sides.map((side) => {
        const reading = row[side.id];
        const label = readingLabel(reading, metric, side.scaleId, t);

        return (
          <View key={side.id} style={styles.barLine}>
            {showWho && (
              <Text
                numberOfLines={1}
                style={[
                  styles.who,
                  whoWidth ? { width: whoWidth } : null,
                  { color: colors.mutedText },
                ]}
              >
                {side.label}
              </Text>
            )}

            <View style={[styles.track, { backgroundColor: colors.track }]}>
              {!!reading && (
                <View
                  testID={`compare-fill-${row.key}-${side.id}`}
                  style={[
                    styles.fill,
                    {
                      // Slot by side rather than by position, so "you" is one
                      // colour and "them" the other wherever a bar is drawn —
                      // including the lists that show only one of the two.
                      backgroundColor: series[side.slot],
                      width: `${Math.round(reading.fraction * 100)}%`,
                    },
                  ]}
                />
              )}
            </View>

            <Text
              numberOfLines={1}
              style={[
                styles.score,
                scoreWidth ? { width: scoreWidth } : null,
                { color: colors.mutedText },
              ]}
            >
              {label || MISSING_MARK}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

ComparisonRow.displayName = 'ComparisonRow';

ComparisonRow.propTypes = {
  row: PropTypes.object.isRequired,
  sides: PropTypes.array.isRequired,
  metric: PropTypes.string.isRequired,
  whoWidth: PropTypes.number,
  scoreWidth: PropTypes.number,
  showWho: PropTypes.bool,
};

const ComparisonBars = ({ rows, sides, metric, testID }) => {
  const { t } = useLocalization();

  const [whoWidth, setWhoWidth] = useState(0);
  const [scoreWidth, setScoreWidth] = useState(0);

  // Ceil, not round: half a pixel short clips the last glyph on the web.
  const measureInto = useCallback((set) => (event) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    set((current) => (current === width ? current : width));
  }, []);

  /**
   * Every label either column could ever print, laid out off-screen so the
   * widest one can be measured. Guessed widths break in Russian and again at a
   * large font scale; both columns hold words, not numbers, in at least one
   * language.
   */
  const scoreLabels = useMemo(() => {
    if (metric === COMPARE_METRICS.ALIGNMENT) {
      return Array.from({ length: ALIGNMENT_MAX }, (_, i) => `${i + 1}/${ALIGNMENT_MAX}`);
    }
    // Both scales, because the two sides need not have used the same one and
    // every track on screen is one length. Deduplicated because they usually
    // overlap — "1" through "5" belongs to two of the three scales.
    return [...new Set(sides.flatMap((side) => getScale(side.scaleId).steps
      .map((step) => scaleStepLabel(side.scaleId, step, t))))];
  }, [metric, sides, t]);

  const showWho = sides.length > 1;

  return (
    <View testID={testID || 'comparison-bars'}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={measureInto(setScoreWidth)}
        pointerEvents="none"
        style={styles.sizer}
        testID="comparison-score-sizer"
      >
        {scoreLabels.map((label) => (
          <Text key={label} style={styles.score}>{label}</Text>
        ))}
      </View>

      {showWho && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={measureInto(setWhoWidth)}
          pointerEvents="none"
          style={styles.sizer}
          testID="comparison-who-sizer"
        >
          {sides.map((side) => (
            <Text key={side.id} style={styles.who}>{side.label}</Text>
          ))}
        </View>
      )}

      {rows.map((row) => (
        <ComparisonRow
          key={row.key}
          row={row}
          sides={sides}
          metric={metric}
          whoWidth={whoWidth}
          scoreWidth={scoreWidth}
          showWho={showWho}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  barLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    // A pair of bars belonging to one value has to read as a pair, so the two
    // lines sit closer to each other than the values do to their neighbours.
    paddingVertical: 1,
  },
  fill: {
    borderBottomRightRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
    height: '100%',
  },
  row: {
    marginBottom: SPACING.md,
  },
  score: {
    fontSize: FONT_SIZE.sm,
    minWidth: 26,
    textAlign: 'left',
  },
  sizer: {
    // Out of flow and invisible: it exists to be measured, and must not take a
    // row's worth of height.
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0,
  },
  track: {
    borderRadius: BORDER_RADIUS.sm,
    flex: 1,
    height: 12,
    overflow: 'hidden',
  },
  valueName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  who: {
    fontSize: FONT_SIZE.sm,
  },
});

ComparisonBars.propTypes = {
  /** Rows from `compareValues`, in the order they should be drawn. */
  rows: PropTypes.array.isRequired,
  /**
   * Which readings to draw, in order. `id` names the row's field (`mine` /
   * `theirs`), `slot` its categorical colour, `scaleId` the scale its raw scores
   * were given on, and `label` the word printed beside its bars.
   */
  sides: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    slot: PropTypes.number.isRequired,
    scaleId: PropTypes.string,
  })).isRequired,
  metric: PropTypes.string.isRequired,
  testID: PropTypes.string,
};

export default ComparisonBars;
