// The display identity of each supported language: its name written in itself,
// its English name, and its flag.
//
// A language is named in its own script deliberately — someone who has the app in
// a language they cannot read needs to recognise their own language in the list,
// and "Russian" does not help them; "Русский" does. The English name is the
// second line on the first-run picker, for the same reason in reverse.

export const NATIVE_LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Русский',
};

export const ENGLISH_LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Russian',
};

export const LANGUAGE_FLAGS = {
  en: '🇬🇧',
  ru: '🇷🇺',
};

/** How a language is labelled in a settings row. Falls back to the bare code. */
export const languageLabel = (code) => {
  const name = NATIVE_LANGUAGE_NAMES[code] || code;
  const flag = LANGUAGE_FLAGS[code];
  return flag ? `${flag}  ${name}` : name;
};
