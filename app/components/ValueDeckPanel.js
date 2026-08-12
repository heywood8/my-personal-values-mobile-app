import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, TextInput, IconButton, Divider } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useValues } from '../contexts/ValuesContext';
import { useDialog } from '../contexts/DialogContext';
import { valueName } from '../utils/valueNames';
import { SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../styles/designTokens';

/**
 * Manage which values get dealt, and add your own.
 *
 * One flat list, in deck order. The panel used to be sectioned by value group;
 * groups are gone, and the deck is the source checklist's flat list again, so the
 * order here is the order the cards arrive in — which is the only ordering a
 * reader can act on when deciding what to archive.
 *
 * Archiving rather than deleting is the default for catalogue entries: a value
 * that was rated in three past calibrations still belongs to those records, and
 * removing it would put a hole in a history chart. Deletion is offered only for
 * custom values, where the alternative — a permanently archived entry the user
 * created by mistake — is worse.
 */
const ValueDeckPanel = ({ onClose }) => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const {
    values, setValueArchived, addCustomValue, deleteCustomValue,
  } = useValues();

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await addCustomValue({ name: trimmed });
      setNewName('');
    } catch (e) {
      showDialog(t('error'), String(e?.message || e), [{ text: t('ok') }]);
    } finally {
      setAdding(false);
    }
  }, [newName, addCustomValue, showDialog, t]);

  const handleDelete = useCallback((value) => {
    showDialog(
      t('deck_delete_confirm_title'),
      t('deck_delete_confirm_message'),
      [
        { text: t('cancel') },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteCustomValue(value.id).catch((e) => {
              console.error('[ValueDeck] Failed to delete a value:', e);
            });
          },
        },
      ],
    );
  }, [showDialog, t, deleteCustomValue]);

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

        <View style={[styles.addBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.addTitle, { color: colors.text }]}>{t('add_custom_value')}</Text>
          <TextInput
            mode="outlined"
            dense
            label={t('custom_value_name')}
            placeholder={t('custom_value_name_placeholder')}
            value={newName}
            onChangeText={setNewName}
            style={styles.input}
            testID="deck-new-name"
          />
          <Button
            mode="contained"
            onPress={handleAdd}
            disabled={!newName.trim() || adding}
            loading={adding}
            style={styles.addButton}
            testID="deck-add"
          >
            {t('custom_value_add')}
          </Button>
        </View>

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

              {value.isCustom && (
                <IconButton
                  icon="trash-can-outline"
                  size={18}
                  iconColor={colors.mutedText}
                  accessibilityLabel={t('deck_delete_value')}
                  onPress={() => handleDelete(value)}
                  testID={`deck-delete-${value.key}`}
                />
              )}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  addBox: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
  },
  addButton: {
    marginTop: SPACING.md,
  },
  addTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
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
  input: {
    marginTop: SPACING.xs,
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
