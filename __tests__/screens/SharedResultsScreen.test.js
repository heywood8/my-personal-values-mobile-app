import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import SharedResultsScreen from '../../app/screens/SharedResultsScreen';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import {
  SHARE_FORMAT,
  buildSharePayload,
  encodeShareCode,
  decodeShareCode,
} from '../../app/services/ResultsShare';
import { SCALE_IDS, normalizeScore } from '../../app/utils/scales';
import en from '../../assets/i18n/en.json';

/**
 * What a friend sees after tapping the link.
 *
 * Rendered under the theme-only providers on purpose: this screen reads no
 * database, seeds no catalogue and writes nothing — the link is the whole of its
 * data. A version of it that needed the app's own state would fail here rather
 * than in front of somebody who has never opened the app before.
 *
 * The comparison keeps that true by arriving as a prop: `own` is the reader's
 * half, already loaded by whoever mounted this. Everything below either passes
 * one or does not, which is exactly the difference between a reader who has used
 * the app and the visitor it also has to work for.
 */

const code = encodeShareCode(buildSharePayload(
  { assessedOn: '2026-08-12', scale: SCALE_IDS.NUMERIC_5 },
  [
    { key: 'love', isCustom: false, score: 5, normalized: 1 },
    { key: 'health', isCustom: false, score: 3, normalized: 0.5 },
    { key: 'a-uuid', isCustom: true, customName: 'Sailing', score: 2, normalized: 0.25 },
  ],
  (value) => value.customName,
));

const withWheel = encodeShareCode(buildSharePayload(
  { assessedOn: '2026-08-12', scale: SCALE_IDS.NUMERIC_5 },
  [
    { key: 'love', valueId: 'love', isCustom: false, score: 5, normalized: 1 },
    { key: 'health', valueId: 'health', isCustom: false, score: 5, normalized: 1 },
  ],
  (value) => value.customName,
  { checkedOn: '2026-08-14', scores: new Map([['love', 8], ['health', 2]]) },
));

const myRow = (key, score, scale = SCALE_IDS.NUMERIC_5) => ({
  valueId: key,
  key,
  isCustom: false,
  customName: null,
  score,
  normalized: normalizeScore(score, scale),
});

/** The reader's own half, as AppInitializer hands it over. */
const own = (results, alignment = null) => ({
  assessment: { assessedOn: '2026-08-15', scale: SCALE_IDS.NUMERIC_5 },
  results,
  alignment,
});

const mount = async (props = {}) => {
  await render(
    <SharedResultsScreen code={code} onClose={jest.fn()} {...props} />,
    { wrapper: ThemeOnlyProviders },
  );
};

const rankedKeys = () => screen
  .getAllByTestId(/^ranked-row-/)
  .map((row) => row.props.testID.replace('ranked-row-', ''));

describe('a ranking somebody shared', () => {
  it('draws it in the order it was sent — strongest first', async () => {
    await mount();

    expect(screen.getByTestId('shared-results-screen')).toBeTruthy();
    expect(rankedKeys()).toEqual(['love', 'health', 'a-uuid']);
  });

  it('names catalogue values in the language of whoever opened the link', async () => {
    await mount();

    // The sender's language is not in the link; the keys are, and this is what
    // that buys.
    expect(screen.getByText(en.value_love)).toBeTruthy();
    // A custom value has no key anyone else knows, so it arrives as text.
    expect(screen.getByText('Sailing')).toBeTruthy();
  });

  it('says whose it is and that nothing of the reader’s changed', async () => {
    await mount();

    expect(screen.getByText(en.share_view_title)).toBeTruthy();
    expect(screen.getByText(en.share_view_note)).toBeTruthy();
  });

  it('closes on request', async () => {
    const onClose = jest.fn();
    await mount({ onClose });

    await act(async () => {
      fireEvent.press(screen.getByTestId('shared-results-close'));
    });

    expect(onClose).toHaveBeenCalled();
  });
});

describe('a link that cannot be read', () => {
  const expectFailure = async (broken, title) => {
    const onClose = jest.fn();
    await render(
      <SharedResultsScreen code={broken} onClose={onClose} />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByTestId('shared-results-error')).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();

    // Every dead end still leads into the reader's own app rather than stopping
    // at the message.
    await act(async () => {
      fireEvent.press(screen.getByTestId('shared-results-error-action'));
    });
    expect(onClose).toHaveBeenCalled();
  };

  it('says a link arrived in half when it did', async () => {
    await expectFailure(code.slice(0, 40), en.share_view_corrupt_title);
  });

  it('says a link needs a newer version when it does', async () => {
    const { payload } = decodeShareCode(code);
    const future = encodeShareCode({ ...payload, format: SHARE_FORMAT + 1 });

    await expectFailure(future, en.share_view_unsupported_title);
  });

  it('says something is not a shared ranking at all when it is not', async () => {
    await expectFailure('https://example.com/not-a-code', en.share_view_invalid_title);
  });
});

