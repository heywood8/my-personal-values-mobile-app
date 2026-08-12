import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import PropTypes from 'prop-types';
// English is a static import so there is always a resolved fallback available at
// startup without evaluating any other locale.
import enTranslations from '../../assets/i18n/en.json';
import { getPreference, setPreference, deletePreference, PREF_KEYS } from '../services/PreferencesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const defaultLang = 'en';

// Lazy loaders per language. With Metro's `inlineRequires`, each require() is
// evaluated the first time it is actually called, so only the active language's
// JSON is materialised at startup. Metro still bundles both — this is a
// startup-evaluation win, not a bundle-size one.
const i18nLoaders = {
  en: () => enTranslations,
  ru: () => require('../../assets/i18n/ru.json'),
};

const i18nCache = { en: enTranslations };

/**
 * Resolve (and memoise) the translations for a language code. Returns undefined
 * for an unknown code, preserving the `translations[key] || key` lookup below.
 *
 * Exported because the first-run language picker renders before any provider is
 * mounted and has to translate its own handful of strings.
 */
export function loadTranslations(lang) {
  if (i18nCache[lang]) return i18nCache[lang];
  const loader = i18nLoaders[lang];
  if (!loader) return undefined;
  const data = loader();
  i18nCache[lang] = data;
  return data;
}

export const availableLanguages = Object.keys(i18nLoaders);

/**
 * Substitute `{{name}}` placeholders.
 *
 * Kept deliberately small: no pluralisation rules, no formatting. Russian
 * pluralisation is genuinely three-way and cannot be faked with a naive
 * substitution, so every count-bearing string is phrased to avoid needing it
 * ("Оценено: 3" rather than "3 ценности"). If a future string cannot be phrased
 * around it, that is the point to bring in a real i18n library rather than to
 * grow this function.
 */
export function interpolate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{\{(\w+)\}\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

/** Translate outside React — for module-scope constants and services. */
export function translate(lang, key, params) {
  const template = loadTranslations(lang)?.[key] || key;
  return interpolate(template, params);
}

const LocalizationContext = createContext({
  t: (key) => key,
  language: defaultLang,
  setLanguage: () => {},
  availableLanguages,
  isFirstLaunch: false,
  isLoading: true,
  setFirstLaunchComplete: () => {},
});

export function LocalizationProvider({ children }) {
  const [language, setLanguageState] = useState(defaultLang);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load the stored language on mount.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const storedLang = await getPreference(PREF_KEYS.LANGUAGE);
        if (!mounted) return;
        if (storedLang && i18nLoaders[storedLang]) {
          setLanguageState(storedLang);
          setIsFirstLaunch(false);
        } else {
          setIsFirstLaunch(true);
        }
      } catch (e) {
        // A failed read is treated as a first launch — the picker is a safe
        // place to land, and it rewrites the preference on the way out.
        console.warn('[Localization] Could not read the stored language:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // A data reset clears the language too, so the app returns to first-run.
  useEffect(() => {
    let mounted = true;
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, async () => {
      try {
        await deletePreference(PREF_KEYS.LANGUAGE);
        if (!mounted) return;
        setIsFirstLaunch(true);
        setLanguageState(defaultLang);
      } catch (e) {
        if (mounted) console.error('Failed to clear language preference:', e);
      }
    });

    return () => { mounted = false; unsubscribe(); };
  }, []);

  const setLanguage = useCallback(async (lng) => {
    setLanguageState(lng);
    try {
      await setPreference(PREF_KEYS.LANGUAGE, lng);
    } catch (e) {
      console.warn('[Localization] Could not persist the language:', e);
    }
  }, []);

  const setFirstLaunchComplete = useCallback(async (lng) => {
    setLanguageState(lng);
    setIsFirstLaunch(false);
    try {
      await setPreference(PREF_KEYS.LANGUAGE, lng);
    } catch (e) {
      console.warn('[Localization] Could not persist the language:', e);
    }
  }, []);

  const t = useCallback(
    (key, params) => interpolate(loadTranslations(language)?.[key] || key, params),
    [language],
  );

  // Hide the splash once the language preference is known, so the picker never
  // flashes before we know whether this is truly a first launch.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  const value = useMemo(() => ({
    t,
    language,
    setLanguage,
    availableLanguages,
    isFirstLaunch,
    isLoading,
    setFirstLaunchComplete,
  }), [t, language, setLanguage, isFirstLaunch, isLoading, setFirstLaunchComplete]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

LocalizationProvider.propTypes = {
  children: PropTypes.node,
};

export function useLocalization() {
  return useContext(LocalizationContext);
}
