import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import RankedValueBars from '../components/charts/RankedValueBars';
import EmptyState from '../components/EmptyState';
import { decodeShareCode, sharedResultItems } from '../services/ResultsShare';
import { formatDateKey } from '../utils/dateUtils';
import {
  SPACING, FONT_SIZE, FONT_WEIGHT, BORDER_RADIUS, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/**
 * Somebody else's ranking, opened from a link.
 *
 * A read-only screen, and the reasons are worth keeping. It writes nothing:
 * importing would resolve through the same-day rule and overwrite the reader's
 * own record for that date, and what arrives here is a friend's answer rather
 * than a backup of yours. It also owns no data — the code in the URL is the
 * whole of it — so closing the screen is all it takes for the app to be back to
 * being about its own reader.
 *
 * A link that cannot be read gets a named reason rather than a blank list. The
 * three that can actually happen are told apart because the answer differs: a
 * link that arrived in half is worth asking for again, one from a newer version
 * of the app is worth updating for, and anything else is not a shared ranking at
 * all.
 */
const ERROR_STRINGS = {
  corrupt: { icon: 'link-variant-off', title: 'share_view_corrupt_title', body: 'share_view_corrupt_body' },
  unsupported: { icon: 'update', title: 'share_view_unsupported_title', body: 'share_view_unsupported_body' },
};

const INVALID = { icon: 'link-off', title: 'share_view_invalid_title', body: 'share_view_invalid_body' };

const SharedResultsScreen = ({ code, onClose }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();

  const { payload, error } = useMemo(() => decodeShareCode(code), [code]);
  // Names are resolved in *this* reader's language, which is why the link
  // carries keys — see the note in services/ResultsShare.js.
  const items = useMemo(() => sharedResultItems(payload, t), [payload, t]);

  if (error) {
    const strings = ERROR_STRINGS[error] || INVALID;
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={strings.icon}
          title={t(strings.title)}
          body={t(strings.body)}
          actionLabel={t('share_view_close')}
          onAction={onClose}
          testID="shared-results-error"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.contentContainer} testID="shared-results-screen">
        <View style={styles.inner}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('share_view_title')}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedText }]}>
            {`${t('results_calibrated_on', { date: formatDateKey(payload.assessedOn, language) })} · ${t('results_value_count', { count: items.length })}`}
          </Text>

          <View style={[styles.note, { backgroundColor: colors.selected }]}>
            <Text style={[styles.noteText, { color: colors.text }]}>{t('share_view_note')}</Text>
          </View>

          <RankedValueBars items={items} scaleId={payload.scale} />

          <Button
            mode="contained"
            onPress={onClose}
            style={styles.close}
            testID="shared-results-close"
          >
            {t('share_view_close')}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  close: {
    marginTop: SPACING.xxl,
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  meta: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  note: {
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  noteText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
  },
  safeArea: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
  },
});

SharedResultsScreen.propTypes = {
  /** The `r=` parameter, exactly as it arrived. Decoding is this screen's job. */
  code: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SharedResultsScreen;
