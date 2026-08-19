import { useCallback, useMemo, useState } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { buildRecordsCsv, parseRecordsCsv, applyRecordsCsv } from '../services/RecordsCsv';
import { buildAlignmentCsv, parseAlignmentCsv, applyAlignmentCsv } from '../services/AlignmentCsv';
import { canPickFile, pickTextFile, saveTextFile } from '../utils/fileTransfer';
import { valueName } from '../utils/valueNames';
import { localDateKey } from '../utils/dateUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * The CSV files, wired to the screens.
 *
 * Two screens offer the same export (results, where the file is the thing being
 * looked at, and settings, where the rest of the data handling lives), so the
 * flow — build, save, report — is here rather than in either of them.
 *
 * Import asks before it writes. It replaces a date's record rather than merging
 * into it, and that is not something to find out afterwards, so the file is
 * parsed first and the confirmation states the count it is about to write.
 *
 * There are two files, not one: the ranking and the alignment check-ins. They go
 * through the same three steps with different strings and different writers, so
 * the steps are written once here and the two are configured below. The reason
 * they are separate files at all is in app/services/AlignmentCsv.js.
 *
 * `onRecordsImported` is for the caller that has to move afterwards: the deck,
 * where an import during a first run has just supplied the records that run was
 * for. The reload every other caller needs is already handled by the events
 * emitted below, so nobody else passes it.
 */
export function useCsvTransfer({ onRecordsImported } = {}) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { assessments } = useAssessment();
  const { checkins } = useAlignment();
  const [busy, setBusy] = useState(false);

  const resolveName = useCallback((value) => valueName(value, t), [t]);

  const reportError = useCallback((error) => {
    console.error('[CSV] Transfer failed:', error);
    showDialog(t('error'), String(error?.message || error), [{ text: t('ok') }]);
  }, [showDialog, t]);

  /**
   * One file's export/import trio, given what it is made of and what it is
   * called. `strings` names the keys rather than the wording, so the two flows
   * cannot end up quietly sharing a sentence that only fits one of them.
   */
  const makeTransfer = useCallback(({
    filename, hasRecords, build, parse, apply, strings, onImported,
  }) => {
    const exportCsv = async () => {
      if (!hasRecords) {
        showDialog(t(strings.exportEmptyTitle), t(strings.exportEmptyBody), [{ text: t('ok') }]);
        return;
      }
      setBusy(true);
      try {
        await saveTextFile(filename(), await build(resolveName));
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    };

    const write = async (records) => {
      setBusy(true);
      try {
        const summary = await apply(records, resolveName);
        // A created value belongs to the deck, and every imported row belongs to
        // whichever screen reads it — the provider trees have to re-read rather
        // than keep showing what they loaded before the import.
        if (summary.valuesCreated > 0) appEvents.emit(EVENTS.VALUES_CHANGED);
        strings.changedEvents.forEach((event) => appEvents.emit(event));

        const lines = [t(strings.doneMessage, {
          records: summary.records,
          ratings: summary.ratings,
        })];
        if (summary.valuesCreated > 0) {
          lines.push(t('csv_import_done_values', { count: summary.valuesCreated }));
        }
        if (summary.skipped > 0) {
          lines.push(t('csv_import_done_skipped', { count: summary.skipped }));
        }
        showDialog(t(strings.doneTitle), lines.join('\n'), [{ text: t('ok') }]);
        // After the dialog, so the report is on screen before a caller that
        // reacts by changing which screen is showing gets to act on it.
        onImported?.(summary);
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    };

    /** Parse `text`, confirm what it will do, and write it if the reader agrees. */
    const importText = async (text) => {
      const plan = parse(text);

      if (plan.error === 'no_columns') {
        showDialog(t(strings.invalidTitle), t(strings.invalidBody), [{ text: t('ok') }]);
        return;
      }
      if (plan.error === 'empty' || plan.records.length === 0) {
        showDialog(t('csv_import_nothing_title'), t('csv_import_nothing_body'), [{ text: t('ok') }]);
        return;
      }

      showDialog(
        t(strings.confirmTitle),
        t(strings.confirmMessage, { records: plan.records.length, ratings: plan.ratings }),
        [
          { text: t('cancel') },
          {
            text: t('csv_import_confirm_action'),
            onPress: () => { write(plan.records); },
          },
        ],
      );
    };

    /** Read a file through the platform's file dialog, where there is one. */
    const importFile = async () => {
      try {
        const picked = await pickTextFile();
        if (!picked) return;
        await importText(picked.text);
      } catch (e) {
        reportError(e);
      }
    };

    return { exportCsv, importText, importFile };
  }, [showDialog, t, resolveName, reportError]);

  const records = useMemo(() => makeTransfer({
    filename: () => `values-${localDateKey()}.csv`,
    hasRecords: assessments.length > 0,
    build: buildRecordsCsv,
    parse: parseRecordsCsv,
    apply: applyRecordsCsv,
    strings: {
      exportEmptyTitle: 'csv_export_empty_title',
      exportEmptyBody: 'csv_export_empty_body',
      invalidTitle: 'csv_import_invalid_title',
      invalidBody: 'csv_import_invalid_body',
      confirmTitle: 'csv_import_confirm_title',
      confirmMessage: 'csv_import_confirm_message',
      doneTitle: 'csv_import_done_title',
      doneMessage: 'csv_import_done_message',
      changedEvents: [EVENTS.ASSESSMENTS_CHANGED],
    },
    onImported: onRecordsImported,
  }), [makeTransfer, assessments.length, onRecordsImported]);

  const alignment = useMemo(() => makeTransfer({
    filename: () => `values-alignment-${localDateKey()}.csv`,
    hasRecords: checkins.length > 0,
    build: buildAlignmentCsv,
    parse: parseAlignmentCsv,
    apply: applyAlignmentCsv,
    strings: {
      exportEmptyTitle: 'csv_alignment_export_empty_title',
      exportEmptyBody: 'csv_alignment_export_empty_body',
      invalidTitle: 'csv_alignment_invalid_title',
      invalidBody: 'csv_alignment_invalid_body',
      confirmTitle: 'csv_alignment_confirm_title',
      confirmMessage: 'csv_alignment_confirm_message',
      doneTitle: 'csv_alignment_done_title',
      doneMessage: 'csv_alignment_done_message',
      changedEvents: [EVENTS.ALIGNMENT_CHANGED],
    },
  }), [makeTransfer, checkins.length]);

  return {
    busy,
    canPickFile: canPickFile(),
    exportCsv: records.exportCsv,
    importFile: records.importFile,
    importText: records.importText,
    exportAlignmentCsv: alignment.exportCsv,
    importAlignmentFile: alignment.importFile,
    importAlignmentText: alignment.importText,
  };
}

export default useCsvTransfer;
