import { useLanguageContext } from '../contexts/LanguageContext';
import enTranslations from '../locales/en.json';
import frTranslations from '../locales/fr.json';

// Translation files map
const translations = {
  en: enTranslations,
  fr: frTranslations
};

/**
 * Custom hook for translations
 * @returns {Object} Translation function and current language
 */
export const useTranslation = () => {
  const { currentLanguage } = useLanguageContext();

  /**
   * Get translation for a key
   * @param {string} key - Translation key (supports nested keys with dot notation)
   * @param {Object} params - Optional parameters for string interpolation
   * @returns {string} Translated text
   */
  const t = (key, params = {}) => {
    // Get translation from current language
    let translation = getNestedTranslation(translations[currentLanguage], key);

    // Fallback to English if translation not found
    if (translation === undefined || translation === null) {
      console.warn(`Translation missing for key: "${key}" in language: "${currentLanguage}". Falling back to English.`);
      translation = getNestedTranslation(translations.en, key);
    }

    // If still not found, return the key itself
    if (translation === undefined || translation === null) {
      console.error(`Translation missing for key: "${key}" in all languages.`);
      return key;
    }

    // Replace parameters in translation string
    return replaceParams(translation, params);
  };

  /**
   * Get nested translation using dot notation
   * @param {Object} obj - Translation object
   * @param {string} path - Dot-separated path (e.g., "common.buttons.save")
   * @returns {string|undefined} Translation value
   */
  const getNestedTranslation = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  /**
   * Replace parameters in translation string
   * @param {string} str - Translation string with {{param}} placeholders
   * @param {Object} params - Parameters object
   * @returns {string} String with replaced parameters
   */
  const replaceParams = (str, params) => {
    if (typeof str !== 'string') return str;
    
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  };

  return { t, currentLanguage };
};

export default useTranslation;