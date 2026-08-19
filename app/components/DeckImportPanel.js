import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useCsvTransfer } from '../hooks/useCsvTransfer';
import CsvTransferSection from './CsvTransferSection';
import { SPACING } from '../styles/designTokens';

/**
 * "I already have my results", on the first card of the deck.
 *
 * The CSV files are the only backup this app has, and every other door to them
 * is in Settings — which sits behind the tab shell, which a first run does not
 * reach until it has produced a record. So somebody arriving with a file from
 * their old phone, or from a browser that lost its database, had exactly one way
 * in: answer all 47 cards, throw the result away, then import. This is the same
 * import, offered where that person actually is.
 *
 * Only the ranking file is here. The check-ins are a separate file
 * (app/services/AlignmentCsv.js), and the wheel they belong to is derived from a
 * completed ranking — so importing them first would land scores for a wheel that
 * has no sectors yet. Once the ranking is in, the app is past its first run and
 * Settings holds both.
 *
 * It is an offer, not a question: collapsed to a single button, below the deck's
 * own settings, and doing nothing with it starts the deck as before.
 */
const DeckImportPanel = ({ onImported }) => {
  const { t } = useLocalization();
  const { busy, canPickFile, importFile, importText } = useCsvTransfer({
    onRecordsImported: onImported,
  });

  // The file button passes no text and the paste button passes a string, so one
  // handler serves both doors — same shape as the settings panel's.
  const handleImport = useCallback(
    (text) => (typeof text === 'string' ? importText(text) : importFile()),
    [importText, importFile],
  );

  return (
    <View style={styles.container} testID="deck-import">
      <CsvTransferSection
        hint={t('assessment_import_hint')}
        importLabel={t('assessment_import_open')}
        onImport={handleImport}
        busy={busy}
        canPickFile={canPickFile}
        testIDPrefix="deck-csv"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.md,
  },
});

DeckImportPanel.propTypes = {
  // Called once records have actually been written. The deck cannot decide what
  // happens next on its own — where the app goes from here is AppInitializer's.
  onImported: PropTypes.func,
};

export default DeckImportPanel;
