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
import { appEvents, EVENTS } from '../services/eventEmitter';

const AlignmentContext = createContext(null);

/** The scores of one date, as a Map keyed by value id. */
const scoresOn = (history, dateKey) => new Map(
  history
    .filter((row) => row.checkedOn === dateKey)
    .map((row) => [row.valueId, row.score]),
);

export const AlignmentProvider = ({ children }) => {
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
  useEffect(() => { entryRef.current = entry; }, [entry]);
  useEffect(() => { historyRef.current = history; }, [history]);

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
   * The optimistic copy is stamped with the day it belongs to and is about to
   * stop being the live one, so the database has to become the source again —
   * otherwise yesterday's answers, which were only ever written optimistically,
   * are absent from every count until the next launch. Settles in one pass:
   * `reload` re-stamps the entry with today, and the condition is then false.
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

  /** Record one value's alignment into today's check-in, creating it if needed. */
  const setAlignment = useCallback(async (valueId, score) => {
    const dateKey = localDateKey();
    // A write is what crosses midnight here, and it stamps the new date itself —
    // so the effect above never sees the transition, and this is where the
    // superseded day gets re-read instead.
    const crossedMidnight = entryRef.current.dateKey !== dateKey;
    const base = scoresForToday();
    const previousScore = base.get(valueId);

    setEntry({ dateKey, scores: new Map(base).set(valueId, score) });

    try {
      const checkin = await ensureCheckin();
      await saveAlignment(checkin.id, valueId, score);
      if (crossedMidnight) await reload();
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
  }, [ensureCheckin, scoresForToday, reload]);

  /** Drop one value's answer for today, emptying its sector again. */
  const clearToday = useCallback(async (valueId) => {
    const dateKey = localDateKey();
    const base = scoresForToday();
    const previousScore = base.get(valueId);
    if (previousScore === undefined) return;

    const crossedMidnight = entryRef.current.dateKey !== dateKey;
    const cleared = new Map(base);
    cleared.delete(valueId);
    setEntry({ dateKey, scores: cleared });

    try {
      const checkin = await ensureCheckin();
      await clearAlignment(checkin.id, valueId);
      if (crossedMidnight) await reload();
    } catch (e) {
      console.error('[Alignment] Failed to clear a check-in score:', e);
      setEntry({ dateKey, scores: new Map(base).set(valueId, previousScore) });
    }
  }, [ensureCheckin, scoresForToday, reload]);

  const deleteCheckin = useCallback(async (checkinId) => {
    await dbDeleteCheckin(checkinId);
    checkinRef.current = { dateKey: null, promise: null };
    await reload();
  }, [reload]);

  /**
   * How many scores each date carries.
   *
   * `history` is exact for every date it holds, but it is re-read on an event and
   * so knows nothing about answers written optimistically — which includes every
   * answer given in this session. Those belong to the date the entry was stamped
   * with, not to whatever "today" happens to be by the time this is read: an app
   * open across midnight would otherwise report yesterday's fully answered wheel
   * as empty in the records list, while attributing its count to a day nothing
   * was said about.
   */
  const coverage = useMemo(() => {
    const counts = new Map();
    for (const row of history) {
      counts.set(row.checkedOn, (counts.get(row.checkedOn) ?? 0) + 1);
    }
    counts.set(entry.dateKey, entry.scores.size);
    return counts;
  }, [history, entry]);

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
    entriesOn,
    previousBefore,
    hasCheckedInToday: todayScores.size > 0,
    setAlignment,
    clearToday,
    deleteCheckin,
    reload,
  }), [
    records, history, isLoading, todayScores, coverage, previous, entriesOn, previousBefore,
    setAlignment, clearToday, deleteCheckin, reload,
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
