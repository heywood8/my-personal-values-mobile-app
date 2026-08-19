import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import {
  SPACING, FONT_SIZE, LINE_HEIGHT, LETTER_SPACING, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/**
 * A screen's own name, and the one line of fact that qualifies it.
 *
 * Every tab screen used to open straight onto its content — the ranked list
 * began at a 12px grey line reading "Calibrated 19 Aug 2026 · 47 values", the
 * wheel began at its own meta line — which left the four screens with no top and
 * nothing to tell them apart at a glance except what happened to be drawn on
 * them. The tab bar named the screen you were on; the screen itself never did.
 *
 * So: one hero-sized title, and under it whatever the screen already had to say
 * about its own state. The title reuses the tab's own string rather than
 * introducing a second name for the same place — a screen called one thing in the
 * tab bar and another at the top is two screens as far as the reader is
 * concerned.
 *
 * `meta` stays a separate slot rather than being folded into the title because
 * it is the one part that changes: it is a date, a count, a coverage figure. The
 * title is fixed and the line under it is live, and keeping them apart is what
 * lets the eye skip the half that never changes.
 */
const ScreenHeader = ({ title, meta, children, testID }) => {
  const { colors } = useThemeColors();

  return (
    <View style={styles.container} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        {title}
      </Text>
      {!!meta && (
        <Text style={[styles.meta, { color: colors.mutedText }]}>{meta}</Text>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  meta: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '700',
    // Display sizes set loose at their default tracking and default leading;
    // both are pulled in so the title reads as one object rather than as a row
    // of large words.
    letterSpacing: LETTER_SPACING.tight,
    lineHeight: FONT_SIZE.hero * LINE_HEIGHT.tight,
  },
});

ScreenHeader.propTypes = {
  title: PropTypes.string.isRequired,
  // The live half: a date, a count, a coverage figure. Optional, because a
  // screen with nothing recorded yet has no fact to state.
  meta: PropTypes.string,
  children: PropTypes.node,
  testID: PropTypes.string,
};

export default ScreenHeader;