describe('a reader who has a ranking of their own', () => {
  const mine = [myRow('love', 2), myRow('health', 5)];

  it('opens on the comparison rather than on somebody else’s list alone', async () => {
    await mount({ own: own(mine) });

    // Nothing is hidden by that: every value they sent is in the comparison too,
    // with their score beside it.
    expect(screen.getByTestId('shared-comparison')).toBeTruthy();
    expect(screen.getByTestId('compare-fill-love-mine')).toBeTruthy();
    expect(screen.getByTestId('compare-fill-love-theirs')).toBeTruthy();
  });

  it('reads their list on its own in one tap, and comes back', async () => {
    await mount({ own: own(mine) });

    await act(async () => {
      fireEvent.press(screen.getByTestId('shared-view-toggle-theirs'));
    });
    expect(screen.getByTestId('shared-their-results')).toBeTruthy();
    expect(screen.getByTestId('ranked-value-bars')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('shared-view-toggle-compare'));
    });
    expect(screen.getByTestId('shared-comparison')).toBeTruthy();
  });

  it('says how much of the two lists is shared, and how alike it is', async () => {
    await mount({ own: own(mine) });

    expect(screen.getByText(en.compare_shared_count.replace('{{count}}', '2'))).toBeTruthy();
    // Read off the two values both of them rated and nothing else: love is 0.75
    // apart and health 0.5, so the mean gap is 0.625.
    expect(screen.getByText(en.compare_closeness.replace('{{percent}}', '38'))).toBeTruthy();
    // A custom value on their side has a key no other install knows, so it can
    // only ever be theirs alone.
    expect(screen.getByText(en.compare_only_theirs.replace('{{count}}', '1'))).toBeTruthy();
  });

  it('puts the widest disagreement on top when asked', async () => {
    await mount({ own: own(mine) });

    await act(async () => {
      fireEvent.press(screen.getByTestId('compare-order-toggle-gap'));
    });

    const rows = screen.getAllByTestId(/^compare-row-/)
      .map((row) => row.props.testID.replace('compare-row-', ''));
    // They put love at the top and the reader nearly at the bottom; health they
    // agree on entirely.
    expect(rows[0]).toBe('love');
  });

  it('offers no wheel comparison when neither side sent one', async () => {
    await mount({ own: own(mine) });

    expect(screen.queryByTestId('compare-metric-toggle')).toBeNull();
  });

  it('compares the wheels when a link carries one', async () => {
    await render(
      <SharedResultsScreen
        code={withWheel}
        onClose={jest.fn()}
        own={own(mine, { checkedOn: '2026-08-15', scores: new Map([['love', 10]]) })}
      />,
      { wrapper: ThemeOnlyProviders },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('compare-metric-toggle-alignment'));
    });

    // Love was answered on both wheels; health only on theirs, and it is still
    // here — one side of a comparison is what a reader with no check-in of their
    // own has to read the sender's by.
    expect(screen.getByText('10/10')).toBeTruthy();
    expect(screen.getByText('8/10')).toBeTruthy();
    expect(screen.getByText('2/10')).toBeTruthy();
  });
});

describe('a visitor with nothing of their own yet', () => {
  it('shows the sender’s wheel, since it arrived and there is nothing to set it against', async () => {
    await render(
      <SharedResultsScreen code={withWheel} onClose={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByTestId('shared-their-alignment')).toBeTruthy();
    expect(screen.getByText(en.share_view_alignment_title)).toBeTruthy();
    expect(screen.getByText('8/10')).toBeTruthy();
  });

  it('offers no comparison at all', async () => {
    await mount();

    expect(screen.queryByTestId('shared-view-toggle')).toBeNull();
    expect(screen.queryByTestId('shared-comparison')).toBeNull();
  });

  it('invites them to make one, and the link is kept while they do', async () => {
    const onCalibrate = jest.fn();
    await mount({ onCalibrate });

    await act(async () => {
      fireEvent.press(screen.getByTestId('shared-results-calibrate'));
    });

    expect(onCalibrate).toHaveBeenCalled();
  });

  it('does not invite them where there is no route into the deck', async () => {
    await mount();

    expect(screen.queryByTestId('shared-results-invite')).toBeNull();
  });
});
