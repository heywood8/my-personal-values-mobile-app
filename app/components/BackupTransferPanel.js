import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useBackupTransfer } from '../hooks/useBackupTransfer';
import BackupTransferSection from './BackupTransferSection';

/**
 * Save and load the backup, in the settings screen's data section.
 *
 * One section, because there is one file: the ranking and the wheel's check-ins
 * travel together (see app/services/BackupCsv.js). It was two of these once, one
 * per file, which made "back up my data" two actions somebody could do half of.
 */
const BackupTransferPanel = () => {
  const { t } = useLocalization();
  const {
    busy, canPickFile, exportBackup, importFile, importText,
  } = useBackupTransfer();

  // The file button passes no text and the paste button passes a string, so one
  // handler can serve both doors without the section knowing which is which.
  const handleImport = useCallback(
    (text) => (typeof text === 'string' ? importText(text) : importFile()),
    [importText, importFile],
  );

  return (
    <View testID="backup-transfer-panel">
      <BackupTransferSection
        hint={t('backup_hint')}
        exportLabel={t('backup_export')}
        importLabel={t('backup_import')}
        onExport={exportBackup}
        onImport={handleImport}
        busy={busy}
        canPickFile={canPickFile}
        testIDPrefix="backup"
      />
    </View>
  );
};

export default BackupTransferPanel;
