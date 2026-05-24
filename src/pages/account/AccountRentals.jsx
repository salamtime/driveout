import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Camera, CarFront, ChevronDown, MapPinned, MessageSquare, Receipt, Users } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import CustomerRentalTimer from '../../components/account/CustomerRentalTimer';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { getCurrentLocationPath } from '../../utils/navigationReturn';
import {
  canCustomerConfirmMarketplaceRequest,
  canSendMarketplaceRequestReminder,
  formatMarketplaceHoldCountdown,
  getMarketplaceApprovalHoldState,
  getMarketplaceMoneyBreakdown,
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  isMarketplaceRequestOpen,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../../utils/marketplaceRequestState';
import { buildMarketplaceBookingConfirmWhatsappHref } from '../../utils/marketplaceBookingLinks';
import {
  getRentalBucket,
  getRentalDepositSummaryLabel,
  getRentalPaymentSummaryLabel,
  getRentalThreadPresentation,
} from '../../utils/rentalThreadState';

const REQUEST_STATUS_TONE_MAP = {
  pending: 'bg-amber-50 text-amber-700',
  pre_approved: 'bg-sky-50 text-sky-700',
  approved: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-rose-50 text-rose-700',
  countered: 'bg-violet-50 text-violet-700',
  completed: 'bg-slate-100 text-slate-700',
  expired: 'bg-slate-100 text-slate-700',
};

const REQUEST_STATUS_LABELS = {
  pending: { en: 'Request sent', fr: 'Demande envoyée' },
  pre_approved: { en: 'Approved by owner', fr: 'Approuvée par le propriétaire' },
  approved: { en: 'Booking confirmed', fr: 'Réservation confirmée' },
  declined: { en: 'Declined', fr: 'Refusée' },
  countered: { en: 'Counter-offer', fr: 'Contre-offre' },
  completed: { en: 'Completed', fr: 'Terminée' },
  expired: { en: 'Expired', fr: 'Expirée' },
};

const TOUR_STATUS_TONE_MAP = {
  scheduled: 'bg-sky-50 text-sky-700',
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-rose-50 text-rose-700',
  canceled: 'bg-rose-50 text-rose-700',
  no_show: 'bg-amber-50 text-amber-700',
  expired: 'bg-slate-100 text-slate-700',
};

const TOUR_STATUS_LABELS = {
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
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

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


const getRentalPackageLabel = (rental, tr) =>
  rental?.selectedPackageName ||
  rental?.packageName ||
  rental?.packageLabel ||
  tr('Certified company booking', 'Réservation entreprise certifiée');

const getRentalReceiptLink = (rental) => String(rental?.documentLinks?.receipt || '').trim();

const getRentalMediaCount = (rental) => {
  const handoffPhotos = Array.isArray(rental?.ownerExecution?.handoffPhotos) ? rental.ownerExecution.handoffPhotos.length : 0;
  const returnPhotos = Array.isArray(rental?.ownerExecution?.returnPhotos) ? rental.ownerExecution.returnPhotos.length : 0;
  return handoffPhotos + returnPhotos;
};

const MoneyLine = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className={strong ? 'font-semibold text-slate-900' : 'text-slate-500'}>{label}</span>
    <span className={strong ? 'font-semibold text-slate-950' : 'font-semibold text-slate-700'}>{value}</span>
  </div>
);

const HoldTimerChip = ({ urgency = 'normal', countdownLabel = '00:00', tr }) => (
  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
    urgency === 'critical'
      ? 'bg-amber-100 text-amber-800'
      : urgency === 'low'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-violet-50 text-violet-700'
  }`}>
    {tr('Held for', 'Maintenue pendant')} {countdownLabel}
  </span>
);

const FeaturedUpcomingRental = ({ rental, tr, isFrench, onOpenDetails }) => {
  if (!rental) return null;

  const locale = isFrench ? 'fr' : 'en';
  const startLabel = formatDateTime(rental?.startDate, locale);
  const endLabel = formatDateTime(rental?.endDate, locale);
  const rentalPresentation = getRentalThreadPresentation(rental, rental?.timelineEvents || rental?.timeline_events || [], { isFrench, tr });
  const statusLabel = rentalPresentation.label || rental?.status || tr('Upcoming', 'À venir');
  const statusTone = rentalPresentation.badgeClassName || 'bg-sky-50 text-sky-700';
  const isLiveRental = ['active', 'return_due'].includes(rentalPresentation.stage);
  const marketplaceRequestId = rental?.raw?.marketplace_request_id || null;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="rounded-[1.9rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-950">{tr('Next booking', 'Prochaine réservation')}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
          </div>
          <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-950">
            {rental?.modelName || tr('Vehicle reserved', 'Véhicule réservé')}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {[startLabel, endLabel].filter(Boolean).join(' → ') || tr('Dates pending', 'Dates en attente')}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {rental?.quantityLabel || tr('Scheduled trip', 'Trajet planifié')}
          </p>
          {isLiveRental ? (
            <div className="mt-3">
              <CustomerRentalTimer rental={rental} />
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-right shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-slate-500">{tr('Total', 'Total')}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(rental?.total, 'MAD', locale)}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {isLiveRental && marketplaceRequestId ? (
          <Link
            to={`/account/messages?requestId=${encodeURIComponent(String(marketplaceRequestId))}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.3)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_36px_rgba(91,33,182,0.32)]"
          >
            {tr('Chat', 'Chat')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onOpenDetails(rental)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.3)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_36px_rgba(91,33,182,0.32)]"
          >
            {tr('View details', 'Voir les détails')}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDetails((current) => !current)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
        >
          {tr('View details', 'Voir les détails')}
        </button>
      </div>

      {showDetails ? (
        <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
          <div className="space-y-2">
            <MoneyLine label={tr('Package', 'Forfait')} value={getRentalPackageLabel(rental, tr)} />
            <MoneyLine label={tr('Payment', 'Paiement')} value={getRentalPaymentSummaryLabel(rental, { isFrench, tr, locale })} />
            <MoneyLine label={tr('Deposit', 'Caution')} value={getRentalDepositSummaryLabel(rental, { isFrench, tr, locale })} />
          </div>
        </div>
      ) : null}
    </section>
  );
};

