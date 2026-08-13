import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import UpdatePrompt from '../../app/components/UpdatePrompt';
import { ThemeOnlyProviders } from '../../test-utils/renderWithProviders';
import en from '../../assets/i18n/en.json';

/**
 * The one thing this app interrupts for. What matters is that "later" is always
 * reachable and that someone several versions behind sees what all of them
 * changed, not just the newest.
 */

const UPDATE = {
  currentVersion: '0.3.0',
  latestVersion: '0.5.0',
  downloadUrl: 'https://example.test/values-v0.5.0.apk',
  publishedAt: '2026-08-20T10:00:00Z',
  newerReleases: [
    { version: '0.5.0', notes: '## 0.5.0 (2026-08-20)\n\n* the newest thing' },
    { version: '0.4.0', notes: '## 0.4.0 (2026-08-13)\n\n* the thing before it' },
  ],
};

const renderPrompt = async (props = {}) => {
  const onDismiss = jest.fn();
  const onAccept = jest.fn();
  await render(
    <UpdatePrompt update={UPDATE} onDismiss={onDismiss} onAccept={onAccept} {...props} />,
    { wrapper: ThemeOnlyProviders },
  );
  return { onDismiss, onAccept };
};

describe('UpdatePrompt', () => {
  it('renders nothing at all when there is no update', async () => {
    await renderPrompt({ update: null });

    expect(screen.queryByTestId('update-prompt')).toBeNull();
  });

  it('names both versions, so "update" is not a leap of faith', async () => {
    await renderPrompt();

    expect(screen.getByText(en.update_available_title)).toBeTruthy();
    expect(screen.getByText(/Version 0\.5\.0 is out — you have 0\.3\.0\./)).toBeTruthy();
  });

  it('lists every release the user skipped, newest first', async () => {
    await renderPrompt();

    expect(screen.getByText('• the newest thing')).toBeTruthy();
    expect(screen.getByText('• the thing before it')).toBeTruthy();
    // Labelled, because two bodies with no versions between them read as one.
    expect(screen.getByText('v0.5.0')).toBeTruthy();
    expect(screen.getByText('v0.4.0')).toBeTruthy();
  });

  it('leaves the version heading off a single release', async () => {
    // With one body there is nothing to tell apart, and the version is already
    // in the line above.
    await renderPrompt({
      update: { ...UPDATE, newerReleases: [UPDATE.newerReleases[0]] },
    });

    expect(screen.getByText('• the newest thing')).toBeTruthy();
    expect(screen.queryByText('v0.5.0')).toBeNull();
  });

  it('falls back to a plain sentence for a release with no notes', async () => {
    await renderPrompt({ update: { ...UPDATE, newerReleases: [] } });

    expect(screen.getByText(en.update_available_body)).toBeTruthy();
    expect(screen.queryByTestId('update-prompt-notes')).toBeNull();
  });

  it('offers both answers, and reports which was given', async () => {
    const { onDismiss, onAccept } = await renderPrompt();

    await act(async () => { fireEvent.press(screen.getByTestId('update-prompt-later')); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByTestId('update-prompt-accept')); });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
