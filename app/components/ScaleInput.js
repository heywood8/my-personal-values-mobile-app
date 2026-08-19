import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { getScale, scaleStepLabel } from '../utils/scales';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, HEIGHTS, LETTER_SPACING, elevation,
} from '../styles/designTokens';

/**
 * The row of buttons a value is rated with.
 *
 * One component for all three scales, because they differ only in how many steps
 * there are and whether a step is labelled with a number or a word. The layout
 * switches at that boundary: numbers sit in a single row (ten 1-to-10 buttons
 * still fit across a narrow phone at 28px each), words stack, because
 * "Очень важно" does not fit anywhere in a row of three.
 *
 * The stacked scale is dealt strongest-first: "very important" at the top,
 * "not important" at the bottom. It reads the same way down the column as the
 * results list does — the top of anything in this app is what matters most — and
 * a column ordered the other way had the strongest answer sitting furthest from
 * the value it is about. The numeric scales stay in their own natural order, 1 on
 * the left: a row of "10 9 8 …" is a scale printed backwards, not a scale
 * re-ordered.
 */
const ScaleInput = ({ scaleId, value, onChange, disabled, testIDPrefix = 'scale' }) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();
  const scale = getScale(scaleId);
  const isWordScale = !!scale.stepLabelKeys;
  const steps = isWordScale ? [...scale.steps].reverse() : scale.steps;

  return (
    <View
      style={[styles.container, isWordScale ? styles.stacked : styles.row]}
      testID={`${testIDPrefix}-input`}
      accessibilityRole="radiogroup"
    >
      {steps.map((step) => {
        const selected = value === step;
        const label = scaleStepLabel(scaleId, step, t);

        return (
          <Pressable
            key={step}
            disabled={disabled}
            onPress={() => onChange(step)}
            accessibilityRole="radio"
            // See SegmentedToggle: `accessibilityState` reaches no DOM on
            // react-native-web, and `role="radio"` requires `aria-checked`.
            aria-checked={selected}
            aria-disabled={!!disabled}
            accessibilityLabel={label}
            testID={`${testIDPrefix}-step-${step}`}
            style={({ pressed }) => [
              styles.step,
              isWordScale ? styles.stepWide : styles.stepNarrow,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.inputBorder,
              },
              // The chosen step lifts off the row. On a deck answered by thumb
              // the answer already given has to be findable at a glance, and
              // fill alone put it on the same plane as the four it beat.
              selected ? elevation(2, mode) : elevation(1, mode),
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.stepLabel,
                isWordScale ? styles.stepLabelWord : styles.stepLabelNumber,
                { color: selected ? colors.onPrimary : colors.text },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stacked: {
    flexDirection: 'column',
  },
  step: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: HEIGHTS.scaleStep,
  },
  stepLabel: {
    fontWeight: '600',
    letterSpacing: LETTER_SPACING.snug,
  },
  stepLabelNumber: {
    fontSize: FONT_SIZE.base,
  },
  stepLabelWord: {
    fontSize: FONT_SIZE.base,
  },
  stepNarrow: {
    // Shrinks to fit ten across a narrow screen, but never below Android's
    // touch-target floor in the cross axis (minHeight above).
    flex: 1,
    minWidth: 0,
  },
  stepWide: {
    paddingHorizontal: SPACING.lg,
    width: '100%',
  },
});

ScaleInput.propTypes = {
  scaleId: PropTypes.string.isRequired,
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  // Every testID this renders is built from this prefix, defaulted to what the
  // deck's single instance has always been called. The alignment screen renders
  // one of these per row, and a dozen buttons all answering to `scale-step-7`
  // makes every query for one ambiguous — RNTL throws on a duplicate testID
  // rather than picking the first, so it fails loudly and unhelpfully.
  testIDPrefix: PropTypes.string,
};

export default ScaleInput;