const RentalRow = ({ rental, tr, isFrench, onOpenDetails, historyMode = false }) => {
  const locale = isFrench ? 'fr' : 'en';
  const rentalPresentation = getRentalThreadPresentation(rental, rental?.timelineEvents || rental?.timeline_events || [], { isFrench, tr });
  const statusLabel = rentalPresentation.label || rental?.status || tr('Unknown', 'Inconnu');
  const statusTone = rentalPresentation.badgeClassName || 'bg-slate-100 text-slate-700';
  const startLabel = formatDateTime(rental?.startDate, locale);
  const endLabel = formatDateTime(rental?.endDate, locale);
  const isLiveRental = ['active', 'return_due'].includes(rentalPresentation.stage);
  const marketplaceRequestId = rental?.raw?.marketplace_request_id || null;
  const receiptLink = getRentalReceiptLink(rental);
  const mediaCount = getRentalMediaCount(rental);
  const paymentSummary = getRentalPaymentSummaryLabel(rental, { isFrench, tr, locale });
  const depositSummary = getRentalDepositSummaryLabel(rental, { isFrench, tr, locale });
  const [showDetails, setShowDetails] = useState(false);

  if (historyMode) {
    return (
      <article className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-950">{rental?.modelName || tr('Vehicle reserved', 'Véhicule réservé')}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {[startLabel, endLabel].filter(Boolean).join(' → ') || tr('Dates pending', 'Dates en attente')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700">
                {rental?.rentalId || tr('Reference pending', 'Référence en attente')}
              </span>
              {receiptLink ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  {tr('Receipt ready', 'Reçu prêt')}
                </span>
              ) : null}
              {mediaCount > 0 ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {tr(`${mediaCount} media`, `${mediaCount} média`)}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">{paymentSummary}</p>
            <p className="mt-1 text-sm text-slate-500">{depositSummary}</p>
          </div>

          <div className="text-left sm:min-w-[140px] sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Total', 'Total')}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{formatMoney(rental?.total, 'MAD', locale)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
          {receiptLink ? (
            <a
              href={receiptLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Receipt className="h-4 w-4" />
              {tr('Open receipt', 'Ouvrir le reçu')}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenDetails(rental)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
          >
            {tr('View details', 'Voir les détails')}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
            <span className="text-xs font-semibold text-slate-500">
              {rental?.rentalId || tr('Rental reference pending', 'Référence location en attente')}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-bold text-slate-950">{rental?.modelName || tr('Vehicle reserved', 'Véhicule réservé')}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {[startLabel, endLabel].filter(Boolean).join(' → ') || tr('Dates pending', 'Dates en attente')}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {rental?.quantityLabel || tr('Scheduled trip', 'Trajet planifié')}
          </p>
          {isLiveRental ? (
            <div className="mt-3">
              <CustomerRentalTimer rental={rental} />
            </div>
          ) : null}
        </div>

        <div className="text-left sm:min-w-[150px] sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Total', 'Total')}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{formatMoney(rental?.total, 'MAD', locale)}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {isLiveRental && marketplaceRequestId ? (
          <Link
            to={`/account/messages?requestId=${encodeURIComponent(String(marketplaceRequestId))}`}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)]"
          >
            {tr('Chat', 'Chat')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onOpenDetails(rental)}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)]"
          >
            {tr('View details', 'Voir les détails')}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDetails((current) => !current)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
        >
          {tr('View details', 'Voir les détails')}
        </button>
      </div>

      {showDetails ? (
        <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
          <div className="space-y-2">
            <MoneyLine label={tr('Package', 'Forfait')} value={getRentalPackageLabel(rental, tr)} />
            <MoneyLine label={tr('Payment', 'Paiement')} value={getRentalPaymentSummaryLabel(rental, { isFrench, tr, locale })} />
            <MoneyLine label={tr('Deposit', 'Caution')} value={getRentalDepositSummaryLabel(rental, { isFrench, tr, locale })} />
          </div>
        </div>
      ) : null}
    </article>
  );
};

