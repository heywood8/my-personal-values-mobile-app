import React, { memo, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { priorityColor } from '../../styles/chartPalette';
import { priorityBand, getScale, scaleStepLabel } from '../../utils/scales';
import { valueName, valueDescription } from '../../utils/valueNames';
import { SPACING, FONT_SIZE, BORDER_RADIUS, HEIGHTS } from '../../styles/designTokens';

/**
 * The ranked list of every rated value, as horizontal bars.
 *
 * The job here is magnitude — where each value sits relative to the others — so
 * the bars take a SINGLE hue stepped by priority band. Forty-eight categorical
 * colours would be unreadable, and the reader is asking "how high", not "which
 * kind".
 *
 * Each bar is directly labelled with its score, so the encoding never rests on
 * colour alone.
 *
 * A row also carries the value's description — the same wording the card was
 * rated on. It is revealed rather than printed, because 47 descriptions at once
 * is a wall of text and the ranking is the thing being read: hovering a row shows
 * it on the web, and tapping shows it everywhere (there is no hover on a phone).
 * Custom values have no description to show, so their rows stay inert.
 */
const RankedBar = memo(({ item, scaleId, maxWidthFraction }) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();
  const [revealed, setRevealed] = useState(false);

  const description = valueDescription(item, t);
  const band = priorityBand(item.normalized);
  const fill = priorityColor(band.id, mode);
  // A value at the very bottom of the scale still needs a visible mark — a
  // zero-width bar reads as missing data rather than as "this barely matters".
  const fraction = 0.04 + item.normalized * 0.96;

  const reveal = useCallback(() => setRevealed(true), []);
  const hide = useCallback(() => setRevealed(false), []);
  const toggle = useCallback(() => setRevealed((open) => !open), []);

  return (
    <View testID={`ranked-row-${item.key}`}>
      <Pressable
        testID={`ranked-bar-${item.key}`}
        disabled={!description}
        onHoverIn={reveal}
        onHoverOut={hide}
        onPress={toggle}
        accessibilityRole={description ? 'button' : 'text'}
        accessibilityLabel={valueName(item, t)}
        accessibilityHint={description || undefined}
        accessibilityState={{ expanded: !!description && revealed }}
        style={styles.row}
      >
        <View style={styles.labelColumn}>
          <Text
            numberOfLines={1}
            style={[styles.valueName, { color: colors.text }]}
          >
            {valueName(item, t)}
          </Text>
        </View>

        <View style={[styles.track, { backgroundColor: colors.track }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: fill,
                width: `${Math.round(fraction * maxWidthFraction * 100)}%`,
              },
            ]}
          />
        </View>

        <Text style={[styles.score, { color: colors.mutedText }]} numberOfLines={1}>
          {scaleStepLabel(scaleId, item.score, t)}
        </Text>
      </Pressable>

      {!!description && revealed && (
        <Text
          testID={`ranked-description-${item.key}`}
          style={[
            styles.description,
            { backgroundColor: colors.selected, color: colors.mutedText },
          ]}
        >
          {description}
        </Text>
      )}
    </View>
  );
});

RankedBar.displayName = 'RankedBar';

RankedBar.propTypes = {
  item: PropTypes.object.isRequired,
  scaleId: PropTypes.string.isRequired,
  maxWidthFraction: PropTypes.number.isRequired,
};

const RankedValueBars = ({ items, scaleId }) => {
  const scale = getScale(scaleId);
  // The qualitative scale's widest label ("Very important") needs far more room
  // than "10", so the bars give some width back rather than letting the number
  // column wrap.
  const maxWidthFraction = scale.stepLabelKeys ? 0.82 : 1;

  return (
    <View testID="ranked-value-bars">
      {items.map((item) => (
        <RankedBar
          key={item.valueId}
          item={item}
          scaleId={scaleId}
          maxWidthFraction={maxWidthFraction}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  description: {
    borderRadius: BORDER_RADIUS.sm,
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
    padding: SPACING.sm,
  },
  fill: {
    // Rounded at the data end, square at the baseline, so the bar reads as
    // growing from the axis rather than as a floating pill.
    borderBottomRightRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
    height: '100%',
  },
  labelColumn: {
    justifyContent: 'center',
    width: '38%',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    // A 2px gap between neighbouring bars, as surface rather than as a border,
    // so adjacent fills never touch and merge into one shape.
    height: HEIGHTS.rankedBar,
    paddingVertical: 2,
  },
  score: {
    fontSize: FONT_SIZE.sm,
    minWidth: 26,
    textAlign: 'right',
  },
  track: {
    borderRadius: BORDER_RADIUS.sm,
    flex: 1,
    height: 14,
    overflow: 'hidden',
  },
  valueName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
});

RankedValueBars.propTypes = {
  items: PropTypes.array.isRequired,
  scaleId: PropTypes.string.isRequired,
};

export default RankedValueBars;
