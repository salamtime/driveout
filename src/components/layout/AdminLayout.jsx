import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguageContext } from '../../contexts/LanguageContext';
import { useTenantWorkspaceContext } from '../../contexts/TenantWorkspaceContext';
import RentalMediaRetentionService from '../../services/RentalMediaRetentionService';
import MessageMediaRetentionService from '../../services/MessageMediaRetentionService';
import WebsiteBookingExpiryService from '../../services/WebsiteBookingExpiryService';
import appWarmupService from '../../services/AppWarmupService';
import FuelTransactionService from '../../services/FuelTransactionService';
import { getTaskStats } from '../../services/TaskService';
import { fetchSystemSettings, SYSTEM_SETTINGS_UPDATED_EVENT } from '../../services/systemSettingsApi';
import { prefetchAdminModuleChunk, prewarmAdminModuleChunks } from '../../utils/adminModulePreloader';
import { isApprovedBusinessOwnerAccount, isPlatformOwnerEmail } from '../../utils/accountType';
import { getHostContext, isSaharaXBrandingHost } from '../../utils/hostContext';
import OptimizedAvatar from '../common/OptimizedAvatar';
import MessageService from '../../services/MessageService';
import { APP_VERSION_LABEL } from '../../config/appVersion';
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
  Globe,
  FileOutput,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Home,
  Store,
  Star,
  CircleHelp,
  Building2,
  MessageSquare,
} from 'lucide-react';

const SAHARAX_DEFAULT_LOGO_URL = '/assets/logo.jpg';
const DRIVEOUT_ADMIN_LOGO_URL = '/assets/driveout-mark.svg';

const getTenantLogoFallback = () => {
  if (typeof window === 'undefined') return '';
  return isSaharaXBrandingHost() ? SAHARAX_DEFAULT_LOGO_URL : '';
};

const toTitleCaseWords = (value = '') =>
  String(value || '')
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 1200 });
  }

  return window.setTimeout(callback, 250);
};

const getTrialDaysRemaining = (trialEndsAt) => {
  if (!trialEndsAt) return 0;
  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) return 0;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

/**
 * AdminLayout - Comprehensive responsive layout for admin dashboard
 * 
 * Features:
 * - Responsive sidebar navigation (desktop/tablet/mobile)
 * - Core business modules (including Customer Management)
 * - Role-based access control
 * - Mobile hamburger menu
 * - Breadcrumb navigation
 * FIXED: iPad responsive behavior - hamburger menu for tablets
 * FIXED: iOS scroll support with touch-action and webkit properties
 */
