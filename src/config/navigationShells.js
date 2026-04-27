import {
  LayoutDashboard,
  CalendarDays,
  Compass,
  ClipboardList,
  Users,
  Car,
  WalletCards,
  Wrench,
  Fuel,
  Boxes,
  CreditCard,
  Bell,
  Shield,
  Settings,
  FileOutput,
  FileText,
  Globe,
  Store,
  Building2,
} from 'lucide-react';

export const ADMIN_ROUTE_SHELL_META = [
  {
    match: '/admin/dashboard',
    eyebrow: 'Dashboard Overview',
    title: 'Dashboard',
    description: 'Preparing the dashboard workspace...',
    icon: LayoutDashboard,
  },
  {
    match: '/admin/calendar',
    eyebrow: 'Calendar',
    title: 'Calendar',
    description: 'Preparing the calendar workspace...',
    icon: CalendarDays,
  },
  {
    match: '/admin/tours',
    eyebrow: 'Tours & Bookings',
    title: 'Tours & Bookings',
    description: 'Preparing the tours workspace...',
    icon: Compass,
  },
  {
    match: '/admin/tasks',
    eyebrow: 'Team Tasks',
    title: 'Tasks',
    description: 'Preparing the task workspace...',
    icon: ClipboardList,
  },
  {
    match: '/admin/rentals',
    eyebrow: 'Rental Management',
    title: 'Rental Management',
    description: 'Preparing the rentals workspace...',
    icon: ClipboardList,
  },
  {
    match: '/admin/customers',
    eyebrow: 'Customer Management',
    title: 'Customer Management',
    description: 'Preparing the customer workspace...',
    icon: Users,
  },
  {
    match: '/admin/fleet',
    eyebrow: 'Vehicles',
    title: 'Vehicles',
    description: 'Preparing the vehicles workspace...',
    icon: Car,
  },
  {
    match: '/admin/pricing',
    eyebrow: 'Pricing Management',
    title: 'Pricing Management',
    description: 'Preparing the pricing workspace...',
    icon: WalletCards,
  },
  {
    match: '/admin/maintenance',
    eyebrow: 'Maintenance',
    title: 'Maintenance',
    description: 'Preparing the maintenance workspace...',
    icon: Wrench,
  },
  {
    match: '/admin/fuel',
    eyebrow: 'Fuel Management',
    title: 'Fuel Management',
    description: 'Preparing the fuel workspace...',
    icon: Fuel,
  },
  {
    match: '/admin/inventory',
    eyebrow: 'Inventory',
    title: 'Inventory',
    description: 'Preparing the inventory workspace...',
    icon: Boxes,
  },
  {
    match: '/admin/finance',
    eyebrow: 'Finance Management',
    title: 'Finance Management',
    description: 'Preparing the finance workspace...',
    icon: CreditCard,
  },
  {
    match: '/admin/alerts',
    eyebrow: 'Alerts',
    title: 'Alerts',
    description: 'Preparing the alerts workspace...',
    icon: Bell,
  },
  {
    match: '/admin/users',
    eyebrow: 'User & Role Management',
    title: 'User & Role Management',
    description: 'Preparing the users workspace...',
    icon: Shield,
  },
  {
    match: '/admin/verification',
    eyebrow: 'Verification Center',
    title: 'Verification Center',
    description: 'Preparing the verification queue...',
    icon: Shield,
  },
  {
    match: '/admin/workspaces',
    eyebrow: 'Workspaces',
    title: 'Workspaces',
    description: 'Preparing tenant workspace controls...',
    icon: Building2,
  },
  {
    match: '/admin/marketplace',
    eyebrow: 'Marketplace Review',
    title: 'Marketplace Review',
    description: 'Preparing marketplace moderation...',
    icon: Store,
  },
  {
    match: '/admin/settings',
    eyebrow: 'System Settings',
    title: 'System Settings',
    description: 'Preparing the settings workspace...',
    icon: Settings,
  },
  {
    match: '/admin/website',
    eyebrow: 'Website Editor',
    title: 'Website Editor',
    description: 'Preparing the website editor...',
    icon: Globe,
  },
  {
    match: '/admin/export',
    eyebrow: 'Project Export',
    title: 'Project Export',
    description: 'Preparing the export workspace...',
    icon: FileOutput,
  },
];

const PUBLIC_STOREFRONT_SHELL_PATHS = [
  '/',
  '/website',
  '/rent',
  '/rentals',
  '/marketplace',
  '/tours',
  '/tour-booking',
  '/rental-booking',
];

const PUBLIC_DOCUMENT_SHELL_PATHS = [
  '/d',
  '/view/share',
  '/view/rental',
];

export const isPublicStorefrontShellPath = (pathname = '') =>
  PUBLIC_STOREFRONT_SHELL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export const isPublicDocumentShellPath = (pathname = '') =>
  PUBLIC_DOCUMENT_SHELL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export const isAccountWorkspaceShellPath = (pathname = '') =>
  pathname === '/account' || pathname.startsWith('/account/');

export const getRouteShellMeta = (pathname = '') =>
  ADMIN_ROUTE_SHELL_META.find((route) => pathname.startsWith(route.match)) || {
    eyebrow: 'Module',
    title: 'Loading Module',
    description: 'Preparing the workspace...',
    icon: FileText,
  };

export const hasRouteShellFallback = (pathname = '') =>
  isPublicStorefrontShellPath(pathname) ||
  isPublicDocumentShellPath(pathname) ||
  isAccountWorkspaceShellPath(pathname) ||
  pathname.startsWith('/admin/');

export const shouldSuppressBlockingPageLoader = ({
  pathname = '',
  isTransitionFlow = false,
}) => Boolean(isTransitionFlow && hasRouteShellFallback(pathname));
