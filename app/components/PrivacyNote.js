import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, Icon } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import {
  SPACING, FONT_SIZE, FONT_WEIGHT, BORDER_RADIUS, LINE_HEIGHT, LETTER_SPACING,
} from '../styles/designTokens';

/**
 * Where the data lives — on web, and only there.
 *
 * A page served from a URL looks like every other web app that keeps your data
 * on someone's server, and this one does not: the whole database is SQLite in
 * the browser (see the note in services/db.js). Nobody assumes a server behind a
 * phone app, so on native this renders nothing rather than restating the
 * obvious.
 *
 * The platform check lives here rather than at the call site so that the "not on
 * native" half of the rule is a property of the component, testable without
 * standing up the screen that hosts it.
 */
const PrivacyNote = () => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();

  if (Platform.OS !== 'web') return null;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.selected }]}
      testID="privacy-note"
    >
      <View style={styles.header}>
        <Icon source="shield-lock-outline" size={18} color={colors.text} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('privacy_local_only_title')}
        </Text>
      </View>
      <Text style={[styles.body, { color: colors.text }]}>
        {t('privacy_local_only')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
  },
  container: {
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: LETTER_SPACING.snug,
  },
});

export default PrivacyNote;
