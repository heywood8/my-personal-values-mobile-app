import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING, FONT_SIZE, CONTENT_MAX_WIDTH } from '../styles/designTokens';

/**
 * The "there is nothing here yet" panel. Every empty state in the app is one of
 * these, so "nothing calibrated" and "only one calibration" read as the same kind
 * of moment rather than as two different screens.
 */
const EmptyState = ({ icon, title, body, actionLabel, onAction, testID }) => {
  const { colors } = useThemeColors();

  return (
    <View style={styles.container} testID={testID}>
      {!!icon && (
        <MaterialCommunityIcons
          name={icon}
          size={56}
          color={colors.mutedText}
          style={styles.icon}
        />
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
    marginTop: SPACING.xl,
  },
  body: {
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
    marginTop: SPACING.sm,
    maxWidth: CONTENT_MAX_WIDTH,
    textAlign: 'center',
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  icon: {
    marginBottom: SPACING.lg,
    opacity: 0.7,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
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
