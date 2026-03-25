import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the Language Context
const LanguageContext = createContext();

// Supported languages
export const LANGUAGES = {
  en: { code: 'en', name: 'English', flag: '🇬🇧' },
  fr: { code: 'fr', name: 'Français', flag: '🇫🇷' }
};

// Language Provider Component
export const LanguageProvider = ({ children }) => {
  // Initialize language from localStorage or default to English
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem('app_language');
    return savedLanguage && LANGUAGES[savedLanguage] ? savedLanguage : 'en';
  });

  // Persist language preference to localStorage
  useEffect(() => {
    localStorage.setItem('app_language', currentLanguage);
    // Update HTML lang attribute for accessibility
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  // Toggle between languages
  const toggleLanguage = () => {
    setCurrentLanguage(prev => prev === 'en' ? 'fr' : 'en');
  };

  // Set specific language
  const setLanguage = (langCode) => {
    if (LANGUAGES[langCode]) {
      setCurrentLanguage(langCode);
    } else {
      console.warn(`Language ${langCode} not supported. Falling back to English.`);
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