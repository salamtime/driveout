import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Compass, MapPinned, Users } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';

const STATUS_TONE_MAP = {
  scheduled: 'bg-sky-50 text-sky-700',
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-rose-50 text-rose-700',
  canceled: 'bg-rose-50 text-rose-700',
  no_show: 'bg-amber-50 text-amber-700',
  expired: 'bg-slate-100 text-slate-700',
};

const STATUS_LABELS = {
  scheduled: { en: 'Upcoming', fr: 'À venir' },
  active: { en: 'Active', fr: 'Actif' },
  completed: { en: 'Completed', fr: 'Terminé' },
  cancelled: { en: 'Cancelled', fr: 'Annulé' },
  canceled: { en: 'Cancelled', fr: 'Annulé' },
  no_show: { en: 'No-show', fr: 'Absent' },
  expired: { en: 'Expired', fr: 'Expiré' },
};

const formatDateTime = (value, locale) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  `${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', { maximumFractionDigits: 0 }).format(Number(amount || 0))} ${currencyCode}`;

const normalizeTourBucket = (tour, now) => {
  const status = String(tour?.status || '').toLowerCase();
  const startTime = tour?.scheduledFor instanceof Date ? tour.scheduledFor.getTime() : null;

  if (['cancelled', 'canceled', 'no_show', 'expired'].includes(status)) return 'canceled';
  if (status === 'completed') return 'past';
  if (status === 'active') return 'active';
  if (startTime && startTime >= now.getTime()) return 'upcoming';
  if (status === 'scheduled') return 'upcoming';
  return 'past';
};

