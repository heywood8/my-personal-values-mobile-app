import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import RankedValueBars from '../components/charts/RankedValueBars';
import ComparisonBars from '../components/charts/ComparisonBars';
import SegmentedToggle from '../components/SegmentedToggle';
import EmptyState from '../components/EmptyState';
import { decodeShareCode, sharedResultItems } from '../services/ResultsShare';
import { formatDateKey } from '../utils/dateUtils';
import { COMPARE_METRICS, COMPARE_ORDERS, compareValues, comparisonSummary } from '../utils/comparison';
import {
  SPACING, FONT_SIZE, FONT_WEIGHT, BORDER_RADIUS, CONTENT_MAX_WIDTH,
} from '../styles/designTokens';

/**
 * Somebody else's ranking, opened from a link — and, for a reader who has one of
 * their own, the two of them side by side.
 *
 * A read-only screen, and the reasons are worth keeping. It writes nothing:
 * importing would resolve through the same-day rule and overwrite the reader's
 * own record for that date, and what arrives here is a friend's answer rather
 * than a backup of yours. Comparing does not change that — the reader's half of
 * the comparison is handed in as a prop, already loaded, so this screen still
 * owns no data and reads no database. A visitor who has never opened the app
 * before gets exactly the screen it always was.
 *
 * That is also why the comparison is a prop rather than a `useAssessment()` call.
 * The link is the whole of this screen's own data, and a version of it that
 * reached into the app's state would stop rendering for the one visitor it exists
 * for.
 *
 * It opens on the comparison when there is one to open on. Nothing is hidden by
 * that: every value the sender rated is in the comparison too, with their score
 * beside it, and the toggle reads their list alone in one tap. What it avoids is
 * a reader who has their own ranking having to discover that the interesting
 * question — where the two of you differ — is behind a control they did not look
 * for.
 *
 * A reader with no ranking is invited to make one, and the link survives it: the
 * deck opens over this screen and comes back to it, which is the only way "share
 * with a friend" reaches somebody who has not used the app yet.
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

const VIEWS = { COMPARE: 'compare', THEIRS: 'theirs' };

// Which categorical hue stands for whom. Fixed rather than positional, so the
// reader's own colour is their own colour on every list here — including the one
// that draws the sender alone.
const MINE_SLOT = 0;
const THEIRS_SLOT = 1;

const SharedResultsScreen = ({ code, onClose, own, onCalibrate }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();

  const { payload, error } = useMemo(() => decodeShareCode(code), [code]);
  // Names are resolved in *this* reader's language, which is why the link
  // carries keys — see the note in services/ResultsShare.js.
  const items = useMemo(() => sharedResultItems(payload, t), [payload, t]);

  // Null until the reader picks, so the defaults below can still move when the
  // reader's own records arrive — which they do a moment after this screen
  // mounts, and again if they go and rate the deck from here.
  const [chosenView, setChosenView] = useState(null);
  const [chosenMetric, setChosenMetric] = useState(null);
  const [order, setOrder] = useState(COMPARE_ORDERS.RANK);

  const myResults = own?.results ?? [];
  const myScale = own?.assessment?.scale;
  const myAlignment = own?.alignment ?? null;

  const canCompare = !!myScale && myResults.length > 0;
  const view = canCompare ? (chosenView ?? VIEWS.COMPARE) : VIEWS.THEIRS;

  const theySentAWheel = useMemo(
    () => items.some((item) => item.alignment !== null),
    [items],
  );
  // Offered as soon as EITHER side has a wheel: a comparison where one column is
  // empty still answers "what did they say about living by these", and hiding it
  // until both sides have one would hide the sender's own answers from a reader
  // who has never filled a wheel in.
  const canCompareAlignment = canCompare && (theySentAWheel || (myAlignment?.scores?.size ?? 0) > 0);
  const metric = canCompareAlignment ? (chosenMetric ?? COMPARE_METRICS.IMPORTANCE) : COMPARE_METRICS.IMPORTANCE;

  const rows = useMemo(() => (canCompare ? compareValues({
    mine: myResults,
    theirs: items,
    myAlignment: myAlignment?.scores,
    metric,
    order,
  }) : []), [canCompare, myResults, items, myAlignment, metric, order]);

  const summary = useMemo(() => comparisonSummary(rows), [rows]);

  /** The sender's wheel on its own, for the reader who has nothing to set it against. */
  const theirWheel = useMemo(() => (theySentAWheel ? compareValues({
    theirs: items,
    metric: COMPARE_METRICS.ALIGNMENT,
  }) : []), [theySentAWheel, items]);

  const sides = useMemo(() => [
    { id: 'mine', label: t('compare_you'), slot: MINE_SLOT, scaleId: myScale },
    { id: 'theirs', label: t('compare_them'), slot: THEIRS_SLOT, scaleId: payload?.scale },
  ], [t, myScale, payload]);

  const theirSideOnly = useMemo(
    () => [{ id: 'theirs', label: t('compare_them'), slot: THEIRS_SLOT, scaleId: payload?.scale }],
    [t, payload],
  );

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

  const summaryLines = (summary.shared === 0
    ? [t('compare_no_overlap')]
    : [
      t(metric === COMPARE_METRICS.ALIGNMENT ? 'compare_shared_count_alignment' : 'compare_shared_count', {
        count: summary.shared,
      }),
      summary.closeness === null ? null : t('compare_closeness', { percent: summary.closeness }),
      // Only about importance: the same band on the wheel means "living this one
      // well", which is a different sentence and not one this line is making.
      metric === COMPARE_METRICS.IMPORTANCE && summary.bothTop > 0
        ? t('compare_both_core', { count: summary.bothTop })
        : null,
    ]
  ).concat([
    summary.onlyMine > 0 ? t('compare_only_mine', { count: summary.onlyMine }) : null,
    summary.onlyTheirs > 0 ? t('compare_only_theirs', { count: summary.onlyTheirs }) : null,
  ]).filter(Boolean);

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

          {canCompare && (
            <View style={styles.controls}>
              <SegmentedToggle
                testID="shared-view-toggle"
                value={view}
                onChange={setChosenView}
                options={[
                  { value: VIEWS.COMPARE, label: t('compare_view_compare') },
                  { value: VIEWS.THEIRS, label: t('compare_view_theirs') },
                ]}
              />
            </View>
          )}

          {view === VIEWS.COMPARE ? (
            <View testID="shared-comparison">
              <View style={[styles.note, { backgroundColor: colors.selected }]}>
                <Text style={[styles.noteText, { color: colors.text }]}>{t('compare_note')}</Text>
              </View>

              <View style={styles.controls}>
                {canCompareAlignment && (
                  <SegmentedToggle
                    testID="compare-metric-toggle"
                    value={metric}
                    onChange={setChosenMetric}
                    options={[
                      { value: COMPARE_METRICS.IMPORTANCE, label: t('compare_metric_importance') },
                      { value: COMPARE_METRICS.ALIGNMENT, label: t('compare_metric_alignment') },
                    ]}
                  />
                )}
                {/* Most important first by default, like every other list in this
                    app; the other order answers the question a comparison is
                    actually opened for. */}
                <SegmentedToggle
                  testID="compare-order-toggle"
                  value={order}
                  onChange={setOrder}
                  options={[
                    { value: COMPARE_ORDERS.RANK, label: t('compare_sort_rank') },
                    { value: COMPARE_ORDERS.GAP, label: t('compare_sort_gap') },
                  ]}
                />
              </View>

              <View style={styles.summary} testID="compare-summary">
                {summaryLines.map((line) => (
                  <Text key={line} style={[styles.summaryLine, { color: colors.mutedText }]}>
                    {line}
                  </Text>
                ))}
              </View>

              {metric === COMPARE_METRICS.ALIGNMENT && (
                <Text style={[styles.summaryLine, { color: colors.mutedText }]}>
                  {t('alignment_row_hint')}
                </Text>
              )}

              <ComparisonBars
                rows={rows}
                sides={sides}
                metric={metric}
                testID="comparison-bars"
              />
            </View>
          ) : (
            <View testID="shared-their-results">
              <View style={[styles.note, { backgroundColor: colors.selected }]}>
                <Text style={[styles.noteText, { color: colors.text }]}>{t('share_view_note')}</Text>
              </View>

              <RankedValueBars items={items} scaleId={payload.scale} />

              {/* The wheel arrives only when the sender switched it on, and it is
                  a second list rather than a second column on the first: the
                  question it answers is not "how much does this matter" but "how
                  far am I from living it". */}
              {theySentAWheel && (
                <View style={styles.section} testID="shared-their-alignment">
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {t('share_view_alignment_title')}
                  </Text>
                  {!!payload.checkedOn && (
                    <Text style={[styles.summaryLine, { color: colors.mutedText }]}>
                      {t('share_view_alignment_checked_on', {
                        date: formatDateKey(payload.checkedOn, language),
                      })}
                    </Text>
                  )}
                  <Text style={[styles.summaryLine, { color: colors.mutedText }]}>
                    {t('alignment_row_hint')}
                  </Text>
                  <ComparisonBars
                    rows={theirWheel}
                    sides={theirSideOnly}
                    metric={COMPARE_METRICS.ALIGNMENT}
                    testID="their-alignment-bars"
                  />
                </View>
              )}
            </View>
          )}

          {/* The one route from a friend's link into the app's own reason to
              exist. Offered only where there is nothing to compare against yet,
              since afterwards the comparison is the invitation. */}
          {!canCompare && !!onCalibrate && (
            <View style={[styles.invite, { borderColor: colors.border }]} testID="shared-results-invite">
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('compare_invite_title')}
              </Text>
              <Text style={[styles.noteText, { color: colors.mutedText }]}>
                {t('compare_invite_body')}
              </Text>
              <Button
                mode="contained-tonal"
                onPress={onCalibrate}
                style={styles.inviteAction}
                testID="shared-results-calibrate"
              >
                {t('results_start')}
              </Button>
            </View>
          )}

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
  controls: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    marginTop: SPACING.md,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  invite: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: SPACING.xs,
    marginTop: SPACING.xxl,
    padding: SPACING.md,
  },
  inviteAction: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
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
  section: {
    marginTop: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  summary: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  summaryLine: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginBottom: SPACING.xs,
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
  /**
   * The reader's own half of the comparison, already loaded, or nothing at all —
   * a visitor who has never opened this app renders the same screen it always
   * was. `alignment` is one check-in as `{ checkedOn, scores }`, keyed by value
   * id, and is what the wheel comparison is drawn from.
   */
  own: PropTypes.shape({
    assessment: PropTypes.object,
    results: PropTypes.array,
    alignment: PropTypes.object,
  }),
  /** Opens the deck without losing the link. Absent where there is no route back. */
  onCalibrate: PropTypes.func,
};

export default SharedResultsScreen;
