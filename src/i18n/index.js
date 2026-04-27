import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import inlineEnTranslations from './generated/inline.en.json';

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

const LANGUAGE_LOADERS = {
  en: async () => ({ translation: deepMerge(enTranslations, inlineEnTranslations) }),
  fr: async () => {
    const [{ default: base }, { default: inline }] = await Promise.all([
      import('./locales/fr.json'),
      import('./generated/inline.fr.json'),
    ]);

    return { translation: deepMerge(base, inline) };
  },
  ar: async () => {
    const [{ default: base }, { default: inline }] = await Promise.all([
      import('./locales/ar.json'),
      import('./generated/inline.ar.json'),
    ]);

    return { translation: deepMerge(base, inline) };
  },
};

const normalizeLanguage = (language) => {
  const code = String(language || '').trim().toLowerCase();
  return LANGUAGE_LOADERS[code] ? code : 'en';
};

const getInitialLanguage = () => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  try {
    const params = new URLSearchParams(window.location.search || '');
    const urlLanguage = String(params.get('lang') || '').trim().toLowerCase();
    if (LANGUAGE_LOADERS[urlLanguage]) {
      return urlLanguage;
    }
  } catch {
    // ignore URL parsing issues
  }

  try {
    const storedLanguage = normalizeLanguage(
      window.localStorage.getItem('app_language') || window.localStorage.getItem('saharax_language')
    );
    if (LANGUAGE_LOADERS[storedLanguage]) {
      return storedLanguage;
    }
  } catch {
    // ignore storage issues
  }

  if (typeof navigator !== 'undefined') {
    const browserLanguage = normalizeLanguage(navigator.language?.split('-')?.[0]);
    if (LANGUAGE_LOADERS[browserLanguage]) {
      return browserLanguage;
    }
  }

  return 'en';
};

const applyDocumentLanguage = (language) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
};

export const ensureLanguageResources = async (language) => {
  const normalizedLanguage = normalizeLanguage(language);

  if (!i18n.hasResourceBundle(normalizedLanguage, 'translation')) {
    const resources = await LANGUAGE_LOADERS[normalizedLanguage]();
    i18n.addResourceBundle(normalizedLanguage, 'translation', resources.translation, true, true);
  }
};

const initialLanguage = getInitialLanguage();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: deepMerge(enTranslations, inlineEnTranslations),
      },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app_language',
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
    },
  });

applyDocumentLanguage(initialLanguage);

if (initialLanguage !== 'en') {
  void ensureLanguageResources(initialLanguage)
    .then(() => i18n.changeLanguage(initialLanguage))
    .then(() => applyDocumentLanguage(initialLanguage))
    .catch(() => {
      applyDocumentLanguage('en');
    });
}

export const changeLanguage = async (language) => {
  const normalizedLanguage = normalizeLanguage(language);
  await ensureLanguageResources(normalizedLanguage);
  await i18n.changeLanguage(normalizedLanguage);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('app_language', normalizedLanguage);
    localStorage.setItem('saharax_language', normalizedLanguage);
  }

  applyDocumentLanguage(normalizedLanguage);
};

export default i18n;
