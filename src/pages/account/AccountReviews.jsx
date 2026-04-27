import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, ShieldCheck, Star } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import AccountStatCard from '../../components/account/AccountStatCard';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { normalizeMarketplaceRequestLifecycleStatus } from '../../utils/marketplaceRequestState';

const formatDateTime = (value, locale = 'en') => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
};

const ReviewActivityRow = ({ item, tr, isFrench }) => {
  const locale = isFrench ? 'fr' : 'en';
  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{item.kindLabel}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{item.statusLabel}</span>
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-950">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Date', 'Date')}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateTime(item.at, locale) || '—'}</p>
        </div>
      </div>
    </article>
  );
};

const ReviewSection = ({ title, description, items, emptyTitle, emptyBody, emptyActionLabel, emptyActionTo, tr, isFrench }) => (
  <section className="space-y-4">
    <AccountWorkspaceSectionHeader title={title} description={description} />

    {items.length ? (
      <div className="space-y-4">
        {items.map((item) => (
          <ReviewActivityRow key={item.id} item={item} tr={tr} isFrench={isFrench} />
        ))}
      </div>
    ) : (
      <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/75 p-6">
        <p className="text-sm font-bold text-slate-900">{emptyTitle}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{emptyBody}</p>
        {emptyActionLabel && emptyActionTo ? (
          <Link
            to={emptyActionTo}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
          >
            <span>{emptyActionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    )}
  </section>
);

const AccountReviews = () => {
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [rentals, setRentals] = useState([]);
  const [marketplaceRequests, setMarketplaceRequests] = useState([]);

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
        const [accountSnapshot, rentalHistory, customerRequests] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user),
          CustomerExperienceService.getCustomerRentalHistory(user),
          CustomerExperienceService.getCustomerMarketplaceRequests(user),
        ]);

        if (cancelled) return;
        setSnapshot(accountSnapshot);
        setRentals(Array.isArray(rentalHistory) ? rentalHistory : []);
        setMarketplaceRequests(Array.isArray(customerRequests) ? customerRequests : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your reviews center right now.', 'Impossible de charger votre centre des avis pour le moment.'));
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

  const loyalty = snapshot?.loyalty || { tier: 'Standard', completedBookings: 0 };

  const rentalReviewReady = useMemo(
    () =>
      rentals
        .filter((rental) => ['completed', 'closed'].includes(String(rental?.status || '').toLowerCase()))
        .slice(0, 8)
        .map((rental) => ({
          id: `rental-${rental.id}`,
          kindLabel: tr('Rental', 'Location'),
          statusLabel: tr('Completed', 'Terminée'),
          title: rental?.modelName || tr('Completed rental', 'Location terminée'),
          subtitle: rental?.packageName || rental?.vehicleLabel || tr('Completed booking', 'Réservation terminée'),
          at: rental?.endDate || rental?.startDate || null,
        })),
    [rentals, isFrench]
  );

  const marketplaceReviewReady = useMemo(
    () =>
      marketplaceRequests
        .filter((request) => ['pre_approved', 'approved', 'completed', 'countered'].includes(normalizeMarketplaceRequestLifecycleStatus(request)))
        .slice(0, 8)
        .map((request) => ({
          id: `request-${request.id}`,
          kindLabel: tr('Request', 'Demande'),
          statusLabel: tr('Activity', 'Activité'),
          title: request?.listingTitle || tr('Vehicle request', 'Demande véhicule'),
          subtitle: tr('Owner response received', 'Réponse du propriétaire reçue'),
          at: request?.updatedAt || request?.createdAt || null,
        })),
    [marketplaceRequests, isFrench]
  );
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });
  const totalReviewCount = 0;
  const trustTierDescription = useMemo(() => {
    const tier = String(loyalty.tier || 'Standard').toLowerCase();
    if (tier.includes('gold')) return tr('Strong booking history', 'Historique de réservation solide');
    if (tier.includes('silver')) return tr('Growing trust', 'Confiance en progression');
    return tr('Complete rentals to build trust', 'Terminez des locations pour construire votre confiance');
  }, [loyalty.tier, tr]);
  const totalActivity = rentalReviewReady.length + marketplaceReviewReady.length;

  if (loading && !suppressBlockingLoader) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-amber-100 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#fff8ec_100%)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="h-6 w-28 animate-pulse rounded-full bg-amber-100" />
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
        eyebrow={tr('Reviews', 'Avis')}
        title={tr('Your reviews', 'Vos avis')}
        description={tr(
          totalReviewCount > 0
            ? `${totalReviewCount} ${tr('reviews so far', 'avis pour le moment')}`
            : tr('No reviews yet. Complete rentals to start building your reputation.', "Aucun avis pour le moment. Terminez des locations pour commencer à bâtir votre réputation."),
          totalReviewCount > 0
            ? `${totalReviewCount} ${tr('avis pour le moment', 'avis pour le moment')}`
            : tr('Aucun avis pour le moment. Terminez des locations pour commencer à bâtir votre réputation.', "Aucun avis pour le moment. Terminez des locations pour commencer à bâtir votre réputation.")
        )}
        className="border-amber-100 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#fff8ec_100%)]"
      />

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <AccountStatCard eyebrow={tr('Reviews', 'Avis')} value={totalReviewCount} label={tr('Current review count', "Nombre d'avis actuel")} tone="amber" />
        <AccountStatCard eyebrow={tr('Trust level', 'Niveau de confiance')} value={loyalty.tier || 'Standard'} label={trustTierDescription} tone="violet" />
        <AccountStatCard eyebrow={tr('Completed rentals', 'Locations terminées')} value={rentalReviewReady.length} label={tr('Reviews unlock after completion', 'Les avis se débloquent après la fin de location')} tone="emerald" />
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Progress', 'Progression')}</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {tr(`${rentalReviewReady.length} completed rentals`, `${rentalReviewReady.length} locations terminées`)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {tr('Reviews unlock after completion.', 'Les avis se débloquent après la fin de location.')}
            </p>
          </div>
          <Link
            to="/marketplace"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            {tr('Browse vehicles', 'Explorer les véhicules')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <ReviewSection
        title={tr('Recent activity', 'Activité récente')}
        description={tr('Your completed rentals and request history appear here.', 'Vos locations terminées et votre historique de demandes apparaissent ici.')}
        items={rentalReviewReady}
        emptyTitle={tr('No completed rentals yet', 'Aucune location terminée pour le moment')}
        emptyBody={tr('Complete your first rental to start building your review history.', 'Terminez votre première location pour commencer votre historique d’avis.')}
        emptyActionLabel={tr('Browse vehicles', 'Explorer les véhicules')}
        emptyActionTo="/marketplace"
        tr={tr}
        isFrench={isFrench}
      />

      {marketplaceReviewReady.length ? (
        <ReviewSection
          title={tr('Request activity', 'Activité des demandes')}
          description={tr('Your recent owner request history.', 'Votre historique récent de demandes auprès des propriétaires.')}
          items={marketplaceReviewReady}
          emptyTitle=""
          emptyBody=""
          tr={tr}
          isFrench={isFrench}
        />
      ) : null}
    </div>
  );
};

export default AccountReviews;
