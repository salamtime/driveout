import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguageContext } from '../../contexts/LanguageContext';
import RentalMediaRetentionService from '../../services/RentalMediaRetentionService';
import WebsiteBookingExpiryService from '../../services/WebsiteBookingExpiryService';
import appWarmupService from '../../services/AppWarmupService';
import FuelTransactionService from '../../services/FuelTransactionService';
import { getTaskStats } from '../../services/TaskService';
import { fetchSystemSettings, SYSTEM_SETTINGS_UPDATED_EVENT } from '../../services/systemSettingsApi';
import { prefetchAdminModuleChunk, prewarmAdminModuleChunks } from '../../utils/adminModulePreloader';
import { isApprovedBusinessOwnerAccount, isPlatformOwnerEmail } from '../../utils/accountType';
import OptimizedAvatar from '../common/OptimizedAvatar';
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
  Sparkles,
  Store,
  CircleHelp,
  Building2,
} from 'lucide-react';

const SAHARAX_DEFAULT_LOGO_URL = '/assets/logo.jpg';

const getTenantLogoFallback = () => {
  if (typeof window === 'undefined') return '';
  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isSaharaXTenant =
    isLocal ||
    hostname === 'saharax.driveout.io' ||
    hostname === 'saharax.co' ||
    hostname === 'www.saharax.co';

  return isSaharaXTenant ? SAHARAX_DEFAULT_LOGO_URL : '';
};

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
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [taskStats, setTaskStats] = useState({ active: 0, my: 0, open: 0, attention: 0, unreadComments: 0 });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [tenantLogoUrl, setTenantLogoUrl] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, signOut, hasPermission } = useAuth();
  const { i18n } = useTranslation();
  const { setLanguage } = useLanguageContext();
  const profileMenuRef = useRef(null);
  const isFrench = i18n.resolvedLanguage === 'fr';
  const activeLanguage = isFrench ? 'fr' : 'en';
  const inheritedTenantLogoUrl = getTenantLogoFallback();
  const personalProfileImage =
    userProfile?.profile_picture_url ||
    userProfile?.avatar_url ||
    user?.user_metadata?.profile_picture_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.user_metadata?.photo_url ||
    '';
  const resolvedProfileImage = personalProfileImage || tenantLogoUrl || inheritedTenantLogoUrl || '';
  const normalizedEmail = String(userProfile?.email || user?.email || '').toLowerCase();
  const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
  const isBusinessOwnerWorkspace =
    (!platformOwnerOverride && String(userProfile?.role || '').toLowerCase() === 'business_owner') ||
    (
      !platformOwnerOverride &&
      isApprovedBusinessOwnerAccount(user?.user_metadata || user?.app_metadata || {})
    );

  // Navigation modules with permissions
  const navigationModules = [
    {
      id: 'dashboard',
      name: isFrench ? 'Aperçu du tableau de bord' : 'Dashboard Overview',
      icon: LayoutDashboard,
      accent: 'from-violet-500 to-indigo-600',
      path: '/admin/dashboard',
      moduleName: 'dashboard'
    },
    {
      id: 'calendar',
      name: isFrench ? 'Calendrier' : 'Calendar',
      icon: CalendarDays,
      accent: 'from-sky-500 to-blue-600',
      path: '/admin/calendar',
      moduleName: 'calendar'
    },
    {
      id: 'tours',
      name: isFrench ? 'Tours et réservations' : 'Tours & Bookings',
      icon: Compass,
      accent: 'from-fuchsia-500 to-violet-600',
      path: '/admin/tours',
      moduleName: 'tours'
    },
    {
      id: 'rentals',
      name: isFrench ? 'Gestion des locations' : 'Rental-Management',
      icon: ClipboardList,
      accent: 'from-indigo-500 to-violet-600',
      path: '/admin/rentals',
      moduleName: 'rentals'
    },
    {
      id: 'customers',
      name: isFrench ? 'Gestion clients' : 'Customer Management',
      icon: Users,
      accent: 'from-cyan-500 to-sky-600',
      path: '/admin/customers',
      moduleName: 'customers'
    },
    {
      id: 'fleet',
      name: isFrench ? 'Gestion de flotte' : 'Fleet Management',
      icon: Car,
      accent: 'from-blue-500 to-indigo-600',
      path: '/admin/fleet',
      moduleName: 'fleet'
    },
    {
      id: 'pricing',
      name: isFrench ? 'Gestion des prix' : 'Pricing Management',
      icon: WalletCards,
      accent: 'from-emerald-500 to-teal-600',
      path: '/admin/pricing',
      moduleName: 'pricing'
    },
    {
      id: 'maintenance',
      name: isFrench ? 'Maintenance' : 'Maintenance',
      icon: Wrench,
      accent: 'from-amber-500 to-orange-600',
      path: '/admin/maintenance',
      moduleName: 'maintenance'
    },
    {
      id: 'fuel',
      name: isFrench ? 'Journal carburant' : 'Fuel Logs',
      icon: Fuel,
      accent: 'from-lime-500 to-emerald-600',
      path: '/admin/fuel',
      moduleName: 'fuel'
    },
    {
      id: 'inventory',
      name: isFrench ? 'Inventaire' : 'Inventory',
      icon: Boxes,
      accent: 'from-slate-500 to-slate-700',
      path: '/admin/inventory',
      moduleName: 'inventory'
    },
    {
      id: 'finance',
      name: isFrench ? 'Gestion financière' : 'Finance Management',
      icon: CreditCard,
      accent: 'from-emerald-500 to-green-600',
      path: '/admin/finance',
      moduleName: 'finance'
    },
    {
      id: 'alerts',
      name: isFrench ? 'Alertes' : 'Alerts',
      icon: Bell,
      accent: 'from-rose-500 to-red-600',
      path: '/admin/alerts',
      moduleName: 'alerts'
    },
    {
      id: 'users',
      name: isFrench ? 'Utilisateurs et rôles' : 'User & Role Management',
      icon: Shield,
      accent: 'from-purple-500 to-fuchsia-600',
      path: '/admin/users',
      moduleName: 'users'
    },
    {
      id: 'verification',
      name: isFrench ? 'Centre de vérification' : 'Verification Center',
      icon: Shield,
      accent: 'from-violet-500 to-indigo-600',
      path: '/admin/verification',
      moduleName: 'verification'
    },
    {
      id: 'workspaces',
      name: isFrench ? 'Espaces de travail' : 'Workspaces',
      icon: Building2,
      accent: 'from-indigo-500 to-slate-700',
      path: '/admin/workspaces',
      moduleName: 'workspaces'
    },
    {
      id: 'marketplace',
      name: isFrench ? 'Revue marketplace' : 'Marketplace Review',
      icon: Store,
      accent: 'from-amber-500 to-orange-600',
      path: '/admin/marketplace',
      moduleName: 'marketplace'
    },
    {
      id: 'settings',
      name: isFrench ? 'Paramètres système' : 'System Settings',
      icon: Settings,
      accent: 'from-slate-500 to-slate-700',
      path: '/admin/settings',
      moduleName: 'settings'
    },
    {
      id: 'website',
      name: isFrench ? 'Editeur du site' : 'Website Editor',
      icon: Globe,
      accent: 'from-violet-500 to-fuchsia-600',
      path: '/admin/website',
      moduleName: 'settings'
    },
    {
      id: 'export',
      name: isFrench ? 'Export projet' : 'Project Export',
      icon: FileOutput,
      accent: 'from-teal-500 to-cyan-600',
      path: '/admin/export',
      moduleName: 'export'
    }
  ];

  const visibleNavigationModules = navigationModules.filter((module) => {
    if (isBusinessOwnerWorkspace && ['marketplace', 'website', 'export'].includes(module.id)) {
      return false;
    }

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
          navigate(module.path);
          if (shouldShowHamburger) setSidebarOpen(false);
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

    const handlePointerDown = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadTenantBranding = async () => {
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
  }, []);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userProfile || !hasPermission('fuel')) {
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
  }, [userProfile, hasPermission]);

  useEffect(() => {
    if (!userProfile?.id) return;

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
  }, [userProfile?.id, location.pathname]);

  useEffect(() => {
    if (!userProfile) {
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
  }, [userProfile, location.pathname]);

  useEffect(() => {
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
  }, [userProfile?.role]);

  useEffect(() => {
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
  }, [userProfile?.role]);

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
    <div className="min-h-screen bg-slate-50 flex">
      {shouldShowHamburger && sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`
        ${shouldFixSidebar 
          ? 'static'
          : 'fixed'
        }
        inset-y-0 left-0 z-50 w-[19rem] transform transition-transform duration-300 ease-in-out
        flex flex-col h-full
        ${shouldShowHamburger 
          ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
          : 'translate-x-0'
        }
      `}>
        <div className="m-3 flex h-full flex-col overflow-hidden rounded-[30px] border border-violet-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,255,0.98)_100%)] shadow-[0_26px_70px_rgba(76,29,149,0.10)] backdrop-blur">
        <div className="flex-shrink-0 border-b border-violet-100/80 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-slate-900">SaharaX Admin</div>
                <div className="mt-0.5 text-xs font-medium text-slate-500">Operations workspace</div>
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
                    fallbackImageSrc={tenantLogoUrl || inheritedTenantLogoUrl}
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
                  <span>{visibleNavigationModules.length}/{navigationModules.length}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-700"
                    style={{ width: `${(visibleNavigationModules.length / navigationModules.length) * 100}%` }}
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
        <header className="relative z-[90] isolate h-16 border-b border-slate-200 bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-between px-4 lg:px-6">
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
                onClick={() => setProfileMenuOpen((current) => !current)}
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

              {profileMenuOpen ? (
                <>
                  <div className="fixed inset-0 z-[110] bg-slate-950/8 backdrop-blur-[1px]" />
                  <div className="fixed right-4 top-[4.7rem] z-[120] w-72 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-2.5 shadow-[0_28px_80px_rgba(15,23,42,0.18)] lg:right-6">
                    <div className="border-b border-slate-100 px-4 py-3.5">
                      <p className="truncate text-sm font-semibold text-slate-900">{user?.email}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{userProfile?.role || 'Administrator'}</p>
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
                  </div>
                </>
              ) : null}
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

        <main key={activeLanguage} className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
