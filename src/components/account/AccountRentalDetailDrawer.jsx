import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarClock, ChevronDown, FileText, Fuel, Gauge, MapPinned, MessageSquare, Receipt, ShieldCheck, Wallet, X } from 'lucide-react';
import i18n from '../../i18n';
import CustomerRentalTimer from './CustomerRentalTimer';
import RentalEvidenceGallery from './RentalEvidenceGallery';
import { getCanonicalRentalStage, getRentalThreadPresentation } from '../../utils/rentalThreadState';

const formatDateTime = (value, locale) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const getRentalPackageLabel = (rental, tr) =>
  rental?.selectedPackageName ||
  rental?.packageName ||
  rental?.quantityLabel ||
  tr('Certified company booking', 'Réservation entreprise certifiée');

const getPaymentStatusLabel = (status, tr) => {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'completed', 'succeeded'].includes(normalized)) return tr('Paid', 'Payé');
  if (['partial', 'partially_paid'].includes(normalized)) return tr('Partially paid', 'Partiellement payé');
  if (['pending', 'unpaid'].includes(normalized)) return tr('Pending', 'En attente');
  return status || tr('Pending', 'En attente');
};

const DetailBlock = ({ eyebrow, title, children, flat = false }) => (
  <section className={`rounded-[1.5rem] p-4 ${flat ? 'bg-white' : 'border border-slate-200 bg-white shadow-sm'}`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{eyebrow}</p>
    <h3 className="mt-2 text-sm font-bold text-slate-900">{title}</h3>
    <div className="mt-3 space-y-3">{children}</div>
  </section>
);

const DetailRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
  </div>
);

