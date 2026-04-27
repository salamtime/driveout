import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, LayoutDashboard, LogIn, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguageContext } from '../../contexts/LanguageContext';
import i18n from '../../i18n';
import { isApprovedBusinessOwnerAccount, isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from '../../utils/accountType';

const SAHARAX_LOGO_SRC = '/assets/logo.jpg';
const ACCOUNT_MENU_PERSIST_KEY = 'saharax_account_menu_open';
const ACCOUNT_RETURN_PATH_KEY = 'saharax_account_return_path';

const PublicSiteChrome = ({ current = 'home' }) => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(ACCOUNT_MENU_PERSIST_KEY) === '1';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const navigate = useNavigate();
  useTranslation();
  const { user, userProfile, signOut, getBusinessOwnerHomePath } = useAuth();
  const { setLanguage } = useLanguageContext();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const activeLanguage = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const normalizedRole = String(userProfile?.role || '').toLowerCase();
  const normalizedEmail = String(userProfile?.email || user?.email || '').toLowerCase();
  const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
  const approvedBusinessOwner = !platformOwnerOverride && isApprovedBusinessOwnerAccount(user?.user_metadata || user?.app_metadata || {});
  const normalizedAccountType = String(
    userProfile?.accountType ||
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).toLowerCase();
  const businessOwnerFreezeRedirect = !platformOwnerOverride && isBusinessOwnerAccountType(normalizedAccountType)
    ? getBusinessOwnerHomePath({
        account_type: normalizedAccountType,
        verification_status: userProfile?.verificationStatus || user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
        subscription_status: userProfile?.subscriptionStatus || user?.user_metadata?.subscription_status || user?.app_metadata?.subscription_status,
      })
    : null;
  const canOpenAdminPanel = ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(normalizedRole) || approvedBusinessOwner;
  const adminHref = normalizedRole === 'guide' ? '/guide/dashboard' : '/admin/dashboard';
  const adminLabel = normalizedRole === 'guide' ? 'Open Guide Panel' : 'Open Admin Panel';
  const hasPrivateProfileWorkspace = Boolean(user) && !businessOwnerFreezeRedirect && !canOpenAdminPanel;
  let workspaceHref = '/account/overview';
  if (businessOwnerFreezeRedirect) {
    workspaceHref = businessOwnerFreezeRedirect;
  } else if (canOpenAdminPanel) {
    workspaceHref = adminHref;
  } else if (isBusinessAccountType(normalizedAccountType)) {
    workspaceHref = '/account/overview';
  }
  const hasWorkspaceAccess = Boolean(user);
  const workspaceLabel =
    hasPrivateProfileWorkspace
      ? tr('My Profile', 'Mon profil')
      : tr('My Workspace', 'Mon espace');
  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
  };
  const handleWorkspaceNavigate = () => {
    setMenuOpen(false);
    try {
      window.sessionStorage.setItem(ACCOUNT_MENU_PERSIST_KEY, '1');
      window.sessionStorage.setItem(
        ACCOUNT_RETURN_PATH_KEY,
        `${location.pathname || '/website'}${location.search || ''}${location.hash || ''}`
      );
    } catch (error) {
      console.warn('Failed to persist account menu state:', error);
    }
    navigate(hasPrivateProfileWorkspace ? '/account/overview' : workspaceHref);
  };
  const accountEmail = userProfile?.email || user?.email || '';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 6);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      console.warn('Failed to sync public menu state:', error);
    }
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-all ${
          scrolled
            ? 'border-b border-violet-100/80 bg-white/92 backdrop-blur-xl shadow-[0_12px_30px_rgba(15,23,42,0.06)]'
            : 'border-b border-transparent bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_100%)]'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between gap-4">
            <Link to="/website" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                <img
                  src={SAHARAX_LOGO_SRC}
                  alt="SaharaX"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[0.12em] text-violet-600">SaharaX</p>
                <p className="text-sm text-slate-500">{tr('Rentals, tours, and more', 'Locations, excursions et plus')}</p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
              aria-label="Open public menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-end px-4 pt-24 sm:pt-28"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMenuOpen(false);
            }
          }}
        >
          <div
            className="fixed inset-0 bg-slate-950/38 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />

          <div className="relative z-50 w-full max-w-[22rem]">
            <div className="overflow-hidden rounded-[26px] border border-violet-100/80 bg-white shadow-[0_26px_70px_rgba(76,29,149,0.16)] backdrop-blur">
              <div className="flex-shrink-0 border-b border-violet-100/80 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(79,70,229,0.18)]">
                      <img
                        src={SAHARAX_LOGO_SRC}
                        alt="SaharaX"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-slate-900">SaharaX Website</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">{tr('Public workspace', 'Espace public')}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700"
                    aria-label="Close public menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  <div className="rounded-2xl border border-violet-100 bg-white/85 px-3 py-3 shadow-sm">
                    <div className="mt-1 flex justify-center">
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
                  </div>

                  {hasWorkspaceAccess ? (
                    <button
                      type="button"
                      onClick={handleWorkspaceNavigate}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-3 py-3 text-left text-sm font-semibold text-violet-700 transition-all hover:border-violet-300 hover:text-violet-800"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
                          <LayoutDashboard className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{workspaceLabel}</div>
                          <div className="mt-0.5 truncate text-xs font-medium text-violet-600">
                            {accountEmail || tr('Signed in', 'Connecté')}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-violet-600" />
                    </button>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Link
                        to="/login"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <LogIn className="h-4 w-4" />
                        {tr('Sign in', 'Se connecter')}
                      </Link>
                      <Link
                        to="/register"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                      >
                        {tr('Sign up', "S'inscrire")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-violet-100/80 bg-white/90 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/website#media"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('Media', 'Médias')}
                  </Link>
                  <Link
                    to="/website#social"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('Social', 'Réseaux')}
                  </Link>
                  <Link
                    to="/website#about"
                    onClick={() => setMenuOpen(false)}
                    className="col-span-2 inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('About Us', 'À propos')}
                  </Link>
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>{tr('Sign out', 'Se déconnecter')}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PublicSiteChrome;
