import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import {
  SPACING, FONT_SIZE, CONTENT_MAX_WIDTH, BORDER_RADIUS, LINE_HEIGHT, LETTER_SPACING,
  elevation,
} from '../styles/designTokens';

/**
 * The "there is nothing here yet" panel. Every empty state in the app is one of
 * these, so "nothing calibrated" and "only one calibration" read as the same kind
 * of moment rather than as two different screens.
 */
const EmptyState = ({ icon, title, body, actionLabel, onAction, testID }) => {
  const { colors, mode } = useThemeColors();

  return (
    <View style={styles.container} testID={testID}>
      {/* The glyph sits in a tinted disc rather than floating grey on the
          background. An empty screen is mostly negative space, so the one mark
          on it has to be composed enough to be the thing the eye lands on —
          otherwise the page reads as failed to load rather than as not started
          yet. */}
      {!!icon && (
        <View
          style={[
            styles.medallion,
            { backgroundColor: colors.selected },
            elevation(1, mode),
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={40}
            color={colors.primary}
          />
        </View>
      )}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {!!body && <Text style={[styles.body, { color: colors.mutedText }]}>{body}</Text>}
      {!!actionLabel && !!onAction && (
        <Button
          mode="contained"
          onPress={onAction}
          style={styles.action}
          testID={testID ? `${testID}-action` : undefined}
        >
          {actionLabel}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  action: {
    marginTop: SPACING.xxl,
  },
  body: {
    fontSize: FONT_SIZE.base,
    lineHeight: FONT_SIZE.base * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
    // Narrower than the content column. A centred paragraph run to full width
    // gives the eye no reliable place to start the next line.
    maxWidth: Math.round(CONTENT_MAX_WIDTH * 0.75),
    textAlign: 'center',
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  medallion: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 84,
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    width: 84,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    letterSpacing: LETTER_SPACING.tight,
    lineHeight: FONT_SIZE.xxl * LINE_HEIGHT.heading,
    textAlign: 'center',
  },
});

EmptyState.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string.isRequired,
  body: PropTypes.string,
  actionLabel: PropTypes.string,
  onAction: PropTypes.func,
  testID: PropTypes.string,
};

export default EmptyState;
