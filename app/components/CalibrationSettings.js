import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalization, availableLanguages } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import SegmentedToggle from './SegmentedToggle';
import { SCALE_ORDER, SCALES, getScale } from '../utils/scales';
import { languageLabel } from '../utils/languages';
import {
  BORDER_RADIUS, FONT_SIZE, SPACING, LINE_HEIGHT, LETTER_SPACING, elevation,
} from '../styles/designTokens';

/**
 * Language and rating scale, shown on the first card of the deck.
 *
 * These were two full-screen questions in front of the deck — a language picker
 * and a scale picker — which is two screens of setup before anything the app is
 * for, asked when neither answer means much yet. They are the same two settings
 * either way, so they moved here: beside the first value, where the scale is
 * chosen while looking at the buttons it draws, and where doing nothing is a
 * complete answer because both have a working default.
 *
 * Only the first card shows this. Past card one the choice has been made in
 * practice, and the panel would be one more thing to scroll past 46 more times;
 * Settings holds both from then on.
 */
const CalibrationSettings = ({ scale, onScaleChange }) => {
  const { t, language, setLanguage } = useLocalization();
  const { colors, mode } = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
        elevation(1, mode),
      ]}
      testID="calibration-settings"
    >
      <Text style={[styles.label, { color: colors.mutedText }]}>{t('settings_language')}</Text>
      <SegmentedToggle
        testID="calibration-language"
        value={language}
        onChange={setLanguage}
        options={availableLanguages.map((code) => ({
          value: code,
          label: languageLabel(code),
        }))}
      />

      <Text style={[styles.label, styles.labelSpaced, { color: colors.mutedText }]}>
        {t('settings_scale')}
      </Text>
      <SegmentedToggle
        testID="calibration-scale"
        value={scale}
        onChange={onScaleChange}
        options={SCALE_ORDER.map((id) => ({
          value: id,
          label: t(SCALES[id].shortLabelKey),
        }))}
      />
      {/* The hint follows the selection rather than listing all three, which is
          what the scale screen used to do with room it no longer has. */}
      <Text style={[styles.hint, { color: colors.mutedText }]} testID="calibration-scale-hint">
        {t(getScale(scale).hintKey)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    // The same treatment `SectionCard` gives a group's name, because that is
    // what these are — this panel is the settings screen's two cards, shrunk
    // onto the first card of the deck.
    letterSpacing: LETTER_SPACING.wide,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  labelSpaced: {
    marginTop: SPACING.lg,
  },
});

CalibrationSettings.propTypes = {
  scale: PropTypes.string.isRequired,
  onScaleChange: PropTypes.func.isRequired,
};

export default CalibrationSettings;
