import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { useBackupImport } from './useBackupImport';
import { buildBackupRows } from '../services/BackupCsv';
import {
  DEFAULT_SPREADSHEET_NAME,
  findOrCreateSpreadsheet,
  findSpreadsheet,
  readSheetRows,
  spreadsheetName,
  spreadsheetUrl,
  writeSheetRows,
} from '../services/GoogleSheets';
import {
  accessToken, canUseGoogleSync, currentAccount, isSignedIn, signOut,
} from '../services/GoogleAuth';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { valueName } from '../utils/valueNames';

/**
 * The same backup, kept in a Google spreadsheet instead of a file.
 *
 * It exists because the file does not survive the way people expect it to: a web
 * reader's whole database lives in a browser profile they may clear, and the
 * backup they took is a CSV in a downloads folder they will not find again. A
 * spreadsheet in their own Drive is a copy that outlives both, in a place they
 * already know how to look.
 *
 * Two rules from the file half carry over unchanged, and they are why this is a
 * hook over `useBackupImport` rather than a second import path. Loading replaces
 * a date's record rather than merging into it, so it asks first, with the same
 * sentences. And the rows are the same rows — the spreadsheet is the CSV's table
 * in cells, so a sheet downloaded as CSV imports through the file door and a file
 * pasted into a sheet loads through this one.
 *
 * Saving is one direction and one moment: it is pressed, not scheduled. There is
 * no background sync, no "keep in sync" switch and nothing that touches the
 * network while the reader is doing anything else — the same reason the shared
 * link is built when it is asked for rather than kept up to date.
 */
export function useGoogleSheetsSync() {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { assessments } = useAssessment();
  const { checkins } = useAlignment();
  const { busy, importRows, run } = useBackupImport();

  // Two facts, not one: a token can be in hand for an account whose address
  // Google declined to hand over, and "signed in, address unknown" is still
  // signed in.
  const [session, setSession] = useState(() => (
    { account: currentAccount(), signedIn: isSignedIn() }
  ));
  const [name, setName] = useState(DEFAULT_SPREADSHEET_NAME);

  const resolveName = useCallback((value) => valueName(value, t), [t]);

  // The name the reader chose is a preference like any other, so it goes through
  // `setPreference` — the route the localStorage mirror listens on, which is what
  // keeps it from being forgotten by a web reload that lands on an empty
  // database.
  useEffect(() => {
    let cancelled = false;
    getPreference(PREF_KEYS.GOOGLE_SHEET_NAME, DEFAULT_SPREADSHEET_NAME)
      .then((stored) => { if (!cancelled) setName(spreadsheetName(stored)); })
      .catch((error) => console.warn('[GoogleSheets] Could not read the sheet name:', error));
    return () => { cancelled = true; };
  }, []);

  /** Keep the chosen name, once the reader has finished typing it. */
  const rememberName = useCallback(async () => {
    const chosen = spreadsheetName(name);
    setName(chosen);
    try {
      await setPreference(PREF_KEYS.GOOGLE_SHEET_NAME, chosen);
    } catch (error) {
      console.warn('[GoogleSheets] Could not store the sheet name:', error);
    }
    return chosen;
  }, [name]);

  /**
   * A token, and the account state kept true beside it.
   *
   * `accessToken()` signs in when there is no usable token, so a first sync is
   * one press rather than two — and a dismissed sign-in comes back as null,
   * which every caller treats as "the reader decided not to", silently.
   */
  const authorise = useCallback(async () => {
    const token = await accessToken();
    setSession({ account: currentAccount(), signedIn: isSignedIn() });
    return token;
  }, []);

  const signIn = useCallback(() => run(authorise), [run, authorise]);

  const forgetAccount = useCallback(() => run(async () => {
    await signOut();
    setSession({ account: null, signedIn: false });
  }), [run]);

  const hasSomethingToSave = assessments.length > 0 || checkins.length > 0;

  /** Everything on the device, into the reader's spreadsheet. */
  const saveToSheets = useCallback(async () => {
    if (!hasSomethingToSave) {
      showDialog(t('backup_export_empty_title'), t('backup_export_empty_body'), [{ text: t('ok') }]);
      return;
    }

    await run(async () => {
      const chosen = await rememberName();
      const token = await authorise();
      if (!token) return;

      const rows = await buildBackupRows(resolveName);
      const sheet = await findOrCreateSpreadsheet(chosen, token);
      const written = await writeSheetRows(sheet.id, rows, token);

      const lines = [t('sheets_saved_body', { name: sheet.name, rows: written })];
      if (sheet.created) lines.push(t('sheets_created_note'));

      showDialog(t('sheets_saved_title'), lines.join('\n'), [
        { text: t('ok') },
        { text: t('sheets_open'), onPress: () => Linking.openURL(spreadsheetUrl(sheet.id)) },
      ]);
    });
  }, [hasSomethingToSave, showDialog, t, run, rememberName, authorise, resolveName]);

  /**
   * The spreadsheet back into the device, once the reader has agreed to it.
   *
   * Nothing is created here. A name that finds nothing is a name the reader has
   * not saved under — a typo, or another device's spreadsheet this app was never
   * given access to — and making an empty sheet in answer to that would report
   * success for a backup that does not exist.
   */
  const loadFromSheets = useCallback(async () => {
    await run(async () => {
      const chosen = await rememberName();
      const token = await authorise();
      if (!token) return;

      const sheet = await findSpreadsheet(chosen, token);
      if (!sheet) {
        showDialog(
          t('sheets_missing_title'),
          t('sheets_missing_body', { name: chosen }),
          [{ text: t('ok') }],
        );
        return;
      }

      await importRows(await readSheetRows(sheet.id, token));
    });
  }, [run, rememberName, authorise, showDialog, t, importRows]);

  return {
    account: session.account,
    available: canUseGoogleSync(),
    busy,
    forgetAccount,
    loadFromSheets,
    rememberName,
    saveToSheets,
    setName,
    sheetName: name,
    signIn,
    signedIn: session.signedIn,
  };
}

export default useGoogleSheetsSync;
