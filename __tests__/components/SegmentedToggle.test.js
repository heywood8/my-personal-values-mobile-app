import React from 'react';
import SegmentedToggle from '../../app/components/SegmentedToggle';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import { __resetDatabaseHandleForTests } from '../../app/services/db';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

const options = [
  { value: 'ranked', label: 'Ranked' },
  { value: 'grouped', label: 'Grouped' },
];

describe('SegmentedToggle', () => {
  it('renders one pressable per option', async () => {
    await render(
      <SegmentedToggle options={options} value="ranked" onChange={jest.fn()} testID="view" />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByTestId('view-ranked')).toBeTruthy();
    expect(screen.getByTestId('view-grouped')).toBeTruthy();
  });

  // Through `aria-checked`, which is the prop react-native-web reads —
  // `accessibilityState` reaches no DOM, and `role="radio"` requires a checked
  // state, so without this the group is announced with no answer given.
  it('marks the current option as checked for assistive tech', async () => {
    await render(
      <SegmentedToggle options={options} value="ranked" onChange={jest.fn()} testID="view" />,
      { wrapper: ThemeOnlyProviders },
    );

    expect(screen.getByTestId('view-ranked')).toBeChecked();
    expect(screen.getByTestId('view-grouped')).not.toBeChecked();
  });

  it('reports the option that was pressed', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedToggle options={options} value="ranked" onChange={onChange} testID="view" />,
      { wrapper: ThemeOnlyProviders },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('view-grouped'));
    });

    expect(onChange).toHaveBeenCalledWith('grouped');
  });
});
