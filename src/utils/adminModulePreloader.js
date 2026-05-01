const adminModuleLoaders = [
  { path: '/admin/calendar', load: () => import('../pages/admin/Calendar') },
  { path: '/admin/tours', load: () => import('../pages/admin/Tours') },
  { path: '/admin/rentals', load: () => import('../pages/admin/Rentals') },
  { path: '/admin/customers', load: () => import('../components/CustomerManagementDashboard') },
  { path: '/admin/fleet', load: () => import('../pages/admin/Fleet') },
  { path: '/admin/pricing', load: () => import('../pages/admin/Pricing') },
  { path: '/admin/maintenance', load: () => import('../pages/admin/Maintenance') },
  { path: '/admin/fuel', load: () => import('../pages/admin/Fuel') },
  { path: '/admin/inventory', load: () => import('../pages/admin/Inventory') },
  { path: '/admin/finance', load: () => import('../pages/admin/Finance') },
  { path: '/admin/alerts', load: () => import('../pages/admin/Alerts') },
  { path: '/admin/users', load: () => import('../pages/admin/UserManagement') },
  { path: '/admin/settings', load: () => import('../pages/admin/Settings') },
  { path: '/admin/export', load: () => import('../pages/admin/Export') },
];

let prewarmStarted = false;

const runIdleTask = (callback, delay = 0) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 1500 });
  }

  return window.setTimeout(callback, delay);
};

export const prewarmAdminModuleChunks = (currentPath = '') => {
  if (prewarmStarted || typeof window === 'undefined') {
    return;
  }

  prewarmStarted = true;

  const prioritizedLoaders = [
    ...adminModuleLoaders.filter((entry) => !currentPath.startsWith(entry.path)),
    ...adminModuleLoaders.filter((entry) => currentPath.startsWith(entry.path)),
  ];

  prioritizedLoaders.forEach((entry, index) => {
    runIdleTask(() => {
      entry.load().catch(() => null);
    }, index * 180);
  });
};

export const prefetchAdminModuleChunk = (path) => {
  if (typeof window === 'undefined' || !path) {
    return;
  }

  const target = adminModuleLoaders.find((entry) => path.startsWith(entry.path));
  if (!target) {
    return;
  }

  runIdleTask(() => {
    target.load().catch(() => null);
  }, 0);
};
