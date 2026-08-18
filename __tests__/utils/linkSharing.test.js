import { Platform, Share } from 'react-native';
import {
  shareBaseUrl,
  buildShareUrl,
  currentShareCode,
  clearShareCode,
  shareLink,
} from '../../app/utils/linkSharing';
import { DEFAULT_SHARE_URL } from '../../app/services/ResultsShare';

/**
 * The platform half of a link: where it points, how it leaves, how it arrives.
 *
 * Both halves are exercised here, because they behave differently and both ship.
 * A phone has no URL of its own and a share sheet to hand things to; a browser
 * has a URL, sometimes a share sheet, usually a clipboard, and occasionally
 * neither. The last case is not a failure — the screen shows the link instead —
 * so it is asserted rather than assumed away.
 */

const nativeOS = Platform.OS;
const realDescriptors = {};

/** Stand a minimal browser up around the module, for the web branches. */
const installDom = ({ href = 'https://example.com/values/', search = '', hash = '', navigator = {} } = {}) => {
  Platform.OS = 'web';

  const url = new URL(href);
  const location = { origin: url.origin, pathname: url.pathname, search, hash, href };
  const replaceState = jest.fn();

  for (const [name, value] of Object.entries({
    document: {
      createElement: jest.fn(() => ({ style: {}, setAttribute: jest.fn(), select: jest.fn(), remove: jest.fn() })),
      body: { appendChild: jest.fn() },
      execCommand: jest.fn(() => true),
    },
    navigator,
    window: { location, history: { replaceState } },
  })) {
    realDescriptors[name] = Object.getOwnPropertyDescriptor(global, name);
    Object.defineProperty(global, name, { value, configurable: true, writable: true });
  }

  return { location, replaceState };
};

afterEach(() => {
  Platform.OS = nativeOS;
  for (const [name, descriptor] of Object.entries(realDescriptors)) {
    if (descriptor) Object.defineProperty(global, name, descriptor);
    else delete global[name];
    delete realDescriptors[name];
  }
});

describe('where a link points', () => {
  it('points at the published site when the app has no URL of its own', () => {
    // A phone: there is nothing to read a base off, and a link only its owner
    // can open is not a shared link.
    expect(Platform.OS).not.toBe('web');
    expect(shareBaseUrl()).toBe(DEFAULT_SHARE_URL);
  });

  it('points a copy running on the web at itself', () => {
    // Which is what makes a link work from a fork's deployment, or from a local
    // export, without anything being configured.
    installDom({ href: 'https://someone.github.io/values/' });

    expect(shareBaseUrl()).toBe('https://someone.github.io/values/');
  });

  it('adds the code as a parameter, keeping any the base already had', () => {
    expect(buildShareUrl('abc.def', 'https://example.com/values/'))
      .toBe('https://example.com/values/?r=abc.def');
    expect(buildShareUrl('abc.def', 'https://example.com/values/?lang=ru'))
      .toBe('https://example.com/values/?lang=ru&r=abc.def');
  });
});

describe('arriving with a link', () => {
  it('finds the code the page was opened with', () => {
    installDom({ search: '?r=abc.def' });
    expect(currentShareCode()).toBe('abc.def');
  });

  it('finds nothing when the page was opened normally', () => {
    installDom({ search: '' });
    expect(currentShareCode()).toBeNull();
  });

  it('reads no URL at all off the web, where there is none to read', () => {
    // Receiving is the web's alone: a phone would need a deep link registered to
    // a scheme only somebody who already has the app can follow.
    expect(currentShareCode()).toBeNull();
  });

  it('takes the code back out of the address bar when the screen closes', () => {
    // So that reloading the tab afterwards lands the reader in their own app
    // rather than back in somebody else's results.
    const { replaceState } = installDom({ search: '?r=abc.def' });

    clearShareCode();

    expect(replaceState).toHaveBeenCalledWith(null, '', '/values/');
  });
});

describe('sending a link', () => {
  it('hands it to the system share sheet on a phone', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

    await expect(shareLink('https://example.com/values/?r=abc.def', { subject: 'My values' }))
      .resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      message: 'https://example.com/values/?r=abc.def',
      title: 'My values',
    });

    share.mockRestore();
  });

  it('reports a dismissed share sheet as the decision it is', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });

    await expect(shareLink('https://example.com/?r=abc')).resolves.toBe('cancelled');

    share.mockRestore();
  });

  it('uses the browser share sheet where there is one', async () => {
    const webShare = jest.fn().mockResolvedValue(undefined);
    installDom({ navigator: { share: webShare } });

    await expect(shareLink('https://example.com/?r=abc', { subject: 'My values' }))
      .resolves.toBe('shared');
    expect(webShare).toHaveBeenCalledWith({ title: 'My values', url: 'https://example.com/?r=abc' });
  });

  it('falls back to the clipboard where there is not', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    installDom({ navigator: { clipboard: { writeText } } });

    await expect(shareLink('https://example.com/?r=abc')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://example.com/?r=abc');
  });

  it('reads a dismissed browser sheet as cancelled, not as a fault', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    installDom({ navigator: { share: jest.fn().mockRejectedValue(abort), clipboard: { writeText: jest.fn() } } });

    await expect(shareLink('https://example.com/?r=abc')).resolves.toBe('cancelled');
  });

  it('says the link has to be copied by hand when nothing will take it', async () => {
    // Which is not an error: the screen shows the link, and the reader copies it
    // out of the box themselves.
    installDom({ navigator: { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } } });
    global.document.execCommand = jest.fn(() => false);

    await expect(shareLink('https://example.com/?r=abc')).resolves.toBe('unavailable');
  });
});
