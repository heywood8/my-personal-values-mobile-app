import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { availableLanguages, loadTranslations } from '../contexts/LocalizationContext';
import { NATIVE_LANGUAGE_NAMES, ENGLISH_LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../utils/languages';
import { BORDER_RADIUS, FONT_SIZE, SPACING, TOP_CONTENT_SPACING, CONTENT_MAX_WIDTH } from '../styles/designTokens';

// Derived from the loader map rather than restated, so adding a locale to
// LocalizationContext is enough to make it appear here.
const LANGUAGES = availableLanguages.map((code) => ({
  code,
  name: ENGLISH_LANGUAGE_NAMES[code] || code,
  nativeName: NATIVE_LANGUAGE_NAMES[code] || code,
  flag: LANGUAGE_FLAGS[code] || '',
}));

/**
 * First run, step one.
 *
 * Renders before any provider is mounted — there is no stored language yet, and
 * the theme, catalogue and assessment providers all sit behind the choice made
 * here. So it carries its own light-only palette and translates its handful of
 * strings directly through loadTranslations, which materialises only the locale
 * actually tapped.
 */
const LanguageSelectionScreen = ({ onLanguageSelected }) => {
  const [selectedLanguage, setSelectedLanguage] = useState(null);

  const handleContinue = () => {
    if (selectedLanguage) {
      onLanguageSelected(selectedLanguage);
    }
  };

  // Preview the app in the language under the finger; English until one is picked.
  const t = (key) => loadTranslations(selectedLanguage || 'en')?.[key] || key;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          testID="language-list"
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.title}>{t('welcome_title')}</Text>
          <Text style={styles.subtitle}>{t('welcome_subtitle')}</Text>

          <View style={styles.languagesContainer}>
            {LANGUAGES.map((language) => {
              const selected = selectedLanguage === language.code;
              return (
                <Pressable
                  key={language.code}
                  style={[styles.languageButton, selected && styles.languageButtonSelected]}
                  onPress={() => setSelectedLanguage(language.code)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${language.name}`}
                  accessibilityState={{ selected }}
                  testID={`language-${language.code}`}
                >
                  <Text style={styles.flag}>{language.flag}</Text>
                  <View style={styles.languageTextContainer}>
                    <Text style={[styles.languageName, selected && styles.languageNameSelected]}>
                      {language.nativeName}
                    </Text>
                    {/* English's two names are the same word, and printing it
                        twice reads as a bug. */}
                    {language.name !== language.nativeName && (
                      <Text style={[styles.languageEnglishName, selected && styles.languageEnglishNameSelected]}>
                        {language.name}
                      </Text>
                    )}
                  </View>
                  {selected && (
                    <View style={styles.checkmark}>
                      <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.continueButton, !selectedLanguage && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!selectedLanguage}
            accessibilityRole="button"
            accessibilityLabel={t('continue')}
            accessibilityState={{ disabled: !selectedLanguage }}
            testID="language-continue"
          >
            <Text
              style={[styles.continueButtonText, !selectedLanguage && styles.continueButtonTextDisabled]}
            >
              {t('continue')}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  checkmark: {
    alignItems: 'center',
    backgroundColor: '#2a78d6',
    borderRadius: BORDER_RADIUS.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
  },
  container: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingTop: TOP_CONTENT_SPACING,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#2a78d6',
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    maxWidth: CONTENT_MAX_WIDTH,
    padding: SPACING.lg,
    width: '100%',
  },
  continueButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  continueButtonTextDisabled: {
    color: '#9e9e9e',
  },
  flag: {
    fontSize: 40,
    marginRight: SPACING.lg,
  },
  footer: {
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  languageButton: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderColor: '#f5f5f5',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    padding: SPACING.xl,
  },
  languageButtonSelected: {
    backgroundColor: '#e8f0fc',
    borderColor: '#2a78d6',
  },
  languageEnglishName: {
    color: '#666666',
    fontSize: FONT_SIZE.md,
  },
  languageEnglishNameSelected: {
    color: '#1c5cab',
  },
  languageName: {
    color: '#1a1a1a',
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  languageNameSelected: {
    color: '#184f95',
  },
  languageTextContainer: {
    flex: 1,
  },
  languagesContainer: {
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  safeArea: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  subtitle: {
    color: '#666666',
    fontSize: FONT_SIZE.base,
    marginBottom: SPACING.xxxl,
    textAlign: 'center',
  },
  title: {
    color: '#1a1a1a',
    fontSize: FONT_SIZE.display,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
});

LanguageSelectionScreen.propTypes = {
  onLanguageSelected: PropTypes.func.isRequired,
};

export default LanguageSelectionScreen;
