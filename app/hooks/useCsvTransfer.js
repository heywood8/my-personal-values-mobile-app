import { useCallback, useState } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { buildRecordsCsv, parseRecordsCsv, applyRecordsCsv } from '../services/RecordsCsv';
import { canPickFile, pickTextFile, saveTextFile } from '../utils/fileTransfer';
import { valueName } from '../utils/valueNames';
import { localDateKey } from '../utils/dateUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * The CSV file, wired to the screens.
 *
 * Two screens offer the same export (results, where the file is the thing being
 * looked at, and settings, where the rest of the data handling lives), so the
 * flow — build, save, report — is here rather than in either of them.
 *
 * Import asks before it writes. It replaces a date's record rather than merging
 * into it, and that is not something to find out afterwards, so the file is
 * parsed first and the confirmation states the count it is about to write.
 */
export function useCsvTransfer() {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { assessments } = useAssessment();
  const [busy, setBusy] = useState(false);

  const resolveName = useCallback((value) => valueName(value, t), [t]);

  const reportError = useCallback((error) => {
    console.error('[CSV] Transfer failed:', error);
    showDialog(t('error'), String(error?.message || error), [{ text: t('ok') }]);
  }, [showDialog, t]);

  const exportCsv = useCallback(async () => {
    if (assessments.length === 0) {
      showDialog(t('csv_export_empty_title'), t('csv_export_empty_body'), [{ text: t('ok') }]);
      return;
    }
    setBusy(true);
    try {
      const csv = await buildRecordsCsv(resolveName);
      await saveTextFile(`values-${localDateKey()}.csv`, csv);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [assessments.length, showDialog, t, resolveName, reportError]);

  const write = useCallback(async (records) => {
    setBusy(true);
    try {
      const summary = await applyRecordsCsv(records, resolveName);
      // A created value belongs to the deck, and every imported rating belongs to
      // the results and the history — both provider trees have to re-read.
      if (summary.valuesCreated > 0) appEvents.emit(EVENTS.VALUES_CHANGED);
      appEvents.emit(EVENTS.ASSESSMENTS_CHANGED);

      const lines = [t('csv_import_done_message', {
        records: summary.records,
        ratings: summary.ratings,
      })];
      if (summary.valuesCreated > 0) {
        lines.push(t('csv_import_done_values', { count: summary.valuesCreated }));
      }
      if (summary.skipped > 0) {
        lines.push(t('csv_import_done_skipped', { count: summary.skipped }));
      }
      showDialog(t('csv_import_done_title'), lines.join('\n'), [{ text: t('ok') }]);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [resolveName, showDialog, t, reportError]);

  /** Parse `text`, confirm what it will do, and write it if the reader agrees. */
  const importText = useCallback(async (text) => {
    const plan = parseRecordsCsv(text);

    if (plan.error === 'no_columns') {
      showDialog(t('csv_import_invalid_title'), t('csv_import_invalid_body'), [{ text: t('ok') }]);
      return;
    }
    if (plan.error === 'empty' || plan.records.length === 0) {
      showDialog(t('csv_import_nothing_title'), t('csv_import_nothing_body'), [{ text: t('ok') }]);
      return;
    }

    showDialog(
      t('csv_import_confirm_title'),
      t('csv_import_confirm_message', { records: plan.records.length, ratings: plan.ratings }),
      [
        { text: t('cancel') },
        {
          text: t('csv_import_confirm_action'),
          onPress: () => { write(plan.records); },
        },
      ],
    );
  }, [showDialog, t, write]);

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
    exportCsv,
    importFile,
    importText,
  };
}

export default useCsvTransfer;
