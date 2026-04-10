import i18n from './index';
import catalog from './translation-catalog.json';

const keyByEnglish = new Map(
  Object.entries(catalog.inlinePhrases || {}).map(([key, entry]) => [entry.en, key])
);

export const translateInline = (englishText, frenchText = englishText) => {
  const key = keyByEnglish.get(englishText);
  const fallback = i18n.resolvedLanguage === 'fr' ? frenchText : englishText;

  if (!key) {
    return fallback;
  }

  const translated = i18n.t(key, { defaultValue: fallback });
  return translated || fallback;
};

export default translateInline;
