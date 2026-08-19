import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, List, Text } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useDialog } from '../contexts/DialogContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import {
  canInstallUpdates,
  checkForAppUpdate,
  currentAppVersion,
  installApk,
  listDownloadedApks,
  RELEASES_URL,
  verifyCachedApk,
} from '../services/AppUpdateService';
import { setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { formatReleaseDate, parseReleaseNotes } from '../utils/releaseNotes';
import { FONT_SIZE, SPACING, LINE_HEIGHT } from '../styles/designTokens';

/**
 * The updates section of the settings screen.
 *
 * Renders only where an update can actually be installed. On web the app
 * updates by being reloaded and on iOS there is no sideloading, so on both this
 * would be a button that finds a release it can do nothing with — the section is
 * absent rather than disabled. Asked as a predicate, in keeping with
 * `canPickFile()` in app/utils/fileTransfer.js.
 *
 * The check is manual here. The automatic one lives in useAppUpdateCheck and
 * only speaks up when there is something to install; this is for the user who
 * wants to know now, so it ignores the throttle and reports every outcome,
 * including "you are up to date".
 */
const UpdatePanel = () => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { isDownloading, startDownload } = useUpdateDownload();

  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [cachedApks, setCachedApks] = useState([]);

  const refreshCachedApks = useCallback(async () => {
    setCachedApks(await listDownloadedApks());
  }, []);

  // Cached APKs are listed without a check having been run: a download the user
  // interrupted at the Android installer is still sitting there, installable.
  useEffect(() => {
    if (!canInstallUpdates()) return;
    refreshCachedApks();
  }, [refreshCachedApks]);

  const check = useCallback(async () => {
    setChecking(true);
    setResult(null);
    try {
      const found = await checkForAppUpdate();
      await setPreference(PREF_KEYS.UPDATE_LAST_CHECK_AT, new Date().toISOString())
        .catch(() => {});

      if (found.success && found.isUpdateAvailable) {
        // A leftover download for this exact release may be truncated — verify
        // before offering to install it, or Android rejects the file after the
        // user has already tapped through the installer.
        const cached = await verifyCachedApk(found.downloadUrl, { checksumUrl: found.checksumUrl });
        await refreshCachedApks();
        setResult({ ...found, cachedUri: cached.exists ? cached.uri : null });
      } else {
        setResult(found);
      }
    } catch (error) {
      setResult({ success: false, errorCode: 'network_error', message: error?.message });
    } finally {
      setChecking(false);
    }
  }, [refreshCachedApks]);

  const download = useCallback((downloadUrl, checksumUrl) => {
    startDownload(downloadUrl, {
      checksumUrl,
      onError: () => showDialog(t('error'), t('update_download_failed'), [{ text: t('ok') }]),
    });
  }, [startDownload, showDialog, t]);

  const install = useCallback(async (uri) => {
    try {
      await installApk(uri);
    } catch {
      // The usual cause is the file having been cleared from the cache since it
      // was listed, so re-read the directory before saying anything.
      await refreshCachedApks();
      showDialog(t('error'), t('update_install_failed'), [{ text: t('ok') }]);
    }
  }, [refreshCachedApks, showDialog, t]);

  if (!canInstallUpdates()) return null;

  // The notes for the release actually on offer, which is the highest version
  // that has an APK — not necessarily the highest version.
  const offered = result?.isUpdateAvailable
    ? result.newerReleases?.find((release) => release.version === result.latestVersion)
    : null;
  const notes = offered ? parseReleaseNotes(offered.notes, offered.version) : null;
  const releaseDate = result?.isUpdateAvailable
    ? formatReleaseDate(result.publishedAt, notes?.date, language)
    : null;

  return (
    <View testID="update-panel">
      <Text style={[styles.hint, { color: colors.mutedText }]}>
        {t('update_hint', { version: currentAppVersion() })}
      </Text>

      {/* Progress is reported once, app-wide, by UpdateDownloadBanner — a
          download outlives this panel, so the panel is the wrong place to watch
          it. All this does is stop a second one being started on top. */}
      <Button
        mode="outlined"
        icon="cloud-download-outline"
        onPress={check}
        loading={checking}
        disabled={checking || isDownloading}
        style={styles.action}
        testID="update-check"
      >
        {t('update_check')}
      </Button>

      {!checking && result && (
        <View style={styles.result} testID="update-result">
          {result.success && result.isUpdateAvailable ? (
            <>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {t('update_available_versions', {
                  current: result.currentVersion,
                  latest: result.latestVersion,
                })}
              </Text>
              {!!releaseDate && (
                <Text style={[styles.hint, { color: colors.mutedText }]}>{releaseDate}</Text>
              )}
              {!!notes?.body && (
                <Text style={[styles.notes, { color: colors.text }]} testID="update-notes">
                  {notes.body}
                </Text>
              )}
              {result.cachedUri ? (
                <Button
                  mode="contained"
                  icon="package-down"
                  onPress={() => install(result.cachedUri)}
                  style={styles.action}
                  testID="update-install-cached"
                >
                  {t('update_install')}
                </Button>
              ) : (
                <Button
                  mode="contained"
                  icon="cloud-download-outline"
                  onPress={() => download(result.downloadUrl, result.checksumUrl)}
                  style={styles.action}
                  testID="update-download"
                >
                  {t('update_download')}
                </Button>
              )}
            </>
          ) : result.success ? (
            <Text style={[styles.resultTitle, { color: colors.positive }]}>
              {t('update_up_to_date', { version: result.currentVersion })}
            </Text>
          ) : result.errorCode === 'releases_without_apks' ? (
            <>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {t('update_building_title', {
                  version: result.newerReleases?.[0]?.version || '',
                })}
              </Text>
              <Text style={[styles.hint, { color: colors.mutedText }]}>
                {result.buildRun?.elapsedMinutes != null
                  ? t('update_building_elapsed', { minutes: result.buildRun.elapsedMinutes })
                  : t('update_building_body')}
              </Text>
            </>
          ) : (
            <Text style={[styles.resultTitle, { color: colors.mutedText }]}>
              {result.errorCode === 'rate_limited'
                ? t('update_error_rate_limited')
                : t('update_error_unreachable')}
            </Text>
          )}

          <Button
            mode="text"
            icon="open-in-new"
            onPress={() => Linking.openURL(result.releasesUrl || RELEASES_URL)}
            style={styles.action}
            testID="update-open-releases"
          >
            {t('update_open_releases')}
          </Button>
        </View>
      )}

      {cachedApks.length > 0 && (
        <View style={styles.cached} testID="update-cached-apks">
          <Text style={[styles.hint, { color: colors.mutedText }]}>{t('update_cached_title')}</Text>
          {cachedApks.map((apk) => (
            <List.Item
              key={apk.uri}
              title={apk.version ? `v${apk.version}` : apk.filename}
              description={apk.filename}
              left={(props) => <List.Icon {...props} icon="package-variant-closed" />}
              onPress={() => install(apk.uri)}
              testID={`update-cached-${apk.version || apk.filename}`}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  action: {
    marginTop: SPACING.md,
  },
  cached: {
    marginTop: SPACING.md,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
  },
  notes: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.sm,
  },
  result: {
    marginTop: SPACING.md,
  },
  resultTitle: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.sm,
  },
});

export default UpdatePanel;
