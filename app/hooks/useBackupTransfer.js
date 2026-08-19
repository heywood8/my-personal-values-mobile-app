import { useCallback, useState } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { buildBackupCsv, parseBackupCsv, applyBackupCsv } from '../services/BackupCsv';
import { canPickFile, pickTextFile, saveTextFile } from '../utils/fileTransfer';
import { valueName } from '../utils/valueNames';
import { localDateKey } from '../utils/dateUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * The backup file, wired to the screens.
 *
 * One file holds both lists (app/services/BackupCsv.js says why it can), so
 * there is one save and one load here rather than a pair of each. Two screens
 * offer them — results, where the file is the thing being looked at, and
 * settings, where the rest of the data handling lives — plus the first card of
 * the deck, so the flow lives here rather than in any of them.
 *
 * Import asks before it writes. It replaces a date's record rather than merging
 * into it, and that is not something to find out afterwards, so the file is
 * parsed first and the confirmation states what it is about to write.
 *
 * Both halves are optional in both directions. A file with no check-ins in it
 * imports its ranking and says so; a file whose rows name values this deck does
 * not have imports whatever is left and counts the rest. The report is built from
 * what actually landed, never from what the reader might have expected — a line
 * claiming "0 check-ins imported" reads as a failure, and its absence reads as
 * what it is.
 *
 * `onImported` is for the caller that has to move afterwards: the deck, where an
 * import during a first run has just supplied the records that run was for. It is
 * called only when a *ranking* landed — check-ins alone leave a first run with
 * nothing to show and no reason to end. The reload every other caller needs is
 * already handled by the events emitted below, so nobody else passes it.
 */
export function useBackupTransfer({ onImported } = {}) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { assessments } = useAssessment();
  const { checkins } = useAlignment();
  const [busy, setBusy] = useState(false);

  const resolveName = useCallback((value) => valueName(value, t), [t]);

  const reportError = useCallback((error) => {
    console.error('[Backup] Transfer failed:', error);
    showDialog(t('error'), String(error?.message || error), [{ text: t('ok') }]);
  }, [showDialog, t]);

  const hasSomethingToSave = assessments.length > 0 || checkins.length > 0;

  const exportBackup = useCallback(async () => {
    if (!hasSomethingToSave) {
      showDialog(t('backup_export_empty_title'), t('backup_export_empty_body'), [{ text: t('ok') }]);
      return;
    }
    setBusy(true);
    try {
      await saveTextFile(`values-backup-${localDateKey()}.csv`, await buildBackupCsv(resolveName));
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [hasSomethingToSave, showDialog, t, resolveName, reportError]);

  /**
   * The two lists as sentences, and only the ones there is something to say
   * about. Used for both the confirmation and the report, so the reader is told
   * what will happen and then what did in the same shape.
   */
  const describe = useCallback((importance, alignment) => {
    const lines = [];
    if (importance.records > 0) {
      lines.push(t('backup_line_records', {
        ratings: importance.ratings,
        records: importance.records,
      }));
    }
    if (alignment.records > 0) {
      lines.push(t('backup_line_checkins', {
        ratings: alignment.ratings,
        records: alignment.records,
      }));
    }
    return lines;
  }, [t]);

  const write = useCallback(async (plan) => {
    setBusy(true);
    try {
      const summary = await applyBackupCsv(plan, resolveName);

      // Every imported row belongs to whichever screen reads it — the provider
      // trees have to re-read rather than keep showing what they loaded before
      // the import. Only the halves that actually landed are announced.
      if (summary.importance.records > 0) appEvents.emit(EVENTS.ASSESSMENTS_CHANGED);
      if (summary.alignment.records > 0) appEvents.emit(EVENTS.ALIGNMENT_CHANGED);

      const lines = describe(summary.importance, summary.alignment);
      if (lines.length === 0) lines.push(t('backup_done_none'));
      if (summary.skipped > 0) lines.push(t('backup_done_skipped', { count: summary.skipped }));

      showDialog(t('backup_done_title'), lines.join('\n'), [{ text: t('ok') }]);
      // After the dialog, so the report is on screen before a caller that reacts
      // by changing which screen is showing gets to act on it.
      if (summary.importance.records > 0) onImported?.(summary);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [resolveName, describe, t, showDialog, onImported, reportError]);

  /** Parse `text`, confirm what it will do, and write it if the reader agrees. */
  const importText = useCallback(async (text) => {
    const plan = parseBackupCsv(text);

    if (plan.error === 'no_columns') {
      showDialog(t('backup_invalid_title'), t('backup_invalid_body'), [{ text: t('ok') }]);
      return;
    }
    if (plan.error === 'empty') {
      showDialog(t('backup_nothing_title'), t('backup_nothing_body'), [{ text: t('ok') }]);
      return;
    }

    const lines = describe(
      { ratings: plan.importance.ratings, records: plan.importance.records.length },
      { ratings: plan.alignment.ratings, records: plan.alignment.records.length },
    );
    lines.push(t('backup_confirm_note'));

    showDialog(
      t('backup_confirm_title'),
      lines.join('\n'),
      [
        { text: t('cancel') },
        {
          text: t('backup_confirm_action'),
          onPress: () => { write(plan); },
        },
      ],
    );
  }, [showDialog, t, describe, write]);

  /** Read a file through the platform's file dialog, where there is one. */
  const importFile = useCallback(async () => {
    try {
      const picked = await pickTextFile();
      if (!picked) return;
      await importText(picked.text);
    } catch (e) {
      reportError(e);
    }
  }, [importText, reportError]);

  return {
    busy,
    canPickFile: canPickFile(),
    exportBackup,
    importFile,
    importText,
  };
}

export default useBackupTransfer;
