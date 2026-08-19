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
import CalibrationSettings from '../components/CalibrationSettings';
import DeckImportPanel from '../components/DeckImportPanel';
import DeckCardText from '../components/DeckCardText';
import PurposeNote from '../components/PurposeNote';
import EmptyState from '../components/EmptyState';
import { formatDateKey } from '../utils/dateUtils';
import {
  BORDER_RADIUS, FONT_SIZE, SPACING, CONTENT_MAX_WIDTH, LINE_HEIGHT, LETTER_SPACING,
  elevation,
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
 *
 * The first card also carries the language and scale switches — this screen is
 * where a first run begins, there being no setup in front of it any more, and
 * those two settings have to be reachable before the deck is 47 cards deep. While
 * the reader has no records at all it carries the CSV import as well (`canImport`),
 * for the same reason: the settings screen that holds it is behind results this
 * reader does not have yet.
 */
const AssessmentScreen = ({ canExit, canImport, onExit, onFinished, onImported }) => {
  const { t, language } = useLocalization();
  const { colors, mode } = useThemeColors();
  const { showDialog } = useDialog();
  const {
    session, startCalibration, rate, goToCard, finishCalibration, cancelCalibration, setScale,
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
          actionLabel={canExit ? t('close') : undefined}
          onAction={canExit ? onExit : undefined}
          testID="assessment-empty"
        />
      </SafeAreaView>
    );
  }

  const isLast = session.index === total - 1;
  const allRated = ratedCount === total;
  const isFirstCard = session.index === 0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {/* No close button on a first run: there are no results yet, so there is
            no screen behind this one to close onto. What used to be back there
            was the scale question, and that is on the card now. */}
        {canExit
          ? <IconButton icon="close" onPress={handleExit} testID="assessment-exit" />
          : <View style={styles.headerSpacer} />}
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
        accessibilityLabel={t('assessment_progress_label')}
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
          {/* Neutral rather than tinted, and that is the one thing separating
              it from the purpose note directly underneath: two tinted blocks
              back to back read as one block with a rule through it, and this is
              the lesser of the two — it states a date, the note states what the
              whole exercise is for. */}
          {session.isRecalibration ? (
            <Text style={[styles.notice, { color: colors.mutedText, backgroundColor: colors.secondary }]}>
              {t('assessment_recalibration_notice')}
            </Text>
          ) : (
            <Text style={[styles.notice, { color: colors.mutedText, backgroundColor: colors.secondary }]}>
              {t('assessment_new_record_notice', {
                date: formatDateKey(session.assessment.assessedOn, language),
              })}
            </Text>
          )}

          {/* On every card, not only the first: a deck of 47 cards is answered
              over more than one sitting, and the sentence has to be there
              whenever somebody is looking at it rather than only at the moment
              they started. It is the same block on every card, so it costs the
              rating buttons a fixed offset and never moves them. */}
          <PurposeNote />

          {/* Above the card rather than below it, so it is on screen without
              scrolling on the narrowest phone this ships to — the whole point of
              moving these two settings here was that they be seen. */}
          {isFirstCard && (
            <CalibrationSettings
              scale={session.assessment.scale}
              onScaleChange={setScale}
            />
          )}

          {/* Only where there is nothing to go back to — the one run whose
              reader cannot reach the settings screen's copy of this. On a
              recalibration it would be a second door beside a door, on the
              screen least in need of another thing to scroll past. */}
          {isFirstCard && canImport && <DeckImportPanel onImported={onImported} />}

          {/* The one thing on the screen being asked about, and the only
              element on it raised to level 3. Everything above it — the notice,
              the purpose note, the settings — is context, and on the first card
              there is a lot of it; without a difference in plane the card being
              rated was the fourth panel down rather than the subject. */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
              elevation(3, mode),
            ]}
            testID={`assessment-card-${current?.key}`}
          >
            {/* Fixed height across the deck: descriptions run one line to four,
                and letting the card size itself moves every rating button by up
                to three lines from one card to the next. */}
            <DeckCardText deck={session.deck} value={current} />

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
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.xl,
    padding: SPACING.xxl,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
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
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
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
    letterSpacing: LETTER_SPACING.wide,
  },
  headerSpacer: {
    width: 48,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    letterSpacing: LETTER_SPACING.snug,
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
    borderRadius: BORDER_RADIUS.lg,
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * LINE_HEIGHT.relaxed,
    marginTop: SPACING.lg,
    overflow: 'hidden',
    padding: SPACING.md,
  },
  progressFill: {
    borderBottomRightRadius: BORDER_RADIUS.pill,
    borderTopRightRadius: BORDER_RADIUS.pill,
    height: '100%',
  },
  progressTrack: {
    borderRadius: BORDER_RADIUS.pill,
    // Thicker than the 3px hairline it was, and inset from the screen edges so
    // it reads as a measure of the deck rather than as a seam between the
    // header and the cards.
    height: 6,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    overflow: 'hidden',
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
});

AssessmentScreen.propTypes = {
  // Whether there is anywhere to go back to. False for the very first run, which
  // opens on this screen and has no results behind it.
  canExit: PropTypes.bool,
  // Whether this reader can reach the CSV import any other way. It used to be
  // read off `canExit`, which said the same thing until a run could be started
  // from a friend's link — that has somewhere to land and still no records, so
  // the two questions came apart and the import needs its own answer.
  canImport: PropTypes.bool,
  onExit: PropTypes.func,
  onFinished: PropTypes.func,
  // Records arrived from a CSV file instead of from the deck. Only the shell
  // knows what that means for what is on screen next.
  onImported: PropTypes.func,
};

export default AssessmentScreen;
