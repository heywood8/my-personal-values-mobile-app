import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, IconButton, Divider } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useValues } from '../contexts/ValuesContext';
import { valueName } from '../utils/valueNames';
import { SPACING, FONT_SIZE, CONTENT_MAX_WIDTH } from '../styles/designTokens';

/**
 * Manage which values get dealt.
 *
 * One flat list, in deck order. The panel used to be sectioned by value group;
 * groups are gone, and the deck is the source checklist's flat list again, so the
 * order here is the order the cards arrive in — which is the only ordering a
 * reader can act on when deciding what to archive.
 *
 * Archiving, and nothing else. The deck is the shipped catalogue: a reader can
 * decide a value is not theirs and stop being dealt it, but there is no adding,
 * renaming or deleting one — the instrument is somebody else's list of 47 and an
 * app that let it be edited would be measuring something different on every
 * phone. Archiving is not deletion either: a value rated in three past
 * calibrations still belongs to those records, and removing it would put a hole
 * in a history chart.
 */
const ValueDeckPanel = ({ onClose }) => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const { values, setValueArchived } = useValues();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="value-deck-panel"
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" onPress={onClose} testID="deck-close" />
          <Text style={[styles.title, { color: colors.text }]}>{t('values_deck_title')}</Text>
        </View>
        <Text style={[styles.hint, { color: colors.mutedText }]}>{t('values_deck_hint')}</Text>

        <View style={styles.section}>
          <Divider />
          {values.map((value) => (
            <View key={value.id} style={styles.row} testID={`deck-value-${value.key}`}>
              <View style={styles.rowText}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.rowName,
                    { color: value.archived ? colors.mutedText : colors.text },
                  ]}
                >
                  {valueName(value, t)}
                </Text>
                {value.archived && (
                  <Text style={[styles.badge, { color: colors.mutedText }]}>
                    {t('deck_archived_badge')}
                  </Text>
                )}
              </View>

              <Button
                compact
                onPress={() => setValueArchived(value.id, !value.archived)}
                testID={`deck-toggle-${value.key}`}
              >
                {value.archived ? t('deck_restore') : t('deck_archive')}
              </Button>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  badge: {
    fontSize: FONT_SIZE.xs,
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  rowName: {
    fontSize: FONT_SIZE.md,
  },
  rowText: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
  },
});

ValueDeckPanel.propTypes = {
  onClose: PropTypes.func.isRequired,
};

export default ValueDeckPanel;
