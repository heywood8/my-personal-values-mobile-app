import React, { memo, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { priorityColor } from '../../styles/chartPalette';
import { priorityBand, getScale, scaleStepLabel, scoreFraction } from '../../utils/scales';
import { valueName, valueDescription } from '../../utils/valueNames';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, HEIGHTS, LINE_HEIGHT, LETTER_SPACING,
} from '../../styles/designTokens';

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
 *
 * The name column is held to the same discipline for the same reason, and what
 * gives instead is the row's height: a name too long for the column wraps and
 * the row grows around it. Widening the column per row, or per language, would
 * move the baseline the bars are read against; clipping the name — which is
 * what a fixed row height amounts to — loses the one thing a ranking is a list
 * of.
 *
 * Below `STACKED_BELOW` the name stops sharing a line with the bar at all. A
 * name column is a fraction of the width, and a fraction of a phone is not
 * enough for "Поддержка / поощрение / подбадривание" *and* a track long enough
 * to read a magnitude off: side by side, a 320px screen left the bars 58px to
 * say everything in. Stacked, the name gets the full width and every track gets
 * the same full width under it — the shared baseline is not weakened by the
 * switch, it is longer.
 */

/**
 * How many lines a value's name may take before it is ellipsised.
 *
 * One was not enough. Names run from "Любовь" to "Поддержка / поощрение /
 * подбадривание", and the name never has the whole width to itself, so a single
 * line clipped a good part of the Russian deck to "Поддержка / поощ…" — a
 * ranking is a list of names, and a truncated name is not one. Two lines print
 * every catalogue entry whole in both languages, in either layout, and the row
 * grows only on the rows that need the second one.
 *
 * It stays a cap rather than becoming no limit at all, because a legacy custom
 * value carries whatever text was once typed into it, and one such row must not
 * push the rest of the chart off the screen.
 */
const NAME_LINES = 2;

/**
 * The width, in points, under which a row stacks its name above its bar.
 *
 * Measured against the chart's own width rather than the window's: this
 * component is rendered inside a card on two different screens, and what
 * decides whether a name and a bar can share a line is the space the chart
 * actually got.
 */
const STACKED_BELOW = 440;

const RankedBar = memo(({ item, scaleId, scoreWidth, stacked }) => {
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
        aria-expanded={!!description && revealed}
        style={({ pressed, hovered }) => [
          styles.row,
          stacked && styles.rowStacked,
          // The row is the hit area for the description, so it has to say so
          // when pointed at. It says it in the gutter around the bar rather
          // than behind it: a tint under a track and a fill would change what
          // both colours are being read against, which on the one surface the
          // chart palette was validated for is not a free thing to do.
          (pressed || hovered) && !!description && { backgroundColor: colors.selected },
        ]}
      >
        <View style={stacked ? styles.labelFull : styles.labelColumn}>
          <Text
            numberOfLines={NAME_LINES}
            style={[styles.valueName, { color: colors.text }]}
          >
            {valueName(item, t)}
          </Text>
        </View>

        {/* Track and score stay on one line in both layouts: the word is the
            bar's own label, and a score that wrapped away from the fill it
            names would have to be read back up to it. */}
        <View style={stacked ? styles.barLine : [styles.barLine, styles.barLineWide]}>
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
        </View>
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
  stacked: PropTypes.bool,
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

  // Which layout the rows use, from the width the chart was actually given.
  // Zero until the first layout lands — and the wide layout is what that
  // renders, because it is the one a chart wide enough to measure will keep,
  // and a phone shows one frame of it rather than a frame of nothing.
  const [width, setWidth] = useState(0);
  const measureChart = useCallback((event) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === measured ? current : measured));
  }, []);
  const stacked = width > 0 && width < STACKED_BELOW;

  return (
    <View testID="ranked-value-bars" onLayout={measureChart}>
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
          stacked={stacked}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  barLine: {
    // The bar and its word are one thing in both layouts, so they travel
    // together: a score that wrapped away from the fill it names would have to
    // be read back up to it.
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  barLineWide: {
    // Side by side with the name, the bar is what is left of the row once the
    // name column has taken its share.
    flex: 1,
  },
  description: {
    borderRadius: BORDER_RADIUS.md,
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  fill: {
    // Rounded at the data end, square at the baseline, so the bar reads as
    // growing from the axis rather than as a floating pill.
    borderBottomRightRadius: BORDER_RADIUS.pill,
    borderTopRightRadius: BORDER_RADIUS.pill,
    height: '100%',
  },
  labelColumn: {
    justifyContent: 'center',
    // The share of a wide row the name takes before the bar starts. Enough for
    // "Respect and self-respect" on one line and for the longer Russian entries
    // on two, and the tracks give up the same 42 points on every row — so the
    // shared baseline the chart is read against is untouched.
    width: '42%',
  },
  labelFull: {
    justifyContent: 'center',
    // Stacked, the name has the row to itself — no width to share and none to
    // reserve.
    width: '100%',
  },
  row: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.sm,
    // A floor rather than a height: a name that needs a second line takes one,
    // and the row grows around it instead of clipping it (see NAME_LINES).
    minHeight: HEIGHTS.rankedBar,
    paddingHorizontal: SPACING.xs,
    // A 2px gap between neighbouring bars, as surface rather than as a border,
    // so adjacent fills never touch and merge into one shape.
    paddingVertical: 2,
  },
  rowStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
    // Two points inside a row, eight between rows: with the bars no longer in a
    // column of their own, proximity is the only thing saying which name the
    // bar under it belongs to.
    gap: 2,
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
  },
  score: {
    // The measured width is a floor as well as a width: a `Text` is a flex item
    // that would otherwise give its own column back to a row under pressure,
    // and a score column that shrank would print "Very impor…" beside a bar
    // whose length it is supposed to be naming.
    flexShrink: 0,
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
    borderRadius: BORDER_RADIUS.pill,
    flex: 1,
    height: 12,
    overflow: 'hidden',
  },
  valueName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    letterSpacing: LETTER_SPACING.snug,
    // Tight, because a wrapped name is one label rather than a paragraph: the
    // two lines have to read as belonging to the row they sit in and not to
    // the rows above and below it.
    lineHeight: FONT_SIZE.md * LINE_HEIGHT.tight,
  },
});

RankedValueBars.propTypes = {
  items: PropTypes.array.isRequired,
  scaleId: PropTypes.string.isRequired,
};

export default RankedValueBars;
