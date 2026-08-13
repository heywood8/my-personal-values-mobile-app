import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  startAssessment,
  saveRating,
  clearRating,
  completeAssessment,
  deleteAssessment as dbDeleteAssessment,
  getRatingsForAssessment,
  getLatestCompletedAssessment,
  getRankedResults,
  getAssessments,
  getHistory,
  getAssessmentByDate,
} from '../services/AssessmentsDB';
import { getPreference, setPreference, setBooleanPreference, PREF_KEYS } from '../services/PreferencesDB';
import { DEFAULT_SCALE, isValidScaleId } from '../utils/scales';
import { localDateKey } from '../utils/dateUtils';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useValues } from './ValuesContext';

const AssessmentContext = createContext(null);

export const AssessmentProvider = ({ children }) => {
  const { activeValues, isLoading: valuesLoading } = useValues();

  const [scale, setScaleState] = useState(DEFAULT_SCALE);
  const [latest, setLatest] = useState(null);
  const [results, setResults] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * The calibration in progress, or null.
   *
   * Held here rather than in the screen so the deck survives a tab switch, a
   * rotation, or the results screen being opened mid-run. Ratings are written
   * through to the database as they are given, so this is a cache of what is
   * already persisted, not the only copy — closing the app mid-deck loses
   * nothing.
   */
  const [session, setSession] = useState(null);

  // Latest-value mirror so callbacks that live across renders (the rating
  // handler, which is passed down into a memoised card) never act on a stale
  // session.
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const reloadResults = useCallback(async () => {
    try {
      const [latestAssessment, all, fullHistory] = await Promise.all([
        getLatestCompletedAssessment(),
        getAssessments({ completedOnly: true }),
        getHistory(),
      ]);
      setLatest(latestAssessment);
      setAssessments(all);
      setHistory(fullHistory);
      setResults(latestAssessment ? await getRankedResults(latestAssessment.id) : []);
    } catch (e) {
      console.error('[Assessment] Failed to load results:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // The catalogue is seeded by ValuesProvider, and the queries below join
  // against it, so the first read waits for that to finish.
  useEffect(() => {
    if (valuesLoading) return;
    reloadResults();
  }, [valuesLoading, reloadResults]);

  useEffect(() => {
    getPreference(PREF_KEYS.SCALE, DEFAULT_SCALE)
      .then((stored) => {
        if (isValidScaleId(stored)) setScaleState(stored);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubReset = appEvents.on(EVENTS.DATABASE_RESET, () => {
      setSession(null);
      setScaleState(DEFAULT_SCALE);
      reloadResults();
    });
    const unsubChanged = appEvents.on(EVENTS.ASSESSMENTS_CHANGED, reloadResults);
    return () => {
      unsubReset();
      unsubChanged();
    };
  }, [reloadResults]);

  /**
   * Change the rating scale.
   *
   * Past assessments store their own scale and keep it — rewriting them here
   * would silently restate answers the user never gave. What does change is the
   * run currently open, if there is one: the scale switch lives on the first card
   * of the deck now, so "change the scale" and "I am in the middle of rating"
   * overlap by design, and leaving the open deck on the old scale would mean the
   * buttons under the switch ignoring it.
   *
   * The re-expression is startAssessment's, not a second one: resolving the same
   * day again is what rescales the rows already written, keeping each answer's
   * normalised position and rounding the raw score into the new scale's steps.
   */
  const setScale = useCallback(async (scaleId) => {
    if (!isValidScaleId(scaleId)) return;
    setScaleState(scaleId);
    try {
      await setPreference(PREF_KEYS.SCALE, scaleId);
    } catch (e) {
      console.warn('[Assessment] Could not persist the scale:', e);
    }

    const current = sessionRef.current;
    if (!current || current.assessment.scale === scaleId) return;

    try {
      const reopened = await startAssessment(scaleId, { today: current.assessment.assessedOn });
      const rescaled = await getRatingsForAssessment(reopened.id);
      const scores = new Map(rescaled.map((rating) => [rating.valueId, rating.score]));
      setSession((prev) => (prev ? {
        ...prev,
        assessment: { ...prev.assessment, scale: scaleId },
        scores,
        // `isRecalibration` is a fact about the day, not about this call:
        // startAssessment reports "reopened" for any existing row, including the
        // one this very session created a moment ago.
      } : prev));
    } catch (e) {
      console.error('[Assessment] Could not re-express the open run:', e);
    }
  }, []);

  /**
   * Open a calibration for today.
   *
   * Resolving through startAssessment is what implements "same day overwrites,
   * another day is a new record" — it either reopens today's row or creates one.
   *
   * Prefilling is deliberately limited to the reopen case. Seeding a NEW day's
   * deck with the last run's answers would anchor the reader to what they said
   * last time and produce a history that barely moves — which is precisely the
   * signal this app exists to show. A fresh day starts blank; reopening today,
   * where the stated behaviour is "overwrite", starts from what is already there
   * so a correction does not mean re-rating all 47 cards.
   */
  const startCalibration = useCallback(async () => {
    const opened = await startAssessment(scale);
    const existingRatings = await getRatingsForAssessment(opened.id);

    const scores = new Map();
    for (const rating of existingRatings) {
      scores.set(rating.valueId, rating.score);
    }

    // Resume where the reader stopped rather than at card 1.
    const deck = activeValues;
    const firstUnrated = deck.findIndex((value) => !scores.has(value.id));

    const next = {
      assessment: opened,
      deck,
      scores,
      index: firstUnrated === -1 ? 0 : firstUnrated,
      isRecalibration: opened.isRecalibration === true,
      startedFromExisting: existingRatings.length > 0,
    };
    setSession(next);
    return next;
  }, [scale, activeValues]);

  /** Record a score for the card at `index` (defaults to the current one). */
  const rate = useCallback(async (valueId, score) => {
    const current = sessionRef.current;
    if (!current) return;

    // Optimistic: the card must respond on the tap, not after a database round
    // trip. A failed write is reverted below rather than left looking saved.
    setSession((prev) => {
      if (!prev) return prev;
      const scores = new Map(prev.scores);
      scores.set(valueId, score);
      return { ...prev, scores };
    });

    try {
      await saveRating(current.assessment.id, valueId, score, current.assessment.scale);
    } catch (e) {
      console.error('[Assessment] Failed to save a rating:', e);
      setSession((prev) => {
        if (!prev) return prev;
        const scores = new Map(prev.scores);
        const previous = current.scores.get(valueId);
        if (previous === undefined) scores.delete(valueId);
        else scores.set(valueId, previous);
        return { ...prev, scores };
      });
    }
  }, []);

  const unrate = useCallback(async (valueId) => {
    const current = sessionRef.current;
    if (!current) return;
    setSession((prev) => {
      if (!prev) return prev;
      const scores = new Map(prev.scores);
      scores.delete(valueId);
      return { ...prev, scores };
    });
    try {
      await clearRating(current.assessment.id, valueId);
    } catch (e) {
      console.error('[Assessment] Failed to clear a rating:', e);
    }
  }, []);

  const goToCard = useCallback((index) => {
    setSession((prev) => {
      if (!prev) return prev;
      const clamped = Math.min(Math.max(index, 0), Math.max(prev.deck.length - 1, 0));
      return { ...prev, index: clamped };
    });
  }, []);

  /** Finish the run and publish it as the current result. */
  const finishCalibration = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;

    await completeAssessment(current.assessment.id);
    await setBooleanPreference(PREF_KEYS.ONBOARDING_COMPLETE, true);

    const summary = {
      assessedOn: current.assessment.assessedOn,
      isRecalibration: current.isRecalibration,
      rated: current.scores.size,
      total: current.deck.length,
    };

    setSession(null);
    await reloadResults();
    return summary;
  }, [reloadResults]);

  /**
   * Abandon the run. The assessment row and everything already rated stay — the
   * answers were saved as they were given, and throwing them away because the
   * reader left the screen would be its own kind of data loss. It simply stays
   * incomplete, and the next start resumes it.
   */
  const cancelCalibration = useCallback(() => {
    setSession(null);
  }, []);

  const deleteAssessment = useCallback(async (assessmentId) => {
    await dbDeleteAssessment(assessmentId);
    await reloadResults();
  }, [reloadResults]);

  /** Whether today already has a record — drives the overwrite warning. */
  const hasRecordToday = useMemo(
    () => assessments.some((a) => a.assessedOn === localDateKey()),
    [assessments],
  );

  const value = useMemo(() => ({
    scale,
    setScale,
    latest,
    results,
    assessments,
    history,
    isLoading,
    hasRecordToday,
    hasResults: results.length > 0,
    session,
    startCalibration,
    rate,
    unrate,
    goToCard,
    finishCalibration,
    cancelCalibration,
    deleteAssessment,
    reloadResults,
  }), [
    scale, setScale, latest, results, assessments, history, isLoading,
    hasRecordToday, session, startCalibration, rate, unrate, goToCard,
    finishCalibration, cancelCalibration, deleteAssessment, reloadResults,
  ]);

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
};

AssessmentProvider.propTypes = {
  children: PropTypes.node,
};

export const useAssessment = () => useContext(AssessmentContext);

// Re-exported so screens can check "is there a record for this date" without
// importing the service layer directly.
export { getAssessmentByDate };
