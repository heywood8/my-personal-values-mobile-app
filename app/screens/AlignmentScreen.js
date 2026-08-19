import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { useValues } from '../contexts/ValuesContext';
import { useDialog } from '../contexts/DialogContext';
import AlignmentWheel from '../components/charts/AlignmentWheel';
import ScaleInput from '../components/ScaleInput';
import PurposeNote from '../components/PurposeNote';
import EmptyState from '../components/EmptyState';
import { valueName, valueDescription } from '../utils/valueNames';
import { formatDateKey, localDateKey } from '../utils/dateUtils';
import { ALIGNMENT_INPUT_SCALE, ALIGNMENT_MAX, trackedValues } from '../utils/alignment';
import {
  SPACING, FONT_SIZE, BORDER_RADIUS, CONTENT_MAX_WIDTH, HEIGHTS,
} from '../styles/designTokens';

/**
 * The second list: how far behaviour matches the values that matter most.
 *
 * Membership is derived, not chosen. Whatever the last calibration put in the top
 * priority band is what today's wheel has sectors for — which is what keeps this
 * a second *list* rather than a second deck, and what stops it from quietly
 * becoming a place to track a value the reader already called peripheral.
 *
 * A PAST check-in is drawn from its own stored rows, never from today's
 * membership. That is the whole reason the record is worth keeping: a
 * recalibration changes what the wheel asks about, and redrawing June's answers
 * on July's wheel would show sectors that were never scored that day and hide the
 * ones that were.
 *
 * Nothing is prefilled. The deck refuses to seed a new day from the last run
 * because it would anchor the answer, and an alignment score is the more
 * anchor-prone of the two measurements — so the previous check-in appears as a
 * dashed shape behind the wheel, which is context, and its number appears beside
 * a row only once that row has been answered, which is feedback.
 *
 * A sector is numbered and nothing else, so pointing at one — a hover on the
 * web, a tap on a phone — marks it and names it here, under the wheel: the value
 * it stands for and the same description the card was rated on. The text lives
 * on this screen rather than inside the canvas for the same reason the two
 * captions do, and it sits below the lower caption rather than between the two,
 * because those two are bound to the wheel by their position.
 */
