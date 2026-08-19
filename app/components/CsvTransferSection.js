import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Text, Button, TextInput } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { SPACING, FONT_SIZE, LINE_HEIGHT } from '../styles/designTokens';

/**
 * One CSV file's transfer controls: a save, and an import that opens onto the
 * doors this platform has.
 *
 * Import has two of them because the platforms do. The web has a real file
 * dialog and gets one; a phone has none without a native picker, so the file the
 * share sheet sent somewhere can be pasted back in as text. The paste box is
 * offered on both — it is also how someone imports a file a mail client will only
 * show them the contents of.
 *
 * Mounted three times, so it lives here rather than inside any one of them:
 * twice in the settings panel, once per file (the ranking and the alignment
 * check-ins — app/services/AlignmentCsv.js says why they are not one), and once
 * on the first card of the deck. Each mount owns its own paste box, so text meant
 * for one file cannot be handed to another.
 *
 * `onExport` is optional because the deck mount has nothing to save: it is shown
 * on a first run, where the whole point is that there are no records yet.
 */
const CsvTransferSection = ({
  hint, exportLabel, importLabel, onExport, onImport, busy, canPickFile, testIDPrefix,
}) => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const handlePasteImport = useCallback(async () => {
    const text = pasted;
    setPasted('');
    await onImport(text);
  }, [pasted, onImport]);

  return (
    <View testID={testIDPrefix}>
      {hint ? <Text style={[styles.hint, { color: colors.mutedText }]}>{hint}</Text> : null}

      {onExport && (
        <Button
          mode="outlined"
          icon="file-download-outline"
          onPress={onExport}
          disabled={busy}
          style={styles.action}
          testID={`${testIDPrefix}-export`}
        >
          {exportLabel}
        </Button>
      )}

      <Button
        mode="outlined"
        icon="file-upload-outline"
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        disabled={busy}
        style={styles.action}
        testID={`${testIDPrefix}-import-open`}
      >
        {importLabel}
      </Button>

      {open && (
        <View style={styles.importBox} testID={`${testIDPrefix}-import-box`}>
          {canPickFile && (
            <Button
              mode="contained-tonal"
              onPress={onImport}
              disabled={busy}
              style={styles.action}
              testID={`${testIDPrefix}-import-file`}
            >
              {t('csv_choose_file')}
            </Button>
          )}

          <Text style={[styles.hint, { color: colors.mutedText }]}>{t('csv_paste_hint')}</Text>
          <TextInput
            mode="outlined"
            dense
            multiline
            numberOfLines={4}
            label={t('csv_paste_label')}
            value={pasted}
            onChangeText={setPasted}
            style={styles.input}
            testID={`${testIDPrefix}-paste-input`}
          />
          <Button
            mode="contained"
            onPress={handlePasteImport}
            disabled={busy || !pasted.trim()}
            loading={busy}
            style={styles.action}
            testID={`${testIDPrefix}-paste-import`}
          >
            {t('csv_import_action')}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  action: {
    marginTop: SPACING.md,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
  },
  importBox: {
    marginTop: SPACING.sm,
  },
  input: {
    marginTop: SPACING.xs,
  },
});

CsvTransferSection.propTypes = {
  // Optional: omitted where the surrounding screen has already said what the
  // file is, and the button label is the whole explanation.
  hint: PropTypes.string,
  exportLabel: PropTypes.string,
  importLabel: PropTypes.string.isRequired,
  // Omitted where there is nothing to export — the button goes with it.
  onExport: PropTypes.func,
  // Called with the pasted text, or with nothing to open the platform's file
  // dialog — the two doors above.
  onImport: PropTypes.func.isRequired,
  busy: PropTypes.bool,
  canPickFile: PropTypes.bool,
  testIDPrefix: PropTypes.string.isRequired,
};

export default CsvTransferSection;
