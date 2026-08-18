import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import AlignmentScreen from '../app/screens/AlignmentScreen';
import { AllProviders } from '../test-utils/renderWithProviders';
import { seedDefaultValues } from '../app/services/ValuesDB';
import {
  startAssessment, saveRating, completeAssessment,
} from '../app/services/AssessmentsDB';
import { getAlignmentHistory } from '../app/services/AlignmentDB';
import { __resetDatabaseHandleForTests } from '../app/services/db';
import { localDateKey } from '../app/utils/dateUtils';
import { SCALE_IDS } from '../app/utils/scales';

const TODAY = localDateKey();

beforeEach(() => { __resetDatabaseHandleForTests(); });

const rank = async (scores) => {
  await seedDefaultValues();
  const a = await startAssessment(SCALE_IDS.NUMERIC_5, { today: TODAY });
  for (const [id, s] of Object.entries(scores)) await saveRating(a.id, id, s, SCALE_IDS.NUMERIC_5);
  await completeAssessment(a.id);
};

const rowKeys = () => screen.getAllByTestId(/^alignment-row-/)
  .map((r) => r.props.testID.replace('alignment-row-', ''));

it('tapping TODAY in the records list', async () => {
  await rank({ health: 5, love: 5 });
  await render(<AlignmentScreen onStartCalibration={jest.fn()} />, { wrapper: AllProviders });
  await waitFor(() => expect(screen.getByTestId('alignment-screen')).toBeTruthy());

  // answer both values today
  await act(async () => { fireEvent.press(screen.getByTestId('alignment-love-step-4')); });
  await act(async () => { fireEvent.press(screen.getByTestId('alignment-health-step-9')); });
  await waitFor(async () => expect(await getAlignmentHistory()).toHaveLength(2));

  expect(screen.getByTestId('alignment-status')).toHaveTextContent(/2/);
  console.log('rows before opening today record:', rowKeys());

  // today's row is in the records list
  const todayRecord = screen.getByTestId(`open-checkin-${TODAY}`);
  await act(async () => { fireEvent.press(todayRecord); });

  console.log('viewing banner present:', !!screen.queryByTestId('alignment-viewing'));
  console.log('rows while viewing today:', screen.queryAllByTestId(/^alignment-row-/).map((r) => r.props.testID));
  console.log('wheel label:', screen.queryByTestId('alignment-wheel')?.props?.accessibilityLabel);
});
