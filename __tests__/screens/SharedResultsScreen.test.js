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
import { SCALE_IDS } from '../../app/utils/scales';
import en from '../../assets/i18n/en.json';

/**
 * What a friend sees after tapping the link.
 *
 * Rendered under the theme-only providers on purpose: this screen reads no
 * database, seeds no catalogue and writes nothing — the link is the whole of its
 * data. A version of it that needed the app's own state would fail here rather
 * than in front of somebody who has never opened the app before.
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
