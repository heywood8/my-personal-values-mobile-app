import React from 'react';
import { StyleSheet } from 'react-native';
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

describe('the score column', () => {
  const QUALITATIVE_ITEMS = [
    item('health', 3, SCALE_IDS.QUALITATIVE),
    item('love', 1, SCALE_IDS.QUALITATIVE),
  ];

  const layOutSizer = async (width) => {
    // Hidden from assistive tech, so hidden from the queries too by default.
    const sizer = screen.getByTestId('ranked-score-sizer', { includeHiddenElements: true });
    await act(async () => {
      fireEvent(sizer, 'layout', { nativeEvent: { layout: { width } } });
    });
  };

  const scoreWidth = (label) => StyleSheet.flatten(screen.getByText(label).props.style).width;

  it('is one width for every row, so the tracks line up', async () => {
    await render(
      <RankedValueBars items={QUALITATIVE_ITEMS} scaleId={SCALE_IDS.QUALITATIVE} />,
      { wrapper: ThemeOnlyProviders },
    );

    await layOutSizer(84);

    // A bar chart is read against a shared baseline at both ends. Sizing each
    // row's column to its own word made "Very important" squeeze its track
    // while "Not important" gave width back — a difference in word length
    // showing up as a difference in score.
    expect(scoreWidth('Very important')).toBe(84);
    expect(scoreWidth('Not important')).toBe(84);
  });

  it('rounds a fractional measurement up, so the last glyph is not clipped', async () => {
    await render(
      <RankedValueBars items={QUALITATIVE_ITEMS} scaleId={SCALE_IDS.QUALITATIVE} />,
      { wrapper: ThemeOnlyProviders },
    );

    await layOutSizer(84.2);

    expect(scoreWidth('Very important')).toBe(85);
  });

  it('measures against every label the scale can print, not just the ones on screen', async () => {
    await render(
      <RankedValueBars
        items={[item('health', 1, SCALE_IDS.QUALITATIVE)]}
        scaleId={SCALE_IDS.QUALITATIVE}
      />,
      { wrapper: ThemeOnlyProviders },
    );

    // The widest word decides the column even when no row happens to use it —
    // otherwise the bars would shift the moment a rating changed.
    const sizer = screen.getByTestId('ranked-score-sizer', { includeHiddenElements: true });
    const measured = sizer.children.map((child) => child.props.children);
    expect(measured).toEqual(['Not important', 'Important', 'Very important']);
  });
});

describe('a name too long for its line', () => {
  const layOutChart = async (width) => {
    await act(async () => {
      fireEvent(screen.getByTestId('ranked-value-bars'), 'layout', {
        nativeEvent: { layout: { width } },
      });
    });
  };

  const rowStyle = (key) => StyleSheet.flatten(screen.getByTestId(`ranked-bar-${key}`).props.style);

  it('wraps rather than being cut off mid-word', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    // A ranking is a list of names, and "Поддержка / поощ…" is not one of them.
    expect(screen.getByText('Love').props.numberOfLines).toBe(2);
  });

  it('lets a row grow instead of clipping what wrapped', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    const style = rowStyle('love');
    expect(style.height).toBeUndefined();
    expect(style.minHeight).toBe(34);
  });

  it('stacks the name above the bar where the two cannot share a line', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    // A phone's width split between a name and a track leaves the track too
    // short to read a magnitude off, so below the breakpoint the name takes the
    // whole row and every track under it gets the whole row too.
    await layOutChart(320);
    expect(rowStyle('love').flexDirection).toBe('column');
  });

  it('keeps name and bar side by side once there is room for both', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    await layOutChart(560);
    expect(rowStyle('love').flexDirection).toBe('row');
  });

  it('draws the wide layout before it has been measured', async () => {
    await render(
      <RankedValueBars items={ITEMS} scaleId={SCALE_IDS.NUMERIC_5} />,
      { wrapper: ThemeOnlyProviders },
    );

    // `onLayout` lands a frame late on the web and never at all under RNTL.
    // Blanking the chart until it does would cost more than one frame of the
    // layout a chart wide enough to measure is going to keep anyway.
    expect(rowStyle('love').flexDirection).toBe('row');
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
