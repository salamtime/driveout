import {
  Bell,
  Compass,
  CreditCard,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Star,
  Store,
} from 'lucide-react';

export const ACCOUNT_WORKSPACE_SECTIONS = [
  {
    id: 'overview',
    label: { en: 'Overview', fr: 'Vue générale' },
    href: '/account/overview',
    icon: LayoutDashboard,
    accent: 'from-violet-500 to-indigo-600',
    description: {
      en: 'Your private workspace summary, actions, and status signals.',
      fr: 'Votre résumé d’espace privé, actions et statuts importants.',
    },
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
  },
  {
    id: 'revenue',
    label: { en: 'Revenue', fr: 'Revenus' },
    href: '/account/revenue',
    icon: CreditCard,
    accent: 'from-emerald-500 to-lime-500',
    description: {
      en: 'Transactions, payouts, and owner earnings.',
      fr: 'Transactions, paiements et revenus propriétaire.',
    },
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
  },
];

export const getAccountWorkspaceSection = (sectionId) =>
  ACCOUNT_WORKSPACE_SECTIONS.find((section) => section.id === sectionId) || ACCOUNT_WORKSPACE_SECTIONS[0];
