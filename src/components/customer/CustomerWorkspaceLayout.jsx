import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, LayoutDashboard, Menu, UserCircle2, Waves, Sparkles } from 'lucide-react';
import i18n from '../../i18n';

const CUSTOMER_NAV_ITEMS = [
  { id: 'dashboard', label: { en: 'Dashboard', fr: 'Tableau de bord' }, href: '/customer/dashboard', icon: LayoutDashboard },
  { id: 'account', label: { en: 'My account', fr: 'Mon compte' }, href: '/customer/profile', icon: UserCircle2 },
  { id: 'rent', label: { en: 'Rentals', fr: 'Locations' }, href: '/rent', icon: Compass },
  { id: 'tours', label: { en: 'Tours', fr: 'Tours' }, href: '/tours', icon: Waves },
];

const CustomerWorkspaceLayout = ({ sectionLabel, title, description, children }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#ffffff_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
        <aside className="sticky top-6 hidden self-start md:block">
          <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white/92 p-5 shadow-[0_24px_60px_rgba(76,29,149,0.08)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.22)]">
                <Menu className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                  {isFrench ? 'Espace client' : 'Customer menu'}
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900">Sahara X</p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="text-xs text-slate-500">{description}</p>
                </div>
              </div>
            </div>

            <nav className="mt-5 space-y-2">
              {CUSTOMER_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href || (item.href !== '/customer/dashboard' && location.pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? 'border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 text-violet-800 shadow-sm'
                        : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isActive ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span>{item.label[isFrench ? 'fr' : 'en']}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.16),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_100%)] p-6 shadow-[0_24px_70px_rgba(76,29,149,0.08)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">{sectionLabel}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-base text-slate-600">{description}</p>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
};

export default CustomerWorkspaceLayout;
