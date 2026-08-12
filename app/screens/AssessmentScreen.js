import React, { useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useDialog } from '../contexts/DialogContext';
import ScaleInput from '../components/ScaleInput';
import EmptyState from '../components/EmptyState';
import { valueName, valueDescription } from '../utils/valueNames';
import { formatDateKey } from '../utils/dateUtils';
import {
  BORDER_RADIUS, FONT_SIZE, SPACING, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/**
 * The card deck.
 *
 * One value at a time rather than a scrolling list of 47 rows: a list invites
 * skimming and rating each entry relative to whatever happens to be next to it.
 * That matters more since the deck went to the source checklist's order
 * (ValuesDB.DECK_ORDER), which does put related cards back to back — one card
 * at a time is what keeps each one judged on itself. It is also what makes the
 * qualitative scale a genuinely fast path — three taps' worth of decision, then
 * the next card.
 *
 * Every answer is written through immediately, so leaving mid-deck loses nothing
 * and returning resumes at the first unrated card.
 */
const AssessmentScreen = ({ onExit, onFinished }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const {
    session, startCalibration, rate, goToCard, finishCalibration, cancelCalibration,
  } = useAssessment();

  // Opening this screen IS starting a calibration; the same-day rule is resolved
  // inside startCalibration. The ref guards against starting twice — the effect
  // re-runs while the first call is still in flight, since `session` does not
  // become non-null until it resolves.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || session) return;
    startedRef.current = true;
    startCalibration().catch((e) => {
      console.error('[Assessment] Could not start a calibration:', e);
      startedRef.current = false;
    });
  }, [session, startCalibration]);

  const current = session?.deck?.[session.index] ?? null;
  const ratedCount = session?.scores?.size ?? 0;
  const total = session?.deck?.length ?? 0;

  const handleRate = useCallback(async (score) => {
    if (!current) return;
    await rate(current.id, score);
    // Advance on tap — the answer is the navigation. Stop at the last card
    // rather than wrapping, so "finish" is a deliberate act.
    if (session && session.index < session.deck.length - 1) {
      goToCard(session.index + 1);
    }
  }, [current, rate, session, goToCard]);

  const handleFinish = useCallback(async () => {
    const summary = await finishCalibration();
    if (!summary) return;
    onFinished?.(summary);
  }, [finishCalibration, onFinished]);

  const handleExit = useCallback(() => {
    showDialog(
      t('assessment_exit_title'),
      t('assessment_exit_message'),
      [
        { text: t('cancel') },
        {
          text: t('assessment_exit_confirm'),
          style: 'destructive',
          onPress: () => {
            cancelCalibration();
            onExit?.();
          },
        },
      ],
    );
  }, [showDialog, t, cancelCalibration, onExit]);

  if (!session) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (total === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="cards-outline"
          title={t('assessment_no_values')}
          actionLabel={t('close')}
          onAction={onExit}
          testID="assessment-empty"
        />
      </SafeAreaView>
    );
  }

  const isLast = session.index === total - 1;
  const allRated = ratedCount === total;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <IconButton icon="close" onPress={handleExit} testID="assessment-exit" />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('assessment_title')}
          </Text>
          <Text style={[styles.headerMeta, { color: colors.mutedText }]}>
            {t('assessment_progress', { current: session.index + 1, total })}
          </Text>
        </View>
        {/* Balances the close button so the title stays centred. */}
        <View style={styles.headerSpacer} />
      </View>

      {/* Two plain Views rather than Paper's ProgressBar.
          On react-native-web that component ignores the height given to it and
          stretches to fill the remaining column — a 3px strip measured 1000px
          tall, covering the whole deck and swallowing every tap on a rating
          button. The bug is invisible on native and invisible to a render test,
          since the element is present and correctly sized in the tree; only a
          real browser shows it. A track and a fill are what the rest of the app
          already draws bars with anyway. */}
      <View
        style={[styles.progressTrack, { backgroundColor: colors.track }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: ratedCount }}
        testID="assessment-progress"
      >
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.primary,
              width: `${total ? Math.round((ratedCount / total) * 100) : 0}%`,
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.inner}>
          {session.isRecalibration ? (
            <Text style={[styles.notice, { color: colors.mutedText, backgroundColor: colors.selected }]}>
              {t('assessment_recalibration_notice')}
            </Text>
          ) : (
            <Text style={[styles.notice, { color: colors.mutedText, backgroundColor: colors.selected }]}>
              {t('assessment_new_record_notice', {
                date: formatDateKey(session.assessment.assessedOn, language),
              })}
            </Text>
          )}

          <View
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID={`assessment-card-${current?.key}`}
          >
            <Text style={[styles.valueName, { color: colors.text }]}>
              {valueName(current, t)}
            </Text>
            {!!valueDescription(current, t) && (
              <Text style={[styles.valueDesc, { color: colors.mutedText }]}>
                {valueDescription(current, t)}
              </Text>
            )}

            <View style={styles.scaleWrapper}>
              <ScaleInput
                scaleId={session.assessment.scale}
                value={current ? session.scores.get(current.id) : undefined}
                onChange={handleRate}
              />
            </View>
          </View>

          <View style={styles.navRow}>
            <Button
              onPress={() => goToCard(session.index - 1)}
              disabled={session.index === 0}
              testID="assessment-prev"
            >
              {t('back')}
            </Button>
            <Text style={[styles.ratedCount, { color: colors.mutedText }]}>
              {t('assessment_rated_count', { count: ratedCount })}
            </Text>
            <Button
              onPress={() => goToCard(session.index + 1)}
              disabled={isLast}
              testID="assessment-next"
            >
              {t('next')}
            </Button>
          </View>

          <View style={styles.finishBlock}>
            <Text style={[styles.finishHint, { color: colors.mutedText }]}>
              {allRated ? t('assessment_finish_all_rated') : t('assessment_finish_partial')}
            </Text>
            <Button
              mode="contained"
              onPress={handleFinish}
              disabled={ratedCount === 0}
              style={styles.finishButton}
              testID="assessment-finish"
            >
              {t('assessment_finish')}
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.lg,
    padding: SPACING.xl,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  finishBlock: {
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  finishButton: {
    marginTop: SPACING.md,
    minWidth: 200,
  },
  finishHint: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerMeta: {
    fontSize: FONT_SIZE.sm,
  },
  headerSpacer: {
    width: 48,
  },
  headerTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  navRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  notice: {
    borderRadius: BORDER_RADIUS.md,
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.lg,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  progressFill: {
    height: '100%',
  },
  progressTrack: {
    height: 3,
    overflow: 'hidden',
    width: '100%',
  },
  ratedCount: {
    fontSize: FONT_SIZE.sm,
  },
  safeArea: {
    flex: 1,
  },
  scaleWrapper: {
    marginTop: SPACING.xl,
  },
  valueDesc: {
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  valueName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
  },
});

AssessmentScreen.propTypes = {
  onExit: PropTypes.func,
  onFinished: PropTypes.func,
};

export default AssessmentScreen;
