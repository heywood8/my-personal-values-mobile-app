import React, { memo, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { priorityColor } from '../../styles/chartPalette';
import { priorityBand, getScale, scaleStepLabel, scoreFraction } from '../../utils/scales';
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
 *
 * Every track is the same length, which is the whole point of a bar chart: a
 * reader compares the fills against a shared baseline at both ends. The score
 * column is therefore held at a fixed width (see `RankedValueBars`) rather than
 * sized to whatever word each row happens to print.
 */
const RankedBar = memo(({ item, scaleId, scoreWidth }) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();
  const [revealed, setRevealed] = useState(false);

  const description = valueDescription(item, t);
  const band = priorityBand(item.normalized);
  const fill = priorityColor(band.id, mode);
  // Squeezed away from zero, because a value on the bottom step still needs a
  // visible mark. The rule itself lives in utils/scales.js, beside the wheel's
  // deliberately different one.
  const fraction = scoreFraction(item.normalized);

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
                width: `${Math.round(fraction * 100)}%`,
              },
            ]}
          />
        </View>

        <Text
          style={[
            styles.score,
            scoreWidth ? { width: scoreWidth } : null,
            { color: colors.mutedText },
          ]}
          numberOfLines={1}
        >
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
  scoreWidth: PropTypes.number,
};

const RankedValueBars = ({ items, scaleId }) => {
  const { t } = useLocalization();
  const scale = getScale(scaleId);

  // The score column is as wide as the widest label the scale can print, and
  // every row uses that one width — so the tracks are identical and the labels
  // start at the same x. Letting each row size its own column made the bars
  // disagree about how long "full" is: a row reading "Very important" squeezed
  // its track while "Important" gave the width back, which looks like a
  // difference in score rather than a difference in word length.
  //
  // Measured rather than guessed at, because the widest label depends on the
  // language and the reader's font scale. The sizer below prints every step
  // label off-screen and reports what the longest one needs.
  const stepLabels = useMemo(
    () => scale.steps.map((step) => scaleStepLabel(scale.id, step, t)),
    [scale, t],
  );
  const [scoreWidth, setScoreWidth] = useState(0);
  const measure = useCallback((event) => {
    // Ceil, not round: half a pixel short clips the last glyph on the web.
    const width = Math.ceil(event.nativeEvent.layout.width);
    setScoreWidth((current) => (current === width ? current : width));
  }, []);

  return (
    <View testID="ranked-value-bars">
      <View
        testID="ranked-score-sizer"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={measure}
        pointerEvents="none"
        style={styles.scoreSizer}
      >
        {stepLabels.map((label) => (
          <Text key={label} style={styles.score}>
            {label}
          </Text>
        ))}
      </View>

      {items.map((item) => (
        <RankedBar
          key={item.valueId}
          item={item}
          scaleId={scaleId}
          scoreWidth={scoreWidth}
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
    // Left, so every label starts at the same x just past the end of the tracks.
    // Right-aligning pushed the short words away from the bar they belong to.
    textAlign: 'left',
  },
  scoreSizer: {
    // Out of flow and invisible: it exists only to be measured, and must not
    // take a row's worth of height or catch a press meant for the bar under it.
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0,
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
