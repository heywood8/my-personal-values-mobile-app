import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { formatReleaseDate, parseReleaseNotes } from '../utils/releaseNotes';
import { FONT_SIZE, FONT_WEIGHT, SPACING } from '../styles/designTokens';

/**
 * "There is a newer version" — the one thing this app interrupts for.
 *
 * A Paper `Dialog` in a `Portal`, like every other confirmation here, so it
 * behaves the same on every platform and inherits the theme rather than
 * restating it. It renders below `PaperProvider` by way of AppProviders; a
 * Portal above its provider throws (see the note in app/AppProviders.js).
 *
 * Everything the user skipped is listed, not just the newest release: someone
 * two versions behind wants to know what both of them changed.
 */
const UpdatePrompt = ({ update, onDismiss, onAccept }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { height } = useWindowDimensions();

  // The changelog scrolls inside a bounded box so a release with forty bullets
  // cannot push the buttons off the bottom of the screen.
  const notesMaxHeight = Math.round(height * 0.35);

  const releases = useMemo(() => (update?.newerReleases || [])
    .map((release) => ({
      version: release.version,
      publishedAt: release.publishedAt,
      ...parseReleaseNotes(release.notes, release.version),
    }))
    .filter((release) => release.body), [update]);

  if (!update) return null;

  const dateLabel = formatReleaseDate(update.publishedAt, null, language);
  const showVersionHeadings = releases.length > 1;

  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss} testID="update-prompt">
        <Dialog.Icon icon="cloud-download-outline" />
        <Dialog.Title style={styles.title}>{t('update_available_title')}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={[styles.meta, { color: colors.mutedText }]}>
            {t('update_available_versions', {
              current: update.currentVersion,
              latest: update.latestVersion,
            })}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </Text>

          {releases.length > 0 ? (
            <ScrollView
              style={[styles.notes, { maxHeight: notesMaxHeight }]}
              testID="update-prompt-notes"
            >
              {releases.map((release) => (
                <React.Fragment key={release.version}>
                  {showVersionHeadings && (
                    <Text variant="labelLarge" style={styles.releaseVersion}>
                      v{release.version}
                    </Text>
                  )}
                  <Text variant="bodySmall" style={styles.releaseBody}>{release.body}</Text>
                </React.Fragment>
              ))}
            </ScrollView>
          ) : (
            <Text variant="bodyMedium">{t('update_available_body')}</Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} testID="update-prompt-later">{t('update_later')}</Button>
          <Button mode="contained" onPress={onAccept} testID="update-prompt-accept">
            {t('update_now')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

UpdatePrompt.propTypes = {
  update: PropTypes.shape({
    latestVersion: PropTypes.string.isRequired,
    currentVersion: PropTypes.string.isRequired,
    publishedAt: PropTypes.string,
    newerReleases: PropTypes.arrayOf(PropTypes.shape({
      version: PropTypes.string,
      notes: PropTypes.string,
      publishedAt: PropTypes.string,
    })),
  }),
  onDismiss: PropTypes.func.isRequired,
  onAccept: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  meta: {
    marginBottom: SPACING.sm,
  },
  notes: {
    marginTop: SPACING.xs,
  },
  releaseBody: {
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  releaseVersion: {
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    textAlign: 'center',
  },
});

export default UpdatePrompt;
