import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, TextInput } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useCsvTransfer } from '../hooks/useCsvTransfer';
import { SPACING, FONT_SIZE } from '../styles/designTokens';

/**
 * Export and import, in the settings screen's data section.
 *
 * Import has two doors because the platforms do. The web has a real file dialog
 * and gets one; a phone has none without a native picker, so the file the share
 * sheet sent somewhere can be pasted back in as text. The paste box is offered on
 * both — it is also how someone imports a file a mail client will only show them
 * the contents of.
 */
const CsvTransferPanel = () => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const {
    busy, canPickFile, exportCsv, importFile, importText,
  } = useCsvTransfer();

  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const handlePasteImport = useCallback(async () => {
    const text = pasted;
    setPasted('');
    await importText(text);
  }, [pasted, importText]);

  return (
    <View testID="csv-transfer">
      <Text style={[styles.hint, { color: colors.mutedText }]}>{t('csv_hint')}</Text>

      <Button
        mode="outlined"
        icon="file-download-outline"
        onPress={exportCsv}
        disabled={busy}
        style={styles.action}
        testID="csv-export"
      >
        {t('csv_export')}
      </Button>

      <Button
        mode="outlined"
        icon="file-upload-outline"
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        disabled={busy}
        style={styles.action}
        testID="csv-import-open"
      >
        {t('csv_import')}
      </Button>

      {open && (
        <View style={styles.importBox} testID="csv-import-box">
          {canPickFile && (
            <Button
              mode="contained-tonal"
              onPress={importFile}
              disabled={busy}
              style={styles.action}
              testID="csv-import-file"
            >
              {t('csv_choose_file')}
            </Button>
          )}

          <Text style={[styles.hint, { color: colors.mutedText }]}>{t('csv_paste_hint')}</Text>
          <TextInput
            mode="outlined"
            dense
            multiline
            numberOfLines={4}
            label={t('csv_paste_label')}
            value={pasted}
            onChangeText={setPasted}
            style={styles.input}
            testID="csv-paste-input"
          />
          <Button
            mode="contained"
            onPress={handlePasteImport}
            disabled={busy || !pasted.trim()}
            loading={busy}
            style={styles.action}
            testID="csv-paste-import"
          >
            {t('csv_import_action')}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  action: {
    marginTop: SPACING.md,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
  importBox: {
    marginTop: SPACING.sm,
  },
  input: {
    marginTop: SPACING.xs,
  },
});

export default CsvTransferPanel;
