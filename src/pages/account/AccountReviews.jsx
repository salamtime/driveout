import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, Camera, CarFront, Receipt, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import RentalReviewService from '../../services/RentalReviewService';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import RentalReviewComposer from '../../components/account/RentalReviewComposer';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { normalizeMarketplaceRequestLifecycleStatus } from '../../utils/marketplaceRequestState';
import { resolveManagedAccountType } from '../../utils/accountType';
import { resolveReturnPath } from '../../utils/navigationReturn';

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

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const getRentalMediaCount = (rental) => {
  const ownerExecution = rental?.ownerExecution || rental?.owner_execution || {};
  const handoffPhotos = Array.isArray(ownerExecution?.handoffPhotos) ? ownerExecution.handoffPhotos.length : 0;
  const returnPhotos = Array.isArray(ownerExecution?.returnPhotos) ? ownerExecution.returnPhotos.length : 0;
  return handoffPhotos + returnPhotos;
};

const getCompletedTripTitle = (rental, tr) =>
  String(
    rental?.modelName ||
    rental?.vehicleName ||
    rental?.vehicleLabel ||
    ''
  ).trim() || tr('Completed rental', 'Location terminee');

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
          {item.subtitle ? <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p> : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Date', 'Date')}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateTime(item.at, locale) || '—'}</p>
        </div>
      </div>
      {item.to ? (
        <Link
          to={item.to}
          state={item.state}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
        >
          <span>{item.ctaLabel || tr('Open trip', 'Ouvrir le trajet')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </article>
  );
};

const ReviewSection = ({ title, items, emptyTitle, emptyActionLabel, emptyActionTo, tr, isFrench }) => (
  <section className="space-y-4">
    <AccountWorkspaceSectionHeader title={title} />

    {items.length ? (
      <div className="space-y-4">
        {items.map((item) => (
          <ReviewActivityRow key={item.id} item={item} tr={tr} isFrench={isFrench} />
        ))}
      </div>
    ) : (
      <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/75 p-6">
        <p className="text-sm font-bold text-slate-900">{emptyTitle}</p>
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

const CompletedTripCard = ({ rental, tr, isFrench, currentPath }) => {
  const locale = isFrench ? 'fr' : 'en';
  const title = getCompletedTripTitle(rental, tr);
  const startLabel = formatDateTime(rental?.startDate, locale);
  const endLabel = formatDateTime(rental?.endDate, locale);
  const dateLabel = [startLabel, endLabel].filter(Boolean).join(' -> ') || tr('Dates unavailable', 'Dates indisponibles');
  const receiptLink = String(rental?.documentLinks?.receipt || '').trim();
  const mediaCount = getRentalMediaCount(rental);
  const total = formatMoney(rental?.total, 'MAD', locale);
  const detailPath = rental?.id ? `/account/rentals/${encodeURIComponent(String(rental.id))}` : '/account/rentals';

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:rounded-[1.75rem]">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              {tr('Completed', 'Terminee')}
            </span>
            <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
              {rental?.rentalId || tr('Reference pending', 'Reference en attente')}
            </span>
            {mediaCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                <Camera className="h-3.5 w-3.5" />
                {tr(`${mediaCount} media`, `${mediaCount} media`)}
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-lg font-black tracking-[-0.03em] text-slate-950 sm:text-xl">{title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">{dateLabel}</p>
          {rental?.packageName || rental?.selectedPackageName ? (
            <p className="mt-2 text-sm font-semibold text-slate-700">{rental.packageName || rental.selectedPackageName}</p>
          ) : null}
        </div>

        <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-3 lg:min-w-[160px] lg:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tr('Total', 'Total')}</p>
          <p className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950 sm:text-2xl">{total}</p>
          <p className="mt-1 text-xs font-bold text-emerald-700">{tr('Paid', 'Paye')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
        <Link
          to={detailPath}
          state={{ from: currentPath }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(91,33,182,0.22)] transition hover:bg-violet-700"
        >
          {tr('View details', 'Voir details')}
          <ArrowRight className="h-4 w-4" />
        </Link>
        {receiptLink ? (
          <a
            href={receiptLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
          >
            <Receipt className="h-4 w-4" />
            {tr('Open receipt', 'Ouvrir recu')}
          </a>
        ) : null}
      </div>
    </article>
  );
};

const CompletedTripActivitySection = ({ rentals, tr, isFrench, currentPath }) => (
  <section className="space-y-4">
    <AccountWorkspaceSectionHeader title={tr('Completed trips', 'Trajets termines')} />

    {rentals.length ? (
      <div className="space-y-4">
        {rentals.map((rental) => (
          <CompletedTripCard
            key={rental.id}
            rental={rental}
            tr={tr}
            isFrench={isFrench}
            currentPath={currentPath}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/75 p-6">
        <p className="text-sm font-bold text-slate-900">{tr('No completed trips yet', 'Aucun trajet termine pour le moment')}</p>
        <Link
          to="/account/rentals"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
        >
          <span>{tr('Open trips', 'Ouvrir les parcours')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )}
  </section>
);

const ReputationSourceLink = ({ icon: Icon, title, ctaLabel, to, state }) => (
  <Link
    to={to}
    state={state}
    className="group flex items-center justify-between gap-4 border-t border-slate-100 py-4 first:border-t-0"
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold text-slate-950">{title}</h3>
        <p className="mt-0.5 text-xs font-semibold text-violet-700">{ctaLabel}</p>
      </div>
    </div>
    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
  </Link>
);

const ReputationSummaryStrip = ({ metrics, sources, tr, currentPath }) => (
  <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:rounded-[2rem] sm:p-6">
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div>
        <div className="grid overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-3">
          {metrics.map((metric, index) => (
            <div
              key={metric.key}
              className={`bg-slate-50 px-4 py-4 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}
            >
              <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 px-4">
        <div className="border-b border-slate-100 py-3">
          <p className="text-sm font-bold text-slate-950">{tr('Sources', 'Sources')}</p>
        </div>
        {sources.map((entry) => (
          <ReputationSourceLink
            key={entry.key}
            icon={entry.icon}
            title={entry.title}
            ctaLabel={entry.ctaLabel}
            to={entry.to}
            state={{ from: currentPath }}
          />
        ))}
      </div>
    </div>
  </section>
);

const AccountReviews = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const backLink = useMemo(() => resolveReturnPath(location, '/account/settings'), [location]);
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
  const [pendingReviewTasks, setPendingReviewTasks] = useState([]);
  const [submittedReviews, setSubmittedReviews] = useState([]);
  const [receivedReviews, setReceivedReviews] = useState([]);

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
        const [accountSnapshot, rentalHistory, customerRequests, pendingReviewsResponse, reviewHistoryResponse] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user),
          CustomerExperienceService.getCustomerRentalHistory(user),
          CustomerExperienceService.getCustomerMarketplaceRequests(user),
          RentalReviewService.getPendingReviews(),
          RentalReviewService.getReviewHistory(),
        ]);

        if (cancelled) return;
        setSnapshot(accountSnapshot);
        setRentals(Array.isArray(rentalHistory) ? rentalHistory : []);
        setMarketplaceRequests(Array.isArray(customerRequests) ? customerRequests : []);
        setPendingReviewTasks(Array.isArray(pendingReviewsResponse?.tasks) ? pendingReviewsResponse.tasks : []);
        setSubmittedReviews(Array.isArray(reviewHistoryResponse?.submitted) ? reviewHistoryResponse.submitted : []);
        setReceivedReviews(Array.isArray(reviewHistoryResponse?.received) ? reviewHistoryResponse.received : []);
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

  const completedTripRentals = useMemo(
    () =>
      rentals
        .filter((rental) => ['completed', 'closed'].includes(String(rental?.status || '').toLowerCase()))
        .slice(0, 12),
    [rentals]
  );

  const completedRentalLookup = useMemo(
    () =>
      completedTripRentals.reduce((acc, rental) => {
        acc[String(rental?.id || '').trim()] = rental;
        return acc;
      }, {}),
    [completedTripRentals]
  );

  const pendingReviewCards = useMemo(
    () =>
      pendingReviewTasks.map((task) => {
        const linkedRental = completedRentalLookup[String(task?.rentalId || '').trim()] || null;
        return {
          ...task,
          linkedRental,
          title:
            linkedRental?.modelName ||
            linkedRental?.vehicleLabel ||
            task?.rentalLabel ||
            tr('Completed rental', 'Location terminée'),
          subtitle:
            task?.revieweeRole === 'owner'
              ? tr('Share your experience with this owner.', 'Partagez votre expérience avec ce propriétaire.')
              : tr('Leave an internal note for this customer.', 'Laissez une note interne pour ce client.'),
        };
      }),
    [completedRentalLookup, pendingReviewTasks, tr]
  );

  const rentalReviewReady = useMemo(
    () =>
      completedTripRentals
        .map((rental) => ({
          id: `rental-${rental.id}`,
          kindLabel: tr('Rental', 'Location'),
          statusLabel: tr('Completed', 'Terminée'),
          title: rental?.modelName || tr('Completed rental', 'Location terminée'),
          subtitle: rental?.packageName || rental?.vehicleLabel || '',
          at: rental?.endDate || rental?.startDate || null,
          to: rental?.id ? `/account/rentals/${encodeURIComponent(String(rental.id))}` : '',
          state: { from: currentPath },
          ctaLabel: tr('Open trip', 'Ouvrir le trajet'),
        })),
    [completedTripRentals, currentPath, isFrench]
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
          subtitle: '',
          at: request?.updatedAt || request?.createdAt || null,
        })),
    [marketplaceRequests, isFrench]
  );
  const submittedReviewItems = useMemo(
    () =>
      submittedReviews.slice(0, 8).map((review) => ({
        id: `submitted-${review.id}`,
        kindLabel: tr('Sent', 'Envoyé'),
        statusLabel: String(review?.review_status || 'published'),
        title: tr('Your review', 'Votre avis'),
        subtitle: review?.comment || tr('No written comment', 'Pas de commentaire écrit'),
        at: review?.published_at || review?.created_at || null,
      })),
    [submittedReviews, tr]
  );
  const receivedReviewItems = useMemo(
    () =>
      receivedReviews
        .filter((review) => String(review?.visibility || '') === 'public' || String(review?.reviewee_role || '') === 'customer')
        .slice(0, 8)
        .map((review) => ({
          id: `received-${review.id}`,
          kindLabel: tr('Received', 'Reçu'),
          statusLabel: `${Number(review?.rating || 0).toFixed(1)}★`,
          title:
            String(review?.reviewee_role || '') === 'owner'
              ? tr('Public owner review', 'Avis public propriétaire')
              : tr('Internal customer review', 'Avis interne client'),
          subtitle: review?.comment || tr('No written comment', 'Pas de commentaire écrit'),
          at: review?.published_at || review?.created_at || null,
        })),
    [receivedReviews, tr]
  );
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });
  const totalActivity = rentalReviewReady.length + marketplaceReviewReady.length + submittedReviewItems.length + receivedReviewItems.length;
  const reputationEntries = useMemo(
    () => [
      {
        key: 'listings',
        icon: CarFront,
        title: selectedPanel === 'vehicle' && selectedVehicleTitle
          ? selectedVehicleTitle
          : tr('Vehicle reviews', 'Avis vehicule'),
        ctaLabel: managedAccountType === 'customer' ? tr('Open marketplace', 'Ouvrir marketplace') : tr('Open listings', 'Ouvrir les annonces'),
        to: listingWorkspaceHref,
      },
      {
        key: 'trips',
        icon: CalendarClock,
        title: tr('Trip feedback', 'Feedback de trajet'),
        ctaLabel: tr('Open trips', 'Ouvrir les parcours'),
        to: '/account/rentals',
      },
      {
        key: 'account',
        icon: ShieldCheck,
        title: tr('Trust & profile', 'Confiance et profil'),
        ctaLabel: tr('Open account', 'Ouvrir le compte'),
        to: '/account/settings',
      },
    ],
    [listingWorkspaceHref, managedAccountType, selectedPanel, selectedVehicleTitle, tr]
  );
  const reputationMetrics = useMemo(
    () => [
      {
        key: 'activity',
        label: tr('Signals', 'Signaux'),
        value: totalActivity,
      },
      {
        key: 'pending',
        label: tr('Pending', 'En attente'),
        value: pendingReviewCards.length,
      },
      {
        key: 'trust',
        label: tr('Trust', 'Confiance'),
        value: loyalty.tier || 'Standard',
      },
      {
        key: 'trips',
        label: tr('Trips', 'Trajets'),
        value: rentalReviewReady.length,
      },
    ],
    [loyalty.tier, pendingReviewCards.length, rentalReviewReady.length, totalActivity, tr]
  );

  const heroTitle = selectedPanel === 'vehicle' && selectedVehicleTitle
    ? tr('Vehicle reputation', 'Reputation du vehicule')
    : tr('Reputation', 'Reputation');
  const heroDescription = pendingReviewCards.length
    ? tr(
        `${pendingReviewCards.length} completed rental review${pendingReviewCards.length > 1 ? 's are' : ' is'} waiting on you right now.`,
        `${pendingReviewCards.length} avis de location terminée ${pendingReviewCards.length > 1 ? 'vous attendent' : 'vous attend'} en ce moment.`
      )
    : tr(
        'Your public ratings, internal trust notes, and completed trip review history live here.',
        'Vos notes publiques, vos notes internes de confiance et votre historique d’avis de trajets terminés se trouvent ici.'
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
      {location.state?.from ? (
        <button
          type="button"
          onClick={() => navigate(backLink)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {tr('Back', 'Retour')}
        </button>
      ) : null}

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

      <ReputationSummaryStrip
        metrics={reputationMetrics}
        sources={reputationEntries}
        tr={tr}
        currentPath={currentPath}
      />

      <section className="space-y-4">
        <AccountWorkspaceSectionHeader
          title={tr('Pending reviews', 'Avis en attente')}
          subtitle={tr(
            'Completed rentals waiting for your rating.',
            'Locations terminées en attente de votre note.'
          )}
        />

        {pendingReviewCards.length ? (
          <div className="space-y-4">
            {pendingReviewCards.map((task) => (
              <RentalReviewComposer
                key={`${task.rentalId}-${task.revieweeUserId}-${task.reviewerRole}`}
                task={task}
                tr={tr}
                defaultExpanded={pendingReviewCards.length === 1}
                onSubmitted={(_, submittedTask) => {
                  setPendingReviewTasks((current) =>
                    current.filter((row) => !(
                      String(row?.rentalId || '') === String(submittedTask?.rentalId || '') &&
                      String(row?.revieweeUserId || '') === String(submittedTask?.revieweeUserId || '') &&
                      String(row?.reviewerRole || '') === String(submittedTask?.reviewerRole || '')
                    ))
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/75 p-6">
            <p className="text-sm font-bold text-slate-900">
              {tr('No reviews are waiting right now.', 'Aucun avis n’attend votre action pour le moment.')}
            </p>
          </div>
        )}
      </section>

      <CompletedTripActivitySection
        rentals={completedTripRentals}
        tr={tr}
        isFrench={isFrench}
        currentPath={currentPath}
      />

      {submittedReviewItems.length ? (
        <ReviewSection
          title={tr('Reviews you sent', 'Avis envoyés')}
          items={submittedReviewItems}
          emptyTitle=""
          tr={tr}
          isFrench={isFrench}
        />
      ) : null}

      {receivedReviewItems.length ? (
        <ReviewSection
          title={tr('Reviews received', 'Avis reçus')}
          items={receivedReviewItems}
          emptyTitle=""
          tr={tr}
          isFrench={isFrench}
        />
      ) : null}

      {marketplaceReviewReady.length ? (
        <ReviewSection
          title={tr('Other activity', 'Autre activite')}
          items={marketplaceReviewReady}
          emptyTitle=""
          tr={tr}
          isFrench={isFrench}
        />
      ) : null}
    </div>
  );
};

export default AccountReviews;
