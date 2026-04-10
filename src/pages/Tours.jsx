import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Compass, MapPin, Route, ShieldCheck, Sunset } from 'lucide-react';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import websiteContentService from '../services/WebsiteContentService';

const TOUR_CITIES = ['Tangier'];

const CITY_CONTENT = {
  Tangier: {
    providerName: 'SaharaX',
    providerLogo: '/assets/logo.jpg',
    identityLabel: 'Certified guided experiences',
    citySummary:
      'Tangier stays focused on polished guided rides with premium pacing, cleaner guest flow, and strong photo-friendly routes.',
    trustPoints: [
      'Certified fleet support',
      'Guide-led routes',
      'Direct booking flow',
    ],
  },
};

const TOUR_COLLECTION = [
  {
    id: 'sunset',
    title: 'Sunset Dune Escape',
    category: 'sunset',
    duration: '2.5 hours',
    groupSize: '2-6 riders',
    difficulty: 'Easy',
    city: 'Tangier',
    price: 950,
    routeName: 'Golden-hour dune loop',
    summary:
      'A softer golden-hour route for guests who want views, photos, and a calm guided rhythm.',
    highlights: ['Golden hour route', 'Photo stops', 'Tea break'],
    routeStops: ['Tangier coast', 'Open dunes', 'Sunset ridge'],
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'coastline',
    title: 'Coastline Explorer Route',
    category: 'adventure',
    duration: '4 hours',
    groupSize: '2-8 riders',
    difficulty: 'Medium',
    city: 'Tangier',
    price: 1400,
    routeName: 'Mixed coastal terrain ride',
    summary:
      'A stronger guided ride mixing coastal tracks, off-road sections, and a longer scenic loop.',
    highlights: ['Longer route', 'Guide included', 'Mixed terrain'],
    routeStops: ['Cap Spartel side', 'Cliff tracks', 'Scenic return loop'],
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  },
];

const CATEGORY_LABELS = {
  all: 'All guided tours',
  sunset: 'Sunset',
  adventure: 'Adventure',
  family: 'Family',
  'full-day': 'Full day',
  coastal: 'Coastal',
  discovery: 'Discovery',
};

const DIFFICULTY_TONE = {
  Easy: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  Advanced: 'bg-rose-100 text-rose-700',
};

