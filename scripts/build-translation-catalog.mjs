import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const I18N_DIR = path.join(SRC_DIR, 'i18n');
const LOCALES_DIR = path.join(I18N_DIR, 'locales');
const GENERATED_DIR = path.join(I18N_DIR, 'generated');
const CATALOG_PATH = path.join(I18N_DIR, 'translation-catalog.json');

const CODE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git']);

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const walk = (dirPath, results = []) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, results);
      continue;
    }
    if (CODE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
};

const flattenObject = (value, prefix = '', output = {}) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenObject(item, `${prefix}${prefix ? '.' : ''}${index}`, output));
    return output;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenObject(child, nextPrefix, output);
    });
    return output;
  }

  output[prefix] = value;
  return output;
};

const setDeep = (target, dottedKey, value) => {
  const segments = dottedKey.split('.');
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
};

const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeJsString = (rawQuote, rawValue) => {
  return Function(`"use strict"; return (${rawQuote}${rawValue}${rawQuote});`)();
};

const slugify = (input) =>
  input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'translation';

const hashText = (input) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
};

const buildInlineEntries = (files) => {
  const pairRegex = /\btr\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[\s\S])*)\3/gm;
  const keyByEnglish = new Map();
  const entries = {};

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = pairRegex.exec(content)) !== null) {
      const [, enQuote, enRaw, frQuote, frRaw] = match;
      const en = decodeJsString(enQuote, enRaw).trim();
      const fr = decodeJsString(frQuote, frRaw).trim();
      if (!en || !fr) continue;

      let key = keyByEnglish.get(en);
      if (!key) {
        const baseKey = `inline.${slugify(en)}_${hashText(en)}`;
        key = baseKey;
        keyByEnglish.set(en, key);
        entries[key] = {
          en,
          fr,
          sources: []
        };
      }

      const line = content.slice(0, match.index).split('\n').length;
      entries[key].sources.push({
        file: path.relative(ROOT, filePath),
        line
      });
    }
  }

  Object.values(entries).forEach((entry) => {
    entry.sources.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  });

  return entries;
};

const buildInlineLocale = (entries, language) => {
  const result = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (language === 'en') {
      setDeep(result, key, entry.en);
    } else if (language === 'fr') {
      setDeep(result, key, entry.fr);
    }
  }
  return result;
};

const main = () => {
  const files = walk(SRC_DIR);
  const enLocale = readJson(path.join(LOCALES_DIR, 'en.json'));
  const frLocale = readJson(path.join(LOCALES_DIR, 'fr.json'));
  const arLocale = readJson(path.join(LOCALES_DIR, 'ar.json'));

  const flattenedLocales = {
    en: flattenObject(enLocale),
    fr: flattenObject(frLocale),
    ar: flattenObject(arLocale)
  };

  const localeKeys = {};
  const allLocaleKeys = new Set([
    ...Object.keys(flattenedLocales.en),
    ...Object.keys(flattenedLocales.fr),
    ...Object.keys(flattenedLocales.ar)
  ]);

  for (const key of Array.from(allLocaleKeys).sort()) {
    localeKeys[key] = {
      en: flattenedLocales.en[key] ?? null,
      fr: flattenedLocales.fr[key] ?? null,
      ar: flattenedLocales.ar[key] ?? null
    };
  }

  const inlineEntries = buildInlineEntries(files);

  const catalog = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceRoot: 'src',
      localeKeyCount: Object.keys(localeKeys).length,
      inlinePhraseCount: Object.keys(inlineEntries).length
    },
    localeKeys,
    inlinePhrases: inlineEntries
  };

  ensureDir(GENERATED_DIR);
  writeJson(CATALOG_PATH, catalog);
  writeJson(path.join(GENERATED_DIR, 'inline.en.json'), buildInlineLocale(inlineEntries, 'en'));
  writeJson(path.join(GENERATED_DIR, 'inline.fr.json'), buildInlineLocale(inlineEntries, 'fr'));
  writeJson(path.join(GENERATED_DIR, 'inline.ar.json'), buildInlineLocale(inlineEntries, 'ar'));

  console.log(`Built translation catalog with ${catalog.meta.localeKeyCount} locale keys and ${catalog.meta.inlinePhraseCount} inline phrases.`);
};

main();
