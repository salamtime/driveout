import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import ProtectedRoute, { AdminRoute, EmployeeRoute, GuideRoute, CustomerRoute } from './components/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import AuthTransitionScreen from './components/auth/AuthTransitionScreen';
import { isApprovedBusinessOwnerAccount, isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from './utils/accountType';
import RouteLoadingFallback from './components/navigation/RouteLoadingFallback';
import {
  buildHostUrl,
  getHostContext,
  isFirstPartyStorefrontPath,
  isFirstPartyTenantHost,
  isFirstPartyUnifiedPath,
  isPreviewHost,
} from './utils/hostContext';
import { configureMasterSupabaseClient, configureSupabaseClient } from './lib/supabase';
import i18n from './i18n';

const HostDomainRedirect = ({ kind, pathname, tenantSlug }) => {
  const location = useLocation();
  const targetUrl = buildHostUrl({
    kind,
    pathname: pathname || location.pathname,
    search: location.search,
    hash: location.hash,
    tenantSlug,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.href !== targetUrl) {
      window.location.replace(targetUrl);
    }
  }, [targetUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4 text-4xl">↗</div>
        <p className="text-base font-medium text-slate-700">Redirecting to the correct workspace…</p>
      </div>
    </div>
  );
};

const WorkspaceUnavailableState = ({
  title = 'Workspace unavailable',
  message = 'This tenant workspace is not active yet or the domain is not connected to an active workspace.',
  detail = '',
}) => (
  <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
      <div className="w-full overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-800 px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">Tenant workspace</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium text-violet-100">{message}</p>
        </div>
        {detail ? (
          <div className="px-6 py-6 sm:px-8">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-slate-700">
              {detail}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  </div>
);

const resolveHostAwarePath = (host, pathname = '/') => {
  const normalizedPath = pathname?.startsWith('/') ? pathname : `/${pathname || ''}`;
  return normalizedPath;
};

const buildMarketplaceLoginHandoffUrl = ({ email = '', redirect = '/customer/dashboard' } = {}) => {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (redirect) params.set('redirect', redirect);
  params.set('tenantAccess', 'marketplace-customer');

  return buildHostUrl({
    kind: 'public',
    pathname: '/login',
    search: `?${params.toString()}`,
  });
};

const shouldUseFirstPartyTenantPublicShell = (host, pathname) =>
  isFirstPartyTenantHost(host) && isFirstPartyStorefrontPath(pathname);

const shouldUseFirstPartyTenantUnifiedShell = (host, pathname, search = '') => {
  if (!isFirstPartyTenantHost(host)) {
    return false;
  }

  const normalizedPath = pathname?.startsWith('/') ? pathname : `/${pathname || ''}`;
  if (['/login', '/register', '/reset-password'].includes(normalizedPath)) {
    const params = new URLSearchParams(search || '');
    return params.get('tenantAccess') === 'marketplace-customer';
  }

  return isFirstPartyUnifiedPath(normalizedPath);
};

const TenantWorkspaceBoot = ({ children }) => {
  const host = getHostContext();
  const location = useLocation();
  const shouldUsePublicStorefront = shouldUseFirstPartyTenantUnifiedShell(host, location.pathname, location.search);

  if (host.kind !== 'tenant' || shouldUsePublicStorefront) {
    configureMasterSupabaseClient();
  }

  const [state, setState] = useState(() => ({
    status: host.kind === 'tenant' && !shouldUsePublicStorefront ? 'loading' : 'ready',
    error: '',
    detail: '',
  }));

  useEffect(() => {
    let cancelled = false;

    if (host.kind !== 'tenant' || shouldUsePublicStorefront) {
      configureMasterSupabaseClient();
      setState({ status: 'ready', error: '', detail: '' });
      return () => {
        cancelled = true;
      };
    }

    const resolveTenantWorkspace = async () => {
      setState({ status: 'loading', error: '', detail: '' });

      const lookupHostname = host.isLocal && host.tenantSlug
        ? `${host.tenantSlug}.driveout.io`
        : host.hostname;

      try {
        const response = await fetch(`/api/tenants?resource=workspace-config&hostname=${encodeURIComponent(lookupHostname)}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || 'Unable to resolve tenant workspace');
        }

        const tenant = payload?.tenant || {};
        configureSupabaseClient({
          mode: tenant.mode || 'tenant',
          url: tenant.apiUrl,
          anonKey: tenant.anonKey,
          projectRef: tenant.projectRef,
          appUrl: tenant.appUrl,
        });

        if (!cancelled) {
          setState({ status: 'ready', error: '', detail: '' });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error?.message || 'Workspace unavailable',
            detail: host.tenantSlug ? `Workspace: ${host.tenantSlug}` : '',
          });
        }
      }
    };

    void resolveTenantWorkspace();

    return () => {
      cancelled = true;
    };
  }, [host.hostname, host.isLocal, host.kind, host.tenantSlug, shouldUsePublicStorefront]);

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'error') {
    return <WorkspaceUnavailableState title="Workspace unavailable" message={state.error} detail={state.detail} />;
  }

  return children;
};

const ExternalRedirect = ({ to }) => {
  useEffect(() => {
    if (typeof window !== 'undefined' && to) {
      window.location.href = to;
    }
  }, [to]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4 text-4xl">↗</div>
        <p className="text-base font-medium text-slate-700">Opening your private workspace…</p>
      </div>
    </div>
  );
};

const PublicHostRoute = ({ children }) => {
  const host = getHostContext();
  const location = useLocation();
  const isFirstPartyStorefrontTenant = shouldUseFirstPartyTenantPublicShell(host, location.pathname);

  if (host.kind === 'public' || host.kind === 'local' || isFirstPartyStorefrontTenant) {
    return children;
  }

  if (host.kind === 'tenant') {
    return <WorkspaceUnavailableState title="Workspace route unavailable" message="Public marketplace routes are not available inside tenant workspaces." />;
  }

  return <HostDomainRedirect kind="public" />;
};

const PrivateWorkspaceHostRoute = ({ children }) => {
  const host = getHostContext();
  const location = useLocation();
  const allowPreviewHost = isPreviewHost(host.hostname);

  if (
    host.kind === 'tenant'
    || host.kind === 'app'
    || host.kind === 'admin'
    || host.kind === 'local'
    || allowPreviewHost
  ) {
    return children;
  }

  return <HostDomainRedirect kind="app" pathname={location.pathname} />;
};

const AdminHostRoute = ({ children }) => {
  const host = getHostContext();
  const allowPreviewHost = isPreviewHost(host.hostname);

  if (host.kind === 'admin' || host.kind === 'tenant' || host.kind === 'local' || allowPreviewHost) {
    return children;
  }

  return <HostDomainRedirect kind="admin" />;
};

const PublicRentalView = lazy(() => import('./pages/PublicRentalView'));
const PublicDocumentShare = lazy(() => import('./pages/PublicDocumentShare'));
const Landing = lazy(() => import('./pages/Landing'));
const PublicCatalog = lazy(() => import('./pages/PublicCatalog'));
const PublicMarketplaceDetail = lazy(() => import('./pages/PublicMarketplaceDetail'));
const PublicRentRedirect = lazy(() => import('./pages/PublicRentRedirect'));
const PublicVehicleDetail = lazy(() => import('./pages/PublicVehicleDetail'));
const PublicInstantBooking = lazy(() => import('./pages/PublicInstantBooking'));
const PublicBookingRequest = lazy(() => import('./pages/PublicBookingRequest'));
const PublicTours = lazy(() => import('./pages/Tours'));
const RentalBooking = lazy(() => import('./pages/RentalBooking'));
const Rentals = lazy(() => import('./pages/admin/Rentals'));
const RentalDetails = lazy(() => import('./pages/admin/RentalDetails'));
const InvoicePage = lazy(() => import('./pages/admin/InvoicePage'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const GuideDashboard = lazy(() => import('./pages/guide/Dashboard'));
const AccountWorkspaceLayout = lazy(() => import('./components/account/AccountWorkspaceLayout'));
const AccountOverview = lazy(() => import('./pages/account/AccountOverview'));
const AccountRentals = lazy(() => import('./pages/account/AccountRentals'));
const AccountRentalDetailsPage = lazy(() => import('./pages/account/AccountRentalDetailsPage'));
const AccountMarketplaceRequestDetailsPage = lazy(() => import('./pages/account/AccountMarketplaceRequestDetailsPage'));
const AccountMarketplace = lazy(() => import('./pages/account/AccountMarketplace'));
const AccountMarketplaceVehicleProfile = lazy(() => import('./pages/account/AccountMarketplaceVehicleProfile'));
const AccountTours = lazy(() => import('./pages/account/AccountTours'));
const AccountTourDetailsPage = lazy(() => import('./pages/account/AccountTourDetailsPage'));
const AccountMessages = lazy(() => import('./pages/account/AccountMessages'));
const AccountBoost = lazy(() => import('./pages/account/AccountBoost'));
const AccountRewards = lazy(() => import('./pages/account/AccountRewards'));
const AccountReviews = lazy(() => import('./pages/account/AccountReviews'));
const AccountRevenue = lazy(() => import('./pages/account/AccountRevenue'));
const AccountVerification = lazy(() => import('./pages/account/AccountVerification'));
const AccountSettings = lazy(() => import('./pages/account/AccountSettings'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Unauthorized = lazy(() => import('./pages/auth/Unauthorized'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
const CalendarPage = lazy(() => import('./pages/admin/Calendar'));
const ToursPage = lazy(() => import('./pages/admin/Tours'));
const TasksPage = lazy(() => import('./pages/admin/Tasks'));
const LiveMapPage = lazy(() => import('./pages/admin/LiveMap'));
const VehicleManagement = lazy(() => import('./components/VehicleManagement'));
const VehicleProfilePage = lazy(() => import('./pages/admin/VehicleProfile'));
const VehicleActivityPage = lazy(() => import('./pages/admin/VehicleActivity'));
const PricingPage = lazy(() => import('./pages/admin/Pricing'));
const MaintenancePage = lazy(() => import('./pages/admin/Maintenance'));
const MaintenanceDetail = lazy(() => import('./pages/admin/MaintenanceDetail'));
const FuelPage = lazy(() => import('./pages/admin/Fuel'));
const InventoryPage = lazy(() => import('./pages/admin/Inventory'));
const FinancePage = lazy(() => import('./pages/admin/Finance'));
const AlertsPage = lazy(() => import('./pages/admin/Alerts'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const PlatformAdminsPage = lazy(() => import('./pages/admin/PlatformAdmins'));
const AdminCustomerProfilePage = lazy(() => import('./pages/admin/AdminCustomerProfilePage'));
const VerificationCenterPage = lazy(() => import('./pages/admin/VerificationCenter'));
const AdminMessagesPage = lazy(() => import('./pages/admin/AdminMessages'));
const WorkspacesPage = lazy(() => import('./pages/admin/Workspaces'));
const SettingsPage = lazy(() => import('./pages/admin/Settings'));
const WebsiteEditorPage = lazy(() => import('./pages/admin/WebsiteEditor'));
const ExportPage = lazy(() => import('./pages/admin/Export'));
const MarketplaceControlWorkspace = lazy(() => import('./components/admin/MarketplaceControlWorkspace'));
const MarketplaceListingDetail = lazy(() => import('./pages/admin/MarketplaceListingDetail'));
const CustomerManagementDashboard = lazy(() => import('./components/CustomerManagementDashboard'));
const PendingApprovalPage = lazy(() => import('./pages/PendingApproval'));
const WorkspaceStatusPage = lazy(() => import('./pages/WorkspaceStatusPage'));
const ChoosePlanPage = lazy(() => import('./pages/ChoosePlan'));
const TenantWorkspaceReadyPage = lazy(() => import('./pages/business/TenantWorkspaceReady'));
const CameraTest = lazy(() => import('./pages/CameraTest'));
const TestCustomerDetails = lazy(() => import('./pages/TestCustomerDetails'));
const ShortUrlRedirect = lazy(() => import('./pages/ShortUrlRedirect'));
const TourTracker = lazy(() => import('./pages/TourTracker'));
const GlobalMessageLauncher = lazy(() => import('./components/messages/GlobalMessageLauncher'));

/**
 * HomeRedirect - Redirects users based on their authentication status and role
 */
const HomeRedirect = () => {
  const { user, userProfile, initialized, session, getBusinessOwnerHomePath } = useAuth();
  const host = getHostContext();
  const location = useLocation();
  const shouldUsePublicStorefront = shouldUseFirstPartyTenantUnifiedShell(host, location.pathname, location.search);
  const isPublicLikeHost = host.kind === 'public' || shouldUsePublicStorefront;

  if (!initialized) {
    return <AuthTransitionScreen title="Preparing your workspace" description="We are checking your workspace access and loading the right destination." />;
  }

  const isAuthenticated = Boolean(session?.user);

  if (!isAuthenticated) {
    if (!isPublicLikeHost && (host.kind === 'admin' || host.kind === 'app' || host.kind === 'tenant')) {
      return <Navigate to="/login" replace />;
    }
    return <Landing />;
  }

  if (isPublicLikeHost) {
    return <Landing />;
  }

  const role = userProfile?.role;
  const normalizedEmail = String(userProfile?.email || user?.email || '').toLowerCase();
  const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
  const accountType =
    session?.user?.user_metadata?.account_type ||
    session?.user?.app_metadata?.account_type ||
    userProfile?.accountType ||
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    '';
  const approvedBusinessOwner = !platformOwnerOverride && isApprovedBusinessOwnerAccount(session?.user?.user_metadata || user?.user_metadata || {});
  const tenantBusinessOwnerLike = !platformOwnerOverride && isBusinessOwnerAccountType(accountType);
  const internalTenantRole = ['owner', 'admin', 'employee', 'guide'].includes(String(role || '').trim().toLowerCase());
  const businessOwnerFreezeRedirect = !platformOwnerOverride && !internalTenantRole && isBusinessOwnerAccountType(accountType)
    ? getBusinessOwnerHomePath({
        account_type: accountType,
        verification_status: userProfile?.verificationStatus || session?.user?.user_metadata?.verification_status || user?.user_metadata?.verification_status,
        subscription_status: userProfile?.subscriptionStatus || session?.user?.user_metadata?.subscription_status || user?.user_metadata?.subscription_status,
      })
    : null;

  if (host.kind === 'tenant' && role === 'customer' && !approvedBusinessOwner && !tenantBusinessOwnerLike) {
    return (
      <ExternalRedirect
        to={buildMarketplaceLoginHandoffUrl({
          email: userProfile?.email || session?.user?.email || '',
          redirect: '/customer/dashboard',
        })}
      />
    );
  }

  if (businessOwnerFreezeRedirect) {
    if (/^https?:\/\//i.test(businessOwnerFreezeRedirect)) {
      return <ExternalRedirect to={businessOwnerFreezeRedirect} />;
    }
    return <Navigate to={businessOwnerFreezeRedirect} replace />;
  }

  if ((host.kind === 'tenant' || host.kind === 'app') && ['owner', 'admin', 'employee', 'guide'].includes(role)) {
    const redirectTo = resolveHostAwarePath(host, role === 'guide' ? '/guide/dashboard' : '/admin/dashboard');
    if (/^https?:\/\//i.test(redirectTo)) {
      return <ExternalRedirect to={redirectTo} />;
    }
    return <Navigate to={redirectTo} replace />;
  }

  const dashboardPaths = {
    owner: '/admin/dashboard',
    admin: '/admin/dashboard',
    employee: '/admin/dashboard', // Redirect employees to the admin dashboard
    business_owner: '/pending-approval',
    guide: '/guide/dashboard',
    customer: approvedBusinessOwner ? '/pending-approval' : '/customer/dashboard',
  };

  const redirectTo = dashboardPaths[role] || '/login';
  const resolvedRedirectTo = resolveHostAwarePath(host, redirectTo);
  if (/^https?:\/\//i.test(resolvedRedirectTo)) {
    return <ExternalRedirect to={resolvedRedirectTo} />;
  }
  return <Navigate to={resolvedRedirectTo} replace />;
};

/**
 * Global State Persistence Manager
 * Prevents unwanted page refreshes and preserves form state
 */
const GlobalStatePersistence = () => {
  useEffect(() => {
    // ✅ FIX 1: Prevent page refresh on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Do NOT reload or refetch data automatically
        // Let components manage their own data fetching if needed
      }
    };

    // ✅ FIX 2: Prevent page refresh on window focus
    const handleFocus = () => {
      // Do NOT reload the page
      // Do NOT trigger automatic data refetching
    };

    // ✅ FIX 3: Save form state to sessionStorage before page unload
    const handleBeforeUnload = () => {
      // Save all input values to sessionStorage
      const inputs = document.querySelectorAll('input, textarea, select');
      const formState = {};

      inputs.forEach((input) => {
        if (input.name || input.id) {
          const key = input.name || input.id;
          if (input.type === 'checkbox' || input.type === 'radio') {
            formState[key] = input.checked;
          } else {
            formState[key] = input.value;
          }
        }
      });

      if (Object.keys(formState).length > 0) {
        sessionStorage.setItem('saharax_form_state', JSON.stringify(formState));
      }
    };

    // ✅ FIX 4: Restore form state after page load
    const restoreFormState = () => {
      try {
        const savedState = sessionStorage.getItem('saharax_form_state');
        if (savedState) {
          const formState = JSON.parse(savedState);

          Object.entries(formState).forEach(([key, value]) => {
            const input = document.querySelector(`[name="${key}"], #${key}`);
            if (input) {
              if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = value;
              } else {
                input.value = value;
              }
            }
          });
        }
      } catch (error) {
        console.warn('⚠️ Failed to restore form state:', error);
      }
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Restore form state on mount
    restoreFormState();

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return null;
};

const AppGlobalMessageLauncher = () => {
  const location = useLocation();
  const { user, userProfile, session } = useAuth();

  if (!user || !session?.access_token || location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/reset-password') {
    return null;
  }

  const isAdmin = location.pathname.startsWith('/admin');
  const isFrench = i18n.resolvedLanguage === 'fr';

  return (
    <Suspense fallback={null}>
      <GlobalMessageLauncher
        user={user}
        userProfile={userProfile}
        isAdmin={isAdmin}
        isFrench={isFrench}
      />
    </Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary name="App-Root">
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LanguageProvider>
          <TenantWorkspaceBoot>
            <AuthProvider>
              <GlobalStatePersistence />
              <ErrorBoundary name="Router-Wrapper">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <div className="min-h-screen bg-gray-50">
                    <Routes>
                {/* Public Routes */}
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/website" element={<PublicHostRoute><Landing /></PublicHostRoute>} />
                <Route path="/rent" element={<PublicHostRoute><PublicRentRedirect /></PublicHostRoute>} />
                <Route path="/marketplace" element={<PublicHostRoute><PublicCatalog /></PublicHostRoute>} />
                <Route path="/marketplace/:listingId" element={<PublicHostRoute><PublicMarketplaceDetail /></PublicHostRoute>} />
                <Route path="/marketplace/:listingId/request" element={<PublicHostRoute><PublicBookingRequest /></PublicHostRoute>} />
                <Route path="/rent/:listingId" element={<PublicHostRoute><PublicVehicleDetail /></PublicHostRoute>} />
                <Route path="/rent/:listingId/book" element={<PublicHostRoute><PublicInstantBooking /></PublicHostRoute>} />
                <Route path="/rent/:listingId/request" element={<PublicHostRoute><PublicBookingRequest /></PublicHostRoute>} />
                <Route path="/rentals" element={<PublicHostRoute><Navigate to="/rent" replace /></PublicHostRoute>} />
                <Route path="/tours" element={<PublicHostRoute><PublicTours /></PublicHostRoute>} />
                <Route path="/tour-booking" element={<PublicHostRoute><Navigate to="/tours" replace /></PublicHostRoute>} />
                <Route path="/rental-booking" element={<PublicHostRoute><RentalBooking /></PublicHostRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/unauthorized" element={<Unauthorized />} />
                <Route path="/pending-approval" element={
                  <ErrorBoundary name="Pending-Approval">
                    <ProtectedRoute>
                      <PendingApprovalPage />
                    </ProtectedRoute>
                  </ErrorBoundary>
                } />
                {[
                  ['no-workspace', '/no-workspace'],
                  ['pending', '/workspace-pending'],
                  ['preparing', '/workspace-preparing'],
                  ['error', '/workspace-error'],
                  ['suspended', '/workspace-suspended'],
                ].map(([status, path]) => (
                  <Route key={path} path={path} element={
                    <ErrorBoundary name={`Workspace-${status}`}>
                      <ProtectedRoute>
                        <WorkspaceStatusPage status={path} />
                      </ProtectedRoute>
                    </ErrorBoundary>
                  } />
                ))}
                <Route path="/choose-plan" element={
                  <ErrorBoundary name="Choose-Plan">
                    <ProtectedRoute>
                      <ChoosePlanPage />
                    </ProtectedRoute>
                  </ErrorBoundary>
                } />
                <Route path="/business/workspace" element={
                  <ErrorBoundary name="Tenant-Workspace-Ready">
                    <ProtectedRoute>
                      <TenantWorkspaceReadyPage />
                    </ProtectedRoute>
                  </ErrorBoundary>
                } />

                {/* Test Route */}
                <Route path="/test-customer-details" element={<TestCustomerDetails />} />

                {/* Camera Test Route - Public for debugging */}
                <Route path="/camera-test" element={<PublicHostRoute><CameraTest /></PublicHostRoute>} />

                {/* Short URL Redirect - Public */}
                <Route path="/s/:code" element={<PublicHostRoute><ShortUrlRedirect /></PublicHostRoute>} />
                <Route path="/d/:token" element={<PublicHostRoute><PublicDocumentShare /></PublicHostRoute>} />
                <Route path="/view/rental/:id" element={<PublicHostRoute><PublicRentalView /></PublicHostRoute>} />
                <Route path="/view/share/:token" element={<PublicHostRoute><PublicDocumentShare /></PublicHostRoute>} />

                {/* Invoice Route - Should be accessible to authorized users */}
                <Route path="/invoice/:id" element={
                  <ErrorBoundary name="Invoice-Page">
                    <ProtectedRoute>
                      <InvoicePage />
                    </ProtectedRoute>
                  </ErrorBoundary>
                } />

                {/* Profile Route - Available to all authenticated users */}
                <Route path="/profile" element={
                  <PrivateWorkspaceHostRoute>
                    <ErrorBoundary name="Profile-Page">
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    </ErrorBoundary>
                  </PrivateWorkspaceHostRoute>
                } />
                <Route path="/account/*" element={
                  <PrivateWorkspaceHostRoute>
                    <ErrorBoundary name="Account-Workspace">
                      <ProtectedRoute>
                        <AccountWorkspaceLayout />
                      </ProtectedRoute>
                    </ErrorBoundary>
                  </PrivateWorkspaceHostRoute>
                }>
                  <Route index element={<Navigate to="/account/overview" replace />} />
                  <Route path="overview" element={<AccountOverview />} />
                  <Route path="rentals" element={<AccountRentals />} />
                  <Route path="rentals/requests/:requestId" element={<AccountMarketplaceRequestDetailsPage />} />
                  <Route path="rentals/:rentalId" element={<AccountRentalDetailsPage />} />
                  <Route path="tours" element={<AccountTours />} />
                  <Route path="tours/:tourId" element={<AccountTourDetailsPage />} />
                  <Route path="marketplace" element={<PublicCatalog embeddedInAccount />} />
                  <Route path="marketplace/:listingId" element={<PublicMarketplaceDetail embeddedInAccount />} />
                  <Route path="marketplace/:listingId/request" element={<PublicBookingRequest embeddedInAccount />} />
                  <Route path="marketplace/vehicles/:vehicleId" element={<AccountMarketplaceVehicleProfile />} />
                  <Route path="marketplace/vehicles/:vehicleId/profile" element={<AccountMarketplaceVehicleProfile />} />
                  <Route path="vehicles" element={<AccountMarketplace />} />
                  <Route path="vehicles/:vehicleId" element={<AccountMarketplaceVehicleProfile />} />
                  <Route path="vehicles/:vehicleId/profile" element={<AccountMarketplaceVehicleProfile />} />
                  <Route path="messages" element={<AccountMessages />} />
                  <Route path="boost" element={<AccountBoost />} />
                  <Route path="rewards" element={<AccountRewards />} />
                  <Route path="reviews" element={<AccountReviews />} />
                  <Route path="revenue" element={<AccountRevenue />} />
                  <Route path="verification" element={<AccountVerification />} />
                  <Route path="settings" element={<AccountSettings />} />
                </Route>
                <Route path="/track/tour/:groupId" element={
                  <ErrorBoundary name="Tour-Tracker">
                    <ProtectedRoute requiredRoles={['owner', 'admin', 'employee', 'guide']}>
                      <TourTracker />
                    </ProtectedRoute>
                  </ErrorBoundary>
                } />

                {/* Protected Admin Routes with Layout */}
                <Route path="/admin/*" element={
                  <AdminHostRoute>
                    <ErrorBoundary name="Admin-Routes">
                      <EmployeeRoute>
                        <AdminLayout />
                      </EmployeeRoute>
                    </ErrorBoundary>
                  </AdminHostRoute>
                }>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<ErrorBoundary name="Admin-Dashboard"><ProtectedRoute requiredPermissions={['Dashboard']}><AdminDashboard /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="calendar" element={<ErrorBoundary name="Calendar-Page"><ProtectedRoute requiredPermissions={['Calendar']}><CalendarPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="tours/*" element={<ErrorBoundary name="Tours-Page"><ProtectedRoute requiredPermissions={['Tours & Bookings']}><ToursPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="tasks/*" element={<ErrorBoundary name="Tasks-Page"><ProtectedRoute requiredPermissions={['Team Tasks']}><TasksPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="live-map" element={<ErrorBoundary name="Live-Map-Page"><LiveMapPage /></ErrorBoundary>} />
                  <Route path="rentals" element={<ErrorBoundary name="Rentals-Page"><ProtectedRoute requiredPermissions={['Rental Management']}><Rentals /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="rentals/:id" element={<ErrorBoundary name="Rental-Details"><ProtectedRoute requiredPermissions={['Rental Management']}><RentalDetails /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="customers" element={<ErrorBoundary name="Customer-Management-Dashboard"><ProtectedRoute requiredPermissions={['Customer Management']}><CustomerManagementDashboard /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="customers/profile" element={<ErrorBoundary name="Admin-Customer-Profile"><ProtectedRoute requiredPermissions={['Customer Management']}><AdminCustomerProfilePage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="customers/:customerId/profile" element={<ErrorBoundary name="Admin-Customer-Profile-ById"><ProtectedRoute requiredPermissions={['Customer Management']}><AdminCustomerProfilePage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="fleet" element={<ErrorBoundary name="Fleet-Page"><ProtectedRoute requiredPermissions={['Fleet Management']}><VehicleManagement /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="fleet/:vehicleId" element={<ErrorBoundary name="Vehicle-Profile-Page"><ProtectedRoute requiredPermissions={['Fleet Management']}><VehicleProfilePage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="fleet/:vehicleId/activity" element={<ErrorBoundary name="Vehicle-Activity-Page"><ProtectedRoute requiredPermissions={['Fleet Management']}><VehicleActivityPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="pricing/*" element={<ErrorBoundary name="Pricing-Page"><ProtectedRoute requiredPermissions={['Pricing Management']}><PricingPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="maintenance/:id" element={<ErrorBoundary name="Maintenance-Detail"><ProtectedRoute requiredPermissions={['Quad Maintenance']}><MaintenanceDetail /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="maintenance/*" element={<ErrorBoundary name="Maintenance-Page"><ProtectedRoute requiredPermissions={['Quad Maintenance']}><MaintenancePage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="fuel/*" element={<ErrorBoundary name="Fuel-Page"><ProtectedRoute requiredPermissions={['Fuel Logs']}><FuelPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="inventory/*" element={<ErrorBoundary name="Inventory-Page"><ProtectedRoute requiredPermissions={['Inventory']}><InventoryPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="finance/*" element={<ErrorBoundary name="Finance-Page"><ProtectedRoute requiredPermissions={['Finance Management']}><FinancePage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="alerts/*" element={<ErrorBoundary name="Alerts-Page"><ProtectedRoute requiredPermissions={['Alerts']}><AlertsPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="users/*" element={<ErrorBoundary name="User-Management-Page"><ProtectedRoute requiredPermissions={['User & Role Management']}><UserManagement /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="platform-admins" element={<ErrorBoundary name="Platform-Admins"><ProtectedRoute requiredPermissions={['Platform Admins']}><PlatformAdminsPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="verification" element={<ErrorBoundary name="Verification-Center"><ProtectedRoute requiredPermissions={['Verification Center']}><VerificationCenterPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="messages" element={<ErrorBoundary name="Admin-Messages"><ProtectedRoute requiredPermissions={['Messages']}><AdminMessagesPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="workspaces" element={<ErrorBoundary name="Workspaces"><ProtectedRoute requiredPermissions={['Workspaces']}><WorkspacesPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="marketplace" element={<ErrorBoundary name="Marketplace-Control"><ProtectedRoute forbiddenRoles={['business_owner']} requiredPermissions={['Marketplace Review']}><MarketplaceControlWorkspace /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="marketplace/:listingId" element={<ErrorBoundary name="Marketplace-Listing-Detail"><ProtectedRoute forbiddenRoles={['business_owner']} requiredPermissions={['Marketplace Review']}><MarketplaceListingDetail /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="settings/*" element={<ErrorBoundary name="Settings-Page"><ProtectedRoute requiredPermissions={['System Settings']}><SettingsPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="website/*" element={<ErrorBoundary name="Website-Editor-Page"><ProtectedRoute forbiddenRoles={['business_owner']} requiredPermissions={['System Settings']}><WebsiteEditorPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="export/*" element={<ErrorBoundary name="Export-Page"><ProtectedRoute forbiddenRoles={['business_owner']} requiredPermissions={['Project Export']}><ExportPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="profile" element={<ErrorBoundary name="Admin-Profile"><ProfilePage /></ErrorBoundary>} />
                </Route>

                {/* Guide Routes */}
                <Route path="/guide/*" element={
                  <ErrorBoundary name="Guide-Routes">
                    <GuideRoute>
                      <Routes>
                        <Route path="dashboard" element={<ProtectedRoute requiredPermissions={['Dashboard']}><GuideDashboard /></ProtectedRoute>} />
                        <Route path="tours" element={<ProtectedRoute requiredPermissions={['Tours & Bookings']}><ToursPage /></ProtectedRoute>} />
                        <Route path="profile" element={<ProfilePage />} />
                      </Routes>
                    </GuideRoute>
                  </ErrorBoundary>
                } />

                {/* Customer Routes */}
                <Route path="/customer/*" element={
                  <PrivateWorkspaceHostRoute>
                    <ErrorBoundary name="Customer-Routes">
                      <CustomerRoute>
                        <Routes>
                          <Route path="dashboard" element={<Navigate to="/account/overview" replace />} />
                          <Route path="book" element={<div className="p-6"><div className="bg-purple-50 border border-purple-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-purple-900 mb-2">Booking System</h2><p className="text-purple-800">Vehicle booking interface will be implemented here.</p></div></div>} />
                          <Route path="rentals" element={<Navigate to="/account/rentals" replace />} />
                          <Route path="profile" element={<Navigate to="/account/verification" replace />} />
                        </Routes>
                      </CustomerRoute>
                    </ErrorBoundary>
                  </PrivateWorkspaceHostRoute>
                } />

                <Route path="/business/*" element={<PrivateWorkspaceHostRoute><Navigate to="/account/overview" replace /></PrivateWorkspaceHostRoute>} />

                {/* Catch-all redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <AppGlobalMessageLauncher />
                  </div>
                </Suspense>
              </ErrorBoundary>
            </AuthProvider>
          </TenantWorkspaceBoot>
        </LanguageProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
