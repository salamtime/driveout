import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CarFront, FileCheck, GanttChartSquare, MessageSquareText, ShieldCheck, Star, UploadCloud } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import BusinessMarketplaceService, { getMarketplaceStatusLabel, getMarketplaceStatusTone } from '../../services/BusinessMarketplaceService';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import MessageService from '../../services/MessageService';
import {
  canOwnerPreApproveMarketplaceRequest,
  formatMarketplaceGraceCountdown,
  getMarketplaceChatGraceState,
  getMarketplaceMoneyBreakdown,
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  isMarketplaceRequestOpen,
} from '../../utils/marketplaceRequestState';
import VerificationService from '../../services/VerificationService';
import AccountStatCard from '../../components/account/AccountStatCard';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import MessageWidget from '../../components/messages/MessageWidget';
import { supabase } from '../../lib/supabase';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES } from '../../utils/messageCenter';
import { buildOwnerExecutionWorkspaceHref } from '../../utils/ownerRentalExecutionLinks';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';

const LAST_OWNER_VEHICLE_ID_KEY = 'driveout_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'driveout_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'driveout_owner_vehicle_ids';
const OWNER_STORAGE_LEGACY_KEYS = Object.freeze({
  [LAST_OWNER_VEHICLE_ID_KEY]: 'saharax_last_owner_vehicle_id',
  [LAST_OWNER_VEHICLE_COUNT_KEY]: 'saharax_last_owner_vehicle_count',
  [OWNER_VEHICLE_IDS_KEY]: 'saharax_owner_vehicle_ids',
});
const preloadOwnerVehicleProfileRoute = () => import('./AccountMarketplaceVehicleProfile');

