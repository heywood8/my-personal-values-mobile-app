import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '../styles/designTokens';

/**
 * A two-or-three-way switch: results view, sort direction, theme.
 *
 * Paper's SegmentedButtons would do, but it sizes its own touch targets from the
 * label and truncates hard in Russian, where "Второстепенные" is three times the
 * length of the English. This lays the options out evenly and lets them wrap.
 */
const SegmentedToggle = ({ options, value, onChange, testID }) => {
  const { colors } = useThemeColors();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.secondary }]}
      testID={testID}
      accessibilityRole="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.surface },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: selected ? colors.text : colors.mutedText },
                selected && styles.labelSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    padding: 3,
  },
  label: {
    fontSize: FONT_SIZE.md,
  },
  labelSelected: {
    fontWeight: '600',
  },
  segment: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm + 2,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
});

SegmentedToggle.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  })).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  testID: PropTypes.string,
};

export default SegmentedToggle;
