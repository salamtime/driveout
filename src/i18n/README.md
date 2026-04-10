## Translation Catalog

The app now has a central generated translation catalog at:

- `/Users/amrani/Desktop/rental-system-frontend/src/i18n/translation-catalog.json`

It contains:

- `localeKeys`: the existing `i18next` key-based translations from `src/i18n/locales/*.json`
- `inlinePhrases`: extracted `tr('English', 'French')` pairs from the codebase

### Rebuild the catalog

Run:

```bash
npm run translations:build
```

This regenerates:

- `src/i18n/translation-catalog.json`
- `src/i18n/generated/inline.en.json`
- `src/i18n/generated/inline.fr.json`
- `src/i18n/generated/inline.ar.json`

### Future language workflow

For future languages, prefer one of these:

1. Add keyed translations in `src/i18n/locales/<lang>.json`
2. Add translations to the central catalog output and generated inline locale files

For new inline UI text, prefer the shared helper:

```js
import { translateInline } from '@/i18n/translateInline';

const tr = (en, fr) => translateInline(en, fr);
```

That keeps future language work centralized instead of depending on scattered component-local pairs.
