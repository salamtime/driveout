import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Menu, X } from 'lucide-react';
import i18n from '../../i18n';
import { normalizeTenantPlanType } from '../../config/tenantPlans';
import {
  getAccountWorkspaceSectionByPath,
  getAccountWorkspaceSection,
  getAccountWorkspaceSectionsForMode,
} from './accountWorkspaceConfig';
import { useAuth } from '../../contexts/AuthContext';
import {
  isApprovedBusinessOwnerAccount,
  isPlatformOwnerEmail,
  resolveManagedAccountType,
} from '../../utils/accountType';
import {
  deriveAccountWorkspaceIdentity,
  getPrimaryAccountWorkspaceSectionIds,
} from '../../utils/accountProductModel';
import { useLanguageContext } from '../../contexts/LanguageContext';
import MessageService from '../../services/MessageService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import VerificationService from '../../services/VerificationService';
import { getCurrentLocationPath } from '../../utils/navigationReturn';
import { getHostContext } from '../../utils/hostContext';
import {
  buildTenantEffectiveFeatureAccess,
  isTenantModuleEnabled,
} from '../../utils/tenantFeatureAccess';

const SAHARAX_LOGO_SRC = '/assets/logo.jpg';
const WEBSITE_HOME_HREF = '/website';
const ACCOUNT_MENU_PERSIST_KEY = 'saharax_account_menu_open';
const ACCOUNT_RETURN_PATH_KEY = 'saharax_account_return_path';
const LAST_OWNER_VEHICLE_ID_KEY = 'saharax_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'saharax_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'saharax_owner_vehicle_ids';
const NAV_GROUPS = [
  { id: 'workspace', label: { en: 'Workspace', fr: 'Espace' }, items: ['overview', 'marketplace', 'messages', 'rentals', 'revenue'] },
  { id: 'account', label: { en: 'Account', fr: 'Compte' }, items: ['settings'] },
];

const buildOwnerVehicleStorageKey = (baseKey, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const getKnownOwnerVehicleCount = (userId = '') => {
  if (typeof window === 'undefined') return 0;

  try {
    const savedCount = Number.parseInt(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId)) || '0',
      10
    );
    const savedIds = JSON.parse(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId)) || '[]'
    );
    const idCount = Array.isArray(savedIds) ? savedIds.map((item) => String(item || '').trim()).filter(Boolean).length : 0;
    const hasLastVehicle = Boolean(
      String(window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, userId)) || '').trim()
    );
    return Math.max(Number.isFinite(savedCount) ? savedCount : 0, idCount, hasLastVehicle ? 1 : 0);
  } catch {
    return 0;
  }
};

