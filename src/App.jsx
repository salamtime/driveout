import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import ProtectedRoute, { AdminRoute, EmployeeRoute, GuideRoute, CustomerRoute } from './components/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import AdminModuleHero from './components/admin/AdminModuleHero';
import { isApprovedBusinessOwnerAccount, isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from './utils/accountType';
import PublicVehicleDetail from './pages/PublicVehicleDetail';
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
import PublicInstantBooking from './pages/PublicInstantBooking';
import PublicBookingRequest from './pages/PublicBookingRequest';
import PublicTours from './pages/Tours';
import { buildHostUrl, getHostContext } from './utils/hostContext';
import { configureMasterSupabaseClient, configureSupabaseClient } from './lib/supabase';

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

const isFirstPartyStorefrontRoute = (host, pathname) => {
  if (host.kind !== 'tenant' || host.tenantSlug !== 'saharax') {
    return false;
  }

  return (
    pathname === '/' ||
    pathname === '/website' ||
    pathname === '/rent' ||
    pathname === '/rentals' ||
    pathname === '/marketplace' ||
    pathname === '/tours' ||
    pathname === '/tour-booking' ||
    pathname === '/rental-booking' ||
    pathname === '/camera-test' ||
    pathname.startsWith('/rent/') ||
    pathname.startsWith('/marketplace/') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/d/') ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/share/')
  );
};

const TenantWorkspaceBoot = ({ children }) => {
  const host = getHostContext();
  const location = useLocation();
  const shouldUsePublicStorefront = isFirstPartyStorefrontRoute(host, location.pathname);
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
    return <WorkspaceUnavailableState title="Opening workspace" message="Preparing your isolated tenant workspace..." />;
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
  const isFirstPartyStorefrontTenant = host.kind === 'tenant' && host.tenantSlug === 'saharax';

  if (host.kind === 'public' || host.kind === 'local' || isFirstPartyStorefrontTenant) {
    return children;
  }

  if (host.kind === 'tenant') {
    return <WorkspaceUnavailableState title="Workspace route unavailable" message="Public marketplace routes are not available inside tenant workspaces." />;
  }

  return <HostDomainRedirect kind="public" />;
};

