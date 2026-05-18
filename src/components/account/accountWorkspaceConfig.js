import {
  Bell,
  Compass,
  CreditCard,
  Car,
  LayoutDashboard,
  MessageSquare,
  Rocket,
  Settings,
  ShieldCheck,
  Star,
  Store,
  Gift,
} from 'lucide-react';
import {
  ACCOUNT_PRODUCT_PILLARS,
  ACCOUNT_WORKSPACE_MODES,
} from '../../utils/accountProductModel';

export { ACCOUNT_WORKSPACE_MODES };

export const ACCOUNT_WORKSPACE_SECTIONS = [
  {
    id: 'overview',
    productPillar: ACCOUNT_PRODUCT_PILLARS.home,
    label: { en: 'Home', fr: 'Accueil' },
    href: '/account/overview',
    icon: LayoutDashboard,
    accent: 'from-violet-500 to-indigo-600',
    description: {
      en: 'Your workspace summary, actions, and status signals.',
      fr: 'Votre résumé d’espace, actions et statuts importants.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'rentals',
    productPillar: ACCOUNT_PRODUCT_PILLARS.trips,
    label: { en: 'Trips', fr: 'Parcours' },
    href: '/account/rentals',
    moduleName: 'Rental Management',
    icon: Compass,
    accent: 'from-indigo-500 to-violet-600',
    description: {
      en: 'Upcoming, active, and past rental activity.',
      fr: 'Locations à venir, actives et passées.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'tours',
    productPillar: ACCOUNT_PRODUCT_PILLARS.trips,
    label: { en: 'Tours', fr: 'Tours' },
    href: '/account/tours',
    moduleName: 'Tours & Bookings',
    icon: Bell,
    accent: 'from-fuchsia-500 to-violet-600',
    description: {
      en: 'Guided tour history and support entry points.',
      fr: 'Historique des tours et accès support.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
    hiddenInPrimaryNav: true,
  },
  {
    id: 'marketplace',
    productPillar: ACCOUNT_PRODUCT_PILLARS.listings,
    label: { en: 'Listings', fr: 'Annonces' },
    href: '/account/marketplace',
    moduleName: 'Marketplace Review',
    icon: Store,
    accent: 'from-violet-500 to-fuchsia-600',
    description: {
      en: 'Listing setup, pricing, requests, approvals, and owner activity.',
      fr: 'Configuration des annonces, tarifs, demandes, approbations et activité propriétaire.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'my-vehicles',
    productPillar: ACCOUNT_PRODUCT_PILLARS.listings,
    label: { en: 'Listing Studio', fr: "Studio d'annonce" },
    href: '/account/vehicles',
    moduleName: 'Fleet Management',
    icon: Car,
    accent: 'from-indigo-500 to-violet-600',
    description: {
      en: 'Vehicle profile, legal documents, pricing, readiness, and go-live controls.',
      fr: 'Profil véhicule, documents légaux, tarification, préparation et contrôles de mise en ligne.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
    hiddenInPrimaryNav: true,
  },
  {
    id: 'messages',
    productPillar: ACCOUNT_PRODUCT_PILLARS.inbox,
    label: { en: 'Inbox', fr: 'Inbox' },
    href: '/account/messages',
    moduleName: 'Messages',
    icon: MessageSquare,
    accent: 'from-emerald-500 to-teal-600',
    description: {
      en: 'Admin, owner, and booking-linked communication.',
      fr: 'Communication admin, propriétaire et liée aux réservations.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'boost',
    productPillar: ACCOUNT_PRODUCT_PILLARS.listings,
    label: { en: 'Boost', fr: 'Boost' },
    href: '/account/boost',
    moduleName: 'Marketplace Review',
    icon: Rocket,
    accent: 'from-fuchsia-500 to-violet-600',
    description: {
      en: 'Credits, missions, featured boosts, and growth rewards.',
      fr: 'Crédits, missions, boosts en vedette et récompenses de croissance.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.owner],
    hiddenInPrimaryNav: true,
  },
  {
    id: 'rewards',
    productPillar: ACCOUNT_PRODUCT_PILLARS.wallet,
    label: { en: 'Credits', fr: 'Crédits' },
    href: '/account/rewards',
    icon: Gift,
    accent: 'from-amber-500 to-orange-500',
    description: {
      en: 'Task credits, redemptions, and loyalty value inside your wallet.',
      fr: 'Crédits de missions, utilisations et valeur fidélité dans votre portefeuille.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
    hiddenInPrimaryNav: true,
  },
  {
    id: 'reviews',
    productPillar: ACCOUNT_PRODUCT_PILLARS.account,
    label: { en: 'Reputation', fr: 'Reputation' },
    href: '/account/reviews',
    icon: Star,
    accent: 'from-amber-500 to-orange-500',
    description: {
      en: 'Account reputation, listing feedback, and trip-linked review history.',
      fr: 'Reputation du compte, retours d’annonce et historique d’avis lié aux trajets.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
    hiddenInPrimaryNav: true,
  },
  {
    id: 'revenue',
    productPillar: ACCOUNT_PRODUCT_PILLARS.wallet,
    label: { en: 'Wallet', fr: 'Portefeuille' },
    href: '/account/revenue',
    moduleName: 'Finance Management',
    icon: CreditCard,
    accent: 'from-emerald-500 to-lime-500',
    description: {
      en: 'Your finance home for payments & payouts, credits, and money activity.',
      fr: "Votre centre finance pour paiements & virements, crédits et activité d'argent.",
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'verification',
    productPillar: ACCOUNT_PRODUCT_PILLARS.account,
    label: { en: 'Trust center', fr: 'Centre de confiance' },
    href: '/account/verification',
    moduleName: 'Verification Center',
    icon: ShieldCheck,
    accent: 'from-cyan-500 to-sky-600',
    description: {
      en: 'Identity trust, approvals, and the requirements that unlock review and go-live.',
      fr: 'Confiance identité, validations et éléments qui débloquent la revue et la mise en ligne.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
    hiddenInPrimaryNav: true,
  },
  {
    id: 'settings',
    productPillar: ACCOUNT_PRODUCT_PILLARS.account,
    label: { en: 'Account', fr: 'Compte' },
    href: '/account/settings',
    icon: Settings,
    accent: 'from-slate-500 to-slate-700',
    description: {
      en: 'Profile, trust center, contact details, and workspace preferences.',
      fr: 'Profil, centre de confiance, coordonnées et préférences d’espace.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
];

export const getAccountWorkspaceSection = (sectionId) =>
  ACCOUNT_WORKSPACE_SECTIONS.find((section) => section.id === sectionId) || ACCOUNT_WORKSPACE_SECTIONS[0];

export const getAccountWorkspaceSectionsForMode = (mode = ACCOUNT_WORKSPACE_MODES.service) =>
  ACCOUNT_WORKSPACE_SECTIONS
    .filter((section) =>
      (Array.isArray(section.visibleIn) ? section.visibleIn.includes(mode) : true) &&
      !section.hiddenInPrimaryNav
    )
    .sort((left, right) => {
      const sharedOrder = [
        'overview',
        'marketplace',
        'messages',
        'rentals',
        'revenue',
        'settings',
      ];
      const order = sharedOrder;
      const leftIndex = order.indexOf(left.id);
      const rightIndex = order.indexOf(right.id);
      const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return normalizedLeftIndex - normalizedRightIndex;
    });

export const getAccountWorkspaceSectionByPath = (pathname = '') => {
  const normalizedPathname = String(pathname || '').trim();

  if (
    normalizedPathname === '/account/vehicles' ||
    normalizedPathname.startsWith('/account/vehicles/') ||
    normalizedPathname.startsWith('/account/marketplace/vehicles/') ||
    normalizedPathname === '/account/marketplace' ||
    normalizedPathname.startsWith('/account/marketplace/') ||
    normalizedPathname === '/account/boost' ||
    normalizedPathname.startsWith('/account/boost/')
  ) {
    return getAccountWorkspaceSection('marketplace');
  }

  if (
    normalizedPathname === '/account/tours' ||
    normalizedPathname.startsWith('/account/tours/') ||
    normalizedPathname === '/account/rentals' ||
    normalizedPathname.startsWith('/account/rentals/')
  ) {
    return getAccountWorkspaceSection('rentals');
  }

  if (
    normalizedPathname === '/account/revenue' ||
    normalizedPathname.startsWith('/account/revenue/') ||
    normalizedPathname === '/account/rewards' ||
    normalizedPathname.startsWith('/account/rewards/')
  ) {
    return getAccountWorkspaceSection('revenue');
  }

  if (
    normalizedPathname === '/account/settings' ||
    normalizedPathname.startsWith('/account/settings/') ||
    normalizedPathname === '/account/verification' ||
    normalizedPathname.startsWith('/account/verification/') ||
    normalizedPathname === '/account/reviews' ||
    normalizedPathname.startsWith('/account/reviews/')
  ) {
    return getAccountWorkspaceSection('settings');
  }

  const matched = ACCOUNT_WORKSPACE_SECTIONS.find((section) => normalizedPathname === section.href || normalizedPathname.startsWith(`${section.href}/`));
  return matched || null;
};