const AlignmentScreen = ({ onStartCalibration }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const { showDialog } = useDialog();
  const { latest, results, isLoading: assessmentLoading } = useAssessment();
  const { values } = useValues();
  const {
    checkins, todayScores, coverage, previous, entriesOn, previousBefore, isLoading,
    setAlignment, clearToday, deleteCheckin,
  } = useAlignment();

  // The date being looked at, or null for today. Today is the only one that can
  // be answered, because a score written now belongs to now — but "today" is a
  // property of the date, not of how the reader got here: today's own row is in
  // the records list below, and tapping it must land on the live wheel rather
  // than on a read-only copy of it.
  const [viewing, setViewing] = useState(null);

  /** The value whose sector is being pointed at, or null. */
  const [pointed, setPointed] = useState(null);

  /**
   * What today's wheel has sectors for: the current ask, plus anything today
   * already carries an answer for.
   *
   * The second half is not defensive tidiness. Membership comes from the latest
   * *completed* assessment, and reopening a calibration clears `completed_at` —
   * so backing out of a recalibration can leave that query with nothing to return
   * while today's check-in sits fully answered in the database. Deriving the rows
   * from membership alone would show an empty wheel over real data with no way
   * back to it. A recalibration that merely moves a value out of the top band has
   * the same shape: this morning's score stays visible and editable for the rest
   * of the day rather than disappearing mid-sentence.
   */
  const valuesById = useMemo(() => new Map(values.map((value) => [value.id, value])), [values]);

  const archivedIds = useMemo(
    () => new Set(values.filter((value) => value.archived).map((value) => value.id)),
    [values],
  );

  /**
   * The current ask. The archived set comes from the catalogue rather than from
   * the ranking, because the ranking is a snapshot and archiving is not — see
   * `trackedValues`.
   */
  const tracked = useMemo(() => trackedValues(results, archivedIds), [results, archivedIds]);

  const todayRows = useMemo(() => {
    const asked = new Set(tracked.map((value) => value.valueId));
    // Read off today's scores, which are the live truth — not off `history`,
    // which is re-read on an event and therefore does not yet contain an answer
    // given a moment ago. A recalibration finished in this session moves a value
    // out of the top band the instant it lands, and reading the stale copy would
    // take this morning's score off the wheel while leaving it in the database.
    const carried = [...todayScores.keys()]
      .filter((valueId) => !asked.has(valueId))
      .map((valueId) => valuesById.get(valueId))
      .filter(Boolean)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((value) => ({
        valueId: value.id,
        key: value.key,
        isCustom: value.isCustom,
        customName: value.customName,
      }));
    return [...tracked, ...carried];
  }, [tracked, todayScores, valuesById]);

  /**
   * The wheel being looked at, whichever it is.
   *
   * Numbering runs over whatever list this view holds, because a sector number is
   * a legend key for the wheel on screen and nothing more — it is never stored,
   * and it never lines a value up across two dates. That is what `valueId` is
   * for, and it is what the dashed outline and the "was" below are matched on.
   */
  /**
   * Most important is at the top, everywhere — including inside a record.
   *
   * A past check-in's own rows come back in deck order, which is the order they
   * were stored in and no kind of ranking at all. The importance ranking of the
   * day it was filled in is not recoverable, so the current one is used and
   * anything it does not name follows in deck order. That keeps a record's rows
   * reading the same direction as today's, which is what the whole app does.
   */
  const rankOf = useMemo(() => {
    const positions = new Map(tracked.map((value, index) => [value.valueId, index]));
    return (valueId) => (positions.has(valueId) ? positions.get(valueId) : Number.MAX_SAFE_INTEGER);
  }, [tracked]);

  const view = useMemo(() => {
    const today = localDateKey();
    // Not `!viewing`: selecting today's own record from the list below sets a
    // date like any other row, and reading that back as "a past check-in" would
    // render today from `history` — which does not yet hold the answers given in
    // this session, because those are written optimistically. The screen went
    // blank exactly there.
    const isToday = !viewing || viewing === today;
    const entries = isToday ? null : [...entriesOn(viewing)].sort(
      (a, b) => rankOf(a.valueId) - rankOf(b.valueId),
    );
    return {
      date: isToday ? today : viewing,
      isToday,
      rows: (entries || todayRows).map((row, index) => ({ ...row, sector: index + 1 })),
      scores: entries
        ? new Map(entries.map((row) => [row.valueId, row.score]))
        : todayScores,
      previous: isToday ? previous : previousBefore(viewing),
    };
  }, [viewing, entriesOn, todayRows, todayScores, previous, previousBefore, rankOf]);

  const sectors = useMemo(() => view.rows.map((row) => ({
    valueId: row.valueId,
    key: row.key,
    sector: row.sector,
    score: view.scores.get(row.valueId),
  })), [view]);

  const ratedCount = useMemo(
    () => sectors.filter((sector) => sector.score !== undefined).length,
    [sectors],
  );

  /**
   * The sector being pointed at, and the row behind it.
   *
   * Derived from the wheel on screen rather than cleared by hand, because the
   * wheel is redrawn from a different set of rows every time another record is
   * opened — and a value that is not on this one must not go on marking a sector
   * that now belongs to somebody else. Off the wheel is the same as nothing
   * pointed at.
   */
  const active = useMemo(() => {
    const index = sectors.findIndex((sector) => sector.valueId === pointed);
    return index < 0 ? null : { sector: sectors[index], row: view.rows[index] };
  }, [sectors, view, pointed]);

  /**
   * Whether the earlier check-in shares any value with the wheel on screen.
   *
   * Two check-ins routinely cover different sets, and when they overlap in
   * nothing the wheel draws no outline at all — so the sentence pointing at "the
   * dotted outline" had nothing to point at.
   */
  const previousIsDrawn = useMemo(
    () => !!view.previous && sectors.some((sector) => view.previous.scores.has(sector.valueId)),
    [view, sectors],
  );

  const handleDelete = useCallback((checkin) => {
    showDialog(
      t('alignment_delete_confirm_title'),
      t('alignment_delete_confirm_message', {
        date: formatDateKey(checkin.checkedOn, language),
      }),
      [
        { text: t('cancel') },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            // Or the screen would go on showing a wheel that no longer exists.
            setViewing((current) => (current === checkin.checkedOn ? null : current));
            deleteCheckin(checkin.id).catch((e) => {
              console.error('[Alignment] Failed to delete a check-in:', e);
            });
          },
        },
      ],
    );
  }, [showDialog, t, language, deleteCheckin]);

  if (assessmentLoading || isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Guarded on the rows and the records, not on the ranking: a wheel that still
  // holds answers is never traded for an empty screen.
  if (todayRows.length === 0 && checkins.length === 0) {
    const nothingRanked = !latest || results.length === 0;
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="target"
          title={t(nothingRanked ? 'alignment_empty_title' : 'alignment_none_title')}
          body={t(nothingRanked ? 'alignment_empty_body' : 'alignment_none_body')}
          // Offered only where it is genuinely the next step. Where a ranking
          // exists but nothing reached the top of it, a button back into the deck
          // would read as "your answers were wrong"; the wheel appears on its own
          // the next time something does reach the top.
          actionLabel={nothingRanked ? t('results_start') : undefined}
          onAction={nothingRanked ? onStartCalibration : undefined}
          testID={nothingRanked ? 'alignment-empty' : 'alignment-none'}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.contentContainer}
      testID="alignment-screen"
    >
      <View style={styles.inner}>
        {view.isToday ? (
          <>
            <Text style={[styles.meta, { color: colors.mutedText }]}>
              {latest
                ? `${t('alignment_value_count', { count: view.rows.length })} · ${t('alignment_from_calibration', { date: formatDateKey(latest.assessedOn, language) })}`
                : t('alignment_value_count', { count: view.rows.length })}
            </Text>
            <Text style={[styles.intro, { color: colors.mutedText }]}>{t('alignment_intro')}</Text>
            {/* Only where there is a wheel to answer. A past check-in is read
                back rather than filled in, and on a day with no sectors at all
                the note would be answering a question nobody is being asked. */}
            {view.rows.length > 0 && <PurposeNote />}
          </>
        ) : (
          <View
            style={[styles.viewingBanner, { backgroundColor: colors.selected }]}
            testID="alignment-viewing"
          >
            <Text style={[styles.viewingTitle, { color: colors.text }]}>
              {t('alignment_viewing_title', { date: formatDateKey(view.date, language) })}
            </Text>
            <Text style={[styles.intro, { color: colors.mutedText }]}>
              {t('alignment_viewing_body')}
            </Text>
            <Button
              mode="contained-tonal"
              onPress={() => setViewing(null)}
              style={styles.backToToday}
              testID="alignment-back-to-today"
            >
              {t('alignment_back_to_today')}
            </Button>
          </View>
        )}

        {/* Nothing is on the wheel, but there are records to look through: the
            annotations, the wheel and the rating rows all describe a wheel that
            is not being drawn, so none of them is rendered. The records list
            below still is — it is the way back to a check-in that does have
            something in it. */}
        {view.rows.length === 0 && (
          <View style={[styles.notice, { backgroundColor: colors.selected }]} testID="alignment-notice">
            <Text style={[styles.viewingTitle, { color: colors.text }]}>
              {t('alignment_none_title')}
            </Text>
            <Text style={[styles.intro, { color: colors.mutedText }]}>
              {t('alignment_none_body')}
            </Text>
          </View>
        )}

        {view.rows.length > 0 && (
          <>
            {/* The two annotations from the instrument, kept as sentences on the
            app's type scale rather than pushed inside the SVG. Position carries
            the binding — the rim's sentence above the wheel, the centre's below
            it — and `alignment_row_hint` names both ends in words for the reader
            who is about to answer. */}
            <Text style={[styles.edgeLabel, { color: colors.text }]} testID="alignment-outer-label">
              {t('alignment_outer_label')}
            </Text>

            <AlignmentWheel
              sectors={sectors}
              previousScores={view.previous?.scores}
              accessibilityLabel={t('alignment_wheel_label', {
                rated: ratedCount,
                total: view.rows.length,
              })}
              activeValueId={active?.sector.valueId ?? null}
              onActivate={setPointed}
            />

            <Text style={[styles.edgeLabel, { color: colors.text }]} testID="alignment-inner-label">
              {t('alignment_inner_label')}
            </Text>

            {/* What the sector being pointed at stands for. The slot is always
                here, holding the sentence that says the wheel can be pointed at
                when nothing is — a panel that appears out of nowhere is a panel
                nobody knew to look for, and a slot that comes and goes moves
                everything below it on every hover. */}
            <View
              style={[styles.detail, { backgroundColor: colors.selected }]}
              testID="alignment-detail"
            >
              {active ? (
                <>
                  <View style={styles.detailHeader}>
                    {/* The same badge the row below carries, because the number
                        is the only thing the wheel itself says. */}
                    <View style={[styles.badge, { backgroundColor: colors.card }]}>
                      <Text style={[styles.badgeLabel, { color: colors.text }]}>
                        {String(active.sector.sector)}
                      </Text>
                    </View>
                    <Text
                      style={[styles.detailName, { color: colors.text }]}
                      testID="alignment-detail-name"
                    >
                      {valueName(active.row, t)}
                    </Text>
                  </View>
                  {/* A custom value has no description to show — there is nothing
                      to translate one into — so its row simply names itself. */}
                  {!!valueDescription(active.row, t) && (
                    <Text
                      style={[styles.detailBody, { color: colors.mutedText }]}
                      testID="alignment-detail-description"
                    >
                      {valueDescription(active.row, t)}
                    </Text>
                  )}
                </>
              ) : (
                <Text
                  style={[styles.detailHint, { color: colors.mutedText }]}
                  testID="alignment-detail-hint"
                >
                  {t('alignment_sector_hint')}
                </Text>
              )}
            </View>

            {view.isToday && (
              <Text style={[styles.status, { color: colors.mutedText }]} testID="alignment-status">
                {ratedCount > 0
                  ? t('alignment_checked_today', { rated: ratedCount, total: view.rows.length })
                  : t('alignment_not_checked_today')}
              </Text>
            )}

            {previousIsDrawn && (
              <Text
                style={[styles.status, { color: colors.mutedText }]}
                testID="alignment-previous-hint"
              >
                {t('alignment_previous_hint', {
                  date: formatDateKey(view.previous.checkedOn, language),
                  count: view.previous.count,
                })}
              </Text>
            )}

            {view.isToday && (
              <Text style={[styles.rowHint, { color: colors.mutedText }]}>
                {t('alignment_row_hint')}
              </Text>
            )}

            <View style={styles.rows}>
              {sectors.map((sector, index) => {
                const rated = sector.score !== undefined;
                const value = view.rows[index];
                const description = valueDescription(value, t);
                // Shown only once this row has been answered: feedback on what was
                // just given, rather than a number sitting above the buttons while
                // the reader is still deciding.
                const was = rated ? view.previous?.scores.get(sector.valueId) : undefined;

                // Marked along with its sector, so pointing at a wedge says which
                // row to answer. Read-only reinforcement: the row is not what
                // marks it, and pointing is a property of the wheel.
                const marked = active?.sector.valueId === sector.valueId;

                return (
                  <View
                    key={sector.valueId}
                    style={[
                      styles.row,
                      { borderColor: marked ? colors.primary : colors.border },
                      marked && { backgroundColor: colors.selected },
                    ]}
                    testID={`alignment-row-${sector.key}`}
                  >
                    <View style={styles.rowHeader}>
                      {/* The number IS the sector's label on the wheel — this list is
                      the legend, which is what lets the wheel stay readable at
                      twenty-five values as well as at eight. */}
                      <View style={[styles.badge, { backgroundColor: colors.selected }]}>
                        <Text style={[styles.badgeLabel, { color: colors.text }]}>
                          {String(sector.sector)}
                        </Text>
                      </View>

                      <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                        {valueName(value, t)}
                      </Text>

                      <Text style={[styles.score, { color: colors.mutedText }]}>
                        {rated ? `${sector.score}/${ALIGNMENT_MAX}` : t('alignment_unrated')}
                      </Text>

                      {view.isToday && rated && (
                        <IconButton
                          icon="close"
                          size={16}
                          iconColor={colors.mutedText}
                          accessibilityLabel={t('alignment_clear')}
                          onPress={() => clearToday(sector.valueId)}
                          testID={`alignment-clear-${sector.key}`}
                        />
                      )}
                    </View>

                    {/* The wording the value was rated on, printed rather than
                    revealed behind a tap the way the ranking does it: that list
                    is being read, and 47 descriptions at once is a wall of text,
                    while this row is being answered — and "how far does my
                    behaviour match this" is a question about the sentence rather
                    than about the one word above it. The deck card prints the
                    same text while the same value is being rated. Only the top
                    band is here, and the text is printed whether or not the row
                    is answered, so it never moves the buttons under the thumb.
                    The panel under the wheel prints it too, but that answers the
                    wheel's own question — what the sector being pointed at
                    stands for — one value at a time and only while it is being
                    pointed at; this is the same sentence where the answer is
                    actually given. A custom value has none, and prints
                    nothing. */}
                    {!!description && (
                      <Text
                        style={[styles.description, { color: colors.mutedText }]}
                        testID={`alignment-description-${sector.key}`}
                      >
                        {description}
                      </Text>
                    )}

                    {/* The dashed outline is a shape, and a shape cannot be read
                    aloud — this is the same comparison in words. */}
                    {was !== undefined && (
                      <Text
                        style={[styles.was, { color: colors.mutedText }]}
                        testID={`alignment-was-${sector.key}`}
                      >
                        {t('alignment_was', { score: `${was}/${ALIGNMENT_MAX}` })}
                      </Text>
                    )}

                    {view.isToday && (
                      <ScaleInput
                        scaleId={ALIGNMENT_INPUT_SCALE}
                        value={sector.score}
                        onChange={(score) => setAlignment(sector.valueId, score)}
                        testIDPrefix={`alignment-${sector.key}`}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {checkins.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('alignment_records_title')}
            </Text>
            <Text style={[styles.status, { color: colors.mutedText }]}>
              {t('alignment_records_count', { count: checkins.length })}
            </Text>

            {[...checkins].reverse().map((checkin) => {
              const open = viewing === checkin.checkedOn;
              return (
                <View
                  key={checkin.id}
                  style={[styles.recordRow, { borderBottomColor: colors.border }]}
                  testID={`checkin-${checkin.checkedOn}`}
                >
                  {/* A dated record whose only affordance is a delete button is
                      not a tracked list. Tapping one redraws the wheel above as
                      it was filled in that day. */}
                  <Pressable
                    style={styles.recordOpen}
                    onPress={() => setViewing(open ? null : checkin.checkedOn)}
                    accessibilityRole="button"
                    // Named by the row it opens. Every row reading "open this
                    // check-in" leaves a screen reader with a list of identical
                    // buttons, and which one is open said in colour only.
                    accessibilityLabel={[
                      formatDateKey(checkin.checkedOn, language),
                      t('alignment_record_coverage', {
                        count: coverage.get(checkin.checkedOn) ?? 0,
                      }),
                      // Said in the name as well as in `aria-expanded`: a
                      // record row is a date and a coverage count, and "which
                      // one am I looking at" is worth stating outright rather
                      // than leaving to a state flag the reader has to ask for.
                      open ? t('alignment_record_open') : null,
                    ].filter(Boolean).join(' — ')}
                    // `expanded`, not `selected`: the row opens the wheel above
                    // it, and it is the state a button actually exposes —
                    // `aria-selected` is dropped on a button role. Written as an
                    // `aria-*` prop because react-native-web ignores
                    // `accessibilityState`; React Native folds it back for
                    // native.
                    aria-expanded={open}
                    testID={`open-checkin-${checkin.checkedOn}`}
                  >
                    <Text
                      style={[
                        styles.recordDate,
                        open && styles.recordDateOpen,
                        { color: open ? colors.primary : colors.text },
                      ]}
                    >
                      {formatDateKey(checkin.checkedOn, language)}
                    </Text>
                    <Text style={[styles.recordCoverage, { color: colors.mutedText }]}>
                      {t('alignment_record_coverage', {
                        count: coverage.get(checkin.checkedOn) ?? 0,
                      })}
                    </Text>
                  </Pressable>
                  <IconButton
                    icon="trash-can-outline"
                    size={20}
                    iconColor={colors.mutedText}
                    accessibilityLabel={t('alignment_delete_record')}
                    onPress={() => handleDelete(checkin)}
                    testID={`delete-checkin-${checkin.checkedOn}`}
                  />
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  backToToday: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
  },
  badge: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: SPACING.xs,
  },
  badgeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  description: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  detail: {
    borderRadius: BORDER_RADIUS.md,
    // Room for a name and a line of description, so the hint and the shortest
    // answer are the same height and a hover does not shuffle the page.
    minHeight: 72,
    padding: SPACING.md,
  },
  detailBody: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  detailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  detailHint: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
  },
  detailName: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  edgeLabel: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginVertical: SPACING.sm,
    textAlign: 'center',
  },
  fill: {
    flex: 1,
  },
  inner: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  intro: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  meta: {
    fontSize: FONT_SIZE.sm,
  },
  name: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
  },
  notice: {
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  recordCoverage: {
    fontSize: FONT_SIZE.sm,
  },
  recordDate: {
    fontSize: FONT_SIZE.base,
  },
  recordDateOpen: {
    // Weight as well as colour: which record is open must survive a monochrome
    // or colour-vision-deficient reading, as everything else in this app does.
    fontWeight: '700',
  },
  recordOpen: {
    flex: 1,
    paddingVertical: SPACING.sm,
  },
  recordRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  row: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    // Tall enough for the clear button whether or not it is there. Without it
    // the row grew the moment it was answered and pushed every row below it
    // down — the list-shaped version of the deck's rule that the rating buttons
    // do not move under the thumb.
    minHeight: HEIGHTS.scaleStep,
  },
  rowHint: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.md,
  },
  rows: {
    marginTop: SPACING.xs,
  },
  score: {
    fontSize: FONT_SIZE.sm,
  },
  section: {
    marginTop: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  status: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  viewingBanner: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  viewingTitle: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  was: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
});

AlignmentScreen.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default AlignmentScreen;
