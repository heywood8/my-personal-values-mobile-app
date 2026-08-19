import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useCsvTransfer } from '../hooks/useCsvTransfer';
import CsvTransferSection from './CsvTransferSection';
import { SPACING } from '../styles/designTokens';

/**
 * Export and import, in the settings screen's data section.
 *
 * Two sections, because there are two files: the ranking and the alignment
 * check-ins (see app/services/AlignmentCsv.js for why they are not one). They
 * behave identically, so the section is written once — in CsvTransferSection,
 * which the first card of the deck mounts a third time — and configured twice
 * here, each with its own paste box so text meant for one cannot be handed to
 * the other.
 */
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
      <CsvTransferSection
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
        <CsvTransferSection
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
  second: {
    marginTop: SPACING.xl,
  },
});

export default CsvTransferPanel;
