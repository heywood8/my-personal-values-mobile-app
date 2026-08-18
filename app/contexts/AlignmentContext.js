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
   */
  const [todayScores, setTodayScores] = useState(() => new Map());

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
      setCheckins(allCheckins);
      setHistory(fullHistory);
      setTodayScores(scoresOn(fullHistory, localDateKey()));
    } catch (e) {
      console.error('[Alignment] Failed to load the check-ins:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
    const previousScore = todayScores.get(valueId);

    setTodayScores((prev) => {
      const next = new Map(prev);
      next.set(valueId, score);
      return next;
    });

    try {
      const checkin = await ensureCheckin();
      await saveAlignment(checkin.id, valueId, score);
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
      setTodayScores((prev) => {
        const next = new Map(prev);
        if (previousScore === undefined) next.delete(valueId);
        else next.set(valueId, previousScore);
        return next;
      });
    }
  }, [ensureCheckin, todayScores]);

  /** Drop one value's answer for today, emptying its sector again. */
  const clearToday = useCallback(async (valueId) => {
    const previousScore = todayScores.get(valueId);
    if (previousScore === undefined) return;

    setTodayScores((prev) => {
      const next = new Map(prev);
      next.delete(valueId);
      return next;
    });

    try {
      const checkin = await ensureCheckin();
      await clearAlignment(checkin.id, valueId);
    } catch (e) {
      console.error('[Alignment] Failed to clear a check-in score:', e);
      setTodayScores((prev) => new Map(prev).set(valueId, previousScore));
    }
  }, [ensureCheckin, todayScores]);

  const deleteCheckin = useCallback(async (checkinId) => {
    await dbDeleteCheckin(checkinId);
    checkinRef.current = { dateKey: null, promise: null };
    await reload();
  }, [reload]);

  /**
   * The records list. Today's row is in it only while it still carries a score:
   * `getCheckins()` filters empty rows out on a read, but the row this session
   * created is held here optimistically, and clearing its last answer has to take
   * it back out rather than leave a dated entry that opens onto nothing.
   */
  const records = useMemo(() => {
    const today = localDateKey();
    return checkins.filter(
      (checkin) => checkin.checkedOn !== today || todayScores.size > 0,
    );
  }, [checkins, todayScores]);

  const value = useMemo(() => ({
    checkins: records,
    history,
    isLoading,
    todayScores,
    previous,
    entriesOn,
    previousBefore,
    hasCheckedInToday: todayScores.size > 0,
    setAlignment,
    clearToday,
    deleteCheckin,
    reload,
  }), [
    records, history, isLoading, todayScores, previous, entriesOn, previousBefore,
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
