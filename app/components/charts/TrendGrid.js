import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { priorityColor, seriesColor } from '../../styles/chartPalette';
import { priorityBand } from '../../utils/scales';
import TrendSparkline from './TrendSparkline';
import { markerShape } from './TrendChart';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, LETTER_SPACING, elevation,
} from '../../styles/designTokens';

const SPARK_HEIGHT = 44;
// A focused card's border is thicker than a resting one's. The sparkline is
// sized against the thicker of the two on every card, so promoting one into the
// overlay does not nudge its line a couple of pixels sideways.
const FOCUS_BORDER = 2;
const CARD_MIN_WIDTH = 170;
const MAX_COLUMNS = 3;
// Two lines of the name, reserved whether or not the name needs them, so the
// numbers and the sparklines line up across a row of cards.
const NAME_LINE_HEIGHT = 17;

/** The glyph that stands in for a series' marker shape on a focused card. */
const LEGEND_GLYPH = {
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
  diamond: 'rhombus',
  plus: 'plus-thick',
};

/**
 * Every tracked value at once, as a grid of small multiples.
 *
 * This is the default reading of the history screen, and the reason the screen
 * can open on ten or twenty values rather than five. Each card carries its own
 * name, its current level as a number, its movement since the previous
 * calibration in words and arrow, and its line — so nothing on it is encoded by
 * colour alone, and the categorical palette's ceiling never applies.
 *
 * Colour still says something, in one direction only: an unfocused card takes
 * the ORDINAL priority step for where the value currently sits, the same ramp
 * the ranked results use, so the grid reads top-to-bottom as importance. A card
 * the reader has pushed into the overlay chart above takes that line's
 * CATEGORICAL hue and its marker glyph instead — which is what binds a line in
 * the chart to a name down here, and is why the overlay needs no legend of its
 * own.
 *
 * Before the second calibration there is no line to draw, so each card carries a
 * level bar instead of a sparkline — the same encoding the ranked results use,
 * and the same one this grid would otherwise waste forty pixels of height
 * failing to express. A 44px box cannot separate 100% from 75% at a glance; a
 * bar across the card can.
 *
 * @param {Array} items tracked values, most important first
 * @param {Function} axis timeAxis() over every calibration date
 * @param {Array<{valueId: string, slot: number}>} focus lines currently overlaid
 * @param {boolean} trend whether there is more than one calibration to plot
 */
const TrendGrid = ({
  items, axis, focus, onToggle, canFocusMore, trend,
}) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();
  const [width, setWidth] = useState(0);

  // Cards render before the row has been measured — with a flexible width and
  // no sparkline, which is one frame on a phone but the whole of the first paint
  // on a slow web load. Holding the grid back until `onLayout` lands would blank
  // the section instead, and the names and numbers do not need the measurement.
  const measured = width > 0;
  const columns = measured
    ? Math.max(2, Math.min(MAX_COLUMNS, Math.floor(width / CARD_MIN_WIDTH)))
    : 2;
  const cardWidth = measured ? (width - SPACING.sm * (columns - 1)) / columns : 0;
  const sparkWidth = cardWidth - SPACING.md * 2 - FOCUS_BORDER * 2;

  return (
    <View
      style={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      testID="trend-grid"
    >
      {items.map((item) => {
        const focused = focus.find((entry) => entry.valueId === item.valueId);
        const band = priorityBand(item.latest.normalized);
        const color = focused ? seriesColor(focused.slot, mode) : priorityColor(band.id, mode);
        const atCap = !focused && !canFocusMore;
        const rose = item.delta > 0;

        return (
          <Pressable
            key={item.valueId}
            onPress={() => onToggle(item.valueId)}
            disabled={atCap}
            accessibilityRole="checkbox"
            aria-checked={!!focused}
            aria-disabled={atCap}
            accessibilityLabel={item.name}
            testID={`trend-card-${item.key}`}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: focused ? color : colors.border,
              },
              focused ? styles.cardFocused : styles.cardResting,
              // A focused card is one of the overlay chart's lines, so it lifts
              // to say it is doing something the others are not — the coloured
              // border alone put that claim entirely in hue, on the one screen
              // where hue is already spoken for by the series palette.
              elevation(focused ? 2 : 1, mode),
              measured ? { width: cardWidth } : styles.cardUnmeasured,
              atCap && styles.cardDisabled,
              pressed && !atCap && styles.cardPressed,
            ]}
          >
            <View style={styles.nameRow}>
              <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>
                {item.name}
              </Text>
              {!!focused && (
                <MaterialCommunityIcons
                  name={LEGEND_GLYPH[markerShape(focused.slot)]}
                  size={11}
                  color={color}
                />
              )}
            </View>

            <View style={styles.readingRow}>
              <Text style={[styles.level, { color: colors.text }]}>
                {`${Math.round(item.latest.normalized * 100)}%`}
              </Text>
              {item.delta == null ? null : (
                <View style={styles.delta}>
                  {item.delta === 0 ? (
                    <Text style={[styles.deltaLabel, { color: colors.mutedText }]}>
                      {t('history_value_flat')}
                    </Text>
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={rose ? 'arrow-up' : 'arrow-down'}
                        size={13}
                        color={rose ? colors.positive : colors.negative}
                      />
                      {/* The direction is an arrow AND a signed number, so it
                          survives a monochrome or CVD reading. */}
                      <Text
                        style={[
                          styles.deltaLabel,
                          { color: rose ? colors.positive : colors.negative },
                        ]}
                      >
                        {`${Math.round(Math.abs(item.delta) * 100)}%`}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>

            {trend ? (
              <TrendSparkline
                points={item.points}
                axis={axis}
                width={sparkWidth}
                height={SPARK_HEIGHT}
                color={color}
                baselineColor={colors.border}
                surfaceColor={colors.card}
              />
            ) : (
              <View style={[styles.levelTrack, { backgroundColor: colors.track }]}>
                <View
                  style={[
                    styles.levelFill,
                    {
                      backgroundColor: color,
                      // A value at the very bottom of the scale still needs a
                      // visible mark — a zero-width bar reads as missing data
                      // rather than as "this barely matters".
                      width: `${Math.round((0.04 + item.latest.normalized * 0.96) * 100)}%`,
                    },
                  ]}
                />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  cardDisabled: {
    opacity: 0.45,
  },
  cardFocused: {
    borderWidth: FOCUS_BORDER,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardResting: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardUnmeasured: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  delta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 1,
  },
  deltaLabel: {
    fontSize: FONT_SIZE.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  level: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    letterSpacing: LETTER_SPACING.tight,
  },
  levelFill: {
    borderRadius: BORDER_RADIUS.pill,
    height: '100%',
  },
  levelTrack: {
    borderRadius: BORDER_RADIUS.pill,
    height: 8,
    overflow: 'hidden',
  },
  name: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    lineHeight: NAME_LINE_HEIGHT,
  },
  nameRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.xs,
    height: NAME_LINE_HEIGHT * 2,
  },
  readingRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
});

TrendGrid.propTypes = {
  items: PropTypes.array.isRequired,
  axis: PropTypes.func.isRequired,
  focus: PropTypes.array.isRequired,
  onToggle: PropTypes.func.isRequired,
  canFocusMore: PropTypes.bool.isRequired,
  trend: PropTypes.bool.isRequired,
};

export default TrendGrid;
