import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, List, Button } from 'react-native-paper';
import Constants from 'expo-constants';
import { useLocalization, availableLanguages } from '../contexts/LocalizationContext';
import { useThemeConfig } from '../contexts/ThemeConfigContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useValues } from '../contexts/ValuesContext';
import { useDialog } from '../contexts/DialogContext';
import SegmentedToggle from '../components/SegmentedToggle';
import ScreenHeader from '../components/ScreenHeader';
import SectionCard from '../components/SectionCard';
import ValueDeckPanel from '../components/ValueDeckPanel';
import BackupTransferPanel from '../components/BackupTransferPanel';
import GoogleSheetsPanel from '../components/GoogleSheetsPanel';
import PrivacyNote from '../components/PrivacyNote';
import UpdatePanel from '../components/UpdatePanel';
import { canInstallUpdates } from '../services/AppUpdateService';
import { canUseGoogleSync } from '../services/GoogleAuth';
import { SCALE_ORDER, SCALES } from '../utils/scales';
import { languageLabel } from '../utils/languages';
import { resetDatabase, isUsingMemoryFallback } from '../services/db';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatDateKey } from '../utils/dateUtils';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH, LINE_HEIGHT,
} from '../styles/designTokens';

/**
 * Everything that is a setting, grouped.
 *
 * The screen is a stack of `SectionCard`s rather than one column of controls cut
 * up by dividers — see that component for why. What it changes here beyond the
 * looks is which small print belongs to what: the scale notice now sits inside
 * the card whose control it qualifies instead of floating between two groups,
 * where it was equally readable as a note about the one below.
 */
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
        <ScreenHeader title={t('tab_settings')} />

        {isUsingMemoryFallback() && (
          <View style={[styles.warning, { backgroundColor: colors.selected }]}>
            <Text style={[styles.warningText, { color: colors.text }]}>
              {t('storage_memory_warning')}
            </Text>
          </View>
        )}

        <SectionCard title={t('settings_language')} style={styles.card}>
          <SegmentedToggle
            testID="settings-language"
            value={language}
            onChange={setLanguage}
            options={availableLanguages.map((code) => ({
              value: code,
              label: languageLabel(code),
            }))}
          />
        </SectionCard>

        <SectionCard title={t('settings_theme')} style={styles.card}>
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
        </SectionCard>

        <SectionCard
          title={t('settings_scale')}
          footnote={t('settings_scale_notice')}
          style={styles.card}
        >
          <SegmentedToggle
            testID="settings-scale"
            value={scale}
            onChange={setScale}
            options={SCALE_ORDER.map((id) => ({
              value: id,
              label: t(SCALES[id].labelKey),
            }))}
          />
        </SectionCard>

        <SectionCard title={t('settings_calibration')} style={styles.card}>
          <Text style={[styles.hint, styles.hintFirst, { color: colors.mutedText }]}>
            {recalibrateHint}
          </Text>
          <Button
            mode="contained"
            onPress={onStartCalibration}
            style={styles.action}
            testID="settings-recalibrate"
          >
            {t('results_recalibrate')}
          </Button>

          {/* The deck belongs beside recalibration rather than in a group of its
              own: what is in the deck is the whole of what the next calibration
              will ask about. */}
          <List.Item
            title={t('settings_values')}
            description={t('settings_values_hint', {
              active: activeValues.length,
              total: values.length,
            })}
            left={(props) => <List.Icon {...props} icon="cards-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setPanel('values')}
            style={[styles.listItem, { backgroundColor: colors.background }]}
            testID="settings-values"
          />
        </SectionCard>

        <SectionCard title={t('settings_data')} style={styles.card}>
          {/* Renders only on web; see the component. */}
          <PrivacyNote />

          <BackupTransferPanel />

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
        </SectionCard>

        {/* Absent from a build with no Google client ID configured for this
            platform — see services/GoogleAuth.js. A card of its own rather than
            a third block inside the data card: it is the same backup, but it is
            the only thing in the app that talks to anybody. */}
        {canUseGoogleSync() && (
          <SectionCard
            title={t('sheets_title')}
            footnote={t('sheets_privacy_note')}
            style={styles.card}
          >
            <GoogleSheetsPanel />
          </SectionCard>
        )}

        {/* Absent where an APK cannot be installed — see the component. */}
        {canInstallUpdates() && (
          <SectionCard title={t('settings_updates')} style={styles.card}>
            <UpdatePanel />
          </SectionCard>
        )}

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
  card: {
    marginBottom: SPACING.lg,
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.md,
  },
  hintFirst: {
    marginTop: 0,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  listItem: {
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  version: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  warning: {
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  warningText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
  },
});

SettingsScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default SettingsScreen;