const RentalSection = ({
  title,
  description,
  rentals,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  emptyActionTo,
  emptyActionState,
  tr,
  isFrench,
  onOpenDetails,
  compact = false,
}) => (
  <section className={compact ? 'space-y-3' : 'space-y-4'}>
    <AccountWorkspaceSectionHeader
      title={title}
      description={description || undefined}
      titleClassName={compact ? 'mt-1 text-base font-bold text-slate-900' : undefined}
      descriptionClassName={compact ? 'mt-1 text-sm text-slate-500' : undefined}
    />

    {rentals.length ? (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        {rentals.map((rental) => (
          <RentalRow key={rental.id} rental={rental} tr={tr} isFrench={isFrench} onOpenDetails={onOpenDetails} historyMode={compact} />
        ))}
      </div>
    ) : (
      <div
        className={
          compact
            ? 'rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4'
            : 'rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-6'
        }
      >
        <p className="text-sm font-bold text-slate-900">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyBody}</p>
        {emptyActionLabel && emptyActionTo ? (
          <Link
            to={emptyActionTo}
            state={emptyActionState}
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

const RentalHistorySection = ({ pastRentals, canceledRentals, tr, isFrench, onOpenDetails, browseState, sectionRef = null }) => {
  const hasHistory = pastRentals.length > 0 || canceledRentals.length > 0;
  const historyRentals = [...pastRentals, ...canceledRentals];

  if (!hasHistory) {
    return (
      <section className="space-y-4">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5">
          <p className="text-sm font-bold text-slate-900">{tr('No rental history yet', 'Aucun historique pour le moment')}</p>
          <p className="mt-1 text-sm text-slate-500">
            {tr('Your past rentals will appear here once a trip is complete.', 'Vos locations passées apparaîtront ici une fois un trajet terminé.')}
          </p>
          <Link
            to="/marketplace"
            state={browseState}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
          >
            <span>{tr('Browse vehicles', 'Explorer les véhicules')}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="space-y-5">
      <AccountWorkspaceSectionHeader
        title={tr('Rental history', 'Historique location')}
        description={tr('Open any completed trip to review the receipt, media, and final status.', 'Ouvrez n’importe quelle location terminée pour revoir le reçu, les médias et le statut final.')}
        titleClassName="mt-1 text-lg font-bold text-slate-900"
      />

      <div className="space-y-3">
        {historyRentals.map((rental) => (
          <RentalRow
            key={`history-${rental.id}`}
            rental={rental}
            tr={tr}
            isFrench={isFrench}
            onOpenDetails={onOpenDetails}
            historyMode
          />
        ))}
      </div>
    </section>
  );
};

const TourTripRow = ({ tour, tr, isFrench, onOpenDetails, historyMode = false }) => {
  const locale = isFrench ? 'fr' : 'en';
  const statusKey = String(tour?.status || '').toLowerCase();
  const statusTone = TOUR_STATUS_TONE_MAP[statusKey] || 'bg-slate-100 text-slate-700';
  const statusLabel = TOUR_STATUS_LABELS[statusKey]?.[locale] || tour?.status || tr('Scheduled', 'Planifié');
  const startLabel = formatDateTime(tour?.scheduledFor, locale);
  const endLabel = formatDateTime(tour?.scheduledEndAt, locale);

  return (
    <article
      className={
        historyMode
          ? 'rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
          : 'rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
            <span className="text-xs font-semibold text-slate-500">
              {tour?.groupId || tour?.id || tr('Tour reference pending', 'Référence tour en attente')}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-bold text-slate-950">
            {tour?.packageName || tr('Tour booking', 'Réservation de tour')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {[tour?.operatorName, tour?.routeType, tour?.location].filter(Boolean).join(' • ')}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {[startLabel, endLabel].filter(Boolean).join(' → ') || tr('Schedule pending', 'Planning en attente')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5" />
              {tr(`${tour?.ridersCount || 1} rider(s)`, `${tour?.ridersCount || 1} participant(s)`)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              <MapPinned className="h-3.5 w-3.5" />
              {tour?.location || tr('Meeting point later', 'Point de rendez-vous plus tard')}
            </span>
          </div>
        </div>

        <div className="text-left sm:min-w-[150px] sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Tour total', 'Total tour')}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{formatMoney(tour?.totalAmount, 'MAD', locale)}</p>
          <p className="mt-2 text-sm text-slate-600">
            {tour?.remainingAmount > 0
              ? `${tr('Remaining', 'Restant')} • ${formatMoney(tour?.remainingAmount, 'MAD', locale)}`
              : `${tr('Paid', 'Payé')} • ${formatMoney(tour?.paidAmount, 'MAD', locale)}`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onOpenDetails(tour)}
          className={
            historyMode
              ? 'inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700'
              : 'inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)]'
          }
        >
          {tr('View tour', 'Voir le tour')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
};

const TourTripSection = ({
  title,
  description,
  tours,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  emptyActionTo,
  tr,
  isFrench,
  onOpenDetails,
  compact = false,
}) => (
  <section className={compact ? 'space-y-3' : 'space-y-4'}>
    <AccountWorkspaceSectionHeader
      title={title}
      description={description || undefined}
      titleClassName={compact ? 'mt-1 text-base font-bold text-slate-900' : undefined}
      descriptionClassName={compact ? 'mt-1 text-sm text-slate-500' : undefined}
    />

    {tours.length ? (
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        {tours.map((tour) => (
          <TourTripRow
            key={tour.id || tour.groupId}
            tour={tour}
            tr={tr}
            isFrench={isFrench}
            onOpenDetails={onOpenDetails}
            historyMode={compact}
          />
        ))}
      </div>
    ) : (
      <div
        className={
          compact
            ? 'rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4'
            : 'rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-6'
        }
      >
        <p className="text-sm font-bold text-slate-900">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyBody}</p>
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

const MarketplaceRequestRow = ({
  request,
  tr,
  isFrench,
  walletBalance = 0,
  onConfirmRequest,
  onOpenRequestDetails,
  confirmingRequestId = '',
}) => {
  const locale = isFrench ? 'fr' : 'en';
  const statusKey = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
  const displayState = getMarketplaceRequestDisplay(statusKey, tr);
  const statusLabel = REQUEST_STATUS_LABELS[statusKey]?.[locale] || displayState.label || request?.requestStatus || tr('Pending', 'En attente');
  const statusTone = REQUEST_STATUS_TONE_MAP[statusKey] || displayState.tone || 'bg-slate-100 text-slate-700';
  const startLabel = formatDateTime(request?.requestedStartAt, locale);
  const endLabel = formatDateTime(request?.requestedEndAt, locale);
  const requestDuration = Math.max(1, Number(request?.duration || 1));
  const money = getMarketplaceMoneyBreakdown({
    estimatedAmount: request?.estimatedAmount,
    commissionAmount: request?.commissionAmount,
  });
  const damageDepositAmount = Math.max(0, Number(request?.damageDepositAmount || request?.depositAmount || 0));
  const commissionAmount = money.commissionAmount;
  const hasEnoughWalletBalance = walletBalance >= commissionAmount;
  const canConfirmRequest = canCustomerConfirmMarketplaceRequest(statusKey);
  const isConfirming = confirmingRequestId === String(request?.id || '');
  const chatUnlocked = Boolean(request?.chatUnlocked) || isMarketplaceChatUnlocked(statusKey);

  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-4">
          {request?.coverImageUrl ? (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.3rem] border border-slate-200 bg-slate-50 shadow-sm">
              <img src={request.coverImageUrl} alt={request?.listingTitle || 'Marketplace vehicle'} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.3rem] border border-slate-200 bg-violet-50 text-violet-600 shadow-sm">
              <CarFront className="h-7 w-7" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                {chatUnlocked ? tr('Chat ready', 'Chat prêt') : tr('Request stage', 'Étape demande')}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-bold text-slate-950">{request?.listingTitle || tr('Marketplace vehicle', 'Véhicule marketplace')}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {[request?.cityName, request?.areaName].filter(Boolean).join(' • ') || tr('Private owner rental path', 'Parcours location propriétaire')}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
              <span>{tr('Start', 'Début')}: {startLabel || tr('Pending', 'En attente')}</span>
              <span>{tr('End', 'Fin')}: {endLabel || tr('Pending', 'En attente')}</span>
              <span>
                {tr('Duration', 'Durée')}: {request?.rentalType === 'daily'
                  ? tr(`${requestDuration} day`, `${requestDuration} jour(s)`)
                  : tr(`${requestDuration} hour`, `${requestDuration} heure(s)`)}
              </span>
            </div>
          </div>
        </div>

        <div className="text-left xl:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Rental amount', 'Montant location')}</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(money.estimatedAmount, request?.currencyCode || 'MAD', locale)}</p>
        </div>
      </div>

      {(request?.customerMessage || request?.counterOffer?.message) ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Latest update', 'Dernière mise à jour')}</p>
          <p className="mt-2 text-sm text-slate-700">
            {request?.ownerResponse || request?.counterOffer?.message || request?.customerMessage}
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {canConfirmRequest ? tr('Pay now to confirm', 'Payer maintenant pour confirmer') : tr('Booking money', 'Montants réservation')}
        </p>
        <div className="mt-3 space-y-2">
          <MoneyLine
            label={tr('Pay now (platform fee)', 'À payer maintenant (frais plateforme)')}
            value={formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale)}
            strong={canConfirmRequest}
          />
          <MoneyLine
            label={tr('Rental', 'Location')}
            value={formatMoney(money.estimatedAmount, request?.currencyCode || 'MAD', locale)}
          />
          <MoneyLine
            label={tr('Deposit held', 'Caution retenue')}
            value={formatMoney(damageDepositAmount, request?.currencyCode || 'MAD', locale)}
            strong={chatUnlocked}
          />
        </div>
        {canConfirmRequest ? (
          <p className="mt-3 text-xs font-medium text-slate-500">
            {tr('You pay the platform fee now. Remaining is handled at pickup.', 'Vous payez les frais plateforme maintenant. Le reste est géré au départ.')}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenRequestDetails?.(request)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
          >
            {tr('Open details', 'Ouvrir les détails')}
          </button>
        </div>
        {canConfirmRequest ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Confirm', 'Confirmer')}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {hasEnoughWalletBalance
                ? tr('Pay now to confirm this booking.', 'Payez maintenant pour confirmer cette réservation.')
                : tr('Add funds to continue.', 'Ajoutez des fonds pour continuer.')}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => onConfirmRequest?.(request)}
                disabled={!hasEnoughWalletBalance || isConfirming}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
              >
                {isConfirming ? tr('Confirming…', 'Confirmation…') : tr('Confirm booking', 'Confirmer la réservation')}
              </button>
              {!hasEnoughWalletBalance ? (
                <Link
                  to="/account/revenue"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                >
                  {tr('Top up wallet', 'Recharger le portefeuille')}
                </Link>
              ) : null}
              {chatUnlocked ? (
                <Link
                  to={`/account/messages?requestId=${encodeURIComponent(String(request?.id || ''))}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                >
                  {tr('Open chat', 'Ouvrir le chat')}
                </Link>
              ) : null}
            </div>
          </div>
        ) : chatUnlocked ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
              {tr('Deposit held and chat open', 'Caution retenue et chat ouvert')}
            </div>
            <Link
              to={`/account/messages?requestId=${encodeURIComponent(String(request?.id || ''))}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)] sm:w-auto"
            >
              {tr('Open live chat', 'Ouvrir le chat en direct')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
};

const CurrentRequestHero = ({
  request,
  tr,
  isFrench,
  walletBalance = 0,
  onConfirmRequest,
  onSendReminder,
  confirmingRequestId = '',
  remindingRequestId = '',
}) => {
  if (!request) return null;

  const locale = isFrench ? 'fr' : 'en';
  const statusKey = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
  const displayState = getMarketplaceRequestDisplay(statusKey, tr);
  const statusLabel = REQUEST_STATUS_LABELS[statusKey]?.[locale] || displayState.label || request?.requestStatus || tr('Pending', 'En attente');
  const startLabel = formatDateTime(request?.requestedStartAt, locale);
  const endLabel = formatDateTime(request?.requestedEndAt, locale);
  const requestDuration = Math.max(1, Number(request?.duration || 1));
  const money = getMarketplaceMoneyBreakdown({
    estimatedAmount: request?.estimatedAmount,
    commissionAmount: request?.commissionAmount,
  });
  const canConfirmRequest = canCustomerConfirmMarketplaceRequest(statusKey);
  const canSendReminder = canSendMarketplaceRequestReminder(statusKey, request?.reminderSentAt);
  const chatUnlocked = Boolean(request?.chatUnlocked) || isMarketplaceChatUnlocked(statusKey);
  const isConfirming = confirmingRequestId === String(request?.id || '');
  const isReminding = remindingRequestId === String(request?.id || '');
  const hasEnoughWalletBalance = walletBalance >= money.commissionAmount;
  const [showDetails, setShowDetails] = useState(false);
  const [holdNow, setHoldNow] = useState(Date.now());
  const approvalHoldState = useMemo(
    () => getMarketplaceApprovalHoldState({
      status: statusKey,
      holdExpiresAt: request?.holdExpiresAt || null,
      now: holdNow,
    }),
    [holdNow, request?.holdExpiresAt, statusKey]
  );
  const canConfirmBooking = canConfirmRequest && !approvalHoldState.expired;
  const holdCountdownLabel = approvalHoldState.active
    ? formatMarketplaceHoldCountdown(approvalHoldState.remainingMs)
    : '00:00';
  const bookingApprovalWhatsappHref = useMemo(
    () => buildMarketplaceBookingConfirmWhatsappHref({
      requestId: request?.id,
      listingTitle: request?.listingTitle,
      amount: formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale),
      tr,
    }),
    [locale, money.commissionAmount, request?.currencyCode, request?.id, request?.listingTitle, tr]
  );

  useEffect(() => {
    if (statusKey !== 'pre_approved' || !request?.holdExpiresAt) return undefined;

    const timer = window.setInterval(() => {
      setHoldNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [request?.holdExpiresAt, statusKey]);

  return (
    <section className="rounded-[1.9rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          {request?.coverImageUrl ? (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-slate-50 shadow-sm">
              <img src={request.coverImageUrl} alt={request?.listingTitle || 'Marketplace vehicle'} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.3rem] border border-slate-200 bg-violet-50 text-violet-600 shadow-sm">
              <CarFront className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${REQUEST_STATUS_TONE_MAP[statusKey] || displayState.tone || 'bg-slate-100 text-slate-700'}`}>
              {approvalHoldState.expired ? tr('Booking expired', 'Réservation expirée') : statusLabel}
            </span>
            {statusKey === 'pre_approved' ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {approvalHoldState.expired ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {tr('Request again to continue', 'Redemandez pour continuer')}
                  </span>
                ) : (
                  <HoldTimerChip urgency={approvalHoldState.urgency} countdownLabel={holdCountdownLabel} tr={tr} />
                )}
                {approvalHoldState.urgency === 'critical' && !approvalHoldState.expired ? (
                  <span className="text-xs font-semibold text-amber-700">
                    {tr('Only a few minutes left', 'Plus que quelques minutes')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-950">
              {request?.listingTitle || tr('Current request', 'Demande actuelle')}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {[startLabel, endLabel].filter(Boolean).join(' → ') || tr('Dates pending', 'Dates en attente')}
            </p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('To confirm', 'À confirmer')}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              {formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {canConfirmBooking ? (
          hasEnoughWalletBalance ? (
            <button
              type="button"
              onClick={() => onConfirmRequest?.(request)}
              disabled={isConfirming}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            >
              {isConfirming ? tr('Confirming…', 'Confirmation…') : tr('Confirm booking', 'Confirmer la réservation')}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              to="/account/revenue"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] sm:w-auto"
            >
              {tr('Add funds & confirm', 'Ajouter des fonds et confirmer')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )
        ) : null}
        {statusKey === 'pre_approved' && bookingApprovalWhatsappHref && !approvalHoldState.expired ? (
          <a
            href={bookingApprovalWhatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </a>
        ) : approvalHoldState.expired && request?.listingId ? (
          <Link
            to={`/account/marketplace/${encodeURIComponent(String(request.listingId))}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
          >
            {tr('Request again', 'Redemander')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : canSendReminder ? (
          <button
            type="button"
            onClick={() => onSendReminder?.(request)}
            disabled={isReminding}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {isReminding ? tr('Sending reminder…', 'Envoi du rappel…') : tr('Send reminder', 'Envoyer un rappel')}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : chatUnlocked ? (
          <Link
            to={`/account/messages?requestId=${encodeURIComponent(String(request?.id || ''))}`}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px]"
          >
            {tr('Open chat', 'Ouvrir le chat')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setShowDetails((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <p className="text-sm font-semibold text-slate-700">{tr('Details', 'Détails')}</p>
          <span className={`flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition ${showDetails ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>

        {showDetails ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="space-y-2">
              <MoneyLine
                label={tr('Rental amount', 'Montant location')}
                value={formatMoney(money.estimatedAmount, request?.currencyCode || 'MAD', locale)}
              />
              <MoneyLine
                label={tr('DriveOut fee', 'Frais DriveOut')}
                value={formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale)}
              />
              <MoneyLine
                label={tr('Duration', 'Durée')}
                value={
                  request?.rentalType === 'daily'
                    ? tr(`${requestDuration} day`, `${requestDuration} jour(s)`)
                    : tr(`${requestDuration} hour`, `${requestDuration} heure(s)`)
                }
                strong
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

const CompactRequestCard = ({
  request,
  tr,
  isFrench,
  walletBalance = 0,
  onConfirmRequest,
  onOpenRequestDetails,
  confirmingRequestId = '',
}) => {
  const locale = isFrench ? 'fr' : 'en';
  const statusKey = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
  const displayState = getMarketplaceRequestDisplay(statusKey, tr);
  const statusLabel = REQUEST_STATUS_LABELS[statusKey]?.[locale] || displayState.label || request?.requestStatus || tr('Pending', 'En attente');
  const startLabel = formatDateTime(request?.requestedStartAt, locale);
  const endLabel = formatDateTime(request?.requestedEndAt, locale);
  const money = getMarketplaceMoneyBreakdown({
    estimatedAmount: request?.estimatedAmount,
    commissionAmount: request?.commissionAmount,
  });
  const canConfirmRequest = canCustomerConfirmMarketplaceRequest(statusKey);
  const hasEnoughWalletBalance = walletBalance >= money.commissionAmount;
  const isConfirming = confirmingRequestId === String(request?.id || '');
  const [holdNow, setHoldNow] = useState(Date.now());
  const approvalHoldState = useMemo(
    () => getMarketplaceApprovalHoldState({
      status: statusKey,
      holdExpiresAt: request?.holdExpiresAt || null,
      now: holdNow,
    }),
    [holdNow, request?.holdExpiresAt, statusKey]
  );
  const canConfirmBooking = canConfirmRequest && !approvalHoldState.expired;
  const holdCountdownLabel = approvalHoldState.active
    ? formatMarketplaceHoldCountdown(approvalHoldState.remainingMs)
    : '00:00';
  const bookingApprovalWhatsappHref = useMemo(
    () => buildMarketplaceBookingConfirmWhatsappHref({
      requestId: request?.id,
      listingTitle: request?.listingTitle,
      amount: formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale),
      tr,
    }),
    [locale, money.commissionAmount, request?.currencyCode, request?.id, request?.listingTitle, tr]
  );

  useEffect(() => {
    if (statusKey !== 'pre_approved' || !request?.holdExpiresAt) return undefined;

    const timer = window.setInterval(() => {
      setHoldNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [request?.holdExpiresAt, statusKey]);

  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-slate-950">{request?.listingTitle || tr('Request', 'Demande')}</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${REQUEST_STATUS_TONE_MAP[statusKey] || displayState.tone || 'bg-slate-100 text-slate-700'}`}>
              {approvalHoldState.expired ? tr('Booking expired', 'Réservation expirée') : statusLabel}
            </span>
          </div>
          {statusKey === 'pre_approved' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {approvalHoldState.expired ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {tr('Request again to continue', 'Redemandez pour continuer')}
                </span>
              ) : (
                <HoldTimerChip urgency={approvalHoldState.urgency} countdownLabel={holdCountdownLabel} tr={tr} />
              )}
              {approvalHoldState.urgency === 'critical' && !approvalHoldState.expired ? (
                <span className="text-xs font-semibold text-amber-700">
                  {tr('Only a few minutes left', 'Plus que quelques minutes')}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-sm text-slate-500">
            {[startLabel, endLabel].filter(Boolean).join(' → ') || tr('Dates pending', 'Dates en attente')}
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {tr('To confirm', 'À confirmer')}: {formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale)}
          </p>
        </div>
        {canConfirmBooking ? (
          hasEnoughWalletBalance ? (
            <button
              type="button"
              onClick={() => onConfirmRequest?.(request)}
              disabled={isConfirming}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isConfirming ? tr('Confirming…', 'Confirmation…') : tr('Confirm booking', 'Confirmer la réservation')}
            </button>
          ) : (
            <Link
              to="/account/revenue"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px]"
            >
              {tr('Add funds & confirm', 'Ajouter des fonds et confirmer')}
            </Link>
          )
        ) : null}
        {statusKey === 'pre_approved' && bookingApprovalWhatsappHref && !approvalHoldState.expired ? (
          <a
            href={bookingApprovalWhatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </a>
        ) : approvalHoldState.expired && request?.listingId ? (
          <Link
            to={`/account/marketplace/${encodeURIComponent(String(request.listingId))}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
          >
            {tr('Request again', 'Redemander')}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onOpenRequestDetails?.(request)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
          >
            {tr('View details', 'Voir les détails')}
          </button>
        )}
      </div>
    </article>
  );
};

const MarketplaceRequestSection = ({
  requests,
  tr,
  isFrench,
  walletBalance = 0,
  onConfirmRequest,
  onOpenRequestDetails,
  confirmingRequestId = '',
  sectionRef = null,
}) => {
  if (!requests.length) return null;

  return (
    <section ref={sectionRef} className="space-y-4">
      <div className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <AccountWorkspaceSectionHeader
          title={tr('Requests', 'Demandes')}
          description={tr('Track each request and take the next step here.', 'Suivez chaque demande et passez à l’étape suivante ici.')}
          titleClassName="mt-1 text-lg font-bold text-slate-950"
        />
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <CompactRequestCard
            key={request.id}
            request={request}
            tr={tr}
            isFrench={isFrench}
            walletBalance={walletBalance}
            onConfirmRequest={onConfirmRequest}
            onOpenRequestDetails={onOpenRequestDetails}
            confirmingRequestId={confirmingRequestId}
          />
        ))}
      </div>
    </section>
  );
};

const EmptyTripsState = ({ tr, browseState }) => (
  <section className="rounded-[1.9rem] border border-dashed border-slate-200 bg-white/95 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
    <div className="max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {tr('No trips yet', 'Aucun trajet pour le moment')}
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-950">
        {tr('No trips yet', 'Aucun trajet pour le moment')}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        {tr(
          'Browse vehicles or tours and start your next trip from here.',
          'Explorez les véhicules ou les tours et lancez votre prochain trajet depuis ici.'
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          to="/marketplace"
          state={browseState}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
        >
          <span>{tr('Browse vehicles', 'Explorer les véhicules')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/tours"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
        >
          <span>{tr('Browse tours', 'Explorer les tours')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  </section>
);

const AccountRentals = () => {
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rentals, setRentals] = useState([]);
  const [tours, setTours] = useState([]);
  const [marketplaceRequests, setMarketplaceRequests] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [confirmingRequestId, setConfirmingRequestId] = useState('');
  const [remindingRequestId, setRemindingRequestId] = useState('');
  const toursSectionRef = useRef(null);
  const historySectionRef = useRef(null);
  const toursPanelRequested = useMemo(
    () => new URLSearchParams(location.search).get('panel') === 'tours',
    [location.search]
  );
  const historyPanelRequested = useMemo(
    () => location.state?.focusSection === 'history',
    [location.state]
  );

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
        const [accountSnapshot, history, toursHistory, requests] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user),
          CustomerExperienceService.getCustomerRentalHistory(user),
          CustomerExperienceService.getCustomerTourHistory(user),
          CustomerExperienceService.getCustomerMarketplaceRequests(user),
        ]);
        if (cancelled) return;
        setSnapshot(accountSnapshot);
        setRentals(Array.isArray(history) ? history : []);
        setTours(Array.isArray(toursHistory) ? toursHistory : []);
        setMarketplaceRequests(Array.isArray(requests) ? requests : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your trips right now.', 'Impossible de charger vos trajets pour le moment.'));
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

  const walletBalance = Number(snapshot?.wallet?.balance || 0);
  const linkedMarketplaceRequestIds = useMemo(() => {
    const requestIds = rentals
      .map((rental) => String(rental?.raw?.marketplace_request_id || '').trim())
      .filter(Boolean);
    return new Set(requestIds);
  }, [rentals]);

  const rentalBuckets = useMemo(() => {
    const now = new Date();
    return rentals.reduce(
      (accumulator, rental) => {
        const bucket = getRentalBucket(rental, rental?.timelineEvents || rental?.timeline_events || [], now);
        accumulator[bucket].push(rental);
        return accumulator;
      },
      { upcoming: [], active: [], past: [], canceled: [] }
    );
  }, [rentals]);

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

  const featuredUpcomingRental = rentalBuckets.upcoming[0] || rentalBuckets.active[0] || null;
  const currentTourTrips = useMemo(
    () =>
      [...tourBuckets.active, ...tourBuckets.upcoming].sort(
        (left, right) => new Date(left?.scheduledFor || 0).getTime() - new Date(right?.scheduledFor || 0).getTime()
      ),
    [tourBuckets.active, tourBuckets.upcoming]
  );
  const pastTourTrips = useMemo(
    () =>
      [...tourBuckets.past, ...tourBuckets.canceled].sort(
        (left, right) => new Date(right?.scheduledFor || right?.updatedAt || 0).getTime() - new Date(left?.scheduledFor || left?.updatedAt || 0).getTime()
      ),
    [tourBuckets.canceled, tourBuckets.past]
  );

  const actionableMarketplaceRequests = useMemo(
    () => marketplaceRequests.filter((request) => {
      const requestId = String(request?.id || '').trim();
      if (requestId && linkedMarketplaceRequestIds.has(requestId)) return false;
      return isMarketplaceRequestOpen(request?.requestStatus);
    }),
    [linkedMarketplaceRequestIds, marketplaceRequests]
  );
  const primaryMarketplaceRequest = actionableMarketplaceRequests[0] || null;
  const hasCurrentOrUpcomingRental = rentalBuckets.upcoming.length > 0 || rentalBuckets.active.length > 0;
  const hasCurrentOrUpcomingTour = tourBuckets.upcoming.length > 0 || tourBuckets.active.length > 0;
  const hasAnyTourHistory = tours.length > 0;
  const shouldUseMarketplaceFocus = Boolean(primaryMarketplaceRequest && !hasCurrentOrUpcomingRental);
  const additionalMarketplaceRequests = primaryMarketplaceRequest
    ? actionableMarketplaceRequests.filter((request) => String(request?.id || '') !== String(primaryMarketplaceRequest?.id || ''))
    : actionableMarketplaceRequests;
  const browseMarketplaceState = useMemo(
    () => ({
      from: getCurrentLocationPath(location),
    }),
    [location]
  );

  useEffect(() => {
    if (!toursPanelRequested) return;
    toursSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [toursPanelRequested, tours.length]);

  useEffect(() => {
    if (!historyPanelRequested) return;
    historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [historyPanelRequested, rentalBuckets.canceled.length, rentalBuckets.past.length]);

  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  const handleOpenDetails = (rental) => {
    if (!rental?.id) return;
    navigate(`/account/rentals/${encodeURIComponent(String(rental.id))}`, {
      state: {
        from: getCurrentLocationPath(location),
      },
    });
  };

  const handleOpenMarketplaceRequestDetails = (request) => {
    if (!request?.id) return;
    navigate(`/account/rentals/requests/${encodeURIComponent(String(request.id))}`, {
      state: {
        from: getCurrentLocationPath(location),
      },
    });
  };

  const handleOpenTourDetails = (tour) => {
    const tourReference = String(tour?.groupId || tour?.id || '').trim();
    if (!tourReference) return;
    navigate(`/account/tours/${encodeURIComponent(tourReference)}`, {
      state: {
        from: `${getCurrentLocationPath(location)}?panel=tours`,
      },
    });
  };

  const handleConfirmMarketplaceRequest = async (request) => {
    const requestId = String(request?.id || '').trim();
    if (!requestId) return;

    try {
      setConfirmingRequestId(requestId);
      await CustomerExperienceService.confirmMarketplaceRequest(requestId);
      const [accountSnapshot, requests] = await Promise.all([
        CustomerExperienceService.getCustomerAccountSnapshot(user),
        CustomerExperienceService.getCustomerMarketplaceRequests(user),
      ]);
      setSnapshot(accountSnapshot);
      setMarketplaceRequests(Array.isArray(requests) ? requests : []);
    } catch (confirmError) {
      setError(confirmError?.message || tr('Unable to confirm this marketplace request right now.', 'Impossible de confirmer cette demande marketplace pour le moment.'));
    } finally {
      setConfirmingRequestId('');
    }
  };

  const handleSendMarketplaceReminder = async (request) => {
    const requestId = String(request?.id || '').trim();
    if (!requestId) return;

    try {
      setRemindingRequestId(requestId);
      const result = await CustomerExperienceService.sendMarketplaceRequestReminder(requestId);
      const reminderSentAt = result?.reminderSentAt || new Date().toISOString();
      setMarketplaceRequests((current) => current.map((entry) => (
        String(entry?.id || '') === requestId
          ? { ...entry, reminderSentAt: new Date(reminderSentAt) }
          : entry
      )));
    } catch (reminderError) {
      setError(reminderError?.message || tr('Unable to send a reminder right now.', "Impossible d'envoyer un rappel pour le moment."));
    } finally {
      setRemindingRequestId('');
    }
  };

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
      <div className="sticky top-0 z-20">
        <AccountWorkspaceHero
          eyebrow={tr('Trips', 'Parcours')}
          title={tr('Trips', 'Parcours')}
          description={tr(
            'Track active, upcoming, and completed rentals in one place.',
            'Suivez vos locations actives, à venir et terminées au même endroit.'
          )}
          className="bg-white/95 backdrop-blur"
        />
      </div>

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      {hasCurrentOrUpcomingRental ? (
        <>
          <RentalSection
            title={tr('Active', 'Actives')}
            description={tr('Rentals that are currently live.', 'Locations actuellement en cours.')}
            rentals={rentalBuckets.active}
            emptyTitle={tr('No active rentals right now', 'Aucune location active actuellement')}
            emptyBody={tr('When a rental is live, it will appear here.', 'Lorsqu’une location est en cours, elle apparaîtra ici.')}
            tr={tr}
            isFrench={isFrench}
            onOpenDetails={handleOpenDetails}
          />

          <RentalSection
            title={tr('Upcoming', 'À venir')}
            description={tr('Confirmed rentals scheduled next.', 'Locations confirmées prévues ensuite.')}
            rentals={rentalBuckets.upcoming}
            emptyTitle={tr('No upcoming rentals yet', 'Aucune location à venir pour le moment')}
            emptyBody={tr('Your next confirmed rental will appear here.', 'Votre prochaine location confirmée apparaîtra ici.')}
            tr={tr}
            isFrench={isFrench}
            onOpenDetails={handleOpenDetails}
          />
        </>
      ) : !hasCurrentOrUpcomingTour && !hasAnyTourHistory && actionableMarketplaceRequests.length === 0 ? (
        <EmptyTripsState tr={tr} browseState={browseMarketplaceState} />
      ) : null}

      {actionableMarketplaceRequests.length > 0 ? (
        <div id="marketplace-requests">
          <section className="space-y-4">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <AccountWorkspaceSectionHeader
                title={tr('Action needed', 'Action requise')}
                description={tr(
                  'Only requests that still need a real next step stay here.',
                  'Seules les demandes qui nécessitent encore une vraie action restent ici.'
                )}
                titleClassName="mt-1 text-lg font-bold text-slate-950"
              />
            </div>
            {primaryMarketplaceRequest ? (
              <CurrentRequestHero
                request={primaryMarketplaceRequest}
                tr={tr}
                isFrench={isFrench}
                walletBalance={walletBalance}
                onConfirmRequest={handleConfirmMarketplaceRequest}
                onSendReminder={handleSendMarketplaceReminder}
                onOpenRequestDetails={handleOpenMarketplaceRequestDetails}
                confirmingRequestId={confirmingRequestId}
                remindingRequestId={remindingRequestId}
                emphasizeMarketplace={false}
              />
            ) : null}
            {additionalMarketplaceRequests.length > 0 ? (
              <div className="space-y-3">
                {additionalMarketplaceRequests.map((request) => (
                  <CompactRequestCard
                    key={request.id}
                    request={request}
                    tr={tr}
                    isFrench={isFrench}
                    walletBalance={walletBalance}
                    onConfirmRequest={handleConfirmMarketplaceRequest}
                    onOpenRequestDetails={handleOpenMarketplaceRequestDetails}
                    confirmingRequestId={confirmingRequestId}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <section ref={toursSectionRef} id="trips-tours" className="space-y-4">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Tours', 'Tours')}
            description={tr(
              'Keep guided rides and tour bookings inside the same trip workspace.',
              'Gardez les sorties guidées et réservations de tours dans le même espace trajets.'
            )}
            titleClassName="mt-1 text-lg font-bold text-slate-950"
          />
        </div>

        <TourTripSection
          title={tr('Current and upcoming tours', 'Tours actuels et à venir')}
          description=""
          tours={currentTourTrips}
          emptyTitle={tr('No upcoming tours yet', 'Aucun tour à venir pour le moment')}
          emptyBody={tr(
            'Your guided experiences will show up here once you book them.',
            'Vos expériences guidées apparaîtront ici une fois réservées.'
          )}
          emptyActionLabel={tr('Browse tours', 'Explorer les tours')}
          emptyActionTo="/tours"
          tr={tr}
          isFrench={isFrench}
          onOpenDetails={handleOpenTourDetails}
        />
      </section>

      <RentalHistorySection
        pastRentals={rentalBuckets.past}
        canceledRentals={rentalBuckets.canceled}
        tr={tr}
        isFrench={isFrench}
        onOpenDetails={handleOpenDetails}
        browseState={browseMarketplaceState}
        sectionRef={historySectionRef}
      />

      <TourTripSection
        title={tr('Past tours', 'Tours passés')}
        description={tr('Finished tours stay here for reference.', 'Les tours terminés restent ici pour référence.')}
        tours={pastTourTrips}
        emptyTitle={tr('No past tours yet', 'Aucun tour passé pour le moment')}
        emptyBody={tr('Your completed tours will appear here.', 'Vos tours terminés apparaîtront ici.')}
        tr={tr}
        isFrench={isFrench}
        onOpenDetails={handleOpenTourDetails}
        compact
      />
    </div>
  );
};

export default AccountRentals;
