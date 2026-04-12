import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Home, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import i18n from '../../i18n';
import { ACCOUNT_WORKSPACE_SECTIONS, getAccountWorkspaceSection } from './accountWorkspaceConfig';
import { useAuth } from '../../contexts/AuthContext';
import { isApprovedBusinessOwnerAccount, isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from '../../utils/accountType';
import { useLanguageContext } from '../../contexts/LanguageContext';

const SAHARAX_LOGO_SRC = '/assets/logo.jpg';
const ACCOUNT_MENU_PERSIST_KEY = 'saharax_account_menu_open';
const ACCOUNT_RETURN_PATH_KEY = 'saharax_account_return_path';

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
  const { user, userProfile, signOut, getBusinessOwnerHomePath } = useAuth();
  const { setLanguage } = useLanguageContext();
  const tr = (en, fr) => (isFrench ? fr : en);
  const activeLanguage = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';

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
  const businessOwnerFreezeRedirect = !platformOwnerOverride && isBusinessOwnerAccountType(normalizedAccountType)
    ? getBusinessOwnerHomePath({
        account_type: normalizedAccountType,
        verification_status: userProfile?.verificationStatus || user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
        subscription_status: userProfile?.subscriptionStatus || user?.user_metadata?.subscription_status || user?.app_metadata?.subscription_status,
      })
    : null;
  const canOpenAdminPanel = ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(normalizedRole) || approvedBusinessOwner;
  const adminHref = normalizedRole === 'guide' ? '/guide/dashboard' : '/admin/dashboard';
  const showBusinessWorkspaceAction = Boolean(businessOwnerFreezeRedirect || canOpenAdminPanel);
  const businessWorkspaceHref = businessOwnerFreezeRedirect || adminHref;
  const visibleSections = useMemo(
    () =>
      ACCOUNT_WORKSPACE_SECTIONS.filter((section) => {
        if (section.id === 'marketplace' || section.id === 'revenue') {
          return isBusinessAccountType(normalizedAccountType) || canOpenAdminPanel;
        }
        return true;
      }),
    [normalizedAccountType, canOpenAdminPanel]
  );
  const currentSection = getAccountWorkspaceSection(
    visibleSections.find((section) => location.pathname === section.href || location.pathname.startsWith(`${section.href}/`))?.id || 'overview'
  );
  const accountLabel = userProfile?.fullName || userProfile?.email || user?.email || tr('Signed in', 'Connecté');
  const accountSubtitle = userProfile?.role || tr('Customer', 'Client');

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

  const handleNavigate = (href) => {
    setMenuOpen(false);
    navigate(href);
  };

  const handleReturnToWebsite = () => {
    let targetHref = '/website';
    try {
      const savedHref = window.sessionStorage.getItem(ACCOUNT_RETURN_PATH_KEY);
      if (savedHref) {
        targetHref = savedHref;
      }
      window.sessionStorage.setItem(ACCOUNT_MENU_PERSIST_KEY, '1');
    } catch (error) {
      console.warn('Failed to restore account return path:', error);
    }
    navigate(targetHref);
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/website', { replace: true });
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
      {visibleSections.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.id}
            to={item.href}
            className={`
              group relative block w-full overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-all duration-200
              ${isActive
                ? 'border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 text-violet-900 shadow-[0_16px_38px_rgba(79,70,229,0.12)]'
                : 'border-transparent bg-white/70 text-slate-700 hover:border-slate-200 hover:bg-white hover:shadow-sm'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent} text-white shadow-sm`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${isActive ? 'text-violet-900' : 'text-slate-800'}`}>
                  {item.label[isFrench ? 'fr' : 'en']}
                </div>
                <div className={`mt-0.5 text-xs ${isActive ? 'text-violet-600' : 'text-slate-500'}`}>
                  {isActive ? tr('Current workspace', 'Espace actuel') : tr('Open page', 'Ouvrir la page')}
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${isActive ? 'text-violet-600' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
            </div>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#eef2ff_46%,#ffffff_100%)]">
      <header className="sticky top-0 z-40 border-b border-violet-100/80 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
                aria-label="Open account menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <Link to="/website" className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                  <img src={SAHARAX_LOGO_SRC} alt="SaharaX" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.12em] text-violet-600">SaharaX</p>
                  <p className="text-sm text-slate-500">{tr('My profile workspace', 'Mon espace profil')}</p>
                </div>
              </Link>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50/80 px-4 py-2 text-sm font-semibold text-violet-700">
              {currentSection.label[isFrench ? 'fr' : 'en']}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <main className="min-w-0">
          <Outlet />
        </main>
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
          <div className="relative inset-y-0 left-0 z-50 w-[19rem] max-w-[88vw] transform transition-transform duration-300 ease-in-out">
            <div className="m-3 flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[30px] border border-violet-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,255,0.98)_100%)] shadow-[0_26px_70px_rgba(76,29,149,0.10)] backdrop-blur">
            <div className="border-b border-violet-100/80 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                    <img src={SAHARAX_LOGO_SRC} alt="SaharaX" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-900">SaharaX</div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">{tr('Private workspace', 'Espace privé')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                  aria-label="Close account menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white/85 px-3 py-2 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white p-1 shadow-sm">
                    <span className="text-sm font-semibold text-slate-700">
                      {(accountLabel || 'S').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{accountLabel}</div>
                    <div className="text-xs capitalize text-slate-500">{accountSubtitle}</div>
                  </div>
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

                <button
                  type="button"
                  onClick={handleReturnToWebsite}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-white/85 px-3 py-3 text-left shadow-sm transition hover:border-violet-200 hover:bg-violet-50/70"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{tr('Back to website', 'Retour au site')}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {tr('Return to the public website and browsing flow.', 'Retournez au site public et à la navigation principale.')}
                    </div>
                  </div>
                  <ArrowLeft className="h-4 w-4 flex-shrink-0 text-violet-600" />
                </button>
              </div>
            </div>

            {renderNavItems()}

            <div className="space-y-2 border-t border-violet-100/80 bg-white/80 p-4">
              {showBusinessWorkspaceAction ? (
                <button
                  type="button"
                  onClick={() => handleNavigate(businessWorkspaceHref)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-200 hover:bg-violet-100"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>{tr('Business workspace', 'Espace business')}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
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