const AdminHostRoute = ({ children }) => {
  const host = getHostContext();

  if (host.kind === 'admin' || host.kind === 'tenant' || host.kind === 'local') {
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
const RentalBooking = lazy(() => import('./pages/RentalBooking'));
const Rentals = lazy(() => import('./pages/admin/Rentals'));
const RentalDetails = lazy(() => import('./pages/admin/RentalDetails'));
const InvoicePage = lazy(() => import('./pages/admin/InvoicePage'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const GuideDashboard = lazy(() => import('./pages/guide/Dashboard'));
const AccountWorkspaceLayout = lazy(() => import('./components/account/AccountWorkspaceLayout'));
const AccountOverview = lazy(() => import('./pages/account/AccountOverview'));
const AccountRentals = lazy(() => import('./pages/account/AccountRentals'));
const AccountTours = lazy(() => import('./pages/account/AccountTours'));
const AccountMarketplace = lazy(() => import('./pages/account/AccountMarketplace'));
const AccountMessages = lazy(() => import('./pages/account/AccountMessages'));
const AccountReviews = lazy(() => import('./pages/account/AccountReviews'));
const AccountRevenue = lazy(() => import('./pages/account/AccountRevenue'));
const AccountVerification = lazy(() => import('./pages/account/AccountVerification'));
const AccountSettings = lazy(() => import('./pages/account/AccountSettings'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Unauthorized = lazy(() => import('./pages/auth/Unauthorized'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
const CalendarPage = lazy(() => import('./pages/admin/Calendar'));
const ToursPage = lazy(() => import('./pages/admin/Tours'));
const TasksPage = lazy(() => import('./pages/admin/Tasks'));
const LiveMapPage = lazy(() => import('./pages/admin/LiveMap'));
const FleetPage = lazy(() => import('./pages/admin/Fleet'));
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
const VerificationCenterPage = lazy(() => import('./pages/admin/VerificationCenter'));
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

const getModuleLoadingMeta = (pathname) => {
  const routes = [
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
      eyebrow: 'Fleet Management',
      title: 'Fleet Management',
      description: 'Preparing the fleet workspace...',
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

  return routes.find((route) => pathname.startsWith(route.match)) || {
    eyebrow: 'Module',
    title: 'Loading Module',
    description: 'Preparing the workspace...',
    icon: FileText,
  };
};

const RouteLoadingFallback = () => {
  const location = useLocation();
  const isPublicStorefrontPath = [
    '/',
    '/website',
    '/rent',
    '/rentals',
    '/marketplace',
    '/tours',
    '/tour-booking',
    '/rental-booking',
  ].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

  if (isPublicStorefrontPath) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#F5F3FF_0%,#ECE9FF_100%)] text-slate-950">
        <div className="min-h-[76px]" />
        <section className="min-h-[calc(100vh-76px)] px-5 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto flex max-w-[620px] flex-col items-center">
            <div className="text-center">
              <div className="h-12 w-64 animate-pulse rounded-2xl bg-white/70 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:h-16 sm:w-80" />
              <div className="mt-6 inline-flex items-center justify-center gap-3 rounded-full bg-white/80 px-5 py-3 shadow-sm ring-1 ring-violet-100">
                <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
                <div className="h-4 w-16 animate-pulse rounded-full bg-violet-100" />
              </div>
            </div>

            <div className="mt-14 grid w-full gap-5">
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="flex min-h-[156px] w-full items-center justify-between rounded-[24px] bg-white p-9 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-10"
                >
                  <div className="h-12 w-36 animate-pulse rounded-2xl bg-slate-100 sm:h-14 sm:w-40" />
                  <div className="h-12 w-12 animate-pulse rounded-full bg-violet-100" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const meta = getModuleLoadingMeta(location.pathname);
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminModuleHero
        className="w-full"
        icon={<Icon className="h-8 w-8 text-white" />}
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
      />
      <div className="max-w-7xl mx-auto p-6">
        <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 text-4xl animate-spin">⏳</div>
            <p className="text-base font-medium text-slate-700">Loading module...</p>
            <p className="mt-2 text-sm text-slate-500">{meta.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * HomeRedirect - Redirects users based on their authentication status and role
 */
const HomeRedirect = () => {
  const { user, userProfile, initialized, session, getBusinessOwnerHomePath } = useAuth();
  const host = getHostContext();

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading Application...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (host.kind === 'admin' || host.kind === 'app' || host.kind === 'tenant') {
      return <Navigate to="/login" replace />;
    }
    return <Landing />;
  }

  if (host.kind === 'public') {
    return <Landing />;
  }

  const role = userProfile?.role;
  const normalizedEmail = String(userProfile?.email || user?.email || '').toLowerCase();
  const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
  const accountType = session?.user?.user_metadata?.account_type || user?.user_metadata?.account_type || '';
  const approvedBusinessOwner = !platformOwnerOverride && isApprovedBusinessOwnerAccount(session?.user?.user_metadata || user?.user_metadata || {});
  const businessOwnerFreezeRedirect = !platformOwnerOverride && isBusinessOwnerAccountType(accountType)
    ? getBusinessOwnerHomePath({
        account_type: accountType,
        verification_status: userProfile?.verificationStatus || session?.user?.user_metadata?.verification_status || user?.user_metadata?.verification_status,
        subscription_status: userProfile?.subscriptionStatus || session?.user?.user_metadata?.subscription_status || user?.user_metadata?.subscription_status,
      })
    : null;

  if (businessOwnerFreezeRedirect) {
    if (/^https?:\/\//i.test(businessOwnerFreezeRedirect)) {
      return <ExternalRedirect to={businessOwnerFreezeRedirect} />;
    }
    return <Navigate to={businessOwnerFreezeRedirect} replace />;
  }

  if ((host.kind === 'tenant' || host.kind === 'app') && ['owner', 'admin', 'employee', 'guide'].includes(role)) {
    return <Navigate to={role === 'guide' ? '/guide/dashboard' : '/admin/dashboard'} replace />;
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
  return <Navigate to={redirectTo} replace />;
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

function App() {
  return (
    <ErrorBoundary name="App-Root">
      <Router>
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
                  <ErrorBoundary name="Profile-Page">
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  </ErrorBoundary>
                } />
                <Route path="/account/*" element={
                  <ErrorBoundary name="Account-Workspace">
                    <ProtectedRoute>
                      <AccountWorkspaceLayout />
                    </ProtectedRoute>
                  </ErrorBoundary>
                }>
                  <Route index element={<Navigate to="/account/overview" replace />} />
                  <Route path="overview" element={<AccountOverview />} />
                  <Route path="rentals" element={<AccountRentals />} />
                  <Route path="tours" element={<AccountTours />} />
                  <Route path="marketplace" element={<AccountMarketplace />} />
                  <Route path="messages" element={<AccountMessages />} />
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
                  <Route path="dashboard" element={<ErrorBoundary name="Admin-Dashboard"><AdminDashboard /></ErrorBoundary>} />
                  <Route path="calendar" element={<ErrorBoundary name="Calendar-Page"><CalendarPage /></ErrorBoundary>} />
                  <Route path="tours/*" element={<ErrorBoundary name="Tours-Page"><ToursPage /></ErrorBoundary>} />
                  <Route path="tasks/*" element={<ErrorBoundary name="Tasks-Page"><TasksPage /></ErrorBoundary>} />
                  <Route path="live-map" element={<ErrorBoundary name="Live-Map-Page"><LiveMapPage /></ErrorBoundary>} />
                  <Route path="rentals" element={<ErrorBoundary name="Rentals-Page"><Rentals /></ErrorBoundary>} />
                  <Route path="rentals/:id" element={<ErrorBoundary name="Rental-Details"><RentalDetails /></ErrorBoundary>} />
                  <Route path="customers" element={<ErrorBoundary name="Customer-Management-Dashboard"><CustomerManagementDashboard /></ErrorBoundary>} />
                  <Route path="fleet" element={<ErrorBoundary name="Fleet-Page"><FleetPage /></ErrorBoundary>} />
                  <Route path="fleet/:vehicleId" element={<ErrorBoundary name="Vehicle-Profile-Page"><VehicleProfilePage /></ErrorBoundary>} />
                  <Route path="fleet/:vehicleId/activity" element={<ErrorBoundary name="Vehicle-Activity-Page"><VehicleActivityPage /></ErrorBoundary>} />
                  <Route path="pricing/*" element={<ErrorBoundary name="Pricing-Page"><PricingPage /></ErrorBoundary>} />
                  <Route path="maintenance/:id" element={<ErrorBoundary name="Maintenance-Detail"><MaintenanceDetail /></ErrorBoundary>} />
                  <Route path="maintenance/*" element={<ErrorBoundary name="Maintenance-Page"><MaintenancePage /></ErrorBoundary>} />
                  <Route path="fuel/*" element={<ErrorBoundary name="Fuel-Page"><FuelPage /></ErrorBoundary>} />
                  <Route path="inventory/*" element={<ErrorBoundary name="Inventory-Page"><InventoryPage /></ErrorBoundary>} />
                  <Route path="finance/*" element={<ErrorBoundary name="Finance-Page"><FinancePage /></ErrorBoundary>} />
                  <Route path="alerts/*" element={<ErrorBoundary name="Alerts-Page"><AlertsPage /></ErrorBoundary>} />
                  <Route path="users/*" element={<ErrorBoundary name="User-Management-Page"><UserManagement /></ErrorBoundary>} />
                  <Route path="verification" element={<ErrorBoundary name="Verification-Center"><VerificationCenterPage /></ErrorBoundary>} />
                  <Route path="workspaces" element={<ErrorBoundary name="Workspaces"><ProtectedRoute requiredRoles={['owner', 'admin']}><WorkspacesPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="marketplace" element={<ErrorBoundary name="Marketplace-Control"><ProtectedRoute forbiddenRoles={['business_owner']}><MarketplaceControlWorkspace /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="marketplace/:listingId" element={<ErrorBoundary name="Marketplace-Listing-Detail"><ProtectedRoute forbiddenRoles={['business_owner']}><MarketplaceListingDetail /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="settings/*" element={<ErrorBoundary name="Settings-Page"><SettingsPage /></ErrorBoundary>} />
                  <Route path="website/*" element={<ErrorBoundary name="Website-Editor-Page"><ProtectedRoute forbiddenRoles={['business_owner']}><WebsiteEditorPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="export/*" element={<ErrorBoundary name="Export-Page"><ProtectedRoute forbiddenRoles={['business_owner']}><ExportPage /></ProtectedRoute></ErrorBoundary>} />
                  <Route path="profile" element={<ErrorBoundary name="Admin-Profile"><ProfilePage /></ErrorBoundary>} />
                </Route>

                {/* Guide Routes */}
                <Route path="/guide/*" element={
                  <ErrorBoundary name="Guide-Routes">
                    <GuideRoute>
                      <Routes>
                        <Route path="dashboard" element={<GuideDashboard />} />
                        <Route path="tours" element={<ToursPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                      </Routes>
                    </GuideRoute>
                  </ErrorBoundary>
                } />

                {/* Customer Routes */}
                <Route path="/customer/*" element={
                  <ErrorBoundary name="Customer-Routes">
                    <CustomerRoute>
                      <Routes>
                        <Route path="dashboard" element={<Navigate to="/account/overview" replace />} />
                        <Route path="book" element={<div className="p-6"><div className="bg-purple-50 border border-purple-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-purple-900 mb-2">Booking System</h2><p className="text-purple-800">Vehicle booking interface will be implemented here.</p></div></div>} />
                        <Route path="rentals" element={<Navigate to="/account/rentals" replace />} />
                        <Route path="profile" element={<Navigate to="/account/settings" replace />} />
                      </Routes>
                    </CustomerRoute>
                  </ErrorBoundary>
                } />

                <Route path="/business/*" element={<Navigate to="/account/overview" replace />} />

                {/* Catch-all redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
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
