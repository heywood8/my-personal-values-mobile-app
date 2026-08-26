import { useCallback } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { useBackupImport } from './useBackupImport';
import { buildBackupCsv } from '../services/BackupCsv';
import { canPickFile, pickTextFile, saveTextFile } from '../utils/fileTransfer';
import { valueName } from '../utils/valueNames';
import { localDateKey } from '../utils/dateUtils';

/**
 * The backup file, wired to the screens.
 *
 * One file holds both lists (app/services/BackupCsv.js says why it can), so
 * there is one save and one load here rather than a pair of each. Two screens
 * offer them — results, where the file is the thing being looked at, and
 * settings, where the rest of the data handling lives — plus the first card of
 * the deck, so the flow lives here rather than in any of them.
 *
 * Landing a backup is `useBackupImport`, shared with the Google Sheets sync:
 * what an import does to the database is the same whichever carrier the rows
 * came off, and the confirmation that guards it has to be the same too.
 */
export function useBackupTransfer({ onImported } = {}) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { assessments } = useAssessment();
  const { checkins } = useAlignment();
  const {
    busy, importText, run,
  } = useBackupImport({ onImported });

  const resolveName = useCallback((value) => valueName(value, t), [t]);

  const hasSomethingToSave = assessments.length > 0 || checkins.length > 0;

  const exportBackup = useCallback(async () => {
    if (!hasSomethingToSave) {
      showDialog(t('backup_export_empty_title'), t('backup_export_empty_body'), [{ text: t('ok') }]);
      return;
    }
    await run(async () => {
      await saveTextFile(`values-backup-${localDateKey()}.csv`, await buildBackupCsv(resolveName));
    });
  }, [hasSomethingToSave, showDialog, t, resolveName, run]);

  /** Read a file through the platform's file dialog, where there is one. */
  const importFile = useCallback(async () => {
    await run(async () => {
      const picked = await pickTextFile();
      if (!picked) return;
      await importText(picked.text);
    });
  }, [importText, run]);

  return {
    busy,
    canPickFile: canPickFile(),
    exportBackup,
    importFile,
    importText,
  };
}

export default useBackupTransfer;
