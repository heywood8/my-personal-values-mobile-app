import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, LINE_HEIGHT, LETTER_SPACING, elevation,
} from '../styles/designTokens';

/**
 * One group of related controls, on a surface of its own.
 *
 * The settings screen used to be a single column of controls separated by
 * hairline dividers, which is a way of saying "these belong together" that
 * depends entirely on the reader noticing where a 1px line is. Grouping them onto
 * cards says it with the strongest signal a layout has — enclosure — and it is
 * the reason the dividers are gone rather than joined by boxes.
 *
 * The title is part of the card rather than a `List.Subheader` floating above it,
 * for the same reason: a heading outside the thing it heads is a heading only by
 * proximity, and proximity is the first thing a font-size change breaks.
 *
 * `footnote` is the small print that qualifies the controls — "applies to your
 * next calibration", "records already taken keep their own scale". It sits
 * *inside* the card because it is about these controls and not about the ones
 * below, which is exactly what the old free-floating version could not say.
 */
const SectionCard = ({ title, footnote, children, style, testID }) => {
  const { colors, mode } = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        elevation(1, mode),
        style,
      ]}
      testID={testID}
    >
      {!!title && (
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.mutedText }]}
        >
          {title}
        </Text>
      )}
      {children}
      {!!footnote && (
        <Text style={[styles.footnote, { color: colors.mutedText }]}>{footnote}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.lg,
  },
  footnote: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    // The one place tracking is opened up rather than closed: a small label in
    // caps-ish weight needs the air to stop reading as a compressed word.
    letterSpacing: LETTER_SPACING.wide,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
});

SectionCard.propTypes = {
  title: PropTypes.string,
  footnote: PropTypes.string,
  children: PropTypes.node,
  style: PropTypes.any,
  testID: PropTypes.string,
};

export default SectionCard;
