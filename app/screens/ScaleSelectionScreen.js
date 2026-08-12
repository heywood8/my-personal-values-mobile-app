import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SCALE_ORDER, SCALES, scaleStepLabel } from '../utils/scales';
import {
  BORDER_RADIUS, FONT_SIZE, SPACING, TOP_CONTENT_SPACING, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/**
 * First run, step two: how the reader wants to rate.
 *
 * Each option previews its own steps, because "1 to 10" and "three words" are
 * decisions about how much deliberation each of 74 cards will cost, and that is
 * much easier to judge from seeing the buttons than from reading the name.
 */
const ScaleSelectionScreen = ({ initialScale, onScaleSelected, onBack }) => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const [selected, setSelected] = useState(initialScale || null);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        testID="scale-selection"
      >
        <View style={styles.inner}>
          <Text style={[styles.title, { color: colors.text }]}>{t('scale_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>{t('scale_subtitle')}</Text>

          {SCALE_ORDER.map((scaleId) => {
            const scale = SCALES[scaleId];
            const isSelected = selected === scaleId;

            return (
              <Pressable
                key={scaleId}
                onPress={() => setSelected(scaleId)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t(scale.labelKey)}
                testID={`scale-option-${scaleId}`}
                style={[
                  styles.option,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {t(scale.labelKey)}
                </Text>
                <Text style={[styles.optionHint, { color: colors.mutedText }]}>
                  {t(scale.hintKey)}
                </Text>

                <View style={styles.preview}>
                  {scale.steps.map((step) => (
                    <View
                      key={step}
                      style={[
                        styles.previewChip,
                        {
                          backgroundColor: isSelected ? colors.selected : colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.previewLabel, { color: colors.mutedText }]}
                      >
                        {scaleStepLabel(scaleId, step, t)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {!!onBack && (
          <Button onPress={onBack} testID="scale-back">
            {t('back')}
          </Button>
        )}
        <Button
          mode="contained"
          disabled={!selected}
          onPress={() => onScaleSelected(selected)}
          style={styles.continueButton}
          testID="scale-continue"
        >
          {t('continue')}
        </Button>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    paddingTop: TOP_CONTENT_SPACING,
  },
  continueButton: {
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  option: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
  },
  optionHint: {
    fontSize: FONT_SIZE.md,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  optionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  preview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  previewChip: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  previewLabel: {
    fontSize: FONT_SIZE.sm,
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
    marginBottom: SPACING.xxl,
    marginTop: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
  },
});

ScaleSelectionScreen.propTypes = {
  initialScale: PropTypes.string,
  onScaleSelected: PropTypes.func.isRequired,
  onBack: PropTypes.func,
};

export default ScaleSelectionScreen;
