import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import RankedValueBars from '../../app/components/charts/RankedValueBars';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

const item = (key, score, scaleId = SCALE_IDS.NUMERIC_5) => ({
  valueId: key,
  key,
  isCustom: false,
  customName: null,
  score,
  normalized: normalizeScore(score, scaleId),
});

const ITEMS = [
  item('health', 5),
  item('learning', 3),
  item('love', 1),
];

const LOVE_DESC = 'To act lovingly or affectionately towards myself or others.';

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

  it('labels a qualitative score with its word', async () => {
    await render(
      <RankedValueBars
        items={[item('love', 3, SCALE_IDS.QUALITATIVE)]}
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

describe('the description behind a row', () => {
  const renderBars = () => render(
    <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
    { wrapper: ThemeOnlyProviders },
  );

  it('stays out of the way until asked for', async () => {
    await renderBars();
    // 47 descriptions at once is a wall of text, and the ranking is what the
    // screen is for.
    expect(screen.queryByTestId('ranked-description-love')).toBeNull();
  });

  it('appears on hover, and goes away again', async () => {
    await renderBars();
    const row = screen.getByTestId('ranked-bar-love');

    await act(async () => { fireEvent(row, 'hoverIn'); });
    expect(screen.getByText(LOVE_DESC)).toBeTruthy();

    await act(async () => { fireEvent(row, 'hoverOut'); });
    expect(screen.queryByTestId('ranked-description-love')).toBeNull();
  });

  it('appears on a tap, because a phone has no hover', async () => {
    await renderBars();
    const row = screen.getByTestId('ranked-bar-love');

    await act(async () => { fireEvent.press(row); });
    expect(screen.getByTestId('ranked-description-love')).toBeTruthy();

    await act(async () => { fireEvent.press(row); });
    expect(screen.queryByTestId('ranked-description-love')).toBeNull();
  });

  it('reveals only the row that was asked about', async () => {
    await renderBars();

    await act(async () => { fireEvent(screen.getByTestId('ranked-bar-love'), 'hoverIn'); });

    expect(screen.getByTestId('ranked-description-love')).toBeTruthy();
    expect(screen.queryByTestId('ranked-description-health')).toBeNull();
  });

  it('carries the description to assistive tech as a hint', async () => {
    await renderBars();
    expect(screen.getByTestId('ranked-bar-love').props.accessibilityHint).toBe(LOVE_DESC);
  });

  it('leaves a custom value inert — it has no description to show', async () => {
    await render(
      <RankedValueBars
        items={[{
          valueId: 'abc',
          key: 'abc',
          isCustom: true,
          customName: 'Sailing',
          score: 4,
          normalized: 0.75,
        }]}
        scaleId={SCALE_IDS.NUMERIC_5}
      />,
      { wrapper: ThemeOnlyProviders },
    );

    const row = screen.getByTestId('ranked-bar-abc');
    await act(async () => { fireEvent.press(row); });
    expect(screen.queryByTestId('ranked-description-abc')).toBeNull();
  });
});
