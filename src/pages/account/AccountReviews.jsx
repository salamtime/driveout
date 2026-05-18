import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarClock, CarFront, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import AccountStatCard from '../../components/account/AccountStatCard';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { normalizeMarketplaceRequestLifecycleStatus } from '../../utils/marketplaceRequestState';
import { resolveManagedAccountType } from '../../utils/accountType';

const formatDateTime = (value, locale = 'en') => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
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

const ReputationEntryCard = ({ icon: Icon, eyebrow, title, description, ctaLabel, to, state }) => (
  <Link
    to={to}
    state={state}
    className="group rounded-[1.55rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition hover:border-violet-200 hover:shadow-[0_18px_40px_rgba(91,33,182,0.08)]"
  >
    <div className="flex items-start gap-3">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
        <h3 className="mt-2 text-base font-bold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-violet-700 transition group-hover:border-violet-200 group-hover:bg-violet-50">
      <span>{ctaLabel}</span>
      <ArrowRight className="h-4 w-4" />
    </div>
  </Link>
);

const AccountReviews = () => {
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const selectedPanel = useMemo(
    () => new URLSearchParams(location.search).get('panel') || '',
    [location.search]
  );
  const selectedVehicleId = useMemo(
    () => String(location.state?.vehicleId || new URLSearchParams(location.search).get('vehicleId') || '').trim(),
    [location.search, location.state?.vehicleId]
  );
  const selectedVehicleTitle = String(location.state?.vehicleTitle || '').trim();
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
  const managedAccountType = resolveManagedAccountType({
    account_type:
      snapshot?.profile?.accountType ||
      user?.user_metadata?.account_type ||
      user?.app_metadata?.account_type ||
      '',
    data_source:
      snapshot?.profile?.dataSource ||
      user?.user_metadata?.account_source ||
      user?.app_metadata?.account_source ||
      '',
  });
  const listingsHref = managedAccountType === 'customer' ? '/account/marketplace' : '/account/vehicles';
  const listingWorkspaceHref = selectedVehicleId && managedAccountType !== 'customer'
    ? `/account/vehicles/${encodeURIComponent(selectedVehicleId)}/profile?tab=listing`
    : listingsHref;

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
  const trustTierDescription = useMemo(() => {
    const tier = String(loyalty.tier || 'Standard').toLowerCase();
    if (tier.includes('gold')) return tr('Strong booking history', 'Historique de réservation solide');
    if (tier.includes('silver')) return tr('Growing trust', 'Confiance en progression');
    return tr('Complete rentals to build trust', 'Terminez des locations pour construire votre confiance');
  }, [loyalty.tier, tr]);
  const totalActivity = rentalReviewReady.length + marketplaceReviewReady.length;
  const totalReviewCount = Number(snapshot?.loyalty?.reviewCount || snapshot?.profile?.reviewCount || 0);
  const reputationEntries = useMemo(
    () => [
      {
        key: 'listings',
        icon: CarFront,
        eyebrow: tr('Listings', 'Annonces'),
        title: selectedPanel === 'vehicle' && selectedVehicleTitle
          ? selectedVehicleTitle
          : tr('Vehicle reviews', 'Avis vehicule'),
        description: selectedPanel === 'vehicle' && selectedVehicleTitle
          ? tr(
              'Return to this listing workspace to manage price, live status, and vehicle-facing review signals together.',
              "Revenez a cet espace annonce pour gerer prix, statut en ligne et signaux d'avis vehicule ensemble."
            )
          : tr(
              'Each vehicle keeps its own pricing, live status, and review context inside Listings.',
              'Chaque vehicule garde son propre contexte de prix, statut en ligne et avis dans Annonces.'
            ),
        ctaLabel: managedAccountType === 'customer' ? tr('Open marketplace', 'Ouvrir marketplace') : tr('Open listings', 'Ouvrir les annonces'),
        to: listingWorkspaceHref,
      },
      {
        key: 'trips',
        icon: CalendarClock,
        eyebrow: tr('Trips', 'Parcours'),
        title: tr('Trip feedback', 'Feedback de trajet'),
        description: tr(
          'Completed rentals and tours unlock the activity that builds up your review history over time.',
          'Les locations et tours termines debloquent l activite qui construit votre historique d avis dans le temps.'
        ),
        ctaLabel: tr('Open trips', 'Ouvrir les parcours'),
        to: '/account/rentals',
      },
      {
        key: 'account',
        icon: ShieldCheck,
        eyebrow: tr('Account', 'Compte'),
        title: tr('Trust & profile', 'Confiance et profil'),
        description: tr(
          'Identity approval and account details strengthen the trust signals attached to your reputation.',
          'L approbation d identite et les details du compte renforcent les signaux de confiance attaches a votre reputation.'
        ),
        ctaLabel: tr('Open account', 'Ouvrir le compte'),
        to: '/account/settings',
      },
    ],
    [listingWorkspaceHref, managedAccountType, selectedPanel, selectedVehicleTitle, tr]
  );

  const heroTitle = selectedPanel === 'vehicle' && selectedVehicleTitle
    ? tr('Vehicle reputation', 'Reputation du vehicule')
    : tr('Reputation', 'Reputation');
  const heroDescription = selectedPanel === 'vehicle' && selectedVehicleTitle
    ? tr(
        `${selectedVehicleTitle} lives inside Listings. Completed trips, listing quality, and trust signals all feed the reputation story you see here.`,
        `${selectedVehicleTitle} vit dans Annonces. Les trajets termines, la qualite de l annonce et les signaux de confiance alimentent la reputation visible ici.`
      )
    : tr(
        'Your reputation combines completed trips, listing activity, and trust signals across the account workspace.',
        'Votre reputation combine trajets termines, activite d annonce et signaux de confiance dans tout l espace compte.'
      );

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
        eyebrow={tr('Account', 'Compte')}
        title={heroTitle}
        description={heroDescription}
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
        <AccountStatCard eyebrow={tr('Reputation', 'Reputation')} value={totalActivity} label={tr('Visible reputation signals', 'Signaux de reputation visibles')} tone="amber" />
        <AccountStatCard eyebrow={tr('Trust level', 'Niveau de confiance')} value={loyalty.tier || 'Standard'} label={trustTierDescription} tone="violet" />
        <AccountStatCard eyebrow={tr('Completed trips', 'Trajets termines')} value={rentalReviewReady.length} label={tr('Trips unlock review activity over time', 'Les trajets debloquent l activite d avis dans le temps')} tone="emerald" />
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Reputation path', 'Parcours reputation')}</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {totalReviewCount > 0
                ? tr(`${totalReviewCount} published reviews`, `${totalReviewCount} avis publies`)
                : tr(`${rentalReviewReady.length} completed trips`, `${rentalReviewReady.length} trajets termines`)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {tr(
                'Trips, listing quality, and trust approval all reinforce reputation together.',
                'Les trajets, la qualite de l annonce et la validation de confiance renforcent ensemble la reputation.'
              )}
            </p>
          </div>
          <Link
            to={managedAccountType === 'customer' ? '/account/rentals' : listingWorkspaceHref}
            state={{ from: currentPath }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            {managedAccountType === 'customer' ? tr('Open trips', 'Ouvrir les parcours') : tr('Open listings', 'Ouvrir les annonces')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <AccountWorkspaceSectionHeader
          title={tr('Where reputation lives', 'Ou vit la reputation')}
          description={tr(
            'Reviews are no longer a separate destination. Use Listings for vehicle context, Trips for completed activity, and Account for trust signals.',
            'Les avis ne sont plus une destination separee. Utilisez Annonces pour le contexte vehicule, Parcours pour l activite terminee et Compte pour les signaux de confiance.'
          )}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {reputationEntries.map((entry) => (
            <ReputationEntryCard
              key={entry.key}
              icon={entry.icon}
              eyebrow={entry.eyebrow}
              title={entry.title}
              description={entry.description}
              ctaLabel={entry.ctaLabel}
              to={entry.to}
              state={{ from: currentPath }}
            />
          ))}
        </div>
      </section>

      <ReviewSection
        title={tr('Completed trip activity', 'Activite des trajets termines')}
        description={tr(
          'Completed trips are the clearest reputation signal today and will keep feeding your review history.',
          'Les trajets termines sont aujourd hui le signal de reputation le plus clair et continueront d alimenter votre historique.'
        )}
        items={rentalReviewReady}
        emptyTitle={tr('No completed trips yet', 'Aucun trajet termine pour le moment')}
        emptyBody={tr(
          'Complete your first rental or tour to start building visible reputation activity.',
          'Terminez votre premiere location ou votre premier tour pour commencer a construire une activite de reputation visible.'
        )}
        emptyActionLabel={tr('Open trips', 'Ouvrir les parcours')}
        emptyActionTo="/account/rentals"
        tr={tr}
        isFrench={isFrench}
      />

      {marketplaceReviewReady.length ? (
        <ReviewSection
          title={tr('Listing and request signals', 'Signaux d annonce et de demande')}
          description={tr(
            'Marketplace replies, request movement, and owner-side signals add context around your reputation story.',
            'Les reponses marketplace, l evolution des demandes et les signaux cote proprietaire ajoutent du contexte a votre histoire de reputation.'
          )}
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
