import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBackupTransfer } from '../hooks/useBackupTransfer';
import BackupTransferSection from './BackupTransferSection';
import { SPACING } from '../styles/designTokens';

/**
 * "I already have my results", on the first card of the deck.
 *
 * The backup file is the only backup this app has, and every other door to it is
 * in Settings — which sits behind the tab shell, which a first run does not reach
 * until it has produced a record. So somebody arriving with a file from their old
 * phone, or from a browser that lost its database, had exactly one way in: answer
 * all 47 cards, throw the result away, then import. This is the same import,
 * offered where that person actually is.
 *
 * The whole file lands here, check-ins included: they are applied after the
 * ranking they hang off (app/services/BackupCsv.js), so by the time a check-in is
 * written the wheel it belongs to has its sectors. A file holding *only*
 * check-ins imports them and leaves the run standing — there is still no ranking
 * to show, so the deck stays where it is.
 *
 * It is an offer, not a question: collapsed to a single button, below the deck's
 * own settings, and doing nothing with it starts the deck as before.
 */
const DeckImportPanel = ({ onImported }) => {
  const { t } = useLocalization();
  const { busy, canPickFile, importFile, importText } = useBackupTransfer({ onImported });

  // The file button passes no text and the paste button passes a string, so one
  // handler serves both doors — same shape as the settings panel's.
  const handleImport = useCallback(
    (text) => (typeof text === 'string' ? importText(text) : importFile()),
    [importText, importFile],
  );

  return (
    <View style={styles.container} testID="deck-import">
      <BackupTransferSection
        hint={t('assessment_import_hint')}
        importLabel={t('assessment_import_open')}
        onImport={handleImport}
        busy={busy}
        canPickFile={canPickFile}
        testIDPrefix="deck-backup"
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
  // Called once a ranking has actually been written. The deck cannot decide what
  // happens next on its own — where the app goes from here is AppInitializer's.
  onImported: PropTypes.func,
};

export default DeckImportPanel;
