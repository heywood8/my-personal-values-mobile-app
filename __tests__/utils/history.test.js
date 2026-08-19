import {
  buildTrendSeries,
  computeMovers,
  defaultTrackedIds,
  pointOn,
  MIN_TRACKED_VALUES,
} from '../../app/utils/history';

const row = (assessedOn, valueId, normalized, score = 5) => ({
  assessmentId: assessedOn,
  assessedOn,
  scale: 'numeric_10',
  valueId,
  key: valueId,
  isCustom: false,
  customName: null,
  score,
  normalized,
});

/** A ranked result list, strongest first — the shape getRankedResults() returns. */
const ranked = (normalizedScores) => normalizedScores
  .map((normalized, index) => ({ valueId: `v${index}`, normalized }))
  .sort((a, b) => b.normalized - a.normalized);

describe('buildTrendSeries', () => {
  it('collects each value\'s points oldest first, and every date once', () => {
    const { dates, values } = buildTrendSeries([
      row('2026-01-01', 'love', 0.4),
      row('2026-01-01', 'health', 0.9),
      row('2026-02-01', 'love', 0.8),
    ]);

    expect(dates).toEqual(['2026-01-01', '2026-02-01']);
    const love = values.find((v) => v.valueId === 'love');
    expect(love.points.map((p) => p.normalized)).toEqual([0.4, 0.8]);
    expect(values.find((v) => v.valueId === 'health').points).toHaveLength(1);
  });

  it('survives an empty history', () => {
    expect(buildTrendSeries([])).toEqual({ dates: [], values: [] });
    expect(buildTrendSeries(undefined)).toEqual({ dates: [], values: [] });
  });
});

describe('computeMovers', () => {
  const history = [
    row('2026-01-01', 'love', 0.4),
    row('2026-01-01', 'health', 0.9),
    row('2026-02-01', 'love', 0.8),
    row('2026-02-01', 'health', 0.5),
    row('2026-02-01', 'order', 1),
  ];
  const { dates, values } = buildTrendSeries(history);

  it('ranks by the size of the move, not its direction', () => {
    const movers = computeMovers(values, dates);
    expect(movers.map((m) => m.valueId)).toEqual(['love', 'health']);
    expect(movers[0].delta).toBeCloseTo(0.4);
    expect(movers[1].delta).toBeCloseTo(-0.4);
  });

  it('leaves out a value that was only rated in one of the two runs', () => {
    // `order` appears for the first time in the later run. Reporting it as a
    // full-height rise would be an artefact of it being new.
    expect(computeMovers(values, dates).map((m) => m.valueId)).not.toContain('order');
  });

  it('has nothing to say about a single calibration', () => {
    const single = buildTrendSeries([row('2026-01-01', 'love', 0.4)]);
    expect(computeMovers(single.values, single.dates)).toEqual([]);
  });
});

describe('pointOn', () => {
  const { values } = buildTrendSeries([row('2026-01-01', 'love', 0.4)]);

  it('finds the reading for a date, and nothing for one without it', () => {
    expect(pointOn(values[0], '2026-01-01').normalized).toBe(0.4);
    expect(pointOn(values[0], '2026-02-01')).toBeNull();
    expect(pointOn(null, '2026-01-01')).toBeNull();
  });
});

describe('defaultTrackedIds', () => {
  it('opens on the top ten when the core band is smaller than that', () => {
    // Three values in the core band (>= 0.75), fifteen rated in all.
    const list = ranked([1, 0.9, 0.8, ...Array.from({ length: 12 }, (_, i) => 0.5 - i * 0.03)]);
    expect(defaultTrackedIds(list)).toHaveLength(MIN_TRACKED_VALUES);
  });

  it('widens to the whole core band when the reader nominated more than ten', () => {
    // Fourteen "very important" values: cutting at ten would drop four the
    // reader had just said matter most.
    const list = ranked([...Array.from({ length: 14 }, () => 0.9), 0.5, 0.2]);
    expect(defaultTrackedIds(list)).toHaveLength(14);
  });

  it('still opens on ten when nothing reached the core band at all', () => {
    // A cautious 1..10 ranking that never awarded an 8 would otherwise open
    // this screen on nothing.
    const list = ranked(Array.from({ length: 20 }, (_, i) => 0.7 - i * 0.03));
    expect(defaultTrackedIds(list)).toHaveLength(MIN_TRACKED_VALUES);
  });

  it('takes them strongest first, and never more than there are', () => {
    const list = ranked([0.2, 1, 0.6]);
    expect(defaultTrackedIds(list)).toEqual(['v1', 'v2', 'v0']);
    expect(defaultTrackedIds([])).toEqual([]);
    expect(defaultTrackedIds(null)).toEqual([]);
  });
});
