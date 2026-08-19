import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  startCheckin,
  saveAlignment,
  clearAlignment,
  deleteCheckin as dbDeleteCheckin,
  getCheckins,
  getAlignmentHistory,
} from '../services/AlignmentDB';
import { localDateKey } from '../utils/dateUtils';
import { useValues } from './ValuesContext';
import { appEvents, EVENTS } from '../services/eventEmitter';

const AlignmentContext = createContext(null);

/** The scores of one date, as a Map keyed by value id. */
const scoresOn = (history, dateKey) => new Map(
  history
    .filter((row) => row.checkedOn === dateKey)
    .map((row) => [row.valueId, row.score]),
);

/** History rows in the order the query returns them: oldest date, then deck order. */
const inReadOrder = (rows, orderOf) => [...rows].sort((a, b) => (
  a.checkedOn === b.checkedOn
    ? orderOf(a.valueId) - orderOf(b.valueId)
    : a.checkedOn.localeCompare(b.checkedOn)
));

export const AlignmentProvider = ({ children }) => {
  const { values } = useValues();
  const [checkins, setCheckins] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Today's scores, held apart from `history` because they are written
   * optimistically: a rating button has to answer on the tap, not after a
   * database round trip. A failed write is reverted below rather than left
   * looking saved.
   *
   * Stamped with the date they belong to, and that stamp is load-bearing. An app
   * left open across midnight would otherwise go on presenting yesterday's
   * answers as today's — and worse, clearing one would resolve a check-in for the
   * NEW day, delete nothing from it, and leave the screen claiming an answer was
   * removed while it is still in the database and still in the export. When the
   * stamp no longer matches, the scores for the current date are read out of
   * `history` instead, which for a day nobody has touched yet is nothing at all.
   */
  const [entry, setEntry] = useState(() => ({ dateKey: localDateKey(), scores: new Map() }));

  // Mirrors for the callbacks below, which live across renders and must never
  // act on a copy from before midnight — or from before the last reload.
  const entryRef = useRef(entry);
  const historyRef = useRef(history);
  const valuesRef = useRef(values);
  useEffect(() => { entryRef.current = entry; }, [entry]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { valuesRef.current = values; }, [values]);

  /**
   * Write a score that just landed in the database into `history` as well.
   *
   * `history` is otherwise only ever assigned by `reload()`, which makes it a
   * snapshot that silently omits everything answered in this session — and
   * everything reads it: the coverage counts, the previous check-in, and the rows
   * a past wheel is drawn from. The day that gets hurt is the one that has just
   * stopped being today: open the app across midnight, tap yesterday's record as
   * the first thing you do, and it opened onto an empty wheel, because a tap on a
   * record row is state inside the screen and never re-renders this provider at
   * all. Folding each write in as it succeeds is what makes the copy true
   * continuously, instead of true only after something happens to re-read it.
   */
  const foldIntoHistory = useCallback((checkin, valueId, score) => {
    setHistory((prev) => {
      const without = prev.filter(
        (row) => !(row.checkedOn === checkin.checkedOn && row.valueId === valueId),
      );
      if (score === null) return without;

      const value = valuesRef.current.find((entry_) => entry_.id === valueId);
      const order = new Map(valuesRef.current.map((entry_) => [entry_.id, entry_.displayOrder]));
      return inReadOrder([...without, {
        checkinId: checkin.id,
        checkedOn: checkin.checkedOn,
        valueId,
        key: value?.key ?? valueId,
        isCustom: value?.isCustom ?? false,
        customName: value?.customName ?? null,
        score,
      }], (id) => order.get(id) ?? 0);
    });
  }, []);

  /** The scores that belong to the current date, whatever the state was stamped with. */
  const scoresForToday = useCallback(() => {
    const dateKey = localDateKey();
    return entryRef.current.dateKey === dateKey
      ? entryRef.current.scores
      : scoresOn(historyRef.current, dateKey);
  }, []);

  const todayDateKey = localDateKey();
  const todayScores = useMemo(
    () => (entry.dateKey === todayDateKey ? entry.scores : scoresOn(history, todayDateKey)),
    [entry, history, todayDateKey],
  );

  /**
   * Today's check-in row, resolved once and remembered.
   *
   * Memoised as the *promise* rather than the result, and keyed by date. Two
   * quick taps on a day with no check-in yet would otherwise both find nothing
   * and both insert, and `checked_on` is UNIQUE — the second would throw and
   * lose a rating. The date key is part of it because the app can be left open
   * across midnight, after which yesterday's row is the wrong answer.
   */
  const checkinRef = useRef({ dateKey: null, promise: null });

  const ensureCheckin = useCallback(() => {
    const dateKey = localDateKey();
    if (checkinRef.current.dateKey !== dateKey || !checkinRef.current.promise) {
      const promise = startCheckin({ today: dateKey }).catch((e) => {
        // Do not cache a rejected promise, or the next tap would re-throw the
        // same failure without retrying.
        checkinRef.current = { dateKey: null, promise: null };
        throw e;
      });
      checkinRef.current = { dateKey, promise };
    }
    return checkinRef.current.promise;
  }, []);

  const reload = useCallback(async () => {
    try {
      const [allCheckins, fullHistory] = await Promise.all([
        getCheckins(),
        getAlignmentHistory(),
      ]);
      const dateKey = localDateKey();
      setCheckins(allCheckins);
      setHistory(fullHistory);
      setEntry({ dateKey, scores: scoresOn(fullHistory, dateKey) });
    } catch (e) {
      console.error('[Alignment] Failed to load the check-ins:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * The date changed under a resident app: re-read.
   *
   * A tidy-up rather than a load-bearing repair — `history` is kept true by the
   * fold below, so nothing depends on this firing. It cannot be depended on
   * either: it is keyed on a date computed during THIS provider's render, and the
   * screen's own state (which check-in is being looked at) re-renders the screen
   * without ever re-rendering the provider. Settles in one pass, since `reload`
   * re-stamps the entry with today.
   */
  useEffect(() => {
    if (entry.dateKey !== todayDateKey) reload();
  }, [entry.dateKey, todayDateKey, reload]);

  useEffect(() => {
    const forget = () => { checkinRef.current = { dateKey: null, promise: null }; };
    const unsubReset = appEvents.on(EVENTS.DATABASE_RESET, () => {
      forget();
      reload();
    });
    const unsubChanged = appEvents.on(EVENTS.ALIGNMENT_CHANGED, () => {
      // An import or a deleted value may have replaced today's row underneath
      // us, so the remembered check-in is dropped along with the reload.
      forget();
      reload();
    });
    return () => {
      unsubReset();
      unsubChanged();
    };
  }, [reload]);

  /** One date's stored rows, value information included — a past wheel is drawn
   *  from these rather than from what is very important now. */
  const entriesOn = useCallback(
    (dateKey) => history.filter((row) => row.checkedOn === dateKey),
    [history],
  );

  /**
   * The check-in immediately before `dateKey` — the dashed outline the wheel
   * draws behind a fill, and the "was N" beside a row.
   *
   * Strictly before, so today's outline is never a ghost of the answers being
   * given right now. Only a date that actually carries scores counts: a check-in
   * whose ratings were all cleared has nothing to compare against.
   */
  const previousBefore = useCallback((dateKey) => {
    const dates = [...new Set(history.map((row) => row.checkedOn))]
      .filter((date) => date < dateKey)
      .sort();
    const checkedOn = dates[dates.length - 1];
    if (!checkedOn) return null;
    const scores = scoresOn(history, checkedOn);
    return { checkedOn, scores, count: scores.size };
  }, [history]);

  const previous = useMemo(() => previousBefore(localDateKey()), [previousBefore]);

  /**
   * The most recent check-in that carries anything: today's once today has been
   * answered, and otherwise the last day that was.
   *
   * What a share link offers to send, and what a comparison against somebody
   * else's link reads. Built from the same two sources as everything else here —
   * today's optimistic scores, and a `history` that is folded into as each write
   * lands — so it is true for an answer given a moment ago as well as for one
   * from June. `previousBefore` already skips a date whose scores were all
   * cleared, which is the same "a check-in exists when it has a score" rule the
   * records list is filtered by.
   */
  const latestCheckin = useMemo(() => (
    todayScores.size > 0
      ? { checkedOn: todayDateKey, scores: todayScores, count: todayScores.size }
      : previousBefore(todayDateKey)
  ), [todayScores, todayDateKey, previousBefore]);

  /** Record one value's alignment into today's check-in, creating it if needed. */
  const setAlignment = useCallback(async (valueId, score) => {
    const dateKey = localDateKey();
    const base = scoresForToday();
    const previousScore = base.get(valueId);

    setEntry({ dateKey, scores: new Map(base).set(valueId, score) });

    try {
      const checkin = await ensureCheckin();
      await saveAlignment(checkin.id, valueId, score);
      foldIntoHistory(checkin, valueId, score);
      // The row may be brand new; the records list below the wheel has to know
      // about it without a full re-read of the history.
      setCheckins((prev) => (
        prev.some((entry) => entry.id === checkin.id)
          ? prev
          : [...prev, { id: checkin.id, checkedOn: checkin.checkedOn }]
            .sort((a, b) => a.checkedOn.localeCompare(b.checkedOn))
      ));
    } catch (e) {
      console.error('[Alignment] Failed to save a check-in score:', e);
      const reverted = new Map(base);
      if (previousScore === undefined) reverted.delete(valueId);
      else reverted.set(valueId, previousScore);
      setEntry({ dateKey, scores: reverted });
    }
  }, [ensureCheckin, scoresForToday, foldIntoHistory]);

  /** Drop one value's answer for today, emptying its sector again. */
  const clearToday = useCallback(async (valueId) => {
    const dateKey = localDateKey();
    const base = scoresForToday();
    const previousScore = base.get(valueId);
    if (previousScore === undefined) return;

    const cleared = new Map(base);
    cleared.delete(valueId);
    setEntry({ dateKey, scores: cleared });

    try {
      const checkin = await ensureCheckin();
      await clearAlignment(checkin.id, valueId);
      foldIntoHistory(checkin, valueId, null);
    } catch (e) {
      console.error('[Alignment] Failed to clear a check-in score:', e);
      setEntry({ dateKey, scores: new Map(base).set(valueId, previousScore) });
    }
  }, [ensureCheckin, scoresForToday, foldIntoHistory]);

  const deleteCheckin = useCallback(async (checkinId) => {
    await dbDeleteCheckin(checkinId);
    checkinRef.current = { dateKey: null, promise: null };
    await reload();
  }, [reload]);

  /**
   * How many scores each date carries. One source, because `history` is folded
   * into as each write lands and is therefore true for today as well as for every
   * date behind it.
   */
  const coverage = useMemo(() => {
    const counts = new Map();
    for (const row of history) {
      counts.set(row.checkedOn, (counts.get(row.checkedOn) ?? 0) + 1);
    }
    return counts;
  }, [history]);

  /**
   * The records list. Today's row is in it only while it still carries a score:
   * `getCheckins()` filters empty rows out on a read, but the row this session
   * created is held here optimistically, and clearing its last answer has to take
   * it back out rather than leave a dated entry that opens onto nothing.
   */
  const records = useMemo(() => checkins.filter(
    (checkin) => checkin.checkedOn !== todayDateKey || todayScores.size > 0,
  ), [checkins, todayScores, todayDateKey]);

  const value = useMemo(() => ({
    checkins: records,
    history,
    isLoading,
    todayScores,
    coverage,
    previous,
    latestCheckin,
    entriesOn,
    previousBefore,
    setAlignment,
    clearToday,
    deleteCheckin,
    reload,
  }), [
    records, history, isLoading, todayScores, coverage, previous, latestCheckin, entriesOn,
    previousBefore, setAlignment, clearToday, deleteCheckin, reload,
  ]);

  return (
    <AlignmentContext.Provider value={value}>
      {children}
    </AlignmentContext.Provider>
  );
};

AlignmentProvider.propTypes = {
  children: PropTypes.node,
};

export const useAlignment = () => useContext(AlignmentContext);