const FeaturedTour = ({ tour, tr, isFrench, onOpenDetails }) => {
  if (!tour) return null;

  const locale = isFrench ? 'fr' : 'en';
  const statusKey = String(tour?.status || '').toLowerCase();
  const statusTone = STATUS_TONE_MAP[statusKey] || 'bg-sky-50 text-sky-700';
  const statusLabel = STATUS_LABELS[statusKey]?.[locale] || tr('Upcoming', 'À venir');
  const startLabel = formatDateTime(tour?.scheduledFor, locale);
  const endLabel = formatDateTime(tour?.scheduledEndAt, locale);

  return (
    <section className="rounded-[1.9rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-950">{tr('Next tour', 'Prochain tour')}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {tour?.operatorName || tr('Certified operator', 'Opérateur certifié')}
            </span>
          </div>
          <p className="mt-2 text-xl font-bold text-slate-950">{tour?.packageName || tr('Tour booking', 'Réservation de tour')}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {[tour?.groupId, tour?.routeType, tour?.location].filter(Boolean).join(' • ')}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {[startLabel, endLabel, tour?.operatorName].filter(Boolean).join(' • ')}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-slate-500">{tr('Total', 'Total')}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(tour?.totalAmount, 'MAD', locale)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Users className="h-3.5 w-3.5" />
          {tr(`${tour?.ridersCount || 1} rider(s)`, `${tour?.ridersCount || 1} participant(s)`)}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Compass className="h-3.5 w-3.5" />
          {tour?.guideName || tr('Guide assigned later', 'Guide assigné plus tard')}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Wallet className="h-3.5 w-3.5" />
          {tour?.remainingAmount > 0
            ? `${tr('Remaining', 'Restant')} • ${formatMoney(tour?.remainingAmount, 'MAD', locale)}`
            : `${tr('Paid', 'Payé')} • ${formatMoney(tour?.paidAmount, 'MAD', locale)}`}
        </span>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => onOpenDetails(tour)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
        >
          {tr('Open tour details', 'Ouvrir les détails du tour')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
};

const TourRow = ({ tour, tr, isFrench, onOpenDetails }) => {
  const locale = isFrench ? 'fr' : 'en';
  const statusKey = String(tour?.status || '').toLowerCase();
  const statusTone = STATUS_TONE_MAP[statusKey] || 'bg-slate-100 text-slate-700';
  const statusLabel = STATUS_LABELS[statusKey]?.[locale] || tour?.status || tr('Scheduled', 'Planifié');
  const startLabel = formatDateTime(tour?.scheduledFor, locale);
  const endLabel = formatDateTime(tour?.scheduledEndAt, locale);

  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
            <span className="text-xs font-semibold text-slate-500">{tour?.groupId}</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {tour?.operatorName || tr('Certified operator', 'Opérateur certifié')}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-bold text-slate-950">{tour?.packageName || tr('Tour package', 'Package tour')}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {[tour?.operatorName, tour?.routeType, tour?.location].filter(Boolean).join(' • ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
            <span>{tr('Start', 'Début')}: {startLabel || tr('Pending', 'En attente')}</span>
            <span>{tr('End', 'Fin')}: {endLabel || tr('Pending', 'En attente')}</span>
            <span>{tr('Guide', 'Guide')}: {tour?.guideName || tr('Assigned later', 'Assigné plus tard')}</span>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Tour total', 'Total tour')}</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(tour?.totalAmount, 'MAD', locale)}</p>
          <p className="mt-2 text-sm text-slate-600">
            {tour?.remainingAmount > 0
              ? `${tr('Remaining', 'Restant')} • ${formatMoney(tour?.remainingAmount, 'MAD', locale)}`
              : `${tr('Paid', 'Payé')} • ${formatMoney(tour?.paidAmount, 'MAD', locale)}`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Users className="h-3.5 w-3.5" />
          {tr(`${tour?.ridersCount || 1} rider(s)`, `${tour?.ridersCount || 1} participant(s)`)}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <CalendarClock className="h-3.5 w-3.5" />
          {tour?.durationHours > 0 ? tr(`${tour.durationHours}h route`, `Parcours ${tour.durationHours}h`) : tr('Scheduled route', 'Parcours planifié')}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <MapPinned className="h-3.5 w-3.5" />
          {tour?.location || tr('Meeting point shared later', 'Point de rendez-vous communiqué plus tard')}
        </span>
        <button
          type="button"
          onClick={() => onOpenDetails(tour)}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
        >
          {tr('View details', 'Voir les détails')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
};

const TourSection = ({ title, tours, emptyTitle, emptyBody, tr, isFrench, onOpenDetails }) => (
  <section className="space-y-4">
    <AccountWorkspaceSectionHeader title={title} />

    {tours.length ? (
      <div className="space-y-4">
        {tours.map((tour) => (
          <TourRow key={tour.id} tour={tour} tr={tr} isFrench={isFrench} onOpenDetails={onOpenDetails} />
        ))}
      </div>
    ) : (
      <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-6">
        <p className="text-sm font-bold text-slate-900">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyBody}</p>
      </div>
    )}
  </section>
);

const ToursEmptyState = ({ tr }) => (
  <section className="rounded-[1.9rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-7">
    <div className="flex items-start gap-4">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 shadow-[0_14px_28px_rgba(91,33,182,0.12)]">
        <Compass className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold text-slate-950">{tr('No tours yet', 'Aucun tour pour le moment')}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          {tr('Start with a tour that fits your next ride.', 'Commencez avec un tour qui correspond à votre prochaine sortie.')}
        </p>
        <div className="mt-4">
          <Link
            to="/tours"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
          >
            {tr('Browse tours', 'Parcourir les tours')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  </section>
);

const SuggestedTourCard = ({ tour, tr, isFrench, onOpenDetails }) => {
  const locale = isFrench ? 'fr' : 'en';

  return (
    <article className="rounded-[1.55rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <p className="text-lg font-bold text-slate-950">{tour?.packageName || tr('Tour booking', 'Réservation de tour')}</p>
      <p className="mt-2 text-sm text-slate-500">
        {[tour?.location, tour?.routeType].filter(Boolean).join(' • ') || tr('Tour experience', 'Expérience tour')}
      </p>
      <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatMoney(tour?.totalAmount, 'MAD', locale)}</p>
      <button
        type="button"
        onClick={() => onOpenDetails(tour)}
        className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
      >
        {tr('View tour', 'Voir le tour')}
        <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  );
};

const AccountTours = () => {
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tours, setTours] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const history = await CustomerExperienceService.getCustomerTourHistory(user);
        if (cancelled) return;
        setTours(Array.isArray(history) ? history : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your tours right now.', 'Impossible de charger vos tours pour le moment.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isFrench]);

  const tourBuckets = useMemo(() => {
    const now = new Date();
    return tours.reduce(
      (accumulator, tour) => {
        const bucket = normalizeTourBucket(tour, now);
        accumulator[bucket].push(tour);
        return accumulator;
      },
      { upcoming: [], active: [], past: [], canceled: [] }
    );
  }, [tours]);

  const activeAndUpcomingTours = [...tourBuckets.active, ...tourBuckets.upcoming];
  const featuredTour = activeAndUpcomingTours[0] || null;
  const suggestedTours = useMemo(
    () => [...tours]
      .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0).getTime() - new Date(a?.updatedAt || a?.createdAt || 0).getTime())
      .slice(0, 3),
    [tours]
  );
  const handleOpenDetails = (tour) => {
    if (!tour?.groupId) return;
    navigate(`/account/tours/${encodeURIComponent(String(tour.groupId))}`);
  };
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  if (loading && !suppressBlockingLoader) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.16),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_100%)] p-6 shadow-[0_24px_70px_rgba(76,29,149,0.08)] sm:p-8">
          <div className="h-6 w-28 animate-pulse rounded-full bg-violet-100" />
          <div className="mt-4 h-10 w-72 animate-pulse rounded-2xl bg-white/80" />
          <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded-full bg-white/80" />
        </section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-[1.75rem] border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountWorkspaceHero
        eyebrow={tr('My Tours', 'Mes tours')}
        title={tr('My Tours', 'Mes tours')}
        description={tr('Keep your next tour close and book the next one quickly.', 'Gardez votre prochain tour à portée de main et réservez le suivant rapidement.')}
        aside={
          <Link
            to="/tours"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
          >
            {tr('Browse tours', 'Parcourir les tours')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      {featuredTour ? <FeaturedTour tour={featuredTour} tr={tr} isFrench={isFrench} onOpenDetails={handleOpenDetails} /> : null}

      <section className="space-y-4">
        <AccountWorkspaceSectionHeader title={tr('Your tours', 'Vos tours')} />
        {activeAndUpcomingTours.length ? (
          <div className="space-y-4">
            {activeAndUpcomingTours.map((tour) => (
              <TourRow key={tour.id} tour={tour} tr={tr} isFrench={isFrench} onOpenDetails={handleOpenDetails} />
            ))}
          </div>
        ) : (
          <ToursEmptyState tr={tr} />
        )}
      </section>

      {suggestedTours.length ? (
        <section className="space-y-4">
          <AccountWorkspaceSectionHeader title={tr('Suggested tours', 'Tours suggérés')} />
          <div className="grid gap-4 lg:grid-cols-3">
            {suggestedTours.map((tour) => (
              <SuggestedTourCard key={tour.id} tour={tour} tr={tr} isFrench={isFrench} onOpenDetails={handleOpenDetails} />
            ))}
          </div>
        </section>
      ) : null}

      <TourSection
        title={tr('Past tours', 'Tours passés')}
        tours={tourBuckets.past}
        emptyTitle={tr('No past tours yet', 'Aucun tour passé pour le moment')}
        emptyBody={tr('Your completed tours will appear here.', 'Vos tours terminés apparaîtront ici.')}
        tr={tr}
        isFrench={isFrench}
        onOpenDetails={handleOpenDetails}
      />
    </div>
  );
};

export default AccountTours;
