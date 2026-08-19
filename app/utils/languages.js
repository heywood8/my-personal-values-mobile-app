// The display identity of each supported language: its name written in itself,
// its English name, and its flag.
//
// A language is named in its own script deliberately — someone who has the app in
// a language they cannot read needs to recognise their own language in the list,
// and "Russian" does not help them; "Русский" does.

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

/**
 * Every language tag the platform will admit to, most-preferred first.
 *
 * `navigator.languages` is the web's ordered preference list and the only source
 * that reflects "English, but Russian if you have it". Everywhere else there is
 * no such list, so the resolved Intl locale stands in for it. Both are read
 * defensively: this runs before anything else in the app, and a throwing locale
 * lookup must not be the reason the app fails to start.
 */
const deviceLanguageTags = () => {
  const tags = [];
  try {
    const nav = typeof navigator === 'undefined' ? null : navigator;
    if (nav) {
      if (Array.isArray(nav.languages)) tags.push(...nav.languages);
      if (nav.language) tags.push(nav.language);
    }
  } catch {
    // Not a browser, or a hostile shim. The Intl read below still has a chance.
  }
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) tags.push(resolved);
  } catch {
    // Hermes without full-icu, older web views. `fallback` it is.
  }
  return tags;
};

/**
 * The supported language closest to the one the device is set to.
 *
 * There is no language question in front of the app any more — the first run
 * opens on the deck, with the language switch beside the first card — so the
 * language the app opens IN has to be a guess, and this is the guess. Region is
 * dropped ("ru-BY" is Russian), and anything unrecognised falls back to English,
 * which every build has statically imported anyway.
 *
 * The result is deliberately not persisted: a guess is not a choice, and storing
 * it would freeze the app in whatever language the device happened to be set to
 * on the day it was installed. Only the switch writes a preference.
 */
export const detectDeviceLanguage = (supported, fallback = 'en') => {
  const known = new Set(supported);
  for (const tag of deviceLanguageTags()) {
    const code = String(tag).toLowerCase().split(/[-_]/)[0];
    if (known.has(code)) return code;
  }
  return fallback;
};

/**
 * Tell the document which language it is being read in.
 *
 * The web export ships a template with `<html lang="en">` hard-coded, and the
 * language switch on the first card never touched it — so a reader who picked
 * Русский got 47 Russian value names pronounced with English phonetics by a
 * screen reader, and the page kept claiming to be English to anything else that
 * asked. Native has no document to label, hence the predicate rather than a
 * `Platform` branch: this is a capability the platform either has or does not.
 *
 * @returns {boolean} whether there was a document to label.
 */
export const applyDocumentLanguage = (code) => {
  if (typeof document === 'undefined' || !document.documentElement) return false;
  document.documentElement.lang = code;
  return true;
};
