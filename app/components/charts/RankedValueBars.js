import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { priorityColor } from '../../styles/chartPalette';
import { priorityBand, getScale, scaleStepLabel } from '../../utils/scales';
import { valueName, groupName } from '../../utils/valueNames';
import { SPACING, FONT_SIZE, BORDER_RADIUS, HEIGHTS } from '../../styles/designTokens';

/**
 * The ranked list of every rated value, as horizontal bars.
 *
 * The job here is magnitude — where each value sits relative to the others — so
 * the bars take a SINGLE hue stepped by priority band rather than one hue per
 * group. Forty-eight categorical colours would be unreadable, and would also be
 * answering a question ("which group?") the reader is not asking on this screen;
 * group is carried by the small text label under the name instead.
 *
 * Each bar is directly labelled with its score, so the encoding never rests on
 * colour alone.
 */
const RankedBar = memo(({ item, scaleId, maxWidthFraction }) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();

  const band = priorityBand(item.normalized);
  const fill = priorityColor(band.id, mode);
  // A value at the very bottom of the scale still needs a visible mark — a
  // zero-width bar reads as missing data rather than as "this barely matters".
  const fraction = 0.04 + item.normalized * 0.96;

  return (
    <View style={styles.row} testID={`ranked-bar-${item.key}`}>
      <View style={styles.labelColumn}>
        <Text
          numberOfLines={1}
          style={[styles.valueName, { color: colors.text }]}
        >
          {valueName(item, t)}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.groupLabel, { color: colors.mutedText }]}
        >
          {groupName(item.groupKey, t)}
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
  fill: {
    // Rounded at the data end, square at the baseline, so the bar reads as
    // growing from the axis rather than as a floating pill.
    borderBottomRightRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
    height: '100%',
  },
  groupLabel: {
    fontSize: FONT_SIZE.xs,
    marginTop: 1,
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