const buildOwnerVehicleStorageKey = (baseKey, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const buildOwnerVehicleStorageKeys = (baseKey, userId = '') => {
  const primaryKey = buildOwnerVehicleStorageKey(baseKey, userId);
  const legacyBaseKey = OWNER_STORAGE_LEGACY_KEYS[baseKey];
  const legacyKey = legacyBaseKey ? buildOwnerVehicleStorageKey(legacyBaseKey, userId) : null;
  return [primaryKey, legacyKey].filter(Boolean);
};

const readOwnerVehicleStorageValue = (baseKey, userId = '', fallbackValue = null) => {
  if (typeof window === 'undefined') return fallbackValue;
  const storageKeys = buildOwnerVehicleStorageKeys(baseKey, userId);
  for (const storageKey of storageKeys) {
    const nextValue = window.localStorage.getItem(storageKey);
    if (nextValue !== null) return nextValue;
  }
  return fallbackValue;
};

const formatMoney = (amount, currency = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currency}`;

const formatDateTime = (value, locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const buildOwnerVehicleWorkspaceHref = (vehicleId, tab = 'overview') =>
  `/account/vehicles/${encodeURIComponent(String(vehicleId || ''))}/profile?tab=${encodeURIComponent(String(tab || 'overview'))}`;

const getOwnerVehicleSetupTarget = (vehicle, returnPath = '/account/vehicles') => {
  const vehicleId = String(vehicle?.id || '').trim();
  const buildTarget = (tab, section) => ({
    to: buildOwnerVehicleWorkspaceHref(vehicleId, tab),
    state: {
      from: returnPath,
      resumeEditing: true,
      focusSectionId: section,
    },
  });

  const listingStatus = String(vehicle?.listingStatus || '').trim().toLowerCase();
  const reviewStatus = String(vehicle?.reviewStatus || '').trim().toLowerCase();
  const moderationStatus = String(vehicle?.moderationStatus || '').trim().toLowerCase();
  const vehicleVerificationStatus = String(vehicle?.vehicleVerificationStatus || '').trim().toLowerCase();
  const vehicleBasicsComplete = Boolean(
    String(vehicle?.brandName || '').trim() &&
    String(vehicle?.modelName || '').trim() &&
    String(vehicle?.plateNumber || vehicle?.rawProfile?.plate_number || '').trim() &&
    String(vehicle?.cityName || '').trim()
  );
  const mediaItems = Array.isArray(vehicle?.media) ? vehicle.media : [];
  const vehiclePhotosComplete = Boolean(String(vehicle?.coverImageUrl || '').trim()) || mediaItems.some((item) => String(item?.url || '').trim());
  const vehicleDocumentsComplete = Boolean(vehicle?.vehicleVerificationComplete) && vehicleVerificationStatus === 'approved';
  const vehicleDocumentsPending = ['pending', 'in_review'].includes(vehicleVerificationStatus);
  const listingDetailsComplete = Boolean(String(vehicle?.listingTitle || vehicle?.title || '').trim());
  const listingPricingComplete = [vehicle?.dailyPrice, vehicle?.halfDayPrice, vehicle?.hourlyPrice, vehicle?.weeklyPrice].some((value) => Number(value || 0) > 0) &&
    !(vehicle?.depositAmount === '' || vehicle?.depositAmount === null || vehicle?.depositAmount === undefined);
  const pickupSetupComplete = Boolean(String(vehicle?.pickupLocationName || vehicle?.pickupAddress || vehicle?.rawProfile?.pickup_location_name || '').trim());

  if (['pending_review', 'approved', 'live'].includes(listingStatus) || ['pending_review', 'approved'].includes(reviewStatus)) {
    return buildTarget('listing', 'listing-journey');
  }
  if (['changes_requested', 'rejected'].includes(moderationStatus) || reviewStatus === 'rejected' || listingStatus === 'rejected') {
    return buildTarget('listing', 'listing-journey');
  }
  if (!vehicleBasicsComplete) return buildTarget('overview', 'vehicle-basics');
  if (!vehiclePhotosComplete) return buildTarget('overview', 'primary-photo');
  if (!vehicleDocumentsComplete && !vehicleDocumentsPending) return buildTarget('legal', 'legal-documents');
  if (!listingDetailsComplete || !listingPricingComplete) return buildTarget('listing', 'listing-details');
  if (!pickupSetupComplete) return buildTarget('listing', 'listing-rules');
  return buildTarget('listing', 'listing-journey');
};

const readStoredOwnerVehicleIds = (userId = '') => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = JSON.parse(readOwnerVehicleStorageValue(OWNER_VEHICLE_IDS_KEY, userId, '[]') || '[]');
    return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const writeStoredOwnerVehicleIds = (userId, vehicleIds) => {
  if (typeof window === 'undefined') return;

  const normalized = Array.from(new Set((vehicleIds || []).map((item) => String(item || '').trim()).filter(Boolean)));
  try {
    window.localStorage.setItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId), JSON.stringify(normalized));
  } catch {
    // ignore local storage issues
  }
};

const isMeaningfulOwnerVehicle = (vehicle) => {
  if (!vehicle) return false;
  if (vehicle?.isActive === false) return false;

  const hasIdentity = [
    vehicle?.brandName,
    vehicle?.modelName,
    vehicle?.title && vehicle.title !== 'Marketplace vehicle' && vehicle.title !== 'Profil véhicule' && vehicle.title !== 'Vehicle profile' ? vehicle.title : '',
    vehicle?.coverImageUrl,
    vehicle?.listingId,
  ].some((value) => String(value || '').trim());

  const hasCommercialData = [
    vehicle?.hourlyPrice,
    vehicle?.dailyPrice,
    vehicle?.weeklyPrice,
    vehicle?.depositAmount,
  ].some((value) => Number(value || 0) > 0);

  const hasWorkflowState = ['pending_review', 'approved', 'live', 'rejected', 'changes_requested'].includes(
    String(vehicle?.listingStatus || vehicle?.reviewStatus || vehicle?.moderationStatus || '').trim().toLowerCase()
  );

  return hasIdentity || hasCommercialData || hasWorkflowState;
};

const getReviewCardTone = (status) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (['changes_requested', 'rejected', 'not_reviewed'].includes(normalized)) {
    return {
      shell: 'border-amber-200 bg-amber-50',
      text: 'text-amber-950',
      muted: 'text-amber-700',
    };
  }

  if (['approved', 'live'].includes(normalized)) {
    return {
      shell: 'border-emerald-200 bg-emerald-50',
      text: 'text-emerald-950',
      muted: 'text-emerald-700',
    };
  }

  return {
    shell: 'border-sky-200 bg-sky-50',
    text: 'text-sky-950',
    muted: 'text-sky-700',
  };
};

const getMessageCardTone = (messageType) => {
  const normalized = String(messageType || '').trim().toLowerCase();

  if (['changes_requested', 'rejected'].includes(normalized)) {
    return {
      shell: 'border-amber-200 bg-amber-50',
      text: 'text-amber-950',
      muted: 'text-amber-700',
    };
  }

  if (['approved', 'live'].includes(normalized)) {
    return {
      shell: 'border-emerald-200 bg-emerald-50',
      text: 'text-emerald-950',
      muted: 'text-emerald-700',
    };
  }

  return {
    shell: 'border-violet-200 bg-violet-50',
    text: 'text-violet-950',
    muted: 'text-violet-700',
  };
};

const getEffectiveVehicleReviewStatus = (vehicle) => {
  const listingStatus = String(vehicle?.listingStatus || '').trim().toLowerCase();
  const reviewStatus = String(vehicle?.reviewStatus || '').trim().toLowerCase();
  const moderationStatus = String(vehicle?.moderationStatus || '').trim().toLowerCase();

  if (moderationStatus === 'changes_requested') return 'changes_requested';
  if (listingStatus === 'pending_review') return 'pending_review';
  if (reviewStatus) return reviewStatus;
  if (moderationStatus === 'pending_review') return 'pending_review';
  return 'not_submitted';
};

const getVehicleVerificationStatusMeta = (vehicle, tr) => {
  const status = String(vehicle?.vehicleVerificationStatus || '').trim().toLowerCase();

  if (status === 'approved' && vehicle?.vehicleVerificationComplete) {
    return {
      ready: true,
      label: tr('Vehicle verified', 'Véhicule vérifié'),
      hint: tr('Ready for listing review', "Prêt pour la revue de l'annonce"),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (status === 'rejected' || status === 'suspended' || status === 'expired') {
    return {
      ready: false,
      label: tr('Verification needs update', 'Vérification à corriger'),
      hint: tr('Resolve the legal document issues first', "Corrigez d'abord les documents légaux"),
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    ready: false,
    label: tr('Verification required', 'Vérification requise'),
    hint: tr('Complete vehicle verification first', "Complétez d'abord la vérification"),
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  };
};

const getOwnerListingJourneyLabel = (vehicle, tr) => {
  const listingStatus = String(vehicle?.listingStatus || '').trim().toLowerCase();
  const reviewStatus = String(vehicle?.reviewStatus || '').trim().toLowerCase();
  const moderationStatus = String(vehicle?.moderationStatus || '').trim().toLowerCase();

  if (listingStatus === 'live') return tr('Live listing', 'Annonce en ligne');
  if (listingStatus === 'approved' || reviewStatus === 'approved') {
    return tr('Approved for publication', 'Approuvé pour publication');
  }
  if (moderationStatus === 'changes_requested') {
    return tr('Listing changes requested', "Modifications d'annonce demandées");
  }
  if (listingStatus === 'pending_review' || reviewStatus === 'pending_review' || moderationStatus === 'pending_review') {
    return tr('Waiting for admin approval', "En attente de l'approbation admin");
  }
  if (listingStatus === 'rejected' || reviewStatus === 'rejected') {
    return tr('Listing not approved', 'Annonce non approuvée');
  }
  return tr('Private vehicle', 'Véhicule privé');
};

const getOwnerListingStatusLabel = (vehicle, tr) => {
  const listingStatus = String(vehicle?.listingStatus || '').trim().toLowerCase();
  const reviewStatus = String(vehicle?.reviewStatus || '').trim().toLowerCase();
  const moderationStatus = String(vehicle?.moderationStatus || '').trim().toLowerCase();

  if (listingStatus === 'live') return tr('Live', 'En ligne');
  if (listingStatus === 'approved' || reviewStatus === 'approved') return tr('Approved for publication', 'Approuvé pour publication');
  if (moderationStatus === 'changes_requested') return tr('Changes requested', 'Modifications demandées');
  if (listingStatus === 'pending_review' || reviewStatus === 'pending_review') return tr('Waiting for admin approval', "En attente de l'approbation admin");
  if (listingStatus === 'rejected' || reviewStatus === 'rejected') return tr('Needs owner update', 'À corriger par le propriétaire');
  if (listingStatus === 'unpublished') return tr('Unpublished', 'Non publiée');
  return tr('Draft', 'Brouillon');
};

const getOwnerReviewStatusLabel = (vehicle, tr) => {
  const reviewStatus = getEffectiveVehicleReviewStatus(vehicle);
  const moderationStatus = String(vehicle?.moderationStatus || '').trim().toLowerCase();

  if (reviewStatus === 'approved') return tr('Review passed', 'Revue validée');
  if (reviewStatus === 'changes_requested' || moderationStatus === 'changes_requested') return tr('Feedback waiting on you', 'Retour en attente de votre action');
  if (reviewStatus === 'pending_review') return tr('Waiting for admin approval', "En attente de l'approbation admin");
  if (moderationStatus === 'changes_requested') return tr('Feedback waiting on you', 'Retour en attente de votre action');
  if (reviewStatus === 'rejected') return tr('Review not approved', 'Revue non approuvée');
  return tr('Not submitted yet', 'Pas encore soumis');
};

const MoneyLine = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm text-slate-500">{label}</span>
    <span className={`text-sm ${strong ? 'font-bold text-slate-950' : 'font-semibold text-slate-700'}`}>
      {value}
    </span>
  </div>
);

const OwnerPickupWindowBanner = ({ active = false, countdownLabel = '0m', expired = false, tr }) => {
  if (expired) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">{tr('Pickup window expired', 'Fenêtre de remise expirée')}</p>
        <p className="mt-1 text-sm text-slate-600">
          {tr(
            'The approval window passed without handoff. Review the renter chat before continuing.',
            "La fenêtre d'approbation est passée sans remise. Vérifiez le chat locataire avant de continuer."
          )}
        </p>
      </div>
    );
  }

  if (!active) return null;

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="text-sm font-bold text-slate-900">
        {tr('Pickup window ends in', 'La fenêtre de remise se termine dans')} {countdownLabel}
      </p>
    </div>
  );
};

const OwnerVehicleCard = ({
  vehicle,
  tr,
  locale,
  onOpenProfile,
  onOpenListingTab,
  onOpenBookingsTab,
  onOpenLegalTab,
  onOpenReviews,
  onPrefetchProfile,
}) => {
  const reviewStatus = getEffectiveVehicleReviewStatus(vehicle);
  const moderationStatus = String(vehicle?.moderationStatus || '').toLowerCase();
  const listingStatus = String(vehicle?.listingStatus || '').toLowerCase();
  const verificationMeta = getVehicleVerificationStatusMeta(vehicle, tr);
  const listingJourneyLabel = getOwnerListingJourneyLabel(vehicle, tr);
  const reviewJourneyLabel = getOwnerReviewStatusLabel(vehicle, tr);
  const primaryPrice = vehicle?.dailyPrice || vehicle?.halfDayPrice || vehicle?.hourlyPrice || vehicle?.weeklyPrice || 0;
  const pricingLabel = vehicle?.dailyPrice
    ? tr('/ day', '/ jour')
    : vehicle?.halfDayPrice
      ? tr('/ half-day', '/ demi-journée')
    : vehicle?.hourlyPrice
      ? tr('/ hour', '/ heure')
      : vehicle?.weeklyPrice
        ? tr('/ week', '/ semaine')
        : '';
  const statusMeta = (() => {
    if (listingStatus === 'live') {
      return {
        label: tr('Live', 'En ligne'),
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        action: tr('View details', 'Voir les détails'),
      };
    }

    if (moderationStatus === 'changes_requested') {
      return {
        label: tr('Changes requested', 'Modifications demandées'),
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        action: tr('View details', 'Voir les détails'),
      };
    }

    if (listingStatus === 'pending_review' || reviewStatus === 'pending_review') {
      return {
        label: tr('Waiting for admin approval', "En attente de l'approbation admin"),
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
        action: tr('View details', 'Voir les détails'),
      };
    }

    if (['changes_requested', 'rejected'].includes(moderationStatus) || ['rejected'].includes(reviewStatus)) {
      return {
        label: tr('Needs changes', 'À corriger'),
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        action: tr('Fix listing', "Corriger l'annonce"),
      };
    }

    if (!verificationMeta.ready || ['draft', 'unpublished', 'not_submitted', 'not_reviewed'].includes(listingStatus || reviewStatus)) {
      return {
        label: tr('Needs setup', 'Configuration requise'),
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
        action: tr('Complete setup', 'Compléter la configuration'),
      };
    }

    return {
      label: tr('View details', 'Voir les détails'),
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      action: tr('View details', 'Voir les détails'),
    };
  })();

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenProfile}
      onMouseEnter={onPrefetchProfile}
      onTouchStart={onPrefetchProfile}
      onFocus={onPrefetchProfile}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenProfile();
        }
      }}
      className="w-full rounded-[1.85rem] border border-violet-300 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05),0_0_0_1px_rgba(167,139,250,0.2)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_58px_rgba(79,70,229,0.10),0_18px_42px_rgba(15,23,42,0.08),0_0_0_1px_rgba(167,139,250,0.28)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          {vehicle?.coverImageUrl ? (
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 shadow-sm">
              <img
                src={vehicle.coverImageUrl}
                alt={vehicle?.title || 'Marketplace vehicle'}
                className="h-28 w-36 object-cover"
              />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusMeta.tone}`}>
                {statusMeta.label}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verificationMeta.tone}`}>
                {verificationMeta.label}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-950">
              {vehicle?.title || tr('Marketplace vehicle', 'Véhicule marketplace')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {[vehicle?.cityName, vehicle?.areaName].filter(Boolean).join(' • ') || tr('Owner listing', 'Annonce propriétaire')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {primaryPrice > 0
                  ? `${formatMoney(primaryPrice, vehicle?.currencyCode || 'MAD', locale)} ${pricingLabel}`
                  : tr('Pricing pending', 'Tarification en attente')}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Listing', 'Annonce')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{listingJourneyLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Review', 'Revue')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{reviewJourneyLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Verification', 'Vérification')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{verificationMeta.hint}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              {tr(
                'Pricing, availability, documents, and go-live actions all stay connected inside this listing workspace.',
                "Tarification, disponibilité, documents et publication restent connectés dans cet espace annonce."
              )}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-[260px]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenProfile();
            }}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(79,70,229,0.18)] transition hover:-translate-y-0.5"
          >
            {statusMeta.action}
          </button>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenListingTab();
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              {tr('Pricing & live', 'Prix et mise en ligne')}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenBookingsTab();
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              {tr('Bookings', 'Réservations')}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenLegalTab();
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              {tr('Legal & docs', 'Légal et docs')}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenReviews();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Star className="h-4 w-4" />
              {tr('Reviews & rep', 'Avis et réputation')}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

const OwnerRequestRow = ({
  request,
  tr,
  locale,
  now,
  highlighted = false,
  onOpenMessages,
}) => {
  const money = getMarketplaceMoneyBreakdown({
    estimatedAmount: request?.estimatedAmount || request?.dailyPrice || request?.halfDayPrice || request?.hourlyPrice,
    commissionAmount: request?.commissionAmount,
  });
  const chatGraceState = getMarketplaceChatGraceState({
    status: request?.requestStatus,
    chatGraceExpiresAt: request?.chatGraceExpiresAt || null,
    now,
  });
  const graceCountdownLabel = chatGraceState.active
    ? formatMarketplaceGraceCountdown(chatGraceState.remainingMs)
    : '0m';

  return (
    <article
      id={request?.id ? `owner-request-${request.id}` : undefined}
      className={`rounded-[1.6rem] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] ${
        highlighted
          ? 'border border-violet-300 bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.14),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#faf5ff_100%)]'
          : 'border border-slate-200 bg-white'
      }`}
    >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${getMarketplaceStatusTone(request?.requestStatus)}`}>
            {getMarketplaceStatusLabel(request?.requestStatus)}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {request?.listingTitle || tr('Marketplace request', 'Demande marketplace')}
          </span>
        </div>
        {request?.requestReference ? (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {tr('Reference', 'Référence')} {request.requestReference}
          </p>
        ) : null}
        <h3 className="mt-3 text-lg font-bold text-slate-950">{request?.customerName || tr('Customer', 'Client')}</h3>
        <p className="mt-1 text-sm text-slate-500">{request?.customerEmail || request?.customerPhone || '—'}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Rental amount', 'Montant location')}</p>
        <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(money.estimatedAmount, request?.currencyCode || 'MAD', locale)}</p>
      </div>
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Requested start', 'Début demandé')}</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(request?.requestedStartAt, locale)}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Requested end', 'Fin demandée')}</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(request?.requestedEndAt, locale)}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Owner response', 'Réponse propriétaire')}</p>
        <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
          {request?.ownerResponse || tr('No owner reply yet', 'Aucune réponse propriétaire pour le moment')}
        </p>
      </div>
    </div>

    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="space-y-2">
        <MoneyLine
          label={tr('DriveOut fee (15%)', 'Frais DriveOut (15 %)')}
          value={formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale)}
        />
        <MoneyLine
          label={tr('Expected payout', 'Versement attendu')}
          value={formatMoney(money.ownerPayoutAmount, request?.currencyCode || 'MAD', locale)}
          strong
        />
      </div>
    </div>

    {isMarketplaceChatUnlocked(request?.requestStatus) ? (
      <OwnerPickupWindowBanner
        active={chatGraceState.active}
        countdownLabel={graceCountdownLabel}
        expired={chatGraceState.expired}
        tr={tr}
      />
    ) : null}

    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => onOpenMessages?.(request)}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
      >
        <MessageSquareText className="h-4 w-4" />
        {tr('Open in Inbox', 'Ouvrir dans Inbox')}
      </button>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {tr('Approve, decline, and counter-offer now happen inside Inbox so the booking timeline stays in one place.', 'Les approbations, refus et contre-offres se font maintenant dans Inbox pour garder toute la chronologie au même endroit.')}
      </div>
    </div>
  </article>
);
};

