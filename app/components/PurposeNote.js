import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Icon } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import {
  SPACING, FONT_SIZE, FONT_WEIGHT, BORDER_RADIUS, LINE_HEIGHT, LETTER_SPACING,
} from '../styles/designTokens';

/**
 * What the answers are for — said on the screens where they are given.
 *
 * Anything that deals cards and draws a wheel out of the replies looks like a
 * test, and a test is expected to come back with something the reader did not
 * put in: a type, a diagnosis, a score to improve. This app has no such reading
 * to offer and is not going to grow one — both lists are records, and the only
 * thing that makes them worth keeping is that there will be another one later to
 * compare them with. Saying so beside the questions is cheaper than letting
 * somebody answer 47 cards for an insight that never arrives.
 *
 * It goes on the two screens where answers are *given* — the deck and today's
 * wheel — and nowhere else. On a results or history screen the same sentence
 * would be arguing with a chart the reader is already reading; here it arrives
 * before the expectation is formed.
 */
const PurposeNote = () => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.selected }]}
      testID="purpose-note"
    >
      <View style={styles.header}>
        <Icon source="information-outline" size={18} color={colors.text} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('purpose_note_title')}
        </Text>
      </View>
      <Text style={[styles.body, { color: colors.text }]}>
        {t('purpose_note')}
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
    marginTop: SPACING.md,
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

export default PurposeNote;
