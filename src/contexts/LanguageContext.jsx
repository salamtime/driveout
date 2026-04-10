import React, { createContext, useState, useEffect, useContext } from 'react';
import i18n, { changeLanguage as applyI18nLanguage } from '../i18n';
import { fetchSystemSettings } from '../services/systemSettingsApi';

// Create the Language Context
const LanguageContext = createContext();

// Supported languages
export const LANGUAGES = {
  en: { code: 'en', name: 'English', flag: '🇬🇧' },
  fr: { code: 'fr', name: 'Français', flag: '🇫🇷' },
  ar: { code: 'ar', name: 'العربية', flag: '🇲🇦' }
};

// Language Provider Component
export const LanguageProvider = ({ children }) => {
  const getStoredLanguage = () => {
    const savedLanguage = localStorage.getItem('app_language') || localStorage.getItem('saharax_language');
    return savedLanguage && LANGUAGES[savedLanguage] ? savedLanguage : null;
  };

  // Initialize language from localStorage or default to English
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    return getStoredLanguage() || 'en';
  });

  // Persist language preference to localStorage
  useEffect(() => {
    localStorage.setItem('app_language', currentLanguage);
    localStorage.setItem('saharax_language', currentLanguage);
    applyI18nLanguage(currentLanguage);
  }, [currentLanguage]);

  useEffect(() => {
    let cancelled = false;

    const syncLanguageFromSystemSettings = async () => {
      if (getStoredLanguage()) {
        return;
      }

      try {
        const settings = await fetchSystemSettings();
        const nextLanguage = settings?.language;
        if (!cancelled && !getStoredLanguage() && nextLanguage && LANGUAGES[nextLanguage] && nextLanguage !== currentLanguage) {
          setCurrentLanguage(nextLanguage);
        }
      } catch (error) {
        // Ignore here because public pages / unauthenticated screens will not have a session yet.
        if (import.meta.env.DEV) {
          console.warn('LanguageContext: system settings language sync skipped:', error?.message || error);
        }
      }
    };

    syncLanguageFromSystemSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle between languages
  const toggleLanguage = () => {
    setCurrentLanguage(prev => {
      const nextLanguage = prev === 'en' ? 'fr' : 'en';
      applyI18nLanguage(nextLanguage);
      return nextLanguage;
    });
  };

  // Set specific language
  const setLanguage = (langCode) => {
    if (LANGUAGES[langCode]) {
      applyI18nLanguage(langCode);
      setCurrentLanguage(langCode);
    } else {
      console.warn(`Language ${langCode} not supported. Falling back to English.`);
      applyI18nLanguage('en');
      setCurrentLanguage('en');
    }
  };

  const value = {
    currentLanguage,
    setLanguage,
    toggleLanguage,
    languages: LANGUAGES
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

// Custom hook to use language context
export const useLanguageContext = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguageContext must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
