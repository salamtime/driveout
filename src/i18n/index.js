import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import enTranslations from './locales/en.json';
import frTranslations from './locales/fr.json';
import arTranslations from './locales/ar.json';

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
        translation: enTranslations
      },
      fr: {
        translation: frTranslations
      },
      ar: {
        translation: arTranslations
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
      lookupLocalStorage: 'saharax_language',
      caches: ['localStorage'],
    }
  });

// Helper function to change language
export const changeLanguage = (language) => {
  i18n.changeLanguage(language);
  localStorage.setItem('saharax_language', language);
  
  // Set document direction based on language
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
};

export default i18n;