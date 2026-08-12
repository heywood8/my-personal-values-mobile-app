import { valueName, valueDescription } from '../../app/utils/valueNames';
import en from '../../assets/i18n/en.json';

// Mirrors LocalizationContext's `translations[key] || key` semantics, including
// the fallback that returns the key itself for a missing string.
const t = (key) => en[key] || key;

describe('valueName', () => {
  it('translates a catalogue value', () => {
    expect(valueName({ key: 'learning', isCustom: false }, t)).toBe('Self-development');
  });

  it('shows a custom value verbatim', () => {
    expect(valueName({ key: 'abc', isCustom: true, customName: 'Sailing' }, t)).toBe('Sailing');
  });

  it('falls back to the key for a custom value with no name', () => {
    expect(valueName({ key: 'abc', isCustom: true, customName: null }, t)).toBe('abc');
  });

  it('handles a missing value', () => {
    expect(valueName(null, t)).toBe('');
  });
});

describe('valueDescription', () => {
  it('translates a catalogue description', () => {
    expect(valueDescription({ key: 'learning', isCustom: false }, t))
      .toBe('To keep growing, advancing or improving in knowledge, skills, character or life experience.');
  });

  it('returns null rather than the raw key when a description is missing', () => {
    // t() echoes the key for an unknown string; printing "value_zzz_desc" under
    // a card would be worse than printing nothing.
    expect(valueDescription({ key: 'zzz', isCustom: false }, t)).toBeNull();
  });

  it('returns null for custom values, which have no description', () => {
    expect(valueDescription({ key: 'abc', isCustom: true, customName: 'Sailing' }, t)).toBeNull();
  });
});
