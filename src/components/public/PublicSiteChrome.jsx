import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Compass, Home, ImageIcon, Info, LayoutDashboard, LogIn, Menu, Share2, Tractor, Waves, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguageContext } from '../../contexts/LanguageContext';
import i18n from '../../i18n';
import { isApprovedBusinessOwnerAccount, isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from '../../utils/accountType';

const SAHARAX_LOGO_SRC = '/assets/logo.jpg';

const DEFAULT_CATEGORY_PILLS = [
  { label: 'ATV', href: '/rent?category=atv' },
  { label: 'Buggy', href: '/rent?category=buggy' },
  { label: 'Motorcycle', href: '/rent?category=motorcycle' },
  { label: 'Electric', href: '/rent?category=electric' },
  { label: 'Sea-Doo', href: '/rent?category=jetski' },
  { label: 'Machinery', href: '/rent?category=machinery' },
];

const PublicSiteChrome = ({ current = 'home', categoryPills = DEFAULT_CATEGORY_PILLS }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useTranslation();
  const { user, userProfile, signOut, getBusinessOwnerHomePath } = useAuth();
  const { setLanguage } = useLanguageContext();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const activeLanguage = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const navItemsConfig = useMemo(
    () => [
      { id: 'home', label: tr('Home', 'Accueil'), href: '/website', icon: Home, accent: 'from-violet-500 to-indigo-600' },
      { id: 'rent', label: tr('Rentals', 'Locations'), href: '/website', icon: Compass, accent: 'from-indigo-500 to-violet-600' },
      { id: 'marketplace', label: tr('Marketplace', 'Marketplace'), href: '/marketplace', icon: Tractor, accent: 'from-violet-500 to-fuchsia-600' },
      { id: 'tours', label: tr('Tours', 'Excursions'), href: '/tours', icon: Compass, accent: 'from-fuchsia-500 to-violet-600' },
      { id: 'categories', label: tr('Categories', 'Catégories'), href: '/website#categories', icon: Waves, accent: 'from-blue-500 to-indigo-600' },
      { id: 'about', label: tr('About Us', 'À propos'), href: '/website#about', icon: Info, accent: 'from-cyan-500 to-sky-600' },
      { id: 'media', label: tr('Media', 'Médias'), href: '/website#media', icon: ImageIcon, accent: 'from-emerald-500 to-teal-600' },
      { id: 'social', label: tr('Social', 'Réseaux'), href: '/website#social', icon: Share2, accent: 'from-purple-500 to-fuchsia-600' },
    ],
    [isFrench]
  );

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
  let workspaceHref = '/customer/profile';
  if (businessOwnerFreezeRedirect) {
    workspaceHref = businessOwnerFreezeRedirect;
  } else if (canOpenAdminPanel) {
    workspaceHref = adminHref;
  } else if (isBusinessAccountType(normalizedAccountType)) {
    workspaceHref = '/customer/profile';
  }
  const workspaceLabel = isBusinessAccountType(normalizedAccountType)
    ? tr('Business Workspace', 'Espace business')
    : tr('My Workspace', 'Mon espace');
  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
  };
  const accountLabel = user
    ? (userProfile?.fullName || userProfile?.email || user?.email || 'Signed in')
    : 'SaharaX website';
  const accountSubtitle = user
    ? (userProfile?.role || 'Signed in')
    : tr('Visitor', 'Visiteur');

  const navItems = useMemo(
    () =>
      navItemsConfig.map((item) => {
        const basePath = item.href.split('#')[0] || item.href;
        return {
          ...item,
          active: current === item.id || (item.href !== '/' && location.pathname.startsWith(basePath)),
        };
      }),
    [current, location.pathname, navItemsConfig]
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

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-violet-100/80 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
                aria-label="Open public menu"
              >
                <Menu className="h-5 w-5" />
              </button>

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
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50/80 px-4 py-2 text-sm font-semibold text-violet-700">
              {navItems.find((item) => item.active)?.label || 'Explore'}
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-[9999] flex"
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

          <div className="relative inset-y-0 left-0 z-50 w-[19rem] max-w-[88vw] transform transition-transform duration-300 ease-in-out">
            <div className="m-3 flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[30px] border border-violet-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,255,0.98)_100%)] shadow-[0_26px_70px_rgba(76,29,149,0.10)] backdrop-blur">
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

                <div className="mt-4 rounded-[24px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
                    {user ? tr('Signed In', 'Connecté') : tr('Public Access', 'Accès public')}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-sm font-semibold text-slate-700">
                      {(accountLabel || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{accountLabel}</div>
                      <div className="text-xs capitalize text-slate-500">{accountSubtitle}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
                      {tr('Website Language', 'Langue du site')}
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
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{tr('Page access', 'Accès aux pages')}</span>
                    <span>{navItems.length}/{navItems.length}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-700" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>

              <nav
                className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y',
                  overscrollBehavior: 'contain',
                }}
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`
                        group relative w-full overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 block
                        ${item.active
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
                          <div className={`truncate text-sm font-semibold ${item.active ? 'text-violet-900' : 'text-slate-800'}`}>{item.label}</div>
                          <div className={`mt-0.5 text-xs ${item.active ? 'text-violet-600' : 'text-slate-500'}`}>
                            {item.active ? tr('Current workspace', 'Espace actuel') : tr('Open page', 'Ouvrir la page')}
                          </div>
                        </div>
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${item.active ? 'text-violet-600' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
                      </div>
                    </a>
                  );
                })}

              </nav>

              <div className="border-t border-violet-100/80 bg-white/80 p-4 space-y-2">
                {canOpenAdminPanel ? (
                  <Link
                    to={adminHref}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.20)] transition-all hover:from-violet-700 hover:to-indigo-800"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>{adminLabel}</span>
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.20)] transition-all hover:from-violet-700 hover:to-indigo-800"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>{tr('Admin Sign In', 'Connexion admin')}</span>
                  </Link>
                )}

                {user ? (
                  <Link
                    to={workspaceHref}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-4 py-3 text-sm font-semibold text-violet-700 transition-all hover:border-violet-300 hover:text-violet-800"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>{workspaceLabel}</span>
                  </Link>
                ) : null}

                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>{tr('Sign Out', 'Se déconnecter')}</span>
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100"
                  >
                    <Home className="h-4 w-4" />
                    <span>{tr('Sign In', 'Se connecter')}</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PublicSiteChrome;