const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalFocusDepth, setModalFocusDepth] = useState(0);
  const [forcedModalShellHidden, setForcedModalShellHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [taskStats, setTaskStats] = useState({ active: 0, my: 0, open: 0, attention: 0, unreadComments: 0 });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 76, right: 16, width: 288 });
  const [tenantLogoUrl, setTenantLogoUrl] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, signOut, hasPermission, hasFeature, platformAccess, tenantSession } = useAuth();
  const { tenant, tenantSettings } = useTenantWorkspaceContext();
  const { i18n } = useTranslation();
  const { setLanguage } = useLanguageContext();
  const profileMenuRef = useRef(null);
  const profileMenuButtonRef = useRef(null);
  const isFrench = i18n.resolvedLanguage === 'fr';
  const activeLanguage = isFrench ? 'fr' : 'en';
  const inheritedTenantLogoUrl = getTenantLogoFallback();
  const hostContext = getHostContext();
  const isTenantHostWorkspace = hostContext?.kind === 'tenant';
  const resolvedTenantSettings =
    tenantSettings && typeof tenantSettings === 'object'
      ? tenantSettings
      : {};
  const workspaceBrandName = String(
    resolvedTenantSettings.public_display_name ||
    resolvedTenantSettings.brand_name ||
    tenantSession?.tenantName ||
    tenant?.name ||
    tenant?.tenant_name ||
    toTitleCaseWords(tenantSession?.tenantSlug || tenant?.slug || tenant?.tenant_slug || hostContext.tenantSlug || '') ||
    'Driveout'
  ).trim();
  const workspaceBrandSubtitle = isFrench ? 'Espace opérations' : 'Operations workspace';
  const workspaceLogoUrl = String(
    resolvedTenantSettings.logo_url ||
    tenantLogoUrl ||
    inheritedTenantLogoUrl ||
    ''
  ).trim();
  const personalProfileImage =
    userProfile?.profile_picture_url ||
    userProfile?.avatar_url ||
    user?.user_metadata?.profile_picture_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.user_metadata?.photo_url ||
    '';
  const resolvedProfileImage = personalProfileImage || workspaceLogoUrl || '';
  const normalizedEmail = String(userProfile?.email || user?.email || '').toLowerCase();
  const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
  const hasPlatformControlAccess =
    platformOwnerOverride ||
    platformAccess?.is_platform_owner === true ||
    platformAccess?.is_platform_admin === true;
  const normalizedWorkspaceRole = String(userProfile?.role || '').toLowerCase();
  const isInternalTenantWorkspaceRole = ['owner', 'admin', 'employee', 'guide'].includes(normalizedWorkspaceRole);
  const isBusinessOwnerWorkspace =
    !platformOwnerOverride &&
    (
      normalizedWorkspaceRole === 'business_owner' ||
      (
        !isInternalTenantWorkspaceRole &&
        isApprovedBusinessOwnerAccount(user?.user_metadata || user?.app_metadata || {})
      )
    );

  // Navigation modules with permissions
  const navigationModules = [
    {
      id: 'dashboard',
      name: isFrench ? 'Dashboard' : 'Dashboard Overview',
      icon: LayoutDashboard,
      accent: 'from-violet-500 to-indigo-600',
      path: '/admin/dashboard',
      moduleName: 'Dashboard'
    },
    {
      id: 'calendar',
      name: isFrench ? 'Calendrier' : 'Calendar',
      icon: CalendarDays,
      accent: 'from-blue-500 to-sky-600',
      path: '/admin/calendar',
      moduleName: 'Calendar'
    },
    {
      id: 'tours',
      name: isFrench ? 'Tours & réservations' : 'Tours & Bookings',
      icon: Compass,
      accent: 'from-fuchsia-500 to-violet-600',
      path: '/admin/tours',
      moduleName: 'Tours & Bookings'
    },
    {
      id: 'live-map',
      name: isFrench ? 'Carte live' : 'Live Map',
      icon: Home,
      accent: 'from-emerald-500 to-green-600',
      path: '/admin/live-map',
      moduleName: 'Live Map'
    },
    {
      id: 'rentals',
      name: isFrench ? 'Gestion locations' : 'Rental Management',
      icon: ClipboardList,
      accent: 'from-violet-500 to-purple-600',
      path: '/admin/rentals',
      moduleName: 'Rental Management'
    },
    {
      id: 'customers',
      name: isFrench ? 'Gestion clients' : 'Customer Management',
      icon: Users,
      accent: 'from-sky-500 to-blue-600',
      path: '/admin/customers',
      moduleName: 'Customer Management'
    },
    {
      id: 'fleet',
      name: isFrench ? 'Gestion flotte' : 'Fleet Management',
      icon: Car,
      accent: 'from-blue-500 to-indigo-600',
      path: '/admin/fleet',
      moduleName: 'Fleet Management'
    },
    {
      id: 'pricing',
      name: isFrench ? 'Gestion tarifs' : 'Pricing Management',
      icon: WalletCards,
      accent: 'from-emerald-500 to-green-600',
      path: '/admin/pricing',
      moduleName: 'Pricing Management'
    },
    {
      id: 'maintenance',
      name: isFrench ? 'Maintenance' : 'Maintenance',
      icon: Wrench,
      accent: 'from-amber-500 to-orange-600',
      path: '/admin/maintenance',
      moduleName: 'Quad Maintenance'
    },
    {
      id: 'fuel',
      name: isFrench ? 'Logs carburant' : 'Fuel Logs',
      icon: Fuel,
      accent: 'from-teal-500 to-emerald-600',
      path: '/admin/fuel',
      moduleName: 'Fuel Logs'
    },
    {
      id: 'inventory',
      name: isFrench ? 'Inventaire' : 'Inventory',
      icon: Boxes,
      accent: 'from-slate-500 to-slate-700',
      path: '/admin/inventory',
      moduleName: 'Inventory'
    },
    {
      id: 'finance',
      name: isFrench ? 'Finance' : 'Finance',
      icon: CreditCard,
      accent: 'from-emerald-500 to-green-600',
      path: '/admin/finance',
      moduleName: 'Finance Management'
    },
    {
      id: 'alerts',
      name: isFrench ? 'Alertes' : 'Alerts',
      icon: Bell,
      accent: 'from-rose-500 to-pink-600',
      path: '/admin/alerts',
      moduleName: 'Alerts'
    },
    {
      id: 'users',
      name: isFrench ? 'Utilisateurs' : 'User Management',
      icon: Users,
      accent: 'from-slate-600 to-slate-800',
      path: '/admin/users',
      moduleName: 'User & Role Management'
    },
    {
      id: 'verification',
      name: isFrench ? 'Vérification' : 'Verification',
      icon: Shield,
      accent: 'from-violet-500 to-indigo-600',
      path: '/admin/verification',
      moduleName: 'Verification Center'
    },
    {
      id: 'messages',
      name: isFrench ? 'Centre de messages' : 'Message Center',
      icon: MessageSquare,
      accent: 'from-violet-500 to-fuchsia-600',
      path: '/admin/messages',
      moduleName: 'Messages'
    },
    {
      id: 'workspaces',
      name: isFrench ? 'Workspaces' : 'Workspaces',
      icon: Building2,
      accent: 'from-slate-500 to-slate-700',
      path: '/admin/workspaces',
      moduleName: 'Workspaces'
    },
    {
      id: 'platform-admins',
      name: isFrench ? 'Admins plateforme' : 'Platform Admins',
      icon: Shield,
      accent: 'from-violet-500 to-indigo-700',
      path: '/admin/platform-admins',
      moduleName: 'Platform Admins'
    },
    {
      id: 'marketplace',
      name: isFrench ? 'Marketplace' : 'Marketplace',
      icon: Store,
      accent: 'from-fuchsia-500 to-violet-600',
      path: '/admin/marketplace',
      moduleName: 'Marketplace Review'
    },
    {
      id: 'reviews',
      name: isFrench ? 'Avis' : 'Reviews',
      icon: Star,
      accent: 'from-amber-500 to-orange-600',
      path: '/admin/reviews',
      moduleName: 'Marketplace Review'
    },
    {
      id: 'website',
      name: isFrench ? 'Site web' : 'Website',
      icon: Globe,
      accent: 'from-sky-500 to-indigo-600',
      path: '/admin/website',
      moduleName: 'System Settings',
      featureKey: 'website_editor',
    },
    {
      id: 'export',
      name: isFrench ? 'Export' : 'Export',
      icon: FileOutput,
      accent: 'from-slate-500 to-slate-700',
      path: '/admin/export',
      moduleName: 'Project Export'
    },
    {
      id: 'settings',
      name: isFrench ? 'Paramètres' : 'Settings',
      icon: Settings,
      accent: 'from-slate-500 to-slate-700',
      path: '/admin/settings',
      moduleName: 'System Settings'
    }
  ];

  const workspaceEligibleNavigationModules = navigationModules.filter((module) => {
    if (
      hostContext.kind === 'tenant' &&
      ['workspaces', 'platform-admins'].includes(module.id) &&
      !hasPlatformControlAccess
    ) {
      return false;
    }

    if (isBusinessOwnerWorkspace && ['marketplace', 'website', 'export'].includes(module.id)) {
      return false;
    }

    if (module.featureKey && !hasFeature(module.featureKey)) {
      return false;
    }

    return true;
  });

  const visibleNavigationModules = workspaceEligibleNavigationModules.filter((module) => {
    return hasPermission(module.moduleName);
  });

  const handleModuleIntent = (module) => {
    if (!module?.path) {
      return;
    }

    prefetchAdminModuleChunk(module.path);
    appWarmupService.prefetchModuleIntent(module.moduleName);
  };

  const renderNavItem = (module) => {
    const isActive = location.pathname.startsWith(module.path);
    const Icon = module.icon;

    return (
      <button
        key={module.id}
        onMouseEnter={() => handleModuleIntent(module)}
        onFocus={() => handleModuleIntent(module)}
        onTouchStart={() => handleModuleIntent(module)}
        onClick={() => {
          if (shouldShowHamburger) {
            setSidebarOpen(false);
          }
          navigate(module.path);
        }}
        className={`
          group relative w-full overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-all duration-200
          ${isActive
            ? 'border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 text-violet-900 shadow-[0_16px_38px_rgba(79,70,229,0.12)]'
            : 'border-transparent bg-white/70 text-slate-700 hover:border-slate-200 hover:bg-white hover:shadow-sm'
          }
        `}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${module.accent} text-white shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`truncate text-sm font-semibold ${isActive ? 'text-violet-900' : 'text-slate-800'}`}>{module.name}</div>
            <div className={`mt-0.5 text-xs ${isActive ? 'text-violet-600' : 'text-slate-500'}`}>
              {isActive ? (isFrench ? 'Espace actuel' : 'Current workspace') : (isFrench ? 'Ouvrir le module' : 'Open module')}
            </div>
          </div>
          <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${isActive ? 'text-violet-600' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
        </div>
      </button>
    );
  };
  
  // FIXED: Handle responsive behavior with proper tablet breakpoints
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      const tablet = width >= 768 && width <= 1024; // iPad range
      const desktop = width > 1024;
      
      setIsMobile(mobile);
      setIsTablet(tablet);
      
      if (desktop) {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) {
      return undefined;
    }

    const updateProfileMenuPosition = () => {
      const trigger = profileMenuButtonRef.current;
      if (!trigger || typeof window === 'undefined') return;
      const rect = trigger.getBoundingClientRect();
      setProfileMenuPosition({
        top: rect.bottom + 12,
        right: Math.max(12, window.innerWidth - rect.right),
        width: Math.min(288, Math.max(240, window.innerWidth - 24)),
      });
    };

    const handlePointerDown = (event) => {
      const clickedInsideMenu = profileMenuRef.current?.contains(event.target);
      const clickedTrigger = profileMenuButtonRef.current?.contains(event.target);
      if (!clickedInsideMenu && !clickedTrigger) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    updateProfileMenuPosition();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateProfileMenuPosition);
    window.addEventListener('scroll', updateProfileMenuPosition, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateProfileMenuPosition);
      window.removeEventListener('scroll', updateProfileMenuPosition, true);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadTenantBranding = async () => {
      if (isTenantHostWorkspace) {
        const tenantSettings =
          Object.keys(resolvedTenantSettings || {}).length > 0
            ? resolvedTenantSettings
            : tenantSession?.tenantSettings && typeof tenantSession.tenantSettings === 'object'
              ? tenantSession.tenantSettings
            : {};
        if (!cancelled) {
          setTenantLogoUrl(String(tenantSettings.logo_url || '').trim());
        }
        return;
      }

      try {
        const tenantSettings = await fetchSystemSettings();
        if (!cancelled) {
          setTenantLogoUrl(String(tenantSettings?.logoUrl || '').trim());
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Admin branding unavailable:', error);
          setTenantLogoUrl('');
        }
      }
    };

    loadTenantBranding();

    const handleBrandingUpdate = (event) => {
      const nextLogoUrl = String(event?.detail?.logoUrl || '').trim();
      setTenantLogoUrl(nextLogoUrl);
    };

    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handleBrandingUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handleBrandingUpdate);
    };
  }, [isTenantHostWorkspace, resolvedTenantSettings, tenantSession]);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleAdminModalOpen = () => {
      setSidebarOpen(false);
      setProfileMenuOpen(false);
      setModalFocusDepth((current) => current + 1);
    };

    const handleAdminModalClose = () => {
      setModalFocusDepth((current) => Math.max(0, current - 1));
    };

    window.addEventListener('admin:modal-open', handleAdminModalOpen);
    window.addEventListener('admin:modal-close', handleAdminModalClose);
    return () => {
      window.removeEventListener('admin:modal-open', handleAdminModalOpen);
      window.removeEventListener('admin:modal-close', handleAdminModalClose);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return undefined;
    }

    const hasVisibleFullscreenModal = () => {
      const candidates = Array.from(document.querySelectorAll('body *')).filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (element.dataset?.adminShellIgnore === 'true') return false;
        const className = String(element.className || '');
        if (!className.includes('fixed') || !className.includes('inset-0')) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        if (style.position !== 'fixed') return false;
        if (!style.inset || style.inset === 'auto') {
          const coversViewport =
            style.top === '0px' &&
            style.right === '0px' &&
            style.bottom === '0px' &&
            style.left === '0px';
          if (!coversViewport) return false;
        }

        const looksLikeModalLayer =
          className.includes('z-50') ||
          className.includes('z-[') ||
          className.includes('backdrop-blur') ||
          className.includes('bg-black') ||
          className.includes('bg-slate-950') ||
          element.getAttribute('role') === 'dialog' ||
          element.dataset?.adminModalOpen === 'true';

        return looksLikeModalLayer;
      });

      return candidates.length > 0;
    };

    const syncForcedModalShellHidden = () => {
      const bodyFlag = document.body?.dataset?.workspaceDrawerOpen === 'true';
      const modalFlag = Boolean(
        document.querySelector('[data-admin-modal-open="true"], [role="dialog"][aria-modal="true"]')
      );
      const fullscreenModalFlag = hasVisibleFullscreenModal();
      setForcedModalShellHidden(bodyFlag || modalFlag || fullscreenModalFlag);
    };

    syncForcedModalShellHidden();

    const observer = new MutationObserver(syncForcedModalShellHidden);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-workspace-drawer-open', 'class', 'style', 'role', 'aria-modal', 'data-admin-modal-open'],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [location.pathname]);

  useEffect(() => {
    if (modalFocusDepth === 0) {
      return undefined;
    }

    const resetIfNoModal = () => {
      if (typeof document === 'undefined') return;
      const modalOpen = document.querySelector(
        '[data-admin-modal-open="true"], [role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"]'
      );
      if (!modalOpen) {
        setModalFocusDepth(0);
      }
    };

    const timer = window.setTimeout(resetIfNoModal, 300);
    return () => window.clearTimeout(timer);
  }, [modalFocusDepth, location.pathname]);

  useEffect(() => {
    if (!userProfile || !hasPermission('Fuel Logs') || isTenantHostWorkspace) {
      return undefined;
    }

    const backgroundTask = scheduleBackgroundTask(() => {
      FuelTransactionService.prewarmFuelWorkspace().catch(() => null);
    });

    return () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(backgroundTask);
      } else {
        clearTimeout(backgroundTask);
      }
    };
  }, [userProfile, hasPermission, isTenantHostWorkspace]);

  useEffect(() => {
    if (!userProfile?.id || isTenantHostWorkspace) return;

    let cancelled = false;
    const refreshTaskStats = () => {
      getTaskStats(userProfile.id)
        .then((stats) => {
          if (!cancelled) setTaskStats(stats);
        })
        .catch((error) => {
          console.warn('Admin layout task stats unavailable:', error.message || error);
        });
    };

    refreshTaskStats();
    window.addEventListener('task-comments-read', refreshTaskStats);

    return () => {
      cancelled = true;
      window.removeEventListener('task-comments-read', refreshTaskStats);
    };
  }, [userProfile?.id, location.pathname, isTenantHostWorkspace]);

  useEffect(() => {
    if (!userProfile || isTenantHostWorkspace) {
      return;
    }

    const backgroundTask = scheduleBackgroundTask(() => {
      prewarmAdminModuleChunks(location.pathname);
    });

    return () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(backgroundTask);
      } else {
        clearTimeout(backgroundTask);
      }
    };
  }, [userProfile, location.pathname, isTenantHostWorkspace]);

  useEffect(() => {
    if (isTenantHostWorkspace) {
      return undefined;
    }

    const userId = String(user?.id || '').trim();
    if (!userId) return undefined;

    const displayLabel = String(
      userProfile?.fullName ||
      userProfile?.display_name ||
      userProfile?.email ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      'Admin'
    ).trim();

    const workspaceRole = String(
      userProfile?.role ||
      user?.user_metadata?.role ||
      'admin'
    ).trim().toLowerCase() || 'admin';

    return MessageService.startWorkspacePresence({
      userId,
      userLabel: displayLabel,
      userRole: workspaceRole,
      pagePath: location.pathname,
    });
  }, [user?.id, user?.email, user?.user_metadata?.full_name, user?.user_metadata?.name, user?.user_metadata?.role, userProfile?.fullName, userProfile?.display_name, userProfile?.email, userProfile?.role, location.pathname, isTenantHostWorkspace]);

  useEffect(() => {
    if (isTenantHostWorkspace) {
      return undefined;
    }

    let cancelled = false;

    const runAutomaticRentalMediaCleanup = async () => {
      try {
        const result = await RentalMediaRetentionService.maybeRunAutomaticCleanup(
          userProfile?.role
        );
        if (!cancelled && result?.ran) {
          console.log('🧹 Automatic rental media cleanup completed:', result);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Automatic rental media cleanup skipped:', error);
        }
      }
    };

    if (userProfile?.role) {
      runAutomaticRentalMediaCleanup();
    }

    return () => {
      cancelled = true;
    };
  }, [userProfile?.role, isTenantHostWorkspace]);

  useEffect(() => {
    if (isTenantHostWorkspace) {
      return undefined;
    }

    let cancelled = false;

    const runAutomaticMessageMediaCleanup = async () => {
      try {
        const result = await MessageMediaRetentionService.maybeRunAutomaticCleanup(
          userProfile?.role
        );
        if (!cancelled && result?.ran) {
          console.log('🧹 Automatic message media cleanup completed:', result);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Automatic message media cleanup skipped:', error);
        }
      }
    };

    if (userProfile?.role) {
      runAutomaticMessageMediaCleanup();
    }

    return () => {
      cancelled = true;
    };
  }, [userProfile?.role, isTenantHostWorkspace]);

  useEffect(() => {
    if (isTenantHostWorkspace) {
      return undefined;
    }

    let cancelled = false;

    const runAutomaticWebsiteBookingCleanup = async () => {
      try {
        const result = await WebsiteBookingExpiryService.maybeRunAutomaticCleanup(
          userProfile?.role
        );
        if (!cancelled && result?.ran && result?.updated > 0) {
          console.log('🧹 Automatic website booking expiry completed:', result);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Automatic website booking expiry skipped:', error);
        }
      }
    };

    if (userProfile?.role) {
      runAutomaticWebsiteBookingCleanup();
    }

    return () => {
      cancelled = true;
    };
  }, [userProfile?.role, isTenantHostWorkspace]);

  // Get current module for breadcrumb
  const getCurrentModule = () => {
    return navigationModules.find(module => 
      location.pathname.startsWith(module.path)
    ) || navigationModules[0];
  };

  const currentModule = getCurrentModule();

  // Handle logout
  const handleLogout = async () => {
    try {
      setProfileMenuOpen(false);
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Return to website functionality
  const returnToWebsite = () => {
    setProfileMenuOpen(false);
    window.location.href = '/website';
  };

  const openAdminProfile = () => {
    setProfileMenuOpen(false);
    navigate('/admin/profile');
  };

  const openHelpSupport = () => {
    setProfileMenuOpen(false);
    navigate('/contact');
  };

  const shouldShowHamburger = isMobile || isTablet;
  const shouldFixSidebar = !isMobile && !isTablet;
  const shouldHideSidebarForModal = modalFocusDepth > 0 || forcedModalShellHidden;
  const shouldCollapseDesktopSidebar = shouldFixSidebar && shouldHideSidebarForModal;
  const previewBusinessOwnerId = new URLSearchParams(location.search).get('business_owner_id');
  const subscriptionStatus = String(userProfile?.subscriptionStatus || user?.user_metadata?.subscription_status || '').toLowerCase();
  const trialDaysRemaining = getTrialDaysRemaining(userProfile?.trialEndsAt || user?.user_metadata?.trial_ends_at);
  const showBusinessOwnerTrialBanner = isBusinessOwnerWorkspace && subscriptionStatus === 'trial';
  const taskAttentionCount = Number(taskStats.attention || 0);
  const taskUnreadCommentCount = Number(taskStats.unreadComments || 0);
  const hasTaskAttention = taskAttentionCount > 0 || taskUnreadCommentCount > 0 || taskStats.my > 0;
  const taskBadgeCount = taskUnreadCommentCount > 0 ? taskUnreadCommentCount : (taskStats.my > 0 ? taskStats.my : taskStats.active);
  const taskHelperText = taskUnreadCommentCount > 0
    ? `${taskUnreadCommentCount} ${isFrench ? 'commentaires non lus' : 'unread comments'}`
    : taskStats.my > 0
      ? `${taskStats.my} ${isFrench ? 'assignées à vous' : 'assigned to you'}`
      : taskStats.open > 0
        ? `${taskStats.open} ${isFrench ? 'ouvertes à prendre' : 'open to claim'}`
        : (isFrench ? 'Aucune tâche urgente' : 'No urgent tasks');

  const renderLanguageShortcut = () => (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
        {isFrench ? 'Langue admin' : 'Admin Language'}
      </div>
      <div className="mt-2 inline-flex rounded-2xl border border-violet-100 bg-white p-1 shadow-sm">
        {[
          { code: 'fr', label: 'FR' },
          { code: 'en', label: 'EN' },
        ].map((language) => {
          const active = activeLanguage === language.code;
          return (
            <button
              key={language.code}
              type="button"
              onClick={() => setLanguage(language.code)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                active
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)]'
                  : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
              }`}
              aria-pressed={active}
            >
              {language.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCompactLanguageToggle = () => (
    <div className="inline-flex rounded-2xl border border-violet-100 bg-white p-1 shadow-sm">
      {[
        { code: 'fr', label: 'FR' },
        { code: 'en', label: 'EN' },
      ].map((language) => {
        const active = activeLanguage === language.code;
        return (
          <button
            key={language.code}
            type="button"
            onClick={() => setLanguage(language.code)}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
              active
                ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)]'
                : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
            aria-pressed={active}
          >
            {language.label}
          </button>
        );
      })}
    </div>
  );

  const renderTeamTasksShortcut = ({ compact = false } = {}) => (
    <button
      type="button"
      onClick={() => {
        navigate('/admin/tasks');
        if (shouldShowHamburger) setSidebarOpen(false);
      }}
      className={`flex w-full items-center justify-between rounded-2xl border text-left transition-all ${
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3'
      } ${
        hasTaskAttention
          ? 'animate-pulse border-violet-300 bg-white text-violet-900 shadow-[0_0_0_4px_rgba(124,58,237,0.10),0_16px_34px_rgba(124,58,237,0.18)]'
          : taskStats.active > 0
            ? 'border-violet-100 bg-white/90 text-slate-800 hover:border-violet-200 hover:text-violet-800'
            : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex flex-shrink-0 items-center justify-center rounded-2xl ${
          compact ? 'h-9 w-9' : 'h-9 w-9'
        } ${hasTaskAttention ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
          <ClipboardList className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{isFrench ? 'Mes tâches' : 'Team Tasks'}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {taskHelperText}
          </span>
        </span>
      </span>
      <span className={`ml-3 rounded-full px-2.5 py-1 text-xs font-black ${
        hasTaskAttention ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
      }`}>
        {taskBadgeCount}
      </span>
    </button>
  );

  return (
    <div
      className="min-h-screen bg-slate-50 flex"
      style={{ '--workspace-mobile-header-offset': shouldShowHamburger ? '4rem' : '0px' }}
    >
      {shouldShowHamburger && sidebarOpen && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-950/45 backdrop-blur-[2px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`
        ${shouldFixSidebar 
          ? 'static'
          : 'fixed'
        }
        inset-y-0 left-0 z-[10000] transform transition-all duration-300 ease-in-out
        flex flex-col h-full
        ${shouldCollapseDesktopSidebar ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-[19rem]'}
        ${shouldShowHamburger 
          ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
          : shouldHideSidebarForModal
            ? '-translate-x-full pointer-events-none'
            : 'translate-x-0'
        }
      `}>
        <div className={`m-3 flex h-full flex-col overflow-hidden rounded-[30px] border border-violet-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,255,0.98)_100%)] shadow-[0_26px_70px_rgba(76,29,149,0.10)] backdrop-blur transition-opacity duration-200 ${shouldCollapseDesktopSidebar ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex-shrink-0 border-b border-violet-100/80 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {workspaceLogoUrl ? (
                <img
                  src={workspaceLogoUrl}
                  alt={`${workspaceBrandName} logo`}
                  className="h-11 w-11 rounded-2xl border border-violet-100/80 bg-white object-cover shadow-[0_14px_30px_rgba(79,70,229,0.16)]"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100/80 bg-white shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                  <img
                    src={DRIVEOUT_ADMIN_LOGO_URL}
                    alt="Driveout logo"
                    className="h-11 w-11 rounded-2xl object-contain"
                  />
                </div>
              )}
              <div>
                <div className="text-base font-semibold text-slate-900">{workspaceBrandName} Admin</div>
                <div className="mt-0.5 text-xs font-medium text-slate-500">{workspaceBrandSubtitle}</div>
              </div>
            </div>
            {shouldShowHamburger && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className={`${shouldShowHamburger ? 'mt-3 space-y-3' : 'mt-4 rounded-[24px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4'}`}>
            {!shouldShowHamburger ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">Signed In</div>
            ) : null}
            {shouldShowHamburger ? (
              <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white/85 px-3 py-2 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/admin/profile');
                    if (shouldShowHamburger) setSidebarOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition hover:bg-slate-50"
                  title={isFrench ? 'Ouvrir mon profil' : 'Open my profile'}
                >
                  <OptimizedAvatar
                    src={personalProfileImage}
                    fallbackImageSrc={workspaceLogoUrl}
                    name={user?.email || userProfile?.fullName || 'User'}
                    size={36}
                    className="rounded-2xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{user?.email}</div>
                    <div className="text-xs capitalize text-slate-500">{userProfile?.role || 'Administrator'}</div>
                  </div>
                </button>
                {renderCompactLanguageToggle()}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  navigate('/admin/profile');
                  if (shouldShowHamburger) setSidebarOpen(false);
                }}
                className="mt-2 flex w-full items-center gap-3 rounded-2xl p-1.5 text-left transition hover:bg-white/80 hover:shadow-sm"
                title={isFrench ? 'Ouvrir mon profil' : 'Open my profile'}
              >
                <OptimizedAvatar
                  src={personalProfileImage}
                  fallbackImageSrc={tenantLogoUrl || inheritedTenantLogoUrl}
                  name={user?.email || userProfile?.fullName || 'User'}
                  size={40}
                  className="rounded-2xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">{user?.email}</div>
                  <div className="text-xs capitalize text-slate-500">{userProfile?.role || 'Administrator'}</div>
                </div>
              </button>
            )}
            {!shouldShowHamburger ? (
              <>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Module access</span>
                  <span>{visibleNavigationModules.length}/{workspaceEligibleNavigationModules.length}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-700"
                    style={{ width: `${workspaceEligibleNavigationModules.length > 0 ? (visibleNavigationModules.length / workspaceEligibleNavigationModules.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-4">
                  {renderTeamTasksShortcut()}
                </div>
                {renderLanguageShortcut()}
              </>
            ) : (
              renderTeamTasksShortcut({ compact: true })
            )}
          </div>
        </div>

        <nav 
          className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain'
          }}
        >
          {visibleNavigationModules.map((module) => renderNavItem(module))}
        </nav>

        <div className="border-t border-violet-100/80 bg-white/80 p-4 space-y-2">
          <button
            onClick={returnToWebsite}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-violet-200 hover:text-violet-700"
            title="Navigate back to main website"
          >
            <Home className="h-4 w-4" />
            <span>Return to Website</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${shouldFixSidebar ? 'ml-0' : ''}`}>
        <header className={`isolate h-16 border-b border-slate-200 bg-white/90 backdrop-blur-xl shadow-sm flex items-center justify-between px-4 lg:px-6 transition-opacity duration-200 ${shouldShowHamburger ? 'fixed inset-x-0 top-0 z-[80]' : 'sticky top-0'} ${shouldHideSidebarForModal ? 'pointer-events-none opacity-0 z-[20]' : shouldShowHamburger ? 'z-[80] opacity-100' : 'z-[90] opacity-100'}`}>
          <div className="flex items-center space-x-4">
            {shouldShowHamburger && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:text-violet-700"
                aria-label="Open navigation menu"
              >
                <Menu className="h-4 w-4" />
                <span className="text-sm font-semibold">Modules</span>
              </button>
            )}
            
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-slate-500">Admin</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-900">{currentModule?.name}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {shouldFixSidebar && (
              <button
                onClick={returnToWebsite}
                className="hidden lg:flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-violet-200 hover:text-violet-700"
                title="Return to main website"
              >
                <Home className="h-4 w-4" />
                <span>Return to Website</span>
              </button>
            )}

            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                ref={profileMenuButtonRef}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setProfileMenuPosition({
                    top: rect.bottom + 12,
                    right: Math.max(12, window.innerWidth - rect.right),
                    width: Math.min(288, Math.max(240, window.innerWidth - 24)),
                  });
                  setProfileMenuOpen((current) => !current);
                }}
                className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-slate-100"
                title={isFrench ? 'Ouvrir le menu profil' : 'Open profile menu'}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-slate-900">{user?.email}</p>
                  <p className="text-xs text-slate-500">{userProfile?.role || 'Administrator'}</p>
                </div>
                <OptimizedAvatar
                  src={personalProfileImage}
                  fallbackImageSrc={tenantLogoUrl || inheritedTenantLogoUrl}
                  name={user?.email || userProfile?.fullName || 'User'}
                  size={36}
                />
              </button>

              {profileMenuOpen && typeof document !== 'undefined'
                ? createPortal(
                    <div
                      ref={profileMenuRef}
                      className="fixed z-[140] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-2.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)]"
                      style={{
                        top: `${profileMenuPosition.top}px`,
                        right: `${profileMenuPosition.right}px`,
                        width: `${profileMenuPosition.width}px`,
                        maxWidth: 'calc(100vw - 1.5rem)',
                      }}
                    >
                      <div className="border-b border-slate-100 px-4 py-3.5">
                        <p className="truncate text-sm font-semibold text-slate-900">{user?.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{userProfile?.role || 'Administrator'}</p>
                          <span className="inline-flex items-center rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[10px] font-black tracking-[0.18em] text-violet-700 shadow-sm">
                            {APP_VERSION_LABEL}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 px-1 py-2" role="menu">
                        <button
                          type="button"
                          onClick={openAdminProfile}
                          className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-violet-700"
                          role="menuitem"
                        >
                          <Settings className="h-4 w-4" />
                          <span>{isFrench ? 'Paramètres du profil' : 'Profile settings'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={openHelpSupport}
                          className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-violet-700"
                          role="menuitem"
                        >
                          <CircleHelp className="h-4 w-4" />
                          <span>{isFrench ? 'Aide et support' : 'Help & support'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                          role="menuitem"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>{isFrench ? 'Déconnexion' : 'Log out'}</span>
                        </button>
                      </div>
                    </div>,
                    document.body
                  )
                : null}
            </div>
          </div>
        </header>

        {showBusinessOwnerTrialBanner ? (
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-violet-900">
                  {isFrench
                    ? `Vous êtes sur un essai gratuit de 30 jours. ${trialDaysRemaining} jour(s) restants.`
                    : `You are on a 30-day free trial. ${trialDaysRemaining} day(s) remaining.`}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {isFrench
                    ? 'Choisissez votre package pour garder l’accès complet à votre espace opérations.'
                    : 'Choose your package to keep full access to your operations workspace.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/choose-plan')}
                className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                {isFrench ? 'Choisir un forfait' : 'Choose a Plan'}
              </button>
            </div>
          </div>
        ) : null}

        {previewBusinessOwnerId ? (
          <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-sky-900">
                  {isFrench ? 'Mode vue admin activé pour un business owner' : 'Admin workspace preview is active for a business owner'}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {isFrench
                    ? `ID business owner: ${previewBusinessOwnerId}. Utilisez ce mode pour vérifier le workspace sans changer de compte.`
                    : `Business owner ID: ${previewBusinessOwnerId}. Use this mode to inspect the workspace without switching accounts.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(location.pathname)}
                className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                {isFrench ? 'Quitter la vue admin' : 'Exit admin view'}
              </button>
            </div>
          </div>
        ) : null}

        <main key={activeLanguage} className={`flex-1 overflow-y-auto bg-gray-50 ${shouldShowHamburger ? 'pt-[calc(var(--workspace-mobile-header-offset)+0.75rem)]' : ''}`}>
          <Outlet />
        </main>
      </div>

    </div>
  );
};

export default AdminLayout;
