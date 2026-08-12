import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { AllProviders } from '../../test-utils/renderWithProviders';
import { useAssessment } from '../../app/contexts/AssessmentContext';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import { getPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { getAssessments } from '../../app/services/AssessmentsDB';
import { SCALE_IDS } from '../../app/utils/scales';

/**
 * The calibration loop, driven through the real providers and a real database.
 *
 * The rules under test are the ones the app is actually about — one record per
 * day, a same-day run overwriting, a different day starting a new one — and they
 * span the context layer, the service layer and a SQLite constraint. Testing them
 * anywhere narrower would leave the seams between those three untested, which is
 * exactly where "it worked in the unit test" tends to hide.
 */

let api = null;

function Harness() {
  api = useAssessment();
  return (
    <>
      <Text testID="loading">{api.isLoading ? 'loading' : 'ready'}</Text>
      <Text testID="results">{String(api.results.length)}</Text>
      <Text testID="records">{String(api.assessments.length)}</Text>
      <Text testID="today">{api.hasRecordToday ? 'yes' : 'no'}</Text>
      <Text testID="session">{api.session ? String(api.session.deck.length) : 'none'}</Text>
    </>
  );
}

const mount = async () => {
  await render(<Harness />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
};

/** Rate the first `count` cards of the open session. */
const rateFirst = async (count, score) => {
  const deck = api.session.deck;
  for (let i = 0; i < count; i++) {
    await act(async () => {
      await api.rate(deck[i].id, score);
    });
  }
};

beforeEach(() => {
  __resetDatabaseHandleForTests();
  api = null;
});

describe('a first calibration', () => {
  it('deals the whole catalogue', async () => {
    await mount();

    await act(async () => { await api.startCalibration(); });

    // All 74 values, none archived on a fresh install.
    expect(screen.getByTestId('session')).toHaveTextContent('74');
    expect(api.session.isRecalibration).toBe(false);
  });

  it('publishes results once finished', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(3, 4);

    await act(async () => { await api.finishCalibration(); });

    await waitFor(() => expect(screen.getByTestId('results')).toHaveTextContent('3'));
    expect(screen.getByTestId('records')).toHaveTextContent('1');
    expect(screen.getByTestId('today')).toHaveTextContent('yes');
    // The session is closed, so the shell can leave the deck.
    expect(screen.getByTestId('session')).toHaveTextContent('none');
  });

  it('marks onboarding complete, so the app stops opening on the deck', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(1, 3);
    await act(async () => { await api.finishCalibration(); });

    expect(await getPreference(PREF_KEYS.ONBOARDING_COMPLETE)).toBe('1');
  });

  it('reports whether it overwrote or created a record', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(1, 3);

    let summary;
    await act(async () => { summary = await api.finishCalibration(); });

    expect(summary).toMatchObject({ isRecalibration: false, rated: 1, total: 74 });
  });
});

describe('recalibrating the same day', () => {
  it('reopens the existing record rather than adding one', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(3, 2);
    await act(async () => { await api.finishCalibration(); });

    await act(async () => { await api.startCalibration(); });

    expect(api.session.isRecalibration).toBe(true);
    // The reopened deck starts from what was already answered, so a correction
    // does not mean re-rating all 74 cards.
    expect(api.session.scores.size).toBe(3);
    expect(screen.getByTestId('records')).toHaveTextContent('1');
  });

  it('overwrites the day\'s answers', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    const firstValueId = api.session.deck[0].id;
    await rateFirst(3, 2);
    await act(async () => { await api.finishCalibration(); });

    await act(async () => { await api.startCalibration(); });
    await act(async () => { await api.rate(firstValueId, 5); });
    await act(async () => { await api.finishCalibration(); });

    await waitFor(() => expect(screen.getByTestId('records')).toHaveTextContent('1'));
    const rewritten = api.results.find((r) => r.valueId === firstValueId);
    expect(rewritten.score).toBe(5);
    // The other two answers survive — an overwrite of the day, not a wipe of it.
    expect(api.results).toHaveLength(3);
  });

  it('leaves the day incomplete while a reopened run is in progress', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(2, 3);
    await act(async () => { await api.finishCalibration(); });
    await waitFor(() => expect(screen.getByTestId('results')).toHaveTextContent('2'));

    await act(async () => { await api.startCalibration(); });

    const [record] = await getAssessments();
    expect(record.completedAt).toBeNull();
  });
});

describe('calibrating on a later day', () => {
  it('creates a second record and keeps the first', async () => {
    await mount();

    // Day one, written directly so the test does not have to travel in time.
    const { startAssessment, saveRating, completeAssessment } = require('../../app/services/AssessmentsDB');
    const dayOne = await startAssessment(SCALE_IDS.NUMERIC_5, { today: '2026-01-01' });
    await saveRating(dayOne.id, 'learning', 2, SCALE_IDS.NUMERIC_5);
    await completeAssessment(dayOne.id);

    await act(async () => { await api.reloadResults(); });
    await waitFor(() => expect(screen.getByTestId('records')).toHaveTextContent('1'));

    // Day two is today.
    await act(async () => { await api.startCalibration(); });
    expect(api.session.isRecalibration).toBe(false);
    // A fresh day starts blank: seeding it with the last run's answers would
    // anchor the reader and flatten the very change the history exists to show.
    expect(api.session.scores.size).toBe(0);

    await act(async () => { await api.rate('learning', 5); });
    await act(async () => { await api.finishCalibration(); });

    await waitFor(() => expect(screen.getByTestId('records')).toHaveTextContent('2'));
    expect(api.history.filter((h) => h.valueId === 'learning')).toHaveLength(2);
  });
});

describe('abandoning a run', () => {
  it('keeps the answers already given and resumes at the first unrated card', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(5, 3);

    await act(async () => { api.cancelCalibration(); });
    expect(screen.getByTestId('session')).toHaveTextContent('none');

    await act(async () => { await api.startCalibration(); });

    // Answers were written through as they were given, so nothing was lost…
    expect(api.session.scores.size).toBe(5);
    // …and the deck picks up where it stopped rather than at card 1.
    expect(api.session.index).toBe(5);
  });
});

describe('the scale', () => {
  it('persists and applies to the next calibration', async () => {
    await mount();

    await act(async () => { await api.setScale(SCALE_IDS.QUALITATIVE); });
    expect(await getPreference(PREF_KEYS.SCALE)).toBe(SCALE_IDS.QUALITATIVE);

    await act(async () => { await api.startCalibration(); });
    expect(api.session.assessment.scale).toBe(SCALE_IDS.QUALITATIVE);
  });

  it('ignores an unknown scale id', async () => {
    await mount();
    const before = api.scale;
    await act(async () => { await api.setScale('nonsense'); });
    expect(api.scale).toBe(before);
  });
});

describe('deleting a record', () => {
  it('removes it from the results and the history', async () => {
    await mount();
    await act(async () => { await api.startCalibration(); });
    await rateFirst(2, 4);
    await act(async () => { await api.finishCalibration(); });
    await waitFor(() => expect(screen.getByTestId('records')).toHaveTextContent('1'));

    const [record] = await getAssessments();
    await act(async () => { await api.deleteAssessment(record.id); });

    await waitFor(() => expect(screen.getByTestId('records')).toHaveTextContent('0'));
    expect(screen.getByTestId('results')).toHaveTextContent('0');
    expect(screen.getByTestId('today')).toHaveTextContent('no');
  });
});
