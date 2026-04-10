import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import enTranslations from './locales/en.json';
import frTranslations from './locales/fr.json';
import arTranslations from './locales/ar.json';
import inlineEnTranslations from './generated/inline.en.json';
import inlineFrTranslations from './generated/inline.fr.json';
import inlineArTranslations from './generated/inline.ar.json';

const deepMerge = (base, extension) => {
  if (Array.isArray(base) || Array.isArray(extension)) {
    return extension ?? base;
  }

  if (base && typeof base === 'object' && extension && typeof extension === 'object') {
    const result = { ...base };
    for (const [key, value] of Object.entries(extension)) {
      result[key] = key in result ? deepMerge(result[key], value) : value;
    }
    return result;
  }

  return extension ?? base;
};

// Configure i18next
i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources: {
      en: {
        translation: deepMerge(enTranslations, inlineEnTranslations)
      },
      fr: {
        translation: deepMerge(frTranslations, inlineFrTranslations)
      },
      ar: {
        translation: deepMerge(arTranslations, inlineArTranslations)
      }
    },
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    
    interpolation: {
      escapeValue: false // React already does escaping
    },
    
    // Define detection options
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app_language',
      caches: ['localStorage'],
    }
  });

// Helper function to change language
export const changeLanguage = (language) => {
  i18n.changeLanguage(language);
  localStorage.setItem('app_language', language);
  localStorage.setItem('saharax_language', language);
  
  // Set document direction based on language
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
};

export default i18n;
