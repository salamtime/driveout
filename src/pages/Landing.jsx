import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Compass, MapPin, Route, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import PublicSiteChrome from '../components/public/PublicSiteChrome';

const FALLBACK_CITIES = ['Tangier'];

const Landing = () => {
  useTranslation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [selectedCity, setSelectedCity] = useState('Tangier');
  const cities = FALLBACK_CITIES;
  const experienceOptions = useMemo(
    () => [
      {
        value: 'rent',
        title: tr('Rent', 'Louer'),
        description: tr('Vehicles', 'Véhicules'),
        icon: Compass,
        accent: 'from-violet-700 via-violet-600 to-fuchsia-600',
        glow: 'bg-fuchsia-300/30',
        detail: tr('Certified fleet', 'Flotte certifiée'),
      },
      {
        value: 'tours',
        title: tr('Tours', 'Excursions'),
        description: tr('Guided experiences', 'Expériences guidées'),
        icon: Route,
        accent: 'from-indigo-700 via-violet-600 to-violet-500',
        glow: 'bg-sky-300/25',
        detail: tr('Route experiences', 'Expériences sur itinéraire'),
      },
    ],
    [isFrench]
  );

  const rentHref = useMemo(
    () => `/rent?city=${encodeURIComponent(selectedCity)}`,
    [selectedCity]
  );
  const toursHref = useMemo(
    () => `/tours?city=${encodeURIComponent(selectedCity)}`,
    [selectedCity]
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fcfbff_0%,#f6f1ff_42%,#ffffff_100%)] text-slate-950">
      <PublicSiteChrome current="home" />
      <section className="relative overflow-hidden border-b border-violet-100 bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ddd6fe_22%,#f8f5ff_58%,#ffffff_100%)]">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-fuchsia-200/30 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-14">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-violet-700">
              {tr('Start here', 'Commencez ici')}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {tr('Choose your experience', 'Choisissez votre expérience')}
            </h1>
          </div>

          <div className="mx-auto mt-8 max-w-5xl rounded-[36px] border border-violet-100 bg-white/90 p-5 shadow-[0_30px_80px_rgba(76,29,149,0.10)] backdrop-blur sm:p-7">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {experienceOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Link
                    key={option.value}
                    to={option.value === 'rent' ? rentHref : toursHref}
                    className={`group relative overflow-hidden rounded-[24px] border border-violet-200/70 bg-gradient-to-br ${option.accent} p-4 text-left text-white shadow-[0_24px_60px_rgba(91,33,182,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(91,33,182,0.28)] sm:rounded-[28px] sm:p-5`}
                  >
                    <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${option.glow} blur-2xl transition duration-300 group-hover:scale-110`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
                    <div className="absolute inset-x-4 bottom-0 h-px bg-white/20" />

                    <div className="relative flex h-full flex-col">
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] ring-1 ring-white/20 backdrop-blur sm:h-12 sm:w-12 sm:rounded-2xl">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 ring-1 ring-white/20 backdrop-blur sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.16em]">
                          <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          {tr('Tap', 'Touchez')}
                        </div>
                      </div>

                      <div className="mt-6 sm:mt-8">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70 sm:text-[11px] sm:tracking-[0.28em]">
                          {tr('Experience', 'Expérience')}
                        </p>
                        <h2 className="mt-2 text-[1.15rem] font-semibold tracking-tight text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.08)] sm:text-[1.9rem]">
                          {option.title}
                        </h2>
                        <p className="mt-1 text-xs font-medium leading-5 text-white/82 sm:text-sm">
                          {option.description}
                        </p>
                      </div>

                      <div className="mt-auto pt-6 sm:pt-8">
                        <div className="flex flex-col gap-2 rounded-[20px] bg-white/10 px-3 py-3.5 ring-1 ring-white/15 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:px-3.5 sm:py-3">
                          <span className="block min-w-0 text-[10px] font-semibold uppercase tracking-[0.12em] leading-[1.4] text-white/75 sm:flex-1 sm:text-xs sm:tracking-[0.18em]">
                            {option.detail}
                          </span>
                          <span className="flex h-8 w-8 self-end items-center justify-center rounded-full bg-white text-violet-700 shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:h-9 sm:w-9 sm:self-auto sm:translate-y-0">
                            <ArrowUpRight className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-5 rounded-[28px] border border-violet-100 bg-[linear-gradient(180deg,#fbf8ff_0%,#ffffff_100%)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {tr('City', 'Ville')}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">
                    {tr('Choose city', 'Choisissez une ville')}
                  </h3>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <MapPin className="h-4 w-4 text-violet-600" />
                  {selectedCity}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {cities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setSelectedCity(city)}
                    className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      selectedCity === city
                        ? 'bg-slate-950 text-white'
                        : 'bg-white text-slate-700 ring-1 ring-violet-100 hover:ring-violet-300'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section id="categories" className="rounded-[32px] border border-violet-100 bg-white p-6 shadow-[0_20px_60px_rgba(76,29,149,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">{tr('Categories', 'Catégories')}</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">{tr('Browse by type', 'Parcourir par type')}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'ATV', href: '/rent?category=atv', note: tr('Core off-road fleet', 'Flotte tout-terrain principale') },
              { title: 'Buggy', href: '/rent?category=buggy', note: tr('Higher-capacity adventure rides', 'Sorties aventure à plus grande capacité') },
              { title: 'Motorcycle', href: '/rent?category=motorcycle', note: tr('Road and mixed-use rentals', 'Locations route et usage mixte') },
              { title: 'Electric', href: '/rent?category=electric', note: tr('Light urban and eco rides', 'Mobilité urbaine légère et éco') },
            ].map((item) => (
              <Link key={item.title} to={item.href} className="rounded-[28px] border border-violet-100 bg-[linear-gradient(180deg,#faf5ff_0%,#ffffff_100%)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(76,29,149,0.10)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">{item.title}</p>
                <p className="mt-3 text-sm text-slate-600">{item.note}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Landing;
