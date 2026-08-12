/**
 * Key parity between the two locale files.
 *
 * `t()` resolves to `translations[key] || key`, so there is no English fallback:
 * a key present in en.json but missing from ru.json renders the raw key string
 * ("results_sort_asc") to a Russian-speaking user. Nothing else in CI catches
 * that, which makes a partial rename or a half-applied new string ship broken
 * copy silently.
 */

import fs from 'fs';
import path from 'path';

import enJson from '../../assets/i18n/en.json';
import ruJson from '../../assets/i18n/ru.json';
import catalogue from '../../app/defaults/defaultValues.json';

const ALL = { en: enJson, ru: ruJson };
const LANGS = Object.keys(ALL);
const enKeys = Object.keys(enJson);

describe('i18n translation key parity', () => {
  describe.each(LANGS)('%s.json', (lang) => {
    it('declares no duplicate keys', () => {
      // JSON.parse silently keeps the last duplicate, so scan the raw text.
      const raw = fs.readFileSync(
        path.join(__dirname, `../../assets/i18n/${lang}.json`),
        'utf8',
      );
      const declared = [...raw.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
      const seen = new Set();
      const duplicates = declared.filter((key) => {
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
      expect(duplicates).toEqual([]);
    });

    it('has a non-empty string for every key', () => {
      const blank = Object.entries(ALL[lang])
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => key);
      expect(blank).toEqual([]);
    });
  });

  it('ru.json defines every key present in en.json', () => {
    expect(enKeys.filter((key) => !(key in ruJson))).toEqual([]);
  });

  it('ru.json defines no keys absent from en.json', () => {
    expect(Object.keys(ruJson).filter((key) => !(key in enJson))).toEqual([]);
  });

  it('uses the same interpolation placeholders in both locales', () => {
    // A translated string that drops {{date}} renders a sentence with a hole in
    // it, and one that invents {{name}} renders the literal braces.
    const placeholders = (text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)]
      .map((m) => m[1])
      .sort();

    const mismatched = enKeys
      .filter((key) => key in ruJson)
      .map((key) => ({
        key,
        en: placeholders(enJson[key]),
        ru: placeholders(ruJson[key]),
      }))
      .filter(({ en, ru }) => en.join(',') !== ru.join(','));

    expect(mismatched).toEqual([]);
  });
});

describe('the value catalogue is fully translated', () => {
  it.each(LANGS)('%s.json names and describes all 47 values', (lang) => {
    const missing = [];
    for (const value of catalogue.values) {
      if (typeof ALL[lang][`value_${value.key}`] !== 'string') missing.push(`value_${value.key}`);
      if (typeof ALL[lang][`value_${value.key}_desc`] !== 'string') missing.push(`value_${value.key}_desc`);
    }
    expect(missing).toEqual([]);
  });

  it.each(LANGS)('%s.json names all 8 groups', (lang) => {
    const missing = catalogue.groups
      .filter((group) => typeof ALL[lang][`group_${group}`] !== 'string')
      .map((group) => `group_${group}`);
    expect(missing).toEqual([]);
  });

  it.each(LANGS)('%s.json still names every retired value', (lang) => {
    // A value dropped from the catalogue keeps its ratings, so it goes on
    // appearing in records taken before the change. Delete its name with it and
    // that history renders "value_family" — which nothing else here catches,
    // because the catalogue no longer lists the key to check.
    const missing = catalogue.retired
      .filter((key) => typeof ALL[lang][`value_${key}`] !== 'string')
      .map((key) => `value_${key}`);
    expect(missing).toEqual([]);
  });

  it('does not list a retired value that is still in the catalogue', () => {
    const live = new Set(catalogue.values.map((v) => v.key));
    expect(catalogue.retired.filter((key) => live.has(key))).toEqual([]);
  });

  it('reserves the value_* namespace for catalogue and retired entries only', () => {
    // `value_` means "a value this app can name", with no exceptions — deck UI
    // strings live under `deck_`. Retired entries count because history still
    // renders them; anything else is a stale key from a rename, or a UI string
    // parked in the wrong namespace, and both fail here.
    const known = new Set([...catalogue.values.map((v) => v.key), ...catalogue.retired]);
    const orphans = enKeys
      .filter((key) => key.startsWith('value_'))
      .map((key) => key.replace(/^value_/, '').replace(/_desc$/, ''))
      .filter((key) => !known.has(key));
    expect([...new Set(orphans)]).toEqual([]);
  });

  it('describes only values still in the deck', () => {
    // A description is read on the assessment card and nowhere else, and a
    // retired value is never dealt one. Keeping its description would be dead
    // text in two locales that no test would ever exercise.
    const live = new Set(catalogue.values.map((v) => v.key));
    const stale = enKeys
      .filter((key) => key.startsWith('value_') && key.endsWith('_desc'))
      .map((key) => key.replace(/^value_/, '').replace(/_desc$/, ''))
      .filter((key) => !live.has(key));
    expect(stale).toEqual([]);
  });

  it('has a unique name per value within each language', () => {
    // Two values sharing a name is unreadable in a ranked list of 47 rows —
    // and a retired name colliding with a live one is worse, because the two
    // sit side by side in a history view spanning the change.
    const keys = [...catalogue.values.map((v) => v.key), ...catalogue.retired];
    for (const lang of LANGS) {
      const names = keys.map((key) => ALL[lang][`value_${key}`]);
      const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
      expect({ lang, duplicates }).toEqual({ lang, duplicates: [] });
    }
  });
});
