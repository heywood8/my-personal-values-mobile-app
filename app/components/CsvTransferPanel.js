import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
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
 *
 * Two sections, because there are two files: the ranking and the alignment
 * check-ins (see app/services/AlignmentCsv.js for why they are not one). They
 * behave identically, so the section below is written once and mounted twice —
 * each with its own paste box, so text meant for one cannot be handed to the
 * other.
 */
const TransferSection = ({
  hint, exportLabel, importLabel, onExport, onImport, busy, canPickFile, testIDPrefix,
}) => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const handlePasteImport = useCallback(async () => {
    const text = pasted;
    setPasted('');
    await onImport(text);
  }, [pasted, onImport]);

  return (
    <View testID={testIDPrefix}>
      <Text style={[styles.hint, { color: colors.mutedText }]}>{hint}</Text>

      <Button
        mode="outlined"
        icon="file-download-outline"
        onPress={onExport}
        disabled={busy}
        style={styles.action}
        testID={`${testIDPrefix}-export`}
      >
        {exportLabel}
      </Button>

      <Button
        mode="outlined"
        icon="file-upload-outline"
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        disabled={busy}
        style={styles.action}
        testID={`${testIDPrefix}-import-open`}
      >
        {importLabel}
      </Button>

      {open && (
        <View style={styles.importBox} testID={`${testIDPrefix}-import-box`}>
          {canPickFile && (
            <Button
              mode="contained-tonal"
              onPress={onImport}
              disabled={busy}
              style={styles.action}
              testID={`${testIDPrefix}-import-file`}
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
            testID={`${testIDPrefix}-paste-input`}
          />
          <Button
            mode="contained"
            onPress={handlePasteImport}
            disabled={busy || !pasted.trim()}
            loading={busy}
            style={styles.action}
            testID={`${testIDPrefix}-paste-import`}
          >
            {t('csv_import_action')}
          </Button>
        </View>
      )}
    </View>
  );
};

TransferSection.propTypes = {
  hint: PropTypes.string.isRequired,
  exportLabel: PropTypes.string.isRequired,
  importLabel: PropTypes.string.isRequired,
  onExport: PropTypes.func.isRequired,
  // Called with the pasted text, or with nothing to open the platform's file
  // dialog — the two doors above.
  onImport: PropTypes.func.isRequired,
  busy: PropTypes.bool,
  canPickFile: PropTypes.bool,
  testIDPrefix: PropTypes.string.isRequired,
};

const CsvTransferPanel = () => {
  const { t } = useLocalization();
  const {
    busy, canPickFile, exportCsv, importFile, importText,
    exportAlignmentCsv, importAlignmentFile, importAlignmentText,
  } = useCsvTransfer();

  // The file button passes no text and the paste button passes a string, so one
  // handler can serve both doors without either section knowing which is which.
  const importRecords = useCallback(
    (text) => (typeof text === 'string' ? importText(text) : importFile()),
    [importText, importFile],
  );
  const importAlignment = useCallback(
    (text) => (typeof text === 'string' ? importAlignmentText(text) : importAlignmentFile()),
    [importAlignmentText, importAlignmentFile],
  );

  return (
    <View testID="csv-transfer-panel">
      <TransferSection
        hint={t('csv_hint')}
        exportLabel={t('csv_export')}
        importLabel={t('csv_import')}
        onExport={exportCsv}
        onImport={importRecords}
        busy={busy}
        canPickFile={canPickFile}
        testIDPrefix="csv"
      />

      <View style={styles.second}>
        <TransferSection
          hint={t('csv_alignment_hint')}
          exportLabel={t('csv_alignment_export')}
          importLabel={t('csv_alignment_import')}
          onExport={exportAlignmentCsv}
          onImport={importAlignment}
          busy={busy}
          canPickFile={canPickFile}
          testIDPrefix="csv-alignment"
        />
      </View>
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
  second: {
    marginTop: SPACING.xl,
  },
});

export default CsvTransferPanel;
