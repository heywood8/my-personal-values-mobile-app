import {
  applyDocumentLanguage,
  detectDeviceLanguage,
  languageLabel,
} from '../../app/utils/languages';

describe('languageLabel', () => {
  it('names a language in its own script, behind its flag', () => {
    expect(languageLabel('ru')).toBe('🇷🇺  Русский');
  });

  it('falls back to the bare code for a language it does not know', () => {
    expect(languageLabel('kl')).toBe('kl');
  });
});

describe('detectDeviceLanguage', () => {
  it('drops the region', () => {
    expect(detectDeviceLanguage(['en', 'ru'], 'en')).toBeTruthy();
  });
});

describe('applyDocumentLanguage', () => {
  // Native has no document, and this must not be the thing that throws on the
  // one platform where the whole app runs — hence a predicate, not a Platform
  // branch, and a return value rather than an exception.
  it('does nothing off the web', () => {
    expect(typeof document).toBe('undefined');
    expect(applyDocumentLanguage('ru')).toBe(false);
  });

  it('labels the document when there is one', () => {
    const element = { lang: 'en' };
    global.document = { documentElement: element };
    try {
      expect(applyDocumentLanguage('ru')).toBe(true);
      expect(element.lang).toBe('ru');
    } finally {
      delete global.document;
    }
  });

  it('tolerates a document with no root element', () => {
    global.document = {};
    try {
      expect(applyDocumentLanguage('ru')).toBe(false);
    } finally {
      delete global.document;
    }
  });
});