const EmptyVehicleWorkspace = ({ tr, onCreate }) => (
  <div className="rounded-[32px] border border-dashed border-violet-200 bg-white/80 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-xl">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-500">
          {tr('Listings', 'Annonces')}
        </p>
        <h2 className="mt-3 text-3xl font-black text-slate-950">
          {tr('Start your first listing', 'Commencez votre première annonce')}
        </h2>
        <p className="mt-4 text-base text-slate-600">
          {tr(
            'Create the vehicle workspace first, then manage pricing, documents, booking readiness, and go-live status from one listings hub.',
            "Créez d'abord l'espace véhicule, puis gérez prix, documents, préparation des réservations et statut de publication depuis un seul hub annonces."
          )}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200/70 transition hover:bg-violet-700"
        >
          <UploadCloud className="h-4 w-4" />
          {tr('Start listing', "Démarrer l'annonce")}
        </button>
      </div>

      <div className="grid flex-1 gap-4 sm:grid-cols-2">
        {[
          {
            icon: CarFront,
            title: tr('Vehicle basics', 'Infos véhicule'),
            copy: tr('Model, plate, specs, and profile basics.', 'Modèle, plaque, caractéristiques et profil.'),
          },
          {
            icon: ShieldCheck,
            title: tr('Legal & documents', 'Documents légaux'),
            copy: tr('Upload insurance, registration, and licenses.', 'Ajoutez assurance, immatriculation, licences.'),
          },
          {
            icon: FileCheck,
            title: tr('Media & condition', 'Photos & état'),
            copy: tr('Add photos so you can track condition over time.', 'Ajoutez des photos pour suivre l’état.'),
          },
          {
            icon: GanttChartSquare,
            title: tr('Listing ready', 'Annonce prête'),
            copy: tr('Optional pricing + availability if you want to rent.', 'Tarifs + disponibilité si vous voulez louer.'),
          },
        ].map((step) => (
          <div key={step.title} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">
                <step.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="text-xs text-slate-500">{step.copy}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const AccountMarketplace = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user, userProfile, startPrivateOwnerSetup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [submittingVehicleId, setSubmittingVehicleId] = useState('');
  const [selectedFeedbackVehicle, setSelectedFeedbackVehicle] = useState(null);
  const [feedbackThreadOpenSignal, setFeedbackThreadOpenSignal] = useState(0);
  const [selectedRequestConversation, setSelectedRequestConversation] = useState(null);
  const [selectedRequestConversationThreadKey, setSelectedRequestConversationThreadKey] = useState('');
  const [requestConversationOpenSignal, setRequestConversationOpenSignal] = useState(0);
  const [requestConversationLauncherDismissed, setRequestConversationLauncherDismissed] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState('');
  const [counterOfferRequestId, setCounterOfferRequestId] = useState('');
  const [counterOfferDrafts, setCounterOfferDrafts] = useState({});
  const [holdNow, setHoldNow] = useState(Date.now());
  const realtimeReloadTimerRef = useRef(null);
  const selectedRequestId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('requestId') || '').trim();
  }, [location.search]);
  const selectedMessageRequestId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('messageRequestId') || '').trim();
  }, [location.search]);
  const selectedConversationRequestId = useMemo(
    () => String(selectedMessageRequestId || selectedRequestId || '').trim(),
    [selectedMessageRequestId, selectedRequestId]
  );
  const returnPath = useMemo(
    () =>
      location.state?.from ||
      `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search, location.state]
  );
  const canReturn = Boolean(
    location.state?.from &&
      location.state.from !== `${location.pathname}${location.search}${location.hash}`
  );

  const loadWorkspace = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const [vehiclesResult, requestsResult, accountSnapshot] = await Promise.all([
        BusinessMarketplaceService.getOwnerVehicles(user.id),
        BusinessMarketplaceService.getOwnerRequests(user.id, 'all'),
        CustomerExperienceService.getCustomerAccountSnapshot(user).catch(() => null),
      ]);

      if (vehiclesResult?.error && !vehiclesResult?.setupRequired) {
        throw vehiclesResult.error;
      }
      if (requestsResult?.error && !requestsResult?.setupRequired) {
        throw requestsResult.error;
      }

      let ownerVehicles = Array.isArray(vehiclesResult?.vehicles) ? vehiclesResult.vehicles : [];
        const storedVehicleIds = readStoredOwnerVehicleIds(user?.id);
      const missingStoredIds = storedVehicleIds.filter(
        (vehicleId) => !ownerVehicles.some((vehicle) => String(vehicle?.id) === String(vehicleId))
      );

      if (missingStoredIds.length > 0) {
        const missingVehicles = await Promise.all(
          missingStoredIds.map(async (vehicleId) => {
            const result = await BusinessMarketplaceService.getOwnerVehicle(user.id, vehicleId);
            if (result?.error || !result?.vehicle) return null;
            return {
              id: result.vehicle.id,
              listingId: result.vehicle.listingId || null,
              title: [result.vehicle.brandName, result.vehicle.modelName].filter(Boolean).join(' ') || (isFrench ? 'Profil véhicule' : 'Vehicle profile'),
              brandName: result.vehicle.brandName || '',
              modelName: result.vehicle.modelName || '',
              categoryCode: result.vehicle.categoryCode || 'atv',
              cityName: result.vehicle.cityName || '',
              areaName: result.vehicle.areaName || '',
              coverImageUrl: result.vehicle.coverImageUrl || null,
              shortDescription: result.vehicle.shortDescription || '',
              marketplaceVisible: Boolean(result.vehicle.rawProfile?.marketplace_visible),
              isActive: result.vehicle.rawProfile?.is_active !== false,
              listingStatus: result.vehicle.listingStatus || 'draft',
              reviewStatus: result.vehicle.reviewStatus || 'not_submitted',
              bookingMode: result.vehicle.rawListing?.booking_mode || 'request',
              hourlyPrice: Number(result.vehicle.hourlyPriceAmount || 0),
              dailyPrice: Number(result.vehicle.dailyPriceAmount || 0),
              weeklyPrice: Number(result.vehicle.weeklyPriceAmount || 0),
              depositAmount: Number(result.vehicle.depositAmount || 0),
              currencyCode: result.vehicle.currencyCode || 'MAD',
              adminFeedback: result.vehicle.adminFeedback || '',
              moderationStatus: result.vehicle.moderationStatus || 'not_reviewed',
              changesRequestedAt: result.vehicle.rawListing?.changes_requested_at || null,
              resubmittedAt: result.vehicle.rawListing?.resubmitted_at || null,
              latestOwnerMessage: Array.isArray(result.vehicle.ownerMessages) ? result.vehicle.ownerMessages[0]?.body || '' : '',
              latestOwnerMessageAt: Array.isArray(result.vehicle.ownerMessages) ? result.vehicle.ownerMessages[0]?.createdAt || null : null,
              latestOwnerMessageType: Array.isArray(result.vehicle.ownerMessages) ? result.vehicle.ownerMessages[0]?.messageType || 'message' : 'message',
              latestOwnerMessageSenderType: Array.isArray(result.vehicle.ownerMessages) ? result.vehicle.ownerMessages[0]?.senderType || 'admin' : 'admin',
              submittedAt: result.vehicle.rawListing?.submitted_at || null,
              reviewedAt: result.vehicle.rawListing?.reviewed_at || null,
              publishedAt: result.vehicle.rawListing?.published_at || null,
              updatedAt: result.vehicle.rawListing?.updated_at || result.vehicle.rawProfile?.updated_at || result.vehicle.rawProfile?.created_at || null,
              rawProfile: result.vehicle.rawProfile || null,
              rawListing: result.vehicle.rawListing || null,
            };
          })
        );

        ownerVehicles = [...ownerVehicles, ...missingVehicles.filter(Boolean)];
      }

      ownerVehicles = ownerVehicles.filter(
        (vehicle, index, allVehicles) => allVehicles.findIndex((item) => String(item?.id) === String(vehicle?.id)) === index
      );
      ownerVehicles = ownerVehicles.filter((vehicle) => isMeaningfulOwnerVehicle(vehicle));
      ownerVehicles = await Promise.all(
        ownerVehicles.map(async (vehicle) => {
          try {
            const verificationResult = await VerificationService.getEntityVerificationSummary('vehicle', vehicle.id);
            const summary = verificationResult?.summary || null;
            return {
              ...vehicle,
              vehicleVerificationStatus: summary?.status || 'pending',
              vehicleVerificationComplete: Boolean(summary?.complete),
              vehicleVerificationMissing: Array.isArray(summary?.missing) ? summary.missing : [],
            };
          } catch {
            return {
              ...vehicle,
              vehicleVerificationStatus: 'pending',
              vehicleVerificationComplete: false,
              vehicleVerificationMissing: [],
            };
          }
        })
      );
      setVehicles(ownerVehicles);
      if (typeof window !== 'undefined') {
        try {
          const knownVehicleCount = Math.max(ownerVehicles.length, storedVehicleIds.length);
          window.localStorage.setItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, user?.id), String(knownVehicleCount));
          if (ownerVehicles.length > 0) {
            window.localStorage.setItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, user?.id), String(ownerVehicles[0].id));
          } else {
            window.localStorage.removeItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, user?.id));
          }
          writeStoredOwnerVehicleIds(user?.id, ownerVehicles.map((vehicle) => vehicle?.id));
        } catch {
          // ignore local storage issues
        }
      }
      setRequests(Array.isArray(requestsResult?.requests) ? requestsResult.requests : []);
    } catch (loadError) {
      setError(loadError?.message || (isFrench
        ? 'Impossible de charger votre espace véhicules pour le moment.'
        : 'Unable to load your vehicle workspace right now.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, isFrench]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (loading) return;
    if (location.pathname !== '/account/vehicles') return;
    if (selectedRequestId) return;
    if (vehicles.length !== 1) return;

    const target = getOwnerVehicleSetupTarget(vehicles[0], returnPath);
    navigate(target.to, {
      replace: true,
      state: target.state,
    });
  }, [loading, location.pathname, navigate, returnPath, selectedRequestId, vehicles]);

  useEffect(() => {
    if (!selectedRequestId || loading) return undefined;

    const timer = window.setTimeout(() => {
      const node = document.getElementById(`owner-request-${selectedRequestId}`);
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedRequestId, loading, requests.length]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const scheduleRealtimeReload = () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = window.setTimeout(() => {
        void loadWorkspace();
      }, 300);
    };

    const channel = supabase
      .channel(`owner-marketplace-listings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_marketplace_listings',
          filter: `owner_id=eq.${user.id}`,
        },
        scheduleRealtimeReload
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore realtime cleanup failures.
      }
    };
  }, [loadWorkspace, user?.id]);

  useEffect(() => {
    const shouldTick = requests.some(
      (request) =>
        isMarketplaceChatUnlocked(request?.requestStatus) &&
        String(request?.chatGraceExpiresAt || '').trim()
    );
    if (!shouldTick) return undefined;

    const timer = window.setInterval(() => {
      setHoldNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [requests]);

  const stats = useMemo(() => {
    const liveVehicles = vehicles.filter((vehicle) => String(vehicle?.listingStatus || '').toLowerCase() === 'live').length;
    const pendingReview = vehicles.filter((vehicle) => String(vehicle?.listingStatus || '').toLowerCase() === 'pending_review').length;
    const changesRequested = vehicles.filter((vehicle) => String(vehicle?.moderationStatus || '').toLowerCase() === 'changes_requested').length;
    const needsSetup = vehicles.filter((vehicle) => {
      const listingStatus = String(vehicle?.listingStatus || '').toLowerCase();
      const reviewStatus = String(vehicle?.reviewStatus || '').toLowerCase();
      const moderationStatus = String(vehicle?.moderationStatus || '').toLowerCase();
      return !['live', 'approved'].includes(listingStatus) &&
        !['approved'].includes(reviewStatus) &&
        moderationStatus !== 'pending_review';
    }).length;
    const openRequests = requests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus)).length;
    const deposits = vehicles.reduce((sum, vehicle) => sum + Number(vehicle?.depositAmount || 0), 0);
    return { liveVehicles, pendingReview, changesRequested, needsSetup, openRequests, deposits };
  }, [vehicles, requests]);
  const primaryVehicle = useMemo(() => {
    if (!vehicles.length) return null;
    return vehicles[0];
  }, [vehicles]);
  const visibleOwnerRequests = useMemo(() => {
    if (!selectedRequestId) {
      return requests.slice(0, 6);
    }

    const selected = requests.find((request) => String(request?.id || '') === selectedRequestId) || null;
    const remainder = requests.filter((request) => String(request?.id || '') !== selectedRequestId);
    return selected ? [selected, ...remainder.slice(0, 5)] : requests.slice(0, 6);
  }, [requests, selectedRequestId]);
  const selectedRequestConversationSeedThread = useMemo(() => {
    if (!selectedRequestConversation?.id) return null;
    const lifecycleStatus = String(selectedRequestConversation?.requestStatus || '').trim().toLowerCase();
    const chatUnlocked = isMarketplaceChatUnlocked(lifecycleStatus);
    const displayState = getMarketplaceRequestDisplay(lifecycleStatus, tr);

    return {
      id: `marketplace-owner-${selectedRequestConversation.id}`,
      thread_key: '',
      family: MESSAGE_FAMILIES.marketplace,
      thread_type: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
      entity_type: 'marketplace_request',
      entity_id: String(selectedRequestConversation.id),
      subject: selectedRequestConversation.listingTitle || tr('Marketplace request', 'Demande marketplace'),
      latest_message: selectedRequestConversation.ownerResponse || selectedRequestConversation.customerMessage || '',
      latest_message_at: selectedRequestConversation.updatedAt || selectedRequestConversation.createdAt || null,
      unread_count: 0,
      metadata: {
        href: buildOwnerExecutionWorkspaceHref(selectedRequestConversation, { focus: 'request' }),
        requestId: selectedRequestConversation.id,
        requestStatus: selectedRequestConversation.requestStatus,
        roleContext: 'owner',
        replyEnabled: chatUnlocked,
        readOnlyReason: chatUnlocked ? '' : displayState.readOnlyReason,
      },
      messages: [],
    };
  }, [selectedRequestConversation, tr]);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  const handleCreateVehicle = async () => {
    await startPrivateOwnerSetup({ source: 'account_vehicles' });
    navigate('/account/vehicles/new/profile?tab=overview', {
      state: { from: '/account/vehicles' },
    });
  };

  const handlePrefetchVehicleProfile = useCallback(() => {
    void preloadOwnerVehicleProfileRoute();
  }, []);

  const handleContinueVehicleSetup = useCallback(
    async (vehicleId) => {
      await preloadOwnerVehicleProfileRoute();
      const vehicle = vehicles.find((item) => String(item?.id) === String(vehicleId));
      const target = getOwnerVehicleSetupTarget(vehicle, returnPath);
      navigate(target.to, {
        state: target.state,
      });
    },
    [navigate, returnPath, vehicles]
  );

  const handleOpenVehicleTab = useCallback(
    async (vehicleId, tab = 'overview', section = '') => {
      await preloadOwnerVehicleProfileRoute();
      navigate(buildOwnerVehicleWorkspaceHref(vehicleId, tab), {
        state: {
          from: returnPath,
          resumeEditing: true,
          focusSectionId: section,
        },
      });
    },
    [navigate, returnPath]
  );

  const handleOpenVehicleReviews = useCallback(
    (vehicle) => {
      const vehicleId = String(vehicle?.id || '').trim();
      if (!vehicleId) return;

      const params = new URLSearchParams({
        panel: 'vehicle',
        vehicleId,
      });

      navigate(`/account/reviews?${params.toString()}`, {
        state: {
          from: returnPath,
          vehicleId,
          listingId: vehicle?.listingId || '',
          vehicleTitle: vehicle?.title || [vehicle?.brandName, vehicle?.modelName].filter(Boolean).join(' ') || '',
          source: 'listings',
        },
      });
    },
    [navigate, returnPath]
  );

  const handleSubmitVehicleForReview = async (vehicle) => {
    if (!user?.id || !vehicle?.id) return;

    try {
      setSubmittingVehicleId(String(vehicle.id));
      const result = await BusinessMarketplaceService.submitOwnerVehicleForReview({
        ownerId: user.id,
        vehicleId: vehicle.id,
        accountType:
          userProfile?.accountType ||
          user?.user_metadata?.account_type ||
          user?.app_metadata?.account_type ||
          'individual_owner',
        metadata: {
          full_name: userProfile?.fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || '',
          company_name: userProfile?.companyName || user?.user_metadata?.company_name || '',
          city: userProfile?.city || user?.user_metadata?.city || '',
          country: userProfile?.country || user?.user_metadata?.country || '',
          email: userProfile?.email || user?.email || '',
        },
      });
      setVehicles((current) =>
        current.map((item) =>
          String(item?.id) === String(vehicle.id)
            ? {
                ...item,
                ...(result?.vehicle || {}),
                listingStatus: 'pending_review',
                reviewStatus: 'pending_review',
                moderationStatus: 'pending_review',
                submittedAt: new Date().toISOString(),
              }
            : item
        )
      );
      toast.success(tr('Vehicle submitted for approval.', 'Véhicule envoyé pour approbation.'));
      window.setTimeout(() => {
        void loadWorkspace();
      }, 1200);
    } catch (submitError) {
      toast.error(submitError?.message || tr('Unable to submit this vehicle right now.', 'Impossible de soumettre ce véhicule pour le moment.'));
    } finally {
      setSubmittingVehicleId('');
    }
  };

  const handleOpenFeedbackThread = useCallback((vehicle) => {
    if (!vehicle?.listingId) return;
    setSelectedFeedbackVehicle(vehicle);
    setFeedbackThreadOpenSignal((current) => current + 1);
  }, []);
  const handleOpenRequestConversation = useCallback((request) => {
    if (!request?.id) return;
    setRequestConversationLauncherDismissed(false);
    setSelectedRequestConversation(request);
    setSelectedRequestConversationThreadKey('');
    setRequestConversationOpenSignal((current) => current + 1);
  }, []);

  useEffect(() => {
    setRequestConversationLauncherDismissed(false);
  }, [selectedRequestConversation?.id]);

  useEffect(() => {
    const requestId = String(selectedRequestConversation?.id || '').trim();
    if (!requestId || !user?.id) {
      setSelectedRequestConversationThreadKey('');
      return;
    }

    let cancelled = false;
    const resolveThreadKey = async () => {
      try {
        const response = await MessageService.getThreadByContext({
          contextType: 'marketplace_request',
          contextId: requestId,
          threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
          limit: 50,
        });
        const resolvedThread = (Array.isArray(response?.threads) ? response.threads : []).find(
          (thread) => String(thread?.thread_type || '').trim().toLowerCase() === MESSAGE_THREAD_TYPES.marketplaceOwnerRequest
        ) || response?.thread || null;
        const resolvedKey = String(resolvedThread?.thread_key || resolvedThread?.id || '').trim();
        if (!cancelled) {
          setSelectedRequestConversationThreadKey(resolvedKey);
        }
      } catch {
        if (!cancelled) {
          setSelectedRequestConversationThreadKey('');
        }
      }
    };

    void resolveThreadKey();
    return () => {
      cancelled = true;
    };
  }, [selectedRequestConversation?.id, user?.id]);

  useEffect(() => {
    if (!selectedConversationRequestId || loading || !requests.length) return;
    const matchingRequest = requests.find((request) => String(request?.id || '') === selectedConversationRequestId);
    if (!matchingRequest) return;
    setSelectedRequestConversation((current) => {
      if (String(current?.id || '') === selectedConversationRequestId) {
        return {
          ...current,
          ...matchingRequest,
        };
      }
      return matchingRequest;
    });
  }, [loading, requests, selectedConversationRequestId]);

  const handleCounterOfferDraftChange = useCallback((request, field, value) => {
    const requestId = String(request?.id || '').trim();
    if (!requestId) return;
    setCounterOfferDrafts((current) => ({
      ...current,
      [requestId]: {
        priceAmount: current?.[requestId]?.priceAmount ?? '',
        message: current?.[requestId]?.message ?? '',
        [field]: value,
      },
    }));
  }, []);

  const handlePreApproveRequest = useCallback(async (request) => {
    const requestId = String(request?.id || '').trim();
    if (!user?.id || !requestId) return;

    try {
      setBusyRequestId(requestId);
      await BusinessMarketplaceService.acceptRequest(user.id, requestId, tr('Approved by owner.', 'Approuvée par le propriétaire.'));
      toast.success(tr('Request approved. Chat is now open.', 'Demande approuvée. Le chat est maintenant ouvert.'));
      await loadWorkspace();
      handleOpenRequestConversation({
        ...request,
        requestStatus: 'approved',
        requestStatusLabel: getMarketplaceStatusLabel('approved'),
      });
    } finally {
      setBusyRequestId('');
    }
  }, [handleOpenRequestConversation, loadWorkspace, tr, user?.id]);

  const handleDeclineRequest = useCallback(async (request) => {
    const requestId = String(request?.id || '').trim();
    if (!user?.id || !requestId) return;

    try {
      setBusyRequestId(requestId);
      const reason = String(counterOfferDrafts?.[requestId]?.message || '').trim();
      await BusinessMarketplaceService.declineRequest(user.id, requestId, reason);
      toast.success(tr('Request declined.', 'Demande refusée.'));
      await loadWorkspace();
    } finally {
      setBusyRequestId('');
    }
  }, [counterOfferDrafts, loadWorkspace, tr, user?.id]);

  const handleThreadMarketplaceAction = useCallback(async (thread, action, payload = {}) => {
    const requestId = String(
      payload?.requestId ||
      thread?.metadata?.requestId ||
      thread?.entity_id ||
      ''
    ).trim();

    if (!requestId) {
      throw new Error(tr('Booking thread is missing its request link.', 'Le fil de réservation n’a pas de lien de demande.'));
    }

    const request =
      requests.find((item) => String(item?.id || '').trim() === requestId) ||
      (selectedRequestConversation?.id && String(selectedRequestConversation.id) === requestId ? selectedRequestConversation : null);

    if (!request) {
      throw new Error(tr('Unable to find this request in the owner workspace.', "Impossible de trouver cette demande dans l'espace propriétaire."));
    }

    if (action === 'approve_request') {
      await handlePreApproveRequest(request);
      return;
    }

    if (action === 'decline_request') {
      await handleDeclineRequest(request);
      return;
    }

    throw new Error(tr('This booking action is not available here.', "Cette action n'est pas disponible ici."));
  }, [handleDeclineRequest, handlePreApproveRequest, requests, selectedRequestConversation, tr]);

  const handleSubmitCounterOffer = useCallback(async (request) => {
    const requestId = String(request?.id || '').trim();
    if (!user?.id || !requestId) return;

    const draft = counterOfferDrafts?.[requestId] || {};
    const priceAmount = String(draft?.priceAmount || '').trim();
    const message = String(draft?.message || '').trim();

    if (!priceAmount && !message) {
      toast.error(tr('Add a price or message for the counter-offer.', 'Ajoutez un prix ou un message pour la contre-offre.'));
      return;
    }

    try {
      setBusyRequestId(requestId);
      await BusinessMarketplaceService.sendCounterOffer(user.id, requestId, {
        priceAmount,
        message,
      });
      toast.success(tr('Counter-offer sent. Continue in messages.', 'Contre-offre envoyée. Continuez dans messages.'));
      setCounterOfferRequestId('');
      setCounterOfferDrafts((current) => ({
        ...current,
        [requestId]: { priceAmount: '', message: '' },
      }));
      await loadWorkspace();
      handleOpenRequestConversation({
        ...request,
        requestStatus: 'countered',
        ownerResponse: message || tr('Counter offer sent.', 'Contre-offre envoyée.'),
      });
    } catch (actionError) {
      toast.error(actionError?.message || tr('Unable to send this counter-offer right now.', 'Impossible d’envoyer cette contre-offre pour le moment.'));
    } finally {
      setBusyRequestId('');
    }
  }, [counterOfferDrafts, handleOpenRequestConversation, loadWorkspace, tr, user?.id]);

  if (loading && suppressBlockingLoader) {
    return <AccountWorkspaceLoadingShell cardCount={2} showStatsRow={true} showHeader={true} />;
  }

  if (!vehicles.length && !loading) {
    return (
      <div className="space-y-6">
        <EmptyVehicleWorkspace tr={tr} onCreate={handleCreateVehicle} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20">
        <AccountWorkspaceHero
          eyebrow={tr('Listings', 'Annonces')}
          title={tr('Listings control center', 'Centre de contrôle des annonces')}
          description={tr(
            'Manage vehicle setup, pricing, legal documents, booking readiness, and live listing requests from one workspace.',
            'Gérez préparation véhicule, tarifs, documents légaux, préparation des réservations et demandes en direct depuis un seul espace.'
          )}
          className="bg-white/95 backdrop-blur"
          aside={
            <div className="flex flex-wrap gap-2">
              {canReturn ? (
                <button
                  type="button"
                  onClick={() => navigate(returnPath)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {tr('Back', 'Retour')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCreateVehicle}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(79,70,229,0.18)] transition hover:-translate-y-0.5"
              >
                <UploadCloud className="h-4 w-4" />
                {tr('Add listing', 'Ajouter une annonce')}
              </button>
              <Link to="/account/messages" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                <MessageSquareText className="h-4 w-4" />
                {tr('Open Inbox', 'Ouvrir Inbox')}
              </Link>
            </div>
          }
        />
      </div>

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {tr('Listings snapshot', "Vue des annonces")}
          </p>
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="flex snap-x snap-mandatory gap-3">
            <AccountStatCard
              compact
              eyebrow={tr('Listings', 'Annonces')}
              value={vehicles.length}
              label={tr('Total listings', 'Total des annonces')}
              tone="violet"
            />
            <AccountStatCard
              compact
              eyebrow={tr('Setup', 'Configuration')}
              value={stats.needsSetup}
              label={tr('Still in setup', 'Encore en configuration')}
              tone="amber"
            />
            <AccountStatCard
              compact
              eyebrow={tr('Live', 'En ligne')}
              value={stats.liveVehicles}
              label={tr('Live listings', 'Annonces en ligne')}
              tone="emerald"
            />
            <AccountStatCard
              compact
              eyebrow={tr('Review', 'Revue')}
              value={stats.pendingReview + stats.changesRequested}
              label={tr('Needs review follow-up', 'Demandent un suivi de revue')}
              tone="sky"
            />
            <AccountStatCard
              compact
              eyebrow={tr('Inbox', 'Inbox')}
              value={stats.openRequests}
              label={tr('Open renter requests', 'Demandes locataires ouvertes')}
              tone="slate"
            />
          </div>
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <AccountWorkspaceSectionHeader
          title={tr('How Listings works', 'Comment fonctionnent les annonces')}
          description={tr(
            'Build the vehicle profile first, then move through pricing, legal documents, booking setup, and go-live review. Once a renter requests a vehicle, the live conversation continues in Inbox.',
            "Créez d'abord le profil véhicule, puis avancez via tarification, documents légaux, préparation de réservation et revue avant publication. Lorsqu'un locataire envoie une demande, la conversation en direct continue dans Inbox."
          )}
        />
      </section>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-[1.85rem] border border-slate-200 bg-white" />
          ))}
        </div>
      ) : vehicles.length ? (
        <section className="space-y-4">
          {vehicles.map((vehicle) => (
            <OwnerVehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              tr={tr}
              locale={locale}
              onPrefetchProfile={handlePrefetchVehicleProfile}
              onOpenProfile={() => handleContinueVehicleSetup(vehicle.id)}
              onOpenListingTab={() => handleOpenVehicleTab(vehicle.id, 'listing', 'listing-details')}
              onOpenBookingsTab={() => handleOpenVehicleTab(vehicle.id, 'bookings')}
              onOpenLegalTab={() => handleOpenVehicleTab(vehicle.id, 'legal', 'legal-documents')}
              onOpenReviews={() => handleOpenVehicleReviews(vehicle)}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-[1.85rem] border border-dashed border-slate-200 bg-white/80 p-6">
          <p className="text-sm font-bold text-slate-900">{tr('No listings yet', 'Aucune annonce pour le moment')}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {tr(
              'Create your first listing workspace to begin setup, then publish when everything is ready.',
              "Créez votre premier espace annonce pour démarrer la configuration, puis publiez quand tout est prêt."
            )}
          </p>
          <button
            type="button"
            onClick={handleCreateVehicle}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
          >
            <span>{tr('Start listing', "Démarrer l'annonce")}</span>
            <CarFront className="h-4 w-4" />
          </button>
        </section>
      )}

      <section className="space-y-4">
        <AccountWorkspaceSectionHeader
          eyebrow={tr('Inbox', 'Inbox')}
          title={tr('Listing conversations', "Conversations d'annonce")}
          description={tr(
            'Approvals, declines, counter-offers, and pickup coordination now stay inside Inbox so each booking keeps one timeline.',
            "Approvals, refus, contre-offres et coordination de remise restent maintenant dans Inbox pour que chaque réservation garde une seule chronologie."
          )}
        />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
            ))}
          </div>
        ) : requests.length ? (
          <div className="space-y-4">
            {visibleOwnerRequests.map((request) => (
              <OwnerRequestRow
                key={request.id}
                request={request}
                tr={tr}
                locale={locale}
                now={holdNow}
                highlighted={Boolean(selectedRequestId && String(request?.id || '') === selectedRequestId)}
                onOpenMessages={handleOpenRequestConversation}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white/80 p-6">
            <p className="text-sm font-bold text-slate-900">{tr('No listing conversations yet', "Aucune conversation d'annonce pour le moment")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {tr(
                'Once one of your listings is live and bookable, renter requests will appear here and continue in Inbox.',
                "Dès qu'une de vos annonces est en ligne et réservable, les demandes locataires apparaîtront ici et continueront dans Inbox."
              )}
            </p>
            <Link
              to={vehicles.length ? '/account/vehicles' : '/account/vehicles/new/profile?tab=overview'}
              state={{ from: returnPath }}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
            >
              <span>{vehicles.length ? tr('Open listings', 'Ouvrir les annonces') : tr('Start listing', "Démarrer l'annonce")}</span>
              <CarFront className="h-4 w-4" />
            </Link>
          </div>
        )}
      </section>

      {selectedRequestConversation?.id ? (
        <section className="space-y-4">
          <AccountWorkspaceSectionHeader
            eyebrow={tr('Chat', 'Chat')}
            title={tr('Renter chat', 'Chat locataire')}
            description={tr(
              'Keep approval, pickup coordination, and renter communication together here.',
              'Gardez ici l’approbation, la coordination de remise et les échanges avec le locataire.'
            )}
          />

          <MessageWidget
            key={`marketplace-request-widget-${selectedRequestConversation.id}`}
            threadId={selectedRequestConversationThreadKey}
            contextType="marketplace_request"
            contextId={String(selectedRequestConversation.id)}
            contextLabel={tr('Request Inbox thread', "Fil Inbox de la demande")}
            contextTitle={selectedRequestConversation.listingTitle || tr('Marketplace request', 'Demande marketplace')}
            contextSubtitle={selectedRequestConversation.customerName || tr('Customer conversation', 'Conversation client')}
            contextStatus={getMarketplaceStatusLabel(selectedRequestConversation.requestStatus)}
            family={MESSAGE_FAMILIES.marketplace}
            threadType={MESSAGE_THREAD_TYPES.marketplaceOwnerRequest}
            currentUserId={user?.id}
            currentUserLabel={
              userProfile?.fullName ||
              userProfile?.email ||
              user?.user_metadata?.full_name ||
              user?.user_metadata?.name ||
              user?.email ||
              tr('Owner', 'Propriétaire')
            }
            currentSenderRole="owner"
            isFrench={isFrench}
            tr={tr}
            openRequestSignal={requestConversationOpenSignal}
            forceLauncherVisible={!requestConversationLauncherDismissed}
            showLauncherWhenUnread={false}
            compactLauncher
            reserveFloatingCorner={false}
            onDismissLauncher={() => setRequestConversationLauncherDismissed(true)}
            seedThread={{
              ...(selectedRequestConversationSeedThread || {}),
              thread_key: selectedRequestConversationThreadKey || selectedRequestConversationSeedThread?.thread_key || '',
            }}
            onPerformMarketplaceAction={handleThreadMarketplaceAction}
            replyTarget={{
              userId: selectedRequestConversation.customerId || '',
              label: selectedRequestConversation.customerName || tr('Customer', 'Client'),
              email: selectedRequestConversation.customerEmail || '',
              role: 'customer',
            }}
          />
        </section>
      ) : null}

      {selectedFeedbackVehicle?.listingId ? (
        <MessageWidget
          contextType="listing"
          contextId={String(selectedFeedbackVehicle.listingId)}
          contextLabel={tr('Listing review', "Revue de l'annonce")}
          contextTitle={selectedFeedbackVehicle.title || tr('Marketplace listing', 'Annonce marketplace')}
          contextSubtitle={tr('Review thread with the team', "Fil de revue avec l'équipe")}
          contextStatus={getOwnerListingStatusLabel(selectedFeedbackVehicle, tr)}
          family={MESSAGE_FAMILIES.marketplace}
          threadType={MESSAGE_THREAD_TYPES.marketplaceModeration}
          currentUserId={user?.id}
          currentUserLabel={
            userProfile?.fullName ||
            userProfile?.email ||
            user?.user_metadata?.full_name ||
            user?.user_metadata?.name ||
            user?.email ||
            tr('Owner', 'Propriétaire')
          }
          currentSenderRole="owner"
          isFrench={isFrench}
          tr={tr}
          openRequestSignal={feedbackThreadOpenSignal}
          seedThread={{
            id: `marketplace-moderation-${selectedFeedbackVehicle.listingId}`,
            thread_key: '',
            family: MESSAGE_FAMILIES.marketplace,
            thread_type: MESSAGE_THREAD_TYPES.marketplaceModeration,
            entity_type: 'listing',
            entity_id: String(selectedFeedbackVehicle.listingId),
            subject: selectedFeedbackVehicle.title || 'Marketplace listing',
            metadata: {
              href: `/account/vehicles/${encodeURIComponent(String(selectedFeedbackVehicle.id || ''))}/profile?tab=listing`,
            },
            messages: [],
          }}
        />
      ) : null}

    </div>
  );
};

export default AccountMarketplace;
