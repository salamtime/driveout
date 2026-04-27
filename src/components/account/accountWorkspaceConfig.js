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

export const ACCOUNT_WORKSPACE_MODES = {
  service: 'service',
  ownerSetup: 'owner_setup',
  owner: 'owner',
};

export const ACCOUNT_WORKSPACE_SECTIONS = [
  {
    id: 'overview',
    label: { en: 'My Profile', fr: 'Mon profil' },
    href: '/account/overview',
    icon: LayoutDashboard,
    accent: 'from-violet-500 to-indigo-600',
    description: {
      en: 'Your private workspace summary, actions, and status signals.',
      fr: 'Votre résumé d’espace privé, actions et statuts importants.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'rentals',
    label: { en: 'My Rentals', fr: 'Mes locations' },
    href: '/account/rentals',
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
    label: { en: 'My Tours', fr: 'Mes tours' },
    href: '/account/tours',
    icon: Bell,
    accent: 'from-fuchsia-500 to-violet-600',
    description: {
      en: 'Private guided tour history and support entry points.',
      fr: 'Historique privé des tours et accès support.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'marketplace',
    label: { en: 'Marketplace', fr: 'Marketplace' },
    href: '/account/marketplace',
    icon: Store,
    accent: 'from-violet-500 to-fuchsia-600',
    description: {
      en: 'Vehicles, requests, approvals, and owner activity.',
      fr: 'Véhicules, demandes, approbations et activité propriétaire.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'my-vehicles',
    label: { en: 'My Vehicles', fr: 'Mes véhicules' },
    href: '/account/vehicles',
    icon: Car,
    accent: 'from-indigo-500 to-violet-600',
    description: {
      en: 'Your private vehicle profiles, maintenance tracking, and listing readiness.',
      fr: 'Vos profils véhicules privés, suivi maintenance et préparation à la mise en ligne.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'messages',
    label: { en: 'Messages', fr: 'Messages' },
    href: '/account/messages',
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
    label: { en: 'Boost', fr: 'Boost' },
    href: '/account/boost',
    icon: Rocket,
    accent: 'from-fuchsia-500 to-violet-600',
    description: {
      en: 'Credits, missions, featured boosts, and growth rewards.',
      fr: 'Crédits, missions, boosts en vedette et récompenses de croissance.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'rewards',
    label: { en: 'Credits', fr: 'Crédits' },
    href: '/account/rewards',
    icon: Gift,
    accent: 'from-amber-500 to-orange-500',
    description: {
      en: 'Task credits, redemptions, and loyalty value inside your wallet.',
      fr: 'Crédits de missions, utilisations et valeur fidélité dans votre portefeuille.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'reviews',
    label: { en: 'Reviews', fr: 'Avis' },
    href: '/account/reviews',
    icon: Star,
    accent: 'from-amber-500 to-orange-500',
    description: {
      en: 'Reputation, ratings, and feedback history.',
      fr: 'Réputation, notes et historique de feedback.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'revenue',
    label: { en: 'Wallet', fr: 'Portefeuille' },
    href: '/account/revenue',
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
    label: { en: 'Verification', fr: 'Vérification' },
    href: '/account/verification',
    icon: ShieldCheck,
    accent: 'from-cyan-500 to-sky-600',
    description: {
      en: 'Trust status, approvals, and missing requirements.',
      fr: 'Statut de confiance, validations et éléments manquants.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
  {
    id: 'settings',
    label: { en: 'Settings', fr: 'Paramètres' },
    href: '/account/settings',
    icon: Settings,
    accent: 'from-slate-500 to-slate-700',
    description: {
      en: 'Profile, contact details, and workspace preferences.',
      fr: 'Profil, coordonnées et préférences d’espace.',
    },
    visibleIn: [ACCOUNT_WORKSPACE_MODES.service, ACCOUNT_WORKSPACE_MODES.ownerSetup, ACCOUNT_WORKSPACE_MODES.owner],
  },
];

export const getAccountWorkspaceSection = (sectionId) =>
  ACCOUNT_WORKSPACE_SECTIONS.find((section) => section.id === sectionId) || ACCOUNT_WORKSPACE_SECTIONS[0];

export const getAccountWorkspaceSectionsForMode = (mode = ACCOUNT_WORKSPACE_MODES.service) =>
  ACCOUNT_WORKSPACE_SECTIONS
    .filter((section) =>
      Array.isArray(section.visibleIn) ? section.visibleIn.includes(mode) : true
    )
    .sort((left, right) => {
      const ownerOrder = [
        'overview',
        'marketplace',
        'my-vehicles',
        'messages',
        'revenue',
        'rewards',
        'verification',
        'boost',
        'reviews',
        'rentals',
        'tours',
        'settings',
      ];

      const ownerSetupOrder = [
        'overview',
        'marketplace',
        'my-vehicles',
        'messages',
        'revenue',
        'rewards',
        'verification',
        'reviews',
        'rentals',
        'tours',
        'settings',
      ];

      const serviceOrder = [
        'overview',
        'marketplace',
        'messages',
        'revenue',
        'rewards',
        'rentals',
        'tours',
        'reviews',
        'settings',
      ];

      const order =
        mode === ACCOUNT_WORKSPACE_MODES.owner
          ? ownerOrder
          : mode === ACCOUNT_WORKSPACE_MODES.ownerSetup
            ? ownerSetupOrder
            : serviceOrder;
      const leftIndex = order.indexOf(left.id);
      const rightIndex = order.indexOf(right.id);
      const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return normalizedLeftIndex - normalizedRightIndex;
    });

export const getAccountWorkspaceSectionByPath = (pathname = '') => {
  const matched = ACCOUNT_WORKSPACE_SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`));
  return matched || null;
};