const AccountWorkspaceLayout = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(ACCOUNT_MENU_PERSIST_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { user, userProfile, signOut, getBusinessOwnerHomePath, tenantSession } = useAuth();
  const { setLanguage } = useLanguageContext();
  const tr = (en, fr) => (isFrench ? fr : en);
  const activeLanguage = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const [dbOwnerVehicleCount, setDbOwnerVehicleCount] = useState(0);
  const [workspaceActivity, setWorkspaceActivity] = useState({
    hasTripActivity: false,
    hasWalletActivity: false,
  });
  const hostContext = useMemo(() => getHostContext(), []);

  const normalizedRole = String(userProfile?.role || '').toLowerCase();
  const normalizedEmail = String(userProfile?.email || user?.email || '').toLowerCase();
  const normalizedAccountType = String(
    userProfile?.accountType ||
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).toLowerCase();
  const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
  const approvedBusinessOwner = !platformOwnerOverride && isApprovedBusinessOwnerAccount(user?.user_metadata || user?.app_metadata || {});
  const managedAccountType = resolveManagedAccountType({
    account_type: normalizedAccountType,
    data_source: userProfile?.dataSource || user?.user_metadata?.account_source || user?.app_metadata?.account_source || '',
  });
  const businessOwnerHomePath = !platformOwnerOverride && managedAccountType === 'business_owner'
    ? getBusinessOwnerHomePath({
        account_type: normalizedAccountType,
        verification_status: userProfile?.verificationStatus || user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
        subscription_status: userProfile?.subscriptionStatus || user?.user_metadata?.subscription_status || user?.app_metadata?.subscription_status,
      })
    : null;
  const canOpenAdminPanel = ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(normalizedRole) || approvedBusinessOwner;
  const adminHref = normalizedRole === 'guide' ? '/guide/dashboard' : '/admin/dashboard';
  const businessOwnerAllowedPaths = useMemo(() => {
    const candidates = [
      businessOwnerHomePath,
      '/account/vehicles',
      '/account/boost',
      '/account/verification',
      '/account/messages',
      '/account/settings',
      '/account/wallet',
      '/account/rewards',
      '/account/revenue',
      '/account/profile',
    ].filter(Boolean);

    return Array.from(new Set(candidates));
  }, [businessOwnerHomePath]);
  const knownOwnerVehicleCount = useMemo(
    () => getKnownOwnerVehicleCount(user?.id),
    [location.pathname, user?.id]
  );
  const effectiveOwnerVehicleCount = Math.max(knownOwnerVehicleCount, dbOwnerVehicleCount);
  const workspaceIdentity = useMemo(
    () =>
      deriveAccountWorkspaceIdentity({
        managedAccountType,
        effectiveOwnerVehicleCount,
        pathname: location.pathname,
      }),
    [effectiveOwnerVehicleCount, location.pathname, managedAccountType]
  );
  const { isInsideOwnerFlow, workspaceAccountType, workspaceMode } = workspaceIdentity;
  const tenantPlanType = useMemo(
    () => normalizeTenantPlanType(
      tenantSession?.subscription?.plan_type ||
      tenantSession?.planType ||
      userProfile?.planType ||
      'starter'
    ),
    [tenantSession?.planType, tenantSession?.subscription?.plan_type, userProfile?.planType]
  );
  const tenantFeatureAccess = useMemo(() => {
    const rawFeatureAccess =
      tenantSession?.effectiveFeatureAccess && typeof tenantSession.effectiveFeatureAccess === 'object'
        ? tenantSession.effectiveFeatureAccess
        : tenantSession?.tenant?.metadata?.effective_feature_access && typeof tenantSession.tenant.metadata.effective_feature_access === 'object'
          ? tenantSession.tenant.metadata.effective_feature_access
          : tenantSession?.featureAccess && typeof tenantSession.featureAccess === 'object'
            ? tenantSession.featureAccess
            : tenantSession?.tenant?.metadata?.feature_access && typeof tenantSession.tenant.metadata.feature_access === 'object'
              ? tenantSession.tenant.metadata.feature_access
              : {};

    return buildTenantEffectiveFeatureAccess(tenantPlanType, rawFeatureAccess);
  }, [
    tenantPlanType,
    tenantSession?.effectiveFeatureAccess,
    tenantSession?.featureAccess,
    tenantSession?.tenant?.metadata?.effective_feature_access,
    tenantSession?.tenant?.metadata?.feature_access,
  ]);
  const shouldApplyTenantModuleFiltering =
    managedAccountType === 'business_owner' || hostContext.kind === 'tenant';
  const baseVisibleSections = useMemo(
    () =>
      getAccountWorkspaceSectionsForMode(workspaceMode).filter((section) => {
        if (!section?.moduleName) {
          return true;
        }

        if (!shouldApplyTenantModuleFiltering) {
          return true;
        }

        return isTenantModuleEnabled(section.moduleName, tenantFeatureAccess, tenantPlanType);
      }),
    [shouldApplyTenantModuleFiltering, tenantFeatureAccess, tenantPlanType, workspaceMode]
  );
  const matchedSection = useMemo(
    () => getAccountWorkspaceSectionByPath(location.pathname),
    [location.pathname]
  );
  const currentSectionId = useMemo(() => {
    if (matchedSection?.id) {
      return matchedSection.id;
    }
    return baseVisibleSections.find((section) => location.pathname === section.href || location.pathname.startsWith(`${section.href}/`))?.id || 'overview';
  }, [baseVisibleSections, location.pathname, matchedSection?.id]);
  const visibleSections = useMemo(() => {
    const primarySectionIds = new Set(
      getPrimaryAccountWorkspaceSectionIds({
        workspaceMode,
        hasTripActivity: workspaceActivity.hasTripActivity,
        hasWalletActivity: workspaceActivity.hasWalletActivity,
        currentSectionId,
      })
    );

    return baseVisibleSections.filter((section) => primarySectionIds.has(section.id));
  }, [
    baseVisibleSections,
    currentSectionId,
    workspaceActivity.hasTripActivity,
    workspaceActivity.hasWalletActivity,
    workspaceMode,
  ]);
  const currentSection = getAccountWorkspaceSection(
    currentSectionId
  );
  const isMessagesSection = currentSectionId === 'messages';
  const accountLabel = userProfile?.fullName || userProfile?.email || user?.email || tr('Signed in', 'Connecté');
  const accountAvatarUrl = String(
    userProfile?.profile_picture_url ||
    userProfile?.avatar_url ||
    user?.user_metadata?.profile_picture_url ||
    user?.user_metadata?.avatar_url ||
    ''
  ).trim();
  const groupedSections = useMemo(() => {
    const visibleLookup = new Map(visibleSections.map((section) => [section.id, section]));
    return NAV_GROUPS
      .map((group) => ({
        ...group,
        sections: group.items.map((itemId) => visibleLookup.get(itemId)).filter(Boolean),
      }))
      .filter((group) => group.sections.length > 0);
  }, [visibleSections]);
  const accountHomeHref = useMemo(
    () => visibleSections.find((section) => section.id === 'overview')?.href || '/account/overview',
    [visibleSections]
  );

  useEffect(() => {
    if (!menuOpen) return undefined;

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      const top = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, Number.parseInt(top || '0', 10) * -1 || 0);
    };
  }, [menuOpen]);

  useEffect(() => {
    try {
      if (menuOpen) {
        window.sessionStorage.setItem(ACCOUNT_MENU_PERSIST_KEY, '1');
      } else {
        window.sessionStorage.removeItem(ACCOUNT_MENU_PERSIST_KEY);
      }
    } catch (error) {
      console.warn('Failed to sync account menu state:', error);
    }
  }, [menuOpen]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadOwnerVehicleCount = async () => {
      if (!user?.id || managedAccountType === 'business_owner') {
        setDbOwnerVehicleCount(0);
        return;
      }

      try {
        const result = await BusinessMarketplaceService.getOwnerVehicleCount(user.id);
        if (!cancelled) {
          setDbOwnerVehicleCount(Number(result?.count || 0));
        }
      } catch {
        if (!cancelled) {
          setDbOwnerVehicleCount(0);
        }
      }
    };

    void loadOwnerVehicleCount();

    return () => {
      cancelled = true;
    };
  }, [managedAccountType, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaceActivity = async () => {
      if (!user?.id) {
        setWorkspaceActivity({
          hasTripActivity: false,
          hasWalletActivity: false,
        });
        return;
      }

      if (workspaceMode === 'owner') {
        setWorkspaceActivity({
          hasTripActivity: true,
          hasWalletActivity: true,
        });
        return;
      }

      try {
        const [snapshot, marketplaceRequests, tours] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user).catch(() => null),
          CustomerExperienceService.getCustomerMarketplaceRequests(user).catch(() => []),
          CustomerExperienceService.getCustomerTourHistory(user).catch(() => []),
        ]);

        if (cancelled) {
          return;
        }

        const normalizedWalletBalance = Number(snapshot?.wallet?.balance || 0);
        const normalizedApprovedTopups = Number(snapshot?.wallet?.approvedTopups || 0);
        const normalizedLoyaltyPoints = Number(snapshot?.loyalty?.points || 0);
        const hasTripActivity =
          Array.isArray(snapshot?.active) && snapshot.active.length > 0 ||
          Array.isArray(snapshot?.upcoming) && snapshot.upcoming.length > 0 ||
          Array.isArray(snapshot?.recent) && snapshot.recent.length > 0 ||
          Array.isArray(marketplaceRequests) && marketplaceRequests.length > 0 ||
          Array.isArray(tours) && tours.length > 0;
        const hasWalletActivity =
          normalizedWalletBalance > 0 ||
          normalizedApprovedTopups > 0 ||
          normalizedLoyaltyPoints > 0 ||
          (Array.isArray(snapshot?.walletTransactions) && snapshot.walletTransactions.length > 0);

        setWorkspaceActivity({
          hasTripActivity,
          hasWalletActivity,
        });
      } catch {
        if (!cancelled) {
          setWorkspaceActivity({
            hasTripActivity: false,
            hasWalletActivity: false,
          });
        }
      }
    };

    void loadWorkspaceActivity();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.id, workspaceMode]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const warmWorkspace = () => {
      void import('../../pages/account/AccountOverview');
      void import('../../pages/account/AccountRentals');
      void import('../../pages/account/AccountMessages');
      void import('../../pages/account/AccountRevenue');
      void import('../../pages/account/AccountVerification');
      void import('../../pages/account/AccountMarketplace');

      void CustomerExperienceService.getCustomerAccountSnapshot(user).catch(() => null);
      void CustomerExperienceService.getCustomerMarketplaceRequests(user).catch(() => []);
      void CustomerExperienceService.getCustomerRentalHistory(user).catch(() => []);
      void VerificationService.getEntityVerificationSummary('user', user.id).catch(() => null);
      if (managedAccountType !== 'business_owner') {
        void BusinessMarketplaceService.getOwnerVehicleCount(user.id).catch(() => null);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(warmWorkspace, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(warmWorkspace, 250);
    return () => window.clearTimeout(timeoutId);
  }, [managedAccountType, user?.id]);

  useEffect(() => {
    if (workspaceAccountType !== 'business_owner') return;
    if (!businessOwnerHomePath) return;
    const isAllowedOwnerPath = businessOwnerAllowedPaths.some((allowedPath) =>
      location.pathname === allowedPath || location.pathname.startsWith(`${allowedPath}/`)
    );
    if (isAllowedOwnerPath) {
      return;
    }
    navigate(businessOwnerHomePath, { replace: true });
  }, [businessOwnerAllowedPaths, businessOwnerHomePath, location.pathname, navigate, workspaceAccountType]);

  useEffect(() => {
    const userId = String(user?.id || '').trim();
    if (!userId) return undefined;

    const displayLabel = String(
      userProfile?.fullName ||
      userProfile?.display_name ||
      userProfile?.email ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      'User'
    ).trim();

    const workspaceRole = String(
      userProfile?.role ||
      normalizedAccountType ||
      user?.user_metadata?.role ||
      'customer'
    ).trim().toLowerCase() || 'customer';

    return MessageService.startWorkspacePresence({
      userId,
      userLabel: displayLabel,
      userRole: workspaceRole,
      pagePath: location.pathname,
    });
  }, [user?.id, user?.email, user?.user_metadata?.full_name, user?.user_metadata?.name, user?.user_metadata?.role, userProfile?.fullName, userProfile?.display_name, userProfile?.email, userProfile?.role, normalizedAccountType, location.pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!matchedSection) return;
    const sectionVisible = baseVisibleSections.some((section) => section.id === matchedSection.id);
    if (sectionVisible) return;
    navigate('/account/overview', { replace: true });
  }, [baseVisibleSections, matchedSection, navigate]);

  const handleNavigate = (item) => {
    setMenuOpen(false);
    const href = resolveSectionHref(item) || item?.href || '/account/overview';
    const currentPath = getCurrentLocationPath(location);
    const shouldPreserveReturnPath =
      item?.id === 'settings' &&
      (
        location.pathname === '/account/vehicles' ||
        location.pathname.startsWith('/account/vehicles/') ||
        location.pathname.startsWith('/account/marketplace/vehicles/')
      );

    if (shouldPreserveReturnPath) {
      navigate(href, {
        state: {
          from: currentPath,
        },
      });
      return;
    }

    navigate(href);
  };

  const resolveSectionHref = (item) => {
    if (item?.id === 'marketplace') {
      return workspaceMode === 'service' ? '/account/marketplace' : '/account/vehicles';
    }

    return item.href;
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate(WEBSITE_HOME_HREF, { replace: true });
  };

  const handleReturnToWebsite = () => {
    setMenuOpen(false);
    navigate(WEBSITE_HOME_HREF);
  };

  const renderNavItems = () => (
    <nav
      className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
      style={{
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
      }}
    >
      {groupedSections.map((group) => (
        <section key={group.id} className="space-y-2">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {group.label[isFrench ? 'fr' : 'en']}
          </p>
          <div className="space-y-2">
            {group.sections.map((item) => {
              const Icon = item.icon;
              const itemHref = resolveSectionHref(item);
              const isPrimary = group.id === 'main';
              const isActive = item.id === currentSectionId || location.pathname === itemHref || location.pathname.startsWith(`${itemHref}/`);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item)}
                  className={`
                    group relative block min-h-[44px] w-full overflow-hidden rounded-[1.15rem] border px-3 py-3 text-left transition-all duration-200
                    ${isActive
                      ? 'border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 text-violet-900 shadow-[0_16px_38px_rgba(79,70,229,0.12)]'
                      : isPrimary
                        ? 'border-slate-200 bg-white text-slate-800 shadow-sm hover:border-violet-200 hover:shadow-[0_16px_30px_rgba(79,70,229,0.08)]'
                        : 'border-transparent bg-white/70 text-slate-700 hover:border-slate-200 hover:bg-white hover:shadow-sm'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[1rem] bg-gradient-to-br ${item.accent} text-white shadow-sm`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${isActive ? 'text-violet-900' : 'text-slate-800'}`}>
                        {item.label[isFrench ? 'fr' : 'en']}
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${isActive ? 'text-violet-600' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );

  return (
    <div
      className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_44%,#ffffff_100%)]"
      style={{ '--workspace-mobile-header-offset': '5rem' }}
    >
      <header className="fixed inset-x-0 top-0 z-[80] border-b border-violet-100/80 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between gap-4 pl-16 md:pl-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="fixed left-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 md:static md:shadow-sm"
                aria-label="Open account menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={handleReturnToWebsite}
                  className="hidden w-fit items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-violet-700 md:inline-flex"
                >
                  <span aria-hidden="true">←</span>
                  <span>{tr('Back to website', 'Retour au site')}</span>
                </button>

                <Link to={accountHomeHref} className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                  <img src={SAHARAX_LOGO_SRC} alt="SaharaX" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.12em] text-violet-600">SaharaX</p>
                  <p className="text-sm text-slate-500">{tr('Account workspace', 'Espace compte')}</p>
                </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] pt-[calc(var(--workspace-mobile-header-offset)+1rem)] sm:px-6 sm:pb-6 sm:pt-24">
        {isMessagesSection ? (
          <main className="min-w-0">
            <Outlet />
          </main>
        ) : (
          <div className="overflow-hidden rounded-[34px] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(255,255,255,0.72)_38%,rgba(245,243,255,0.72)_100%)] shadow-[0_24px_70px_rgba(76,29,149,0.08)] backdrop-blur">
            <main className="min-w-0 p-4 sm:p-6">
              <Outlet />
            </main>
          </div>
        )}
      </div>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMenuOpen(false);
            }
          }}
        >
          <div className="fixed inset-0 bg-slate-950/38 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          <div className="relative inset-y-0 left-0 z-50 w-[18rem] max-w-[86vw] transform transition-transform duration-300 ease-in-out">
            <div className="m-3 flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[28px] border border-violet-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,255,0.98)_100%)] shadow-[0_24px_64px_rgba(76,29,149,0.10)] backdrop-blur">
            <div className="border-b border-violet-100/80 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[1rem] border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                    <img src={SAHARAX_LOGO_SRC} alt="SaharaX" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-slate-900">SaharaX</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-[1rem] border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                  aria-label="Close account menu"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-2.5 rounded-[1.15rem] border border-violet-100 bg-white/85 px-2.5 py-2 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-[0.95rem] border border-violet-100 bg-white p-1 shadow-sm">
                    {accountAvatarUrl ? (
                      <img
                        src={accountAvatarUrl}
                        alt={accountLabel}
                        className="h-full w-full rounded-[0.8rem] object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-slate-700">
                        {(accountLabel || 'S').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{accountLabel}</div>
                  </div>
                  <div className="inline-flex rounded-[1rem] border border-violet-100 bg-white p-1 shadow-sm">
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
                            className={`rounded-[0.85rem] px-3 py-1.5 text-sm font-semibold transition-all ${
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

                <button
                  type="button"
                  onClick={handleReturnToWebsite}
                  className="flex w-full items-center justify-between rounded-[1.15rem] border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
                >
                  <span>{tr('Return to website', 'Retour au site')}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {renderNavItems()}

            <div className="space-y-2 border-t border-violet-100/80 bg-white/80 p-3.5">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-[1.15rem] border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                <LogOut className="h-4 w-4" />
                <span>{tr('Sign out', 'Déconnexion')}</span>
              </button>
            </div>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountWorkspaceLayout;
