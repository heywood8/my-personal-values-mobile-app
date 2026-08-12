import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RankedValueBars from '../../app/components/charts/RankedValueBars';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

const item = (key, groupKey, score, scaleId = SCALE_IDS.NUMERIC_5) => ({
  valueId: key,
  key,
  groupKey,
  isCustom: false,
  customName: null,
  score,
  normalized: normalizeScore(score, scaleId),
});

const ITEMS = [
  item('love', 'relationships', 1),
  item('learning', 'growth', 3),
  item('health', 'wellbeing', 5),
];

describe('RankedValueBars', () => {
  it('renders a bar per value, in the order given', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    ITEMS.forEach(({ key }) => expect(screen.getByTestId(`ranked-bar-${key}`)).toBeTruthy());
  });

  it('labels every bar with its value name and score', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    // Direct labels are not decoration here — they are what lets the chart be
    // read without relying on colour.
    expect(screen.getByText('Love')).toBeTruthy();
    expect(screen.getByText('Fitness')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('names each value\'s group alongside it', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByText('Relationships')).toBeTruthy();
    expect(screen.getByText('Well-being')).toBeTruthy();
  });

  it('labels a qualitative score with its word', async () => {
    await render(
      <RankedValueBars
        items={[item('love', 'relationships', 3, SCALE_IDS.QUALITATIVE)]}
        scaleId={SCALE_IDS.QUALITATIVE}
      />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByText('Very important')).toBeTruthy();
  });

  it('shows a custom value under its own name', async () => {
    await render(
      <RankedValueBars
        items={[{
          valueId: 'abc',
          key: 'abc',
          groupKey: 'autonomy',
          isCustom: true,
          customName: 'Sailing',
          score: 4,
          normalized: 0.75,
        }]}
        scaleId={SCALE_IDS.NUMERIC_5}
      />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByText('Sailing')).toBeTruthy();
  });

  it('renders nothing but stays standing for an empty list', async () => {
    await render(
      <RankedValueBars items={[]} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );
    expect(screen.getByTestId('ranked-value-bars')).toBeTruthy();
  });
});
