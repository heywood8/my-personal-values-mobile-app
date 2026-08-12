import React from 'react';
import ScaleInput from '../../app/components/ScaleInput';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { SCALE_IDS } from '../../app/utils/scales';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('ScaleInput', () => {
  it('renders one button per step of the 1-to-5 scale', async () => {
    await render(
      <ScaleInput scaleId={SCALE_IDS.NUMERIC_5} onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    [1, 2, 3, 4, 5].forEach((step) => {
      expect(screen.getByTestId(`scale-step-${step}`)).toBeTruthy();
    });
    expect(screen.queryByTestId('scale-step-6')).toBeNull();
  });

  it('renders ten steps for the 1-to-10 scale', async () => {
    await render(
      <ScaleInput scaleId={SCALE_IDS.NUMERIC_10} onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByTestId('scale-step-10')).toBeTruthy();
    expect(screen.queryByTestId('scale-step-11')).toBeNull();
  });

  it('labels the qualitative scale with words, not numbers', async () => {
    await render(
      <ScaleInput scaleId={SCALE_IDS.QUALITATIVE} onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByText('Not important')).toBeTruthy();
    expect(screen.getByText('Important')).toBeTruthy();
    expect(screen.getByText('Very important')).toBeTruthy();
  });

  it('stacks the word scale strongest-first — "very important" on top', async () => {
    await render(
      <ScaleInput scaleId={SCALE_IDS.QUALITATIVE} onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    // Top of the column is the strongest answer, the same way the top of the
    // results list is. A column ordered the other way put the answer someone
    // reaches for most furthest from the value it is about.
    expect(screen.getAllByRole('radio').map((step) => step.props.accessibilityLabel))
      .toEqual(['Very important', 'Important', 'Not important']);
  });

  it('leaves a numeric scale in its own order, 1 on the left', async () => {
    await render(
      <ScaleInput scaleId={SCALE_IDS.NUMERIC_5} onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    // A row of "5 4 3 2 1" is a scale printed backwards, not a scale re-ordered
    // — there is no top and bottom in a row to begin with.
    expect(screen.getAllByRole('radio').map((step) => step.props.accessibilityLabel))
      .toEqual(['1', '2', '3', '4', '5']);
  });

  it('reports the step that was pressed', async () => {
    const onChange = jest.fn();
    await render(
      <ScaleInput scaleId={SCALE_IDS.NUMERIC_5} onChange={onChange} />,
      { wrapper: ThemeOnlyProviders },
    );

    fireEvent.press(screen.getByTestId('scale-step-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('marks the current value as selected for assistive tech', async () => {
    await render(
      <ScaleInput scaleId={SCALE_IDS.NUMERIC_5} value={3} onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByTestId('scale-step-3').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('scale-step-2').props.accessibilityState.selected).toBe(false);
  });

  it('does not fire when disabled', async () => {
    const onChange = jest.fn();
    await render(
      <ScaleInput scaleId={SCALE_IDS.NUMERIC_5} onChange={onChange} disabled />,
      { wrapper: ThemeOnlyProviders },
    );

    fireEvent.press(screen.getByTestId('scale-step-2'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to the default scale for an unknown id', async () => {
    // A stored assessment taken on a scale a later release removed must still
    // render something usable rather than an empty row of buttons.
    await render(
      <ScaleInput scaleId="removed_scale" onChange={jest.fn()} />,
      { wrapper: ThemeOnlyProviders },
    );
    expect(screen.getByTestId('scale-step-5')).toBeTruthy();
  });
});
