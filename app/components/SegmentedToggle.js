import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, LINE_HEIGHT, elevation,
} from '../styles/designTokens';

/**
 * A two-or-three-way switch: results view, sort direction, theme.
 *
 * Paper's SegmentedButtons would do, but it sizes its own touch targets from the
 * label and truncates hard in Russian, where "Второстепенные" is three times the
 * length of the English. This lays the options out evenly and lets them wrap.
 */
const SegmentedToggle = ({ options, value, onChange, testID }) => {
  const { colors, mode } = useThemeColors();

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
            // `aria-checked`, not `accessibilityState`: react-native-web 0.21
            // reads the `aria-*` props and ignores `accessibilityState`
            // entirely, so the state never reached the DOM — and `role="radio"`
            // *requires* `aria-checked`, which made it an axe failure rather
            // than a quiet omission. React Native folds the same prop back into
            // `accessibilityState` for native assistive tech, so this is one
            // source for both platforms.
            aria-checked={selected}
            accessibilityLabel={option.label}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: colors.surface },
              selected && elevation(1, mode),
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text
              // Two lines, not one. The comment above is about letting a long
              // option wrap, and clamping at one line quietly turned that into
              // truncation instead: on the settings screen the qualitative scale
              // printed as "Words, not nu…", which is a label that has stopped
              // naming anything.
              numberOfLines={2}
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
    // A pill inside a pill. The old square-ish pair read as a table of cells;
    // this reads as one control with a thumb in it, which is what it is.
    borderRadius: BORDER_RADIUS.pill,
    flexDirection: 'row',
    padding: 4,
  },
  label: {
    fontSize: FONT_SIZE.md,
    lineHeight: FONT_SIZE.md * LINE_HEIGHT.heading,
    textAlign: 'center',
  },
  labelSelected: {
    fontWeight: '600',
  },
  segment: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  segmentPressed: {
    opacity: 0.55,
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
