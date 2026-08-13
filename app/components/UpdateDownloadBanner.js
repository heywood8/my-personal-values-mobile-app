import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { FONT_SIZE, HEIGHTS, SPACING } from '../styles/designTokens';

/**
 * What "Update now" looks like while it is happening.
 *
 * The prompt closes the moment it is answered and the Android installer does not
 * appear until the whole APK is on the device — tens of megabytes later. Without
 * this the app looks like it ignored the tap for a minute, and the obvious
 * response to that is to tap again.
 *
 * Sits above the tab bar rather than over it, so the app stays usable: the
 * download outlives whatever screen started it, and there is no reason to hold
 * the user still for it.
 */
const UpdateDownloadBanner = () => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const { isDownloading, phase, progress } = useUpdateDownload();

  if (!isDownloading) return null;

  const label = phase === 'verifying' ? t('update_verifying')
    : phase === 'backing_up' ? t('update_backing_up')
      : t('update_downloading', { percent: Math.round((progress || 0) * 100) });

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.card, borderTopColor: colors.border }]}
      testID="update-download-banner"
    >
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      {/* Indeterminate for the phases after the transfer, which have no byte
          count of their own to report. */}
      <ProgressBar
        indeterminate={phase !== 'downloading'}
        progress={progress || 0}
        style={styles.bar}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: HEIGHTS.tabBar,
    left: 0,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    position: 'absolute',
    right: 0,
  },
  bar: {
    marginTop: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.sm,
  },
});

export default UpdateDownloadBanner;
