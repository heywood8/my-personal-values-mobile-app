import { useCallback, useState } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { parseBackupCsv, parseBackupRows, applyBackupCsv } from '../services/BackupCsv';
import { valueName } from '../utils/valueNames';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Landing a backup, wherever it came from.
 *
 * The backup arrives two ways — a CSV file the reader holds, and a spreadsheet in
 * their Drive — and neither of those is what makes an import delicate. What makes
 * it delicate is the same in both: it *replaces* a date's record rather than
 * merging into it, and that is not something to find out afterwards. So the
 * parse, the confirmation, the write and the report live here once, and the two
 * carriers differ only in where the rows came from.
 *
 * Both halves of a backup are optional in both directions. A file with no
 * check-ins imports its ranking and says so; rows naming values this deck does
 * not have are counted and skipped. The report is built from what actually
 * landed, never from what the reader might have expected — a line claiming
 * "0 check-ins imported" reads as a failure, and its absence reads as what it is.
 *
 * `onImported` is for the caller that has to move afterwards: the deck, where an
 * import during a first run has just supplied the records that run was for. It is
 * called only when a *ranking* landed — check-ins alone leave a first run with
 * nothing to show and no reason to end. The reload every other caller needs is
 * already handled by the events emitted below, so nobody else passes it.
 */
export function useBackupImport({ onImported } = {}) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const [busy, setBusy] = useState(false);

  const resolveName = useCallback((value) => valueName(value, t), [t]);

  const reportError = useCallback((error) => {
    console.error('[Backup] Transfer failed:', error);
    const key = `error_${String(error?.message || '')}`;
    const message = t(key);
    // The sync raises failures that name themselves ('google_offline'), and
    // those get a sentence. Anything else is a stray exception, and its raw text
    // is more use than a sentence pretending to know what happened.
    showDialog(
      t('error'),
      message === key ? String(error?.message || error) : message,
      [{ text: t('ok') }],
    );
  }, [showDialog, t]);

  /** Run a task with the busy flag held and any failure reported. */
  const run = useCallback(async (task) => {
    setBusy(true);
    try {
      return await task();
    } catch (error) {
      reportError(error);
      return null;
    } finally {
      setBusy(false);
    }
  }, [reportError]);

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

  /** Confirm what a parsed backup will do, and write it if the reader agrees. */
  const importPlan = useCallback(async (plan, { source } = {}) => {
    if (plan.error === 'no_columns') {
      showDialog(t('backup_invalid_title'), t('backup_invalid_body'), [{ text: t('ok') }]);
      return;
    }
    if (plan.error === 'empty') {
      showDialog(
        t('backup_nothing_title'),
        t(source === 'sheet' ? 'sheets_nothing_body' : 'backup_nothing_body'),
        [{ text: t('ok') }],
      );
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

  /** A backup as text, the shape a file arrives in. */
  const importText = useCallback(
    (text) => importPlan(parseBackupCsv(text)),
    [importPlan],
  );

  /** A backup as rows, the shape a spreadsheet arrives in. */
  const importRows = useCallback(
    (rows) => importPlan(parseBackupRows(rows), { source: 'sheet' }),
    [importPlan],
  );

  return {
    busy,
    importRows,
    importText,
    reportError,
    run,
  };
}

export default useBackupImport;
