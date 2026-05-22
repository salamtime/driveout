import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronDown,
  Edit,
  ExternalLink,
  FileSignature,
  FileText,
  Droplets,
  DollarSign,
  Loader2,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Gauge,
  Info,
  Save,
  Send,
  Store,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import BusinessMarketplaceService, { getMarketplaceStatusLabel, getMarketplaceStatusTone, getVehiclePhotoRequirementStatus, validateOwnerVehicleForm } from '../../services/BusinessMarketplaceService';
import FuelTransactionService from '../../services/FuelTransactionService';
import VehicleAnnualTaxService from '../../services/VehicleAnnualTaxService';
import { financeApiV2 } from '../../services/financeApiV2';
import VerificationService from '../../services/VerificationService';
import FuelLevelModal from '../../components/admin/FuelLevelModal';
import SignaturePadModal from '../../components/SignaturePadModal';
import DocumentUpload from '../../components/DocumentUpload';
import VehicleDocuments from '../../components/VehicleDocuments';
import VehicleImageUpload from '../../components/VehicleImageUpload';
import MessageWidget from '../../components/messages/MessageWidget';
import { getOtherParty } from '../../components/messages/threadHelpers';
import MessageService from '../../services/MessageService';
import {
  getWorkspaceFocusedSectionClass as getFocusedSectionClass,
  workspaceEyebrowClass,
  workspaceFieldClassName as baseFieldClassName,
  workspaceFieldLabelClassName as baseLabelClassName,
  workspaceInsetPanelClass,
  workspaceMetricCardClass,
  workspacePanelClass,
  workspaceShellClass,
  workspaceTitleClass,
} from '../../components/account/accountWorkspaceDesignSystem';
import { VEHICLE_CATEGORY_OPTIONS } from '../../utils/vehicleCategoryOptions';
import { buildEntityVerificationSummary, VEHICLE_REQUIRED_VERIFICATIONS } from '../../utils/verificationStatus';
import { getMarketplaceFundsPolicy, getMarketplaceMoneyBreakdown, normalizeMarketplaceRequestLifecycleStatus } from '../../utils/marketplaceRequestState';
import { MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES } from '../../utils/messageCenter';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { getCurrentLocationPath, resolveReturnPath } from '../../utils/navigationReturn';
import { getEffectiveMarketplaceJourneyState } from '../../utils/accountProductModel';
import { supabase } from '../../lib/supabase';
import { buildStoragePathCandidates } from '../../utils/storageUpload';
import { getCurrentOrganizationId } from '../../services/OrganizationService';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';
import RentalEvidenceGallery from '../../components/account/RentalEvidenceGallery';
import RentalPhotoEvidenceCapture from '../../components/account/RentalPhotoEvidenceCapture';
import AccountRentalExecutionStepperShell, {
  AccountRentalExecutionStickyFooter,
} from '../../components/account/AccountRentalExecutionStepperShell';
import OwnerListingSetupGuide from '../../components/account/OwnerListingSetupGuide';
import MessageAttachmentService from '../../services/MessageAttachmentService';
import RentalEventService from '../../services/RentalEventService';
import { normalizeVehicleImageUrl } from '../../utils/vehicleImage';
import { buildOwnerListingSetupProgress } from '../../utils/ownerListingSetupProgress';
import {
  ACCOUNT_JOURNEY_EVENTS,
  trackAccountJourneyEvent,
  trackAccountJourneyEventOnce,
} from '../../utils/accountJourneyAnalytics';
import {
  createRentalExecutionDraft as createOwnerExecutionDraft,
  isRentalExecutionHandoffLocked as isOwnerExecutionHandoffLocked,
  isRentalExecutionReturnLocked as isOwnerExecutionReturnLocked,
  normalizeRentalExecutionDraft as normalizeOwnerExecutionDraft,
  normalizeRentalExecutionPhotos as normalizeOwnerExecutionPhotos,
  RENTAL_EXECUTION_FLOW_MIN_PHOTOS,
} from '../../utils/rentalExecutionFlow';
import {
  buildOwnerExecutionWorkspaceHref,
  getOwnerExecutionActionConfig,
} from '../../utils/ownerRentalExecutionLinks';
import { buildDriveOutMarketplaceRentalDocumentPayload } from '../../utils/marketplaceRentalDocuments';
import { encodePublicSharePayload } from '../../utils/publicSharePayload';

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const LAST_OWNER_VEHICLE_ID_KEY = 'driveout_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'driveout_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'driveout_owner_vehicle_ids';
const OWNER_EXECUTION_FLOW_KEY = 'driveout_owner_execution_flow';
const OWNER_RETURN_FLOW_ARM_DELAY_MS = 5000;
const OWNER_EXECUTION_FOCUS_STAGES = new Set(['approved', 'handoff', 'ready_to_start', 'return_pending']);
const OWNER_STORAGE_LEGACY_KEYS = Object.freeze({
  [LAST_OWNER_VEHICLE_ID_KEY]: 'saharax_last_owner_vehicle_id',
  [LAST_OWNER_VEHICLE_COUNT_KEY]: 'saharax_last_owner_vehicle_count',
  [OWNER_VEHICLE_IDS_KEY]: 'saharax_owner_vehicle_ids',
  [OWNER_EXECUTION_FLOW_KEY]: 'saharax_owner_execution_flow',
});
const OWNER_VEHICLE_SAVE_TIMEOUT_MS = 60000;

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);

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

const buildOwnerExecutionStorageKey = (requestId, userId = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return '';
  return buildOwnerVehicleStorageKey(`${OWNER_EXECUTION_FLOW_KEY}:${normalizedRequestId}`, userId);
};

const buildOwnerExecutionStorageKeys = (requestId, userId = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return [];
  return buildOwnerVehicleStorageKeys(`${OWNER_EXECUTION_FLOW_KEY}:${normalizedRequestId}`, userId);
};

const OWNER_HANDOFF_MIN_PHOTOS = RENTAL_EXECUTION_FLOW_MIN_PHOTOS.handoff;
const OWNER_LEGAL_DOCS_MIN_PHOTOS = RENTAL_EXECUTION_FLOW_MIN_PHOTOS.legalDocs;
const OWNER_RETURN_MIN_PHOTOS = RENTAL_EXECUTION_FLOW_MIN_PHOTOS.return;
const hasOwnerExecutionNumberValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0;
};

const getOwnerExecutionFuelLabel = (value, tr) => {
  if (!hasOwnerExecutionNumberValue(value)) return tr('Not recorded', 'Non enregistré');
  const level = Number(value);
  if (level === 0) return tr('Empty', 'Vide');
  if (level === 8) return tr('Full', 'Plein');
  return `${level}/8`;
};

const isOwnerExecutionDepositReviewComplete = (draft = {}) => {
  const outcome = String(draft?.depositOutcome || '').trim().toLowerCase();
  if (!draft?.depositReviewed || !outcome) return false;
  if (outcome === 'refund_full') {
    return Boolean(String(draft?.depositRefundSignatureUrl || '').trim());
  }
  return true;
};

const OWNER_HANDOFF_STEPS = [
  {
    key: 'vehicle_photos',
    label: { en: 'Vehicle inspection', fr: 'Inspection véhicule' },
    note: { en: 'Capture clear vehicle inspection photos.', fr: 'Capturez des photos claires de l’inspection véhicule.' },
    gate: (draft) => Boolean(draft.handoffMediaReady),
  },
  {
    key: 'start_odometer',
    label: { en: 'Odometer input', fr: 'Saisie compteur' },
    note: { en: 'Record the starting odometer.', fr: 'Enregistrez le kilométrage de départ.' },
    gate: (draft) => hasOwnerExecutionNumberValue(draft.startOdometer),
  },
  {
    key: 'start_fuel',
    label: { en: 'Fuel level', fr: 'Niveau carburant' },
    note: { en: 'Set the starting fuel level.', fr: 'Définissez le niveau de carburant de départ.' },
    gate: (draft) => hasOwnerExecutionNumberValue(draft.startFuelLevel),
  },
  {
    key: 'legal_docs',
    label: { en: 'Registration + insurance', fr: 'Carte grise + assurance' },
    note: { en: 'Capture one registration photo and one insurance photo.', fr: 'Capturez une photo de carte grise et une photo d’assurance.' },
    gate: (draft) =>
      Boolean(draft.legalDocsMediaReady) ||
      normalizeOwnerExecutionPhotos(draft.legalDocsPhotos).length >= OWNER_LEGAL_DOCS_MIN_PHOTOS,
  },
  {
    key: 'deposit',
    label: { en: 'Deposit confirmation', fr: 'Confirmation caution' },
    note: { en: 'Confirm the deposit is collected.', fr: 'Confirmez que la caution est collectée.' },
    gate: (draft) => Boolean(draft.depositConfirmed),
  },
  {
    key: 'signature',
    label: { en: 'Signature', fr: 'Signature' },
    note: { en: 'Get the contract signed.', fr: 'Faites signer le contrat.' },
    gate: (draft) => Boolean(draft.contractSigned),
  },
];

const OWNER_FUEL_LEVEL_OPTIONS = Array.from({ length: 9 }, (_value, index) => index);

const OWNER_RETURN_STEPS = [
  {
    key: 'return_photos',
    label: { en: 'Vehicle inspection', fr: 'Inspection véhicule' },
    note: { en: 'Capture the vehicle on return.', fr: 'Capturez le véhicule au retour.' },
    gate: (draft) => Boolean(draft.returnMediaReady),
  },
  {
    key: 'return_odometer',
    label: { en: 'Odometer input', fr: 'Saisie compteur' },
    note: { en: 'Record the final odometer reading.', fr: 'Enregistrez le kilométrage final.' },
    gate: (draft) =>
      hasOwnerExecutionNumberValue(draft.returnOdometer) &&
      (!hasOwnerExecutionNumberValue(draft.startOdometer) || Number(draft.returnOdometer) >= Number(draft.startOdometer)),
  },
  {
    key: 'return_fuel',
    label: { en: 'Fuel level input', fr: 'Saisie carburant' },
    note: { en: 'Capture the fuel level on return.', fr: 'Capturez le niveau de carburant au retour.' },
    gate: (draft) => hasOwnerExecutionNumberValue(draft.returnFuelLevel),
  },
  {
    key: 'return_condition',
    label: { en: 'Return condition', fr: 'État retour' },
    note: { en: 'Review the final condition and add a note if there is an issue.', fr: 'Contrôlez l’état final et ajoutez une note s’il y a un incident.' },
    gate: (draft) => Boolean(draft.issueReviewed) && (!draft.issueReported || Boolean(String(draft.issueNote || '').trim())),
  },
  {
    key: 'deposit_review',
    label: { en: 'Deposit closeout', fr: 'Clôture caution' },
    note: { en: 'Record how the deposit is handled at return.', fr: 'Enregistrez comment la caution est gérée au retour.' },
    gate: isOwnerExecutionDepositReviewComplete,
  },
  {
    key: 'end_rental',
    label: { en: 'End rental', fr: 'Fin de location' },
    note: { en: 'Close the rental once everything is checked.', fr: 'Clôturez la location une fois tout contrôlé.' },
    gate: (draft) => Boolean(draft.returnSavedAt),
  },
];

const parseCommaSeparated = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const inferVehicleShotType = (item = {}, index = 0) => {
  const explicitShotType = String(item?.shot_type || item?.shotType || '').trim().toLowerCase();
  if (explicitShotType) return explicitShotType;
  if (Boolean(item?.is_cover)) return 'hero';

  const haystack = [
    item?.name,
    item?.url,
    item?.storagePath,
    item?.storage_path,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(^|[^a-z])(hero)([^a-z]|$)/.test(haystack)) return 'hero';
  if (/(^|[^a-z])(context)([^a-z]|$)/.test(haystack)) return 'context';
  if (/(^|[^a-z])(detail)([^a-z]|$)/.test(haystack)) return 'detail';

  return ['hero', 'context', 'detail'][index] || null;
};

const assignVehiclePhotoSlots = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  const requiredSlots = ['hero', 'context', 'detail'];
  const usedSlots = new Set();
  const unassignedIndexes = [];

  normalizedItems.forEach((item, index) => {
    const shotType = String(item?.shot_type || '').trim().toLowerCase();
    if (requiredSlots.includes(shotType) && !usedSlots.has(shotType)) {
      usedSlots.add(shotType);
      item.shot_type = shotType;
      return;
    }

    item.shot_type = null;
    unassignedIndexes.push(index);
  });

  requiredSlots.forEach((slot) => {
    if (usedSlots.has(slot)) return;
    const nextIndex = unassignedIndexes.shift();
    if (nextIndex === undefined) return;
    normalizedItems[nextIndex].shot_type = slot;
    usedSlots.add(slot);
  });

  return normalizedItems.map((item, index) => ({
    ...item,
    shot_type: item.shot_type || null,
    is_cover: item.shot_type === 'hero' || (item.is_cover && !normalizedItems.some((entry, entryIndex) => entryIndex !== index && entry.shot_type === 'hero')),
  }));
};

const normalizeMediaFromFormState = (formState = {}) => {
  const arrayMedia = Array.isArray(formState?.media)
    ? assignVehiclePhotoSlots(formState.media
        .filter((item) => item?.url)
        .map((item, index) => ({
          id: item.id || `manual-${index}`,
          url: String(item.url || '').trim(),
          is_cover:
            Boolean(item.is_cover) ||
            String(item.url).trim() === String(formState.coverImageUrl || '').trim() ||
            inferVehicleShotType(item, index) === 'hero',
          shot_type: inferVehicleShotType(item, index),
          quality_status: String(item.quality_status || item.qualityStatus || '').trim().toLowerCase() || null,
        })))
    : [];

  if (arrayMedia.length > 0) {
    return arrayMedia;
  }

  const seen = new Set();
  const urls = String(formState.mediaUrlsText || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });

  return assignVehiclePhotoSlots(urls.map((url, index) => ({
    id: `manual-${index}`,
    url,
    is_cover: String(url).trim() === String(formState.coverImageUrl || '').trim(),
    shot_type: inferVehicleShotType({ url, is_cover: index === 0 }, index),
    quality_status: null,
  })));
};

const mapDraftVehicleStorageImages = (storagePrefix, files = []) =>
  (Array.isArray(files) ? files : [])
    .filter((file) => file?.name && !String(file.name).endsWith('/'))
    .map((file, index) => {
      const fileName = String(file.name || '').trim();
      const shotTypeMatch = fileName.match(/^(hero|context|detail)__/i);
      const shotType = shotTypeMatch?.[1]?.toLowerCase() || null;
      const storagePath = `${storagePrefix}/${fileName}`;
      const { data: urlData } = supabase.storage
        .from('vehicle-images')
        .getPublicUrl(storagePath);

      return {
        id: file.id || `draft-media-${index}`,
        url: normalizeVehicleImageUrl(urlData?.publicUrl || ''),
        type: 'image',
        name: fileName,
        storagePath,
        is_cover: shotType === 'hero' || index === 0,
        shot_type: shotType,
        quality_status: 'approved',
      };
    })
    .filter((item) => item.url);

const getLinkedFleetVehicleIdFromProfile = (profile = {}, vehicleForm = null) => {
  const rawValue =
    vehicleForm?.rawFleetVehicle?.id ||
    profile?.linked_fleet_vehicle_id ||
    profile?.fleet_vehicle_id ||
    profile?.vehicle_ref_id ||
    vehicleForm?.vehicleRefId ||
    null;

  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return String(rawValue || '').trim() || null;
};

const buildVehicleVerificationEntityIds = (...values) =>
  [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== 'null' && value !== 'undefined' && !value.startsWith('owner-draft-'))
  )];

const getPricingGuide = ({ categoryCode, year, vehicleCondition, hasVehicleMedia, documentCount }) => {
  const normalizedCategory = String(categoryCode || '').trim().toLowerCase();
  const baseRanges = {
    atv: { min: 900, max: 1600 },
    quad: { min: 900, max: 1600 },
    buggy: { min: 1400, max: 2400 },
    scooter: { min: 250, max: 500 },
    motorcycle: { min: 350, max: 700 },
    car: { min: 450, max: 950 },
  };

  const base = baseRanges[normalizedCategory] || { min: 700, max: 1300 };
  const currentYear = new Date().getFullYear();
  const numericYear = Number(year || 0);
  const age = numericYear > 0 ? Math.max(0, currentYear - numericYear) : 6;
  let adjustment = 0;

  if (age <= 2) adjustment += 120;
  else if (age >= 8) adjustment -= 120;

  const normalizedCondition = String(vehicleCondition || '').trim().toLowerCase();
  if (['excellent', 'premium', 'like_new'].includes(normalizedCondition)) adjustment += 100;
  if (['fair', 'used', 'rough'].includes(normalizedCondition)) adjustment -= 80;
  if (hasVehicleMedia) adjustment += 40;
  if (documentCount >= 2) adjustment += 30;

  const recommendedMin = Math.max(100, Math.round((base.min + adjustment) / 50) * 50);
  const recommendedMax = Math.max(recommendedMin + 150, Math.round((base.max + adjustment) / 50) * 50);
  const allowedMin = Math.max(100, Math.round(recommendedMin * 0.8 / 50) * 50);
  const allowedMax = Math.max(recommendedMax, Math.round(recommendedMax * 1.2 / 50) * 50);

  return {
    daily: {
      recommendedMin,
      recommendedMax,
      allowedMin,
      allowedMax,
    },
    halfDay: {
      recommendedMin: Math.round(recommendedMin * 0.55 / 50) * 50,
      recommendedMax: Math.round(recommendedMax * 0.7 / 50) * 50,
      allowedMin: Math.max(100, Math.round(allowedMin * 0.5 / 50) * 50),
      allowedMax: Math.round(allowedMax * 0.75 / 50) * 50,
    },
  };
};

const buildFormData = (vehicle = {}) => ({
  brandName: vehicle?.brandName || '',
  modelName: vehicle?.modelName || '',
  categoryCode: vehicle?.categoryCode || 'atv',
  year: vehicle?.year || '',
  plateNumber: vehicle?.plateNumber || '',
  cityName: vehicle?.cityName || 'Tangier',
  countryName: vehicle?.countryName || 'Morocco',
  areaName: vehicle?.areaName || '',
  seats: vehicle?.seats ?? '',
  engineCc: vehicle?.engineCc ?? '',
  color: vehicle?.color || '',
  listingTitle: vehicle?.listingTitle || '',
  shortDescription: vehicle?.shortDescription || '',
  fullDescription: vehicle?.fullDescription || '',
  coverImageUrl: vehicle?.coverImageUrl || '',
  media: Array.isArray(vehicle?.media) ? vehicle.media : [],
  dailyPriceAmount: vehicle?.dailyPriceAmount ?? '',
  halfDayPriceAmount: vehicle?.halfDayPriceAmount ?? '',
  halfDayMinHours: vehicle?.halfDayMinHours ?? 4,
  halfDayMaxHours: vehicle?.halfDayMaxHours ?? 5,
  depositAmount: vehicle?.depositAmount ?? '',
  mileageLimitKm: vehicle?.mileageLimitKm ?? '',
  extraKmRate: vehicle?.extraKmRate ?? '',
  pickupLocationName: vehicle?.pickupLocationName || '',
  pickupAddress: vehicle?.pickupAddress || '',
  deliveryAvailable: Boolean(vehicle?.deliveryAvailable),
  deliveryRadiusKm: vehicle?.deliveryRadiusKm ?? '',
  deliveryFeeAmount: vehicle?.deliveryFeeAmount ?? '',
  fuelPolicy: vehicle?.fuelPolicy || '',
  extrasText: Array.isArray(vehicle?.extras) ? vehicle.extras.join(', ') : '',
  currentOdometer: vehicle?.currentOdometer ?? '',
  engineHours: vehicle?.engineHours ?? '',
  lastOilChangeDate: vehicle?.lastOilChangeDate || '',
  lastOilChangeOdometer: vehicle?.lastOilChangeOdometer ?? '',
  nextOilChangeDue: vehicle?.nextOilChangeDue || '',
  nextOilChangeOdometer: vehicle?.nextOilChangeOdometer ?? '',
  registrationNumber: vehicle?.registrationNumber || '',
  registrationDate: vehicle?.registrationDate || '',
  registrationExpiryDate: vehicle?.registrationExpiryDate || '',
  insurancePolicyNumber: vehicle?.insurancePolicyNumber || '',
  insuranceProvider: vehicle?.insuranceProvider || '',
  insuranceExpiryDate: vehicle?.insuranceExpiryDate || '',
  purchaseCostMad: vehicle?.purchaseCostMad ?? '',
  purchaseDate: vehicle?.purchaseDate || '',
  purchaseSupplier: vehicle?.purchaseSupplier || '',
  purchaseInvoiceUrl: vehicle?.purchaseInvoiceUrl || '',
  termsAcceptedForSubmission: Boolean(vehicle?.termsAcceptedForSubmission),
  mediaUrlsText: Array.isArray(vehicle?.media)
    ? vehicle.media.map((item) => item?.url).filter(Boolean).join('\n')
    : '',
});

const VEHICLE_LEGAL_OCR_FIELD_MAP = {
  registration: ['registrationNumber', 'registrationDate', 'registrationExpiryDate'],
  insurance: ['insurancePolicyNumber', 'insuranceProvider', 'insuranceExpiryDate'],
};

const VEHICLE_LEGAL_SCAN_TITLE = {
  registration: { en: 'Registration scanned', fr: 'Immatriculation scannée' },
  insurance: { en: 'Insurance scanned', fr: 'Assurance scannée' },
};

const mapVehicleVerificationRequestsToDocuments = (requests = []) => {
  const groupedByCategory = new Map();

  (Array.isArray(requests) ? requests : [])
    .filter((request) =>
      ['vehicle_registration', 'vehicle_insurance'].includes(String(request?.verification_type || '').trim().toLowerCase())
    )
    .forEach((request) => {
      const verificationType = String(request?.verification_type || '').trim().toLowerCase();
      const categoryKey = verificationType === 'vehicle_registration' ? 'registration' : 'insurance';
      const currentRequests = groupedByCategory.get(categoryKey) || [];
      currentRequests.push(request);
      groupedByCategory.set(categoryKey, currentRequests);
    });

  return Array.from(groupedByCategory.entries())
    .map(([categoryKey, categoryRequests]) => {
      const sortedRequests = [...categoryRequests].sort((left, right) => {
        const leftCreatedAt = Date.parse(left?.created_at || '') || 0;
        const rightCreatedAt = Date.parse(right?.created_at || '') || 0;
        return rightCreatedAt - leftCreatedAt;
      });
      const request = sortedRequests[0];
      const duplicateRequestIds = sortedRequests
        .map((item) => String(item?.id || '').trim())
        .filter(Boolean);

      return {
      id: request.id,
      name: request.file_name || request.verification_type || 'document',
      type: request.file_mime_type || 'application/octet-stream',
      size: request.file_size || 0,
      url: request.file_url || '',
      storagePath: request.file_path || '',
      uploadedAt: request.created_at || new Date().toISOString(),
      category: String(request.verification_type || '').trim().toLowerCase() === 'vehicle_registration'
        ? 'Registration'
        : 'Insurance',
      categoryKey,
      vehicleId: request.entity_id || null,
      status: request.status || 'pending',
      source: 'verification',
      verificationRequestIds: duplicateRequestIds,
      duplicateCount: duplicateRequestIds.length,
    };
    })
    .filter((document) => document.url || document.storagePath);
};

const getVehicleVerificationRowsFromFileResults = (verificationFileResults = []) => {
  const rowsById = new Map();
  const addRow = (row) => {
    const verificationType = String(row?.verification_type || '').trim().toLowerCase();
    if (!['vehicle_registration', 'vehicle_insurance'].includes(verificationType)) return;

    const id = String(row?.id || '').trim();
    const fallbackKey = [
      verificationType,
      row?.entity_id,
      row?.file_path,
      row?.file_url,
      row?.created_at,
    ].filter(Boolean).join(':');
    const key = id || fallbackKey;
    if (!key || rowsById.has(key)) return;
    rowsById.set(key, row);
  };

  (Array.isArray(verificationFileResults) ? verificationFileResults : []).forEach((fileResult) => {
    (Array.isArray(fileResult?.requests) ? fileResult.requests : []).forEach(addRow);
    const latestByType = fileResult?.summary?.latestByType;
    if (latestByType && typeof latestByType === 'object') {
      Object.values(latestByType).forEach(addRow);
    }
  });

  return Array.from(rowsById.values());
};

const mergeVehicleDocuments = (currentDocuments = [], nextDocuments = []) => {
  const mergedDocuments = [];
  const seenKeys = new Set();
  const seenIds = new Set();
  const replacementIds = new Set(
    (Array.isArray(nextDocuments) ? nextDocuments : [])
      .map((document) => String(document?.replacesDocumentId || '').trim())
      .filter(Boolean)
  );

  [...(Array.isArray(nextDocuments) ? nextDocuments : []), ...(Array.isArray(currentDocuments) ? currentDocuments : [])]
    .filter(Boolean)
    .forEach((document) => {
      if (replacementIds.has(String(document?.id || '').trim())) {
        return;
      }

      const source = String(document?.source || '').trim().toLowerCase();
      const categoryKey = String(document?.categoryKey || '').trim().toLowerCase();
      const documentId = String(document?.id || '').trim();
      const documentKey =
        source === 'verification' && categoryKey
          ? `verification:${categoryKey}`
          : document?.storagePath || document?.url || document?.id;

      if (!documentKey || seenKeys.has(documentKey) || (documentId && seenIds.has(documentId))) {
        return;
      }

      seenKeys.add(documentKey);
      if (documentId) seenIds.add(documentId);
      mergedDocuments.push(document);
    });

  return mergedDocuments;
};

const hasMeaningfulVehicleDraft = (formData = {}, normalizedMedia = []) => {
  const textKeys = [
    'brandName',
    'modelName',
    'listingTitle',
    'shortDescription',
    'fullDescription',
    'cityName',
    'areaName',
    'coverImageUrl',
    'pickupLocationName',
    'pickupAddress',
    'fuelPolicy',
    'extrasText',
  ];

  const numericKeys = [
    'dailyPriceAmount',
    'halfDayPriceAmount',
    'halfDayMinHours',
    'halfDayMaxHours',
    'depositAmount',
    'mileageLimitKm',
    'extraKmRate',
    'deliveryRadiusKm',
    'deliveryFeeAmount',
  ];

  if (textKeys.some((key) => String(formData?.[key] || '').trim())) return true;
  if (numericKeys.some((key) => formData?.[key] !== '' && formData?.[key] !== null && formData?.[key] !== undefined)) return true;
  if (Boolean(formData?.deliveryAvailable) || Boolean(formData?.termsAcceptedForSubmission)) return true;
  if (normalizedMedia.length > 0) return true;
  return false;
};

const OwnerField = ({ label, children }) => (
  <label className="block">
    <span className={baseLabelClassName}>{label}</span>
    {children}
  </label>
);

const submitterLabel = (reviewErrors, tr) =>
  Object.keys(reviewErrors || {}).length > 0
    ? tr('Complete the required fields below before submitting for approval.', 'Complétez les champs requis ci-dessous avant de soumettre pour approbation.')
    : tr('Your listing is ready for review. Save a draft anytime, or submit once you are happy with the details.', 'Votre annonce est prête pour la revue. Enregistrez un brouillon à tout moment, ou soumettez-la une fois satisfait des détails.');

const getCombinedReviewEntryMeta = ({
  hasStartedDraft,
  marketplaceVerificationReady,
  ownerVerificationReady,
  missingChecklistItems,
  journeyState,
  latestReviewDetail,
  tr,
}) => {
  const missingItems = Array.isArray(missingChecklistItems) ? missingChecklistItems : [];
  const hasMissingChecklistItems = missingItems.length > 0;
  const normalizedJourneyState = String(journeyState || '').trim().toLowerCase();

  if (normalizedJourneyState === 'live') {
    return {
      title: tr('Listing is live', "L'annonce est en ligne"),
      body: tr('The admin review is complete and the vehicle is already visible on the marketplace.', "La revue admin est terminée et le véhicule est déjà visible sur la marketplace."),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      ready: false,
    };
  }

  if (normalizedJourneyState === 'approved') {
    return {
      title: tr('Approved for publication', 'Approuvé pour publication'),
      body: tr('Admin approval is complete. The last step is publishing the listing live.', "L'approbation admin est terminée. La dernière étape consiste à publier l'annonce."),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      ready: false,
    };
  }

  if (normalizedJourneyState === 'changes_requested') {
    return {
      title: tr('Changes requested', 'Modifications demandées'),
      body: latestReviewDetail || tr('Review feedback is waiting for you in messages. Update the listing, then send it again.', 'Le retour de revue vous attend dans les messages. Mettez l’annonce à jour, puis renvoyez-la.'),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  if (normalizedJourneyState === 'pending_review') {
    return {
      title: tr('Submitted for admin review', "Envoyée en revue admin"),
      body: tr(
        'You are done for now. Admin is checking the listing and will either approve it for publishing or request changes here.',
        "Vous avez terminé pour le moment. L'admin vérifie l'annonce et l'approuvera pour publication ou demandera des modifications ici."
      ),
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      ready: false,
    };
  }

  if (!hasStartedDraft) {
    return {
      title: tr('Start setup first', 'Commencez la configuration'),
      body: tr('Complete the vehicle, documents, and listing setup first.', "Complétez d'abord le véhicule, les documents et la configuration de l'annonce."),
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      ready: false,
    };
  }

  if (!ownerVerificationReady) {
    return {
      title: tr('Owner approval pending', 'Approbation propriétaire en attente'),
      body: tr(
        'Your ID and license must be approved before review can be sent.',
        "Votre pièce d'identité et votre permis doivent être approuvés avant l'envoi en revue."
      ),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  if (!marketplaceVerificationReady) {
    return {
      title: tr('Vehicle approval pending', 'Approbation véhicule en attente'),
      body: tr(
        'Registration and insurance are already with admin. Finish the listing while you wait.',
        "L'immatriculation et l'assurance sont déjà chez l'admin. Terminez l'annonce pendant l'attente."
      ),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  if (hasMissingChecklistItems) {
    return {
      title: tr('Finish the last tasks', 'Terminez les dernières tâches'),
      body: tr(
        'Complete the remaining checklist to unlock review.',
        "Terminez la checklist restante pour débloquer la revue."
      ),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  return {
    title: tr('Ready to send', 'Prêt à envoyer'),
    body: tr(
      'Send the full package to admin in one step.',
      "Envoyez le dossier complet à l'admin en une seule étape."
    ),
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    ready: true,
  };
};

const formatDateTime = (value, locale = 'en') => {
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

const formatDate = (value, locale = 'en') => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatRelativeDuration = (minutes, tr) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const days = Math.floor(safeMinutes / (60 * 24));
  const hours = Math.floor((safeMinutes % (60 * 24)) / 60);
  const mins = safeMinutes % 60;

  if (days > 0) {
    return tr(
      `${days}d ${hours}h`,
      `${days}j ${hours}h`
    );
  }
  if (hours > 0) {
    return mins > 0
      ? tr(`${hours}h ${mins}m`, `${hours}h ${mins}m`)
      : tr(`${hours}h`, `${hours}h`);
  }
  return tr(`${mins}m`, `${mins} min`);
};

const formatClockDuration = (milliseconds) => {
  const safeMilliseconds = Math.max(0, Math.floor(Number(milliseconds) || 0));
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
};

const getRelativeTimeCopy = (targetValue, nowValue, tr, { futureLabel, pastLabel } = {}) => {
  if (!targetValue) return '';
  const target = new Date(targetValue);
  if (Number.isNaN(target.getTime())) return '';
  const now = new Date(nowValue);
  const diffMinutes = Math.round((target.getTime() - now.getTime()) / 60000);

  if (diffMinutes >= 0) {
    const durationLabel = formatRelativeDuration(diffMinutes, tr);
    return futureLabel ? futureLabel(durationLabel) : tr(`In ${durationLabel}`, `Dans ${durationLabel}`);
  }

  const durationLabel = formatRelativeDuration(Math.abs(diffMinutes), tr);
  return pastLabel ? pastLabel(durationLabel) : tr(`${durationLabel} ago`, `Il y a ${durationLabel}`);
};

const MoneyLine = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className={strong ? 'font-semibold text-slate-900' : 'text-slate-500'}>{label}</span>
    <span className={strong ? 'font-semibold text-slate-950' : 'font-semibold text-slate-700'}>{value}</span>
  </div>
);

const getOwnerExecutionPriority = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'active') return 0;
  if (normalized === 'approved') return 1;
  if (normalized === 'pre_approved') return 2;
  if (normalized === 'completed') return 3;
  return 10;
};

const getOwnerExecutionMeta = (status, tr) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'active') {
    return {
      badge: tr('Rental live', 'Location active'),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      note: tr('End the rental with return media, report, and deposit release.', 'Terminez la location avec médias retour, rapport, et restitution de caution.'),
      steps: [
        { key: 'request', label: tr('Booking confirmed', 'Réservation confirmée'), done: true },
        { key: 'handoff', label: tr('Vehicle handoff', 'Remise du véhicule'), done: true },
        { key: 'live', label: tr('Rental live', 'Location active'), active: true },
        { key: 'close', label: tr('Return & report', 'Retour & rapport') },
      ],
    };
  }

  if (normalized === 'approved') {
    return {
      badge: tr('Ready to start rental', 'Prête à démarrer la location'),
      tone: 'border-sky-200 bg-sky-50 text-sky-700',
      note: '',
      steps: [
        { key: 'request', label: tr('Booking confirmed', 'Réservation confirmée'), done: true },
        { key: 'handoff', label: tr('Vehicle handoff', 'Remise du véhicule'), active: true },
        { key: 'live', label: tr('Rental live', 'Location active') },
        { key: 'close', label: tr('Return & report', 'Retour & rapport') },
      ],
    };
  }

  if (normalized === 'pre_approved') {
    return {
      badge: tr('Awaiting renter confirmation', 'En attente de la confirmation du locataire'),
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
      note: tr('The owner approved this booking. Waiting for the renter to confirm before pickup can begin.', 'Le propriétaire a approuvé cette réservation. En attente de la confirmation du locataire avant le départ.'),
      steps: [
        { key: 'request', label: tr('Approved by owner', 'Approuvée par le propriétaire'), active: true },
        { key: 'handoff', label: tr('Vehicle handoff', 'Remise du véhicule') },
        { key: 'live', label: tr('Rental live', 'Location active') },
        { key: 'close', label: tr('Return & report', 'Retour & rapport') },
      ],
    };
  }

  if (normalized === 'completed') {
    return {
      badge: tr('Rental completed', 'Location terminée'),
      tone: 'border-slate-200 bg-slate-100 text-slate-700',
      note: tr('The rental record is closed. Keep the report and payout details tied to this request.', 'Le dossier location est clôturé. Gardez le rapport et les détails de versement liés à cette demande.'),
      steps: [
        { key: 'request', label: tr('Booking confirmed', 'Réservation confirmée'), done: true },
        { key: 'handoff', label: tr('Vehicle handoff', 'Remise du véhicule'), done: true },
        { key: 'live', label: tr('Rental live', 'Location active'), done: true },
        { key: 'close', label: tr('Return & report', 'Retour & rapport'), done: true },
      ],
    };
  }

  return null;
};

const ExecutionStep = ({ step }) => (
  <div className={`rounded-2xl border px-4 py-3 ${
    step.done
      ? 'border-emerald-200 bg-emerald-50'
      : step.active
        ? 'border-violet-200 bg-violet-50'
        : 'border-slate-200 bg-white'
  }`}>
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        step.done
          ? 'bg-emerald-600 text-white'
          : step.active
            ? 'bg-violet-600 text-white'
            : 'bg-slate-100 text-slate-500'
      }`}>
        {step.done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">•</span>}
      </div>
      <p className={`text-sm font-semibold ${
        step.done || step.active ? 'text-slate-950' : 'text-slate-600'
      }`}>
        {step.label}
      </p>
    </div>
  </div>
);

const FundsLifecycleStep = ({ label, detail, active = false, complete = false }) => (
  <div className={`rounded-2xl border px-4 py-3 ${
    complete
      ? 'border-emerald-200 bg-emerald-50'
      : active
        ? 'border-violet-200 bg-violet-50'
        : 'border-slate-200 bg-white'
  }`}>
    <p className={`text-sm font-semibold ${
      complete || active ? 'text-slate-950' : 'text-slate-700'
    }`}>
      {label}
    </p>
    <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </div>
);

const OwnerExecutionChecklistItem = ({ label, checked = false, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
      checked
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
    }`}
  >
    <span className="text-sm font-semibold">{label}</span>
    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
      checked ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
    }`}>
      {checked ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">•</span>}
    </span>
  </button>
);

const OwnerExecutionStagePill = ({ label, active = false }) => (
  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
    active
      ? 'bg-violet-600 text-white'
      : 'border border-slate-200 bg-white text-slate-500'
  }`}>
    {label}
  </span>
);

const OwnerStepperStepCard = ({
  stepNumber,
  title,
  note,
  statusLabel,
  primaryActionLabel,
  onPrimaryAction,
  primaryDisabled = false,
  primaryTone = 'violet',
  children = null,
}) => (
  <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-600">
          {stepNumber}
        </p>
        <h4 className="mt-2 text-lg font-bold text-slate-950">{title}</h4>
        {note ? <p className="mt-1 text-sm text-slate-500">{note}</p> : null}
      </div>
      {statusLabel ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {statusLabel}
        </span>
      ) : null}
    </div>
    {children ? <div className="mt-4">{children}</div> : null}
    {primaryActionLabel ? (
      <div className="mt-4">
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={primaryDisabled}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
            primaryTone === 'slate'
              ? 'bg-slate-900 hover:bg-slate-800'
              : primaryTone === 'emerald'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : primaryTone === 'amber'
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          {primaryActionLabel}
        </button>
      </div>
    ) : null}
  </div>
);

const OwnerRentalWorkflowStepCard = ({
  number,
  title,
  detail,
  complete = false,
  active = false,
  disabled = false,
  icon: StepIcon = FileText,
  actionLabel = '',
  onAction,
  children = null,
  fullBleedChildren = false,
}) => (
  <div
    className={`rounded-[22px] border p-4 transition-all ${
      complete
        ? 'border-emerald-200 bg-emerald-50/90'
        : active
          ? 'border-violet-200 bg-white shadow-[0_14px_34px_rgba(76,29,149,0.08)]'
          : 'border-slate-200 bg-white/90'
    }`}
  >
    <div className="flex items-start gap-3">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
          complete ? 'bg-emerald-500 text-white' : active ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-600'
        }`}
      >
        {complete ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-bold">{number}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            {detail ? (
              <p className={`mt-1 text-xs leading-5 ${complete ? 'text-violet-700' : 'text-slate-500'}`}>
                {detail}
              </p>
            ) : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                disabled={disabled}
                aria-label={actionLabel}
                title={actionLabel}
                className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border shadow-sm transition disabled:cursor-not-allowed ${
                  disabled
                    ? 'border-slate-200 bg-slate-100 text-slate-400'
                    : complete
                      ? 'border-emerald-200 bg-white text-violet-700 hover:bg-emerald-50'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Edit className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <StepIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${complete ? 'text-emerald-600' : active ? 'text-violet-600' : 'text-slate-400'}`} />
          </div>
        </div>
        {!fullBleedChildren && children ? <div className="mt-3">{children}</div> : null}
        {actionLabel && !complete ? (
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${
              complete
                ? 'border border-emerald-200 bg-white text-violet-700 shadow-sm hover:bg-emerald-50'
                : 'bg-violet-600 text-white shadow-sm hover:bg-violet-700'
            }`}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
    {fullBleedChildren && children ? (
      <div className="-mx-4 -mb-4 mt-4 overflow-hidden rounded-b-[20px] border-t border-violet-100 bg-white">
        {children}
      </div>
    ) : null}
  </div>
);

const OwnerPolicyLine = ({ label, detail }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-sm font-semibold text-slate-950">{label}</p>
    <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </div>
);

const storeOwnerVehicleId = (userId, vehicleId, options = {}) => {
  if (typeof window === 'undefined' || !vehicleId) return;

  try {
    const existingIds = JSON.parse(
      readOwnerVehicleStorageValue(OWNER_VEHICLE_IDS_KEY, userId, '[]') || '[]'
    );
    const normalizedIds = Array.isArray(existingIds)
      ? existingIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const nextIds = Array.from(new Set([...normalizedIds, String(vehicleId).trim()]));
    window.localStorage.setItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId), JSON.stringify(nextIds));
    window.localStorage.setItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, userId), String(vehicleId));
    if (options.incrementCount) {
      const currentCount = Number.parseInt(
        readOwnerVehicleStorageValue(LAST_OWNER_VEHICLE_COUNT_KEY, userId, '0') || '0',
        10
      );
      const nextCount = Number.isFinite(currentCount) && currentCount > 0 ? Math.max(nextIds.length, currentCount + 1) : nextIds.length;
      window.localStorage.setItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId), String(nextCount));
    } else {
      window.localStorage.setItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId), String(nextIds.length));
    }
  } catch {
    // ignore local storage issues
  }
};

const getKnownOwnerVehicleCount = (userId = '') => {
  if (typeof window === 'undefined') return 0;

  try {
    const savedCount = Number.parseInt(
      readOwnerVehicleStorageValue(LAST_OWNER_VEHICLE_COUNT_KEY, userId, '0') || '0',
      10
    );
    const savedIds = JSON.parse(
      readOwnerVehicleStorageValue(OWNER_VEHICLE_IDS_KEY, userId, '[]') || '[]'
    );
    const idCount = Array.isArray(savedIds) ? savedIds.map((item) => String(item || '').trim()).filter(Boolean).length : 0;
    return Math.max(Number.isFinite(savedCount) ? savedCount : 0, idCount);
  } catch {
    return 0;
  }
};

const getReviewEntryTone = (status) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (['rejected', 'changes_requested', 'request_changes', 'needs_changes'].includes(normalized)) {
    return {
      shell: 'border-amber-200 bg-amber-50',
      label: 'border-amber-200 bg-white text-amber-800',
      title: 'text-amber-950',
      body: 'text-amber-900',
      muted: 'text-amber-700',
    };
  }

  if (['approved', 'live', 'published'].includes(normalized)) {
    return {
      shell: 'border-emerald-200 bg-emerald-50',
      label: 'border-emerald-200 bg-white text-emerald-800',
      title: 'text-emerald-950',
      body: 'text-emerald-900',
      muted: 'text-emerald-700',
    };
  }

  if (['pending_review', 'submitted', 'resubmitted'].includes(normalized)) {
    return {
      shell: 'border-sky-200 bg-sky-50',
      label: 'border-sky-200 bg-white text-sky-800',
      title: 'text-sky-950',
      body: 'text-sky-900',
      muted: 'text-sky-700',
    };
  }

  return {
    shell: 'border-violet-200 bg-violet-50',
    label: 'border-violet-200 bg-white text-violet-800',
    title: 'text-violet-950',
    body: 'text-violet-900',
    muted: 'text-violet-700',
  };
};

const getOwnerMessageTone = (messageType) => {
  const normalized = String(messageType || '').trim().toLowerCase();

  if (['approved', 'live'].includes(normalized)) {
    return {
      shell: 'border-emerald-200 bg-emerald-50',
      label: 'border-emerald-200 bg-white text-emerald-800',
      body: 'text-emerald-950',
      muted: 'text-emerald-700',
    };
  }

  if (['rejected', 'changes_requested', 'request_changes', 'needs_changes'].includes(normalized)) {
    return {
      shell: 'border-amber-200 bg-amber-50',
      label: 'border-amber-200 bg-white text-amber-800',
      body: 'text-amber-950',
      muted: 'text-amber-700',
    };
  }

  return {
    shell: 'border-violet-200 bg-violet-50',
    label: 'border-violet-200 bg-white text-violet-800',
    body: 'text-violet-950',
    muted: 'text-violet-700',
  };
};

const getOwnerListingStageLabel = ({ listingStatus, reviewStatus, tr }) => {
  const normalizedListing = String(listingStatus || '').trim().toLowerCase();
  const normalizedReview = String(reviewStatus || '').trim().toLowerCase();

  if (normalizedListing === 'live') return tr('Live', 'En ligne');
  if (normalizedListing === 'approved' || normalizedReview === 'approved') {
    return tr('Approved for publication', 'Approuvé pour publication');
  }
  if (normalizedListing === 'pending_review' || normalizedReview === 'pending_review') {
    return tr('Pending listing review', "En attente de revue d'annonce");
  }
  if (normalizedListing === 'rejected' || normalizedReview === 'rejected') {
    return tr('Needs owner update', 'À corriger par le propriétaire');
  }
  return tr('Draft', 'Brouillon');
};

const getOwnerReviewJourneyLabel = ({ reviewStatus, moderationStatus, tr }) => {
  const normalizedReview = String(reviewStatus || '').trim().toLowerCase();
  const normalizedModeration = String(moderationStatus || '').trim().toLowerCase();

  if (normalizedReview === 'approved') return tr('Review passed', 'Revue validée');
  if (normalizedReview === 'pending_review') return tr('Review in progress', 'Revue en cours');
  if (normalizedModeration === 'changes_requested') return tr('Feedback waiting on you', 'Retour en attente de votre action');
  if (normalizedReview === 'rejected') return tr('Review not approved', 'Revue non approuvée');
  return tr('Not submitted yet', 'Pas encore soumis');
};

const getMarketplaceJourneyMeta = (journeyState, tr) => {
  switch (journeyState) {
    case 'verification_required':
      return {
        listingLabel: tr('Incomplete', 'Incomplet'),
        reviewLabel: tr('Finish tasks', 'Terminer les tâches'),
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    case 'pending_review':
      return {
        listingLabel: tr('Waiting for admin', "En attente de l'admin"),
        reviewLabel: tr('Waiting for admin', "En attente de l'admin"),
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
      };
    case 'approved':
      return {
        listingLabel: tr('Approved for publication', 'Approuvé pour publication'),
        reviewLabel: tr('Approved for publication', 'Approuvé pour publication'),
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'live':
      return {
        listingLabel: tr('Live', 'En ligne'),
        reviewLabel: tr('Live', 'En ligne'),
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'changes_requested':
      return {
        listingLabel: tr('Incomplete', 'Incomplet'),
        reviewLabel: tr('Finish tasks', 'Terminer les tâches'),
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    case 'rejected':
      return {
        listingLabel: tr('Incomplete', 'Incomplet'),
        reviewLabel: tr('Finish tasks', 'Terminer les tâches'),
        tone: 'border-rose-200 bg-rose-50 text-rose-700',
      };
    case 'draft':
      return {
        listingLabel: tr('Incomplete', 'Incomplet'),
        reviewLabel: tr('Finish tasks', 'Terminer les tâches'),
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
      };
    default:
      return {
        listingLabel: tr('Incomplete', 'Incomplet'),
        reviewLabel: tr('Finish tasks', 'Terminer les tâches'),
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
      };
  }
};

const getOwnerReviewEntryLabel = (actionType, tr) => {
  const normalized = String(actionType || '').trim().toLowerCase();

  if (normalized === 'approved') return tr('Approved for publication', 'Approuvé pour publication');
  if (normalized === 'changes_requested' || normalized === 'request_changes') return tr('Changes requested', 'Modifications demandées');
  if (normalized === 'rejected') return tr('Listing not approved', 'Annonce non approuvée');
  if (normalized === 'published' || normalized === 'live') return tr('Published live', 'Publié en ligne');
  if (normalized === 'message_sent') return tr('Review feedback sent', 'Retour de revue envoyé');
  return tr('Listing review update', "Mise à jour de revue d'annonce");
};

const getOwnerMessageTypeLabel = (messageType, tr) => {
  const normalized = String(messageType || '').trim().toLowerCase();

  if (normalized === 'approval') return tr('Approval note', "Note d'approbation");
  if (normalized === 'changes_requested') return tr('Changes requested', 'Modifications demandées');
  if (normalized === 'rejection') return tr('Listing not approved', 'Annonce non approuvée');
  if (normalized === 'publish_notice') return tr('Publication update', 'Mise à jour de publication');
  if (normalized === 'message') return tr('Review feedback', 'Retour de revue');
  return tr('Review message', 'Message de revue');
};

const createTaxFormState = (record = null) => ({
  id: record?.id || '',
  tax_year: String(record?.tax_year || new Date().getFullYear()),
  amount_mad: String(record?.amount_mad ?? ''),
  payment_date: record?.payment_date || '',
  valid_from: record?.valid_from || '',
  valid_until: record?.valid_until || '',
  notes: record?.notes || '',
});

const SectionCard = ({ title, description, icon: Icon, children, plain = false }) => {
  if (plain) {
    return <section className="space-y-4">{children}</section>;
  }

  return (
  <section className={workspacePanelClass}>
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-600 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className={workspaceEyebrowClass}>{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
    <div className="mt-5">{children}</div>
  </section>
  );
};

const OperationsCollapseCard = ({
  eyebrow,
  title,
  description,
  icon: Icon = FileText,
  expanded,
  onToggle,
  expandLabel = 'Show detail',
  collapseLabel = 'Hide detail',
  children,
}) => (
  <div
    className={`overflow-hidden rounded-[24px] border bg-white transition-[border-color,box-shadow] duration-200 ${
      expanded
        ? 'border-violet-200 shadow-[0_0_0_1px_rgba(139,92,246,0.14),0_18px_40px_rgba(109,40,217,0.10)]'
        : 'border-violet-100 shadow-[0_12px_30px_rgba(76,29,149,0.06)]'
    }`}
  >
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-start gap-3 px-4 py-4 text-left"
      aria-label={expanded ? collapseLabel : expandLabel}
      aria-expanded={expanded}
    >
      <span
        className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border shadow-sm transition-[border-color,background-color,box-shadow,color] duration-200 ${
          expanded
            ? 'border-violet-200 bg-violet-50/90 text-violet-600 shadow-[0_10px_24px_rgba(109,40,217,0.10)]'
            : 'border-violet-100 bg-violet-50 text-violet-600'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{eyebrow}</span>
          <span className="mt-1 block text-base font-bold text-slate-900">{title}</span>
          {description ? <span className="mt-1 block text-xs text-slate-500">{description}</span> : null}
        </span>
        <span
          className={`rounded-full p-2 transition-[background-color,color,box-shadow] duration-200 ${
            expanded
              ? 'bg-violet-100 text-violet-600 shadow-[0_8px_18px_rgba(109,40,217,0.10)]'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </span>
    </button>
    {expanded ? <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">{children}</div> : null}
  </div>
);

const OwnerExecutionMediaPhaseCard = ({
  title,
  description,
  photos = [],
  emptyLabel,
  countLabel,
}) => (
  <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-base font-bold text-slate-950">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
        photos.length > 0
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-500'
      }`}>
        <Camera className="h-3.5 w-3.5" />
        {countLabel}
      </span>
    </div>
    <div className="mt-4">
      <RentalEvidenceGallery
        title={title}
        subtitle=""
        photos={photos}
        emptyLabel={emptyLabel}
        variant="flat"
        hideHeader
      />
    </div>
  </div>
);

const OwnerExecutionDocumentRow = ({
  title,
  description,
  statusLabel,
  statusTone = 'slate',
  href = '',
  previewUrl = '',
  previewAlt = '',
  previewLabel = '',
  previewEmptyLabel = '',
  showPreviewSlot = false,
  onAction = null,
  actionLabel = '',
  actionBusy = false,
  actionDisabled = false,
  tr,
}) => {
  const toneClass =
    statusTone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : statusTone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : statusTone === 'violet'
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-slate-950">{title}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${toneClass}`}>
              {statusTone === 'emerald' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {showPreviewSlot ? (
          <div className="flex w-full flex-shrink-0 flex-col gap-2 sm:w-[172px]">
            {previewLabel ? (
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                {previewLabel}
              </p>
            ) : null}
            <div className="flex h-20 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/50 p-2 shadow-inner">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={previewAlt || title}
                  className="max-h-full w-full object-contain"
                />
              ) : (
                <span className="px-2 text-center text-xs font-semibold leading-5 text-slate-400">
                  {previewEmptyLabel || tr('No signature yet', 'Aucune signature')}
                </span>
              )}
            </div>
          </div>
        ) : onAction ? (
          <button
            type="button"
            onClick={onAction}
            disabled={actionBusy || actionDisabled}
            className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {actionBusy ? tr('Preparing...', 'Préparation...') : actionLabel || tr('Open', 'Ouvrir')}
          </button>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
          >
            <ExternalLink className="h-4 w-4" />
            {actionLabel || tr('Open', 'Ouvrir')}
          </a>
        ) : null}
      </div>
    </div>
  );
};

const RentalOperationSummaryCard = ({ label, value, detail, tone = 'slate' }) => {
  const isReferenceDetail = tone === 'violet';
  const detailClassName = tone === 'emerald'
    ? 'mobile-summary-support mt-1 text-sm font-semibold text-emerald-600'
    : 'mobile-summary-support mt-1 text-sm font-medium text-slate-500';

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mobile-summary-value mt-2 line-clamp-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{value || '—'}</p>
      {detail ? (
        isReferenceDetail ? (
          <span className="mobile-summary-support mt-1 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700 shadow-sm">
            {detail}
          </span>
        ) : (
          <p className={detailClassName}>{detail}</p>
        )
      ) : null}
    </div>
  );
};

const StatusPill = ({ label, tone = 'slate' }) => (
  <span
    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
      tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : tone === 'danger'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-slate-200 bg-slate-50 text-slate-600'
    }`}
  >
    {label}
  </span>
);

const InfoRow = ({ label, value }) => (
  <div className={`${workspaceInsetPanelClass} flex items-center justify-between gap-3 text-sm`}>
    <span className="font-medium text-slate-500">{label}</span>
    <span className="font-semibold text-slate-900">{value || '—'}</span>
  </div>
);

const ViewField = ({ label, value }) => (
  <div className={workspaceMetricCardClass}>
    <p className={baseLabelClassName}>{label}</p>
    <p className="mt-2 text-sm font-semibold text-slate-900">{value || '—'}</p>
  </div>
);

const OwnerSectionSaveAction = ({
  label,
  savedLabel,
  saving = false,
  disabled = false,
  onSave,
  tone = 'dark',
}) => (
  <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
    {savedLabel ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {savedLabel}
      </span>
    ) : null}
    <button
      type="button"
      onClick={onSave}
      disabled={disabled || saving}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed ${
        tone === 'soft'
          ? 'border border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60'
          : 'bg-slate-950 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300'
      }`}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {label}
    </button>
  </div>
);

const OwnerFuelLevelPicker = ({
  value,
  onChange,
  onSelect,
  disabled = false,
  tr,
  litersLabel = '',
  title,
  description,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-slate-950">{title || tr('Starting fuel level', 'Niveau de carburant de départ')}</p>
        <p className="mt-1 text-sm text-slate-500">
          {description || tr('Choose one of the 8 fuel lines before pickup.', 'Choisissez un des 8 niveaux avant le départ.')}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg font-black text-slate-950">
          {value === '' || value === null || value === undefined ? '—' : `${value}/8`}
        </p>
        {litersLabel ? <p className="mt-1 text-xs font-medium text-slate-400">{litersLabel}</p> : null}
      </div>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
      {OWNER_FUEL_LEVEL_OPTIONS.map((option) => {
        const selected = Number(value) === option;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => (onChange || onSelect)?.(option)}
            className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
              selected
                ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {option === 0 ? tr('Empty', 'Vide') : option === 8 ? tr('Full', 'Plein') : `${option}/8`}
          </button>
        );
      })}
    </div>
  </div>
);

const AccountMarketplaceVehicleProfile = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const getVehicleLegalScanTitle = (category) => {
    const key = String(category || '').trim().toLowerCase();
    const labels = VEHICLE_LEGAL_SCAN_TITLE[key] || VEHICLE_LEGAL_SCAN_TITLE.registration;
    return isFrench ? labels.fr : labels.en;
  };
  const location = useLocation();
  const navigate = useNavigate();
  const { vehicleId } = useParams();
  const isNewVehicle = vehicleId === 'new';
  const isOperationsWorkspaceRoute = location.pathname.includes('/account/operations/');
  const routeOwnerOperationRequest = useMemo(() => {
    if (!isOperationsWorkspaceRoute) return null;
    const requestId = String(new URLSearchParams(location.search).get('requestId') || '').trim();
    let stateRequest = location.state?.ownerOperationRequest;
    if (!stateRequest?.id && requestId && typeof window !== 'undefined') {
      try {
        const cachedRequest = JSON.parse(window.sessionStorage.getItem(`driveout_owner_operation_request:${requestId}`) || 'null');
        if (cachedRequest?.id) stateRequest = cachedRequest;
      } catch {
        // Best-effort route acceleration only.
      }
    }
    if (!stateRequest?.id) return null;
    if (requestId && String(stateRequest.id) !== requestId) return null;
    const requestVehicleId = String(
      stateRequest?.vehiclePublicProfileId ||
        stateRequest?.rawListing?.vehicle_public_profile_id ||
        stateRequest?.rawProfile?.id ||
        ''
    ).trim();
    if (requestVehicleId && vehicleId && requestVehicleId !== String(vehicleId)) return null;
    return stateRequest;
  }, [isOperationsWorkspaceRoute, location.search, location.state, vehicleId]);
  const { user, userProfile, activatePrivateOwnerAccount } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(isOperationsWorkspaceRoute ? 'bookings' : 'overview');
  const [isEditingVehicle, setIsEditingVehicle] = useState(isNewVehicle);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [lastProfileSaveAt, setLastProfileSaveAt] = useState(0);
  const [reviewSubmissionPending, setReviewSubmissionPending] = useState(false);
  const [reviewSubmissionNotice, setReviewSubmissionNotice] = useState('');
  const [reviewSubmissionSent, setReviewSubmissionSent] = useState(false);
  const [publishListingPending, setPublishListingPending] = useState(false);
  const [reviewPublishDetailsExpanded, setReviewPublishDetailsExpanded] = useState(true);
  const [operationsWorkflowExpanded, setOperationsWorkflowExpanded] = useState(false);
  const [operationsReferenceExpanded, setOperationsReferenceExpanded] = useState(false);
  const [operationsMediaExpanded, setOperationsMediaExpanded] = useState(false);
  const [operationsFocusedMediaPhase, setOperationsFocusedMediaPhase] = useState('');
  const [operationsDocumentsExpanded, setOperationsDocumentsExpanded] = useState(false);
  const [operationsVehicleExpanded, setOperationsVehicleExpanded] = useState(false);
  const [operationsDetailExpanded, setOperationsDetailExpanded] = useState(false);
  const [operationsQueueExpanded, setOperationsQueueExpanded] = useState(false);
  const [sectionSaveMeta, setSectionSaveMeta] = useState({});
  const [vehicleLegalScanResults, setVehicleLegalScanResults] = useState({});
  const [formData, setFormData] = useState(() => buildFormData(null));
  const [fieldErrors, setFieldErrors] = useState({});
  const [vehicleRequests, setVehicleRequests] = useState(() => (routeOwnerOperationRequest ? [routeOwnerOperationRequest] : []));
  const loadVehicleProfileRunRef = useRef(0);
  const [vehicleDocuments, setVehicleDocuments] = useState([]);
  const [vehicleFuelState, setVehicleFuelState] = useState(null);
  const [annualTaxRecords, setAnnualTaxRecords] = useState([]);
  const [vehicleFinanceOverview, setVehicleFinanceOverview] = useState(null);
  const [vehicleVerificationSummary, setVehicleVerificationSummary] = useState(null);
  const [ownerVerificationSummary, setOwnerVerificationSummary] = useState(null);
  const [taxEditing, setTaxEditing] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxForm, setTaxForm] = useState(() => createTaxFormState());
  const [focusedSectionId, setFocusedSectionId] = useState('');
  const [vehicleLegalProcessingState, setVehicleLegalProcessingState] = useState({
    active: false,
    queued: false,
    currentCategory: '',
    currentCategoryLabel: '',
    queuedCategory: '',
    queuedCategoryLabel: '',
    status: '',
    progress: 0,
  });
  const [reviewThreadOpenSignal, setReviewThreadOpenSignal] = useState(0);
  const [ownerExecutionDraft, setOwnerExecutionDraft] = useState(() => createOwnerExecutionDraft());
  const ownerExecutionDraftRef = useRef(ownerExecutionDraft);
  const [ownerExecutionSaving, setOwnerExecutionSaving] = useState(false);
  const [ownerExecutionDocumentActionKey, setOwnerExecutionDocumentActionKey] = useState('');
  const [ownerExecutionNow, setOwnerExecutionNow] = useState(() => Date.now());
  const [handoffOdometerInput, setHandoffOdometerInput] = useState('');
  const [returnOdometerInput, setReturnOdometerInput] = useState('');
  const [showOwnerStartOdometerModal, setShowOwnerStartOdometerModal] = useState(false);
  const [showOwnerStartFuelModal, setShowOwnerStartFuelModal] = useState(false);
  const [showOwnerReturnOdometerModal, setShowOwnerReturnOdometerModal] = useState(false);
  const [showOwnerReturnFuelModal, setShowOwnerReturnFuelModal] = useState(false);
  const [showOwnerSignatureModal, setShowOwnerSignatureModal] = useState(false);
  const [showOwnerRefundSignatureModal, setShowOwnerRefundSignatureModal] = useState(false);
  const operationsMediaSectionRef = useRef(null);
  const ownerExecutionDocumentGenerationRef = useRef({ contract: false, receipt: false });
  const ownerExecutionDocumentAutoPrepareRef = useRef('');

  useEffect(() => {
    ownerExecutionDraftRef.current = ownerExecutionDraft;
  }, [ownerExecutionDraft]);

  const getVehicleLegalFieldLabel = useCallback(
    (fieldKey) => {
      const labels = {
        registrationNumber: tr('Registration number', "Numéro d'immatriculation administratif"),
        registrationDate: tr('Registration date', "Date d'immatriculation"),
        registrationExpiryDate: tr('Registration expiry', "Expiration de l'immatriculation"),
        insurancePolicyNumber: tr('Policy number', "Numéro de police d'assurance"),
        insuranceProvider: tr('Insurance provider', "Compagnie d'assurance"),
        insuranceExpiryDate: tr('Insurance expiry', "Expiration de l'assurance"),
      };

      return labels[fieldKey] || fieldKey;
    },
    [isFrench]
  );

  const backLink = useMemo(() => {
    const returnPath = resolveReturnPath(location, '');
    if (returnPath) {
      return returnPath;
    }

    if (isOperationsWorkspaceRoute) {
      return '/account/overview';
    }

    if (getKnownOwnerVehicleCount(user?.id) > 1) {
      return '/account/vehicles';
    }

    return '/account/vehicles';
  }, [isOperationsWorkspaceRoute, location, user?.id]);
  const currentPath = useMemo(() => getCurrentLocationPath(location), [location]);
  const effectiveActiveTab = isOperationsWorkspaceRoute ? 'bookings' : activeTab;
  const resumeEditingAfterLoad = Boolean(location.state?.resumeEditing);
  const resumeFocusedSectionId = String(location.state?.focusSectionId || '').trim();
  const resolvedVehicleId = vehicle?.id || vehicleId;
  const linkedFleetVehicleId = getLinkedFleetVehicleIdFromProfile(vehicle?.rawProfile, vehicle);
  const vehicleVerificationEntityIds = useMemo(
    () => buildVehicleVerificationEntityIds(linkedFleetVehicleId, resolvedVehicleId),
    [linkedFleetVehicleId, resolvedVehicleId]
  );
  const vehicleVerificationEntityId = vehicleVerificationEntityIds[0] || null;
  const draftUploadVehicleId = vehicle?.id || (isNewVehicle && user?.id ? `owner-draft-${user.id}` : resolvedVehicleId);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });
  const annualTaxDocuments = useMemo(() => {
    const documents = Array.isArray(vehicleDocuments) ? vehicleDocuments : [];
    return documents.filter((document) => {
      const haystack = [
        document?.categoryKey,
        document?.category,
        document?.name,
        document?.storagePath,
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes('annual-tax')
        || haystack.includes('annual vehicle tax')
        || haystack.includes('vehicle tax')
        || haystack.includes('vignette');
    });
  }, [vehicleDocuments]);

  useEffect(() => {
    if (!isNewVehicle || vehicle?.id || !draftUploadVehicleId || !String(draftUploadVehicleId).startsWith('owner-draft-')) {
      return;
    }

    let cancelled = false;

    const loadDraftMediaFromStorage = async () => {
      try {
        const organizationId = await getCurrentOrganizationId();
        const prefixes = buildStoragePathCandidates(organizationId, `vehicles/${draftUploadVehicleId}`);
        let storageMedia = [];

        for (const prefix of prefixes) {
          const { data: files, error: listError } = await supabase.storage
            .from('vehicle-images')
            .list(String(prefix), { limit: 50, offset: 0 });

          if (listError || cancelled) {
            continue;
          }

          storageMedia = storageMedia.concat(mapDraftVehicleStorageImages(prefix, files));
        }

        if (!storageMedia.length) {
          return;
        }

        setFormData((current) => {
          const existingMedia = normalizeMediaFromFormState(current);
          if (existingMedia.length > 0) {
            return current;
          }

          const coverImageUrl =
            storageMedia.find((item) => item.shot_type === 'hero')?.url ||
            storageMedia.find((item) => item.is_cover)?.url ||
            storageMedia[0]?.url ||
            '';

          return {
            ...current,
            media: storageMedia,
            mediaUrlsText: storageMedia.map((item) => item.url).join('\n'),
            coverImageUrl,
          };
        });
      } catch (_error) {
        // Best-effort draft restoration only.
      }
    };

    void loadDraftMediaFromStorage();

    return () => {
      cancelled = true;
    };
  }, [draftUploadVehicleId, isNewVehicle, vehicle?.id]);

  useEffect(() => {
    if (!routeOwnerOperationRequest?.id) return;
    setVehicleRequests((current) => {
      const rows = Array.isArray(current) ? current : [];
      if (rows.some((request) => String(request?.id || '') === String(routeOwnerOperationRequest.id))) {
        return rows;
      }
      return [routeOwnerOperationRequest, ...rows];
    });
  }, [routeOwnerOperationRequest]);

  const getAnnualTaxDocumentForRecord = useCallback((record) => {
    const taxYear = String(record?.tax_year || '').trim();
    if (!annualTaxDocuments.length) return null;

    if (taxYear) {
      const matchingYearDocument = annualTaxDocuments.find((document) => {
        const haystack = [
          document?.name,
          document?.storagePath,
          document?.uploadedAt,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(taxYear);
      });

      if (matchingYearDocument) return matchingYearDocument;
    }

    return annualTaxDocuments[0] || null;
  }, [annualTaxDocuments]);

  const ownerMetadata = useMemo(
    () => ({
      full_name: userProfile?.fullName || user?.user_metadata?.full_name || user?.user_metadata?.name || '',
      company_name: userProfile?.companyName || user?.user_metadata?.company_name || '',
      city: userProfile?.city || user?.user_metadata?.city || '',
      country: userProfile?.country || user?.user_metadata?.country || '',
      email: userProfile?.email || user?.email || '',
    }),
    [userProfile, user]
  );

  const cacheOwnerOperationRequest = useCallback((request) => {
    if (!isOperationsWorkspaceRoute || !request?.id || typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(
        `driveout_owner_operation_request:${String(request.id)}`,
        JSON.stringify(request)
      );
    } catch {
      // Best-effort route acceleration only.
    }
  }, [isOperationsWorkspaceRoute]);

  const loadVehicleProfile = useCallback(
    async ({ silent = false } = {}) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      if (isNewVehicle) {
        setVehicle(null);
        setFormData(buildFormData(null));
        setIsEditingVehicle(true);
        setVehicleRequests([]);
        setVehicleDocuments([]);
        setAnnualTaxRecords([]);
        setVehicleFinanceOverview(null);
        setVehicleVerificationSummary(null);
        setOwnerVerificationSummary(null);
        setLoading(false);
        return;
      }
      if (!vehicleId) {
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      const loadRunId = loadVehicleProfileRunRef.current + 1;
      loadVehicleProfileRunRef.current = loadRunId;
      const isCurrentLoad = () => loadVehicleProfileRunRef.current === loadRunId;
      setError((current) => (silent ? current : ''));
      const [result, ownerVerificationResult] = await Promise.all([
        BusinessMarketplaceService.getOwnerVehicle(user.id, vehicleId),
        VerificationService.getEntityVerificationSummary('user', user.id).catch(() => ({ summary: null })),
      ]);
      if (result?.error && !result?.vehicle) {
        throw result.error;
      }
      const nextVehicle = result?.vehicle || null;
      const nextLinkedFleetVehicleId = getLinkedFleetVehicleIdFromProfile(nextVehicle?.rawProfile, nextVehicle);
      const ownerRequestsPromise = nextVehicle?.id
        ? BusinessMarketplaceService.getOwnerRequests(user.id, 'all')
        : Promise.resolve({ requests: [] });
      const nextVehicleVerificationEntityIds = buildVehicleVerificationEntityIds(nextLinkedFleetVehicleId, nextVehicle?.id || vehicleId);
      const verificationFileResults = nextVehicleVerificationEntityIds.length > 0
        ? await Promise.all(
            nextVehicleVerificationEntityIds.map((entityId) =>
              VerificationService.getEntityVerificationFile('vehicle', entityId, { forceRefresh: true })
                .catch(() => ({ summary: null, requests: [] }))
            )
          )
        : [{ summary: null, requests: [] }];
      const fallbackVehicleVerificationSummary = nextVehicle?.rawFleetVehicle?.verification_summary || null;
      const nextVerificationSources = fallbackVehicleVerificationSummary
        ? [...verificationFileResults, { summary: fallbackVehicleVerificationSummary, requests: [] }]
        : verificationFileResults;
      const nextVerificationRequests = getVehicleVerificationRowsFromFileResults(nextVerificationSources);
      const nextVerificationDocuments = mapVehicleVerificationRequestsToDocuments(nextVerificationRequests);
      const nextVerificationSummary = nextVerificationRequests.length > 0
        ? buildEntityVerificationSummary(nextVerificationRequests, 'vehicle')
        : nextVerificationSources.find((fileResult) => fileResult?.summary)?.summary || null;
      setVehicleVerificationSummary(nextVerificationSummary);
      setVehicleDocuments((current) => mergeVehicleDocuments(current, nextVerificationDocuments));
      setOwnerVerificationSummary(ownerVerificationResult?.summary || null);
      setVehicle(nextVehicle);
      setFormData(buildFormData(nextVehicle));
      setIsEditingVehicle(resumeEditingAfterLoad);
      setFocusedSectionId(resumeFocusedSectionId || '');
      storeOwnerVehicleId(user?.id, nextVehicle?.id);
      if (nextLinkedFleetVehicleId) {
        void Promise.all([
          FuelTransactionService.getVehicleFuelState(nextLinkedFleetVehicleId),
          VehicleAnnualTaxService.listForVehicle(nextLinkedFleetVehicleId),
        ])
          .then(([nextFuelState, nextAnnualTaxes]) => {
            if (!isCurrentLoad()) return;
            setVehicleFuelState(nextFuelState || null);
            setAnnualTaxRecords(Array.isArray(nextAnnualTaxes) ? nextAnnualTaxes : []);
          })
          .catch(() => {
            if (!isCurrentLoad()) return;
            setVehicleFuelState(null);
            setAnnualTaxRecords([]);
          });

        if (!isOperationsWorkspaceRoute) {
          void financeApiV2.getVehicleFinanceData([nextLinkedFleetVehicleId], {})
            .then((nextFinanceOverview) => {
              if (!isCurrentLoad()) return;
              setVehicleFinanceOverview(nextFinanceOverview || null);
            })
            .catch(() => {
              if (!isCurrentLoad()) return;
              setVehicleFinanceOverview(null);
            });
        } else {
          setVehicleFinanceOverview(null);
        }
      } else {
        setVehicleFuelState(null);
        setAnnualTaxRecords([]);
        setVehicleFinanceOverview(null);
      }
      if (nextVehicle?.id) {
        const ownerRequestsResult = await ownerRequestsPromise;
        const nextRequests = Array.isArray(ownerRequestsResult?.requests) ? ownerRequestsResult.requests : [];
        const nextVehicleRequests = nextRequests.filter((request) =>
          String(request?.vehiclePublicProfileId || '') === String(vehicleId || '') ||
          String(request?.listingId || '') === String(nextVehicle?.listingId || '')
        );
        setVehicleRequests(nextVehicleRequests);
        if (requestedOperationalRequestId) {
          const requestedRequest = nextVehicleRequests.find(
            (request) => String(request?.id || '') === requestedOperationalRequestId
          );
          cacheOwnerOperationRequest(requestedRequest);
        }
      } else {
        setVehicleRequests([]);
      }
    },
    [
      cacheOwnerOperationRequest,
      isNewVehicle,
      isOperationsWorkspaceRoute,
      requestedOperationalRequestId,
      resumeEditingAfterLoad,
      resumeFocusedSectionId,
      user?.id,
      vehicleId,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await loadVehicleProfile();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load this vehicle right now.', 'Impossible de charger ce véhicule pour le moment.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadVehicleProfile, isFrench]);

  useEffect(() => {
    if (!user?.id || !vehicleId || isNewVehicle) return undefined;

    let reloadTimer = null;
    const scheduleReload = () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      reloadTimer = window.setTimeout(() => {
        void loadVehicleProfile({ silent: true }).catch(() => {});
      }, 300);
    };

    const listingChannel = supabase
      .channel(`owner-vehicle-listing-${user.id}-${vehicleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_marketplace_listings',
          filter: `vehicle_public_profile_id=eq.${vehicleId}`,
        },
        scheduleReload
      )
      .subscribe();

    const messageChannel = supabase
      .channel(`owner-vehicle-messages-${user.id}-${vehicleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_marketplace_owner_messages',
        },
        scheduleReload
      )
      .subscribe();

    return () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      try {
        supabase.removeChannel(listingChannel);
        supabase.removeChannel(messageChannel);
      } catch {
        // ignore realtime cleanup failures
      }
    };
  }, [isNewVehicle, loadVehicleProfile, user?.id, vehicleId]);

  useEffect(() => {
    if (isOperationsWorkspaceRoute) {
      setActiveTab('bookings');
      return;
    }
    const requestedTab = new URLSearchParams(location.search).get('tab');
    if (!requestedTab) {
      setActiveTab('overview');
      return;
    }
    if (['overview', 'listing', 'bookings', 'finance', 'legal'].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [isNewVehicle, isOperationsWorkspaceRoute, location.search]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const requestId = String(searchParams.get('requestId') || '').trim();
    const focusSectionFromQuery = String(searchParams.get('focusSectionId') || '').trim();
    if (!requestId && !focusSectionFromQuery) return;

    if (requestId) {
      setActiveTab('bookings');
      setFocusedSectionId(focusSectionFromQuery || 'owner-rental-execution');
      return;
    }

    setFocusedSectionId(focusSectionFromQuery);
  }, [location.search]);

  useEffect(() => {
    if (!focusedSectionId) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(focusedSectionId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    const timeout = window.setTimeout(() => {
      setFocusedSectionId('');
    }, 2200);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focusedSectionId, activeTab]);

  const updateField = (key, value) => {
    setFormData((current) => ({
      ...current,
      [key]: value,
    }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const normalizedMedia = useMemo(() => normalizeMediaFromFormState(formData), [formData]);
  const vehiclePhotoRequirements = useMemo(
    () => getVehiclePhotoRequirementStatus(normalizedMedia),
    [normalizedMedia]
  );

  const reviewErrors = useMemo(() => validateOwnerVehicleForm({
    ...formData,
    extras: parseCommaSeparated(formData.extrasText),
    media: normalizedMedia,
  }, true), [formData, normalizedMedia]);
  const hasStartedDraft = useMemo(
    () => Boolean(vehicle?.id) || hasMeaningfulVehicleDraft(formData, normalizedMedia),
    [vehicle?.id, formData, normalizedMedia]
  );
  const vehicleFinanceCostRows = useMemo(() => {
    if (!vehicleFinanceOverview) return [];

    const acquisition = Number(vehicleFinanceOverview.lifetimeAcquisitionCosts || 0);
    const otherWithoutAcquisition = Math.max(0, Number(vehicleFinanceOverview.lifetimeOtherCosts || 0) - acquisition);

    return [
      { key: 'acquisition', label: tr('Acquisition', 'Acquisition'), value: acquisition },
      { key: 'maintenance', label: tr('Maintenance', 'Maintenance'), value: Number(vehicleFinanceOverview.lifetimeMaintenanceCosts || 0) },
      { key: 'fuel', label: tr('Fuel', 'Carburant'), value: Number(vehicleFinanceOverview.lifetimeFuelCosts || 0) },
      { key: 'parts', label: tr('Parts / inventory', 'Pièces / stock'), value: Number(vehicleFinanceOverview.lifetimeInventoryCosts || 0) },
      { key: 'other', label: tr('Other', 'Autres'), value: otherWithoutAcquisition },
    ].filter((row) => row.value > 0);
  }, [vehicleFinanceOverview, isFrench]);
  const bookingsSummary = useMemo(() => {
    const rows = Array.isArray(vehicleRequests) ? vehicleRequests : [];
    return {
      total: rows.length,
      pending: rows.filter((row) => ['pending', 'countered'].includes(String(row?.requestStatus || '').toLowerCase())).length,
      preApproved: rows.filter((row) => String(row?.requestStatus || '').toLowerCase() === 'pre_approved').length,
      declined: rows.filter((row) => String(row?.requestStatus || '').toLowerCase() === 'declined').length,
    };
  }, [vehicleRequests]);
  const requestedOperationalRequestId = useMemo(
    () => String(new URLSearchParams(location.search).get('requestId') || '').trim(),
    [location.search]
  );
  const operationalRequest = useMemo(() => {
    const rows = Array.isArray(vehicleRequests) ? vehicleRequests : [];
    if (isOperationsWorkspaceRoute && requestedOperationalRequestId) {
      const requestedRouteMatch = rows.find(
        (row) => String(row?.id || '').trim() === requestedOperationalRequestId
      );
      if (requestedRouteMatch) return requestedRouteMatch;
    }

    const candidates = rows.filter((row) =>
      ['pre_approved', 'approved', 'active', 'completed'].includes(String(row?.requestStatus || '').toLowerCase())
    );
    if (!candidates.length) return null;
    if (requestedOperationalRequestId) {
      const requestedMatch = candidates.find(
        (row) => String(row?.id || '').trim() === requestedOperationalRequestId
      );
      if (requestedMatch) return requestedMatch;
    }
    return [...candidates].sort((left, right) => {
      const priorityDelta = getOwnerExecutionPriority(left?.requestStatus) - getOwnerExecutionPriority(right?.requestStatus);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right?.updatedAt || right?.createdAt || 0).getTime() - new Date(left?.updatedAt || left?.createdAt || 0).getTime();
    })[0] || null;
  }, [isOperationsWorkspaceRoute, requestedOperationalRequestId, vehicleRequests]);
  const ownerExecutionWorkflowStatus = useMemo(() => {
    const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(operationalRequest?.requestStatus || 'pending');
    const isRenderableStatus = ['pre_approved', 'approved', 'active', 'completed'].includes(normalizedStatus);

    if (isRenderableStatus) return normalizedStatus;

    if (isOperationsWorkspaceRoute && operationalRequest?.id && requestedOperationalRequestId) {
      return 'approved';
    }

    return normalizedStatus;
  }, [isOperationsWorkspaceRoute, operationalRequest?.id, operationalRequest?.requestStatus, requestedOperationalRequestId]);
  const operationalRequestMoney = useMemo(
    () => getMarketplaceMoneyBreakdown({
      estimatedAmount:
        operationalRequest?.estimatedAmount ||
        operationalRequest?.dailyPrice ||
        operationalRequest?.halfDayPrice ||
        operationalRequest?.hourlyPrice,
      commissionAmount: operationalRequest?.commissionAmount,
    }),
    [
      operationalRequest?.commissionAmount,
      operationalRequest?.dailyPrice,
      operationalRequest?.estimatedAmount,
      operationalRequest?.halfDayPrice,
      operationalRequest?.hourlyPrice,
    ]
  );
  const operationalExecutionMeta = useMemo(
    () => getOwnerExecutionMeta(ownerExecutionWorkflowStatus, tr),
    [ownerExecutionWorkflowStatus, tr]
  );
  const operationalRequestExecutionAction = useMemo(
    () => getOwnerExecutionActionConfig(operationalRequest, tr),
    [operationalRequest, tr]
  );
  const operationalFundsLifecycle = useMemo(() => {
    const status = String(ownerExecutionWorkflowStatus || '').trim().toLowerCase();
    return [
      {
        key: 'fee',
        label: tr('DriveOut fee', 'Frais DriveOut'),
        detail: tr('Secured once the renter confirms.', 'Sécurisés dès que le locataire confirme.'),
        active: ['pre_approved'].includes(status),
        complete: ['approved', 'active', 'completed'].includes(status),
      },
      {
        key: 'deposit',
        label: tr('Damage deposit', 'Caution'),
        detail: tr('Held at handoff until return is checked.', 'Retenue à la remise jusqu’au contrôle retour.'),
        active: ['approved', 'active'].includes(status),
        complete: ['completed'].includes(status),
      },
      {
        key: 'payout',
        label: tr('Owner payout', 'Versement propriétaire'),
        detail: tr('Releases after the rental is started.', 'Se libère après le démarrage de la location.'),
        active: ['approved'].includes(status),
        complete: ['active', 'completed'].includes(status),
      },
    ];
  }, [ownerExecutionWorkflowStatus, tr]);
  const operationalSettlementRules = useMemo(
    () => getMarketplaceFundsPolicy(tr),
    [tr]
  );
  const ownerExecutionStorageKey = useMemo(
    () => buildOwnerExecutionStorageKey(operationalRequest?.id, user?.id),
    [operationalRequest?.id, user?.id]
  );
  const ownerExecutionStorageKeys = useMemo(
    () => buildOwnerExecutionStorageKeys(operationalRequest?.id, user?.id),
    [operationalRequest?.id, user?.id]
  );
  const ownerExecutionStage = useMemo(() => {
    const status = normalizeMarketplaceRequestLifecycleStatus(ownerExecutionWorkflowStatus || 'pending');
    if (status === 'completed' || ownerExecutionDraft.returnSavedAt) return 'completed';
    if ((status === 'active' || ownerExecutionDraft.startedAt) && ownerExecutionDraft.returnPendingAt) return 'return_pending';
    if (status === 'active' || ownerExecutionDraft.startedAt) return 'live';
    if (status === 'approved' || ownerExecutionDraft.startReadyAt) return ownerExecutionDraft.startReadyAt ? 'ready_to_start' : 'handoff';
    if (status === 'pre_approved') return 'approved';
    return 'requested';
  }, [ownerExecutionDraft.returnPendingAt, ownerExecutionDraft.returnSavedAt, ownerExecutionDraft.startedAt, ownerExecutionDraft.startReadyAt, ownerExecutionWorkflowStatus]);
  const ownerExecutionFocusMode = useMemo(
    () => isOperationsWorkspaceRoute && OWNER_EXECUTION_FOCUS_STAGES.has(ownerExecutionStage),
    [isOperationsWorkspaceRoute, ownerExecutionStage]
  );
  useEffect(() => {
    if (!ownerExecutionFocusMode) return;

    setOperationsReferenceExpanded(false);
    setOperationsMediaExpanded(false);
    setOperationsFocusedMediaPhase('');
    setOperationsDocumentsExpanded(false);
    setOperationsVehicleExpanded(false);
    setOperationsDetailExpanded(false);
    setOperationsWorkflowExpanded(false);
    setOperationsQueueExpanded(false);
  }, [ownerExecutionFocusMode, ownerExecutionStage]);
  const ownerExecutionHandoffLocked = useMemo(
    () => isOwnerExecutionHandoffLocked(ownerExecutionDraft, ownerExecutionWorkflowStatus),
    [ownerExecutionDraft, ownerExecutionWorkflowStatus]
  );
  const ownerExecutionStartedAt = useMemo(
    () => ownerExecutionDraft.startedAt || operationalRequest?.rawRequest?.counter_offer?.owner_execution?.startedAt || operationalRequest?.updatedAt || null,
    [operationalRequest?.rawRequest?.counter_offer?.owner_execution?.startedAt, operationalRequest?.updatedAt, ownerExecutionDraft.startedAt]
  );
  const ownerExecutionStartedAtMs = useMemo(() => {
    if (!ownerExecutionStartedAt) return null;
    const timestamp = new Date(ownerExecutionStartedAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }, [ownerExecutionStartedAt]);
  const ownerExecutionReturnFlowArmed = useMemo(
    () =>
      Boolean(ownerExecutionStartedAtMs) &&
      ownerExecutionNow - ownerExecutionStartedAtMs >= OWNER_RETURN_FLOW_ARM_DELAY_MS,
    [ownerExecutionNow, ownerExecutionStartedAtMs]
  );
  const ownerExecutionCanEndRental = useMemo(
    () => ownerExecutionStage === 'live' && Boolean(ownerExecutionStartedAt),
    [ownerExecutionStage, ownerExecutionStartedAt]
  );
  const ownerExecutionCanStartReturnFlow = useMemo(
    () => ownerExecutionCanEndRental && ownerExecutionReturnFlowArmed,
    [ownerExecutionCanEndRental, ownerExecutionReturnFlowArmed]
  );
  const ownerExecutionReturnLocked = useMemo(
    () => isOwnerExecutionReturnLocked(ownerExecutionDraft, ownerExecutionWorkflowStatus),
    [ownerExecutionDraft, ownerExecutionWorkflowStatus]
  );
  const ownerExecutionHandoffPhotos = useMemo(
    () => normalizeOwnerExecutionPhotos(ownerExecutionDraft.handoffPhotos),
    [ownerExecutionDraft.handoffPhotos]
  );
  const ownerExecutionLegalDocsPhotos = useMemo(
    () => normalizeOwnerExecutionPhotos(ownerExecutionDraft.legalDocsPhotos),
    [ownerExecutionDraft.legalDocsPhotos]
  );
  const ownerExecutionReturnPhotos = useMemo(
    () => normalizeOwnerExecutionPhotos(ownerExecutionDraft.returnPhotos),
    [ownerExecutionDraft.returnPhotos]
  );
  const ownerExecutionMediaCount =
    ownerExecutionHandoffPhotos.length +
    ownerExecutionLegalDocsPhotos.length +
    ownerExecutionReturnPhotos.length;
  const ownerExecutionLegalDocsReady =
    Boolean(ownerExecutionDraft.legalDocsMediaReady) ||
    ownerExecutionLegalDocsPhotos.length >= OWNER_LEGAL_DOCS_MIN_PHOTOS;
  const openOwnerExecutionMediaSection = useCallback((phase = '') => {
    const normalizedPhase = String(phase || '').trim();
    setOperationsFocusedMediaPhase(['handoff', 'legal_docs', 'return'].includes(normalizedPhase) ? normalizedPhase : '');
    setOperationsReferenceExpanded(true);
    setOperationsMediaExpanded(true);
    if (typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        operationsMediaSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 80);
    });
  }, []);
  const ownerHandoffReady = useMemo(
    () => [
      ownerExecutionDraft.handoffMediaReady,
      hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer),
      hasOwnerExecutionNumberValue(ownerExecutionDraft.startFuelLevel),
      ownerExecutionLegalDocsReady,
      ownerExecutionDraft.depositConfirmed,
      ownerExecutionDraft.contractSigned,
    ].every(Boolean),
    [
      ownerExecutionDraft.contractSigned,
      ownerExecutionDraft.depositConfirmed,
      ownerExecutionDraft.handoffMediaReady,
      ownerExecutionLegalDocsReady,
      ownerExecutionDraft.startFuelLevel,
      ownerExecutionDraft.startOdometer,
    ]
  );
  const ownerReturnReady = useMemo(
    () => [
      ownerExecutionDraft.returnMediaReady,
      hasOwnerExecutionNumberValue(ownerExecutionDraft.returnOdometer) &&
        (!hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer) ||
          Number(ownerExecutionDraft.returnOdometer) >= Number(ownerExecutionDraft.startOdometer)),
      hasOwnerExecutionNumberValue(ownerExecutionDraft.returnFuelLevel),
	      ownerExecutionDraft.issueReviewed &&
	        (!ownerExecutionDraft.issueReported || Boolean(String(ownerExecutionDraft.issueNote || '').trim())),
	      isOwnerExecutionDepositReviewComplete(ownerExecutionDraft),
	    ].every(Boolean),
	    [
	      ownerExecutionDraft.depositOutcome,
	      ownerExecutionDraft.depositReviewed,
	      ownerExecutionDraft.depositRefundSignatureUrl,
	      ownerExecutionDraft.issueNote,
	      ownerExecutionDraft.issueReported,
      ownerExecutionDraft.issueReviewed,
      ownerExecutionDraft.returnFuelLevel,
      ownerExecutionDraft.returnMediaReady,
      ownerExecutionDraft.startOdometer,
      ownerExecutionDraft.returnOdometer,
    ]
	  );
	  const ownerReturnFuelDelta = useMemo(() => {
    if (!hasOwnerExecutionNumberValue(ownerExecutionDraft.startFuelLevel) || !hasOwnerExecutionNumberValue(ownerExecutionDraft.returnFuelLevel)) return null;
    const startLevel = Number(ownerExecutionDraft.startFuelLevel);
    const returnLevel = Number(ownerExecutionDraft.returnFuelLevel);
    return returnLevel - startLevel;
	  }, [ownerExecutionDraft.returnFuelLevel, ownerExecutionDraft.startFuelLevel]);
	  const ownerReturnDepositOutcomeLabel = useMemo(() => {
	    if (ownerExecutionDraft.depositOutcome === 'refund_full') {
	      return ownerExecutionDraft.depositRefundSignatureUrl
	        ? tr('Refund in full • Signature saved', 'Remboursement total • Signature enregistrée')
	        : tr('Refund in full • Signature required', 'Remboursement total • Signature requise');
	    }
	    if (ownerExecutionDraft.depositOutcome === 'hold_partial') return tr('Hold partially', 'Retenir partiellement');
	    if (ownerExecutionDraft.depositOutcome === 'hold_full') return tr('Hold fully', 'Retenir en totalité');
	    return tr('Choose the deposit outcome before closing the rental.', 'Choisissez le résultat de la caution avant de clôturer la location.');
	  }, [ownerExecutionDraft.depositOutcome, ownerExecutionDraft.depositRefundSignatureUrl, tr]);
  const ownerHandoffCurrentStep = useMemo(() => {
    if (!ownerExecutionDraft.handoffMediaReady) return OWNER_HANDOFF_STEPS[0];
    if (!hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer)) return OWNER_HANDOFF_STEPS[1];
    if (!hasOwnerExecutionNumberValue(ownerExecutionDraft.startFuelLevel)) return OWNER_HANDOFF_STEPS[2];
    if (!ownerExecutionLegalDocsReady) return OWNER_HANDOFF_STEPS[3];
    if (!ownerExecutionDraft.depositConfirmed) return OWNER_HANDOFF_STEPS[4];
    if (!ownerExecutionDraft.contractSigned) return OWNER_HANDOFF_STEPS[5];
    return OWNER_HANDOFF_STEPS[5];
  }, [
    ownerExecutionDraft.contractSigned,
    ownerExecutionDraft.depositConfirmed,
    ownerExecutionDraft.handoffMediaReady,
    ownerExecutionLegalDocsReady,
    ownerExecutionDraft.startFuelLevel,
    ownerExecutionDraft.startOdometer,
  ]);
  const ownerReturnCurrentStep = useMemo(() => {
    if (!ownerExecutionDraft.returnMediaReady) return OWNER_RETURN_STEPS[0];
    if (
      !(hasOwnerExecutionNumberValue(ownerExecutionDraft.returnOdometer) &&
        (!hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer) ||
          Number(ownerExecutionDraft.returnOdometer) >= Number(ownerExecutionDraft.startOdometer)))
    ) return OWNER_RETURN_STEPS[1];
    if (!hasOwnerExecutionNumberValue(ownerExecutionDraft.returnFuelLevel)) return OWNER_RETURN_STEPS[2];
    if (!ownerExecutionDraft.issueReviewed || (ownerExecutionDraft.issueReported && !String(ownerExecutionDraft.issueNote || '').trim())) return OWNER_RETURN_STEPS[3];
	    if (!isOwnerExecutionDepositReviewComplete(ownerExecutionDraft)) return OWNER_RETURN_STEPS[4];
	    return OWNER_RETURN_STEPS[5];
	  }, [
	    ownerExecutionDraft.depositOutcome,
	    ownerExecutionDraft.depositReviewed,
	    ownerExecutionDraft.depositRefundSignatureUrl,
    ownerExecutionDraft.issueNote,
    ownerExecutionDraft.issueReported,
    ownerExecutionDraft.issueReviewed,
    ownerExecutionDraft.returnFuelLevel,
    ownerExecutionDraft.returnMediaReady,
    ownerExecutionDraft.startOdometer,
    ownerExecutionDraft.returnOdometer,
  ]);
  const ownerExecutionMediaReferenceMeta = useMemo(() => {
    const mediaCountDescription = ownerExecutionMediaCount > 0
      ? tr(
          `Inspection ${ownerExecutionHandoffPhotos.length} • Documents ${ownerExecutionLegalDocsPhotos.length} • Return ${ownerExecutionReturnPhotos.length}`,
          `Inspection ${ownerExecutionHandoffPhotos.length} • Documents ${ownerExecutionLegalDocsPhotos.length} • Retour ${ownerExecutionReturnPhotos.length}`
        )
      : tr('Inspection 0 • Documents 0 • Return 0', 'Inspection 0 • Documents 0 • Retour 0');

    if (
      operationsFocusedMediaPhase === 'handoff' ||
      ((ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff') && ownerHandoffCurrentStep.key === 'vehicle_photos')
    ) {
      return {
        phase: 'handoff',
        shortLabel: tr('Pickup inspection', 'Inspection départ'),
        eyebrow: tr('Current media', 'Média actuel'),
        title: tr('Vehicle inspection media', 'Médias inspection véhicule'),
        description: tr(
          'Current step: capture or review pickup inspection photos.',
          'Étape actuelle : capturez ou vérifiez les photos d’inspection départ.'
        ),
      };
    }

    if (
      operationsFocusedMediaPhase === 'legal_docs' ||
      ((ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff') && ownerHandoffCurrentStep.key === 'legal_docs')
    ) {
      return {
        phase: 'legal_docs',
        shortLabel: tr('Documents proof', 'Preuve documents'),
        eyebrow: tr('Current media', 'Média actuel'),
        title: tr('Registration and insurance media', 'Médias carte grise et assurance'),
        description: tr(
          'Current step: keep registration and insurance proof close.',
          'Étape actuelle : gardez la preuve carte grise et assurance à portée.'
        ),
      };
    }

    if (
      operationsFocusedMediaPhase === 'return' ||
      (ownerExecutionStage === 'return_pending' && ownerReturnCurrentStep.key === 'return_photos')
    ) {
      return {
        phase: 'return',
        shortLabel: tr('Return inspection', 'Inspection retour'),
        eyebrow: tr('Current media', 'Média actuel'),
        title: tr('Return inspection media', 'Médias inspection retour'),
        description: tr(
          'Current step: capture or review return inspection photos.',
          'Étape actuelle : capturez ou vérifiez les photos d’inspection retour.'
        ),
      };
    }

    return {
      phase: 'all',
      shortLabel: tr('Media archive', 'Archive médias'),
      eyebrow: tr('Vehicle media', 'Médias véhicule'),
      title: tr('Vehicle inspection and rental media', 'Inspection véhicule et médias location'),
      description: mediaCountDescription,
    };
  }, [
    ownerExecutionHandoffPhotos.length,
    ownerExecutionLegalDocsPhotos.length,
    ownerExecutionMediaCount,
    ownerExecutionReturnPhotos.length,
    ownerExecutionStage,
    ownerHandoffCurrentStep.key,
    ownerReturnCurrentStep.key,
    operationsFocusedMediaPhase,
    tr,
  ]);
  const ownerExecutionReferenceSummary = useMemo(() => {
    const summaryItems = [
      ownerExecutionFocusMode && ownerExecutionMediaReferenceMeta.phase !== 'all'
        ? ownerExecutionMediaReferenceMeta.shortLabel
        : null,
      tr(
        `${ownerExecutionMediaCount} media item${ownerExecutionMediaCount === 1 ? '' : 's'}`,
        `${ownerExecutionMediaCount} média${ownerExecutionMediaCount === 1 ? '' : 's'}`
      ),
      tr(
        `${vehicleDocuments.length} vehicle document${vehicleDocuments.length === 1 ? '' : 's'}`,
        `${vehicleDocuments.length} document${vehicleDocuments.length === 1 ? '' : 's'} véhicule`
      ),
      formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en'),
    ];

    return summaryItems.filter(Boolean).join(' • ');
  }, [
    isFrench,
    operationalRequest?.currencyCode,
    operationalRequest?.depositAmount,
    ownerExecutionFocusMode,
    ownerExecutionMediaCount,
    ownerExecutionMediaReferenceMeta.phase,
    ownerExecutionMediaReferenceMeta.shortLabel,
    tr,
    vehicleDocuments.length,
  ]);
  const ownerExecutionMediaPhaseCards = useMemo(() => {
    const phaseCards = [
      {
        key: 'handoff',
        title: tr('Vehicle inspection', 'Inspection véhicule'),
        description: '',
        photos: ownerExecutionHandoffPhotos,
        emptyLabel: tr(
          'Vehicle inspection photos will appear here after you save the inspection.',
          'Les photos d’inspection véhicule apparaîtront ici après avoir enregistré l’inspection.'
        ),
        countLabel: tr(
          `${ownerExecutionHandoffPhotos.length} photo${ownerExecutionHandoffPhotos.length === 1 ? '' : 's'}`,
          `${ownerExecutionHandoffPhotos.length} photo${ownerExecutionHandoffPhotos.length === 1 ? '' : 's'}`
        ),
      },
      {
        key: 'legal_docs',
        title: tr('Registration + insurance', 'Carte grise + assurance'),
        description: '',
        photos: ownerExecutionLegalDocsPhotos,
        emptyLabel: tr(
          'Registration and insurance photos will appear here after the document step is saved.',
          'Les photos de carte grise et assurance apparaîtront ici après l’enregistrement de l’étape documents.'
        ),
        countLabel: tr(
          `${ownerExecutionLegalDocsPhotos.length} photo${ownerExecutionLegalDocsPhotos.length === 1 ? '' : 's'}`,
          `${ownerExecutionLegalDocsPhotos.length} photo${ownerExecutionLegalDocsPhotos.length === 1 ? '' : 's'}`
        ),
      },
      {
        key: 'return',
        title: tr('Return media', 'Médias de retour'),
        description: '',
        photos: ownerExecutionReturnPhotos,
        emptyLabel: tr(
          'Return photos will appear here once ready-to-finish evidence is saved.',
          'Les photos de retour apparaîtront ici une fois la preuve de clôture enregistrée.'
        ),
        countLabel: tr(
          `${ownerExecutionReturnPhotos.length} photo${ownerExecutionReturnPhotos.length === 1 ? '' : 's'}`,
          `${ownerExecutionReturnPhotos.length} photo${ownerExecutionReturnPhotos.length === 1 ? '' : 's'}`
        ),
      },
    ];

    if (ownerExecutionMediaReferenceMeta.phase === 'all') return phaseCards;

    return [...phaseCards].sort((left, right) => {
      if (left.key === ownerExecutionMediaReferenceMeta.phase) return -1;
      if (right.key === ownerExecutionMediaReferenceMeta.phase) return 1;
      return 0;
    });
  }, [
    ownerExecutionHandoffPhotos,
    ownerExecutionLegalDocsPhotos,
    ownerExecutionMediaReferenceMeta.phase,
    ownerExecutionReturnPhotos,
    tr,
  ]);
  const buildOwnerExecutionDocumentPayloadForDraft = useCallback(
    (draftOverride = ownerExecutionDraft) =>
      buildDriveOutMarketplaceRentalDocumentPayload({
        operationalRequest,
        ownerExecutionDraft: draftOverride,
        formData,
        vehicleDocuments,
        vehicleFuelState,
        ownerUserId: user?.id || '',
        language: isFrench ? 'fr' : 'en',
      }),
    [
      formData,
      isFrench,
      operationalRequest,
      user?.id,
      vehicleDocuments,
      vehicleFuelState,
    ]
  );
  const ownerExecutionDocumentPayload = useMemo(
    () => buildOwnerExecutionDocumentPayloadForDraft(ownerExecutionDraft),
    [buildOwnerExecutionDocumentPayloadForDraft, ownerExecutionDraft]
  );
  const ownerExecutionDocumentRows = useMemo(() => {
    const contractSignatureUrl = String(ownerExecutionDocumentPayload.artifacts.contractSignatureUrl || '').trim();
    const refundSignatureUrl = String(ownerExecutionDocumentPayload.artifacts.refundSignatureUrl || '').trim();
    const contractDocumentUrl = String(ownerExecutionDocumentPayload.contract.url || '').trim();
    const finalReceiptUrl = String(ownerExecutionDocumentPayload.finalReceipt.url || '').trim();
    const contractMissingFields = Array.isArray(ownerExecutionDocumentPayload.contract.missingFields)
      ? ownerExecutionDocumentPayload.contract.missingFields
      : [];
    const receiptMissingFields = Array.isArray(ownerExecutionDocumentPayload.finalReceipt.missingFields)
      ? ownerExecutionDocumentPayload.finalReceipt.missingFields
      : [];
    const formatMissingFields = (fields) =>
      fields.length
        ? tr(
            `Missing: ${fields.join(', ')}.`,
            `Manquant : ${fields.join(', ')}.`
          )
        : '';
    const refundAmountLabel = formatMoney(
      ownerExecutionDocumentPayload.finalReceipt.refund.amount || ownerExecutionDocumentPayload.request.depositAmount || 0,
      ownerExecutionDocumentPayload.finalReceipt.refund.currencyCode || ownerExecutionDocumentPayload.request.currencyCode || 'MAD',
      isFrench ? 'fr' : 'en'
    );

    return [
      {
        key: 'contract-signature',
        title: tr('Start signature', 'Signature départ'),
        description: contractSignatureUrl
          ? tr('Customer signature captured before the rental started.', 'Signature client capturée avant le démarrage de la location.')
          : tr('Customer signature will appear here after the start signature step.', 'La signature client apparaîtra ici après l’étape de signature départ.'),
        statusLabel: contractSignatureUrl ? tr('Signature saved', 'Signature enregistrée') : tr('Pending', 'En attente'),
        statusTone: contractSignatureUrl ? 'emerald' : 'slate',
        previewUrl: contractSignatureUrl,
        previewAlt: tr('Start signature preview', 'Aperçu signature départ'),
        previewLabel: tr('Signature preview', 'Aperçu signature'),
        previewEmptyLabel: tr('Waiting for start signature', 'Signature départ en attente'),
        showPreviewSlot: true,
      },
      {
        key: 'refund-signature',
        title: tr('Refund signature', 'Signature remboursement'),
        description: refundSignatureUrl
          ? tr(
              `Renter confirmed the full deposit refund: ${refundAmountLabel}.`,
              `Le locataire a confirmé le remboursement total de la caution : ${refundAmountLabel}.`
            )
          : ownerExecutionDraft.depositOutcome === 'refund_full'
            ? tr('Full refund selected. Signature is required before closing the deposit review.', 'Remboursement total sélectionné. La signature est requise avant de clôturer la caution.')
            : tr('Only required when the deposit is refunded in full.', 'Requise uniquement lorsque la caution est remboursée en totalité.'),
        statusLabel: refundSignatureUrl
          ? tr('Signature saved', 'Signature enregistrée')
          : ownerExecutionDraft.depositOutcome === 'refund_full'
            ? tr('Signature required', 'Signature requise')
            : tr('Not required', 'Non requise'),
        statusTone: refundSignatureUrl ? 'emerald' : ownerExecutionDraft.depositOutcome === 'refund_full' ? 'amber' : 'slate',
        previewUrl: refundSignatureUrl,
        previewAlt: tr('Refund signature preview', 'Aperçu signature remboursement'),
        previewLabel: tr('Signature preview', 'Aperçu signature'),
        previewEmptyLabel: ownerExecutionDraft.depositOutcome === 'refund_full'
          ? tr('Waiting for refund signature', 'Signature remboursement en attente')
          : tr('No refund signature needed', 'Aucune signature requise'),
        showPreviewSlot: true,
      },
      {
        key: 'contract-document',
        title: tr('Contract', 'Contrat'),
        description: contractDocumentUrl
          ? tr('DriveOut contract is ready without pricing details.', 'Le contrat DriveOut est prêt sans détails de prix.')
          : ownerExecutionDocumentPayload.contract.canGenerate
            ? tr(
                'Contract is being prepared automatically with customer, license, vehicle, start time, and expected return only.',
                'Le contrat est préparé automatiquement avec uniquement le client, le permis, le véhicule, le départ et le retour prévu.'
              )
            : formatMissingFields(contractMissingFields),
        statusLabel: contractDocumentUrl
          ? tr('Ready', 'Prêt')
          : ownerExecutionDocumentPayload.contract.canGenerate
            ? tr('Preparing', 'Préparation')
            : tr('Missing info', 'Infos manquantes'),
        statusTone: contractDocumentUrl ? 'emerald' : ownerExecutionDocumentPayload.contract.canGenerate ? 'violet' : 'amber',
        href: contractDocumentUrl,
        canGenerate: Boolean(ownerExecutionDocumentPayload.contract.canGenerate),
        actionLabel: tr('Open contract', 'Ouvrir le contrat'),
      },
      {
        key: 'receipt-document',
        title: tr('Receipt', 'Reçu'),
        description: finalReceiptUrl
          ? ownerExecutionDraft.returnSavedAt
            ? tr('Receipt is updated with return result and refund signature.', 'Le reçu est mis à jour avec le résultat retour et la signature de remboursement.')
            : tr('Receipt is ready with the rental start details.', 'Le reçu est prêt avec les détails de départ de la location.')
          : ownerExecutionDocumentPayload.finalReceipt.canGenerate
            ? tr('Receipt is being prepared automatically. It opens once the rental starts, then updates after return.', 'Le reçu est préparé automatiquement. Il s’ouvre au départ de la location, puis se met à jour au retour.')
            : formatMissingFields(receiptMissingFields) || tr('Available after the rental starts.', 'Disponible après le départ de la location.'),
        statusLabel: finalReceiptUrl
          ? tr('Ready', 'Prêt')
          : ownerExecutionDocumentPayload.finalReceipt.canGenerate
            ? tr('Preparing', 'Préparation')
            : tr('Pending start', 'Départ en attente'),
        statusTone: finalReceiptUrl ? 'emerald' : ownerExecutionDocumentPayload.finalReceipt.canGenerate ? 'violet' : 'slate',
        href: finalReceiptUrl,
        canGenerate: Boolean(ownerExecutionDocumentPayload.finalReceipt.canGenerate),
        actionLabel: tr('Open receipt', 'Ouvrir le reçu'),
      },
    ];
  }, [
    isFrench,
    ownerExecutionDraft.depositOutcome,
    ownerExecutionDraft.returnSavedAt,
    ownerExecutionDocumentPayload,
    tr,
  ]);
  const ownerExecutionDocumentsSummary = useMemo(() => {
    const savedSignatures = [
      ownerExecutionDocumentPayload.artifacts.contractSignatureUrl,
      ownerExecutionDocumentPayload.artifacts.refundSignatureUrl,
    ].filter((value) => String(value || '').trim()).length;
    const readyDocuments = [
      ownerExecutionDocumentPayload.contract.url,
      ownerExecutionDocumentPayload.finalReceipt.url,
    ].filter((value) => String(value || '').trim()).length;

    return tr(
      `${savedSignatures} signature${savedSignatures === 1 ? '' : 's'} saved • ${readyDocuments} file${readyDocuments === 1 ? '' : 's'} ready`,
      `${savedSignatures} signature${savedSignatures === 1 ? '' : 's'} enregistrée${savedSignatures === 1 ? '' : 's'} • ${readyDocuments} fichier${readyDocuments === 1 ? '' : 's'} prêt${readyDocuments === 1 ? '' : 's'}`
    );
  }, [
    ownerExecutionDocumentPayload,
    tr,
  ]);
  const ownerExecutionSummary = useMemo(() => {
    if (ownerExecutionStage === 'completed') {
      return {
        badge: tr('Return saved', 'Retour enregistré'),
        note: tr('This rental is wrapped with return media, final condition details, and the issue review saved.', 'Cette location est clôturée avec médias retour, état final et revue d’incident enregistrés.'),
      };
    }
    if (ownerExecutionStage === 'return_pending') {
      return {
        badge: tr('End rental', 'Fin de location'),
        note: tr('Finish the return review before closing the rental.', 'Terminez le contrôle retour avant de clôturer la location.'),
      };
    }
    if (ownerExecutionStage === 'live') {
      return {
        badge: tr('Rental live', 'Location active'),
        note: tr('The vehicle is out. Keep chat open, then finish with a short return report.', 'Le véhicule est sorti. Gardez le chat ouvert, puis terminez avec un court rapport retour.'),
      };
    }
    if (ownerExecutionStage === 'ready_to_start') {
      return {
        badge: tr('Ready to start rental', 'Prête à démarrer la location'),
        note: tr('Everything is ready. Start the rental when pickup is complete.', 'Tout est prêt. Démarrez la location quand le départ est terminé.'),
      };
    }
    if (ownerExecutionStage === 'handoff') {
      return {
        badge: tr('Vehicle handoff', 'Remise du véhicule'),
        note: tr('Complete the pickup checklist before starting the rental.', 'Complétez la checklist de départ avant de démarrer la location.'),
      };
    }
    if (ownerExecutionStage === 'approved') {
      return {
        badge: tr('Booking confirmed', 'Réservation confirmée'),
        note: tr('The renter confirmed. Pickup can start now.', 'Le locataire a confirmé. Le départ peut commencer maintenant.'),
      };
    }
    return {
      badge: tr('Awaiting renter confirmation', 'En attente de la confirmation du locataire'),
      note: tr('Once the renter confirms, this becomes the owner pickup flow.', 'Dès que le locataire confirme, cela devient le flux de départ propriétaire.'),
    };
  }, [ownerExecutionStage, tr]);
  const ownerExecutionProgressModel = useMemo(() => {
    if (ownerExecutionStage === 'return_pending') {
      const completed = OWNER_RETURN_STEPS.filter((step) => step.gate(ownerExecutionDraft)).length;
      return {
        label: tr('Return progress', 'Progression retour'),
        hint: tr(ownerReturnCurrentStep.note.en, ownerReturnCurrentStep.note.fr),
        completed,
        total: OWNER_RETURN_STEPS.length,
      };
    }

    if (ownerExecutionStage === 'ready_to_start') {
      return {
        label: tr('Pickup locked', 'Départ verrouillé'),
        hint: tr('Everything is complete. Move the request into the live rental state.', 'Tout est terminé. Passez la demande à la location active.'),
        completed: OWNER_HANDOFF_STEPS.length,
        total: OWNER_HANDOFF_STEPS.length,
      };
    }

    if (ownerExecutionStage === 'live') {
      return {
        label: tr('Rental live', 'Location active'),
        hint: tr('The live rental is running. Keep support close and close it with the return flow.', 'La location est en cours. Gardez le support proche et terminez-la avec le flux retour.'),
        completed: OWNER_HANDOFF_STEPS.length,
        total: OWNER_HANDOFF_STEPS.length,
      };
    }

    if (ownerExecutionStage === 'completed') {
      return {
        label: tr('Return complete', 'Retour terminé'),
        hint: tr('The owner-side start and finish evidence are fully saved.', 'Les preuves de départ et de fin côté propriétaire sont entièrement enregistrées.'),
        completed: OWNER_RETURN_STEPS.length,
        total: OWNER_RETURN_STEPS.length,
      };
    }

    const completed = OWNER_HANDOFF_STEPS.filter((step) => step.gate(ownerExecutionDraft)).length;
    return {
      label: tr('Pickup progress', 'Progression départ'),
      hint: tr(ownerHandoffCurrentStep.note.en, ownerHandoffCurrentStep.note.fr),
      completed,
      total: OWNER_HANDOFF_STEPS.length,
    };
  }, [ownerExecutionDraft, ownerExecutionStage, ownerHandoffCurrentStep, ownerReturnCurrentStep, tr]);
  const ownerExecutionProgressPercent = useMemo(() => {
    if (!ownerExecutionProgressModel.total) return 0;
    return Math.round((ownerExecutionProgressModel.completed / ownerExecutionProgressModel.total) * 100);
  }, [ownerExecutionProgressModel.completed, ownerExecutionProgressModel.total]);
  const ownerExecutionStagePills = useMemo(
    () => [
      { label: tr('Handoff', 'Remise'), active: ownerExecutionStage === 'handoff' || ownerExecutionStage === 'approved' },
      { label: tr('Ready', 'Prête'), active: ownerExecutionStage === 'ready_to_start' },
      { label: tr('Live', 'Active'), active: ownerExecutionStage === 'live' },
      { label: tr('Return', 'Retour'), active: ownerExecutionStage === 'return_pending' },
      { label: tr('Done', 'Terminée'), active: ownerExecutionStage === 'completed' },
    ],
    [ownerExecutionStage, tr]
  );
  const ownerExecutionStatusCards = useMemo(() => {
    const now = ownerExecutionNow;
    const cards = [
      {
        eyebrow: tr('Stage', 'Étape'),
        value: ownerExecutionSummary.badge,
        detail: ownerExecutionSummary.note,
        icon: ShieldCheck,
        tone:
          ownerExecutionStage === 'completed'
            ? 'emerald'
            : ownerExecutionStage === 'live' || ownerExecutionStage === 'return_pending'
              ? 'sky'
              : 'violet',
      },
    ];

    if (operationalRequest?.requestedStartAt) {
      cards.push({
        eyebrow: tr('Pickup', 'Départ'),
        value: formatDateTime(operationalRequest.requestedStartAt, isFrench ? 'fr' : 'en'),
        detail: getRelativeTimeCopy(operationalRequest.requestedStartAt, now, tr, {
          futureLabel: (duration) => tr(`Starts in ${duration}`, `Départ dans ${duration}`),
          pastLabel: (duration) => tr(`Started ${duration} ago`, `Démarré il y a ${duration}`),
        }),
        icon: CalendarClock,
        tone: ownerExecutionStage === 'completed' ? 'slate' : 'violet',
      });
    }

    if (operationalRequest?.requestedEndAt) {
      cards.push({
        eyebrow: tr('Return target', 'Retour prévu'),
        value: formatDateTime(operationalRequest.requestedEndAt, isFrench ? 'fr' : 'en'),
        detail: getRelativeTimeCopy(operationalRequest.requestedEndAt, now, tr, {
          futureLabel: (duration) => tr(`Due in ${duration}`, `Prévu dans ${duration}`),
          pastLabel: (duration) => tr(`Late by ${duration}`, `En retard de ${duration}`),
        }),
        icon: Car,
        tone: ownerExecutionStage === 'return_pending' ? 'amber' : ownerExecutionStage === 'completed' ? 'emerald' : 'sky',
      });
    }

    if (ownerExecutionStartedAt) {
      cards.push({
        eyebrow: tr('Live timer', 'Timer actif'),
        value: formatRelativeDuration((now - new Date(ownerExecutionStartedAt).getTime()) / 60000, tr),
        detail: tr('Elapsed since the rental was started.', 'Temps écoulé depuis le démarrage de la location.'),
        icon: Gauge,
        tone: ownerExecutionStage === 'completed' ? 'slate' : 'emerald',
      });
    } else {
      cards.push({
        eyebrow: tr('Deposit', 'Caution'),
        value: formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en'),
        detail: tr('Keep the deposit linked to the handoff and return evidence.', 'Gardez la caution liée aux preuves de départ et de retour.'),
        icon: DollarSign,
        tone: 'slate',
      });
    }

    return cards.slice(0, 4);
  }, [
    isFrench,
    operationalRequest?.currencyCode,
    operationalRequest?.depositAmount,
    operationalRequest?.requestedEndAt,
    operationalRequest?.requestedStartAt,
    ownerExecutionNow,
    ownerExecutionStage,
    ownerExecutionStartedAt,
    ownerExecutionSummary.badge,
    ownerExecutionSummary.note,
    tr,
  ]);
  const ownerExecutionLiveTimer = useMemo(() => {
    if (!ownerExecutionStartedAtMs) return null;

    const endTimestamp = operationalRequest?.requestedEndAt
      ? new Date(operationalRequest.requestedEndAt).getTime()
      : null;
    const hasEndTimestamp = Number.isFinite(endTimestamp);
    const remainingMs = hasEndTimestamp ? endTimestamp - ownerExecutionNow : null;

    return {
      elapsedLabel: formatClockDuration(ownerExecutionNow - ownerExecutionStartedAtMs),
      remainingLabel: hasEndTimestamp
        ? remainingMs <= 0
          ? tr('Expired', 'Expiré')
          : formatClockDuration(remainingMs)
        : '—',
      expired: hasEndTimestamp && remainingMs <= 0,
    };
  }, [operationalRequest?.requestedEndAt, ownerExecutionNow, ownerExecutionStartedAtMs, tr]);
  const ownerExecutionPrimaryStatusCards = useMemo(
    () => (isOperationsWorkspaceRoute ? ownerExecutionStatusCards.slice(0, 2) : ownerExecutionStatusCards),
    [isOperationsWorkspaceRoute, ownerExecutionStatusCards]
  );
  const ownerExecutionSecondaryStatusCards = useMemo(
    () => (isOperationsWorkspaceRoute ? ownerExecutionStatusCards.slice(2) : []),
    [isOperationsWorkspaceRoute, ownerExecutionStatusCards]
  );
  const ownerOperationSummaryCards = useMemo(() => {
    const rentalType = String(operationalRequest?.rentalType || '').trim().toLowerCase();
    const duration = Number(operationalRequest?.duration || 0);
    const durationLabel = duration > 0
      ? rentalType === 'daily'
        ? tr(`${duration} day${duration === 1 ? '' : 's'}`, `${duration} jour${duration === 1 ? '' : 's'}`)
        : tr(`${duration} hour${duration === 1 ? '' : 's'}`, `${duration} heure${duration === 1 ? '' : 's'}`)
      : tr('By request', 'Sur demande');
    const paymentDetail = operationalRequestMoney.ownerPayoutAmount > 0
      ? tr(
          `Owner payout ${formatMoney(operationalRequestMoney.ownerPayoutAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}`,
          `Versement propriétaire ${formatMoney(operationalRequestMoney.ownerPayoutAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}`
        )
      : tr('Payment tracked with the request.', 'Paiement suivi avec la demande.');

    return [
      {
        key: 'customer',
        label: tr('Customer', 'Client'),
        value: operationalRequest?.customerName || tr('Customer', 'Client'),
        detail: operationalRequest?.requestReference || operationalRequest?.customerEmail || operationalRequest?.customerPhone || tr('Contact in Inbox', 'Contact dans Inbox'),
        icon: MessageSquareText,
        tone: 'violet',
      },
      {
        key: 'schedule',
        label: tr('Schedule', 'Planning'),
        value: formatDateTime(operationalRequest?.requestedStartAt, isFrench ? 'fr' : 'en'),
        detail: operationalRequest?.requestedEndAt
          ? `${tr('Until', 'Jusqu’au')} ${formatDateTime(operationalRequest.requestedEndAt, isFrench ? 'fr' : 'en')}`
          : durationLabel,
        icon: CalendarClock,
        tone: 'sky',
      },
      {
        key: 'payment',
        label: tr('Payment', 'Paiement'),
        value: formatMoney(operationalRequestMoney.estimatedAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en'),
        detail: paymentDetail,
        icon: DollarSign,
        tone: 'emerald',
      },
      {
        key: 'security',
        label: tr('Security', 'Garantie'),
        value: formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en'),
        detail: tr('Deposit linked to pickup and return evidence.', 'Caution liée aux preuves de départ et retour.'),
        icon: ShieldCheck,
        tone: 'amber',
      },
      {
        key: 'package',
        label: tr('Package', 'Forfait'),
        value: operationalRequest?.listingTitle || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Vehicle', 'Véhicule'),
        detail: durationLabel,
        icon: FileText,
        tone: 'slate',
      },
    ];
  }, [
    formData.brandName,
    formData.modelName,
    isFrench,
    operationalRequest?.currencyCode,
    operationalRequest?.customerEmail,
    operationalRequest?.customerName,
    operationalRequest?.customerPhone,
    operationalRequest?.depositAmount,
    operationalRequest?.duration,
    operationalRequest?.listingTitle,
    operationalRequest?.requestReference,
    operationalRequest?.rentalType,
    operationalRequest?.requestedEndAt,
    operationalRequest?.requestedStartAt,
    operationalRequestMoney.estimatedAmount,
    operationalRequestMoney.ownerPayoutAmount,
    tr,
  ]);
  const listingReviewSummary = useMemo(() => {
    const moderationHistory = Array.isArray(vehicle?.moderationHistory) ? vehicle.moderationHistory : [];
    const ownerMessages = Array.isArray(vehicle?.ownerMessages) ? vehicle.ownerMessages : [];

    return {
      moderationCount: moderationHistory.length,
      ownerMessageCount: ownerMessages.length,
      latestModerationEntry: moderationHistory[0] || null,
      latestOwnerMessage: ownerMessages[0] || null,
    };
  }, [vehicle]);

  useEffect(() => {
    if (!operationalRequest?.id) return undefined;
    const intervalMs = ownerExecutionStage === 'live' || ownerExecutionStage === 'return_pending'
      ? 1000
      : 60 * 1000;
    setOwnerExecutionNow(Date.now());
    const intervalId = window.setInterval(() => {
      setOwnerExecutionNow(Date.now());
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [operationalRequest?.id, ownerExecutionStage]);

  useEffect(() => {
    const serverDraft = operationalRequest?.ownerExecution ? normalizeOwnerExecutionDraft(operationalRequest.ownerExecution) : null;

    if (serverDraft) {
      setOwnerExecutionDraft(serverDraft);
      return;
    }

    if (!ownerExecutionStorageKey || typeof window === 'undefined') {
      setOwnerExecutionDraft(createOwnerExecutionDraft());
      return;
    }

    try {
      const raw = ownerExecutionStorageKeys
        .map((storageKey) => window.localStorage.getItem(storageKey))
        .find((value) => value !== null);
      setOwnerExecutionDraft(raw ? normalizeOwnerExecutionDraft(JSON.parse(raw)) : createOwnerExecutionDraft());
    } catch (storageError) {
      console.warn('Failed to restore owner execution flow:', storageError);
      setOwnerExecutionDraft(createOwnerExecutionDraft());
    }
  }, [operationalRequest?.ownerExecution, ownerExecutionStorageKey, ownerExecutionStorageKeys]);

  useEffect(() => {
    if (!ownerExecutionStorageKey || typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(ownerExecutionStorageKey, JSON.stringify(ownerExecutionDraft));
    } catch (storageError) {
      console.warn('Failed to persist owner execution flow:', storageError);
    }
  }, [ownerExecutionDraft, ownerExecutionStorageKey]);

  useEffect(() => {
    setHandoffOdometerInput(String(ownerExecutionDraft?.startOdometer || ''));
  }, [ownerExecutionDraft?.startOdometer]);

  useEffect(() => {
    setReturnOdometerInput(String(ownerExecutionDraft?.returnOdometer || ''));
  }, [ownerExecutionDraft?.returnOdometer]);

  const persistOwnerExecutionDraft = useCallback(
    async (nextDraft, nextRequestStatus = null) => {
      if (!user?.id || !operationalRequest?.id) {
        setOwnerExecutionDraft(nextDraft);
        return true;
      }

      const normalizedDraft = normalizeOwnerExecutionDraft(nextDraft);
      ownerExecutionDraftRef.current = normalizedDraft;
      setOwnerExecutionDraft(normalizedDraft);
      setOwnerExecutionSaving(true);

      try {
        const updatedRequest = await BusinessMarketplaceService.saveOwnerExecution(
          user.id,
          operationalRequest.id,
          normalizedDraft,
          nextRequestStatus
        );

        setVehicleRequests((current) =>
          (Array.isArray(current) ? current : []).map((request) => {
            if (String(request?.id || '') !== String(operationalRequest.id)) {
              return request;
            }
            const nextStatus =
              updatedRequest?.request_status ||
              (nextRequestStatus === 'active'
                ? 'active'
                : nextRequestStatus === 'completed'
                  ? 'completed'
                  : request?.rawRequest?.request_status ||
                    request?.requestStatus);
            const nextRequest = {
              ...request,
              requestStatus: normalizeMarketplaceRequestLifecycleStatus(nextStatus),
              ownerExecution: normalizedDraft,
              updatedAt: updatedRequest?.updated_at || new Date().toISOString(),
              rawRequest: {
                ...(request?.rawRequest || {}),
                ...(updatedRequest || {}),
                request_status: nextStatus,
                counter_offer: updatedRequest?.counter_offer || {
                  ...((request?.rawRequest?.counter_offer && typeof request.rawRequest.counter_offer === 'object')
                    ? request.rawRequest.counter_offer
                    : {}),
                  owner_execution: normalizedDraft,
                },
              },
            };
            cacheOwnerOperationRequest(nextRequest);
            return nextRequest;
          })
        );
        return true;
      } catch (saveError) {
        console.warn('Failed to persist owner execution flow:', saveError);
        return false;
      } finally {
        setOwnerExecutionSaving(false);
      }
    },
    [cacheOwnerOperationRequest, operationalRequest?.id, user?.id]
  );

  const createOwnerExecutionDocumentShareRecord = useCallback(
    async ({ shareType, payload }) => {
      const normalizedShareType = String(shareType || '').trim();
      if (!normalizedShareType || !payload) return null;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const encodedPayload = await encodePublicSharePayload(payload);

      const response = await fetch('/api/public-links?resource=document-shares&action=create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          shareType: normalizedShareType,
          rentalId: operationalRequest?.id || null,
          expiresInDays: 30,
          ...(encodedPayload ? { payloadEncoded: encodedPayload } : { payload }),
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.url) {
        const responseError = body?.error;
        const errorMessage =
          typeof responseError === 'string'
            ? responseError
            : responseError?.message || responseError?.error || (
                responseError ? JSON.stringify(responseError) : 'Failed to create DriveOut document share'
              );
        throw new Error(errorMessage);
      }

      return body.url;
    },
    [operationalRequest?.id]
  );

  const buildOwnerExecutionDocumentSharePayload = useCallback(
    (documentPayload, shareType) => {
      const normalizedShareType = String(shareType || '').trim().toLowerCase();
      const sourceDocument =
        normalizedShareType === 'receipt'
          ? documentPayload?.finalReceipt
          : documentPayload?.contract;
      const evidence = documentPayload?.evidence || {};

      return {
        language: documentPayload?.language || (isFrench ? 'fr' : 'en'),
        rentalId: documentPayload?.request?.reference || documentPayload?.request?.id || '',
        customerName: documentPayload?.customer?.name || documentPayload?.customer?.email || '',
        rental: sourceDocument?.rental || documentPayload?.rental || null,
        settings: {
          logoUrl: '/assets/driveout-mark.svg',
          stampUrl: '',
        },
        source: {
          type: 'driveout_marketplace',
          requestId: documentPayload?.request?.id || operationalRequest?.id || null,
          requestReference: documentPayload?.request?.reference || null,
          vehicleId: documentPayload?.vehicle?.id || operationalRequest?.vehiclePublicProfileId || null,
          ownerUserId: user?.id || null,
          customerUserId: documentPayload?.customer?.id || operationalRequest?.customerId || null,
        },
        bundle: {
          contract: Boolean(documentPayload?.artifacts?.contractSignatureUrl || documentPayload?.artifacts?.contractUrl),
          receipt: normalizedShareType === 'receipt' || Boolean(documentPayload?.artifacts?.finalReceiptUrl || documentPayload?.artifacts?.refundSignatureUrl),
          openingMedia: Array.isArray(evidence.handoffPhotos) && evidence.handoffPhotos.length > 0,
          closingMedia: Array.isArray(evidence.returnPhotos) && evidence.returnPhotos.length > 0,
        },
      };
    },
    [
      isFrench,
      operationalRequest?.customerId,
      operationalRequest?.id,
      operationalRequest?.vehiclePublicProfileId,
      user?.id,
    ]
  );

  const ensureOwnerExecutionContractDocument = useCallback(
    async (draftOverride = ownerExecutionDraft) => {
      const normalizedDraft = normalizeOwnerExecutionDraft(draftOverride);
      const existingContractUrl = String(normalizedDraft.contractDocumentUrl || '').trim();
      const generatedAtMs = Date.parse(normalizedDraft.contractDocumentGeneratedAt || '');
      const contractRefreshDates = [
        normalizedDraft.contractSignedAt,
        normalizedDraft.startedAt,
      ]
        .map((value) => Date.parse(value || ''))
        .filter((value) => Number.isFinite(value));
      const shouldRefreshExistingContract =
        Boolean(existingContractUrl) &&
        contractRefreshDates.some((value) => !Number.isFinite(generatedAtMs) || value > generatedAtMs);

      if (existingContractUrl && !shouldRefreshExistingContract) {
        return normalizedDraft;
      }
      if (ownerExecutionDocumentGenerationRef.current.contract) {
        return normalizedDraft;
      }

      const documentPayload = buildOwnerExecutionDocumentPayloadForDraft(normalizedDraft);
      if (!documentPayload?.contract?.canGenerate) {
        return normalizedDraft;
      }

      ownerExecutionDocumentGenerationRef.current.contract = true;
      try {
        const url = await createOwnerExecutionDocumentShareRecord({
          shareType: 'contract',
          payload: buildOwnerExecutionDocumentSharePayload(documentPayload, 'contract'),
        });

        if (!url) return normalizedDraft;

        return normalizeOwnerExecutionDraft({
          ...normalizedDraft,
          contractDocumentUrl: url,
          contractDocumentGeneratedAt: new Date().toISOString(),
        });
      } catch (documentError) {
        console.warn('Failed to create DriveOut contract share:', documentError);
        return normalizedDraft;
      } finally {
        ownerExecutionDocumentGenerationRef.current.contract = false;
      }
    },
    [
      buildOwnerExecutionDocumentPayloadForDraft,
      buildOwnerExecutionDocumentSharePayload,
      createOwnerExecutionDocumentShareRecord,
      ownerExecutionDraft,
    ]
  );

  const ensureOwnerExecutionFinalReceiptDocument = useCallback(
    async (draftOverride = ownerExecutionDraft) => {
      const normalizedDraft = normalizeOwnerExecutionDraft(draftOverride);
      const existingReceiptUrl = String(normalizedDraft.finalReceiptUrl || '').trim();
      const generatedAtMs = Date.parse(normalizedDraft.finalReceiptGeneratedAt || '');
      const receiptRefreshDates = [
        normalizedDraft.returnSavedAt,
        normalizedDraft.depositRefundSignedAt,
      ]
        .map((value) => Date.parse(value || ''))
        .filter((value) => Number.isFinite(value));
      const shouldRefreshExistingReceipt =
        Boolean(existingReceiptUrl) &&
        receiptRefreshDates.some((value) => !Number.isFinite(generatedAtMs) || value > generatedAtMs);

      if (existingReceiptUrl && !shouldRefreshExistingReceipt) {
        return normalizedDraft;
      }
      if (ownerExecutionDocumentGenerationRef.current.receipt) {
        return normalizedDraft;
      }

      const documentPayload = buildOwnerExecutionDocumentPayloadForDraft(normalizedDraft);
      if (!documentPayload?.finalReceipt?.canGenerate) {
        return normalizedDraft;
      }

      ownerExecutionDocumentGenerationRef.current.receipt = true;
      try {
        const url = await createOwnerExecutionDocumentShareRecord({
          shareType: 'receipt',
          payload: buildOwnerExecutionDocumentSharePayload(documentPayload, 'receipt'),
        });

        if (!url) return normalizedDraft;

        return normalizeOwnerExecutionDraft({
          ...normalizedDraft,
          finalReceiptUrl: url,
          finalReceiptGeneratedAt: new Date().toISOString(),
        });
      } catch (documentError) {
        console.warn('Failed to create DriveOut receipt share:', documentError);
        return normalizedDraft;
      } finally {
        ownerExecutionDocumentGenerationRef.current.receipt = false;
      }
    },
    [
      buildOwnerExecutionDocumentPayloadForDraft,
      buildOwnerExecutionDocumentSharePayload,
      createOwnerExecutionDocumentShareRecord,
      ownerExecutionDraft,
    ]
  );

  useEffect(() => {
    if (!user?.id || !operationalRequest?.id) return undefined;

    const currentDraft = normalizeOwnerExecutionDraft(ownerExecutionDraftRef.current || ownerExecutionDraft);
    const documentPayload = buildOwnerExecutionDocumentPayloadForDraft(currentDraft);
    const isDocumentMissingOrStale = (url, generatedAt, refreshDates = []) => {
      const hasUrl = Boolean(String(url || '').trim());
      if (!hasUrl) return true;

      const generatedAtMs = Date.parse(generatedAt || '');
      return refreshDates
        .map((value) => Date.parse(value || ''))
        .filter((value) => Number.isFinite(value))
        .some((value) => !Number.isFinite(generatedAtMs) || value > generatedAtMs);
    };
    const shouldPrepareContract =
      Boolean(documentPayload?.contract?.canGenerate) &&
      isDocumentMissingOrStale(
        currentDraft.contractDocumentUrl,
        currentDraft.contractDocumentGeneratedAt,
        [currentDraft.contractSignedAt, currentDraft.startedAt]
      );
    const shouldPrepareReceipt =
      Boolean(documentPayload?.finalReceipt?.canGenerate) &&
      isDocumentMissingOrStale(
        currentDraft.finalReceiptUrl,
        currentDraft.finalReceiptGeneratedAt,
        [currentDraft.returnSavedAt, currentDraft.depositRefundSignedAt]
      );

    if (!shouldPrepareContract && !shouldPrepareReceipt) return undefined;

    const autoPrepareKey = [
      operationalRequest.id,
      shouldPrepareContract ? 'contract' : '',
      currentDraft.contractDocumentUrl || '',
      currentDraft.contractDocumentGeneratedAt || '',
      currentDraft.contractSignatureUrl || '',
      currentDraft.contractSignedAt || '',
      currentDraft.startedAt || '',
      shouldPrepareReceipt ? 'receipt' : '',
      currentDraft.finalReceiptUrl || '',
      currentDraft.finalReceiptGeneratedAt || '',
      currentDraft.returnSavedAt || '',
      currentDraft.depositOutcome || '',
      currentDraft.depositRefundSignatureUrl || '',
      currentDraft.depositRefundSignedAt || '',
    ].join('|');

    if (ownerExecutionDocumentAutoPrepareRef.current === autoPrepareKey) return undefined;
    ownerExecutionDocumentAutoPrepareRef.current = autoPrepareKey;

    let cancelled = false;

    void (async () => {
      let preparedDraft = currentDraft;

      if (shouldPrepareContract) {
        preparedDraft = await ensureOwnerExecutionContractDocument(preparedDraft);
      }

      const preparedPayload = buildOwnerExecutionDocumentPayloadForDraft(preparedDraft);
      const shouldPrepareUpdatedReceipt =
        Boolean(preparedPayload?.finalReceipt?.canGenerate) &&
        isDocumentMissingOrStale(
          preparedDraft.finalReceiptUrl,
          preparedDraft.finalReceiptGeneratedAt,
          [preparedDraft.returnSavedAt, preparedDraft.depositRefundSignedAt]
        );

      if (shouldPrepareUpdatedReceipt) {
        preparedDraft = await ensureOwnerExecutionFinalReceiptDocument(preparedDraft);
      }

      if (cancelled) return;

      const latestDraft = normalizeOwnerExecutionDraft(ownerExecutionDraftRef.current || ownerExecutionDraft);
      const mergedDraft = normalizeOwnerExecutionDraft({
        ...latestDraft,
        contractDocumentUrl: preparedDraft.contractDocumentUrl || latestDraft.contractDocumentUrl,
        contractDocumentGeneratedAt: preparedDraft.contractDocumentGeneratedAt || latestDraft.contractDocumentGeneratedAt,
        finalReceiptUrl: preparedDraft.finalReceiptUrl || latestDraft.finalReceiptUrl,
        finalReceiptGeneratedAt: preparedDraft.finalReceiptGeneratedAt || latestDraft.finalReceiptGeneratedAt,
      });
      const hasDocumentChanges =
        mergedDraft.contractDocumentUrl !== latestDraft.contractDocumentUrl ||
        mergedDraft.contractDocumentGeneratedAt !== latestDraft.contractDocumentGeneratedAt ||
        mergedDraft.finalReceiptUrl !== latestDraft.finalReceiptUrl ||
        mergedDraft.finalReceiptGeneratedAt !== latestDraft.finalReceiptGeneratedAt;

      if (hasDocumentChanges) {
        await persistOwnerExecutionDraft(mergedDraft);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    buildOwnerExecutionDocumentPayloadForDraft,
    ensureOwnerExecutionContractDocument,
    ensureOwnerExecutionFinalReceiptDocument,
    operationalRequest?.id,
    ownerExecutionDraft,
    persistOwnerExecutionDraft,
    user?.id,
  ]);

  const openOwnerExecutionGeneratedDocument = useCallback(
    async (documentType) => {
      const normalizedType = String(documentType || '').trim().toLowerCase();
      if (!['contract', 'receipt'].includes(normalizedType) || ownerExecutionDocumentActionKey) return;

      const actionKey = `${normalizedType}-document`;
      let pendingWindow = null;

      if (typeof window !== 'undefined') {
        pendingWindow = window.open('', '_blank');
        if (pendingWindow) {
          pendingWindow.document.title = normalizedType === 'contract' ? 'Preparing contract...' : 'Preparing receipt...';
          pendingWindow.document.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px;">Preparing document...</p>';
        }
      }

      setOwnerExecutionDocumentActionKey(actionKey);

      try {
        const currentDraft = normalizeOwnerExecutionDraft(ownerExecutionDraftRef.current || ownerExecutionDraft);
        const nextDraft =
          normalizedType === 'contract'
            ? await ensureOwnerExecutionContractDocument(currentDraft)
            : await ensureOwnerExecutionFinalReceiptDocument(currentDraft);
        const nextUrl =
          normalizedType === 'contract'
            ? String(nextDraft.contractDocumentUrl || '').trim()
            : String(nextDraft.finalReceiptUrl || '').trim();

        if (!nextUrl) {
          throw new Error(
            normalizedType === 'contract'
              ? tr('Contract is missing required information.', 'Le contrat manque des informations obligatoires.')
              : tr('Receipt is not ready yet.', 'Le reçu n’est pas encore prêt.')
          );
        }

        const currentUrl =
          normalizedType === 'contract'
            ? String(currentDraft.contractDocumentUrl || '').trim()
            : String(currentDraft.finalReceiptUrl || '').trim();
        const currentGeneratedAt =
          normalizedType === 'contract'
            ? currentDraft.contractDocumentGeneratedAt
            : currentDraft.finalReceiptGeneratedAt;
        const nextGeneratedAt =
          normalizedType === 'contract'
            ? nextDraft.contractDocumentGeneratedAt
            : nextDraft.finalReceiptGeneratedAt;

        if (nextUrl !== currentUrl || nextGeneratedAt !== currentGeneratedAt) {
          await persistOwnerExecutionDraft(nextDraft);
        }

        if (pendingWindow && !pendingWindow.closed) {
          pendingWindow.location.href = nextUrl;
        } else if (typeof window !== 'undefined') {
          window.open(nextUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (documentError) {
        if (pendingWindow && !pendingWindow.closed) {
          pendingWindow.close();
        }
        console.warn('Unable to open DriveOut owner execution document:', documentError);
        toast.error(documentError?.message || tr('Unable to prepare document right now.', 'Impossible de préparer le document pour le moment.'));
      } finally {
        setOwnerExecutionDocumentActionKey('');
      }
    },
    [
      ensureOwnerExecutionContractDocument,
      ensureOwnerExecutionFinalReceiptDocument,
      ownerExecutionDocumentActionKey,
      ownerExecutionDraft,
      persistOwnerExecutionDraft,
      tr,
    ]
  );

  const sendOwnerExecutionPhotoMessage = useCallback(async ({ kind, attachments }) => {
    if (!operationalRequest?.customerId || !operationalRequest?.id || !attachments?.length) {
      return;
    }

    let existingThreadKey = '';
    try {
      const threadResponse = await MessageService.listSharedThreads({
        entityType: 'marketplace_request',
        entityId: String(operationalRequest.id),
        threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
        limit: 20,
      });
      existingThreadKey = String(
        threadResponse?.threads?.find(
          (thread) => String(thread?.entity_type || '').trim().toLowerCase() === 'marketplace_request'
            && String(thread?.entity_id || '').trim() === String(operationalRequest.id)
        )?.thread_key || ''
      ).trim();
    } catch (threadLookupError) {
      console.warn('Unable to resolve marketplace request thread for execution photos:', threadLookupError);
    }

    try {
      await MessageService.sendSharedMessage({
        family: MESSAGE_FAMILIES.marketplace,
        threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
        ...(existingThreadKey ? { threadKey: existingThreadKey } : {}),
        entityType: 'marketplace_request',
        entityId: String(operationalRequest.id),
        recipientUserId: operationalRequest.customerId,
        recipientRole: 'customer',
        senderRole: 'owner',
        messageType: 'note',
        subject: operationalRequest?.listingTitle || tr('Marketplace request', 'Demande marketplace'),
        body: kind === 'handoff'
          ? tr('Vehicle inspection photos uploaded', 'Photos d’inspection véhicule téléversées')
          : kind === 'legal_docs'
            ? tr('Registration and insurance photos uploaded', 'Photos carte grise et assurance téléversées')
            : tr('Photos uploaded', 'Photos téléversées'),
        attachments,
        metadata: {
          requestId: String(operationalRequest.id),
          requestStatus: operationalRequest.requestStatus,
          photoEvidenceKind: kind,
          photoEvidenceLabel: kind === 'handoff'
            ? tr('Vehicle inspection', 'Inspection véhicule')
            : kind === 'legal_docs'
              ? tr('Registration + insurance', 'Carte grise + assurance')
              : tr('Return evidence', 'Preuve de retour'),
          href: buildOwnerExecutionWorkspaceHref(operationalRequest, { focus: 'execution' }),
        },
      });
    } catch (messageError) {
      console.warn('Execution photos saved, but the customer thread note could not be sent:', messageError);
    }
  }, [operationalRequest?.customerId, operationalRequest?.id, operationalRequest?.listingTitle, operationalRequest?.requestStatus, tr]);

  const sendOwnerExecutionSystemMessage = useCallback(async ({ body, event, requestStatus, documentLinks = [] }) => {
    if (!operationalRequest?.customerId || !operationalRequest?.id || !body) {
      return;
    }

    let existingThreadKey = '';
    try {
      const threadResponse = await MessageService.listSharedThreads({
        entityType: 'marketplace_request',
        entityId: String(operationalRequest.id),
        threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
        limit: 20,
      });
      existingThreadKey = String(
        threadResponse?.threads?.find(
          (thread) => String(thread?.entity_type || '').trim().toLowerCase() === 'marketplace_request'
            && String(thread?.entity_id || '').trim() === String(operationalRequest.id)
        )?.thread_key || ''
      ).trim();
    } catch (threadLookupError) {
      console.warn('Unable to resolve marketplace request thread for execution update:', threadLookupError);
    }

    const normalizedDocumentLinks = Array.isArray(documentLinks)
      ? documentLinks
          .map((link, index) => {
            if (!link || typeof link !== 'object') return null;
            const href = String(link.href || link.url || '').trim();
            if (!href) return null;
            return {
              key: String(link.key || link.kind || link.label || `document-${index}`).trim() || `document-${index}`,
              label: String(link.label || link.title || '').trim() || tr('Open document', 'Ouvrir le document'),
              href,
              url: href,
              kind: String(link.kind || link.key || '').trim(),
              type: String(link.kind || link.type || link.key || '').trim(),
            };
          })
          .filter(Boolean)
      : [];

    try {
      await MessageService.sendSharedMessage({
        family: MESSAGE_FAMILIES.marketplace,
        threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
        ...(existingThreadKey ? { threadKey: existingThreadKey } : {}),
        entityType: 'marketplace_request',
        entityId: String(operationalRequest.id),
        recipientUserId: operationalRequest.customerId,
        recipientRole: 'customer',
        senderRole: 'owner',
        messageType: 'system_event',
        subject: operationalRequest?.listingTitle || tr('Marketplace request', 'Demande marketplace'),
        body,
        metadata: {
          event,
          requestId: String(operationalRequest.id),
          requestStatus: requestStatus || operationalRequest.requestStatus,
          href: buildOwnerExecutionWorkspaceHref(operationalRequest, { focus: 'execution' }),
          ...(normalizedDocumentLinks.length
            ? {
                documentLinks: normalizedDocumentLinks,
                document_links: normalizedDocumentLinks,
                documentActions: normalizedDocumentLinks,
                document_actions: normalizedDocumentLinks,
                actions: normalizedDocumentLinks,
                hasDocumentActions: true,
              }
            : {}),
        },
      });
    } catch (messageError) {
      console.warn('Execution status was saved, but the customer thread update could not be sent:', messageError);
    }
  }, [operationalRequest?.customerId, operationalRequest?.id, operationalRequest?.listingTitle, operationalRequest?.requestStatus, tr]);

  const toggleOwnerExecutionFlag = useCallback((field) => {
    if (ownerExecutionHandoffLocked && ['handoffMediaReady', 'legalDocsChecked', 'depositConfirmed', 'contractSigned'].includes(field)) {
      return;
    }
    const nextDraft = {
      ...ownerExecutionDraft,
      [field]: !ownerExecutionDraft?.[field],
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      if (field === 'depositConfirmed' && !ownerExecutionDraft?.depositConfirmed && nextDraft.depositConfirmed && operationalRequest?.id) {
        await RentalEventService.recordEvent({
          rentalId: operationalRequest.id,
          eventType: 'deposit_external',
          actor: 'owner',
          metadata: {
            ownerId: user?.id || null,
            depositMode: 'external',
            note: 'Deposit handled directly between renter and owner at pickup.',
          },
        });
      }
    })();
  }, [operationalRequest?.id, ownerExecutionDraft, ownerExecutionHandoffLocked, persistOwnerExecutionDraft, user?.id]);

  const saveOwnerExecutionStartOdometer = useCallback((value) => {
    if (ownerExecutionHandoffLocked) return;
    const normalizedValue = Number(value);
    if (!Number.isFinite(normalizedValue) || normalizedValue < 0) return;

    const nextDraft = {
      ...ownerExecutionDraft,
      startOdometer: String(Math.round(normalizedValue)),
    };

    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      if (linkedFleetVehicleId) {
        const result = await FuelTransactionService.syncVehicleCurrentOdometer(linkedFleetVehicleId, normalizedValue);
        if (result?.success) {
          setFormData((current) => ({ ...current, currentOdometer: String(Math.round(normalizedValue)) }));
        }
      }
    })();
  }, [linkedFleetVehicleId, ownerExecutionDraft, ownerExecutionHandoffLocked, persistOwnerExecutionDraft]);

  const saveOwnerExecutionStartFuelLevel = useCallback((level) => {
    if (ownerExecutionHandoffLocked) return;
    const normalizedLevel = Number(level);
    if (!Number.isFinite(normalizedLevel) || normalizedLevel < 0 || normalizedLevel > 8) return;

    const nextDraft = {
      ...ownerExecutionDraft,
      startFuelLevel: String(normalizedLevel),
    };

    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      if (linkedFleetVehicleId) {
        const syncResult = await FuelTransactionService.syncVehicleFuelState({
          vehicleId: linkedFleetVehicleId,
          lines: normalizedLevel,
          source: 'owner_handoff_start',
          rentalId: operationalRequest?.id || null,
        });
        if (syncResult?.success) {
          setVehicleFuelState(syncResult?.state || null);
        }
      }
    })();
  }, [linkedFleetVehicleId, operationalRequest?.id, ownerExecutionDraft, ownerExecutionHandoffLocked, persistOwnerExecutionDraft]);

  const openOwnerStartOdometerModal = useCallback(() => {
    if (ownerExecutionHandoffLocked) return;
    setHandoffOdometerInput(
      hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer)
        ? String(ownerExecutionDraft.startOdometer)
        : ''
    );
    setShowOwnerStartOdometerModal(true);
  }, [ownerExecutionDraft.startOdometer, ownerExecutionHandoffLocked]);

  const handleOwnerStartOdometerModalSave = useCallback(() => {
    if (!hasOwnerExecutionNumberValue(handoffOdometerInput)) return;
    saveOwnerExecutionStartOdometer(handoffOdometerInput);
    setShowOwnerStartOdometerModal(false);
  }, [handoffOdometerInput, saveOwnerExecutionStartOdometer]);

  const openOwnerStartFuelModal = useCallback(() => {
    if (ownerExecutionHandoffLocked) return;
    setShowOwnerStartFuelModal(true);
  }, [ownerExecutionHandoffLocked]);

  const handleOwnerStartFuelModalSave = useCallback((level) => {
    saveOwnerExecutionStartFuelLevel(level);
  }, [saveOwnerExecutionStartFuelLevel]);

  const saveOwnerExecutionContractSignature = useCallback((signatureUrl = '') => {
    if (ownerExecutionHandoffLocked) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      contractSigned: true,
      contractSignatureUrl: String(signatureUrl || ownerExecutionDraft.contractSignatureUrl || '').trim(),
      contractSignedAt: new Date().toISOString(),
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      const documentDraft = await ensureOwnerExecutionContractDocument(nextDraft);
      const generatedContractUrl = String(documentDraft.contractDocumentUrl || '').trim();
      if (!generatedContractUrl) return;

      const currentDraft = normalizeOwnerExecutionDraft(ownerExecutionDraftRef.current || documentDraft);
      await persistOwnerExecutionDraft({
        ...currentDraft,
        contractSigned: true,
        contractSignatureUrl: documentDraft.contractSignatureUrl || currentDraft.contractSignatureUrl,
        contractSignedAt: documentDraft.contractSignedAt || currentDraft.contractSignedAt,
        contractDocumentUrl: generatedContractUrl,
        contractDocumentGeneratedAt: documentDraft.contractDocumentGeneratedAt || currentDraft.contractDocumentGeneratedAt,
      });
    })();
  }, [ensureOwnerExecutionContractDocument, ownerExecutionDraft, ownerExecutionHandoffLocked, persistOwnerExecutionDraft]);

  const openOwnerSignatureModal = useCallback(() => {
    if (ownerExecutionHandoffLocked) return;
    setShowOwnerSignatureModal(true);
  }, [ownerExecutionHandoffLocked]);

  const saveOwnerExecutionReturnOdometer = useCallback((value) => {
    if (ownerExecutionReturnLocked) return;
    const normalizedValue = Number(value);
    const startOdometer = hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer)
      ? Number(ownerExecutionDraft.startOdometer)
      : null;
    if (!Number.isFinite(normalizedValue) || normalizedValue < 0) return;
    if (startOdometer !== null && normalizedValue < startOdometer) return;

    const nextDraft = {
      ...ownerExecutionDraft,
      returnOdometer: String(Math.round(normalizedValue)),
    };

    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      if (linkedFleetVehicleId) {
        const result = await FuelTransactionService.syncVehicleCurrentOdometer(linkedFleetVehicleId, normalizedValue);
        if (result?.success) {
          setFormData((current) => ({ ...current, currentOdometer: String(Math.round(normalizedValue)) }));
        }
      }
    })();
  }, [linkedFleetVehicleId, ownerExecutionDraft, ownerExecutionReturnLocked, persistOwnerExecutionDraft]);

  const saveOwnerExecutionReturnFuelLevel = useCallback((level) => {
    if (ownerExecutionReturnLocked) return;
    const normalizedLevel = Number(level);
    if (!Number.isFinite(normalizedLevel) || normalizedLevel < 0 || normalizedLevel > 8) return;

    const nextDraft = {
      ...ownerExecutionDraft,
      returnFuelLevel: String(normalizedLevel),
    };

    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      if (linkedFleetVehicleId) {
        const syncResult = await FuelTransactionService.syncVehicleFuelState({
          vehicleId: linkedFleetVehicleId,
          lines: normalizedLevel,
          source: 'owner_handoff_return',
          rentalId: operationalRequest?.id || null,
        });
        if (syncResult?.success) {
          setVehicleFuelState(syncResult?.state || null);
        }
      }
    })();
  }, [linkedFleetVehicleId, operationalRequest?.id, ownerExecutionDraft, ownerExecutionReturnLocked, persistOwnerExecutionDraft]);

  const openOwnerReturnOdometerModal = useCallback(() => {
    if (ownerExecutionReturnLocked) return;
    setReturnOdometerInput(
      hasOwnerExecutionNumberValue(ownerExecutionDraft.returnOdometer)
        ? String(ownerExecutionDraft.returnOdometer)
        : ''
    );
    setShowOwnerReturnOdometerModal(true);
  }, [ownerExecutionDraft.returnOdometer, ownerExecutionReturnLocked]);

  const handleOwnerReturnOdometerModalSave = useCallback(() => {
    const startOdometer = hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer)
      ? Number(ownerExecutionDraft.startOdometer)
      : null;
    if (!hasOwnerExecutionNumberValue(returnOdometerInput)) return;
    if (startOdometer !== null && Number(returnOdometerInput) < startOdometer) return;
    saveOwnerExecutionReturnOdometer(returnOdometerInput);
    setShowOwnerReturnOdometerModal(false);
  }, [ownerExecutionDraft.startOdometer, returnOdometerInput, saveOwnerExecutionReturnOdometer]);

  const openOwnerReturnFuelModal = useCallback(() => {
    if (ownerExecutionReturnLocked) return;
    setShowOwnerReturnFuelModal(true);
  }, [ownerExecutionReturnLocked]);

  const handleOwnerReturnFuelModalSave = useCallback((level) => {
    saveOwnerExecutionReturnFuelLevel(level);
  }, [saveOwnerExecutionReturnFuelLevel]);

  const markOwnerExecutionStarted = useCallback(() => {
    if (!ownerHandoffReady) return;
    const startedAt = new Date().toISOString();
    const nextDraft = {
      ...ownerExecutionDraft,
      startReadyAt: ownerExecutionDraft.startReadyAt || startedAt,
      startedAt: ownerExecutionDraft.startedAt || startedAt,
      returnPendingAt: null,
    };
    setOwnerExecutionNow(Date.now());
    void (async () => {
      const startSaved = await persistOwnerExecutionDraft(nextDraft, 'active');
      if (!startSaved) {
        toast.error(tr('Could not start the rental. Please try again.', 'Impossible de démarrer la location. Veuillez réessayer.'));
        return;
      }

      const persistedStartDraft = normalizeOwnerExecutionDraft(ownerExecutionDraftRef.current || nextDraft);
      const documentDraft = await ensureOwnerExecutionContractDocument(persistedStartDraft);
      const receiptDraft = await ensureOwnerExecutionFinalReceiptDocument(documentDraft);
      const contractDocumentUrl = String(documentDraft.contractDocumentUrl || '').trim();
      const receiptUrl = String(receiptDraft.finalReceiptUrl || '').trim();
      const documentLinks = [
        contractDocumentUrl
          ? {
              key: 'contract',
              kind: 'contract',
              label: tr('Open contract', 'Ouvrir le contrat'),
              href: contractDocumentUrl,
            }
          : null,
        receiptUrl
          ? {
              key: 'receipt',
              kind: 'receipt',
              label: tr('Open receipt', 'Ouvrir le reçu'),
              href: receiptUrl,
            }
          : null,
      ].filter(Boolean);

      const latestDraft = normalizeOwnerExecutionDraft(ownerExecutionDraftRef.current || persistedStartDraft);
      const mergedDocumentDraft = normalizeOwnerExecutionDraft({
        ...latestDraft,
        contractDocumentUrl: receiptDraft.contractDocumentUrl || latestDraft.contractDocumentUrl,
        contractDocumentGeneratedAt: receiptDraft.contractDocumentGeneratedAt || latestDraft.contractDocumentGeneratedAt,
        finalReceiptUrl: receiptDraft.finalReceiptUrl || latestDraft.finalReceiptUrl,
        finalReceiptGeneratedAt: receiptDraft.finalReceiptGeneratedAt || latestDraft.finalReceiptGeneratedAt,
      });
      const hasDocumentUpdates =
        mergedDocumentDraft.contractDocumentUrl !== latestDraft.contractDocumentUrl ||
        mergedDocumentDraft.contractDocumentGeneratedAt !== latestDraft.contractDocumentGeneratedAt ||
        mergedDocumentDraft.finalReceiptUrl !== latestDraft.finalReceiptUrl ||
        mergedDocumentDraft.finalReceiptGeneratedAt !== latestDraft.finalReceiptGeneratedAt;

      if (hasDocumentUpdates) {
        await persistOwnerExecutionDraft(mergedDocumentDraft);
      }

      await sendOwnerExecutionSystemMessage({
        body: contractDocumentUrl && receiptUrl
          ? tr('Rental started. Contract and receipt are ready.', 'Location démarrée. Le contrat et le reçu sont prêts.')
          : contractDocumentUrl
            ? tr('Rental started. The contract is ready.', 'Location démarrée. Le contrat est prêt.')
            : receiptUrl
              ? tr('Rental started. The receipt is ready.', 'Location démarrée. Le reçu est prêt.')
              : tr('Rental started', 'Location démarrée'),
        event: 'started',
        requestStatus: 'active',
        documentLinks,
      });
    })();
  }, [ensureOwnerExecutionContractDocument, ensureOwnerExecutionFinalReceiptDocument, ownerExecutionDraft, ownerHandoffReady, persistOwnerExecutionDraft, sendOwnerExecutionSystemMessage, tr]);

  const markOwnerExecutionReturnPending = useCallback(() => {
    if (!ownerExecutionCanStartReturnFlow) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      returnPendingAt: ownerExecutionDraft.returnPendingAt || new Date().toISOString(),
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
    })();
  }, [ownerExecutionCanStartReturnFlow, ownerExecutionDraft, persistOwnerExecutionDraft]);

  const cancelOwnerExecutionReturnPending = useCallback(() => {
    if (ownerExecutionReturnLocked || ownerExecutionSaving || ownerExecutionStage !== 'return_pending') return;

    const nextDraft = {
      ...ownerExecutionDraft,
      returnPendingAt: null,
    };

    setOwnerExecutionNow(Date.now());
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft, 'active');
      toast.success(tr('Finish flow cancelled. Rental is still live.', 'Flux de fin annulé. La location reste active.'));
    })();
  }, [
    ownerExecutionDraft,
    ownerExecutionReturnLocked,
    ownerExecutionSaving,
    ownerExecutionStage,
    persistOwnerExecutionDraft,
    tr,
  ]);

  const setOwnerIssueReview = useCallback((issueReported) => {
    if (ownerExecutionReturnLocked) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      issueReviewed: true,
      issueReported: Boolean(issueReported),
      issueNote: issueReported ? String(ownerExecutionDraft.issueNote || '').trim() : '',
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
      if (issueReported && !ownerExecutionDraft.issueReported && operationalRequest?.id) {
        await RentalEventService.recordEvent({
          rentalId: operationalRequest.id,
          eventType: 'issue_reported',
          actor: 'owner',
          metadata: {
            ownerId: user?.id || null,
            reportedAt: new Date().toISOString(),
          },
        });
      }
    })();
  }, [operationalRequest?.id, ownerExecutionDraft, ownerExecutionReturnLocked, persistOwnerExecutionDraft, user?.id]);

  const saveOwnerExecutionIssueNote = useCallback((note = '') => {
    if (ownerExecutionReturnLocked) return;

    const nextDraft = {
      ...ownerExecutionDraft,
      issueReviewed: true,
      issueReported: true,
      issueNote: String(note || '').trim(),
    };

    if (!nextDraft.issueNote) return;
    void persistOwnerExecutionDraft(nextDraft);
  }, [ownerExecutionDraft, ownerExecutionReturnLocked, persistOwnerExecutionDraft]);

  const saveOwnerExecutionDepositReview = useCallback((outcome = '') => {
    if (ownerExecutionReturnLocked) return;
    const normalizedOutcome = String(outcome || '').trim().toLowerCase();
    if (!normalizedOutcome) return;
    if (normalizedOutcome === 'refund_full' && !String(ownerExecutionDraft.depositRefundSignatureUrl || '').trim()) {
      setShowOwnerRefundSignatureModal(true);
      return;
    }

    const nextDraft = {
      ...ownerExecutionDraft,
      depositReviewed: true,
      depositOutcome: normalizedOutcome,
      ...(normalizedOutcome === 'refund_full'
        ? {}
        : {
            depositRefundSignatureUrl: '',
            depositRefundSignedAt: null,
            depositRefundAmount: 0,
            depositRefundCurrency: '',
            depositRefundSignedBy: '',
            depositRefundRecordedBy: '',
          }),
    };

    void persistOwnerExecutionDraft(nextDraft);
  }, [ownerExecutionDraft, ownerExecutionReturnLocked, persistOwnerExecutionDraft]);

  const openOwnerRefundSignatureModal = useCallback(() => {
    if (ownerExecutionReturnLocked || ownerExecutionSaving) return;
    setShowOwnerRefundSignatureModal(true);
  }, [ownerExecutionReturnLocked, ownerExecutionSaving]);

  const saveOwnerExecutionDepositRefundSignature = useCallback((signatureUrl = '') => {
    if (ownerExecutionReturnLocked) return;
    const normalizedSignatureUrl = String(signatureUrl || '').trim();
    if (!normalizedSignatureUrl) return;

    const signedAt = new Date().toISOString();
    const nextDraft = {
      ...ownerExecutionDraft,
      depositReviewed: true,
      depositOutcome: 'refund_full',
      depositRefundSignatureUrl: normalizedSignatureUrl,
      depositRefundSignedAt: signedAt,
      depositRefundAmount: Math.max(0, Number(operationalRequest?.depositAmount || 0) || 0),
      depositRefundCurrency: String(operationalRequest?.currencyCode || 'MAD').trim() || 'MAD',
      depositRefundSignedBy: String(
        operationalRequest?.customerId ||
        operationalRequest?.customerEmail ||
        operationalRequest?.customerName ||
        ''
      ).trim(),
      depositRefundRecordedBy: String(user?.id || '').trim(),
    };

    void persistOwnerExecutionDraft(nextDraft);
  }, [
    operationalRequest?.currencyCode,
    operationalRequest?.customerEmail,
    operationalRequest?.customerId,
    operationalRequest?.customerName,
    operationalRequest?.depositAmount,
    ownerExecutionDraft,
    ownerExecutionReturnLocked,
    persistOwnerExecutionDraft,
    user?.id,
  ]);

  const saveOwnerReturnFlow = useCallback(() => {
    if (!ownerReturnReady || ownerExecutionReturnLocked) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      returnSavedAt: ownerExecutionDraft.returnSavedAt || new Date().toISOString(),
    };
    void (async () => {
      const documentDraft = await ensureOwnerExecutionFinalReceiptDocument(nextDraft);
      const finalReceiptUrl = String(documentDraft.finalReceiptUrl || '').trim();
      await persistOwnerExecutionDraft(documentDraft, 'completed');
      await sendOwnerExecutionSystemMessage({
        body: finalReceiptUrl
          ? tr('Rental completed. The receipt has been updated.', 'Location terminée. Le reçu a été mis à jour.')
          : tr('Rental completed', 'Location terminée'),
        event: 'completed',
        requestStatus: 'completed',
        documentLinks: finalReceiptUrl
          ? [
              {
                key: 'receipt',
                kind: 'receipt',
                label: tr('Open receipt', 'Ouvrir le reçu'),
                href: finalReceiptUrl,
              },
            ]
          : [],
      });
    })();
  }, [ensureOwnerExecutionFinalReceiptDocument, ownerExecutionDraft, ownerExecutionReturnLocked, ownerReturnReady, persistOwnerExecutionDraft, sendOwnerExecutionSystemMessage, tr]);

  const uploadOwnerExecutionPhotos = useCallback(async (kind, files = []) => {
    if (!user?.id || !operationalRequest?.id || !Array.isArray(files) || files.length === 0) {
      return;
    }

    setOwnerExecutionSaving(true);
    try {
      const draftAttachments = files.map((file) => ({ file }));
      const uploadedAttachments = await MessageAttachmentService.uploadDraftAttachments({
        attachments: draftAttachments,
        threadKey: `marketplace-request-${String(operationalRequest.id)}-${kind}`,
        contextId: String(operationalRequest.id),
        userId: user.id,
      });

      const stampedAttachments = uploadedAttachments.map((attachment, index) => ({
        id: `${kind}-${Date.now()}-${index}`,
        ...attachment,
        uploadedAt: new Date().toISOString(),
      }));

      const nextDraft = {
        ...ownerExecutionDraft,
        ...(kind === 'handoff'
          ? {
              handoffPhotos: stampedAttachments,
              handoffMediaReady: stampedAttachments.length >= OWNER_HANDOFF_MIN_PHOTOS,
            }
          : kind === 'legal_docs'
            ? {
                legalDocsPhotos: stampedAttachments,
                legalDocsMediaReady: stampedAttachments.length >= OWNER_LEGAL_DOCS_MIN_PHOTOS,
                legalDocsChecked: stampedAttachments.length >= OWNER_LEGAL_DOCS_MIN_PHOTOS,
              }
            : {
                returnPhotos: stampedAttachments,
                returnMediaReady: stampedAttachments.length >= OWNER_RETURN_MIN_PHOTOS,
              }),
      };

      await persistOwnerExecutionDraft(nextDraft);
      await sendOwnerExecutionPhotoMessage({ kind, attachments: uploadedAttachments });
      toast.success(kind === 'handoff'
        ? tr('Vehicle inspection photos saved.', 'Photos d’inspection véhicule enregistrées.')
        : kind === 'legal_docs'
          ? tr('Registration and insurance photos saved.', 'Photos carte grise et assurance enregistrées.')
          : tr('Return photos saved.', 'Photos de retour enregistrées.'));
    } catch (photoError) {
      console.warn(`Failed to upload ${kind} execution photos:`, photoError);
      toast.error(photoError?.message || tr('Unable to upload photos right now.', 'Impossible de téléverser les photos pour le moment.'));
    } finally {
      setOwnerExecutionSaving(false);
    }
  }, [operationalRequest?.id, ownerExecutionDraft, persistOwnerExecutionDraft, sendOwnerExecutionPhotoMessage, tr, user?.id]);
  const ownerExecutionFooterPrimaryAction = useMemo(() => {
    if (ownerExecutionStage === 'ready_to_start') {
      return {
        label: tr('Start rental', 'Démarrer la location'),
        onClick: markOwnerExecutionStarted,
        disabled: ownerExecutionSaving,
        tone: 'violet',
        icon: CalendarClock,
      };
    }

    if (ownerExecutionStage === 'live') {
      return {
        label: ownerExecutionCanStartReturnFlow
          ? tr('Start return flow', 'Démarrer le retour')
          : tr('Timer starting…', 'Timer en cours…'),
        onClick: markOwnerExecutionReturnPending,
        disabled: ownerExecutionSaving || !ownerExecutionCanStartReturnFlow,
        tone: 'violet',
        icon: FileText,
      };
    }

    if (ownerExecutionStage === 'return_pending') {
      if (ownerReturnCurrentStep.key === 'return_odometer') {
        return {
          label: hasOwnerExecutionNumberValue(ownerExecutionDraft.returnOdometer)
            ? tr('Edit reading', 'Modifier le relevé')
            : tr('Add reading', 'Ajouter le relevé'),
          onClick: openOwnerReturnOdometerModal,
          disabled: ownerExecutionSaving || ownerExecutionReturnLocked,
          tone: 'violet',
          icon: Gauge,
        };
      }

      if (ownerReturnCurrentStep.key === 'return_fuel') {
        return {
          label: hasOwnerExecutionNumberValue(ownerExecutionDraft.returnFuelLevel)
            ? tr('Edit fuel', 'Modifier le carburant')
            : tr('Record fuel', 'Enregistrer le carburant'),
          onClick: openOwnerReturnFuelModal,
          disabled: ownerExecutionSaving || ownerExecutionReturnLocked,
          tone: 'violet',
          icon: Droplets,
        };
      }

      if (ownerReturnCurrentStep.key === 'return_condition') {
        return {
          label: ownerExecutionDraft.issueReported
            ? tr('Save issue note', "Enregistrer la note d'incident")
            : tr('No issue', 'Aucun incident'),
          onClick: ownerExecutionDraft.issueReported
            ? () => saveOwnerExecutionIssueNote(ownerExecutionDraft.issueNote)
            : () => setOwnerIssueReview(false),
          disabled:
            ownerExecutionSaving ||
            (ownerExecutionDraft.issueReported && !String(ownerExecutionDraft.issueNote || '').trim()),
          tone: ownerExecutionDraft.issueReported ? 'amber' : 'violet',
          icon: ownerExecutionDraft.issueReported ? AlertTriangle : CheckCircle2,
        };
      }

      if (ownerReturnCurrentStep.key === 'deposit_review') {
        const refundSignatureMissing =
          ownerExecutionDraft.depositOutcome === 'refund_full' &&
          !String(ownerExecutionDraft.depositRefundSignatureUrl || '').trim();
        return {
          label: refundSignatureMissing
            ? tr('Sign refund receipt', 'Signer le reçu de remboursement')
            : tr('Save deposit review', 'Enregistrer la caution'),
          onClick: refundSignatureMissing
            ? openOwnerRefundSignatureModal
            : () => saveOwnerExecutionDepositReview(ownerExecutionDraft.depositOutcome),
          disabled: ownerExecutionSaving || !String(ownerExecutionDraft.depositOutcome || '').trim(),
          tone: 'violet',
          icon: refundSignatureMissing ? FileSignature : DollarSign,
        };
      }

      if (ownerReturnCurrentStep.key === 'end_rental') {
        return {
          label: tr('Finish rental', 'Terminer la location'),
          onClick: saveOwnerReturnFlow,
          disabled: ownerExecutionSaving || !ownerReturnReady,
          tone: 'violet',
          icon: CheckCircle2,
        };
      }

      return null;
    }

    if (ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff') {
      if (ownerHandoffReady) {
        return {
          label: tr('Start rental', 'Démarrer la location'),
          onClick: markOwnerExecutionStarted,
          disabled: ownerExecutionSaving,
          tone: 'violet',
          icon: CalendarClock,
        };
      }

      if (ownerHandoffCurrentStep.key === 'start_odometer') {
        return {
          label: tr('Add reading', 'Ajouter le relevé'),
          onClick: openOwnerStartOdometerModal,
          disabled: ownerExecutionSaving,
          tone: 'violet',
          icon: Gauge,
        };
      }

      if (ownerHandoffCurrentStep.key === 'start_fuel') {
        return {
          label: tr('Record fuel', 'Enregistrer le carburant'),
          onClick: openOwnerStartFuelModal,
          disabled: ownerExecutionSaving,
          tone: 'violet',
          icon: Droplets,
        };
      }

      if (ownerHandoffCurrentStep.key === 'deposit') {
        return {
          label: tr('Confirm deposit', 'Confirmer la caution'),
          onClick: () => toggleOwnerExecutionFlag('depositConfirmed'),
          disabled: ownerExecutionSaving,
          tone: 'violet',
          icon: DollarSign,
        };
      }

      if (ownerHandoffCurrentStep.key === 'signature') {
        return {
          label: tr('Sign contract', 'Signer le contrat'),
          onClick: openOwnerSignatureModal,
          disabled: ownerExecutionSaving,
          tone: 'violet',
          icon: FileSignature,
        };
      }
    }

    return null;
  }, [
    handoffOdometerInput,
    markOwnerExecutionReturnPending,
    markOwnerExecutionStarted,
    openOwnerReturnFuelModal,
    openOwnerReturnOdometerModal,
    openOwnerSignatureModal,
    openOwnerRefundSignatureModal,
    openOwnerStartFuelModal,
    openOwnerStartOdometerModal,
    ownerExecutionCanStartReturnFlow,
    ownerExecutionDraft.depositOutcome,
    ownerExecutionDraft.depositRefundSignatureUrl,
    ownerExecutionDraft.returnFuelLevel,
    ownerExecutionDraft.returnOdometer,
    ownerExecutionDraft.startFuelLevel,
    ownerExecutionDraft.startOdometer,
    ownerExecutionReturnLocked,
    ownerExecutionSaving,
    ownerExecutionStage,
    ownerExecutionDraft.issueNote,
    ownerExecutionDraft.issueReported,
    ownerHandoffCurrentStep.key,
    ownerHandoffReady,
    ownerReturnCurrentStep.key,
    ownerReturnReady,
    returnOdometerInput,
    saveOwnerExecutionDepositReview,
    saveOwnerExecutionIssueNote,
    saveOwnerReturnFlow,
    setOwnerIssueReview,
    toggleOwnerExecutionFlag,
    tr,
  ]);
  const ownerExecutionFooterHelper = useMemo(() => {
    if (ownerExecutionStage === 'return_pending' && ownerReturnCurrentStep.key === 'return_photos') {
      return tr(
        'Upload the return evidence above to unlock the next step.',
        'Téléversez la preuve de retour ci-dessus pour débloquer l’étape suivante.'
      );
    }
    if ((ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff') && ownerHandoffCurrentStep.key === 'vehicle_photos') {
      return tr(
        'Upload the vehicle inspection above to unlock the rest of the handoff.',
        'Téléversez l’inspection véhicule ci-dessus pour débloquer le reste de la remise.'
      );
    }
    if ((ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff') && ownerHandoffCurrentStep.key === 'legal_docs') {
      return tr(
        'Upload one registration photo and one insurance photo above to confirm documents.',
        'Téléversez une photo de carte grise et une photo d’assurance ci-dessus pour confirmer les documents.'
      );
    }
    if (ownerExecutionStage === 'return_pending' && ownerReturnCurrentStep.key === 'return_condition') {
      return tr(
        'Confirm the final condition above and add a note if anything needs follow-up.',
        "Confirmez l'état final ci-dessus et ajoutez une note si un suivi est nécessaire."
      );
    }
    if (ownerExecutionStage === 'return_pending' && ownerReturnCurrentStep.key === 'deposit_review') {
      return tr(
        'Save the deposit outcome before closing the rental.',
        'Enregistrez le résultat de la caution avant de clôturer la location.'
      );
    }
    return ownerExecutionProgressModel.hint;
  }, [ownerExecutionProgressModel.hint, ownerExecutionStage, ownerHandoffCurrentStep.key, ownerReturnCurrentStep.key, tr]);
  const ownerExecutionFooter = useMemo(() => {
    if (!operationalRequest || ownerExecutionStage === 'completed') return null;
    const showLiveTimer = Boolean(ownerExecutionLiveTimer) && (ownerExecutionStage === 'live' || ownerExecutionStage === 'return_pending');

    return (
      <AccountRentalExecutionStickyFooter
        progressLabel={showLiveTimer ? tr('Elapsed', 'Écoulé') : tr('Progress', 'Progression')}
        progressValue={showLiveTimer ? ownerExecutionLiveTimer.elapsedLabel : `${ownerExecutionProgressModel.completed}/${ownerExecutionProgressModel.total}`}
        progressValueClassName={showLiveTimer && ownerExecutionLiveTimer.expired ? 'text-red-600' : showLiveTimer ? 'text-emerald-600' : 'text-slate-950'}
        helper={ownerExecutionFooterHelper}
        secondaryLabel={showLiveTimer ? tr('Remaining', 'Restant') : tr('Next', 'Suivant')}
        secondaryValue={showLiveTimer ? ownerExecutionLiveTimer.remainingLabel : ownerExecutionFooterPrimaryAction?.label || ownerExecutionFooterHelper}
        secondaryValueClassName={showLiveTimer && ownerExecutionLiveTimer.expired ? 'text-rose-600' : showLiveTimer ? 'text-blue-600' : 'text-slate-950'}
        primaryAction={ownerExecutionFooterPrimaryAction}
      />
    );
  }, [
    operationalRequest,
    ownerExecutionFooterHelper,
    ownerExecutionFooterPrimaryAction,
    ownerExecutionLiveTimer,
    ownerExecutionProgressModel.completed,
    ownerExecutionProgressModel.total,
    ownerExecutionStage,
    tr,
  ]);
  const listingReviewReplyTarget = useMemo(() => {
    const latestAdminMessage = (Array.isArray(vehicle?.ownerMessages) ? vehicle.ownerMessages : []).find(
      (message) =>
        String(message?.senderType || '').trim().toLowerCase() === 'admin' &&
        String(message?.senderId || '').trim()
    );

    if (!latestAdminMessage) return null;

    return {
      userId: String(latestAdminMessage.senderId || '').trim(),
      role: 'admin',
      label: tr('Review team', 'Équipe de revue'),
    };
  }, [vehicle?.ownerMessages, isFrench]);
  const listingReviewSeedThread = useMemo(() => {
    if (!vehicle?.listingId) return null;

    const ownerMessages = Array.isArray(vehicle?.ownerMessages) ? vehicle.ownerMessages : [];
    const subject = formData.listingTitle || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || 'Marketplace listing';
    const participantLookup = new Map();
    if (listingReviewReplyTarget?.userId) {
      participantLookup.set(String(listingReviewReplyTarget.userId), {
        id: String(listingReviewReplyTarget.userId),
        display_name: listingReviewReplyTarget.label || tr('Review team', 'Équipe de revue'),
        role: 'admin',
      });
    }

    const seededMessages = ownerMessages
      .map((message, index) => {
        const senderRole = String(message?.senderType || '').trim().toLowerCase() === 'owner' ? 'owner' : 'admin';
        const senderUserId =
          senderRole === 'owner'
            ? String(user?.id || '').trim() || null
            : String(message?.senderId || listingReviewReplyTarget?.userId || '').trim() || null;
        const recipientUserId =
          senderRole === 'owner'
            ? String(listingReviewReplyTarget?.userId || '').trim() || null
            : String(user?.id || '').trim() || null;

        return {
          id: `legacy-marketplace-message-${message?.id || index}`,
          thread_key: '',
          family: MESSAGE_FAMILIES.marketplace,
          thread_type: MESSAGE_THREAD_TYPES.marketplaceModeration,
          entity_type: 'listing',
          entity_id: String(vehicle.listingId),
          message_type: String(message?.messageType || 'message').trim().toLowerCase(),
          subject,
          body: String(message?.body || '').trim(),
          sender_user_id: senderUserId,
          sender_role: senderRole,
          recipient_user_id: recipientUserId,
          recipient_role: senderRole === 'owner' ? 'admin' : 'owner',
          created_at: message?.createdAt || null,
          status: 'sent',
          metadata: {
            ...(message?.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
            source: 'marketplace_moderation_legacy',
          },
        };
      })
      .filter((message) => message.body);

    return {
      id: `marketplace-moderation-${vehicle.listingId}`,
      thread_key: '',
      family: MESSAGE_FAMILIES.marketplace,
      thread_type: MESSAGE_THREAD_TYPES.marketplaceModeration,
      entity_type: 'listing',
      entity_id: String(vehicle.listingId),
      subject,
      metadata: {
        href: `/account/vehicles/${encodeURIComponent(String(vehicle.id || vehicleId || ''))}/profile?tab=listing`,
        source: 'marketplace_moderation_legacy',
      },
      participants: Array.from(participantLookup.values()),
      messages: seededMessages,
    };
  }, [
    vehicle?.id,
    vehicle?.listingId,
    vehicle?.ownerMessages,
    vehicleId,
    formData.brandName,
    formData.listingTitle,
    formData.modelName,
    listingReviewReplyTarget,
    tr,
    user?.id,
  ]);
  const listingReviewThreadHasVisibleMessages = useMemo(() => {
    const messages = Array.isArray(listingReviewSeedThread?.messages) ? listingReviewSeedThread.messages : [];
    return messages.length > 0;
  }, [listingReviewSeedThread]);

  const addMediaSlot = () => {
    setFormData((current) => ({
      ...current,
      mediaUrlsText: `${String(current.mediaUrlsText || '').trim()}${String(current.mediaUrlsText || '').trim() ? '\n' : ''}`,
    }));
  };

  const removeMediaUrl = (targetUrl) => {
    const nextUrls = normalizedMedia
      .map((item) => item.url)
      .filter((url) => url !== targetUrl);
    const nextCover = String(formData.coverImageUrl || '').trim() === String(targetUrl).trim()
      ? nextUrls[0] || ''
      : formData.coverImageUrl;

    setFormData((current) => ({
      ...current,
      mediaUrlsText: nextUrls.join('\n'),
      coverImageUrl: nextCover,
    }));
  };

  const handleVehicleMediaChange = (nextMedia) => {
    const normalizedNextMedia = Array.isArray(nextMedia)
      ? nextMedia
          .filter((item) => item?.url)
          .map((item, index) => ({
            id: item.id || `manual-${index}`,
            url: String(item.url || '').trim(),
            is_cover: Boolean(item.is_cover) || String(item.shot_type || '').trim().toLowerCase() === 'hero',
            shot_type: String(item.shot_type || item.shotType || '').trim().toLowerCase() || null,
            quality_status: String(item.quality_status || item.qualityStatus || '').trim().toLowerCase() || null,
          }))
      : [];
    const nextCover =
      normalizedNextMedia.find((item) => item.shot_type === 'hero')?.url ||
      normalizedNextMedia.find((item) => item.is_cover)?.url ||
      normalizedNextMedia[0]?.url ||
      '';

    const nextFormData = {
      ...formData,
      media: normalizedNextMedia,
      coverImageUrl: nextCover,
      mediaUrlsText: normalizedNextMedia.map((item) => item.url).join('\n'),
    };

    setFormData(nextFormData);
    setFieldErrors((current) => {
      if (!current.media) return current;
      const next = { ...current };
      delete next.media;
      return next;
    });

    if (vehicle?.id) {
      void persistVehicle(
        false,
        false,
        nextFormData,
        tr('Vehicle photos saved.', 'Photos du véhicule enregistrées.'),
        { source: 'auto_media_sync', suppressJourneyEvent: true, background: true }
      );
    }
  };

  const resetTaxForm = (record = null) => {
    setTaxForm(createTaxFormState(record));
  };

  const handleTaxChange = (key, value) => {
    setTaxForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleVehicleLegalOcrExtracted = async ({
    category,
    document,
    extractedData,
    missingFields,
    success,
    error: ocrError,
    persisted = false,
  }) => {
    if (!['registration', 'insurance'].includes(String(category || '').trim().toLowerCase())) {
      return;
    }

    const normalizedCategory = String(category || '').trim().toLowerCase();
    let nextFormData = null;
    const filledFieldLabels = [];
    const extractedValueMap = {
      registrationNumber: extractedData?.registration_number,
      registrationDate: extractedData?.registration_date,
      registrationExpiryDate: extractedData?.registration_expiry_date,
      insurancePolicyNumber: extractedData?.insurance_policy_number,
      insuranceProvider: extractedData?.insurance_provider,
      insuranceExpiryDate: extractedData?.insurance_expiry_date,
    };

    setFormData((current) => {
      const updated = { ...current };

      if (success && extractedData) {
        Object.entries(extractedValueMap).forEach(([fieldKey, rawValue]) => {
          const value = String(rawValue || '').trim();
          if (value) {
            updated[fieldKey] = value;
            filledFieldLabels.push(getVehicleLegalFieldLabel(fieldKey));
          }
        });
      }

      nextFormData = updated;
      return updated;
    });

    const missingFieldKeyMap = {
      registration_number: 'registrationNumber',
      registration_date: 'registrationDate',
      registration_expiry_date: 'registrationExpiryDate',
      insurance_policy_number: 'insurancePolicyNumber',
      insurance_provider: 'insuranceProvider',
      insurance_expiry_date: 'insuranceExpiryDate',
    };

    const expectedCategoryFieldKeys = VEHICLE_LEGAL_OCR_FIELD_MAP[normalizedCategory] || [];
    const normalizedMissingFieldLabels = (Array.isArray(missingFields) ? missingFields : [])
      .map((fieldKey) => missingFieldKeyMap[fieldKey] || fieldKey)
      .filter((fieldKey) => expectedCategoryFieldKeys.includes(fieldKey))
      .map((fieldKey) => getVehicleLegalFieldLabel(fieldKey));
    const inferredMissingFieldLabels = expectedCategoryFieldKeys
      .filter((fieldKey) => !nextFormData?.[fieldKey])
      .map((fieldKey) => getVehicleLegalFieldLabel(fieldKey));
    const combinedMissingFieldLabels = [...new Set([
      ...normalizedMissingFieldLabels,
      ...inferredMissingFieldLabels,
    ])];
    const scanCompleted = Boolean(success && filledFieldLabels.length > 0 && combinedMissingFieldLabels.length === 0);

    const detailParts = [];
    if (filledFieldLabels.length > 0) {
      detailParts.push(
        tr('Filled:', 'Rempli :') + ` ${filledFieldLabels.join(', ')}`
      );
    }
    if (combinedMissingFieldLabels.length > 0) {
      detailParts.push(
        tr('Missing:', 'Manquant :') + ` ${combinedMissingFieldLabels.join(', ')}`
      );
    }

    setVehicleLegalScanResults((current) => ({
      ...current,
      [normalizedCategory]: {
        category: normalizedCategory,
        title: getVehicleLegalScanTitle(normalizedCategory),
        documentName: document?.name || '',
        pendingSave: Boolean(!persisted && !scanCompleted),
        success: scanCompleted,
        requestSent: Boolean(
          !scanCompleted &&
          persisted &&
          (!success || combinedMissingFieldLabels.length > 0)
        ),
        filledFieldLabels,
        missingFieldLabels: combinedMissingFieldLabels,
        error: !success
          ? (ocrError || tr('We could not scan this document automatically.', 'Nous n’avons pas pu scanner ce document automatiquement.'))
          : '',
        createdAt: new Date().toISOString(),
      },
    }));

    if (persisted && vehicle?.id && success && filledFieldLabels.length > 0 && nextFormData) {
      await persistVehicle(
        false,
        false,
        nextFormData,
        detailParts.length > 0
          ? `${tr('Document scanned.', 'Document scanné.')} ${detailParts.join(' • ')}`
          : tr('Document scanned and legal fields updated.', 'Document scanné et champs légaux mis à jour.'),
        { source: 'auto_legal_sync', suppressJourneyEvent: true }
      );
      setVehicleLegalScanResults((current) => ({
        ...current,
        [normalizedCategory]: {
          ...(current[normalizedCategory] || {}),
          pendingSave: false,
          success: combinedMissingFieldLabels.length === 0,
          requestSent: combinedMissingFieldLabels.length > 0,
        },
      }));
      return;
    }

    if (success && detailParts.length > 0) {
      setSaveSuccess(`${tr('Document scanned.', 'Document scanné.')} ${detailParts.join(' • ')}`);
      setSaveError('');
    } else if (success) {
      setSaveSuccess(
        tr(
          'Document scanned, but the legal details could not be read clearly. Please complete the registration or insurance fields manually.',
          "Document scanné, mais les détails légaux n'ont pas pu être lus clairement. Veuillez compléter manuellement les champs d'immatriculation ou d'assurance."
        )
      );
      setSaveError('');
    } else if (!success && ocrError) {
      setSaveSuccess(
        tr(
          'Document uploaded. OCR could not fill the legal fields automatically, so please complete them manually.',
          "Document téléversé. L'OCR n'a pas pu remplir automatiquement les champs légaux, veuillez les compléter manuellement."
        )
      );
    }
  };

  const refreshVehicleVerificationDocuments = useCallback(async () => {
    if (vehicleVerificationEntityIds.length === 0) return;

    try {
      const verificationFileResults = await Promise.all(
        vehicleVerificationEntityIds.map((entityId) =>
          VerificationService.getEntityVerificationFile(
            'vehicle',
            entityId,
            { forceRefresh: true }
          ).catch(() => ({ summary: null, requests: [] }))
        )
      );

      const fallbackVehicleVerificationSummary = vehicle?.rawFleetVehicle?.verification_summary || null;
      const nextVerificationSources = fallbackVehicleVerificationSummary
        ? [...verificationFileResults, { summary: fallbackVehicleVerificationSummary, requests: [] }]
        : verificationFileResults;
      const nextVerificationRequests = getVehicleVerificationRowsFromFileResults(nextVerificationSources);
      const nextVerificationDocuments = mapVehicleVerificationRequestsToDocuments(nextVerificationRequests);
      const nextVerificationSummary = nextVerificationRequests.length > 0
        ? buildEntityVerificationSummary(nextVerificationRequests, 'vehicle')
        : nextVerificationSources.find((fileResult) => fileResult?.summary)?.summary || null;
      setVehicleVerificationSummary(nextVerificationSummary);
      setVehicleDocuments((current) => mergeVehicleDocuments(current, nextVerificationDocuments));
    } catch (verificationRefreshError) {
      console.warn('Unable to refresh vehicle verification documents:', verificationRefreshError);
    }
  }, [vehicleVerificationEntityIds]);

  const handleDeleteVehicleDocument = useCallback(async (deletedDocumentId) => {
    setVehicleDocuments((current) =>
      (Array.isArray(current) ? current : []).filter((document) => String(document?.id || '').trim() !== String(deletedDocumentId || '').trim())
    );

    await refreshVehicleVerificationDocuments();
  }, [refreshVehicleVerificationDocuments]);

  useEffect(() => {
    if (activeTab !== 'legal' || vehicleVerificationEntityIds.length === 0) return;
    void refreshVehicleVerificationDocuments();
  }, [activeTab, refreshVehicleVerificationDocuments, vehicleVerificationEntityIds]);

  const persistVehicle = async (
    submitForReview = false,
    saveListing = false,
    overrideFormData = null,
    successMessageOverride = '',
    analyticsMeta = {}
  ) => {
    if (!user?.id) return;

    const isBackgroundSave = Boolean(analyticsMeta?.background);

    try {
      if (submitForReview) {
        setSubmitting(true);
      } else if (!isBackgroundSave) {
        setSaving(true);
      }
      if (!isBackgroundSave) {
        setSaveError('');
        setSaveSuccess('');
      }

      const sourceFormData = overrideFormData || formData;
      const nextNormalizedMedia = normalizeMediaFromFormState(sourceFormData);

      const validationErrors = validateOwnerVehicleForm({
        ...sourceFormData,
        extras: parseCommaSeparated(sourceFormData.extrasText),
        media: nextNormalizedMedia,
      }, submitForReview);

      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        throw new Error(Object.values(validationErrors)[0]);
      }

      const payload = {
        ...sourceFormData,
        extras: parseCommaSeparated(sourceFormData.extrasText),
        media: nextNormalizedMedia,
      };

      const result = await withTimeout(
        BusinessMarketplaceService.saveOwnerVehicle({
          ownerId: user.id,
          accountType:
            userProfile?.accountType ||
            user?.user_metadata?.account_type ||
            user?.app_metadata?.account_type ||
            'individual_owner',
          metadata: ownerMetadata,
          vehicleId: isNewVehicle ? null : vehicleId,
          formData: payload,
          submitForReview,
          saveListing,
        }),
        OWNER_VEHICLE_SAVE_TIMEOUT_MS,
        tr('Saving took too long. Please try again.', 'L’enregistrement a pris trop de temps. Veuillez réessayer.')
      );

      const savedVehicle = result?.vehicle || null;

      setVehicle(savedVehicle);
      setFormData(buildFormData(savedVehicle));
      setLastProfileSaveAt(Date.now());
      storeOwnerVehicleId(user?.id, savedVehicle?.id, { incrementCount: isNewVehicle });
      if (savedVehicle?.id) {
        void activatePrivateOwnerAccount({ source: 'vehicle_saved' });
      }

      if (!analyticsMeta?.suppressJourneyEvent) {
        const journeyPayload = {
          source: analyticsMeta?.source || (submitForReview ? 'listing_review_submission' : 'listing_profile_save'),
          vehicleId: savedVehicle?.id || vehicle?.id || vehicleId || '',
          listingId: savedVehicle?.listingId || vehicle?.listingId || '',
          activeTab,
          saveListing: Boolean(saveListing),
          isNewVehicle,
        };

        trackAccountJourneyEvent(
          submitForReview
            ? ACCOUNT_JOURNEY_EVENTS.reviewSubmitted
            : ACCOUNT_JOURNEY_EVENTS.draftSaved,
          journeyPayload
        );
      }

      setFieldErrors({});
      if (!analyticsMeta?.keepEditing) {
        setIsEditingVehicle(false);
      }
      setTaxEditing(false);
      if (analyticsMeta?.sectionKey) {
        setSectionSaveMeta((current) => ({
          ...current,
          [analyticsMeta.sectionKey]: {
            savedAt: Date.now(),
          },
        }));
      }
      if (!isBackgroundSave) {
        if (!analyticsMeta?.suppressGlobalSuccess) {
          setSaveSuccess(
            successMessageOverride || (
              submitForReview
                ? tr('Full vehicle package sent for review.', 'Dossier complet du véhicule envoyé en revue.')
                : tr('Vehicle changes saved.', 'Modifications du véhicule enregistrées.')
            )
          )
        }
      }
      if (isNewVehicle && savedVehicle?.id) {
        const nextTab = ['overview', 'listing', 'bookings', 'finance', 'legal'].includes(String(activeTab || '').toLowerCase())
          ? String(activeTab).toLowerCase()
          : 'overview';
        navigate(
          `/account/vehicles/${encodeURIComponent(String(savedVehicle.id))}/profile?tab=${encodeURIComponent(nextTab)}`,
          {
            replace: true,
            state: {
              ...(location.state || {}),
              from: location.state?.from || '/account/vehicles',
              resumeEditing: true,
              focusSectionId: nextNormalizedMedia.length === 0 ? 'primary-photo' : '',
            },
          }
        );
      }
      return {
        success: true,
        vehicle: savedVehicle,
      };
    } catch (saveErrorValue) {
      if (isBackgroundSave) {
        console.warn('Background vehicle save failed:', saveErrorValue);
      } else {
        setSaveError(saveErrorValue?.message || tr('Unable to save this vehicle right now.', 'Impossible d’enregistrer ce véhicule pour le moment.'));
      }
      return {
        success: false,
        error: saveErrorValue,
      };
    } finally {
      if (!isBackgroundSave) {
        setSaving(false);
      }
      setSubmitting(false);
    }
  };

  const getPostLegalContinueTarget = () => {
    const nextSection = pricingPickupComplete
      ? 'listing-journey'
      : listingDetailsComplete && listingPricingComplete
        ? 'listing-rules'
        : 'listing-details';

    return {
      to: `${location.pathname}?tab=listing`,
      state: {
        ...(location.state || {}),
        from: currentPath,
        resumeEditing: true,
        focusSectionId: nextSection,
      },
    };
  };

  const handleConfirmVehicleLegalDetails = async () => {
    const result = await persistVehicle(
      false,
      false,
      null,
      tr('Legal details saved.', 'Détails légaux enregistrés.'),
      { source: 'legal_details_save' }
    );

    if (result?.success && !isNewVehicle) {
      navigateWithinVehicleProfile(getPostLegalContinueTarget());
    }
  };

  const handlePublishApprovedListing = async () => {
    if (!user?.id || !vehicle?.listingId) {
      setSaveError(tr('Save the listing first before publishing.', "Enregistrez d'abord l'annonce avant de publier."));
      return false;
    }

    if (!listingApproved && !listingIsLive) {
      setSaveError(tr('Admin approval is required before publishing.', "L'approbation admin est requise avant publication."));
      return false;
    }

    if (listingIsLive) {
      return true;
    }

    try {
      setPublishListingPending(true);
      setSubmitting(true);
      setSaveError('');
      setSaveSuccess('');

      const result = await withTimeout(
        BusinessMarketplaceService.publishOwnerListing({
          ownerId: user.id,
          vehicleId: vehicle?.id || vehicleId,
        }),
        OWNER_VEHICLE_SAVE_TIMEOUT_MS,
        tr('Publishing took too long. Please try again.', 'La publication a pris trop de temps. Veuillez réessayer.')
      );

      const publishedVehicle = result?.vehicle || null;
      if (!publishedVehicle) {
        throw new Error(tr('Publishing did not return the live listing. Please refresh and try again.', "La publication n'a pas renvoyé l'annonce en ligne. Actualisez puis réessayez."));
      }

      setVehicle(publishedVehicle);
      setFormData(buildFormData(publishedVehicle));
      setLastProfileSaveAt(Date.now());
      setSaveSuccess(tr('Listing published. It is now live on the marketplace.', "Annonce publiée. Elle est maintenant en ligne sur la marketplace."));
      trackAccountJourneyEvent(ACCOUNT_JOURNEY_EVENTS.listingWentLive, {
        source: 'owner_publish_button',
        vehicleId: publishedVehicle?.id || vehicle?.id || vehicleId || '',
        listingId: publishedVehicle?.listingId || vehicle?.listingId || '',
      });
      return true;
    } catch (publishError) {
      setSaveError(publishError?.message || tr('Unable to publish this listing right now.', "Impossible de publier cette annonce pour le moment."));
      return false;
    } finally {
      setPublishListingPending(false);
      setSubmitting(false);
    }
  };

  const handleSaveTaxRecord = async () => {
    if (!linkedFleetVehicleId) {
      setSaveError(tr('Save the vehicle profile once first so we can create the linked fleet vehicle before adding annual tax.', 'Enregistrez d’abord le profil véhicule afin que nous puissions créer le véhicule flotte lié avant d’ajouter la taxe annuelle.'));
      return;
    }

    try {
      setTaxSaving(true);
      await VehicleAnnualTaxService.upsert(linkedFleetVehicleId, {
        id: taxForm.id || undefined,
        tax_year: Number(taxForm.tax_year || new Date().getFullYear()),
        amount_mad: Number(taxForm.amount_mad || 0),
        payment_date: taxForm.payment_date || null,
        valid_from: taxForm.valid_from || null,
        valid_until: taxForm.valid_until || null,
        notes: taxForm.notes || '',
      });
      const nextRecords = await VehicleAnnualTaxService.listForVehicle(linkedFleetVehicleId);
      setAnnualTaxRecords(Array.isArray(nextRecords) ? nextRecords : []);
      setTaxEditing(false);
      resetTaxForm();
      setSaveSuccess(tr('Annual tax payment saved.', 'Paiement de taxe annuelle enregistré.'));
    } catch (taxError) {
      setSaveError(taxError?.message || tr('Unable to save annual tax payment right now.', 'Impossible d’enregistrer la taxe annuelle pour le moment.'));
    } finally {
      setTaxSaving(false);
    }
  };

  const handleDeleteTaxRecord = async (recordId) => {
    if (!recordId || !window.confirm(tr('Delete this annual tax payment record?', 'Supprimer cet enregistrement de taxe annuelle ?'))) return;
    try {
      await VehicleAnnualTaxService.remove(recordId);
      if (linkedFleetVehicleId) {
        const nextRecords = await VehicleAnnualTaxService.listForVehicle(linkedFleetVehicleId);
        setAnnualTaxRecords(Array.isArray(nextRecords) ? nextRecords : []);
      }
      setSaveSuccess(tr('Annual tax payment removed.', 'Paiement annuel supprimé.'));
    } catch (taxError) {
      setSaveError(taxError?.message || tr('Unable to remove this annual tax payment right now.', 'Impossible de supprimer ce paiement annuel pour le moment.'));
    }
  };

  const handleStartEditing = () => {
    setSaveError('');
    setSaveSuccess('');
    setIsEditingVehicle(true);
  };

  const handleCancelEditing = () => {
    setSaveError('');
    setSaveSuccess('');
    setFieldErrors({});
    setTaxEditing(false);
    if (isNewVehicle) {
      navigate(backLink);
      return;
    }
    setFormData(buildFormData(vehicle || null));
    setIsEditingVehicle(isNewVehicle);
  };

  const handleSaveVehicle = async () => {
    await persistVehicle(false, activeTab === 'listing', null, '', {
      source: activeTab === 'listing' ? 'listing_tab_save' : 'vehicle_profile_save',
    });
  };

  const handleSaveVehicleSection = async (sectionKey, source) => {
    await persistVehicle(false, activeTab === 'listing', null, '', {
      source,
      sectionKey,
      keepEditing: true,
      suppressGlobalSuccess: true,
    });
  };

  const getSectionSavedLabel = (sectionKey) => {
    if (!sectionSaveMeta?.[sectionKey]?.savedAt) return '';
    return tr('Saved just now', 'Enregistré à l’instant');
  };

  const coverImage = vehicle?.coverImageUrl || vehicle?.media?.[0]?.url || '';
  const ownerVerificationStatus = String(ownerVerificationSummary?.status || '').trim().toLowerCase();
  const ownerVerificationReady = Boolean(ownerVerificationSummary?.complete) && ownerVerificationStatus === 'approved';
  const ownerVerificationMissing = Array.isArray(ownerVerificationSummary?.missing) ? ownerVerificationSummary.missing : [];
  const vehicleVerificationStatus = String(vehicleVerificationSummary?.status || '').trim().toLowerCase();
  const vehicleVerificationReady = Boolean(vehicleVerificationSummary?.complete) && vehicleVerificationStatus === 'approved';
  const vehicleVerificationMissing = Array.isArray(vehicleVerificationSummary?.missing) ? vehicleVerificationSummary.missing : [];
  const vehicleVerificationLatestByType = vehicleVerificationSummary?.latestByType && typeof vehicleVerificationSummary.latestByType === 'object'
    ? vehicleVerificationSummary.latestByType
    : {};
  const vehicleVerificationSubmitted = VEHICLE_REQUIRED_VERIFICATIONS.every((type) => Boolean(vehicleVerificationLatestByType[type]));
  const vehicleLegalDocumentCategoryPresent = (category) => {
    const aliases = category === 'registration'
      ? ['registration', 'vehicle_registration', 'immatriculation']
      : ['insurance', 'vehicle_insurance', 'assurance'];

    return (Array.isArray(vehicleDocuments) ? vehicleDocuments : []).some((document) => {
      const haystack = [
        document?.categoryKey,
        document?.category,
        document?.verificationType,
        document?.name,
        document?.storagePath,
      ].filter(Boolean).join(' ').toLowerCase();

      return aliases.some((alias) => haystack.includes(alias));
    });
  };
  const registrationDocumentUploaded = Boolean(vehicleVerificationLatestByType.vehicle_registration) || vehicleLegalDocumentCategoryPresent('registration');
  const insuranceDocumentUploaded = Boolean(vehicleVerificationLatestByType.vehicle_insurance) || vehicleLegalDocumentCategoryPresent('insurance');
  const vehicleLegalDocumentsUploaded = registrationDocumentUploaded && insuranceDocumentUploaded;
  const vehicleVerificationWaitingOnAdmin =
    vehicleVerificationSubmitted &&
    ['pending', 'approved'].includes(vehicleVerificationStatus);
  const registrationScanComplete = Boolean(vehicleLegalScanResults.registration?.success);
  const insuranceScanComplete = Boolean(vehicleLegalScanResults.insurance?.success);
  const vehicleLegalScanComplete = registrationScanComplete && insuranceScanComplete;
  const registrationFieldsComplete = Boolean(
    String(formData.registrationNumber || '').trim() &&
    String(formData.registrationDate || '').trim() &&
    String(formData.registrationExpiryDate || '').trim()
  );
  const insuranceFieldsComplete = Boolean(
    String(formData.insurancePolicyNumber || '').trim() &&
    String(formData.insuranceProvider || '').trim() &&
    String(formData.insuranceExpiryDate || '').trim()
  );
  const vehicleLegalFieldsComplete = registrationFieldsComplete && insuranceFieldsComplete;
  const vehicleLegalStepComplete = vehicleVerificationReady || vehicleLegalScanComplete || vehicleLegalDocumentsUploaded || (vehicleVerificationSubmitted && vehicleLegalFieldsComplete);
  const vehicleLegalManualFallbackSubmitted = vehicleVerificationSubmitted && !vehicleLegalStepComplete;
  const effectiveVehicleVerificationMissing = vehicleVerificationMissing.filter((type) => {
    if (type === 'vehicle_registration') {
      return !(registrationDocumentUploaded || registrationFieldsComplete);
    }
    if (type === 'vehicle_insurance') {
      return !(insuranceDocumentUploaded || insuranceFieldsComplete);
    }
    return true;
  });
  const nextVehicleLegalUploadCategory =
    !registrationDocumentUploaded
      ? 'registration'
      : !insuranceDocumentUploaded
        ? 'insurance'
        : !registrationFieldsComplete
          ? 'registration'
          : !insuranceFieldsComplete
            ? 'insurance'
            : 'registration';
  const marketplaceVerificationReady = ownerVerificationReady && vehicleVerificationReady;
  const effectiveMarketplaceJourneyState = getEffectiveMarketplaceJourneyState({
    marketplaceVerificationReady,
    hasStartedDraft,
    listingStatus: vehicle?.listingStatus,
    reviewStatus: vehicle?.reviewStatus,
    moderationStatus: vehicle?.moderationStatus,
  });
  const marketplaceJourneyMeta = getMarketplaceJourneyMeta(effectiveMarketplaceJourneyState, tr);
  const listingReviewSubmitted = effectiveMarketplaceJourneyState === 'pending_review';
  const listingApproved = effectiveMarketplaceJourneyState === 'approved';
  const listingIsLive = effectiveMarketplaceJourneyState === 'live';
  const insuranceExpiryDate = formData.insuranceExpiryDate ? new Date(formData.insuranceExpiryDate) : null;
  const hasValidInsuranceExpiry = insuranceExpiryDate && !Number.isNaN(insuranceExpiryDate.getTime());
  const insuranceExpired = hasValidInsuranceExpiry && insuranceExpiryDate < new Date();
  const hasVehicleMedia = vehiclePhotoRequirements.isComplete;
  const hasListingPrice = Boolean(formData.dailyPriceAmount || formData.halfDayPriceAmount);
  const hasDepositAmount = !(formData.depositAmount === '' || formData.depositAmount === null || formData.depositAmount === undefined);
  const pricingGuide = getPricingGuide({
    categoryCode: formData.categoryCode,
    year: formData.year,
    vehicleCondition: formData.vehicleCondition,
    hasVehicleMedia,
    documentCount: vehicleDocuments.length,
  });
  const normalizedFuelPolicy = String(formData.fuelPolicy || '').trim().toLowerCase();
  const returnSameFuelLevel =
    !normalizedFuelPolicy ||
    normalizedFuelPolicy === 'return_same_level' ||
    normalizedFuelPolicy.includes('same') ||
    normalizedFuelPolicy.includes('full') ||
    normalizedFuelPolicy.includes('return');
  const fuelPolicyDisplay = returnSameFuelLevel
    ? tr('Return with the same fuel level', 'Retour avec le même niveau de carburant')
    : (formData.fuelPolicy || tr('Custom fuel policy', 'Politique carburant personnalisée'));
  const latestReviewDetail =
    listingReviewSummary.latestModerationEntry?.feedback ||
    listingReviewSummary.latestModerationEntry?.reason ||
    listingReviewSummary.latestOwnerMessage?.body ||
    '';
  const tabs = useMemo(() => {
    const baseTabs = [
      { key: 'overview', label: tr('Vehicle', 'Véhicule'), icon: Car },
      { key: 'listing', label: tr('Pricing & publish', 'Prix & publication'), icon: Store },
      { key: 'legal', label: tr('Documents', 'Documents'), icon: ShieldCheck },
    ];

    if (linkedFleetVehicleId || vehicleFinanceOverview) {
      baseTabs.push({ key: 'finance', label: tr('Money', 'Argent'), icon: DollarSign });
    }

    return baseTabs;
  }, [
    isFrench,
    linkedFleetVehicleId,
    vehicleFinanceOverview,
  ]);
  const ownerProfileAlerts = [
    formData.nextOilChangeDue ? { id: 'oil', label: tr('Oil change due', 'Vidange à prévoir') } : null,
    formData.registrationExpiryDate ? { id: 'registration', label: tr('Registration tracked', "Immatriculation suivie") } : null,
    insuranceExpired ? { id: 'insurance', label: tr('Insurance expired', 'Assurance expirée') } : null,
  ].filter(Boolean);
  const vehicleLegalScanCards = ['registration', 'insurance']
    .map((category) => {
      const result = vehicleLegalScanResults[category];
      if (!result) return null;

      const fieldsComplete = category === 'registration' ? registrationFieldsComplete : insuranceFieldsComplete;
      const shouldTreatAsComplete = fieldsComplete && result.filledFieldLabels?.length > 0;

      return shouldTreatAsComplete
        ? {
            ...result,
            pendingSave: false,
            success: true,
            requestSent: false,
            missingFieldLabels: [],
          }
        : result;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  const vehicleLegalDocumentStatusMap = {
    registration: vehicleVerificationReady || registrationScanComplete || registrationDocumentUploaded || (vehicleVerificationSubmitted && registrationFieldsComplete)
      ? {
          label: tr(
            vehicleVerificationReady ? 'Verified' : registrationScanComplete ? 'Verified by scan' : 'Uploaded',
            vehicleVerificationReady ? 'Vérifié' : registrationScanComplete ? 'Vérifié par scan' : 'Téléversé'
          ),
          tone: 'bg-emerald-100 text-emerald-700',
        }
      : vehicleLegalScanResults.registration?.pendingSave
        ? {
            label: tr('Processing', 'Traitement'),
            tone: 'bg-violet-100 text-violet-700',
          }
      : vehicleLegalScanResults.registration?.requestSent
        ? {
            label: tr('Request sent', 'Demande envoyée'),
            tone: 'bg-amber-100 text-amber-700',
          }
        : null,
    insurance: vehicleVerificationReady || insuranceScanComplete || insuranceDocumentUploaded || (vehicleVerificationSubmitted && insuranceFieldsComplete)
      ? {
          label: tr(
            vehicleVerificationReady ? 'Verified' : insuranceScanComplete ? 'Verified by scan' : 'Uploaded',
            vehicleVerificationReady ? 'Vérifié' : insuranceScanComplete ? 'Vérifié par scan' : 'Téléversé'
          ),
          tone: 'bg-emerald-100 text-emerald-700',
        }
      : vehicleLegalScanResults.insurance?.pendingSave
        ? {
            label: tr('Processing', 'Traitement'),
            tone: 'bg-violet-100 text-violet-700',
          }
      : vehicleLegalScanResults.insurance?.requestSent
        ? {
            label: tr('Request sent', 'Demande envoyée'),
            tone: 'bg-amber-100 text-amber-700',
          }
        : null,
  };
  const marketplaceChecklist = [
    {
      key: 'owner_verification',
      done: ownerVerificationReady,
      label: tr('Owner ID + license', 'Pièce + permis propriétaire'),
      route: '/account/verification',
    },
    {
      key: 'vehicle_profile',
      done: Boolean(formData.brandName && formData.modelName && formData.plateNumber && formData.cityName),
      label: tr('Vehicle basics', 'Bases du véhicule'),
      tab: 'overview',
      section: 'vehicle-basics',
    },
    {
      key: 'vehicle_documents',
      done: vehicleLegalStepComplete,
      label: tr('Vehicle documents', 'Documents véhicule'),
      tab: 'legal',
      section: 'legal-documents',
    },
    {
      key: 'verification',
      done: vehicleLegalStepComplete || vehicleVerificationWaitingOnAdmin,
      label: tr('Vehicle verification', 'Vérification véhicule'),
      tab: 'legal',
      section: 'legal-documents',
    },
    {
      key: 'listing_details',
      done: Boolean(
        formData.listingTitle
      ),
      label: tr('Listing title', "Titre de l'annonce"),
      tab: 'listing',
      section: 'listing-details',
    },
    {
      key: 'listing_pricing',
      done: Boolean(hasListingPrice && hasDepositAmount),
      label: tr('Price + deposit', 'Prix + caution'),
      tab: 'listing',
      section: 'listing-details',
    },
    {
      key: 'listing_media',
      done: vehiclePhotoRequirements.isComplete,
      label: tr('Vehicle photos', 'Photos du véhicule'),
      tab: 'overview',
      section: 'primary-photo',
    },
    {
      key: 'renter_setup',
      done: Boolean(formData.pickupLocationName),
      label: tr('Pickup setup', 'Point de retrait'),
      tab: 'listing',
      section: 'listing-rules',
    },
    {
      key: 'listing_review',
      done: ['pending_review', 'approved', 'live'].includes(effectiveMarketplaceJourneyState),
      label: tr('Send full review', 'Envoyer la revue complète'),
      tab: 'listing',
      section: 'listing-journey',
    },
    {
      key: 'publish',
      done: listingIsLive,
      label: tr('Publish now', 'Publier maintenant'),
      tab: 'listing',
      section: 'listing-journey',
    },
  ];
  const reviewSubmissionChecklist = marketplaceChecklist.filter((item) => !['listing_review', 'publish'].includes(item.key));
  const missingReviewChecklistItems = reviewSubmissionChecklist.filter((item) => !item.done);
  const canSendFullReview = hasStartedDraft && missingReviewChecklistItems.length === 0;
  const combinedReviewEntryMeta = getCombinedReviewEntryMeta({
    hasStartedDraft,
    marketplaceVerificationReady,
    ownerVerificationReady,
    missingChecklistItems: missingReviewChecklistItems,
    journeyState: effectiveMarketplaceJourneyState,
    latestReviewDetail,
    tr,
  });
  const reviewSubmissionComplete = reviewSubmissionSent || listingReviewSubmitted || listingApproved || listingIsLive;
  const reviewSubmissionFailed = Boolean(reviewSubmissionNotice) && !reviewSubmissionPending && !reviewSubmissionComplete;
  const reviewWaitingForAdmin = reviewSubmissionComplete && !listingApproved && !listingIsLive;
  const compactReviewSteps = [
    {
      key: 'owner',
      label: tr('Owner', 'Propriétaire'),
      value: ownerVerificationReady ? tr('Approved', 'Approuvée') : tr('Waiting', 'En attente'),
      done: ownerVerificationReady,
      tone: ownerVerificationReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800',
    },
    {
      key: 'documents',
      label: tr('Documents', 'Documents'),
      value: vehicleVerificationReady
        ? tr('Approved', 'Approuvés')
        : vehicleVerificationSubmitted || vehicleLegalStepComplete
          ? tr('In review', 'En revue')
          : tr('Missing', 'Manquants'),
      done: vehicleVerificationReady,
      tone: vehicleVerificationReady
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : vehicleVerificationSubmitted || vehicleLegalStepComplete
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-amber-200 bg-amber-50 text-amber-800',
    },
    {
      key: 'review',
      label: tr('Review', 'Revue'),
      value: listingIsLive
        ? tr('Live', 'En ligne')
        : listingApproved
          ? tr('Approved', 'Approuvée')
          : effectiveMarketplaceJourneyState === 'changes_requested'
            ? tr('Changes requested', 'Modifications demandées')
          : reviewSubmissionComplete
            ? tr('Waiting for admin', "En attente de l'admin")
            : canSendFullReview
              ? tr('Ready', 'Prête')
              : tr('Locked', 'Verrouillée'),
      done: listingApproved || listingIsLive,
      tone: listingApproved || listingIsLive
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : effectiveMarketplaceJourneyState === 'changes_requested'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
        : reviewSubmissionComplete
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : canSendFullReview
            ? 'border-violet-200 bg-violet-50 text-violet-800'
            : 'border-slate-200 bg-slate-50 text-slate-700',
    },
  ];
  const compactReviewSystemNote = reviewSubmissionPending
    ? reviewSubmissionNotice
    : reviewSubmissionNotice || latestReviewDetail || (
      reviewSubmissionComplete
        ? tr(
            'No action is needed from you right now. Admin will review the listing, then this step will change to Approved or Changes requested.',
            "Aucune action n'est nécessaire pour le moment. L'admin vérifiera l'annonce, puis cette étape passera à Approuvée ou Modifications demandées."
          )
        : !vehicle?.listingId
          ? tr('Save once to create the approval record.', "Enregistrez une fois pour créer le dossier d'approbation.")
          : ''
    );
  const compactReviewNoteTone = reviewSubmissionPending
    ? 'border-violet-200 bg-violet-50 text-violet-900'
    : reviewSubmissionFailed
      ? 'border-rose-200 bg-rose-50 text-rose-900'
    : listingApproved || listingIsLive
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : reviewSubmissionComplete
        ? 'border-sky-200 bg-sky-50 text-sky-900'
        : combinedReviewEntryMeta.ready
          ? 'border-violet-200 bg-violet-50 text-violet-900'
          : 'border-amber-200 bg-amber-50 text-amber-900';
  const compactReviewNoteTitle = reviewSubmissionPending
    ? tr('Sending review', 'Envoi de la revue')
    : reviewSubmissionFailed
      ? tr('Review not sent', 'Revue non envoyée')
    : listingApproved || listingIsLive
      ? tr('Approved', 'Approuvée')
      : reviewSubmissionComplete
        ? tr('Submitted - no action needed', 'Envoyée - aucune action requise')
        : combinedReviewEntryMeta.ready
        ? tr('Ready to send', 'Prêt à envoyer')
          : tr('Next step', 'Étape suivante');
  const showReviewSendCta = canSendFullReview && !reviewSubmissionComplete;
  const reviewPublishStageModel = useMemo(() => {
    if (listingIsLive) {
      return {
        key: 'live',
        title: tr('Live on marketplace', 'En ligne sur la marketplace'),
        body: tr(
          'Your listing is already live. Review is complete and no further approval is needed.',
          "Votre annonce est déjà en ligne. La revue est terminée et aucune autre approbation n'est nécessaire."
        ),
        tone: 'border-emerald-200 bg-emerald-50',
        badge: tr('Live', 'En ligne'),
      };
    }

    if (listingApproved) {
      return {
        key: 'approved',
        title: tr('Approved for publication', 'Approuvé pour publication'),
        body: tr(
          'Admin approval is complete. The only step left is publishing the listing live.',
          "L'approbation admin est terminée. Il ne reste plus qu'à publier l'annonce."
        ),
        tone: 'border-emerald-200 bg-emerald-50',
        badge: tr('Approved for publication', 'Approuvé pour publication'),
      };
    }

    if (effectiveMarketplaceJourneyState === 'changes_requested') {
      return {
        key: 'changes_requested',
        title: tr('Needs owner updates', 'Modifications requises du propriétaire'),
        body: tr(
          'Admin sent listing feedback. Update the listing, then send the full review again.',
          "L'admin a envoyé un retour sur l'annonce. Mettez-la à jour, puis renvoyez la revue complète."
        ),
        tone: 'border-amber-200 bg-amber-50',
        badge: tr('Needs changes', 'Modifications requises'),
      };
    }

    if (reviewSubmissionComplete) {
      return {
        key: 'waiting_for_admin',
        title: tr('Waiting for admin', "En attente de l'admin"),
        body: tr(
          'Your full listing package is already with the review team. No action is needed from you right now.',
          "Le dossier complet de votre annonce est déjà chez l'équipe de revue. Aucune action n'est requise pour le moment."
        ),
        tone: 'border-sky-200 bg-sky-50',
        badge: tr('Waiting for admin', "En attente de l'admin"),
      };
    }

    if (canSendFullReview) {
      return {
        key: 'ready_for_review',
        title: tr('Ready to send for review', 'Prêt à envoyer en revue'),
        body: tr(
          'Everything required is ready. Send the full review once to start admin approval.',
          "Tout le nécessaire est prêt. Envoyez la revue complète une seule fois pour lancer l'approbation admin."
        ),
        tone: 'border-violet-200 bg-violet-50',
        badge: tr('Ready for review', 'Prêt pour revue'),
      };
    }

    return {
      key: 'not_submitted',
      title: tr('Finish the earlier setup steps', 'Terminez les étapes précédentes'),
      body: tr(
        'Complete owner verification, documents, pricing, and pickup first. This final launch step will unlock automatically.',
        "Terminez d'abord la vérification propriétaire, les documents, les prix et le retrait. Cette dernière étape se débloquera automatiquement."
      ),
      tone: 'border-slate-200 bg-slate-50',
      badge: tr('Not submitted', 'Pas encore envoyé'),
    };
  }, [
    canSendFullReview,
    effectiveMarketplaceJourneyState,
    listingApproved,
    listingIsLive,
    reviewSubmissionComplete,
    tr,
  ]);
  const reviewPublishQuietMode = ['waiting_for_admin', 'approved', 'live'].includes(reviewPublishStageModel.key);
  const reviewPublishQuietSummary = reviewPublishStageModel.key === 'live'
    ? tr(
        'Your listing is already live, so this review section stays tucked away unless you want to inspect the history.',
        "Votre annonce est déjà en ligne, donc cette section de revue reste discrète sauf si vous voulez consulter l'historique."
      )
    : reviewPublishStageModel.key === 'approved'
      ? tr(
          'Admin approval is complete. Keep this section calm and publish only when you are ready.',
          "L'approbation admin est terminée. Gardez cette section calme et publiez seulement quand vous êtes prêt."
        )
      : tr(
          'Your part is finished for now. Admin review is in progress, so the detailed checklist stays collapsed unless you need it.',
          "Votre part est terminée pour le moment. La revue admin est en cours, donc la checklist détaillée reste repliée sauf si vous en avez besoin."
        );
  const showReviewPublishDetailCards = !reviewPublishQuietMode || reviewPublishDetailsExpanded;
  const shouldCondenseReviewPublishChrome = reviewPublishQuietMode;
  useEffect(() => {
    setReviewPublishDetailsExpanded(!reviewPublishQuietMode);
  }, [reviewPublishQuietMode, vehicle?.listingId]);
  const ownerJourneyDisplay = canSendFullReview && !['pending_review', 'approved', 'live', 'changes_requested', 'rejected'].includes(effectiveMarketplaceJourneyState)
    ? {
        listingLabel: tr('Ready for review', 'Prêt pour revue'),
        reviewLabel: tr('Ready for review', 'Prêt pour revue'),
        tone: 'border-violet-200 bg-violet-50 text-violet-700',
      }
    : marketplaceJourneyMeta;
  const listingTone = ownerJourneyDisplay.tone;
  const listingLabel = ownerJourneyDisplay.listingLabel;
  const reviewLabel = ownerJourneyDisplay.reviewLabel;
  const listingSupportActionLabel =
    effectiveMarketplaceJourneyState === 'changes_requested'
      ? tr('View admin feedback', 'Voir le retour admin')
      : listingReviewThreadHasVisibleMessages
        ? tr('Open messages', 'Ouvrir les messages')
        : tr('Open approval Inbox', "Ouvrir l'Inbox d'approbation");
  const shouldShowDistinctReviewChip = String(reviewLabel).trim().toLowerCase() !== String(listingLabel).trim().toLowerCase();
  const completedMarketplaceChecklistCount = marketplaceChecklist.filter((item) => item.done).length;
  const nextMarketplaceChecklistItem = (() => {
    if (effectiveMarketplaceJourneyState === 'pending_review') {
      return null;
    }

    if (effectiveMarketplaceJourneyState === 'approved') {
      return marketplaceChecklist.find((item) => item.key === 'publish' && !item.done) || null;
    }

    return marketplaceChecklist.find((item) => !item.done) || null;
  })();
  const ownerWorkflowStepOne = ownerVerificationReady
    ? {
        statusKey: 'done',
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Verify owner', 'Vérifier le propriétaire'),
        body: '',
        actionLabel: tr('Open trust center', 'Ouvrir le centre de confiance'),
      }
    : ownerVerificationStatus === 'pending'
      ? {
          statusKey: 'waiting',
          statusLabel: tr('Waiting', 'En attente'),
          statusTone: 'bg-amber-100 text-amber-700',
          title: tr('Verify owner', 'Vérifier le propriétaire'),
          body: tr(
            'Your ID and driver license were sent to admin. Keep building the listing while we wait for approval. Full review will unlock automatically after that.',
            'Votre pièce et votre permis ont été envoyés à l’admin. Continuez l’annonce pendant l’attente. L’envoi complet en revue se débloquera ensuite automatiquement.'
          ),
          actionLabel: tr('Open trust center', 'Ouvrir le centre de confiance'),
        }
      : {
          statusKey: 'action',
          statusLabel: tr('Action required', 'Action requise'),
          statusTone: 'bg-violet-100 text-violet-700',
          title: tr('Verify owner', 'Vérifier le propriétaire'),
          body: tr(
            'Start with your profile ID and driver license. Listing setup can continue while admin reviews them, but the full review send waits for approval.',
            'Commencez par votre pièce d’identité et votre permis. La configuration de l’annonce peut continuer pendant la revue admin, mais l’envoi complet attend l’approbation.'
          ),
          actionLabel: tr('Open trust center', 'Ouvrir le centre de confiance'),
        };
  const vehicleBasicsComplete = Boolean(formData.brandName && formData.modelName && formData.plateNumber && formData.cityName);
  const ownerWorkflowStepTwo = vehicleBasicsComplete
    ? {
        statusKey: 'done',
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Complete vehicle basics', 'Compléter les bases du véhicule'),
        body: '',
        actionLabel: tr('Open vehicle basics', 'Ouvrir les bases du véhicule'),
      }
    : {
        statusKey: 'action',
        statusLabel: tr('Action required', 'Action requise'),
        statusTone: 'bg-violet-100 text-violet-700',
        title: tr('Complete vehicle basics', 'Compléter les bases du véhicule'),
        body: tr(
          'Add the vehicle brand, model, plate number, and city before moving deeper into the listing flow.',
          'Ajoutez la marque, le modèle, l’immatriculation et la ville avant de continuer le flux de l’annonce.'
        ),
        actionLabel: tr('Complete step 2', 'Compléter l’étape 2'),
      };
  const ownerWorkflowStepThree = vehicleLegalStepComplete
    ? {
        statusKey: 'done',
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Upload vehicle documents', 'Téléverser les documents du véhicule'),
        body: '',
        actionLabel: tr('Open documents', 'Ouvrir les documents'),
      }
    : vehicleLegalManualFallbackSubmitted
      ? {
          statusKey: 'waiting',
          statusLabel: tr('Request sent', 'Demande envoyée'),
          statusTone: 'bg-amber-100 text-amber-700',
          title: tr('Upload vehicle documents', 'Téléverser les documents du véhicule'),
          body: tr(
            'Your registration and insurance files were sent, but a few fields still need manual completion. Admin review is now pending.',
            'Vos fichiers d’immatriculation et d’assurance ont été envoyés, mais quelques champs demandent encore une saisie manuelle. La revue admin est maintenant en attente.'
          ),
          actionLabel: tr('Open documents', 'Ouvrir les documents'),
        }
      : vehicleVerificationWaitingOnAdmin || vehicleVerificationSubmitted
      ? {
          statusKey: 'waiting',
          statusLabel: tr('Waiting', 'En attente'),
          statusTone: 'bg-amber-100 text-amber-700',
          title: tr('Upload vehicle documents', 'Téléverser les documents du véhicule'),
          body: tr(
            'Your registration and insurance files are with admin. We are waiting for vehicle verification approval.',
            'Vos fichiers d’immatriculation et d’assurance sont chez l’admin. Nous attendons l’approbation de la vérification véhicule.'
          ),
          actionLabel: tr('Open documents', 'Ouvrir les documents'),
        }
      : {
          statusKey: 'action',
          statusLabel: tr('Action required', 'Action requise'),
          statusTone: 'bg-violet-100 text-violet-700',
          title: tr('Upload vehicle documents', 'Téléverser les documents du véhicule'),
          body: tr(
            'Upload the registration and insurance files. Once they are sent, admin review can start.',
            'Téléversez les fichiers d’immatriculation et d’assurance. Une fois envoyés, la revue admin peut commencer.'
        ),
        actionLabel: tr('Complete step 3', 'Compléter l’étape 3'),
      };
  const listingSetupComplete = Boolean(formData.listingTitle) && Boolean(hasListingPrice && hasDepositAmount) && vehiclePhotoRequirements.isComplete;
  const stepFourTargetItem =
    marketplaceChecklist.find((item) => item.key === 'listing_details' && !item.done) ||
    marketplaceChecklist.find((item) => item.key === 'listing_pricing' && !item.done) ||
    marketplaceChecklist.find((item) => item.key === 'listing_media' && !item.done) ||
    marketplaceChecklist.find((item) => item.key === 'listing_details') ||
    null;
  const ownerWorkflowStepFour = listingSetupComplete
    ? {
        statusKey: 'done',
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Prepare the listing', "Préparer l'annonce"),
        body: '',
        actionLabel: tr('Open listing setup', "Ouvrir la configuration de l'annonce"),
      }
    : {
        statusKey: 'action',
        statusLabel: tr('Action required', 'Action requise'),
        statusTone: 'bg-violet-100 text-violet-700',
        title: tr('Prepare the listing', "Préparer l'annonce"),
        body: tr(
          'Finish the listing title, set the price and deposit, and add the required vehicle photos.',
          'Terminez le titre de l’annonce, définissez le prix et la caution, puis ajoutez les photos requises du véhicule.'
        ),
        actionLabel: tr('Complete step 4', 'Compléter l’étape 4'),
      };
  const pickupSetupComplete = Boolean(formData.pickupLocationName);
  const ownerWorkflowStepFive = pickupSetupComplete
    ? {
        statusKey: 'done',
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Prepare pickup', 'Préparer le départ'),
        body: '',
        actionLabel: tr('Open pickup setup', 'Ouvrir la préparation du départ'),
      }
    : {
        statusKey: 'action',
        statusLabel: tr('Action required', 'Action requise'),
        statusTone: 'bg-violet-100 text-violet-700',
        title: tr('Prepare pickup', 'Préparer le départ'),
        body: tr(
          'Add the pickup location and handoff setup so renters know where the vehicle starts.',
          'Ajoutez le lieu de départ et l’organisation de remise pour que les locataires sachent où le véhicule commence.'
        ),
        actionLabel: tr('Complete step 5', 'Compléter l’étape 5'),
      };
  const ownerWorkflowStepSix = listingIsLive
    ? {
        statusKey: 'done',
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Review and go live', 'Revoir et publier'),
        body: '',
        actionLabel: tr('View live status', 'Voir le statut en ligne'),
        actionMode: 'journey',
      }
    : effectiveMarketplaceJourneyState === 'approved'
      ? {
          statusKey: 'action',
          statusLabel: tr('Action required', 'Action requise'),
          statusTone: 'bg-violet-100 text-violet-700',
          title: tr('Review and go live', 'Revoir et publier'),
          body: tr(
            'Admin approval is complete. The last step is publishing this listing live.',
            'L’approbation admin est terminée. La dernière étape consiste à publier cette annonce.'
          ),
          actionLabel: tr('Publish now', 'Publier maintenant'),
          actionMode: 'journey',
        }
      : effectiveMarketplaceJourneyState === 'changes_requested'
        ? {
            statusKey: 'issue',
            statusLabel: tr('Changes requested', 'Modifications demandées'),
            statusTone: 'bg-amber-100 text-amber-700',
            title: tr('Review feedback waiting', 'Retour de revue en attente'),
            body: tr(
              'Admin sent review feedback. Open support, update the listing, then send the review again.',
              "L'admin a envoyé un retour de revue. Ouvrez le support, mettez l'annonce à jour, puis renvoyez la revue."
            ),
            actionLabel: tr('Open support', 'Ouvrir le support'),
            actionMode: 'messages',
          }
      : effectiveMarketplaceJourneyState === 'pending_review'
        ? {
            statusKey: 'waiting',
            statusLabel: tr('Waiting', 'En attente'),
            statusTone: 'bg-amber-100 text-amber-700',
            title: tr('Review and go live', 'Revoir et publier'),
            body: tr(
              'Your full package is already with admin. Open support anytime if you need help while the team reviews it.',
              "Votre dossier complet est déjà chez l’admin. Ouvrez le support à tout moment si vous avez besoin d'aide pendant la revue."
            ),
            actionLabel: tr('Open support', 'Ouvrir le support'),
            actionMode: 'messages',
          }
        : canSendFullReview
          ? {
              statusKey: 'action',
              statusLabel: tr('Action required', 'Action requise'),
              statusTone: 'bg-violet-100 text-violet-700',
              title: tr('Review and go live', 'Revoir et publier'),
              body: tr(
                'Everything is ready. Send the full package for review to unlock go-live approval.',
                'Tout est prêt. Envoyez le dossier complet en revue pour débloquer l’approbation de publication.'
              ),
              actionLabel: tr('Send full review', 'Envoyer la revue complète'),
              actionMode: 'submit-review',
            }
          : {
              statusKey: 'locked',
              statusLabel: tr('Locked', 'Verrouillé'),
              statusTone: 'bg-slate-100 text-slate-600',
              title: tr('Review and go live', 'Revoir et publier'),
              body: tr(
                'Finish the earlier setup steps first. Once they are done, this final launch step will unlock.',
                'Terminez d’abord les étapes précédentes. Une fois faites, cette dernière étape de lancement se débloquera.'
              ),
              actionLabel: tr('View launch step', 'Voir l’étape finale'),
              actionMode: 'journey',
            };
  const ownerListingSetupProgress = buildOwnerListingSetupProgress({
    tr,
    vehicleId: vehicle?.id || vehicleId || '',
    currentPath,
    ownerVerificationReady,
    ownerVerificationPending: ownerVerificationStatus === 'pending',
    ownerVerificationIssue: ['rejected', 'suspended', 'expired'].includes(ownerVerificationStatus),
    vehicleHasDraft: hasStartedDraft,
    vehicleBasicsComplete,
    vehiclePhotosComplete: vehiclePhotoRequirements.isComplete,
    vehicleDocumentsComplete: vehicleLegalStepComplete,
    vehicleDocumentsPending: vehicleLegalManualFallbackSubmitted || vehicleVerificationWaitingOnAdmin || vehicleVerificationStatus === 'pending',
    vehicleDocumentsIssue: ['rejected', 'suspended', 'expired'].includes(vehicleVerificationStatus),
    listingDetailsComplete: Boolean(formData.listingTitle),
    listingPricingComplete: Boolean(hasListingPrice && hasDepositAmount),
    pickupSetupComplete,
    listingReviewSubmitted: effectiveMarketplaceJourneyState === 'pending_review',
    listingApproved: effectiveMarketplaceJourneyState === 'approved',
    listingLive: listingIsLive,
    listingIssue: ['changes_requested', 'rejected'].includes(effectiveMarketplaceJourneyState),
    canSendFullReview,
  });
  const latestSectionSavedAt = useMemo(() => {
    const entries = Object.values(sectionSaveMeta || {});
    if (!entries.length) return 0;
    return entries.reduce((latest, entry) => Math.max(latest, Number(entry?.savedAt || 0) || 0), 0);
  }, [sectionSaveMeta]);
  const footerLatestSavedAt = Math.max(Number(lastProfileSaveAt || 0) || 0, Number(latestSectionSavedAt || 0) || 0);
  const footerPrimaryBusy = publishListingPending || (submitting && ownerListingSetupProgress.currentStep?.actionMode === 'submit-review');
  const footerGuideStatusLabel = useMemo(() => {
    if (publishListingPending) {
      return tr('Publishing your listing now…', 'Publication de votre annonce…');
    }
    if (submitting && ownerListingSetupProgress.currentStep?.actionMode === 'submit-review') {
      return tr('Sending the full review now…', 'Envoi de la revue complète…');
    }
    if (saving) {
      return tr('Saving your latest changes…', 'Enregistrement de vos dernières modifications…');
    }
    if (footerLatestSavedAt > 0) {
      return tr('Saved just now', 'Enregistré à l’instant');
    }
    if (isEditingVehicle) {
      return tr(
        'Keep going step by step. Manual save is only there if you want a backup now.',
        'Continuez étape par étape. La sauvegarde manuelle sert seulement si vous voulez une sauvegarde immédiate.'
      );
    }
    return tr('Use the next step button to keep moving forward.', "Utilisez le bouton d'étape suivante pour continuer.");
  }, [
    footerLatestSavedAt,
    isEditingVehicle,
    ownerListingSetupProgress.currentStep?.actionMode,
    publishListingPending,
    saving,
    submitting,
    tr,
  ]);
  const ownerWorkflowMilestones = [
    {
      key: 'owner_verification',
      stepNumber: 1,
      checklistKeys: ['owner_verification'],
      primaryTask: marketplaceChecklist.find((item) => item.key === 'owner_verification') || null,
      ...ownerWorkflowStepOne,
    },
    {
      key: 'vehicle_profile',
      stepNumber: 2,
      checklistKeys: ['vehicle_profile'],
      primaryTask: marketplaceChecklist.find((item) => item.key === 'vehicle_profile') || null,
      ...ownerWorkflowStepTwo,
    },
    {
      key: 'vehicle_documents',
      stepNumber: 3,
      checklistKeys: ['vehicle_documents', 'verification'],
      primaryTask: marketplaceChecklist.find((item) => item.key === 'vehicle_documents') || null,
      ...ownerWorkflowStepThree,
    },
    {
      key: 'listing_setup',
      stepNumber: 4,
      checklistKeys: ['listing_details', 'listing_pricing', 'listing_media'],
      primaryTask: stepFourTargetItem,
      ...ownerWorkflowStepFour,
    },
    {
      key: 'pickup_setup',
      stepNumber: 5,
      checklistKeys: ['renter_setup'],
      primaryTask: marketplaceChecklist.find((item) => item.key === 'renter_setup') || null,
      ...ownerWorkflowStepFive,
    },
    {
      key: 'review_publish',
      stepNumber: 6,
      checklistKeys: ['listing_review', 'publish'],
      primaryTask:
        marketplaceChecklist.find((item) => item.key === 'listing_review' && !item.done) ||
        marketplaceChecklist.find((item) => item.key === 'publish' && !item.done) ||
        marketplaceChecklist.find((item) => item.key === 'listing_review') ||
        marketplaceChecklist.find((item) => item.key === 'publish') ||
        null,
      ...ownerWorkflowStepSix,
    },
  ];
  const completedOwnerWorkflowMilestones = ownerWorkflowMilestones.filter((item) => item.statusKey === 'done').length;
  const currentOwnerWorkflowMilestone =
    ownerWorkflowMilestones.find((item) => item.statusKey !== 'done') ||
    ownerWorkflowMilestones[ownerWorkflowMilestones.length - 1] ||
    null;
  const ownerWorkflowProgressPercent = ownerWorkflowMilestones.length
    ? Math.round((completedOwnerWorkflowMilestones / ownerWorkflowMilestones.length) * 100)
    : 0;
  const ownerWorkflowVisualProgressPercent = completedOwnerWorkflowMilestones === 0
    ? 8
    : Math.max(ownerWorkflowProgressPercent, 8);
  const currentOwnerWorkflowChecklist = currentOwnerWorkflowMilestone
    ? marketplaceChecklist.filter((item) => currentOwnerWorkflowMilestone.checklistKeys.includes(item.key))
    : [];
  const handleOwnerWorkflowMilestoneAction = (milestone = currentOwnerWorkflowMilestone) => {
    if (!milestone) return;

    if (milestone.key === 'review_publish') {
      if (listingApproved && !listingIsLive) {
        void handlePublishApprovedListing();
        return;
      }
      if (milestone.actionMode === 'submit-review') {
        void persistVehicle(true);
        return;
      }
      if (milestone.actionMode === 'messages') {
        handleOpenReviewThread();
        return;
      }
    }

    openMarketplaceChecklistTask(milestone.primaryTask);
  };
  const navigateWithinVehicleProfile = (target = {}) => {
    const targetPath = String(target?.to || '').trim();
    if (!targetPath.startsWith('/account/vehicles/')) {
      return false;
    }

    const targetState = target?.state && typeof target.state === 'object' ? target.state : {};
    const currentUrl = `${location.pathname}${location.search || ''}`;

    if (currentUrl !== targetPath) {
      navigate(targetPath, {
        state: {
          ...location.state,
          ...targetState,
        },
      });
      return true;
    }

    try {
      const targetUrl = new URL(targetPath, window.location.origin);
      const targetTab = targetUrl.searchParams.get('tab') || '';
      if (['overview', 'listing', 'bookings', 'finance', 'legal'].includes(targetTab)) {
        setActiveTab(targetTab);
      }
    } catch {
      // If URL parsing fails, fall back to focus behavior below.
    }

    const targetSection = String(targetState.focusSectionId || '').trim();
    if (targetSection) {
      setFocusedSectionId('');
      window.setTimeout(() => {
        setFocusedSectionId(targetSection);
      }, 0);
    }
    return true;
  };
  const openMarketplaceChecklistTask = (item) => {
    if (!item) return;
    if (item.route) {
      if (item.route === '/account/verification') {
        trackAccountJourneyEvent(ACCOUNT_JOURNEY_EVENTS.trustCenterOpened, {
          source: 'listing_checklist',
          route: item.route,
          vehicleId: vehicle?.id || vehicleId || '',
          listingId: vehicle?.listingId || '',
          checklistKey: item.key,
        });
      }
      const currentPath = getCurrentLocationPath(location);
      const ownerListingReturnPath =
        currentPath.includes('?tab=')
          ? currentPath.replace(/\?tab=[^&#]*/i, '?tab=listing')
          : `${location.pathname}?tab=listing`;
      navigate(item.route, {
        state: {
          from: ownerListingReturnPath,
        },
      });
      return;
    }

    const target = {
      to: item.tab ? `${location.pathname}?tab=${encodeURIComponent(item.tab)}` : '',
      state: {
        from: getCurrentLocationPath(location),
        resumeEditing: true,
        focusSectionId: item.section || '',
      },
    };

    if (navigateWithinVehicleProfile(target)) {
      return;
    }

    setActiveTab(item.tab);
    setFocusedSectionId(item.section || '');
  };
  const handleOpenReviewThread = () => {
    if (!vehicle?.listingId) return;
    setReviewThreadOpenSignal((current) => current + 1);
  };
  const handleSubmitFullReview = async () => {
    setReviewSubmissionPending(true);
    setReviewSubmissionSent(false);
    setReviewSubmissionNotice(
      tr(
        'Sending review to admin now.',
        "Envoi de la revue à l'admin."
      )
    );

    const result = await persistVehicle(
      true,
      false,
      null,
      tr(
        'Full review sent. Admin approval is now pending.',
        "La revue complète a été envoyée. L’approbation admin est maintenant en attente."
      ),
      { source: 'listing_review_submission_gate' }
    );

    if (result?.success) {
      setReviewSubmissionSent(true);
      setReviewSubmissionNotice(
        tr(
          'Review sent. Admin approval is now pending.',
          "Revue envoyée. L’approbation admin est maintenant en attente."
        )
      );
    } else {
      setReviewSubmissionSent(false);
      setReviewSubmissionNotice(
        tr(
          'We could not send the review yet. Please check the error above and try again.',
          "Nous n’avons pas encore pu envoyer la revue. Vérifiez l’erreur ci-dessus puis réessayez."
        )
      );
    }

    setReviewSubmissionPending(false);
  };
  const handleOwnerListingSetupStepAction = (step) => {
    if (!step) return false;
    if (step.key === 'review_publish') {
      if (listingApproved && !listingIsLive) {
        void handlePublishApprovedListing();
        return true;
      }
      return navigateWithinVehicleProfile(step.target || {});
    }
    if (step.actionMode === 'submit-review') {
      void persistVehicle(true);
      return true;
    }
    return navigateWithinVehicleProfile(step.target || {});
  };

  useEffect(() => {
    if (tabs.some((tab) => tab.key === activeTab)) {
      return;
    }
    setActiveTab('overview');
  }, [activeTab, tabs]);

  useEffect(() => {
    if (effectiveMarketplaceJourneyState !== 'live') {
      return;
    }

    const listingIdentity = String(vehicle?.listingId || vehicle?.id || vehicleId || 'live-listing').trim();
    trackAccountJourneyEventOnce(
      ACCOUNT_JOURNEY_EVENTS.listingWentLive,
      `listing-live:${listingIdentity}`,
      {
        source: 'listing_profile',
        vehicleId: vehicle?.id || vehicleId || '',
        listingId: vehicle?.listingId || '',
      }
    );
  }, [effectiveMarketplaceJourneyState, vehicle?.id, vehicle?.listingId, vehicleId]);

  useEffect(() => {
    if (listingReviewSubmitted && !listingApproved && !listingIsLive) {
      setReviewSubmissionPending(false);
      setReviewSubmissionSent(true);
      setReviewSubmissionNotice(
        tr(
          'Review sent. Admin approval is now pending.',
          "Revue envoyée. L’approbation admin est maintenant en attente."
        )
      );
      return;
    }

    if (listingApproved || listingIsLive) {
      setReviewSubmissionPending(false);
      setReviewSubmissionSent(false);
      setReviewSubmissionNotice('');
    }
  }, [isFrench, listingApproved, listingIsLive, listingReviewSubmitted]);

  const canRenderOperationsFastShell = isOperationsWorkspaceRoute && Boolean(routeOwnerOperationRequest?.id);

  if (loading && suppressBlockingLoader && !canRenderOperationsFastShell) {
    return <AccountWorkspaceLoadingShell cardCount={1} showStatsRow={false} showHeader={true} />;
  }

  if (loading && !suppressBlockingLoader && !canRenderOperationsFastShell) {
    return (
      <div className="space-y-4">
        <div className={`h-40 animate-pulse ${workspacePanelClass}`} />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={`h-32 animate-pulse ${workspacePanelClass}`} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${workspacePanelClass} border-rose-200 text-sm text-rose-700`}>
        {error}
      </div>
    );
  }

  const workspaceHeaderClassName = isOperationsWorkspaceRoute
    ? 'sticky top-0 z-30 rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-0'
    : `sticky top-0 z-30 ${workspaceShellClass}`;

  return (
    <div className="space-y-5 pb-48 sm:pb-52">
      <div className={workspaceHeaderClassName}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => navigate(backLink)}
              className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              title={location.state?.from ? tr('Back', 'Retour') : tr('Back to listings', 'Retour aux annonces')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className={workspaceEyebrowClass}>
                {isOperationsWorkspaceRoute
                  ? tr('Rental operations', 'Opérations de location')
                  : tr('Listing workspace', "Espace d'annonce")}
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
                {isOperationsWorkspaceRoute
                  ? (operationalRequestExecutionAction?.title || tr('Rental execution', 'Exécution de location'))
                  : (formData.plateNumber || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Vehicle profile', 'Profil véhicule'))}
              </h1>
              {isOperationsWorkspaceRoute ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                      {operationalRequest?.customerName || tr('Renter', 'Locataire')}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      {operationalRequest?.listingTitle || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Vehicle', 'Véhicule')}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${listingTone}`}>
                      {ownerExecutionSummary.badge}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {operationalRequest?.requestedStartAt ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                        <CalendarClock className="h-3.5 w-3.5 text-violet-500" />
                        {formatDateTime(operationalRequest.requestedStartAt, isFrench ? 'fr' : 'en')}
                      </span>
                    ) : null}
                    {operationalRequest?.requestedEndAt ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                        {formatDateTime(operationalRequest.requestedEndAt, isFrench ? 'fr' : 'en')}
                      </span>
                    ) : null}
                    {operationalRequest?.customerEmail || operationalRequest?.customerPhone ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                        <MessageSquareText className="h-3.5 w-3.5 text-slate-500" />
                        {operationalRequest?.customerEmail || operationalRequest?.customerPhone}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-blue-900">
                      {formData.brandName || tr('Vehicle', 'Véhicule')}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      vehicleVerificationReady
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}>
                      {vehicleVerificationReady ? tr('vehicle verified', 'véhicule vérifié') : tr('verification required', 'vérification requise')}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${listingTone}`}>
                          {listingLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {formData.modelName || tr('Model not set', 'Modèle non défini')}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      <MapPin className="h-3.5 w-3.5 text-slate-500" />
                      {[formData.cityName, formData.areaName].filter(Boolean).join(' • ') || tr('Location not set', 'Emplacement non défini')}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
                      <FileText className="h-3.5 w-3.5 text-violet-500" />
                      {vehicleDocuments.length} {tr('docs', 'docs')}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                      insuranceExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {insuranceExpired ? tr('Insurance expired', 'Assurance expirée') : tr('Insurance OK', 'Assurance OK')}
                      {hasValidInsuranceExpiry ? ` • ${formData.insuranceExpiryDate}` : ''}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                      ownerProfileAlerts.length > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {ownerProfileAlerts.length} {tr('alerts', 'alertes')}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {vehicle?.listingId && listingIsLive && !isOperationsWorkspaceRoute ? (
              <a
                href={`/marketplace/marketplace-${encodeURIComponent(String(vehicle.listingId))}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ExternalLink className="w-4 h-4" />
                {tr('View public listing', 'Voir la fiche publique')}
              </a>
            ) : null}
            {isOperationsWorkspaceRoute ? (
              <>
                <Link
                  to={operationalRequest?.id ? `/account/messages?requestId=${encodeURIComponent(String(operationalRequest.id))}` : '/account/messages'}
                  state={{ from: currentPath }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01]"
                >
                  <MessageSquareText className="w-4 h-4" />
                  {tr('Open Inbox', 'Ouvrir Inbox')}
                </Link>
              </>
            ) : isEditingVehicle ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveVehicle()}
                  disabled={saving || submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {tr('OK', "OK")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStartEditing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01]"
                >
                  <Edit className="w-4 h-4" />
                  {tr('Edit vehicle', 'Modifier le véhicule')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-50"
                  title={tr('More actions', 'Plus d’actions')}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!isOperationsWorkspaceRoute && !shouldCondenseReviewPublishChrome ? (
        <OwnerListingSetupGuide
          progress={ownerListingSetupProgress}
          tr={tr}
          variant="compact"
          className="sticky top-[112px] z-20"
          onStepAction={handleOwnerListingSetupStepAction}
        />
      ) : null}

      {saveError ? (
        <section className={`${workspacePanelClass} border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{saveError}</span>
          </div>
        </section>
      ) : null}

      {saveSuccess ? (
        <section className={`${workspacePanelClass} border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700`}>
          {saveSuccess}
        </section>
      ) : null}

      {!isOperationsWorkspaceRoute ? (
        <div className="sticky top-[198px] z-20 -mx-3 overflow-x-auto px-3 py-2 sm:top-[190px] sm:mx-0">
          <div className={`${workspaceShellClass} flex min-w-max gap-2 p-2`}>
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)]'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-white hover:text-violet-700'
                  }`}
                >
                  <TabIcon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {effectiveActiveTab === 'overview' ? (
        <>
          {operationalRequestExecutionAction ? (
            <SectionCard
              title={tr('Rental operations moved', 'Opérations de location déplacées')}
              description={tr(
                'Vehicle edit now stays focused on listing setup. Use Home as the main place to launch ready-to-start and ready-to-finish rental operations.',
                "L'édition véhicule reste maintenant centrée sur la mise en ligne. Utilisez l'accueil comme surface principale pour lancer les opérations prêtes à démarrer et prêtes à terminer."
              )}
              icon={CalendarClock}
            >
              <div
                id="owner-operations-moved"
                className={`rounded-[1.5rem] border border-violet-200 bg-[linear-gradient(135deg,rgba(245,243,255,0.95)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-[0_16px_34px_rgba(91,33,182,0.08)] ${getFocusedSectionClass(focusedSectionId, 'owner-operations-moved')}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
                      {tr('Primary entry point', "Point d'entrée principal")}
                    </p>
                    <h3 className="mt-2 text-lg font-black text-slate-950">
                      {operationalRequestExecutionAction.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {operationalRequestExecutionAction.detail}
                    </p>
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      {tr(
                        'Open this from Home first. Vehicle edit should stay calm and focused on listing work.',
                        "Ouvrez ceci d'abord depuis l'accueil. L'édition véhicule doit rester calme et concentrée sur le travail de mise en ligne."
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      to="/account/overview"
                      state={{ from: currentPath }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
                    >
                      <CalendarClock className="h-4 w-4" />
                      {tr('Open Home dashboard', "Ouvrir l'accueil")}
                    </Link>
                    <Link
                      to={operationalRequestExecutionAction.href}
                      state={{ from: currentPath }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {operationalRequestExecutionAction.ctaLabel}
                    </Link>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title={tr('Vehicle setup', 'Configuration du véhicule')}
            description={tr('Core vehicle identity, photos, and setup status for this listing.', "Identité du véhicule, photos et état d'avancement de cette annonce.")}
            icon={Car}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
              <div className="aspect-square overflow-hidden rounded-2xl border border-violet-100 bg-white">
                {coverImage ? (
                  <img src={coverImage} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <Car className="w-16 h-16" />
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{tr('Plate Number', "Numéro d'immatriculation")}</p>
                    <div className="mt-2 inline-flex items-center rounded-3xl border border-blue-300 bg-gradient-to-r from-blue-50 to-sky-100 px-5 py-3 text-2xl font-black tracking-[0.3em] text-blue-950 shadow-sm ring-1 ring-blue-100">
                      {formData.plateNumber || tr('NOT SET', 'NON DÉFINI')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${listingTone}`}>
                      {listingLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-700">
                      {formData.categoryCode || tr('Vehicle', 'Véhicule')}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                  <p className="text-lg font-bold text-slate-900">{[formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Vehicle', 'Véhicule')}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                      {formData.modelName || tr('Model not set', 'Modèle non défini')}
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                      {formData.categoryCode || tr('Vehicle', 'Véhicule')}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={workspaceMetricCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Current Location', 'Emplacement actuel')}</p>
                    <div className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                      <MapPin className="h-4 w-4 text-violet-500" />
                      <span>{[formData.cityName, formData.areaName].filter(Boolean).join(' • ') || tr('Not set', 'Non défini')}</span>
                    </div>
                  </div>
                  <div className={workspaceMetricCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Model', 'Modèle')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{formData.modelName || tr('Not set', 'Non défini')}</p>
                  </div>
                  <div className={workspaceMetricCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Current Odometer', 'Kilométrage actuel')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{formData.currentOdometer ? `${formData.currentOdometer} km` : tr('Not set', 'Non défini')}</p>
                  </div>
                  <div className={workspaceMetricCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Engine Hours', 'Heures moteur')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{formData.engineHours ? `${formData.engineHours} h` : tr('Not set', 'Non défini')}</p>
                  </div>
                  <div className={workspaceMetricCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Document Count', 'Nombre de documents')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{vehicleDocuments.length}</p>
                  </div>
                </div>
                <div className={workspaceMetricCardClass}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Fleet Alerts', 'Alertes flotte')}</p>
                  {ownerProfileAlerts.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">{tr('No active oil change or document expiry alerts.', 'Aucune alerte active de vidange ou d’expiration de document.')}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {ownerProfileAlerts.map((alert) => (
                          <span key={alert.id} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{alert.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div id="vehicle-basics" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'vehicle-basics')}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Step 1 of 6', 'Étape 1 sur 6')}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Vehicle basics', 'Bases du véhicule')}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {tr(
                  'Keep this section focused on the vehicle itself: identity, location, and core specs.',
                  'Gardez cette section centrée sur le véhicule lui-même : identité, emplacement et caractéristiques principales.'
                )}
              </p>
              {isEditingVehicle ? (
                <>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <OwnerField label={tr('Brand', 'Marque')}>
                      <input value={formData.brandName} onChange={(event) => updateField('brandName', event.target.value)} className={baseFieldClassName} />
                      {fieldErrors.brandName ? <p className="mt-2 text-xs font-semibold text-rose-600">{fieldErrors.brandName}</p> : null}
                    </OwnerField>
                    <OwnerField label={tr('Model', 'Modèle')}>
                      <input value={formData.modelName} onChange={(event) => updateField('modelName', event.target.value)} className={baseFieldClassName} />
                      {fieldErrors.modelName ? <p className="mt-2 text-xs font-semibold text-rose-600">{fieldErrors.modelName}</p> : null}
                    </OwnerField>
                    <OwnerField label={tr('Vehicle type', 'Type de véhicule')}>
                      <select value={formData.categoryCode} onChange={(event) => updateField('categoryCode', event.target.value)} className={baseFieldClassName}>
                        {VEHICLE_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </OwnerField>
                    <OwnerField label={tr('Year', 'Année')}>
                      <input value={formData.year} onChange={(event) => updateField('year', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Plate number', 'Immatriculation')}>
                      <input value={formData.plateNumber} onChange={(event) => updateField('plateNumber', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('City', 'Ville')}>
                      <input value={formData.cityName} onChange={(event) => updateField('cityName', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Area', 'Zone')}>
                      <input value={formData.areaName} onChange={(event) => updateField('areaName', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Capacity', 'Capacité')}>
                      <input type="number" value={formData.seats} onChange={(event) => updateField('seats', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Engine size (cc)', 'Cylindrée (cc)')}>
                      <input type="number" value={formData.engineCc} onChange={(event) => updateField('engineCc', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Color', 'Couleur')}>
                      <input value={formData.color} onChange={(event) => updateField('color', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <OwnerField label={tr('Current odometer reading', 'Kilométrage actuel')}>
                      <input type="number" value={formData.currentOdometer} onChange={(event) => updateField('currentOdometer', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Engine hours', 'Heures moteur')}>
                      <input type="number" value={formData.engineHours} onChange={(event) => updateField('engineHours', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                  </div>
                </>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <ViewField label={tr('Brand', 'Marque')} value={formData.brandName} />
                  <ViewField label={tr('Model', 'Modèle')} value={formData.modelName} />
                  <ViewField label={tr('Vehicle type', 'Type de véhicule')} value={formData.categoryCode} />
                  <ViewField label={tr('Year', 'Année')} value={formData.year} />
                  <ViewField label={tr('Plate number', 'Immatriculation')} value={formData.plateNumber} />
                  <ViewField label={tr('City', 'Ville')} value={formData.cityName} />
                  <ViewField label={tr('Area', 'Zone')} value={formData.areaName} />
                  <ViewField label={tr('Capacity', 'Capacité')} value={formData.seats} />
                  <ViewField label={tr('Engine size (cc)', 'Cylindrée (cc)')} value={formData.engineCc ? `${formData.engineCc} cc` : '—'} />
                  <ViewField label={tr('Color', 'Couleur')} value={formData.color} />
                  <ViewField label={tr('Current odometer reading', 'Kilométrage actuel')} value={formData.currentOdometer ? `${formData.currentOdometer} km` : '—'} />
                  <ViewField label={tr('Engine hours', 'Heures moteur')} value={formData.engineHours ? `${formData.engineHours} h` : '—'} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <section id="operations-snapshot" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'operations-snapshot')}`}>
                <h2 className="text-xl font-bold text-slate-950">{tr('Quick status', 'Statut rapide')}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {tr(
                    'This panel stays asset-focused. Pricing, public copy, and pickup live in Pricing & publish.',
                    'Ce panneau reste centré sur le véhicule. Les prix, le texte public et le retrait se trouvent dans Prix & publication.'
                  )}
                </p>
                <div className="mt-5 space-y-3">
                  <InfoRow label={tr('Linked fleet record', 'Fiche flotte liée')} value={linkedFleetVehicleId ? `#${linkedFleetVehicleId}` : tr('Created after first save', 'Créée après le premier enregistrement')} />
                  <InfoRow label={tr('Current fuel level', 'Niveau de carburant actuel')} value={linkedFleetVehicleId ? `${vehicleFuelState?.current_fuel_lines ?? 0}/8` : '—'} />
                  <InfoRow
                    label={tr('Listing status', "Statut de l'annonce")}
                    value={listingLabel}
                  />
                  <InfoRow
                    label={tr('Photo status', 'Statut photos')}
                    value={
                      vehiclePhotoRequirements.isComplete
                        ? tr('Required photos ready', 'Photos requises prêtes')
                        : tr(
                            `Missing: ${vehiclePhotoRequirements.missingTypes.join(', ')}`,
                            `Manquantes : ${vehiclePhotoRequirements.missingTypes.join(', ')}`
                          )
                    }
                  />
                  <InfoRow
                    label={tr('Owner trust', 'Confiance propriétaire')}
                    value={
                      ownerVerificationReady
                        ? tr('Approved', 'Approuvée')
                        : ownerVerificationStatus === 'pending'
                          ? tr('Under review', 'En revue')
                          : tr('Needed', 'Requise')
                    }
                  />
                  <InfoRow
                    label={tr('Vehicle documents', 'Documents véhicule')}
                    value={
                      vehicleVerificationReady
                        ? tr('Approved', 'Approuvés')
                        : vehicleLegalStepComplete || vehicleVerificationWaitingOnAdmin
                          ? tr('Submitted', 'Envoyés')
                          : tr('Needed', 'Requis')
                    }
                  />
                </div>
              </section>

              <section id="primary-photo" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'primary-photo')}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Step 2 of 6', 'Étape 2 sur 6')}</p>
                    <h2 className="text-xl font-bold text-slate-950">{tr('Vehicle photos', 'Photos du véhicule')}</h2>
                    <p className="mt-2 text-sm text-slate-600">
                      {tr('Upload the required hero, context, and detail shots here.', 'Téléversez ici les photos requises : principale, contexte et détail.')}
                    </p>
                  </div>
                  {!isEditingVehicle ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleStartEditing();
                        setFocusedSectionId('primary-photo');
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                    >
                      {normalizedMedia.length > 0
                        ? tr('Manage photos', 'Gérer les photos')
                        : tr('Add photos', 'Ajouter des photos')}
                    </button>
                  ) : null}
                </div>
                {isEditingVehicle ? (
                  <>
                    <div className="mt-4">
                      <VehicleImageUpload
                        vehicleId={draftUploadVehicleId}
                        currentImages={normalizedMedia}
                        onImagesChange={handleVehicleMediaChange}
                      />
                    </div>
                    {fieldErrors.media ? <p className="mt-3 text-xs font-semibold text-rose-600">{fieldErrors.media}</p> : null}
                    {!vehiclePhotoRequirements.isComplete ? (
                      <p className="mt-3 text-xs font-semibold text-amber-600">
                        {tr(
                          `Missing required photos: ${vehiclePhotoRequirements.missingTypes.join(', ')}`,
                          `Photos requises manquantes : ${vehiclePhotoRequirements.missingTypes.join(', ')}`
                        )}
                      </p>
                    ) : null}
                  </>
                ) : normalizedMedia.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {normalizedMedia.map((item) => (
                      <div key={item.id || item.url} className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50">
                        <img src={item.url} alt="" className="aspect-[4/3] w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    {tr('No vehicle photos uploaded yet.', 'Aucune photo du véhicule n’a encore été téléversée.')}
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      ) : null}

      {effectiveActiveTab === 'listing' ? (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <section id="listing-details" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'listing-details')}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Step 4 of 6', 'Étape 4 sur 6')}</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Pricing and listing details', "Tarification et détails de l'annonce")}</h2>
                    <p className="mt-2 text-sm text-slate-600">
                      {tr(
                        'Set the price first, then refine what renters will read on the public listing.',
                        "Définissez d'abord le prix, puis affinez ce que les locataires liront sur l'annonce publique."
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${listingTone}`}>
                      {listingLabel}
                    </span>
                  </div>
                </div>
                {isEditingVehicle ? (
                  <>
                    <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Pricing', 'Tarification')}</p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Rates and deposit', 'Tarifs et caution')}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {tr(
                          'Daily rate, deposit, and distance rules. This is the main pricing area renters depend on.',
                          'Tarif journalier, caution et règles kilométriques. C’est la zone tarifaire principale sur laquelle les locataires se basent.'
                        )}
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <OwnerField label={tr('Daily price', 'Prix journalier')}>
                          <input value={formData.dailyPriceAmount} onChange={(event) => updateField('dailyPriceAmount', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <OwnerField label={tr('Deposit', 'Caution')}>
                          <input value={formData.depositAmount} onChange={(event) => updateField('depositAmount', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <OwnerField label={tr('Half-day package price', 'Prix du forfait demi-journée')}>
                          <input value={formData.halfDayPriceAmount} onChange={(event) => updateField('halfDayPriceAmount', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <OwnerField label={tr('Included kilometers', 'Kilomètres inclus')}>
                          <input value={formData.mileageLimitKm} onChange={(event) => updateField('mileageLimitKm', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <OwnerField label={tr('Half-day minimum hours', 'Heures minimum demi-journée')}>
                          <input type="number" min="1" value={formData.halfDayMinHours} onChange={(event) => updateField('halfDayMinHours', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <OwnerField label={tr('Extra kilometer rate', 'Tarif kilomètre supplémentaire')}>
                          <input value={formData.extraKmRate} onChange={(event) => updateField('extraKmRate', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <OwnerField label={tr('Half-day maximum hours', 'Heures maximum demi-journée')}>
                          <input type="number" min="1" value={formData.halfDayMaxHours} onChange={(event) => updateField('halfDayMaxHours', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Daily guide', 'Guide journalier')}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {tr('Recommended', 'Recommandé')}: {pricingGuide.daily.recommendedMin}-{pricingGuide.daily.recommendedMax} MAD
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-600">
                            {tr('Allowed range', 'Plage autorisée')}: {pricingGuide.daily.allowedMin}-{pricingGuide.daily.allowedMax} MAD
                          </p>
                        </div>
                        <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Half-day guide', 'Guide demi-journée')}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {tr('Recommended', 'Recommandé')}: {pricingGuide.halfDay.recommendedMin}-{pricingGuide.halfDay.recommendedMax} MAD
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-600">
                            {tr('Allowed range', 'Plage autorisée')}: {pricingGuide.halfDay.allowedMin}-{pricingGuide.halfDay.allowedMax} MAD
                          </p>
                          <p className="mt-2 text-xs font-semibold text-slate-700">
                            {tr('Best owner flow: treat half-day as a 4-5 hour package.', 'Meilleur flux propriétaire : traitez la demi-journée comme un forfait de 4 à 5 heures.')}
                          </p>
                        </div>
                      </div>
                      <OwnerSectionSaveAction
                        label={tr('Save pricing', 'Enregistrer les prix')}
                        savedLabel={getSectionSavedLabel('pricing')}
                        saving={saving}
                        disabled={submitting}
                        onSave={() => void handleSaveVehicleSection('pricing', 'listing_pricing_save')}
                      />
                    </div>
                    <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('What renters will read', 'Ce que les locataires verront')}</p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Public listing copy', "Texte public de l'annonce")}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {tr(
                          'Name the listing clearly, then add the short and detailed description.',
                          "Donnez un titre clair à l'annonce, puis ajoutez le résumé et la description détaillée."
                        )}
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <OwnerField label={tr('Listing title', 'Titre de l’annonce')}>
                          <input value={formData.listingTitle} onChange={(event) => updateField('listingTitle', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <div className="hidden sm:block" />
                        <OwnerField label={tr('Short summary', 'Résumé court')}>
                          <textarea value={formData.shortDescription} onChange={(event) => updateField('shortDescription', event.target.value)} className={`${baseFieldClassName} min-h-[96px] resize-y`} />
                        </OwnerField>
                        <OwnerField label={tr('Detailed description', 'Description détaillée')}>
                          <textarea value={formData.fullDescription} onChange={(event) => updateField('fullDescription', event.target.value)} className={`${baseFieldClassName} min-h-[144px] resize-y`} />
                        </OwnerField>
                      </div>
                      <OwnerSectionSaveAction
                        label={tr('Save listing copy', "Enregistrer le texte de l'annonce")}
                        savedLabel={getSectionSavedLabel('listingCopy')}
                        saving={saving}
                        disabled={submitting}
                        onSave={() => void handleSaveVehicleSection('listingCopy', 'listing_copy_save')}
                        tone="soft"
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-5 grid gap-4">
                    <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Pricing', 'Tarification')}</p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Rates and deposit', 'Tarifs et caution')}</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <ViewField label={tr('Daily price', 'Prix journalier')} value={formData.dailyPriceAmount ? `${formData.dailyPriceAmount} MAD` : '—'} />
                        <ViewField label={tr('Deposit', 'Caution')} value={formData.depositAmount ? `${formData.depositAmount} MAD` : '—'} />
                        <ViewField label={tr('Half-day package price', 'Prix du forfait demi-journée')} value={formData.halfDayPriceAmount ? `${formData.halfDayPriceAmount} MAD` : '—'} />
                        <ViewField label={tr('Included kilometers', 'Kilomètres inclus')} value={formData.mileageLimitKm ? `${formData.mileageLimitKm} km` : '—'} />
                        <ViewField label={tr('Half-day hours', 'Heures demi-journée')} value={formData.halfDayMinHours && formData.halfDayMaxHours ? `${formData.halfDayMinHours}-${formData.halfDayMaxHours} h` : '—'} />
                        <ViewField label={tr('Extra kilometer rate', 'Tarif kilomètre supplémentaire')} value={formData.extraKmRate ? `${formData.extraKmRate} MAD` : '—'} />
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('What renters will read', 'Ce que les locataires verront')}</p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Public listing copy', "Texte public de l'annonce")}</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <ViewField label={tr('Listing title', 'Titre de l’annonce')} value={formData.listingTitle} />
                        <div className="hidden sm:block" />
                        <ViewField label={tr('Short summary', 'Résumé court')} value={formData.shortDescription} />
                        <ViewField label={tr('Detailed description', 'Description détaillée')} value={formData.fullDescription} />
                      </div>
                    </div>
                  </div>
                )}
                {fieldErrors.pricing ? <p className="mt-3 text-xs font-semibold text-rose-600">{fieldErrors.pricing}</p> : null}
                {fieldErrors.halfDayHours ? <p className="mt-2 text-xs font-semibold text-rose-600">{fieldErrors.halfDayHours}</p> : null}
              </section>

              <section id="listing-rules" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'listing-rules')}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Step 5 of 6', 'Étape 5 sur 6')}</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Pickup and renter setup', 'Retrait et configuration locataire')}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {tr(
                    'Set where the handoff happens and what renters should know before booking.',
                    'Définissez où la remise a lieu et ce que les locataires doivent savoir avant de réserver.'
                  )}
                </p>
                {isEditingVehicle ? (
                  <>
                    <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Pickup', 'Retrait')}</p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Handoff details', 'Détails de remise')}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {tr(
                          'Set the pickup point and the fuel rule renters should expect.',
                          'Définissez le point de retrait et la règle carburant attendue par les locataires.'
                        )}
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <OwnerField label={tr('Pickup location name', 'Nom du point de retrait')}>
                          <input value={formData.pickupLocationName} onChange={(event) => updateField('pickupLocationName', event.target.value)} className={baseFieldClassName} />
                        </OwnerField>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={returnSameFuelLevel}
                              onChange={(event) => updateField('fuelPolicy', event.target.checked ? 'return_same_level' : 'custom_fuel_policy')}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            <span>
                              <span className="block text-sm font-black text-slate-950">
                                {tr('Bring it back with the same fuel level', 'Retourner avec le même niveau de carburant')}
                              </span>
                              <span className="mt-1 block text-sm font-medium text-slate-500">
                                {tr('Default rule: renter returns the vehicle the way it was handed over.', 'Règle par défaut : le locataire rend le véhicule comme il l’a reçu.')}
                              </span>
                            </span>
                          </label>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl bg-white p-2 text-emerald-600 shadow-sm">
                            <Droplets className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-950">
                              {tr('Fuel return rule', 'Règle de retour carburant')}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-emerald-700">
                              {fuelPolicyDisplay}
                            </p>
                            <p className="mt-2 text-sm text-slate-600">
                              {tr(
                                'The exact fuel level is recorded during pickup, then compared when the renter returns.',
                                'Le niveau exact est enregistré au retrait, puis comparé au retour du locataire.'
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                      <OwnerField label={tr('Pickup address', 'Adresse de retrait')}>
                        <textarea value={formData.pickupAddress} onChange={(event) => updateField('pickupAddress', event.target.value)} className={`${baseFieldClassName} min-h-[96px] resize-y`} />
                      </OwnerField>
                      <OwnerSectionSaveAction
                        label={tr('Save pickup setup', 'Enregistrer le retrait')}
                        savedLabel={getSectionSavedLabel('pickup')}
                        saving={saving}
                        disabled={submitting}
                        onSave={() => void handleSaveVehicleSection('pickup', 'listing_pickup_save')}
                      />
                    </div>
                    <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Renter notes', 'Notes locataire')}</p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Extras and review readiness', 'Extras et préparation revue')}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {tr(
                          'Add optional extras, then mark the setup ready when the handoff details are clear.',
                          'Ajoutez les extras optionnels, puis marquez la configuration prête quand les détails de remise sont clairs.'
                        )}
                      </p>
                      <OwnerField label={tr('Extras (comma separated)', 'Extras (séparés par des virgules)')}>
                        <input value={formData.extrasText} onChange={(event) => updateField('extrasText', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        <input type="checkbox" checked={formData.termsAcceptedForSubmission} onChange={(event) => updateField('termsAcceptedForSubmission', event.target.checked)} />
                        {tr('Ready to submit for review', 'Prêt à envoyer en revue')}
                      </label>
                      <OwnerSectionSaveAction
                        label={tr('Save renter setup', 'Enregistrer la configuration')}
                        savedLabel={getSectionSavedLabel('renterSetup')}
                        saving={saving}
                        disabled={submitting}
                        onSave={() => void handleSaveVehicleSection('renterSetup', 'listing_renter_setup_save')}
                        tone="soft"
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Pickup', 'Retrait')}</p>
                    <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Handoff details', 'Détails de remise')}</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
	                      <ViewField label={tr('Pickup location name', 'Nom du point de retrait')} value={formData.pickupLocationName} />
	                      <ViewField label={tr('Fuel policy', 'Politique carburant')} value={fuelPolicyDisplay} />
	                      <ViewField label={tr('Pickup address', 'Adresse de retrait')} value={formData.pickupAddress} />
	                      <ViewField label={tr('Extras', 'Extras')} value={formData.extrasText} />
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-4">
              <section id="listing-journey" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'listing-journey')}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Step 6 of 6', 'Étape 6 sur 6')}</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Review and publish', 'Revoir et publier')}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {reviewPublishQuietMode
                    ? tr(
                        'This section becomes quieter once the review flow is already handled, so the rest of the page stays easier to scan.',
                        "Cette section devient plus discrète une fois le flux de revue déjà géré, afin que le reste de la page soit plus facile à parcourir."
                      )
                    : tr(
                        'Final check before admin review and go-live.',
                        "Dernière vérification avant la revue admin et la mise en ligne."
                      )}
                </p>
                <div className={`mt-4 rounded-[1.25rem] border px-4 py-4 shadow-sm ${reviewPublishStageModel.tone}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                        {tr('Review status', 'Statut de la revue')}
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{reviewPublishStageModel.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{reviewPublishStageModel.body}</p>
                    </div>
                    <span className={`inline-flex items-center self-start rounded-full px-3 py-1 text-xs font-bold ${listingTone}`}>
                      {reviewPublishStageModel.badge}
                    </span>
                  </div>

                  {reviewPublishQuietMode ? (
                    <div className="mt-4 rounded-[1.15rem] border border-white/80 bg-white/80 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {tr('Quiet mode', 'Mode discret')}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {reviewPublishQuietSummary}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReviewPublishDetailsExpanded((current) => !current)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                        >
                          <span>
                            {reviewPublishDetailsExpanded
                              ? tr('Hide detail', 'Masquer le détail')
                              : tr('Show detail', 'Voir le détail')}
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${reviewPublishDetailsExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {showReviewPublishDetailCards ? (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {compactReviewSteps.map((step, index) => (
                          <div key={step.key} className={`rounded-2xl border bg-white/90 px-4 py-3 ${step.tone}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
                                {tr('Step', 'Étape')} {index + 1}
                              </p>
                              {step.done ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                            </div>
                            <p className="mt-2 text-sm font-black text-slate-950">{step.label}</p>
                            <p className="mt-1 text-sm font-semibold">{step.value}</p>
                          </div>
                        ))}
                      </div>

                      {compactReviewSystemNote ? (
                        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${compactReviewNoteTone}`}>
                          <div className="flex items-start gap-3">
                            {reviewSubmissionPending ? (
                              <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                            ) : reviewSubmissionComplete ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4" />
                            ) : (
                              <AlertCircle className="mt-0.5 h-4 w-4" />
                            )}
                            <div>
                              <p className="font-bold">{compactReviewNoteTitle}</p>
                              <p className="mt-1">{compactReviewSystemNote}</p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {showReviewSendCta ? (
                      <button
                        type="button"
                        onClick={() => void handleSubmitFullReview()}
                        disabled={saving || submitting || reviewSubmissionPending}
                        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(109,40,217,0.22)] transition-colors hover:bg-violet-800 disabled:opacity-60"
                      >
                        {reviewSubmissionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {reviewSubmissionPending
                          ? tr('Sending...', 'Envoi...')
                          : tr('Send review', 'Envoyer la revue')}
                      </button>
                    ) : null}
                    {listingApproved && !listingIsLive ? (
                      <button
                        type="button"
                        onClick={() => void handlePublishApprovedListing()}
                        disabled={saving || submitting || publishListingPending}
                        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(5,150,105,0.24)] transition-colors hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {publishListingPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        {publishListingPending
                          ? tr('Publishing...', 'Publication...')
                          : tr('Publish now', 'Publier maintenant')}
                      </button>
                    ) : null}
                    {vehicle?.listingId && listingIsLive ? (
                      <Link
                        to={`/marketplace/marketplace-${encodeURIComponent(String(vehicle.listingId))}`}
                        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {tr('View public listing', 'Voir la fiche publique')}
                      </Link>
                    ) : null}
                    {vehicle?.listingId && (!reviewWaitingForAdmin || listingReviewThreadHasVisibleMessages) ? (
                      <button
                        type="button"
                        onClick={handleOpenReviewThread}
                        className={`inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 py-2.5 text-sm font-semibold transition hover:border-violet-200 hover:text-violet-700 ${
                          reviewWaitingForAdmin ? 'text-slate-500' : 'text-slate-700'
                        }`}
                      >
                        <MessageSquareText className="h-4 w-4" />
                        {listingSupportActionLabel}
                      </button>
                    ) : null}
                    {reviewPublishStageModel.key === 'waiting_for_admin' ? (
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                        {tr('Waiting for admin approval - no action needed', "En attente de l'approbation admin - aucune action requise")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </section>
              <section className={workspacePanelClass}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Public preview', 'Aperçu public')}</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Listing preview', "Aperçu de l'annonce")}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {tr(
                    'This is the compact renter-facing summary based on the fields above.',
                    'Voici le résumé compact visible par les locataires à partir des champs ci-dessus.'
                  )}
                </p>
                <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Public card', 'Carte publique')}</p>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">{formData.listingTitle || tr('Untitled listing', 'Annonce sans titre')}</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {formData.dailyPriceAmount ? `${formData.dailyPriceAmount} MAD` : tr('Price not set', 'Prix non défini')}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {[formData.cityName, formData.areaName].filter(Boolean).join(' • ') || tr('Location not set', 'Lieu non défini')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setFocusedSectionId('listing-details')}
                    className="mt-4 inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('Edit pricing and details', 'Modifier prix et détails')}
                  </button>
                </div>
                {vehicle?.listingId && listingIsLive ? (
                  <Link
                    to={`/marketplace/marketplace-${encodeURIComponent(String(vehicle.listingId))}`}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('Open public listing', 'Ouvrir l’annonce publique')}
                  </Link>
                ) : null}
              </section>
            </div>
          </section>
        </>
      ) : null}

      {effectiveActiveTab === 'bookings' ? (
        <div className="space-y-4">
          {!isOperationsWorkspaceRoute ? (
          <section id="registration-insurance" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'registration-insurance')}`}>
            <h2 className="text-xl font-bold text-slate-950">{tr('Booking readiness', 'État de préparation des réservations')}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {tr('Use this tab for operational details that affect availability, fulfillment, and vehicle readiness.', 'Utilisez cet onglet pour les détails opérationnels qui affectent la disponibilité, l’exécution et l’état de préparation du véhicule.')}
            </p>
            {isEditingVehicle ? (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <OwnerField label={tr('Last oil change date', 'Date de la dernière vidange')}>
                    <input type="date" value={formData.lastOilChangeDate} onChange={(event) => updateField('lastOilChangeDate', event.target.value)} className={baseFieldClassName} />
                  </OwnerField>
                  <OwnerField label={tr('Odometer at last oil change', 'Kilométrage à la dernière vidange')}>
                    <input type="number" value={formData.lastOilChangeOdometer} onChange={(event) => updateField('lastOilChangeOdometer', event.target.value)} className={baseFieldClassName} />
                  </OwnerField>
                  <OwnerField label={tr('Next oil change date', 'Date de la prochaine vidange')}>
                    <input type="date" value={formData.nextOilChangeDue} onChange={(event) => updateField('nextOilChangeDue', event.target.value)} className={baseFieldClassName} />
                  </OwnerField>
                  <OwnerField label={tr('Next oil change odometer', 'Kilométrage de la prochaine vidange')}>
                    <input type="number" value={formData.nextOilChangeOdometer} onChange={(event) => updateField('nextOilChangeOdometer', event.target.value)} className={baseFieldClassName} />
                  </OwnerField>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={formData.deliveryAvailable} onChange={(event) => updateField('deliveryAvailable', event.target.checked)} />
                    {tr('Delivery available', 'Livraison disponible')}
                  </label>
                  <OwnerField label={tr('Delivery radius (km)', 'Rayon de livraison (km)')}>
                    <input type="number" value={formData.deliveryRadiusKm} onChange={(event) => updateField('deliveryRadiusKm', event.target.value)} className={baseFieldClassName} />
                  </OwnerField>
                  <OwnerField label={tr('Delivery fee', 'Frais de livraison')}>
                    <input type="number" value={formData.deliveryFeeAmount} onChange={(event) => updateField('deliveryFeeAmount', event.target.value)} className={baseFieldClassName} />
                  </OwnerField>
                </div>
              </>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ViewField label={tr('Last oil change date', 'Date de la dernière vidange')} value={formatDate(formData.lastOilChangeDate, isFrench ? 'fr' : 'en')} />
                <ViewField label={tr('Odometer at last oil change', 'Kilométrage à la dernière vidange')} value={formData.lastOilChangeOdometer ? `${formData.lastOilChangeOdometer} km` : '—'} />
                <ViewField label={tr('Next oil change date', 'Date de la prochaine vidange')} value={formatDate(formData.nextOilChangeDue, isFrench ? 'fr' : 'en')} />
                <ViewField label={tr('Next oil change odometer', 'Kilométrage de la prochaine vidange')} value={formData.nextOilChangeOdometer ? `${formData.nextOilChangeOdometer} km` : '—'} />
                <ViewField label={tr('Delivery available', 'Livraison disponible')} value={formData.deliveryAvailable ? tr('Yes', 'Oui') : tr('No', 'Non')} />
                <ViewField label={tr('Delivery radius (km)', 'Rayon de livraison (km)')} value={formData.deliveryRadiusKm ? `${formData.deliveryRadiusKm} km` : '—'} />
                <ViewField label={tr('Delivery fee', 'Frais de livraison')} value={formData.deliveryFeeAmount ? `${formData.deliveryFeeAmount} MAD` : '—'} />
              </div>
            )}
          </section>
          ) : null}

          <SectionCard
            plain={isOperationsWorkspaceRoute}
            title={tr('Bookings & requests', 'Réservations & demandes')}
            description={isOperationsWorkspaceRoute
              ? tr(
                  'Run the rental first. Open the supporting booking detail only when you need it.',
                  "Exécutez d'abord la location. Ouvrez le détail de réservation uniquement quand vous en avez besoin."
                )
              : tr('Requests, demand signals, and operational booking context for this vehicle.', 'Demandes, signaux de demande et contexte opérationnel de réservation pour ce véhicule.')}
            icon={CalendarClock}
          >
            {vehicleRequests.length ? (
              <div className="space-y-4">
              {operationalRequest && operationalExecutionMeta ? (
                <div
                  id="owner-rental-execution"
                  className={getFocusedSectionClass(focusedSectionId, 'owner-rental-execution')}
                >
                <AccountRentalExecutionStepperShell
                  variant={isOperationsWorkspaceRoute ? 'rentalDetails' : 'stepper'}
                  badge={isOperationsWorkspaceRoute ? '' : operationalExecutionMeta.badge}
                  badgeTone={operationalExecutionMeta.tone}
                  customerLabel={isOperationsWorkspaceRoute ? '' : operationalRequest?.customerName || tr('Customer', 'Client')}
                  title={isOperationsWorkspaceRoute ? '' : tr('Rental execution', 'Exécution de location')}
                  description={isOperationsWorkspaceRoute ? '' : operationalExecutionMeta.note}
                  metaLine={isOperationsWorkspaceRoute ? '' : [operationalRequest?.customerEmail || operationalRequest?.customerPhone || '', formatDateTime(operationalRequest?.requestedStartAt, isFrench ? 'fr' : 'en')].filter(Boolean).join(' • ')}
                  moneyPanel={!isOperationsWorkspaceRoute ? (
                    <div className="space-y-2">
                      <MoneyLine
                        label={tr('Rental amount', 'Montant location')}
                        value={formatMoney(operationalRequestMoney.estimatedAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}
                      />
                      <MoneyLine
                        label={tr('Deposit hold', 'Caution retenue')}
                        value={formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}
                      />
                      <MoneyLine
                        label={tr('Expected payout', 'Versement attendu')}
                        value={formatMoney(operationalRequestMoney.ownerPayoutAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}
                        strong
                      />
                    </div>
                  ) : null}
                  summaryPanel={isOperationsWorkspaceRoute ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      {ownerOperationSummaryCards.map((card) => (
                        <RentalOperationSummaryCard
                          key={card.key}
                          label={card.label}
                          value={card.value}
                          detail={card.detail}
                          icon={card.icon}
                          tone={card.tone}
                        />
                      ))}
                    </div>
                  ) : null}
                  progressLabel={ownerExecutionProgressModel.label}
                  progressValue={`${ownerExecutionProgressModel.completed}/${ownerExecutionProgressModel.total}`}
                  progressHint={ownerExecutionProgressModel.hint}
                  progressPercent={ownerExecutionProgressPercent}
                  statusTitle={ownerExecutionSummary.badge}
                  statusNote={ownerExecutionSummary.note}
                  stagePills={ownerExecutionStagePills}
                  overviewSteps={isOperationsWorkspaceRoute ? [] : operationalExecutionMeta.steps}
                  statusCards={ownerExecutionPrimaryStatusCards}
                  footer={ownerExecutionFooter}
                >

                    {ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff' ? (
                      <div className="mt-4 space-y-4">
                        {ownerHandoffReady ? (
                          <OwnerStepperStepCard
                            stepNumber={tr('Step 1', 'Étape 1')}
                            title={tr('Start rental', 'Démarrer la location')}
                            note={tr('The handoff checklist is complete. Start the live rental now.', 'La checklist de remise est terminée. Démarrez maintenant la location active.')}
                            statusLabel={ownerExecutionSaving ? tr('Saving…', 'Enregistrement…') : tr('Live rental action', 'Action de location active')}
                            primaryActionLabel={tr('Start rental', 'Démarrer la location')}
                            onPrimaryAction={markOwnerExecutionStarted}
                            primaryDisabled={ownerExecutionSaving}
                            primaryTone="emerald"
                          >
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                              {tr('Vehicle inspection, documents, deposit, and signature are complete.', 'Inspection véhicule, documents, caution et signature sont terminés.')}
                            </div>
                          </OwnerStepperStepCard>
                        ) : null}

                        <div className="space-y-3">
                          {OWNER_HANDOFF_STEPS.map((step, index) => {
                            const complete = step.gate(ownerExecutionDraft);
                            const active = !complete && ownerHandoffCurrentStep.key === step.key;
                            const iconMap = {
                              vehicle_photos: Camera,
                              start_odometer: Gauge,
                              start_fuel: Droplets,
                              legal_docs: FileText,
                              deposit: DollarSign,
                              signature: FileSignature,
                            };
                            const detailMap = {
                              vehicle_photos: complete ? tr(`${ownerExecutionHandoffPhotos.length} vehicle inspection photos saved.`, `${ownerExecutionHandoffPhotos.length} photos d’inspection véhicule enregistrées.`) : tr(step.note.en, step.note.fr),
                              start_odometer: complete ? `${ownerExecutionDraft.startOdometer} km` : tr(step.note.en, step.note.fr),
                              start_fuel: complete ? getOwnerExecutionFuelLabel(ownerExecutionDraft.startFuelLevel, tr) : tr(step.note.en, step.note.fr),
                              legal_docs: complete ? tr(`${ownerExecutionLegalDocsPhotos.length} document photos saved.`, `${ownerExecutionLegalDocsPhotos.length} photos de documents enregistrées.`) : tr(step.note.en, step.note.fr),
                              deposit: complete ? tr('Deposit confirmed.', 'Caution confirmée.') : tr(step.note.en, step.note.fr),
                              signature: complete ? tr('Contract signed.', 'Contrat signé.') : tr(step.note.en, step.note.fr),
                            };
                            const actionMap = {
                              vehicle_photos: { label: tr('View photos', 'Voir les photos'), action: () => openOwnerExecutionMediaSection('handoff') },
                              start_odometer: { label: complete ? tr('Edit reading', 'Modifier le relevé') : tr('Add reading', 'Ajouter le relevé'), action: openOwnerStartOdometerModal },
                              start_fuel: { label: complete ? tr('Update fuel', 'Modifier le carburant') : tr('Record fuel', 'Enregistrer le carburant'), action: openOwnerStartFuelModal },
                              legal_docs: { label: tr('View photos', 'Voir les photos'), action: () => openOwnerExecutionMediaSection('legal_docs') },
                              deposit: { label: tr('Confirm deposit', 'Confirmer la caution'), action: () => toggleOwnerExecutionFlag('depositConfirmed') },
                              signature: { label: tr('Sign contract', 'Signer le contrat'), action: openOwnerSignatureModal },
                            };
                            const captureStep = ['vehicle_photos', 'legal_docs'].includes(step.key);
                            const viewableCompleteStep = complete && captureStep;
                            const editableCompleteStep = complete && !ownerExecutionHandoffLocked && ['start_odometer', 'start_fuel'].includes(step.key);
                            const actionableActiveStep = active && !captureStep;
                            const actionConfig = actionableActiveStep || editableCompleteStep || viewableCompleteStep ? actionMap[step.key] : null;
                            return (
                              <OwnerRentalWorkflowStepCard
                                key={step.key}
                                number={index + 1}
                                title={tr(step.label.en, step.label.fr)}
                                detail={detailMap[step.key]}
                                complete={complete}
                                active={active}
                                icon={iconMap[step.key]}
                                actionLabel={actionConfig?.label || ''}
                                onAction={actionConfig?.action}
                                disabled={ownerExecutionSaving || (ownerExecutionHandoffLocked && !editableCompleteStep && !viewableCompleteStep)}
                                fullBleedChildren={active && captureStep}
                              >
                                {active && step.key === 'vehicle_photos' ? (
                                  <RentalPhotoEvidenceCapture
                                    title={tr('Vehicle inspection', 'Inspection véhicule')}
                                    subtitle={tr('Take at least 3 clear vehicle inspection photos before the vehicle leaves.', 'Prenez au moins 3 photos claires d’inspection véhicule avant le départ.')}
                                    helper={tr('Use the camera, review the images, then confirm the upload.', 'Utilisez la caméra, vérifiez les images, puis confirmez le téléversement.')}
                                    sessionToken={`owner-handoff-${String(operationalRequest?.id || 'request')}`}
                                    photos={ownerExecutionDraft.handoffPhotos}
                                    minPhotos={OWNER_HANDOFF_MIN_PHOTOS}
                                    maxPhotos={6}
                                    saving={ownerExecutionSaving}
                                    disabled={ownerExecutionHandoffLocked}
                                    onSubmit={(files) => uploadOwnerExecutionPhotos('handoff', files)}
                                    submitLabel={tr('Save vehicle inspection photos', 'Enregistrer les photos d’inspection véhicule')}
                                    variant="flush"
                                    tr={tr}
                                  />
                                ) : null}
                                {active && step.key === 'legal_docs' ? (
                                  <RentalPhotoEvidenceCapture
                                    title={tr('Registration + insurance', 'Carte grise + assurance')}
                                    subtitle={tr('Take exactly 2 clear photos: one registration and one insurance.', 'Prenez exactement 2 photos claires : une carte grise et une assurance.')}
                                    helper={tr('Use the same camera flow, review both images, then confirm the upload.', 'Utilisez le même flux caméra, vérifiez les deux images, puis confirmez le téléversement.')}
                                    sessionToken={`owner-legal-docs-${String(operationalRequest?.id || 'request')}`}
                                    photos={ownerExecutionDraft.legalDocsPhotos}
                                    minPhotos={OWNER_LEGAL_DOCS_MIN_PHOTOS}
                                    maxPhotos={OWNER_LEGAL_DOCS_MIN_PHOTOS}
                                    saving={ownerExecutionSaving}
                                    disabled={ownerExecutionHandoffLocked}
                                    onSubmit={(files) => uploadOwnerExecutionPhotos('legal_docs', files)}
                                    submitLabel={tr('Save registration and insurance photos', 'Enregistrer les photos carte grise et assurance')}
                                    variant="flush"
                                    tr={tr}
                                  />
                                ) : null}
                              </OwnerRentalWorkflowStepCard>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {ownerExecutionStage === 'ready_to_start' ? (
                      <div className="mt-4">
                        <OwnerStepperStepCard
                          stepNumber={tr('Start', 'Démarrage')}
                          title={tr('Ready to start rental', 'Prête à démarrer la location')}
                          note={tr('Pickup is complete. This action starts the live rental and locks the handoff flow.', 'Le départ est terminé. Cette action démarre la location active et verrouille la remise.')}
                          statusLabel={ownerExecutionSaving ? tr('Saving…', 'Enregistrement…') : tr('Irreversible action', 'Action irréversible')}
                          primaryActionLabel={tr('Start rental', 'Démarrer la location')}
                          onPrimaryAction={markOwnerExecutionStarted}
                          primaryDisabled={ownerExecutionSaving}
                        />
                      </div>
                    ) : null}

                    {ownerExecutionStage === 'live' ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 md:grid-cols-5">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Started', 'Démarrée')}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">
                              {formatDateTime(ownerExecutionStartedAt, isFrench ? 'fr' : 'en')}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Expected return', 'Retour prévu')}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">
                              {formatDateTime(operationalRequest?.requestedEndAt, isFrench ? 'fr' : 'en')}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Deposit', 'Caution')}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">
                              {formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Help', 'Aide')}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">{tr('Use chat or support only', 'Utilisez le chat ou le support uniquement')}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                          <Link
                            to={`/account/messages?requestId=${encodeURIComponent(String(operationalRequest.id))}`}
                            state={{ from: currentPath }}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                          >
                            <MessageSquareText className="h-4 w-4" />
                            {tr('Chat', 'Chat')}
                          </Link>
                          <Link
                            to={`/account/messages?requestId=${encodeURIComponent(String(operationalRequest.id))}`}
                            state={{ from: currentPath }}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                          >
                            <AlertCircle className="h-4 w-4" />
                            {tr('Help', 'Aide')}
                          </Link>
                          <button
                            type="button"
                            onClick={markOwnerExecutionReturnPending}
                            disabled={ownerExecutionSaving || !ownerExecutionCanStartReturnFlow}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
                          >
                            <FileText className="h-4 w-4" />
                            {ownerExecutionCanStartReturnFlow
                              ? tr('Start return flow', 'Démarrer le retour')
                              : tr('Timer starting…', 'Timer en cours…')}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {ownerExecutionStage === 'return_pending' ? (
                      <div className="mt-4 space-y-4">
                        {ownerReturnReady ? (
                          <OwnerStepperStepCard
                            stepNumber={tr('Step 2', 'Étape 2')}
                            title={tr('End rental', 'Terminer la location')}
                            note={tr('The return checklist is complete. Close the rental now.', 'La checklist de retour est terminée. Clôturez maintenant la location.')}
                            statusLabel={ownerExecutionSaving ? tr('Saving…', 'Enregistrement…') : tr('Final rental action', 'Action finale de location')}
                            primaryActionLabel={tr('End rental', 'Terminer la location')}
                            onPrimaryAction={saveOwnerReturnFlow}
                            primaryDisabled={ownerExecutionSaving || !ownerReturnReady}
                            primaryTone="violet"
                          />
                        ) : null}

                        <div className="space-y-3">
                          {OWNER_RETURN_STEPS.map((step, index) => {
                            const complete = step.gate(ownerExecutionDraft);
                            const active = !complete && ownerReturnCurrentStep.key === step.key;
                            const iconMap = {
                              return_photos: Camera,
                              return_odometer: Gauge,
                              return_fuel: Droplets,
                              return_condition: AlertTriangle,
                              deposit_review: DollarSign,
                              end_rental: CheckCircle2,
                            };
                            const detailMap = {
                              return_photos: complete ? tr('Return inspection completed.', 'Inspection retour terminée.') : tr(step.note.en, step.note.fr),
                              return_odometer: complete ? `${ownerExecutionDraft.returnOdometer} km` : tr(step.note.en, step.note.fr),
                              return_fuel: complete ? getOwnerExecutionFuelLabel(ownerExecutionDraft.returnFuelLevel, tr) : tr(step.note.en, step.note.fr),
                              return_condition: complete
                                ? ownerExecutionDraft.issueReported
                                  ? tr('Issue documented.', 'Incident documenté.')
                                  : tr('No issue reported.', 'Aucun incident signalé.')
                                : tr(step.note.en, step.note.fr),
                              deposit_review: complete ? ownerReturnDepositOutcomeLabel : tr(step.note.en, step.note.fr),
                              end_rental: ownerReturnReady
                                ? tr('Ready to close.', 'Prête à clôturer.')
                                : tr(step.note.en, step.note.fr),
                            };
                            const captureStep = step.key === 'return_photos';
                            const actionMap = {
                              return_photos: { label: tr('View photos', 'Voir les photos'), action: () => openOwnerExecutionMediaSection('return') },
                              return_odometer: {
                                label: complete ? tr('Edit reading', 'Modifier le relevé') : tr('Add reading', 'Ajouter le relevé'),
                                action: openOwnerReturnOdometerModal,
                              },
                              return_fuel: {
                                label: complete ? tr('Edit fuel', 'Modifier le carburant') : tr('Record fuel', 'Enregistrer le carburant'),
                                action: openOwnerReturnFuelModal,
                              },
                            };
                            const editableReturnStep = ['return_odometer', 'return_fuel'].includes(step.key);
                            const actionConfig = complete && captureStep
                              ? actionMap.return_photos
                              : ((active && !captureStep) || (complete && editableReturnStep))
                                ? actionMap[step.key]
                                : null;

                            return (
                              <OwnerRentalWorkflowStepCard
                                key={step.key}
                                number={index + 1}
                                title={tr(step.label.en, step.label.fr)}
                                detail={detailMap[step.key]}
                                complete={complete}
                                active={active}
                                icon={iconMap[step.key]}
                                actionLabel={actionConfig?.label || ''}
                                onAction={actionConfig?.action}
                                disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                fullBleedChildren={active && captureStep}
                              >
                                {active && step.key === 'return_photos' ? (
                                  <RentalPhotoEvidenceCapture
                                    title={tr('Vehicle inspection', 'Inspection véhicule')}
                                    subtitle={tr('Take at least 3 clear return photos before closing the rental.', 'Prenez au moins 3 photos claires avant de clôturer la location.')}
                                    helper={tr('Capture the vehicle condition on return. Issue reporting stays optional in the next step.', 'Capturez l’état du véhicule au retour. Le signalement d’incident reste optionnel à l’étape suivante.')}
                                    sessionToken={`owner-return-${String(operationalRequest?.id || 'request')}`}
                                    photos={ownerExecutionDraft.returnPhotos}
                                    minPhotos={OWNER_RETURN_MIN_PHOTOS}
                                    maxPhotos={6}
                                    saving={ownerExecutionSaving}
                                    disabled={ownerExecutionReturnLocked}
                                    onSubmit={(files) => uploadOwnerExecutionPhotos('return', files)}
                                    submitLabel={tr('Save return photos', 'Enregistrer les photos de retour')}
                                    variant="flush"
                                    tr={tr}
                                  />
                                ) : null}
                                {active && step.key === 'return_fuel' && ownerReturnFuelDelta !== null ? (
                                  <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                                    ownerReturnFuelDelta < 0
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  }`}>
                                    {ownerReturnFuelDelta < 0
                                      ? tr(
                                          `Returned ${Math.abs(ownerReturnFuelDelta)} line${Math.abs(ownerReturnFuelDelta) === 1 ? '' : 's'} below pickup.`,
                                          `Retour avec ${Math.abs(ownerReturnFuelDelta)} ligne${Math.abs(ownerReturnFuelDelta) === 1 ? '' : 's'} de moins que le départ.`
                                        )
                                      : ownerReturnFuelDelta > 0
                                        ? tr(
                                            `Returned ${ownerReturnFuelDelta} line${ownerReturnFuelDelta === 1 ? '' : 's'} above pickup.`,
                                            `Retour avec ${ownerReturnFuelDelta} ligne${ownerReturnFuelDelta === 1 ? '' : 's'} de plus que le départ.`
                                          )
                                        : tr('Fuel matches pickup level.', 'Le carburant correspond au niveau de départ.')}
                                  </div>
                                ) : null}
                                {active && step.key === 'return_condition' ? (
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap gap-3">
                                      <button
                                        type="button"
                                        onClick={() => setOwnerIssueReview(false)}
                                        disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                          ownerExecutionDraft.issueReviewed && !ownerExecutionDraft.issueReported
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
                                        }`}
                                      >
                                        {tr('No issue', 'Aucun incident')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setOwnerIssueReview(true)}
                                        disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                          ownerExecutionDraft.issueReviewed && ownerExecutionDraft.issueReported
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
                                        }`}
                                      >
                                        {tr('Report issue', 'Signaler un incident')}
                                      </button>
                                    </div>
                                    {ownerExecutionDraft.issueReviewed && ownerExecutionDraft.issueReported ? (
                                      <label className="block">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                          {tr('Issue note', "Note d'incident")}
                                        </span>
                                        <textarea
                                          value={ownerExecutionDraft.issueNote || ''}
                                          onChange={(event) => {
                                            const nextValue = event.target.value;
                                            setOwnerExecutionDraft((current) => ({
                                              ...current,
                                              issueNote: nextValue,
                                            }));
                                          }}
                                          disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                          className={`${baseFieldClassName} mt-2 min-h-[120px] resize-y`}
                                          placeholder={tr(
                                            'Example: Front bumper scratch seen at return, renter informed, follow-up needed before deposit release.',
                                            "Exemple : Rayure sur le pare-chocs avant constatée au retour, locataire informé, suivi nécessaire avant restitution de la caution."
                                          )}
                                        />
                                      </label>
                                    ) : null}
                                  </div>
                                ) : null}
                                {active && step.key === 'deposit_review' ? (
                                  <div className="space-y-3">
                                    <div className="grid gap-3 sm:grid-cols-3">
                                      {[
                                        { key: 'refund_full', label: tr('Refund in full', 'Rembourser en totalité'), tone: 'emerald' },
                                        { key: 'hold_partial', label: tr('Hold partially', 'Retenir partiellement'), tone: 'amber' },
                                        { key: 'hold_full', label: tr('Hold fully', 'Retenir en totalité'), tone: 'rose' },
                                      ].map((option) => {
                                        const selected = ownerExecutionDraft.depositOutcome === option.key;
                                        return (
                                          <button
                                            key={option.key}
	                                            type="button"
	                                            onClick={() => {
	                                              if (ownerExecutionReturnLocked) return;
	                                              if (option.key === 'refund_full') {
	                                                openOwnerRefundSignatureModal();
	                                                return;
	                                              }
	                                              setOwnerExecutionDraft((current) => ({
	                                                ...current,
	                                                depositReviewed: true,
	                                                depositOutcome: option.key,
	                                                depositRefundSignatureUrl: '',
	                                                depositRefundSignedAt: null,
	                                                depositRefundAmount: 0,
	                                                depositRefundCurrency: '',
	                                                depositRefundSignedBy: '',
	                                                depositRefundRecordedBy: '',
	                                              }));
	                                            }}
                                            disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                            className={`rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition ${
                                              selected
                                                ? option.tone === 'emerald'
                                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                  : option.tone === 'amber'
                                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                    : 'border-rose-200 bg-rose-50 text-rose-700'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
                                            }`}
                                          >
                                            {option.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : null}
                                {step.key === 'end_rental' ? (
                                  <button
                                    type="button"
                                    onClick={cancelOwnerExecutionReturnPending}
                                    disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                    className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {tr('Cancel finish flow', 'Annuler la fin')}
                                  </button>
                                ) : null}
                              </OwnerRentalWorkflowStepCard>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {ownerExecutionStage === 'completed' ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{tr('Rental', 'Location')}</p>
                          <p className="mt-2 text-sm font-semibold text-emerald-900">{tr('Closed cleanly', 'Clôturée proprement')}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Started', 'Démarrée')}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {formatDateTime(ownerExecutionDraft.startedAt || operationalRequest?.updatedAt, isFrench ? 'fr' : 'en')}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Return saved', 'Retour enregistré')}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {formatDateTime(ownerExecutionDraft.returnSavedAt, isFrench ? 'fr' : 'en')}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Return condition', 'État retour')}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {ownerExecutionDraft.issueReported
                              ? tr('Issue documented between parties', 'Incident documenté entre les parties')
                              : tr('No issue reported at return', 'Aucun incident signalé au retour')}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Deposit outcome', 'Résultat caution')}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {ownerExecutionDraft.depositOutcome === 'refund_full'
                              ? tr('Refunded in full', 'Remboursée en totalité')
                              : ownerExecutionDraft.depositOutcome === 'hold_partial'
                                ? tr('Partially held', 'Retenue partiellement')
                                : ownerExecutionDraft.depositOutcome === 'hold_full'
                                  ? tr('Fully held', 'Retenue en totalité')
                                  : '—'}
                          </p>
                        </div>
                      </div>
                    ) : null}

                  {isOperationsWorkspaceRoute ? (
                    <div className="mt-4">
                      <OperationsCollapseCard
                        icon={FileText}
                        eyebrow={tr('Reference', 'Référence')}
                        title={tr('Reference details', 'Détails de référence')}
                        description={ownerExecutionReferenceSummary}
                        expanded={operationsReferenceExpanded}
                        onToggle={() => {
                          if (operationsReferenceExpanded) setOperationsFocusedMediaPhase('');
                          setOperationsReferenceExpanded((current) => !current);
                        }}
                        expandLabel={tr('Show reference details', 'Voir les détails de référence')}
                        collapseLabel={tr('Hide reference details', 'Masquer les détails de référence')}
                      >
                        <div className="space-y-4">
                      <div ref={operationsMediaSectionRef}>
                        <OperationsCollapseCard
                          icon={Camera}
                          eyebrow={ownerExecutionMediaReferenceMeta.eyebrow}
                          title={ownerExecutionMediaReferenceMeta.title}
                          description={ownerExecutionMediaReferenceMeta.description}
                          expanded={operationsMediaExpanded}
                          onToggle={() => {
                            if (operationsMediaExpanded) setOperationsFocusedMediaPhase('');
                            setOperationsMediaExpanded((current) => !current);
                          }}
                          expandLabel={ownerExecutionMediaCount > 0 ? tr('Show media', 'Voir les médias') : tr('Show empty media', 'Voir les médias vides')}
                          collapseLabel={tr('Hide media', 'Masquer les médias')}
                        >
                          <div className="grid gap-4 xl:grid-cols-3">
                            {ownerExecutionMediaPhaseCards.map((phaseCard) => (
                              <OwnerExecutionMediaPhaseCard
                                key={phaseCard.key}
                                title={phaseCard.title}
                                description={phaseCard.description}
                                photos={phaseCard.photos}
                                emptyLabel={phaseCard.emptyLabel}
                                countLabel={phaseCard.countLabel}
                              />
                            ))}
                          </div>
	                        </OperationsCollapseCard>
	                      </div>
	                      <OperationsCollapseCard
	                        icon={FileSignature}
	                        eyebrow={tr('Documents', 'Documents')}
	                        title={tr('Contracts and receipts', 'Contrats et reçus')}
	                        description={ownerExecutionDocumentsSummary}
	                        expanded={operationsDocumentsExpanded}
	                        onToggle={() => setOperationsDocumentsExpanded((current) => !current)}
	                        expandLabel={tr('Show documents', 'Voir les documents')}
	                        collapseLabel={tr('Hide documents', 'Masquer les documents')}
	                      >
	                        <div className="grid gap-3 xl:grid-cols-2">
	                          {ownerExecutionDocumentRows.map((documentRow) => (
	                            <OwnerExecutionDocumentRow
	                              key={documentRow.key}
	                              title={documentRow.title}
	                              description={documentRow.description}
	                              statusLabel={documentRow.statusLabel}
	                              statusTone={documentRow.statusTone}
	                              href={documentRow.href}
	                              previewUrl={documentRow.previewUrl}
	                              previewAlt={documentRow.previewAlt}
	                              previewLabel={documentRow.previewLabel}
	                              previewEmptyLabel={documentRow.previewEmptyLabel}
	                              showPreviewSlot={documentRow.showPreviewSlot}
	                              onAction={null}
	                              actionLabel={documentRow.actionLabel}
	                              actionBusy={ownerExecutionDocumentActionKey === documentRow.key}
	                              actionDisabled={!documentRow.href}
	                              tr={tr}
	                            />
	                          ))}
	                        </div>
	                      </OperationsCollapseCard>
	                      <OperationsCollapseCard
	                        icon={Car}
                        eyebrow={tr('Vehicle', 'Véhicule')}
                        title={tr('Vehicle details and history', 'Détails et historique véhicule')}
                        description={[
                          formData.plateNumber || (linkedFleetVehicleId ? `#${linkedFleetVehicleId}` : ''),
                          operationalRequest?.listingTitle || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Vehicle', 'Véhicule'),
                          tr(`${vehicleDocuments.length} document${vehicleDocuments.length === 1 ? '' : 's'}`, `${vehicleDocuments.length} document${vehicleDocuments.length === 1 ? '' : 's'}`),
                        ].filter(Boolean).join(' • ')}
                        expanded={operationsVehicleExpanded}
                        onToggle={() => setOperationsVehicleExpanded((current) => !current)}
                        expandLabel={tr('Show detail', 'Voir le détail')}
                        collapseLabel={tr('Hide detail', 'Masquer le détail')}
                      >
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <ViewField label={tr('Plate number', "Numéro d'immatriculation")} value={formData.plateNumber} />
                          <ViewField label={tr('Vehicle type', 'Type de véhicule')} value={formData.categoryCode} />
                          <ViewField label={tr('Location', 'Emplacement')} value={[formData.cityName, formData.areaName].filter(Boolean).join(' • ')} />
                          <ViewField label={tr('Current odometer', 'Kilométrage actuel')} value={formData.currentOdometer ? `${formData.currentOdometer} km` : '—'} />
                          <ViewField label={tr('Current fuel', 'Carburant actuel')} value={Number.isFinite(Number(vehicleFuelState?.current_fuel_lines)) ? `${vehicleFuelState.current_fuel_lines}/8` : '—'} />
                          <ViewField label={tr('Documents', 'Documents')} value={`${vehicleDocuments.length}`} />
                          <ViewField label={tr('Insurance', 'Assurance')} value={insuranceExpired ? tr('Expired', 'Expirée') : tr('OK', 'OK')} />
                          <ViewField label={tr('Fleet record', 'Fiche flotte')} value={linkedFleetVehicleId ? `#${linkedFleetVehicleId}` : '—'} />
                        </div>
                      </OperationsCollapseCard>
                      <OperationsCollapseCard
                        icon={DollarSign}
                        eyebrow={tr('Rental information', 'Informations location')}
                        title={tr('Financial information and payment', 'Informations financières et paiement')}
                        description={tr(
                          `${formatMoney(operationalRequestMoney.estimatedAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')} rental • ${formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')} security`,
                          `${formatMoney(operationalRequestMoney.estimatedAmount, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')} location • ${formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')} caution`
                        )}
                        expanded={operationsDetailExpanded}
                        onToggle={() => setOperationsDetailExpanded((current) => !current)}
                        expandLabel={tr('Show detail', 'Voir le détail')}
                        collapseLabel={tr('Hide detail', 'Masquer le détail')}
                      >
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Funds flow', 'Flux financier')}</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              {operationalFundsLifecycle.map((step) => {
                                const { key, ...stepProps } = step;
                                return <FundsLifecycleStep key={key} {...stepProps} />;
                              })}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Settlement rules', 'Règles de règlement')}</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              {operationalSettlementRules.map((rule) => (
                                <OwnerPolicyLine key={rule.key} label={rule.label} detail={rule.detail} />
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Link
                              to={`/account/messages?requestId=${encodeURIComponent(String(operationalRequest.id))}`}
                              state={{ from: currentPath }}
                              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
                            >
                              <MessageSquareText className="h-4 w-4" />
                              {tr('Open in Inbox', 'Ouvrir dans Inbox')}
                            </Link>
                            {operationalRequestExecutionAction?.href ? (
                              <Link
                                to={operationalRequestExecutionAction.href}
                                state={{ from: currentPath }}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {operationalRequestExecutionAction.ctaLabel}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setFocusedSectionId(`vehicle-request-${String(operationalRequest.id)}`)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {tr('Review request', 'Voir la demande')}
                              </button>
                            )}
                          </div>
                        </div>
                      </OperationsCollapseCard>
                        </div>
                      </OperationsCollapseCard>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Funds flow', 'Flux financier')}</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          {operationalFundsLifecycle.map((step) => {
                            const { key, ...stepProps } = step;
                            return <FundsLifecycleStep key={key} {...stepProps} />;
                          })}
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Settlement rules', 'Règles de règlement')}</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {operationalSettlementRules.map((rule) => (
                            <OwnerPolicyLine key={rule.key} label={rule.label} detail={rule.detail} />
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          to={`/account/messages?requestId=${encodeURIComponent(String(operationalRequest.id))}`}
                          state={{ from: currentPath }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
                        >
                          <MessageSquareText className="h-4 w-4" />
                          {tr('Open in Inbox', 'Ouvrir dans Inbox')}
                        </Link>
                        {operationalRequestExecutionAction?.href ? (
                          <Link
                            to={operationalRequestExecutionAction.href}
                            state={{ from: currentPath }}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {operationalRequestExecutionAction.ctaLabel}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFocusedSectionId(`vehicle-request-${String(operationalRequest.id)}`)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {tr('Review request', 'Voir la demande')}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </AccountRentalExecutionStepperShell>
                </div>
              ) : null}

              {false && isOperationsWorkspaceRoute && operationalRequest && operationalExecutionMeta ? (
                <OperationsCollapseCard
                  eyebrow={tr('Workflow map', 'Carte du flux')}
                  title={tr('Progress, timing, and supporting milestones', 'Progression, timing et étapes de support')}
                  description={tr(
                    'Open this when you need the full workflow map. The active checklist above remains the main operating surface.',
                    'Ouvrez ceci si vous avez besoin de la carte complète du flux. La checklist active ci-dessus reste la surface principale.'
                  )}
                  expanded={operationsWorkflowExpanded}
                  onToggle={() => setOperationsWorkflowExpanded((current) => !current)}
                  expandLabel={tr('Show detail', 'Voir le détail')}
                  collapseLabel={tr('Hide detail', 'Masquer le détail')}
                >
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {operationalExecutionMeta.steps.map((step, index) => (
                        <ExecutionStep
                          key={step.key}
                          step={{
                            key: step.key,
                            label: `${index + 1}. ${step.label}`,
                            done: step.done,
                            active: step.active,
                          }}
                        />
                      ))}
                    </div>
                    {ownerExecutionSecondaryStatusCards.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {ownerExecutionSecondaryStatusCards.map((card) => (
                          <div key={`${card.eyebrow}-${card.value}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{card.eyebrow}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">{card.value}</p>
                            {card.detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{card.detail}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </OperationsCollapseCard>
              ) : null}

              {false && isOperationsWorkspaceRoute ? (
                <div className="space-y-4">
                  <OperationsCollapseCard
                    eyebrow={tr('Request queue', 'File des demandes')}
                    title={tr('Booking queue and request history', 'File de réservation et historique des demandes')}
                    description={tr(
                      'Keep the active rental front and center. Open the queue only when you need another request.',
                      'Gardez la location active au centre. Ouvrez la file seulement si vous avez besoin d’une autre demande.'
                    )}
                    expanded={operationsQueueExpanded}
                    onToggle={() => setOperationsQueueExpanded((current) => !current)}
                    expandLabel={tr('Show detail', 'Voir le détail')}
                    collapseLabel={tr('Hide detail', 'Masquer le détail')}
                  >
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">{tr('Total requests', 'Demandes totales')}</p>
                          <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.total}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-600">{tr('Pending', 'En attente')}</p>
                          <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.pending}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">{tr('Approved by owner', 'Approuvées par le propriétaire')}</p>
                          <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.preApproved}</p>
                        </div>
                        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">{tr('Declined', 'Refusées')}</p>
                          <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.declined}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {vehicleRequests.slice(0, 8).map((request) => (
                          (() => {
                            const requestExecutionAction = getOwnerExecutionActionConfig(request, tr);
                            const requestReviewHref = buildOwnerExecutionWorkspaceHref(request, { focus: 'request' });

                            return (
                              <article key={request.id} id={`vehicle-request-${String(request.id)}`} className={workspaceInsetPanelClass}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-bold text-slate-950">{request?.customerName || tr('Customer request', 'Demande client')}</p>
                                  <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${getMarketplaceStatusTone(request?.requestStatus)}`}>
                                    {getMarketplaceStatusLabel(request?.requestStatus)}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                                  <span>{request?.customerEmail || request?.customerPhone || '—'}</span>
                                  <span>•</span>
                                  <span>{formatDateTime(request?.requestedStartAt, isFrench ? 'fr' : 'en')}</span>
                                </div>
                                {request?.requestedEndAt ? (
                                  <p className="mt-2 text-xs font-semibold text-slate-500">
                                    {tr('Until', 'Jusqu’au')} {formatDateTime(request.requestedEndAt, isFrench ? 'fr' : 'en')}
                                  </p>
                                ) : null}
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {request?.ownerResponse || request?.customerMessage || tr('No response yet.', 'Pas encore de réponse.')}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {requestExecutionAction?.href ? (
                                    <Link
                                      to={requestExecutionAction.href}
                                      state={{ from: currentPath }}
                                      className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                                    >
                                      <CalendarClock className="h-4 w-4" />
                                      {requestExecutionAction.ctaLabel}
                                    </Link>
                                  ) : null}
                                  <Link
                                    to={requestReviewHref}
                                    state={{ from: currentPath }}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    {tr('Open request', 'Ouvrir la demande')}
                                  </Link>
                                </div>
                              </article>
                            );
                          })()
                        ))}
                      </div>
                    </div>
                  </OperationsCollapseCard>

                </div>
              ) : !isOperationsWorkspaceRoute ? (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">{tr('Total requests', 'Demandes totales')}</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.total}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-600">{tr('Pending', 'En attente')}</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.pending}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">{tr('Approved by owner', 'Approuvées par le propriétaire')}</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.preApproved}</p>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">{tr('Declined', 'Refusées')}</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{bookingsSummary.declined}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {vehicleRequests.slice(0, 8).map((request) => (
                      (() => {
                        const requestExecutionAction = getOwnerExecutionActionConfig(request, tr);
                        const requestReviewHref = buildOwnerExecutionWorkspaceHref(request, { focus: 'request' });

                        return (
                          <article key={request.id} id={`vehicle-request-${String(request.id)}`} className={workspaceInsetPanelClass}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-950">{request?.customerName || tr('Customer request', 'Demande client')}</p>
                              <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${getMarketplaceStatusTone(request?.requestStatus)}`}>
                                {getMarketplaceStatusLabel(request?.requestStatus)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                              <span>{request?.customerEmail || request?.customerPhone || '—'}</span>
                              <span>•</span>
                              <span>{formatDateTime(request?.requestedStartAt, isFrench ? 'fr' : 'en')}</span>
                            </div>
                            {request?.requestedEndAt ? (
                              <p className="mt-2 text-xs font-semibold text-slate-500">
                                {tr('Until', 'Jusqu’au')} {formatDateTime(request.requestedEndAt, isFrench ? 'fr' : 'en')}
                              </p>
                            ) : null}
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {request?.ownerResponse || request?.customerMessage || tr('No response yet.', 'Pas encore de réponse.')}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {requestExecutionAction?.href ? (
                                <Link
                                  to={requestExecutionAction.href}
                                  state={{ from: currentPath }}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                                >
                                  <CalendarClock className="h-4 w-4" />
                                  {requestExecutionAction.ctaLabel}
                                </Link>
                              ) : null}
                              <Link
                                to={requestReviewHref}
                                state={{ from: currentPath }}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {tr('Open request', 'Ouvrir la demande')}
                              </Link>
                            </div>
                          </article>
                        );
                      })()
                    ))}
                  </div>
                </>
              ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {tr('Booking requests will appear here once renters start a conversation.', 'Les demandes apparaîtront ici dès que les locataires démarrent une conversation.')}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {effectiveActiveTab === 'finance' ? (
        <SectionCard
          title={tr('Finance', 'Finance')}
          description={tr('Vehicle lifetime finance, acquisition, and cost history from the linked fleet vehicle.', 'Finance véhicule à vie, acquisition et historique des coûts depuis le véhicule flotte lié.')}
          icon={DollarSign}
        >
          {linkedFleetVehicleId ? (
            <div className="space-y-4">
              <section className={workspaceInsetPanelClass}>
                <h3 className="text-sm font-bold text-slate-950">{tr('Purchase details', 'Détails d’achat')}</h3>
                {isEditingVehicle ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <OwnerField label={tr('Purchase cost', 'Coût d’achat')}>
                      <input type="number" value={formData.purchaseCostMad} onChange={(event) => updateField('purchaseCostMad', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Purchase date', 'Date d’achat')}>
                      <input type="date" value={formData.purchaseDate} onChange={(event) => updateField('purchaseDate', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Supplier', 'Fournisseur')}>
                      <input value={formData.purchaseSupplier} onChange={(event) => updateField('purchaseSupplier', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <OwnerField label={tr('Purchase invoice link', "Lien de facture d'achat")}>
                      <input value={formData.purchaseInvoiceUrl} onChange={(event) => updateField('purchaseInvoiceUrl', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <ViewField label={tr('Purchase cost', 'Coût d’achat')} value={formData.purchaseCostMad ? formatMoney(formData.purchaseCostMad) : '—'} />
                    <ViewField label={tr('Purchase date', 'Date d’achat')} value={formatDate(formData.purchaseDate, isFrench ? 'fr' : 'en')} />
                    <ViewField label={tr('Supplier', 'Fournisseur')} value={formData.purchaseSupplier} />
                    <ViewField label={tr('Purchase invoice link', "Lien de facture d'achat")} value={formData.purchaseInvoiceUrl} />
                  </div>
                )}
              </section>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">{tr('Lifetime revenue', 'Revenus à vie')}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(vehicleFinanceOverview?.lifetimeRevenue || 0)}</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">{tr('Lifetime costs', 'Coûts à vie')}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(vehicleFinanceOverview?.lifetimeTotalCosts || 0)}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">{tr('Purchase cost', 'Coût d’achat')}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(formData.purchaseCostMad || 0)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Net result', 'Résultat net')}</p>
                  <p className={`mt-2 text-2xl font-black ${(vehicleFinanceOverview?.grossProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {(vehicleFinanceOverview?.grossProfit || 0) >= 0 ? '+' : ''}{formatMoney(vehicleFinanceOverview?.grossProfit || 0)}
                  </p>
                </div>
              </div>

              <section className={workspaceInsetPanelClass}>
                <h3 className="text-sm font-bold text-slate-950">{tr('Acquisition record', 'Fiche acquisition')}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoRow label={tr('Purchase cost', 'Coût d’achat')} value={formatMoney(formData.purchaseCostMad || 0)} />
                  <InfoRow label={tr('Purchase date', 'Date d’achat')} value={formatDate(formData.purchaseDate, isFrench ? 'fr' : 'en')} />
                  <InfoRow label={tr('Supplier', 'Fournisseur')} value={formData.purchaseSupplier || '—'} />
                  <InfoRow label={tr('Invoice', 'Facture')} value={formData.purchaseInvoiceUrl ? tr('Attached', 'Jointe') : tr('Not attached', 'Non jointe')} />
                </div>
              </section>

              <section className={workspaceMetricCardClass}>
                <h3 className="text-sm font-bold text-slate-950">{tr('Cost breakdown', 'Répartition des coûts')}</h3>
                {vehicleFinanceCostRows.length ? (
                  <div className="mt-3 space-y-2">
                    {vehicleFinanceCostRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="text-sm font-medium text-slate-600">{row.label}</span>
                        <span className="text-sm font-bold text-slate-950">{formatMoney(row.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    {tr('No cost history yet for this vehicle.', 'Aucun historique de coûts pour ce véhicule pour le moment.')}
                  </div>
                )}
              </section>

              <section className={workspaceMetricCardClass}>
                <h3 className="text-sm font-bold text-slate-950">{tr('Recent finance events', 'Événements financiers récents')}</h3>
                {Array.isArray(vehicleFinanceOverview?.events) && vehicleFinanceOverview.events.length ? (
                  <div className="mt-3 space-y-3">
                    {vehicleFinanceOverview.events.slice(0, 8).map((event, index) => (
                      <article key={`${event.source}-${event.date}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{event.eventType || event.source || tr('Finance event', 'Événement finance')}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDate(event.date, isFrench ? 'fr' : 'en')}</p>
                          </div>
                          <p className={`text-sm font-bold ${(event.net || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {(event.net || 0) >= 0 ? '+' : ''}{formatMoney(event.net || 0)}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    {tr('No finance events are available for this vehicle yet.', 'Aucun événement financier n’est encore disponible pour ce véhicule.')}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {tr('Save the vehicle profile once first so we can create the linked fleet vehicle and unlock finance history.', 'Enregistrez d’abord le profil véhicule afin que nous puissions créer le véhicule flotte lié et débloquer l’historique financier.')}
            </div>
          )}
        </SectionCard>
      ) : null}

      {effectiveActiveTab === 'legal' ? (
        <div className="space-y-4">
          <div id="legal-documents" className={getFocusedSectionClass(focusedSectionId, 'legal-documents')}>
          <SectionCard
            title={tr('Vehicle documents', 'Documents du véhicule')}
            description={tr('Upload the required files, then review the extracted details.', 'Téléversez les fichiers requis, puis vérifiez les détails extraits.')}
            icon={ShieldCheck}
          >
            <div className={`mt-6 ${workspaceInsetPanelClass}`}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
                  {tr('Step 3 of 6', 'Étape 3 sur 6')}
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-950">{tr('Upload and scan', 'Téléverser et scanner')}</h3>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  {tr(
                    'Add the registration and insurance files here so admin can review the vehicle.',
                    'Ajoutez ici les fichiers d’immatriculation et d’assurance afin que l’admin puisse vérifier le véhicule.'
                  )}
                </p>
              </div>
              <div className="mt-4">
                <VehicleDocuments
                  vehicleId={vehicle?.id || (isNewVehicle && user?.id ? `owner-draft-${user.id}` : resolvedVehicleId)}
                  storageVehicleIds={[draftUploadVehicleId]}
                  documents={vehicleDocuments}
                  onDocumentsChange={(nextDocuments) => {
                    setVehicleDocuments((current) => mergeVehicleDocuments(current, nextDocuments));
                  }}
                  onDeleteDocument={handleDeleteVehicleDocument}
                  loadFromStorage={!loading}
                  syncStorageToParent={true}
                  canDelete={true}
                  documentStatusMap={vehicleLegalDocumentStatusMap}
                />
              </div>
              {!vehicleLegalStepComplete ? (
                <div className="mt-4">
                  <DocumentUpload
                    vehicleId={vehicle?.id || (isNewVehicle && user?.id ? `owner-draft-${user.id}` : resolvedVehicleId)}
                    verificationEntityId={vehicleVerificationEntityId}
                    ownerUserId={user?.id || null}
                    documents={vehicleDocuments}
                    onDocumentsChange={(nextDocuments) => {
                      setVehicleDocuments((current) => mergeVehicleDocuments(current, nextDocuments));
                    }}
                    onOcrExtracted={handleVehicleLegalOcrExtracted}
                    onProcessingStateChange={setVehicleLegalProcessingState}
                    allowedCategoryValues={['registration', 'insurance']}
                    defaultCategory={nextVehicleLegalUploadCategory}
                    onUploadComplete={(updatedDocuments = []) => {
                      setVehicleDocuments((current) => mergeVehicleDocuments(current, updatedDocuments));
                      const hasVerificationBackedUpload = (Array.isArray(updatedDocuments) ? updatedDocuments : []).some(
                        (document) => String(document?.source || '').trim().toLowerCase() === 'verification'
                      );

                      if (hasVerificationBackedUpload || vehicleVerificationEntityId) {
                        void refreshVehicleVerificationDocuments();
                      }
                    }}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 shadow-sm">
                  <p className="font-bold text-emerald-900">
                    {tr('Vehicle documents complete', 'Documents du véhicule terminés')}
                  </p>
                  <p className="mt-1">
                    {tr(
                      vehicleVerificationReady
                        ? 'Registration and insurance are verified and ready.'
                        : vehicleLegalDocumentsUploaded && !vehicleLegalScanComplete
                          ? 'Registration and insurance are uploaded. You can continue setup while admin reviews them.'
                          : 'Registration and insurance were scanned and filled automatically.',
                      vehicleVerificationReady
                        ? 'L’immatriculation et l’assurance sont vérifiées et prêtes.'
                        : vehicleLegalDocumentsUploaded && !vehicleLegalScanComplete
                          ? 'L’immatriculation et l’assurance sont téléversées. Vous pouvez continuer pendant la revue admin.'
                          : 'L’immatriculation et l’assurance ont été scannées et remplies automatiquement.'
                    )}
                  </p>
                </div>
              )}
              {vehicleLegalScanCards.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {vehicleLegalScanCards.map((result) => (
                    <div
                      key={`${result.category}-${result.createdAt}`}
                      className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${
                        result.success
                          ? 'border-emerald-200 bg-emerald-50/80'
                          : result.pendingSave
                            ? 'border-violet-200 bg-violet-50/80'
                          : 'border-amber-200 bg-amber-50/80'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-950">{result.title}</p>
                          {result.documentName ? (
                            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                              {result.documentName}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                            result.success
                              ? 'bg-emerald-100 text-emerald-700'
                              : result.pendingSave
                                ? 'bg-violet-100 text-violet-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {result.success
                            ? tr('Completed', 'Terminé')
                            : result.pendingSave
                              ? tr('Processing', 'Traitement')
                              : tr('Request sent', 'Demande envoyée')}
                        </span>
                      </div>
                      {result.filledFieldLabels?.length ? (
                        <p className="mt-3 text-sm text-slate-700">
                          <span className="font-semibold">{tr('Filled:', 'Rempli :')}</span>{' '}
                          {result.filledFieldLabels.join(', ')}
                        </p>
                      ) : null}
                      {result.missingFieldLabels?.length ? (
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">{tr('Missing:', 'Manquant :')}</span>{' '}
                          {result.missingFieldLabels.join(', ')}
                        </p>
                      ) : null}
                      {!result.success && !result.pendingSave ? (
                        <p className="mt-3 text-sm text-slate-600">
                          {result.error || tr(
                            'You can complete the missing fields manually. This document has been sent to admin for review.',
                            'Vous pouvez compléter les champs manquants manuellement. Ce document a été envoyé à l’admin pour revue.'
                          )}
                        </p>
                      ) : null}
                      {result.pendingSave ? (
                        <p className="mt-3 text-sm text-slate-600">
                          {tr(
                            'The scan is complete. We are finishing the document save now.',
                            "Le scan est terminé. Nous finalisons maintenant l'enregistrement du document."
                          )}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </SectionCard>
          </div>

          <section className={workspacePanelClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
                  {vehicleLegalStepComplete ? tr('Step 3 complete', 'Étape 3 terminée') : tr('Still step 3', 'Toujours étape 3')}
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  {vehicleLegalStepComplete ? tr('Legal details', 'Détails légaux') : tr('Review extracted details', 'Vérifier les détails extraits')}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {vehicleLegalStepComplete
                    ? tr('Files are saved. Add or correct details only if you want to help admin review faster.', 'Les fichiers sont enregistrés. Ajoutez ou corrigez les détails seulement pour aider l’admin à vérifier plus vite.')
                    : tr('Check the scanned fields and fix anything missing before you continue.', 'Vérifiez les champs scannés et corrigez ce qui manque avant de continuer.')}
                </p>
              </div>
              {isEditingVehicle ? (
                <button
                  type="button"
                  onClick={() => void handleConfirmVehicleLegalDetails()}
                  disabled={saving || vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued}
                  className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(124,58,237,0.24)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? tr('Saving...', 'Enregistrement...') : tr('Save & continue', 'Enregistrer et continuer')}
                </button>
              ) : null}
            </div>
            {vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued ? (
              <div className="mt-4 rounded-[1.4rem] border border-violet-200 bg-violet-50 px-4 py-4 text-sm text-violet-800 shadow-sm">
                <p className="font-bold text-violet-950">
                  {tr('Scanning in progress', 'Scan en cours')}
                </p>
                <p className="mt-1">
                  {vehicleLegalProcessingState.queuedCategoryLabel
                    ? tr(
                        `We are finishing ${vehicleLegalProcessingState.currentCategoryLabel || 'this document'} now. ${vehicleLegalProcessingState.queuedCategoryLabel} is queued next automatically.`,
                        `Nous terminons maintenant ${vehicleLegalProcessingState.currentCategoryLabel || 'ce document'}. ${vehicleLegalProcessingState.queuedCategoryLabel} est déjà en attente ensuite automatiquement.`
                      )
                    : tr(
                        `We are scanning ${vehicleLegalProcessingState.currentCategoryLabel || 'this document'} now. Only the next highlighted document should be added while this finishes.`,
                        `Nous scannons maintenant ${vehicleLegalProcessingState.currentCategoryLabel || 'ce document'}. Seul le document suivant mis en évidence doit être ajouté pendant ce temps.`
                      )}
                </p>
              </div>
            ) : null}
            {isEditingVehicle ? (
              <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${(vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued) ? 'pointer-events-none opacity-70' : ''}`}>
                <OwnerField label={tr('Registration number', "Numéro d'immatriculation administratif")}>
                  <input disabled={vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued} value={formData.registrationNumber} onChange={(event) => updateField('registrationNumber', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Registration date', "Date d'immatriculation")}>
                  <input disabled={vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued} type="date" value={formData.registrationDate} onChange={(event) => updateField('registrationDate', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Registration expiry', "Expiration de l'immatriculation")}>
                  <input disabled={vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued} type="date" value={formData.registrationExpiryDate} onChange={(event) => updateField('registrationExpiryDate', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Policy number', "Numéro de police d'assurance")}>
                  <input disabled={vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued} value={formData.insurancePolicyNumber} onChange={(event) => updateField('insurancePolicyNumber', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Insurance provider', 'Assureur')}>
                  <input disabled={vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued} value={formData.insuranceProvider} onChange={(event) => updateField('insuranceProvider', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Insurance expiry', "Expiration de l'assurance")}>
                  <input disabled={vehicleLegalProcessingState.active || vehicleLegalProcessingState.queued} type="date" value={formData.insuranceExpiryDate} onChange={(event) => updateField('insuranceExpiryDate', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <ViewField label={tr('Registration number', "Numéro d'immatriculation administratif")} value={formData.registrationNumber} />
                <ViewField label={tr('Registration date', "Date d'immatriculation")} value={formatDate(formData.registrationDate, isFrench ? 'fr' : 'en')} />
                <ViewField label={tr('Registration expiry', "Expiration de l'immatriculation")} value={formatDate(formData.registrationExpiryDate, isFrench ? 'fr' : 'en')} />
                <ViewField label={tr('Policy number', "Numéro de police d'assurance")} value={formData.insurancePolicyNumber} />
                <ViewField label={tr('Insurance provider', 'Assureur')} value={formData.insuranceProvider} />
                <ViewField label={tr('Insurance expiry', "Expiration de l'assurance")} value={formatDate(formData.insuranceExpiryDate, isFrench ? 'fr' : 'en')} />
              </div>
            )}
          </section>

          <div id="annual-tax" className={getFocusedSectionClass(focusedSectionId, 'annual-tax')}>
          <SectionCard
            title={tr('Annual road tax (vignette)', 'Taxe routière annuelle (vignette)')}
            description={tr('Keep the linked annual tax record up to date.', 'Gardez la taxe annuelle liée à jour.')}
            icon={FileText}
          >
            {linkedFleetVehicleId ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    {tr('Add the annual payment, valid dates, and link the receipt from Documents if you have one.', 'Ajoutez le paiement annuel, les dates de validité, et liez le reçu depuis Documents si vous en avez un.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetTaxForm();
                      setTaxEditing(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <span className="text-base leading-none">+</span>
                    {tr('Add tax payment', 'Ajouter paiement')}
                  </button>
                </div>

                {taxEditing ? (
                  <div className={workspaceInsetPanelClass}>
                    <div className="grid gap-4 md:grid-cols-3">
                      <OwnerField label={tr('Year', 'Année')}>
                        <input type="number" value={taxForm.tax_year} onChange={(event) => handleTaxChange('tax_year', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={`${tr('Amount paid', 'Montant payé')} (MAD)`}>
                        <input type="number" min="0" step="0.01" value={taxForm.amount_mad} onChange={(event) => handleTaxChange('amount_mad', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Payment date', 'Date de paiement')}>
                        <input type="date" value={taxForm.payment_date} onChange={(event) => handleTaxChange('payment_date', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Valid from', 'Valide depuis')}>
                        <input type="date" value={taxForm.valid_from} onChange={(event) => handleTaxChange('valid_from', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Valid until', 'Valide jusqu’au')}>
                        <input type="date" value={taxForm.valid_until} onChange={(event) => handleTaxChange('valid_until', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <div className="space-y-2 text-sm text-slate-600">
                        <span className="block font-medium text-slate-900">{tr('Receipt media', 'Média du reçu')}</span>
                        <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-white px-4 py-3">
                          <p>
                            {getAnnualTaxDocumentForRecord(taxForm)
                              ? tr('Linked from Documents.', 'Lié depuis Documents.')
                              : tr('Upload the receipt in Documents using “Annual vehicle tax receipt”.', 'Téléversez le reçu dans Documents avec « Reçu de taxe annuelle véhicule ».')}
                          </p>
                          {getAnnualTaxDocumentForRecord(taxForm)?.url ? (
                            <a
                              href={getAnnualTaxDocumentForRecord(taxForm).url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {getAnnualTaxDocumentForRecord(taxForm).name || tr('Open linked receipt', 'Ouvrir le reçu lié')}
                            </a>
                          ) : (
                            <a href="#legal-documents" className="mt-2 inline-flex text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                              {tr('Go to Documents', 'Aller à Documents')}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <OwnerField label={tr('Notes', 'Notes')}>
                      <textarea value={taxForm.notes} onChange={(event) => handleTaxChange('notes', event.target.value)} className={`${baseFieldClassName} min-h-[88px] resize-y`} />
                    </OwnerField>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTaxRecord}
                        disabled={taxSaving}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(22,163,74,0.18)] disabled:opacity-60"
                      >
                        {taxSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {tr('Save tax payment', 'Enregistrer paiement')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTaxEditing(false);
                          resetTaxForm();
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                      >
                        {tr('Cancel', 'Annuler')}
                      </button>
                    </div>
                  </div>
                ) : null}

                {annualTaxRecords.length ? (
                  <div className="space-y-3">
                    {annualTaxRecords.map((record) => {
                      const linkedTaxDocument = getAnnualTaxDocumentForRecord(record);
                      const proofUrl = record.proof_url || linkedTaxDocument?.url;
                      const proofName = record.proof_name || linkedTaxDocument?.name;

                      return (
                        <article key={record.id} className={workspaceInsetPanelClass}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-950">{tr('Tax year', 'Année')} {record.tax_year}</p>
                            <span className="text-xs font-semibold text-slate-500">{formatDate(record.payment_date, isFrench ? 'fr' : 'en')}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{formatMoney(record.amount_mad || 0)}</p>
                          {record.valid_until ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {tr('Valid until', 'Valide jusqu’au')} {formatDate(record.valid_until, isFrench ? 'fr' : 'en')}
                            </p>
                          ) : null}
                          {proofName ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">
                              {tr('Receipt', 'Reçu')}: {proofName}
                            </p>
                          ) : null}
                          {record.notes ? <p className="mt-2 text-xs text-slate-500">{record.notes}</p> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {proofUrl ? (
                              <a
                                href={proofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {tr('Open receipt', 'Ouvrir reçu')}
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                resetTaxForm(record);
                                setTaxEditing(true);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700"
                            >
                              {tr('Edit', 'Modifier')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTaxRecord(record.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {tr('Delete', 'Supprimer')}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                    {tr('No annual tax payments recorded yet for this vehicle.', 'Aucun paiement annuel enregistré pour ce véhicule.')}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                {tr('Annual tax tracking will appear here after the linked fleet record is created on first save.', 'Le suivi de la taxe annuelle apparaîtra ici après la création de la fiche flotte liée lors du premier enregistrement.')}
              </div>
            )}
          </SectionCard>
          </div>
        </div>
      ) : null}

      {!vehicle && !canRenderOperationsFastShell ? (
        <div className={`${workspacePanelClass} border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{tr('This vehicle is not fully configured yet.', 'Ce véhicule n’est pas encore configuré.')}</span>
          </div>
        </div>
      ) : null}

      <Dialog
        open={showOwnerStartOdometerModal}
        onOpenChange={(open) => {
          setShowOwnerStartOdometerModal(open);
          if (!open) {
            setHandoffOdometerInput(
              hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer)
                ? String(ownerExecutionDraft.startOdometer)
                : ''
            );
          }
        }}
      >
        <DialogContent className="mx-auto w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-[28px] border border-violet-100 bg-white p-0 shadow-[0_30px_80px_rgba(76,29,149,0.16)] sm:rounded-[32px]">
          <DialogHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-slate-50 px-5 pb-4 pt-5 text-left">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-[18px] border border-violet-100 bg-violet-50 p-3 text-violet-700 shadow-sm">
                <Gauge className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[1.7rem] font-bold tracking-[-0.04em] text-slate-950">
                  {tr('Starting Odometer', 'Kilométrage de départ')}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-500">
                  {tr('Save the vehicle reading at pickup.', 'Enregistrez le relevé du véhicule au départ.')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5 pt-4">
            <div className="rounded-[24px] border border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 p-4 shadow-[0_12px_30px_rgba(76,29,149,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
                {tr('Current selection', 'Sélection actuelle')}
              </p>
              <p className="mt-3 text-[2.25rem] font-extrabold leading-none tracking-[-0.06em] text-slate-950 tabular-nums">
                {hasOwnerExecutionNumberValue(handoffOdometerInput) ? `${Number(handoffOdometerInput)} km` : '—'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tr('Vehicle reading', 'Relevé du véhicule')}
              </label>
              <input
                type="number"
                value={handoffOdometerInput}
                onChange={(event) => setHandoffOdometerInput(event.target.value)}
                placeholder={tr('Enter odometer reading', 'Saisissez le kilométrage')}
                className="w-full rounded-[22px] border border-slate-200 px-4 py-4 text-xl font-bold tracking-[-0.03em] text-slate-950 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                min="0"
                step="1"
                inputMode="numeric"
                disabled={ownerExecutionHandoffLocked || ownerExecutionSaving}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowOwnerStartOdometerModal(false)}
                disabled={ownerExecutionSaving}
                className="h-14 rounded-[20px] border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {tr('Cancel', 'Annuler')}
              </button>
              <button
                type="button"
                onClick={handleOwnerStartOdometerModalSave}
                disabled={ownerExecutionHandoffLocked || ownerExecutionSaving || !hasOwnerExecutionNumberValue(handoffOdometerInput)}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-[20px] bg-violet-700 text-base font-bold text-white shadow-[0_14px_34px_rgba(76,29,149,0.24)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <Save className="h-4 w-4" />
                {ownerExecutionSaving ? tr('Saving...', 'Enregistrement...') : tr('Save reading', 'Enregistrer')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FuelLevelModal
        isOpen={showOwnerStartFuelModal}
        onClose={() => setShowOwnerStartFuelModal(false)}
        onSave={handleOwnerStartFuelModalSave}
        currentLevel={
          hasOwnerExecutionNumberValue(ownerExecutionDraft.startFuelLevel)
            ? Number(ownerExecutionDraft.startFuelLevel)
            : null
        }
        title={tr('Starting Fuel Level', 'Niveau carburant départ')}
        description={tr('Select the fuel level before the rental starts.', 'Sélectionnez le niveau de carburant avant le départ.')}
        variant="light"
      />

      <Dialog
        open={showOwnerReturnOdometerModal}
        onOpenChange={(open) => {
          setShowOwnerReturnOdometerModal(open);
          if (!open) {
            setReturnOdometerInput(
              hasOwnerExecutionNumberValue(ownerExecutionDraft.returnOdometer)
                ? String(ownerExecutionDraft.returnOdometer)
                : ''
            );
          }
        }}
      >
        <DialogContent className="mx-auto w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-[28px] border border-violet-100 bg-white p-0 shadow-[0_30px_80px_rgba(76,29,149,0.16)] sm:rounded-[32px]">
          <DialogHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-slate-50 px-5 pb-4 pt-5 text-left">
            <DialogTitle className="flex items-center gap-3 text-[1.55rem] font-bold tracking-[-0.04em] text-slate-950">
              <Gauge className="h-6 w-6 text-violet-600" />
              {tr('Enter Ending Odometer Reading', "Saisir le kilométrage d'arrivée")}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-slate-500">
              {tr("Please enter the vehicle's odometer reading at the end of the rental.", "Veuillez saisir le kilométrage du véhicule à la fin de la location.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 pb-5 pt-4">
            <div className="rounded-[24px] border border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 p-4 shadow-[0_12px_30px_rgba(76,29,149,0.06)]">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-600" />
                <div>
                  <p className="text-sm leading-6 text-slate-700">
                    {tr("Please enter the vehicle's odometer reading at the end of the rental.", "Veuillez saisir le kilométrage du véhicule à la fin de la location.")}
                  </p>
                  {hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer) ? (
                    <p className="mt-3 text-sm font-semibold text-slate-900">
                      <strong>{tr('Starting odometer:', 'Kilométrage de départ :')}</strong> {Number(ownerExecutionDraft.startOdometer)} km
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900">
                {tr('Ending Odometer (km)', "Kilométrage d'arrivée (km)")}
              </label>
              <input
                type="number"
                value={returnOdometerInput}
                onChange={(event) => setReturnOdometerInput(event.target.value)}
                placeholder={tr('Enter ending odometer reading', "Saisissez le kilométrage d'arrivée")}
                className="mt-3 w-full rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-[2rem] font-extrabold leading-none tracking-[-0.05em] text-slate-950 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                min={hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer) ? Number(ownerExecutionDraft.startOdometer) : 0}
                step="1"
                autoFocus
                inputMode="numeric"
                disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <button
                type="button"
                onClick={() => setShowOwnerReturnOdometerModal(false)}
                disabled={ownerExecutionSaving}
                className="h-14 rounded-[20px] border border-slate-200 bg-white text-base font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {tr('Skip for Now', 'Passer pour le moment')}
              </button>
              <button
                type="button"
                onClick={handleOwnerReturnOdometerModalSave}
                disabled={
                  ownerExecutionReturnLocked ||
                  ownerExecutionSaving ||
                  !hasOwnerExecutionNumberValue(returnOdometerInput) ||
                  (hasOwnerExecutionNumberValue(ownerExecutionDraft.startOdometer) &&
                    Number(returnOdometerInput) < Number(ownerExecutionDraft.startOdometer))
                }
                className="inline-flex h-14 items-center justify-center gap-2 rounded-[20px] bg-violet-700 text-base font-bold text-white shadow-[0_14px_34px_rgba(76,29,149,0.24)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <Save className="h-4 w-4" />
                {ownerExecutionSaving ? tr('Saving...', 'Enregistrement...') : tr('Save Odometer', "Enregistrer l'odomètre")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FuelLevelModal
        isOpen={showOwnerReturnFuelModal}
        onClose={() => setShowOwnerReturnFuelModal(false)}
        onSave={handleOwnerReturnFuelModalSave}
        currentLevel={
          hasOwnerExecutionNumberValue(ownerExecutionDraft.returnFuelLevel)
            ? Number(ownerExecutionDraft.returnFuelLevel)
            : hasOwnerExecutionNumberValue(ownerExecutionDraft.startFuelLevel)
              ? Number(ownerExecutionDraft.startFuelLevel)
              : null
        }
        title={tr('Ending Fuel Level', 'Niveau carburant retour')}
        description={tr('Select the fuel level at return.', 'Sélectionnez le niveau de carburant au retour.')}
        variant="light"
      />

      <SignaturePadModal
        isOpen={showOwnerSignatureModal}
        onClose={() => setShowOwnerSignatureModal(false)}
        onSave={saveOwnerExecutionContractSignature}
        rentalId={`marketplace-${String(operationalRequest?.id || 'owner')}`}
        title={tr('Customer Signature', 'Signature du client')}
        description={tr('Have the renter sign before starting the rental.', 'Faites signer le locataire avant de démarrer la location.')}
      />

      <SignaturePadModal
        isOpen={showOwnerRefundSignatureModal}
        onClose={() => setShowOwnerRefundSignatureModal(false)}
        onSave={saveOwnerExecutionDepositRefundSignature}
        rentalId={`marketplace-${String(operationalRequest?.id || 'owner')}-deposit-refund`}
        title={tr('Deposit Refund Signature', 'Signature de remboursement caution')}
        description={tr(
          `Renter confirms receipt of ${formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')} refunded in full.`,
          `Le locataire confirme avoir reçu ${formatMoney(operationalRequest?.depositAmount || 0, operationalRequest?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')} remboursé en totalité.`
        )}
      />

      {vehicle?.listingId ? (
        <MessageWidget
          contextType="listing"
          contextId={String(vehicle.listingId)}
          contextLabel={tr('Listing review', "Revue de l'annonce")}
          contextTitle={formData.listingTitle || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Marketplace listing', 'Annonce marketplace')}
          contextSubtitle={
            listingReviewThreadHasVisibleMessages
              ? tr('Open the full review thread and reply here', 'Ouvrez le fil complet de revue et répondez ici')
              : tr('Review thread with the team', "Fil de revue avec l'équipe")
          }
          contextStatus={listingLabel}
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
          openRequestSignal={reviewThreadOpenSignal}
          replyTarget={listingReviewReplyTarget}
          seedThread={listingReviewSeedThread}
          listingSetupProgress={ownerListingSetupProgress}
        />
      ) : null}

      {!isOperationsWorkspaceRoute && !shouldCondenseReviewPublishChrome && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-6">
              <div className="pointer-events-auto mx-auto w-full max-w-6xl rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                    <div className="truncate">
                      {tr('Step', 'Étape')} {ownerListingSetupProgress.currentStep?.stepNumber || ownerListingSetupProgress.currentStepNumber}/{ownerListingSetupProgress.totalSteps} · {ownerListingSetupProgress.currentStep?.title || tr('Continue listing', "Continuer l'annonce")}
                    </div>
                    {ownerListingSetupProgress.currentStep?.detail ? (
                      <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
                        {ownerListingSetupProgress.currentStep.detail}
                      </p>
                    ) : null}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-[width] duration-300"
                        style={{ width: `${ownerListingSetupProgress.visualProgressPercent}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                      {(saving || footerPrimaryBusy) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      <span>{footerGuideStatusLabel}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
                    {ownerListingSetupProgress.progressPercent}%
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOwnerListingSetupStepAction(ownerListingSetupProgress.currentStep)}
                    disabled={!ownerListingSetupProgress.currentStep || saving || submitting || publishListingPending}
                    className="flex min-h-[68px] w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-4 text-base font-bold text-white shadow-[0_14px_30px_rgba(109,40,217,0.24)] transition-colors duration-150 hover:bg-violet-800 disabled:opacity-60"
                  >
                    {footerPrimaryBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    <span>{ownerListingSetupProgress.currentStep?.ctaLabel || tr('Continue', 'Continuer')}</span>
                  </button>
                </div>

                {isEditingVehicle ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                    <p className="text-[11px] font-medium text-slate-500">
                      {tr('Need a backup before moving on?', 'Besoin d’une sauvegarde avant de continuer ?')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSaveVehicle()}
                      disabled={saving || submitting}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
                      title={tr('Manual backup save for your current edits', 'Sauvegarde manuelle de secours pour vos modifications en cours')}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {tr('Manual save', 'Sauvegarde manuelle')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default AccountMarketplaceVehicleProfile;
