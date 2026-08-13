import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import DeckCardText from '../../app/components/DeckCardText';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

// Three catalogue keys with descriptions of visibly different lengths — the
// spread is the whole reason the block needs a reserved height.
const DECK = [
  { id: 1, key: 'order' },
  { id: 2, key: 'adventure' },
  { id: 3, key: 'health' },
];

const layout = async (element, size) => {
  await act(async () => {
    fireEvent(element, 'layout', { nativeEvent: { layout: { height: 0, width: 0, ...size } } });
  });
};

// The measuring layer is hidden from assistive tech, which is also what hides it
// from the default queries — so it has to be asked for explicitly.
const measureLayer = () => screen.queryByTestId('deck-card-text-measure', { includeHiddenElements: true });

/** Walks the deck through the hidden layer, one reported height per card. */
const measureDeck = async (heights) => {
  const items = measureLayer().props.children;
  for (let i = 0; i < heights.length; i += 1) {
    await act(async () => {
      items[i].props.onLayout({ nativeEvent: { layout: { height: heights[i], width: 320 } } });
    });
  }
};

describe('DeckCardText', () => {
  it('renders the value name and its description', async () => {
    await render(<DeckCardText deck={DECK} value={DECK[1]} />, { wrapper: ThemeOnlyProviders });

    expect(screen.getByText('Adventure')).toBeTruthy();
    expect(screen.getByText(/adventurous/i)).toBeTruthy();
  });

  it('measures nothing until the card has a width', async () => {
    // No layout event, no measurement: a component that measured on mount would
    // wrap every card at whatever width a zero-width parent implies.
    await render(<DeckCardText deck={DECK} value={DECK[0]} />, { wrapper: ThemeOnlyProviders });

    expect(measureLayer()).toBeNull();
    expect(screen.getByTestId('deck-card-text').props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: expect.anything() })]),
    );
  });

  it('reserves the tallest card in the deck plus one line', async () => {
    await render(<DeckCardText deck={DECK} value={DECK[0]} />, { wrapper: ThemeOnlyProviders });
    await layout(screen.getByTestId('deck-card-text'), { width: 320 });

    await measureDeck([40, 106, 84]);

    // 106 is the tallest, 22 is one more line of description.
    expect(screen.getByTestId('deck-card-text')).toHaveStyle({ minHeight: 128 });
    // The layer has done its job and is gone.
    expect(measureLayer()).toBeNull();
  });

  it('reserves the same height whichever card is on screen', async () => {
    // The point of the whole component: the rating buttons below this block do
    // not move between a one-line card and a four-line one.
    const view = await render(
      <DeckCardText deck={DECK} value={DECK[0]} />,
      { wrapper: ThemeOnlyProviders },
    );
    await layout(screen.getByTestId('deck-card-text'), { width: 320 });
    await measureDeck([40, 106, 84]);

    // The shortest card in the deck.
    expect(screen.getByTestId('deck-card-text')).toHaveStyle({ minHeight: 128 });

    await act(async () => {
      view.rerender(<DeckCardText deck={DECK} value={DECK[1]} />);
    });

    // The tallest. Same reservation, so the buttons below have not moved, and no
    // second measuring pass — the deck has not changed.
    expect(screen.getByTestId('deck-card-text')).toHaveStyle({ minHeight: 128 });
    expect(measureLayer()).toBeNull();
  });

  it('measures again when the width changes', async () => {
    await render(<DeckCardText deck={DECK} value={DECK[0]} />, { wrapper: ThemeOnlyProviders });
    await layout(screen.getByTestId('deck-card-text'), { width: 320 });
    await measureDeck([40, 106, 84]);

    // A rotation rewraps every description, so the old reservation is worthless.
    await layout(screen.getByTestId('deck-card-text'), { width: 700 });
    expect(measureLayer()).toBeTruthy();

    await measureDeck([40, 62, 62]);
    expect(screen.getByTestId('deck-card-text')).toHaveStyle({ minHeight: 84 });
  });

  it('ignores a repeated layout for the same card until the deck is through', async () => {
    await render(<DeckCardText deck={DECK} value={DECK[0]} />, { wrapper: ThemeOnlyProviders });
    await layout(screen.getByTestId('deck-card-text'), { width: 320 });

    const items = measureLayer().props.children;
    await act(async () => {
      items[0].props.onLayout({ nativeEvent: { layout: { height: 40, width: 320 } } });
      items[0].props.onLayout({ nativeEvent: { layout: { height: 40, width: 320 } } });
    });

    // Two events, one card measured — a counter would have called it done at
    // three and reserved the height of a short card.
    expect(measureLayer()).toBeTruthy();
  });
});