const Tours = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCity = searchParams.get('city') || 'Tangier';
  const safeInitialCity = TOUR_CITIES.includes(requestedCity) ? requestedCity : 'Tangier';
  const [selectedCity, setSelectedCity] = useState(safeInitialCity);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [websiteContent, setWebsiteContent] = useState(() => websiteContentService.getContent().toursPage);

  React.useEffect(() => websiteContentService.subscribe((next) => setWebsiteContent(next.toursPage)), []);

  const filteredTours = useMemo(() => {
    return TOUR_COLLECTION.filter((tour) => {
      if (tour.city !== selectedCity) return false;
      if (selectedCategory !== 'all' && tour.category !== selectedCategory) return false;
      return true;
    });
  }, [selectedCity, selectedCategory]);

  const categories = useMemo(() => {
    const currentCityCategories = TOUR_COLLECTION.filter((tour) => tour.city === selectedCity).map((tour) => tour.category);
    return ['all', ...new Set(currentCityCategories)];
  }, [selectedCity]);

  const cityContent = CITY_CONTENT[selectedCity] || CITY_CONTENT.Tangier;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#faf7ff_0%,#f3f1ff_28%,#ffffff_100%)]">
      <PublicSiteChrome current="tours" />
      <section className="relative overflow-hidden border-b border-violet-100 bg-[radial-gradient(circle_at_top_left,#e9d5ff_0%,#c4b5fd_22%,#f5f3ff_56%,#ffffff_100%)]">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute left-10 top-20 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-14">
          <button
            type="button"
            onClick={() => navigate('/website')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
            title="Back to website"
            aria-label="Back to website"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-4 py-2 text-sm font-semibold text-violet-700">
                <Compass className="h-4 w-4" />
                {websiteContent.badge}
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                {websiteContent.title}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
                {websiteContent.subtitle}
              </p>
            </div>

            <div className="rounded-[28px] border border-violet-100 bg-white/90 p-5 shadow-[0_20px_50px_rgba(79,70,229,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">
                {websiteContent.currentCityLabel}
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{selectedCity}</p>
              <p className="mt-2 text-sm text-slate-600">
                {cityContent.citySummary}
              </p>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white">
                  <img src={cityContent.providerLogo} alt={cityContent.providerName} className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Powered by</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{cityContent.providerName}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-[32px] border border-violet-100 bg-white/88 p-6 shadow-[0_30px_80px_rgba(79,70,229,0.06)] backdrop-blur">
            <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {websiteContent.cityStepLabel}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {websiteContent.cityStepTitle}
                </h2>
                <div className="mt-5 flex flex-wrap gap-3">
                  {TOUR_CITIES.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => {
                        setSelectedCity(city);
                        setSelectedCategory('all');
                      }}
                      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                        selectedCity === city
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white'
                          : 'bg-violet-50 text-slate-700 hover:bg-violet-100'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {websiteContent.categoryStepLabel}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {websiteContent.categoryStepTitle}
                </h2>
                <div className="mt-5 flex flex-wrap gap-3">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                        selectedCategory === category
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white'
                          : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                      }`}
                    >
                      {CATEGORY_LABELS[category] || category}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {cityContent.trustPoints.map((point) => (
              <div key={point} className="rounded-[26px] border border-violet-100 bg-white/90 p-5">
                <ShieldCheck className="h-5 w-5 text-violet-600" />
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{point}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {'The Tangier tours page keeps the same clean guided-tour structure and trust-first reading flow.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              {websiteContent.guidedEyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">
              {websiteContent.toursReadyTemplate
                .replace('{count}', String(filteredTours.length))
                .replace('{city}', selectedCity)}
            </h2>
          </div>
          <Link
            to={`/rent?city=${encodeURIComponent(selectedCity)}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 transition hover:text-violet-900"
          >
            {websiteContent.rentalsSwitchLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {filteredTours.map((tour) => (
            <article
              key={tour.id}
              className="overflow-hidden rounded-[30px] border border-violet-100 bg-white shadow-[0_18px_45px_rgba(79,70,229,0.05)]"
            >
              <div className="relative h-64 overflow-hidden">
                <img src={tour.image} alt={tour.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08)_0%,rgba(15,23,42,0.72)_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-100">
                        {tour.city}
                      </p>
                      <h3 className="mt-3 text-3xl font-semibold">{tour.title}</h3>
                    </div>
                    <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      {tour.category}
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-orange-100">{tour.routeName}</p>
                </div>
              </div>

              <div className="p-6">
                <p className="text-sm leading-6 text-slate-600">{tour.summary}</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Duration</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{tour.duration}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Group size</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{tour.groupSize}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Difficulty</p>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${DIFFICULTY_TONE[tour.difficulty] || 'bg-slate-100 text-slate-700'}`}>
                      {tour.difficulty}
                    </span>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Route stops</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tour.routeStops.map((stop) => (
                      <span
                        key={stop}
                        className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
                      >
                        {stop}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {tour.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">From</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">{tour.price} MAD</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      to={`/rent?city=${encodeURIComponent(selectedCity)}`}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
                    >
                      View rentals instead
                    </Link>
                    <Link
                      to={`/tour-booking?city=${encodeURIComponent(selectedCity)}&tour=${encodeURIComponent(tour.id)}`}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#7c3aed_0%,#4f46e5_100%)] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.01]"
                    >
                      Book guided tour
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {filteredTours.length === 0 && (
          <div className="rounded-[30px] border border-dashed border-violet-200 bg-white p-12 text-center">
            <Sunset className="mx-auto h-8 w-8 text-violet-500" />
            <h3 className="mt-4 text-2xl font-semibold text-slate-950">No tours match this city and filter yet</h3>
            <p className="mt-3 text-sm text-slate-600">
              Switch the city or go back to rentals while we expand the guided experiences in this region.
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                to={`/rent?city=${encodeURIComponent(selectedCity)}`}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Back to rentals
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Tours;
