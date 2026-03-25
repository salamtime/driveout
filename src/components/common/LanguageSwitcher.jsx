import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setLanguage } from '../../store/slices/appSlice';

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  // Available languages
  const languages = [
    { code: 'en', name: t('common.english'), flag: '🇬🇧' },
    { code: 'fr', name: t('common.french'), flag: '🇫🇷' },
    { code: 'ar', name: t('common.arabic'), flag: '🇲🇦' }
  ];
  
  // Get current language
  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];
  
  // Handle language change
  const changeLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('saharax_language', langCode);
    dispatch(setLanguage(langCode));
    setIsOpen(false);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center text-gray-700 hover:text-blue-500 focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('common.language')}
      >
        <span className="mr-1">{currentLanguage.flag}</span>
        <span className="hidden md:inline">{currentLanguage.code.toUpperCase()}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-50 mt-2 py-2 w-32 bg-white rounded-md shadow-lg">
          {languages.map(language => (
            <button
              key={language.code}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${language.code === currentLanguage.code ? 'bg-gray-100' : ''}`}
              onClick={() => changeLanguage(language.code)}
            >
              <span className="mr-2">{language.flag}</span>
              {language.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;