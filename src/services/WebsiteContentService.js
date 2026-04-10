const STORAGE_KEY = 'saharax_website_content_v1';
const EVENT_NAME = 'saharax:website-content-updated';

const mergeDeep = (base, override) => {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override ?? base;
  }

  if (base && typeof base === 'object' && override && typeof override === 'object') {
    const result = { ...base };
    Object.entries(override).forEach(([key, value]) => {
      result[key] = mergeDeep(base?.[key], value);
    });
    return result;
  }

  return override ?? base;
};

const DEFAULT_CONTENT = {
  landing: {
    eyebrow: 'Start with the experience',
    title: 'Pick rentals or tours first, then choose the city and go straight in.',
    subtitle:
      'This landing page is now built around the flow we discussed: one clear decision up front, one city choice, then the right public journey.',
    rentTitle: 'Rent a Vehicle',
    rentDescription: 'Choose a vehicle, lock your city, and move straight into the rental flow.',
    toursTitle: 'Book a Tour',
    toursDescription: 'Start with the city first, then jump into guided experiences and tour routes.',
    cityTitle: 'Choose the city first',
    cityDescription: 'Your next page will open already focused on the city you select here.',
    rentPrimaryCta: 'Browse rentals in this city',
    toursPrimaryCta: 'Explore tours in this city',
    rentSecondaryCta: 'Switch to guided tours',
    toursSecondaryCta: 'Switch to vehicle rentals',
  },
  rentPage: {
    eyebrow: 'Rent',
    title: 'Find the right vehicle fast.',
    subtitle: 'Choose a city, tap a category, and browse the vehicles that are actually ready to book.',
    browseEyebrow: 'Browse',
    browseTitle: 'Pick the essentials',
    searchPlaceholder: 'Search by model or brand',
    moreFiltersLabel: 'More filters',
    sourceLabel: 'Source',
    cityLabel: 'City',
    bookingFlowLabel: 'Booking flow',
    brandLabel: 'Brand',
  },
  toursPage: {
    badge: 'Guided tours',
    title: 'Guided tours built around the city you choose first.',
    subtitle:
      'This page now follows the same public flow as rentals: choose the city, explore the guided experiences there, and move straight into tour booking.',
    currentCityLabel: 'Current city',
    currentCityDescription: 'Switch city below and the guided tour grid updates instantly.',
    cityStepLabel: 'Step 1',
    cityStepTitle: 'Choose the tour city',
    categoryStepLabel: 'Step 2',
    categoryStepTitle: 'Narrow the guided experience',
    guidedEyebrow: 'Guided experiences',
    toursReadyTemplate: '{count} tours ready in {city}',
    rentalsSwitchLabel: 'Prefer vehicles instead?',
  },
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const notify = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

class WebsiteContentService {
  getDefaults() {
    return DEFAULT_CONTENT;
  }

  getContent() {
    if (!canUseStorage()) {
      return DEFAULT_CONTENT;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_CONTENT;
      const parsed = JSON.parse(raw);
      return mergeDeep(DEFAULT_CONTENT, parsed);
    } catch {
      return DEFAULT_CONTENT;
    }
  }

  saveSection(sectionKey, values) {
    if (!canUseStorage()) {
      return this.getContent();
    }

    const current = this.getContent();
    const next = mergeDeep(current, { [sectionKey]: values });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
    return next;
  }

  resetSection(sectionKey) {
    const current = this.getContent();
    const next = mergeDeep(current, { [sectionKey]: DEFAULT_CONTENT[sectionKey] || {} });
    if (canUseStorage()) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      notify();
    }
    return next;
  }

  subscribe(callback) {
    if (typeof window === 'undefined') return () => {};

    const handleStorage = (event) => {
      if (!event || event.key === STORAGE_KEY) {
        callback(this.getContent());
      }
    };

    const handleCustom = () => {
      callback(this.getContent());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_NAME, handleCustom);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustom);
    };
  }
}

const websiteContentService = new WebsiteContentService();

export default websiteContentService;
