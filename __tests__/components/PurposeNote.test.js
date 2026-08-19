import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PurposeNote from '../../app/components/PurposeNote';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import en from '../../assets/i18n/en.json';
import ru from '../../assets/i18n/ru.json';

/**
 * The note exists to head off an expectation, so what is worth asserting is the
 * claim itself rather than the box around it: a translation that keeps the title
 * and loses "nothing is interpreted here" leaves a reader still waiting for the
 * insight at the end of the deck.
 */

describe('PurposeNote', () => {
  it('says the answers are recorded, not read back as an insight', async () => {
    await render(<PurposeNote />, { wrapper: ThemeOnlyProviders });

    expect(screen.getByTestId('purpose-note')).toBeTruthy();
    expect(screen.getByText(en.purpose_note_title)).toBeTruthy();
    expect(screen.getByText(en.purpose_note)).toBeTruthy();
  });

  it('makes both halves of the claim — no analysis, and a record to compare — in both locales', async () => {
    for (const copy of [en, ru]) {
      expect(copy.purpose_note_title).toBeTruthy();
      expect(copy.purpose_note.length).toBeGreaterThan(copy.purpose_note_title.length);
    }
    expect(en.purpose_note).toMatch(/insight/i);
    expect(en.purpose_note).toMatch(/what changed/i);
    expect(ru.purpose_note).toMatch(/инсайт/i);
    expect(ru.purpose_note).toMatch(/изменилось/i);
  });
});
