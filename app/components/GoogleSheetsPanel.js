import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, TextInput } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useGoogleSheetsSync } from '../hooks/useGoogleSheetsSync';
import { SPACING, FONT_SIZE, LINE_HEIGHT } from '../styles/designTokens';

/**
 * The backup, in the reader's own Google spreadsheet.
 *
 * It sits under the file controls in the settings screen's data section rather
 * than beside them, because it is the same backup by another route and the file
 * is the one that works everywhere. This half renders only where a Google client
 * ID was configured for the platform — a build without one shows nothing here
 * rather than a button that fails on press (see services/GoogleAuth.js).
 *
 * Signing in is not asked for up front. Save and Load ask for a token when they
 * need one, so a first sync is one press; the button here is for the reader who
 * wants to see which account they are about to write to before they write to it.
 */
const GoogleSheetsPanel = () => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const {
    account, available, busy, forgetAccount, loadFromSheets, rememberName,
    saveToSheets, setName, sheetName, signIn, signedIn,
  } = useGoogleSheetsSync();

  if (!available) return null;

  return (
    <View testID="google-sheets-panel">
      <Text style={[styles.hint, { color: colors.mutedText }]}>{t('sheets_hint')}</Text>

      {signedIn ? (
        <View style={styles.account}>
          <Text style={[styles.accountText, { color: colors.text }]} testID="sheets-account">
            {account ? t('sheets_signed_in', { email: account }) : t('sheets_signed_in_unknown')}
          </Text>
          <Button
            mode="text"
            compact
            onPress={forgetAccount}
            disabled={busy}
            testID="sheets-sign-out"
          >
            {t('sheets_sign_out')}
          </Button>
        </View>
      ) : (
        <Button
          mode="outlined"
          icon="google"
          onPress={signIn}
          disabled={busy}
          style={styles.action}
          testID="sheets-sign-in"
        >
          {t('sheets_sign_in')}
        </Button>
      )}

      <TextInput
        mode="outlined"
        dense
        label={t('sheets_name_label')}
        value={sheetName}
        onChangeText={setName}
        onBlur={rememberName}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        testID="sheets-name"
      />
      <Text style={[styles.hint, { color: colors.mutedText }]}>{t('sheets_name_hint')}</Text>

      <Button
        mode="outlined"
        icon="cloud-upload-outline"
        onPress={saveToSheets}
        disabled={busy}
        style={styles.action}
        testID="sheets-save"
      >
        {t('sheets_save')}
      </Button>

      <Button
        mode="outlined"
        icon="cloud-download-outline"
        onPress={loadFromSheets}
        disabled={busy}
        loading={busy}
        style={styles.action}
        testID="sheets-load"
      >
        {t('sheets_load')}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  account: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  accountText: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
  action: {
    marginTop: SPACING.md,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
  },
  input: {
    marginTop: SPACING.md,
  },
});

export default GoogleSheetsPanel;