const DetailList = ({ items, emptyLabel }) => {
  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="flex items-start justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
            {item.detail ? <p className="mt-1 text-sm text-slate-500">{item.detail}</p> : null}
          </div>
          <span className="text-right text-sm font-semibold text-slate-900">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

const findTimelineTimestamp = (timeline = [], keywords = []) => {
  const normalizedKeywords = (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => String(keyword || '').trim().toLowerCase())
    .filter(Boolean);
  const entries = Array.isArray(timeline) ? timeline : [];
  const match = entries.find((item) => {
    const label = String(item?.label || '').trim().toLowerCase();
    return normalizedKeywords.some((keyword) => label.includes(keyword));
  });
  return match?.at || null;
};

const getStepState = (isComplete, isCurrent) => {
  if (isComplete) return 'done';
  if (isCurrent) return 'current';
  return 'upcoming';
};

const buildOwnerJourneySteps = ({
  rental,
  stage,
  openingInspectionComplete,
  closingInspectionComplete,
  payoutSent,
  tr,
}) => {
  const timeline = Array.isArray(rental?.timeline) ? rental.timeline : [];
  const paymentConfirmed = ['paid', 'completed', 'succeeded', 'partial', 'partially_paid'].includes(String(rental?.paymentStatus || '').toLowerCase()) || Number(rental?.paid || 0) > 0;
  const pickupReady = ['pickup_ready', 'active', 'return_due', 'returned', 'settled'].includes(stage);
  const rentalActive = ['active', 'return_due', 'returned', 'settled'].includes(stage) || Boolean(rental?.startedAt);
  const returnStarted = ['return_due', 'returned', 'settled'].includes(stage);
  const completed = ['settled', 'cancelled'].includes(stage) || Boolean(rental?.completedAt);

  const definitions = [
    {
      key: 'request_submitted',
      label: tr('Request submitted', 'Demande envoyée'),
      complete: Boolean(rental?.createdAt),
      timestamp: rental?.createdAt || findTimelineTimestamp(timeline, ['submitted', 'created']),
    },
    {
      key: 'approved',
      label: tr('Approved', 'Approuvée'),
      complete: ['confirmed', 'pickup_ready', 'active', 'return_due', 'returned', 'settled'].includes(stage) || Boolean(rental?.confirmedAt),
      timestamp: rental?.confirmedAt || findTimelineTimestamp(timeline, ['approved', 'confirmed']),
    },
    {
      key: 'payment_confirmed',
      label: tr('Payment confirmed', 'Paiement confirmé'),
      complete: paymentConfirmed,
      timestamp: findTimelineTimestamp(timeline, ['payment', 'paid', 'receipt']) || rental?.raw?.receipt_issued_at || rental?.raw?.paid_at || null,
    },
    {
      key: 'pickup_ready',
      label: tr('Pickup ready', 'Prête au départ'),
      complete: pickupReady,
      timestamp: findTimelineTimestamp(timeline, ['pickup ready', 'ready for pickup']) || rental?.raw?.pickup_ready_at || null,
    },
    {
      key: 'opening_inspection',
      label: tr('Opening inspection', 'Inspection de départ'),
      complete: openingInspectionComplete,
      timestamp: findTimelineTimestamp(timeline, ['inspection', 'pickup photos']) || rental?.ownerExecution?.handoffPhotos?.[0]?.createdAt || null,
    },
    {
      key: 'rental_active',
      label: tr('Rental active', 'Location active'),
      complete: rentalActive,
      timestamp: rental?.startedAt || findTimelineTimestamp(timeline, ['started', 'picked up', 'handoff']),
    },
    {
      key: 'return_started',
      label: tr('Return started', 'Retour commencé'),
      complete: returnStarted,
      timestamp: findTimelineTimestamp(timeline, ['return', 'ready to return']) || rental?.raw?.return_started_at || null,
    },
    {
      key: 'closing_inspection',
      label: tr('Closing inspection', 'Inspection de retour'),
      complete: closingInspectionComplete,
      timestamp: findTimelineTimestamp(timeline, ['report', 'return photos', 'closing']) || rental?.vehicleReport?.created_at || rental?.ownerExecution?.returnPhotos?.[0]?.createdAt || null,
    },
    {
      key: 'payout_sent',
      label: tr('Payout sent', 'Versement envoyé'),
      complete: payoutSent,
      timestamp: findTimelineTimestamp(timeline, ['payout', 'settled']) || rental?.raw?.owner_payout_at || rental?.raw?.payout_sent_at || null,
    },
    {
      key: 'completed',
      label: tr('Completed', 'Terminée'),
      complete: completed,
      timestamp: rental?.completedAt || findTimelineTimestamp(timeline, ['completed', 'closed', 'finished']),
    },
  ];

  let currentAssigned = false;
  return definitions.map((step) => {
    const state = getStepState(step.complete, !step.complete && !currentAssigned);
    if (state === 'current') currentAssigned = true;
    return { ...step, state };
  });
};

const getDepositState = (rental) => {
  if (String(rental?.depositMode || '').toLowerCase() === 'external') return 'external';
  const statusKey = String(rental?.status || '').toLowerCase();

  if (rental?.depositReturnedAt) return 'returned';
  if (Number(rental?.depositAmount || 0) <= 0) return 'none';
  if (['active', 'ready_to_finish', 'completed', 'closed'].includes(statusKey)) return 'held';
  return 'required';
};

const getDepositStatusLabel = (rental, tr, locale) => {
  const depositState = getDepositState(rental);

  if (depositState === 'returned') {
    return `${tr('Returned', 'Restituée')} • ${formatMoney(rental?.depositReturnAmount || rental?.depositAmount, 'MAD', locale)}`;
  }
  if (depositState === 'external') {
    return tr('Deposit handled directly between renter and owner at pickup', 'Caution gérée directement entre locataire et propriétaire au départ');
  }
  if (depositState === 'held') {
    return `${tr('Held', 'Retenue')} • ${formatMoney(rental?.depositAmount, 'MAD', locale)}`;
  }
  if (depositState === 'required') {
    return `${tr('Due at pickup', 'À prévoir au départ')} • ${formatMoney(rental?.depositAmount, 'MAD', locale)}`;
  }
  return tr('No deposit recorded', 'Aucune caution enregistrée');
};

const getDepositHeading = (rental, tr) => {
  const depositState = getDepositState(rental);

  if (depositState === 'returned') return tr('Deposit returned', 'Caution restituée');
  if (depositState === 'external') return tr('Deposit handled directly at pickup', 'Caution gérée directement au départ');
  if (depositState === 'held') return tr('Deposit held', 'Caution retenue');
  if (depositState === 'required') return tr('Deposit due at pickup', 'Caution à prévoir au départ');
  return tr('Security deposit', 'Caution');
};

const getDepositAmountLabel = (rental, tr) => {
  const depositState = getDepositState(rental);

  if (depositState === 'returned') return tr('Deposit returned', 'Caution restituée');
  if (depositState === 'external') return tr('Deposit handled between renter and owner', 'Caution gérée entre locataire et propriétaire');
  if (depositState === 'held') return tr('Deposit held', 'Caution retenue');
  if (depositState === 'required') return tr('Security deposit required', 'Caution demandée');
  if (rental?.depositReturnedAt) {
    return tr('Deposit returned', 'Caution restituée');
  }
  return tr('No deposit recorded', 'Aucune caution enregistrée');
};

const AccountRentalDetailDrawer = ({ rental, loading, onClose, variant = 'drawer', onBack }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const isPage = variant === 'page';
  const [showMoneyDetails, setShowMoneyDetails] = useState(false);
  const openingInspectionRef = useRef(null);
  const closingInspectionRef = useRef(null);

  if (!rental && !loading) return null;

  const statusKey = String(rental?.status || '').toLowerCase();
  const canonicalStage = getCanonicalRentalStage(rental, rental?.timelineEvents || rental?.timeline_events || []);
  const rentalPresentation = getRentalThreadPresentation(
    rental,
    rental?.timelineEvents || rental?.timeline_events || [],
    { isFrench, tr }
  );
  const statusLabel = rentalPresentation.label || rental?.status || tr('Unknown', 'Inconnu');
  const statusTone = rentalPresentation.badgeClassName || 'bg-slate-100 text-slate-700';
  const paymentStatusLabel = getPaymentStatusLabel(rental?.paymentStatus, tr);
  const scheduleSummary = [formatDateTime(rental?.startDate, locale), rental?.city].filter(Boolean).join(' • ');
  const packageLabel = getRentalPackageLabel(rental, tr);
  const depositStatusLabel = getDepositStatusLabel(rental, tr, locale);
  const depositHeading = getDepositHeading(rental, tr);
  const depositAmountLabel = getDepositAmountLabel(rental, tr);
  const isLiveRental = ['active', 'ready_to_finish'].includes(statusKey);
  const isCompletedRental = ['settled', 'cancelled'].includes(canonicalStage) || ['completed', 'closed'].includes(statusKey);
  const approvedExtensions = Array.isArray(rental?.approvedExtensions) ? rental.approvedExtensions : [];
  const ownerExecution = rental?.ownerExecution || rental?.owner_execution || {};
  const handoffPhotos = Array.isArray(ownerExecution?.handoffPhotos) ? ownerExecution.handoffPhotos : [];
  const returnPhotos = Array.isArray(ownerExecution?.returnPhotos) ? ownerExecution.returnPhotos : [];
  const receiptLink = String(rental?.documentLinks?.receipt || '').trim();
  const contractLink = String(rental?.documentLinks?.contract || '').trim();
  const totalMediaCount = handoffPhotos.length + returnPhotos.length;
  const marketplaceRequestId = String(rental?.raw?.marketplace_request_id || rental?.raw?.marketplaceRequestId || '').trim();
  const customerVerificationStatus = String(
    rental?.raw?.customer_verification_status ||
    rental?.raw?.verification_status ||
    rental?.customerVerificationStatus ||
    ''
  ).trim();
  const customerRentalCount = Number(rental?.raw?.customer_rental_count || rental?.customerRentalCount || 0);
  const openingInspection = {
    odometer: rental?.raw?.starting_odometer ?? rental?.raw?.start_odometer ?? rental?.raw?.odometer_start ?? '',
    fuel: rental?.raw?.start_fuel_level ?? rental?.raw?.fuel_start ?? '',
    condition:
      rental?.raw?.pickup_condition ||
      rental?.raw?.opening_condition ||
      (handoffPhotos.length ? tr('Evidence saved', 'Preuve enregistrée') : tr('Pending review', 'En attente de revue')),
    notes: rental?.raw?.pickup_notes || ownerExecution?.handoffNotes || '',
  };
  const closingInspection = {
    odometer: rental?.raw?.ending_odometer ?? rental?.raw?.end_odometer ?? rental?.raw?.odometer_end ?? '',
    fuel: rental?.raw?.end_fuel_level ?? rental?.raw?.fuel_end ?? '',
    condition:
      rental?.vehicleReport?.send_to_maintenance
        ? tr('Issue reported', 'Incident signalé')
        : rental?.vehicleReport?.notes
          ? tr('Report saved', 'Rapport enregistré')
          : returnPhotos.length
            ? tr('Evidence saved', 'Preuve enregistrée')
            : tr('Pending review', 'En attente de revue'),
    notes: rental?.vehicleReport?.notes || rental?.raw?.return_notes || ownerExecution?.returnNotes || '',
  };
  const openingInspectionComplete = Boolean(handoffPhotos.length || openingInspection.odometer || openingInspection.fuel || openingInspection.notes);
  const closingInspectionComplete = Boolean(returnPhotos.length || closingInspection.odometer || closingInspection.fuel || rental?.vehicleReport?.id || closingInspection.notes);
  const payoutSent = Boolean(rental?.raw?.owner_payout_at || rental?.raw?.payout_sent_at || ['completed', 'closed'].includes(statusKey));
  const journeySteps = useMemo(
    () =>
      buildOwnerJourneySteps({
        rental,
        stage: canonicalStage,
        openingInspectionComplete,
        closingInspectionComplete,
        payoutSent,
        tr,
      }),
    [canonicalStage, closingInspectionComplete, openingInspectionComplete, payoutSent, rental, tr]
  );
  const scrollToBlock = (targetRef) => {
    if (targetRef?.current && typeof targetRef.current.scrollIntoView === 'function') {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const workflowAction = (() => {
    if (canonicalStage === 'created') {
      return {
        eyebrow: tr('Next action', 'Prochaine action'),
        title: tr('Review this request', 'Révisez cette demande'),
        detail: tr('Approve or reject from the shared conversation so the booking stays coordinated in one place.', 'Approuvez ou refusez depuis la conversation partagée pour garder la réservation coordonnée au même endroit.'),
        primaryLabel: tr('Approve', 'Approuver'),
        secondaryLabel: tr('Reject', 'Refuser'),
        onPrimary: () => {
          if (marketplaceRequestId) window.location.assign(`/account/messages?requestId=${encodeURIComponent(marketplaceRequestId)}`);
        },
        onSecondary: () => {
          if (marketplaceRequestId) window.location.assign(`/account/messages?requestId=${encodeURIComponent(marketplaceRequestId)}`);
        },
      };
    }
    if (['confirmed'].includes(canonicalStage)) {
      return {
        eyebrow: tr('Next action', 'Prochaine action'),
        title: tr('Prepare for pickup', 'Préparer le départ'),
        detail: tr('Start the opening inspection before handing over the vehicle.', 'Commencez l’inspection de départ avant de remettre le véhicule.'),
        primaryLabel: tr('Start opening inspection', 'Commencer l’inspection de départ'),
        onPrimary: () => scrollToBlock(openingInspectionRef),
      };
    }
    if (['pickup_ready'].includes(canonicalStage)) {
      return {
        eyebrow: tr('Next action', 'Prochaine action'),
        title: tr('Confirm handoff', 'Confirmer la remise'),
        detail: tr('The vehicle is ready. Mark pickup steps from the opening inspection block.', 'Le véhicule est prêt. Marquez les étapes de départ depuis le bloc d’inspection de départ.'),
        primaryLabel: tr('Mark as picked up', 'Marquer comme récupéré'),
        onPrimary: () => scrollToBlock(openingInspectionRef),
      };
    }
    if (['return_due', 'returned'].includes(canonicalStage)) {
      return {
        eyebrow: tr('Next action', 'Prochaine action'),
        title: tr('Inspect returned vehicle', 'Inspecter le véhicule retourné'),
        detail: tr('Complete the closing inspection and save the return evidence.', 'Complétez l’inspection de retour et enregistrez les preuves de retour.'),
        primaryLabel: tr('Start closing inspection', 'Commencer l’inspection de retour'),
        onPrimary: () => scrollToBlock(closingInspectionRef),
      };
    }
    return null;
  })();
  const pricingItems = [
    rental?.billedHours > 0 ? {
      key: 'time-pricing',
      label: tr('Time pricing', 'Tarification temps'),
      detail: tr(
        `${rental.durationMinutes || 0} min • ${rental.billedHours} billed hour(s) × ${formatMoney(rental.hourlyRateApplied || 0, 'MAD', locale)}`,
        `${rental.durationMinutes || 0} min • ${rental.billedHours} heure(s) facturée(s) × ${formatMoney(rental.hourlyRateApplied || 0, 'MAD', locale)}`
      ),
      value: formatMoney(rental.calculatedTimePrice || 0, 'MAD', locale),
    } : null,
    rental?.totalExtensionFees > 0 ? {
      key: 'extensions',
      label: tr('Approved extensions', 'Extensions approuvées'),
      detail: rental?.extensionHours > 0
        ? tr(`${rental.extensionHours} hour(s) added to your rental`, `${rental.extensionHours} heure(s) ajoutée(s) à votre location`)
        : tr('Extension added to your booking', 'Extension ajoutée à votre réservation'),
      value: formatMoney(rental.totalExtensionFees, 'MAD', locale),
    } : null,
    rental?.overageCharge > 0 ? {
      key: 'overage',
      label: tr('Extra kilometers', 'Kilomètres supplémentaires'),
      detail: rental?.extraKilometers > 0
        ? tr(
            `${rental.extraKilometers} km × ${formatMoney(rental.extraKmRateApplied, 'MAD', locale)}`,
            `${rental.extraKilometers} km × ${formatMoney(rental.extraKmRateApplied, 'MAD', locale)}`
          )
        : tr('Mileage adjustment applied after return', 'Ajustement kilométrique appliqué après le retour'),
      value: formatMoney(rental.overageCharge, 'MAD', locale),
    } : null,
    rental?.fuelCharge > 0 ? {
      key: 'fuel',
      label: tr('Fuel adjustment', 'Ajustement carburant'),
      detail: tr('Fuel level was adjusted when the vehicle was returned.', 'Le niveau de carburant a été ajusté au retour du véhicule.'),
      value: formatMoney(rental.fuelCharge, 'MAD', locale),
    } : null,
    rental?.maintenanceCustomerChargeTotal > 0 ? {
      key: 'maintenance',
      label: tr('Maintenance and repair charge', 'Frais maintenance et réparation'),
      detail: tr('Linked vehicle report and maintenance costs applied to this rental.', 'Rapport véhicule lié et coûts de maintenance appliqués à cette location.'),
      value: formatMoney(rental.maintenanceCustomerChargeTotal, 'MAD', locale),
    } : null,
  ].filter(Boolean);
  const maintenancePartLines = (Array.isArray(rental?.linkedMaintenance?.parts_used) ? rental.linkedMaintenance.parts_used : []).map((part, index) => {
    const quantity = Number(part?.quantity || 0) || 0;
    const unitCost = Number(part?.unit_cost_mad || 0) || 0;
    const totalCost = Number(part?.total_cost_mad || quantity * unitCost) || 0;
    const partName = part?.item_name || part?.part_name || tr('Maintenance part', 'Pièce maintenance');

    return {
      key: `part-${part?.id || index}`,
      label: partName,
      detail: quantity > 0 ? tr(`Qty ${quantity}`, `Qté ${quantity}`) : null,
      value: formatMoney(totalCost, 'MAD', locale),
    };
  });

  const content = (
    <>
      <div className={`sticky top-0 z-10 px-5 py-4 backdrop-blur-xl ${isPage ? 'bg-transparent sm:px-6' : 'border-b border-slate-200 bg-white/95'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Rental details', 'Détails location')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{rental?.modelName || tr('Rental', 'Location')}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
              <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                {rental?.rentalId || tr('Reference pending', 'Référence en attente')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPage ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                {tr('Back', 'Retour')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                aria-label="Close rental details"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`space-y-5 px-5 py-5 ${isPage ? 'sm:px-6 sm:py-6' : ''}`}>
        {loading ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.14),_transparent_34%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_58%,_#f8f5ff_100%)] p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="h-36 w-36 animate-pulse rounded-[1.6rem] bg-white/90 shadow-[0_14px_36px_rgba(15,23,42,0.08)]" />
                  <div className="min-w-0 flex-1">
                    <div className="h-7 w-40 animate-pulse rounded-full bg-white/90" />
                    <div className="mt-4 h-9 w-56 animate-pulse rounded-2xl bg-white/90" />
                    <div className="mt-3 h-4 w-full max-w-sm animate-pulse rounded-full bg-white/90" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="h-8 w-40 animate-pulse rounded-full bg-white/90" />
                      <div className="h-8 w-44 animate-pulse rounded-full bg-white/90" />
                    </div>
                  </div>
                </div>
                <div className="h-28 min-w-[220px] animate-pulse rounded-[1.5rem] bg-white/90 shadow-[0_14px_36px_rgba(15,23,42,0.08)]" />
              </div>
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-44 animate-pulse rounded-[1.5rem] bg-white" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <section className={`overflow-hidden rounded-[1.75rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.18),_transparent_34%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_58%,_#f8f5ff_100%)] p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)]`}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-2xl font-bold tracking-tight text-slate-950">{rental?.modelName || tr('Rental', 'Location')}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Customer', 'Client')}</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">{rental?.customerName || '—'}</p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Dates', 'Dates')}</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">
                        {[formatDateTime(rental?.startDate, locale), formatDateTime(rental?.endDate, locale)].filter(Boolean).join(' → ') || '—'}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Reference', 'Référence')}</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">{rental?.rentalId || '—'}</p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Status', 'Statut')}</p>
                      <p className="mt-2 text-sm font-bold text-slate-950">{statusLabel}</p>
                    </div>
                  </div>
                </div>

                <div className="min-w-[260px] rounded-[1.5rem] border border-white/70 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Payment', 'Paiement')}</p>
                  <div className="mt-4 space-y-3">
                    <DetailRow label={tr('Final total', 'Total final')} value={formatMoney(rental?.total, 'MAD', locale)} />
                    <DetailRow label={tr('Payment status', 'Statut paiement')} value={paymentStatusLabel} />
                    <DetailRow label={tr('Deposit', 'Caution')} value={depositStatusLabel} />
                    <DetailRow label={tr('Receipt', 'Reçu')} value={rental?.receiptIssued ? tr('Ready', 'Prêt') : tr('Pending', 'En attente')} />
                  </div>
                </div>
              </div>
            </section>

            {isCompletedRental ? (
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Completed trip', 'Trajet terminé')}</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-950">{tr('Everything is closed and ready to review', 'Tout est clôturé et prêt à être consulté')}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
                  {receiptLink ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {tr('Receipt ready', 'Reçu prêt')}
                    </span>
                  ) : null}
                  {totalMediaCount > 0 ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {tr(`${totalMediaCount} trip media`, `${totalMediaCount} média du trajet`)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {receiptLink ? (
                    <a
                      href={receiptLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px]"
                    >
                      <Receipt className="h-4 w-4" />
                      {tr('Open receipt', 'Ouvrir le reçu')}
                    </a>
                  ) : null}
                  {contractLink ? (
                    <a
                      href={contractLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <FileText className="h-4 w-4" />
                      {tr('Open contract', 'Ouvrir le contrat')}
                    </a>
                  ) : null}
                  {marketplaceRequestId ? (
                    <a
                      href={`/account/messages?requestId=${encodeURIComponent(marketplaceRequestId)}`}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <MessageSquare className="h-4 w-4" />
                      {tr('Open chat', 'Ouvrir le chat')}
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}

            {workflowAction ? (
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{workflowAction.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-950">{workflowAction.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{workflowAction.detail}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {workflowAction.primaryLabel ? (
                    <button
                      type="button"
                      onClick={workflowAction.onPrimary}
                      className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px]"
                    >
                      {workflowAction.primaryLabel}
                    </button>
                  ) : null}
                  {workflowAction.secondaryLabel ? (
                    <button
                      type="button"
                      onClick={workflowAction.onSecondary}
                      className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300"
                    >
                      {workflowAction.secondaryLabel}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {isLiveRental ? (
              <CustomerRentalTimer rental={rental} variant="panel" />
            ) : null}

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Journey', 'Parcours')}</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Rental timeline', 'Timeline location')}</h3>
              <div className="mt-5 space-y-3">
                {journeySteps.map((step, index) => (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`mt-0.5 h-3 w-3 rounded-full ${step.state === 'done' ? 'bg-emerald-500' : step.state === 'current' ? 'bg-violet-600 ring-4 ring-violet-100' : 'bg-slate-200'}`} />
                      {index < journeySteps.length - 1 ? <div className="mt-1 h-full min-h-[28px] w-px bg-slate-200" /> : null}
                    </div>
                    <div className="min-w-0 pb-3">
                      <p className="text-sm font-semibold text-slate-950">{step.label}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                        {step.state === 'done' ? tr('Done', 'Terminée') : step.state === 'current' ? tr('Current', 'En cours') : tr('Upcoming', 'À venir')}
                        {step.timestamp ? ` • ${formatDateTime(step.timestamp, locale)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {['confirmed', 'pickup_ready'].includes(canonicalStage) ? (
              <section ref={openingInspectionRef} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Opening inspection', 'Inspection de départ')}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Pickup checklist', 'Checklist de départ')}</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <DetailRow label={tr('Odometer', 'Kilométrage')} value={openingInspection.odometer ? `${openingInspection.odometer}` : '—'} />
                  <DetailRow label={tr('Fuel', 'Carburant')} value={openingInspection.fuel ? `${openingInspection.fuel}` : '—'} />
                  <DetailRow label={tr('Condition', 'État')} value={openingInspection.condition || '—'} />
                  <DetailRow label={tr('Notes', 'Notes')} value={openingInspection.notes || '—'} />
                </div>
                <div className="mt-4">
                  <RentalEvidenceGallery
                    title={tr('Photos / videos', 'Photos / vidéos')}
                    subtitle={tr('Evidence saved during pickup.', 'Preuves enregistrées pendant le départ.')}
                    photos={handoffPhotos}
                    emptyLabel={tr('No pickup media uploaded yet.', 'Aucun média de départ téléversé pour le moment.')}
                  />
                </div>
              </section>
            ) : null}

            {['return_due', 'returned'].includes(canonicalStage) ? (
              <section ref={closingInspectionRef} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Closing inspection', 'Inspection de retour')}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Return checklist', 'Checklist de retour')}</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <DetailRow label={tr('Odometer', 'Kilométrage')} value={closingInspection.odometer ? `${closingInspection.odometer}` : '—'} />
                  <DetailRow label={tr('Fuel', 'Carburant')} value={closingInspection.fuel ? `${closingInspection.fuel}` : '—'} />
                  <DetailRow label={tr('Condition', 'État')} value={closingInspection.condition || '—'} />
                  <DetailRow label={tr('Notes', 'Notes')} value={closingInspection.notes || '—'} />
                </div>
                <div className="mt-4">
                  <RentalEvidenceGallery
                    title={tr('Photos / videos', 'Photos / vidéos')}
                    subtitle={tr('Evidence saved during return.', 'Preuves enregistrées pendant le retour.')}
                    photos={returnPhotos}
                    emptyLabel={tr('No return media uploaded yet.', 'Aucun média de retour téléversé pour le moment.')}
                  />
                </div>
              </section>
            ) : null}

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <button
                type="button"
                onClick={() => setShowMoneyDetails((current) => !current)}
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Payment', 'Paiement')}</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Final payment summary', 'Résumé final du paiement')}</h3>
                </div>
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition ${showMoneyDetails ? 'rotate-180' : ''}`}>
                  <ChevronDown className="h-5 w-5" />
                </span>
              </button>
              {showMoneyDetails ? (
                <div className="mt-5 space-y-3">
                  <DetailRow label={tr('Final total', 'Total final')} value={formatMoney(rental?.total, 'MAD', locale)} />
                  <DetailRow label={tr('Amount paid', 'Montant payé')} value={formatMoney(rental?.paid, 'MAD', locale)} />
                  <DetailRow label={tr('Still due', 'Reste à payer')} value={formatMoney(rental?.outstanding, 'MAD', locale)} />
                  <DetailRow label={tr('Payment status', 'Statut paiement')} value={paymentStatusLabel} />
                  <DetailRow label={tr('Deposit state', 'État de la caution')} value={depositStatusLabel} />
                  {rental?.totalExtensionFees > 0 ? (
                    <DetailRow label={tr('Approved extensions', 'Extensions approuvées')} value={formatMoney(rental.totalExtensionFees, 'MAD', locale)} />
                  ) : null}
                  {rental?.overageCharge > 0 ? (
                    <DetailRow label={tr('Extra kilometers', 'Kilomètres supplémentaires')} value={formatMoney(rental.overageCharge, 'MAD', locale)} />
                  ) : null}
                  {rental?.fuelCharge > 0 ? (
                    <DetailRow label={tr('Fuel adjustment', 'Ajustement carburant')} value={formatMoney(rental.fuelCharge, 'MAD', locale)} />
                  ) : null}
                  <DetailRow label={tr('Receipt status', 'Statut du reçu')} value={rental?.receiptIssued ? tr('Ready', 'Prêt') : tr('Pending', 'En attente')} />
                </div>
              ) : null}
            </section>

            {isCompletedRental ? (
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Trip media', 'Médias du trajet')}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Open and closed media', 'Médias d’ouverture et de clôture')}</h3>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <RentalEvidenceGallery
                    title={tr('Open media', 'Média ouverture')}
                    photos={handoffPhotos}
                    emptyLabel={tr('No opening media saved for this rental.', 'Aucun média d’ouverture enregistré pour cette location.')}
                  />
                  <RentalEvidenceGallery
                    title={tr('Closed media', 'Média clôture')}
                    photos={returnPhotos}
                    emptyLabel={tr('No closing media saved for this rental.', 'Aucun média de clôture enregistré pour cette location.')}
                  />
                </div>
              </section>
            ) : null}

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Customer', 'Client')}</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Customer card', 'Carte client')}</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <DetailRow label={tr('Name', 'Nom')} value={rental?.customerName || '—'} />
                <DetailRow label={tr('Verification', 'Vérification')} value={customerVerificationStatus || tr('Status unavailable', 'Statut indisponible')} />
                <DetailRow label={tr('Rental count', 'Nombre de locations')} value={customerRentalCount > 0 ? String(customerRentalCount) : tr('Current rental', 'Location actuelle')} />
                <DetailRow label={tr('Contact', 'Contact')} value={rental?.customerPhone || rental?.customerEmail || '—'} />
              </div>
              {marketplaceRequestId ? (
                <div className="mt-5">
                  <a
                    href={`/account/messages?requestId=${encodeURIComponent(marketplaceRequestId)}`}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {tr('Open chat', 'Ouvrir le chat')}
                  </a>
                </div>
              ) : null}
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Documents', 'Documents')}</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">{tr('Receipt and contract', 'Reçu et contrat')}</h3>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {contractLink ? (
                  <a
                    href={contractLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-between gap-3 rounded-[1.35rem] border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {tr('Open contract', 'Ouvrir le contrat')}
                    </span>
                    <span aria-hidden="true" className="text-xs text-violet-500">{tr('View', 'Voir')}</span>
                  </a>
                ) : null}
                {receiptLink ? (
                  <a
                    href={receiptLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-between gap-3 rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      {tr('Open receipt', 'Ouvrir le reçu')}
                    </span>
                    <span aria-hidden="true" className="text-xs text-slate-500">{tr('View', 'Voir')}</span>
                  </a>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );

  if (isPage) {
    return (
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="rounded-[1.7rem] bg-white">
            {content}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-slate-950/32 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute inset-x-4 top-4 bottom-4 ml-auto w-auto max-w-[42rem] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="h-full overflow-y-auto">
          {content}
        </div>
      </aside>
    </div>
  );
};

export default AccountRentalDetailDrawer;
