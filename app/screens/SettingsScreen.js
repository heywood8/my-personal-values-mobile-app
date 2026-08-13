import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, List, Button, Divider } from 'react-native-paper';
import Constants from 'expo-constants';
import { useLocalization, availableLanguages } from '../contexts/LocalizationContext';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useValues } from '../contexts/ValuesContext';
import { useDialog } from '../contexts/DialogContext';
import SegmentedToggle from '../components/SegmentedToggle';
import ValueDeckPanel from '../components/ValueDeckPanel';
import CsvTransferPanel from '../components/CsvTransferPanel';
import PrivacyNote from '../components/PrivacyNote';
import UpdatePanel from '../components/UpdatePanel';
import { canInstallUpdates } from '../services/AppUpdateService';
import { SCALE_ORDER, SCALES } from '../utils/scales';
import { languageLabel } from '../utils/languages';
import { resetDatabase, isUsingMemoryFallback } from '../services/db';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatDateKey } from '../utils/dateUtils';
import { SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../styles/designTokens';

const SettingsScreen = ({ onStartCalibration }) => {
  const { t, language, setLanguage } = useLocalization();
  const { theme, setTheme } = useThemeConfig();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { values, activeValues } = useValues();
  const { scale, setScale, latest, hasRecordToday } = useAssessment();
  const [panel, setPanel] = useState(null);

  const appVersion = Constants.expoConfig?.version || '0.0.0';

  const handleReset = useCallback(() => {
    showDialog(
      t('reset_confirm_title'),
      t('reset_confirm_message'),
      [
        { text: t('cancel') },
        {
          text: t('reset_confirm_action'),
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDatabase();
              // Every provider listens for this: the catalogue re-seeds, the
              // results clear, and the language preference is dropped, which
              // sends the app back to a first run on the deck.
              appEvents.emit(EVENTS.DATABASE_RESET);
            } catch (e) {
              console.error('[Settings] Reset failed:', e);
              showDialog(t('error'), String(e?.message || e), [{ text: t('ok') }]);
            }
          },
        },
      ],
    );
  }, [showDialog, t]);

  const recalibrateHint = hasRecordToday
    ? t('settings_recalibrate_today')
    : latest
      ? t('settings_recalibrate_past', { date: formatDateKey(latest.assessedOn, language) })
      : t('settings_recalibrate_never');

  if (panel === 'values') {
    return <ValueDeckPanel onClose={() => setPanel(null)} />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="settings-screen"
    >
      <View style={styles.inner}>
        {isUsingMemoryFallback() && (
          <View style={[styles.warning, { backgroundColor: colors.selected }]}>
            <Text style={[styles.warningText, { color: colors.text }]}>
              {t('storage_memory_warning')}
            </Text>
          </View>
        )}

        <List.Subheader>{t('settings_language')}</List.Subheader>
        <SegmentedToggle
          testID="settings-language"
          value={language}
          onChange={setLanguage}
          options={availableLanguages.map((code) => ({
            value: code,
            label: languageLabel(code),
          }))}
        />

        <List.Subheader style={styles.subheader}>{t('settings_theme')}</List.Subheader>
        <SegmentedToggle
          testID="settings-theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: t('theme_light') },
            { value: 'dark', label: t('theme_dark') },
            { value: 'system', label: t('theme_system') },
          ]}
        />

        <List.Subheader style={styles.subheader}>{t('settings_scale')}</List.Subheader>
        <SegmentedToggle
          testID="settings-scale"
          value={scale}
          onChange={setScale}
          options={SCALE_ORDER.map((id) => ({
            value: id,
            label: t(SCALES[id].labelKey),
          }))}
        />
        <Text style={[styles.hint, { color: colors.mutedText }]}>
          {t('settings_scale_notice')}
        </Text>

        <Divider style={styles.divider} />

        <List.Subheader>{t('settings_calibration')}</List.Subheader>
        <Text style={[styles.hint, { color: colors.mutedText }]}>{recalibrateHint}</Text>
        <Button
          mode="contained"
          onPress={onStartCalibration}
          style={styles.action}
          testID="settings-recalibrate"
        >
          {t('results_recalibrate')}
        </Button>

        <Divider style={styles.divider} />

        <List.Item
          title={t('settings_values')}
          description={t('settings_values_hint', {
            active: activeValues.length,
            total: values.length,
          })}
          left={(props) => <List.Icon {...props} icon="cards-outline" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => setPanel('values')}
          testID="settings-values"
        />

        <Divider style={styles.divider} />

        <List.Subheader>{t('settings_data')}</List.Subheader>

        {/* Renders only on web; see the component. */}
        <PrivacyNote />

        <CsvTransferPanel />

        <Divider style={styles.divider} />

        <Text style={[styles.hint, { color: colors.mutedText }]}>{t('reset_data_hint')}</Text>
        <Button
          mode="outlined"
          textColor={colors.destructive}
          onPress={handleReset}
          style={styles.action}
          testID="settings-reset"
        >
          {t('reset_data')}
        </Button>

        {/* Absent where an APK cannot be installed — see the component. */}
        {canInstallUpdates() && (
          <>
            <Divider style={styles.divider} />
            <List.Subheader>{t('settings_updates')}</List.Subheader>
            <UpdatePanel />
          </>
        )}

        <Divider style={styles.divider} />

        <Text style={[styles.version, { color: colors.mutedText }]}>
          {t('settings_version', { version: appVersion })}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  action: {
    marginTop: SPACING.md,
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
  },
  divider: {
    marginVertical: SPACING.lg,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  subheader: {
    marginTop: SPACING.md,
  },
  version: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
  },
  warning: {
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  warningText: {
    fontSize: FONT_SIZE.sm,
  },
});

SettingsScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default SettingsScreen;
