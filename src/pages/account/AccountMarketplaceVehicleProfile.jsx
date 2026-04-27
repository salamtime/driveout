import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Car,
  CheckCircle2,
  Edit,
  ExternalLink,
  FileText,
  Droplets,
  DollarSign,
  Loader2,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Gauge,
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
import BusinessMarketplaceService, { getMarketplaceStatusLabel, getMarketplaceStatusTone, getVehiclePhotoRequirementStatus, validateOwnerVehicleForm } from '../../services/BusinessMarketplaceService';
import FuelTransactionService from '../../services/FuelTransactionService';
import VehicleAnnualTaxService from '../../services/VehicleAnnualTaxService';
import { financeApiV2 } from '../../services/financeApiV2';
import VerificationService from '../../services/VerificationService';
import DocumentUpload from '../../components/DocumentUpload';
import VehicleDocuments from '../../components/VehicleDocuments';
import VehicleImageUpload from '../../components/VehicleImageUpload';
import MessageWidget from '../../components/messages/MessageWidget';
import { getOtherParty } from '../../components/messages/threadHelpers';
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
import { getVerificationTypeLabel, VEHICLE_REQUIRED_VERIFICATIONS } from '../../utils/verificationStatus';
import { getMarketplaceFundsPolicy, getMarketplaceMoneyBreakdown, normalizeMarketplaceRequestLifecycleStatus } from '../../utils/marketplaceRequestState';
import { MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES } from '../../utils/messageCenter';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { getCurrentLocationPath, resolveReturnPath } from '../../utils/navigationReturn';
import { supabase } from '../../lib/supabase';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';
import RentalEvidenceGallery from '../../components/account/RentalEvidenceGallery';
import RentalPhotoEvidenceCapture from '../../components/account/RentalPhotoEvidenceCapture';
import MessageAttachmentService from '../../services/MessageAttachmentService';
import RentalEventService from '../../services/RentalEventService';
import { normalizeVehicleImageUrl } from '../../utils/vehicleImage';

const RENTAL_PHOTOS_TABLE = 'rental_photos';

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const LAST_OWNER_VEHICLE_ID_KEY = 'saharax_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'saharax_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'saharax_owner_vehicle_ids';
const OWNER_EXECUTION_FLOW_KEY = 'saharax_owner_execution_flow';

const buildOwnerVehicleStorageKey = (baseKey, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const buildOwnerExecutionStorageKey = (requestId, userId = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return '';
  return buildOwnerVehicleStorageKey(`${OWNER_EXECUTION_FLOW_KEY}:${normalizedRequestId}`, userId);
};

const createOwnerExecutionDraft = () => ({
  handoffChecked: false,
  handoffMediaReady: false,
  handoffPhotos: [],
  startOdometer: '',
  startFuelLevel: '',
  legalDocsChecked: false,
  depositConfirmed: false,
  contractSigned: false,
  startReadyAt: null,
  startedAt: null,
  returnPendingAt: null,
  returnMediaReady: false,
  returnPhotos: [],
  returnOdometer: '',
  returnFuelLevel: '',
  issueReviewed: false,
  issueReported: false,
  depositReviewed: false,
  depositOutcome: '',
  returnSavedAt: null,
});

const normalizeOwnerExecutionPhotos = (photos) =>
  (Array.isArray(photos) ? photos : [])
    .map((photo, index) => ({
      id: String(photo?.id || `owner-photo-${index}`).trim(),
      kind: String(photo?.kind || 'photo').trim().toLowerCase() || 'photo',
      bucket: String(photo?.bucket || '').trim(),
      storagePath: String(photo?.storagePath || photo?.storage_path || '').trim(),
      publicUrl: String(photo?.publicUrl || photo?.public_url || '').trim(),
      thumbnailUrl: String(photo?.thumbnailUrl || photo?.thumbnail_url || photo?.publicUrl || photo?.public_url || '').trim(),
      mimeType: String(photo?.mimeType || photo?.mime_type || '').trim().toLowerCase(),
      originalFilename: String(photo?.originalFilename || photo?.original_filename || '').trim(),
      fileSize: Number(photo?.fileSize || photo?.file_size || 0) || 0,
      uploadedAt: photo?.uploadedAt || photo?.uploaded_at || null,
    }))
    .filter((photo) => photo.publicUrl || photo.thumbnailUrl);

const OWNER_HANDOFF_MIN_PHOTOS = 3;
const OWNER_RETURN_MIN_PHOTOS = 3;

const normalizeOwnerExecutionDraft = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    handoffChecked: Boolean(raw.handoffChecked),
    handoffMediaReady: Boolean(raw.handoffMediaReady) || normalizeOwnerExecutionPhotos(raw.handoffPhotos).length >= OWNER_HANDOFF_MIN_PHOTOS,
    handoffPhotos: normalizeOwnerExecutionPhotos(raw.handoffPhotos),
    startOdometer:
      raw.startOdometer === null || raw.startOdometer === undefined || raw.startOdometer === ''
        ? ''
        : String(raw.startOdometer),
    startFuelLevel:
      raw.startFuelLevel === null || raw.startFuelLevel === undefined || raw.startFuelLevel === ''
        ? ''
        : String(raw.startFuelLevel),
    legalDocsChecked: Boolean(raw.legalDocsChecked),
    depositConfirmed: Boolean(raw.depositConfirmed),
    contractSigned: Boolean(raw.contractSigned),
    startReadyAt: raw.startReadyAt || null,
    startedAt: raw.startedAt || null,
    returnPendingAt: raw.returnPendingAt || null,
    returnMediaReady: Boolean(raw.returnMediaReady) || normalizeOwnerExecutionPhotos(raw.returnPhotos).length >= OWNER_RETURN_MIN_PHOTOS,
    returnPhotos: normalizeOwnerExecutionPhotos(raw.returnPhotos),
    returnOdometer:
      raw.returnOdometer === null || raw.returnOdometer === undefined || raw.returnOdometer === ''
        ? ''
        : String(raw.returnOdometer),
    returnFuelLevel:
      raw.returnFuelLevel === null || raw.returnFuelLevel === undefined || raw.returnFuelLevel === ''
        ? ''
        : String(raw.returnFuelLevel),
    issueReviewed: Boolean(raw.issueReviewed),
    issueReported: Boolean(raw.issueReported),
    depositReviewed: Boolean(raw.depositReviewed),
    depositOutcome: String(raw.depositOutcome || '').trim().toLowerCase(),
    returnSavedAt: raw.returnSavedAt || null,
  };
};

const isOwnerExecutionHandoffLocked = (draft = {}, requestStatus = '') => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(requestStatus);
  return Boolean(
    draft?.startedAt ||
    draft?.returnPendingAt ||
    draft?.returnSavedAt ||
    ['active', 'completed'].includes(normalizedStatus)
  );
};

const isOwnerExecutionReturnLocked = (draft = {}, requestStatus = '') => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(requestStatus);
  return Boolean(draft?.returnSavedAt || normalizedStatus === 'completed');
};

const OWNER_HANDOFF_STEPS = [
  {
    key: 'handoff_check',
    label: { en: 'Handoff check', fr: 'Contrôle départ' },
    note: { en: 'Confirm pickup is ready.', fr: 'Confirmez que le départ est prêt.' },
    gate: (draft) => Boolean(draft.handoffChecked),
  },
  {
    key: 'vehicle_photos',
    label: { en: 'Vehicle photos', fr: 'Photos véhicule' },
    note: { en: 'Capture clear pickup photos.', fr: 'Capturez des photos claires du départ.' },
    gate: (draft) => Boolean(draft.handoffMediaReady),
  },
  {
    key: 'start_odometer',
    label: { en: 'Odometer input', fr: 'Saisie compteur' },
    note: { en: 'Record the starting odometer.', fr: 'Enregistrez le kilométrage de départ.' },
    gate: (draft) => Number.isFinite(Number(draft.startOdometer)) && Number(draft.startOdometer) >= 0,
  },
  {
    key: 'start_fuel',
    label: { en: 'Fuel level', fr: 'Niveau carburant' },
    note: { en: 'Set the starting fuel level.', fr: 'Définissez le niveau de carburant de départ.' },
    gate: (draft) => Number.isFinite(Number(draft.startFuelLevel)) && Number(draft.startFuelLevel) >= 0,
  },
  {
    key: 'legal_docs',
    label: { en: 'Registration + insurance', fr: 'Carte grise + assurance' },
    note: { en: 'Check the documents before handoff.', fr: 'Contrôlez les documents avant le départ.' },
    gate: (draft) => Boolean(draft.legalDocsChecked),
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
    label: { en: 'Return photos', fr: 'Photos retour' },
    note: { en: 'Capture the vehicle on return.', fr: 'Capturez le véhicule au retour.' },
    gate: (draft) => Boolean(draft.returnMediaReady),
  },
  {
    key: 'return_odometer',
    label: { en: 'Odometer input', fr: 'Saisie compteur' },
    note: { en: 'Record the final odometer reading.', fr: 'Enregistrez le kilométrage final.' },
    gate: (draft) =>
      Number.isFinite(Number(draft.returnOdometer)) &&
      Number(draft.returnOdometer) >= 0 &&
      (!Number.isFinite(Number(draft.startOdometer)) || Number(draft.returnOdometer) >= Number(draft.startOdometer)),
  },
  {
    key: 'return_fuel',
    label: { en: 'Fuel level input', fr: 'Saisie carburant' },
    note: { en: 'Capture the fuel level on return.', fr: 'Capturez le niveau de carburant au retour.' },
    gate: (draft) => Number.isFinite(Number(draft.returnFuelLevel)) && Number(draft.returnFuelLevel) >= 0,
  },
  {
    key: 'issue_report',
    label: { en: 'Issue report', fr: 'Rapport incident' },
    note: { en: 'Record any issue or mark no issue.', fr: 'Enregistrez un incident ou marquez aucun incident.' },
    gate: (draft) => Boolean(draft.issueReviewed),
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

const mapDraftVehicleStorageImages = (vehicleId, files = []) =>
  (Array.isArray(files) ? files : [])
    .filter((file) => file?.name && !String(file.name).endsWith('/'))
    .map((file, index) => {
      const fileName = String(file.name || '').trim();
      const shotTypeMatch = fileName.match(/^(hero|context|detail)__/i);
      const shotType = shotTypeMatch?.[1]?.toLowerCase() || null;
      const { data: urlData } = supabase.storage
        .from('vehicle-images')
        .getPublicUrl(`${vehicleId}/${fileName}`);

      return {
        id: file.id || `draft-media-${index}`,
        url: normalizeVehicleImageUrl(urlData?.publicUrl || ''),
        type: 'image',
        name: fileName,
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
  tr,
}) => {
  const missingItems = Array.isArray(missingChecklistItems) ? missingChecklistItems : [];
  const hasMissingChecklistItems = missingItems.length > 0;

  if (!hasStartedDraft) {
    return {
      title: tr('Start with this vehicle', 'Commencez par ce véhicule'),
      body: tr('Add the vehicle, legal details, and listing setup first. The full review button will unlock after that.', "Ajoutez d'abord le véhicule, les informations légales et la configuration de l'annonce. Le bouton d'envoi complet se débloquera ensuite."),
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      ready: false,
    };
  }

  if (!ownerVerificationReady) {
    return {
      title: tr('Finish owner trust first', "Terminez d'abord la confiance propriétaire"),
      body: tr(
        'Your driver license and profile ID must be approved before this vehicle can move into marketplace review.',
        "Votre permis de conduire et votre pièce d'identité doivent être approuvés avant que ce véhicule puisse passer en revue marketplace."
      ),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  if (!marketplaceVerificationReady) {
    return {
      title: tr('Documents already go to admin', "Les documents partent déjà à l'admin"),
      body: tr('Registration and insurance uploads are sent automatically for verification. Once vehicle verification is approved, you can send the full package for review in one step.', "Les téléversements d'immatriculation et d'assurance partent automatiquement en vérification. Une fois le véhicule approuvé, vous pourrez envoyer tout le dossier en une seule étape."),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  if (hasMissingChecklistItems) {
    return {
      title: tr('Finish the last setup tasks', 'Terminez les dernières tâches'),
      body: tr(
        'Complete the remaining checklist items below to unlock one full review send.',
        "Terminez les dernières tâches ci-dessous pour débloquer un seul envoi complet en revue."
      ),
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      ready: false,
    };
  }

  return {
    title: tr('Send one full review', 'Envoyer une revue complète'),
    body: tr('Send the vehicle, documents, and listing package together. After approval, you can publish whenever you are ready.', "Envoyez ensemble le véhicule, les documents et l'annonce. Après approbation, vous publierez quand vous serez prêt."),
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    ready: true,
  };
};

const getMarketplaceMilestoneMeta = ({
  effectiveMarketplaceJourneyState,
  canSendFullReview,
  nextMarketplaceChecklistItem,
  completedMarketplaceChecklistCount,
  totalMarketplaceChecklistCount,
  tr,
}) => {
  if (effectiveMarketplaceJourneyState === 'live') {
    return {
      badge: tr('Milestone reached', 'Palier atteint'),
      title: tr('Listing is live', "L'annonce est en ligne"),
      body: tr('Your marketplace journey is complete. You can now manage bookings and keep the listing fresh.', "Votre parcours marketplace est terminé. Vous pouvez maintenant gérer les réservations et garder l'annonce à jour."),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  if (effectiveMarketplaceJourneyState === 'approved') {
    return {
      badge: tr('Next milestone', 'Prochain palier'),
      title: tr('Publish when ready', 'Publier quand vous êtes prêt'),
      body: tr('Admin approval is complete. The only step left is going live.', "L'approbation admin est terminée. Il ne reste plus qu'à publier."),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  if (effectiveMarketplaceJourneyState === 'pending_review') {
    return {
      badge: tr('Next milestone', 'Prochain palier'),
      title: tr('Wait for admin review', "Attendre la revue admin"),
      body: tr('Your full package is already in review. The next update will appear here automatically.', "Votre dossier complet est déjà en revue. La prochaine mise à jour apparaîtra ici automatiquement."),
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    };
  }

  if (canSendFullReview) {
    return {
      badge: tr('Next milestone', 'Prochain palier'),
      title: tr('Send full review', 'Envoyer la revue complète'),
      body: tr('Everything required is ready. Send the full package to move this vehicle into review.', "Tout le nécessaire est prêt. Envoyez le dossier complet pour faire passer ce véhicule en revue."),
      tone: 'border-violet-200 bg-violet-50 text-violet-800',
    };
  }

  return {
    badge: tr('Progress', 'Progression'),
    title: nextMarketplaceChecklistItem
      ? tr('Keep going', 'Continuez')
      : tr('Start setup', 'Commencez la configuration'),
    body: nextMarketplaceChecklistItem
      ? `${tr('Complete next:', 'Complétez ensuite :')} ${nextMarketplaceChecklistItem.label}`
      : `${completedMarketplaceChecklistCount}/${totalMarketplaceChecklistCount} ${tr('tasks finished', 'tâches terminées')}`,
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
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
      note: tr('Everything is confirmed. Complete pickup, collect evidence, and start the rental.', 'Tout est confirmé. Finalisez le départ, collectez les preuves et démarrez la location.'),
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
      window.localStorage.getItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId)) || '[]'
    );
    const normalizedIds = Array.isArray(existingIds)
      ? existingIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const nextIds = Array.from(new Set([...normalizedIds, String(vehicleId).trim()]));
    window.localStorage.setItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId), JSON.stringify(nextIds));
    window.localStorage.setItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, userId), String(vehicleId));
    if (options.incrementCount) {
      const currentCount = Number.parseInt(
        window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId)) || '0',
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
      window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId)) || '0',
      10
    );
    const savedIds = JSON.parse(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId)) || '[]'
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

const getEffectiveMarketplaceJourneyState = ({
  marketplaceVerificationReady,
  hasStartedDraft,
  listingStatus,
  reviewStatus,
  moderationStatus,
}) => {
  const normalizedListing = String(listingStatus || '').trim().toLowerCase();
  const normalizedReview = String(reviewStatus || '').trim().toLowerCase();
  const normalizedModeration = String(moderationStatus || '').trim().toLowerCase();

  if (!hasStartedDraft) return 'not_started';
  if (!marketplaceVerificationReady) return 'verification_required';
  if (normalizedListing === 'live') return 'live';
  if (normalizedListing === 'approved' || normalizedReview === 'approved') return 'approved';
  if (normalizedListing === 'pending_review' || normalizedReview === 'pending_review' || normalizedModeration === 'pending_review') return 'pending_review';
  if (normalizedModeration === 'changes_requested') return 'changes_requested';
  if (normalizedListing === 'rejected' || normalizedReview === 'rejected') return 'rejected';
  return 'draft';
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
        listingLabel: tr('In review', 'En revue'),
        reviewLabel: tr('In review', 'En revue'),
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

const SectionCard = ({ title, description, icon: Icon, children }) => (
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

const OwnerFuelLevelPicker = ({ value, onChange, disabled = false, tr, litersLabel = '' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-slate-950">{tr('Starting fuel level', 'Niveau de carburant de départ')}</p>
        <p className="mt-1 text-sm text-slate-500">{tr('Choose one of the 8 fuel lines before pickup.', 'Choisissez un des 8 niveaux avant le départ.')}</p>
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
            onClick={() => onChange(option)}
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
  const { user, userProfile, activatePrivateOwnerAccount } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditingVehicle, setIsEditingVehicle] = useState(isNewVehicle);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [vehicleLegalScanResults, setVehicleLegalScanResults] = useState({});
  const [formData, setFormData] = useState(() => buildFormData(null));
  const [fieldErrors, setFieldErrors] = useState({});
  const [vehicleRequests, setVehicleRequests] = useState([]);
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
  const [reviewThreadOpenSignal, setReviewThreadOpenSignal] = useState(0);
  const [ownerExecutionDraft, setOwnerExecutionDraft] = useState(() => createOwnerExecutionDraft());
  const [ownerExecutionSaving, setOwnerExecutionSaving] = useState(false);
  const [handoffOdometerInput, setHandoffOdometerInput] = useState('');
  const [returnOdometerInput, setReturnOdometerInput] = useState('');

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

    if (getKnownOwnerVehicleCount(user?.id) > 1) {
      return '/account/vehicles';
    }

    return '/account/vehicles';
  }, [location, user?.id]);
  const currentPath = useMemo(() => getCurrentLocationPath(location), [location]);
  const resolvedVehicleId = vehicle?.id || vehicleId;
  const linkedFleetVehicleId = getLinkedFleetVehicleIdFromProfile(vehicle?.rawProfile, vehicle);
  const vehicleVerificationEntityId = linkedFleetVehicleId || null;
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
        const { data: files, error: listError } = await supabase.storage
          .from('vehicle-images')
          .list(String(draftUploadVehicleId), { limit: 50, offset: 0 });

        if (listError || cancelled) {
          return;
        }

        const storageMedia = mapDraftVehicleStorageImages(draftUploadVehicleId, files);
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
      setError((current) => (silent ? current : ''));
      const [result, ownerVerificationResult] = await Promise.all([
        BusinessMarketplaceService.getOwnerVehicle(user.id, vehicleId),
        VerificationService.getEntityVerificationSummary('user', user.id).catch(() => ({ summary: null })),
      ]);
      if (result?.error && !result?.vehicle) {
        throw result.error;
      }
      const nextVehicle = result?.vehicle || null;
      const nextVehicleVerificationEntityId = getLinkedFleetVehicleIdFromProfile(nextVehicle?.rawProfile, nextVehicle);
      const verificationFileResult = nextVehicleVerificationEntityId
        ? await VerificationService.getEntityVerificationFile('vehicle', nextVehicleVerificationEntityId, { forceRefresh: silent }).catch(() => ({ summary: null, requests: [] }))
        : { summary: null, requests: [] };
      setVehicleVerificationSummary(verificationFileResult?.summary || null);
      setVehicleDocuments(mapVehicleVerificationRequestsToDocuments(verificationFileResult?.requests || []));
      setOwnerVerificationSummary(ownerVerificationResult?.summary || null);
      setVehicle(nextVehicle);
      setFormData(buildFormData(nextVehicle));
      setIsEditingVehicle(false);
      storeOwnerVehicleId(user?.id, nextVehicle?.id);
      const nextLinkedFleetVehicleId = getLinkedFleetVehicleIdFromProfile(nextVehicle?.rawProfile, nextVehicle);
      if (nextLinkedFleetVehicleId) {
        try {
          const [nextFuelState, nextAnnualTaxes, nextFinanceOverview] = await Promise.all([
            FuelTransactionService.getVehicleFuelState(nextLinkedFleetVehicleId),
            VehicleAnnualTaxService.listForVehicle(nextLinkedFleetVehicleId),
            financeApiV2.getVehicleFinanceData([nextLinkedFleetVehicleId], {}),
          ]);
          setVehicleFuelState(nextFuelState || null);
          setAnnualTaxRecords(Array.isArray(nextAnnualTaxes) ? nextAnnualTaxes : []);
          setVehicleFinanceOverview(nextFinanceOverview || null);
        } catch (_fuelError) {
          setVehicleFuelState(null);
          setAnnualTaxRecords([]);
          setVehicleFinanceOverview(null);
        }
      } else {
        setVehicleFuelState(null);
        setAnnualTaxRecords([]);
        setVehicleFinanceOverview(null);
      }
      if (nextVehicle?.id) {
        const ownerRequestsResult = await BusinessMarketplaceService.getOwnerRequests(user.id, 'all');
        const nextRequests = Array.isArray(ownerRequestsResult?.requests) ? ownerRequestsResult.requests : [];
        setVehicleRequests(
          nextRequests.filter((request) =>
            String(request?.vehiclePublicProfileId || '') === String(vehicleId || '') ||
            String(request?.listingId || '') === String(nextVehicle?.listingId || '')
          )
        );
      } else {
        setVehicleRequests([]);
      }
    },
    [isNewVehicle, user?.id, vehicleId]
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
    const requestedTab = new URLSearchParams(location.search).get('tab');
    if (!requestedTab) {
      setActiveTab('overview');
      return;
    }
    if (['overview', 'listing', 'bookings', 'finance', 'legal'].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [location.search, isNewVehicle]);

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
  const operationalRequest = useMemo(() => {
    const rows = Array.isArray(vehicleRequests) ? vehicleRequests : [];
    const candidates = rows.filter((row) =>
      ['pre_approved', 'approved', 'active', 'completed'].includes(String(row?.requestStatus || '').toLowerCase())
    );
    if (!candidates.length) return null;
    return [...candidates].sort((left, right) => {
      const priorityDelta = getOwnerExecutionPriority(left?.requestStatus) - getOwnerExecutionPriority(right?.requestStatus);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right?.updatedAt || right?.createdAt || 0).getTime() - new Date(left?.updatedAt || left?.createdAt || 0).getTime();
    })[0] || null;
  }, [vehicleRequests]);
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
    () => getOwnerExecutionMeta(operationalRequest?.requestStatus, tr),
    [operationalRequest?.requestStatus, tr]
  );
  const operationalFundsLifecycle = useMemo(() => {
    const status = String(operationalRequest?.requestStatus || '').trim().toLowerCase();
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
  }, [operationalRequest?.requestStatus, tr]);
  const operationalSettlementRules = useMemo(
    () => getMarketplaceFundsPolicy(tr),
    [tr]
  );
  const ownerExecutionStorageKey = useMemo(
    () => buildOwnerExecutionStorageKey(operationalRequest?.id, user?.id),
    [operationalRequest?.id, user?.id]
  );
  const ownerExecutionStage = useMemo(() => {
    const status = normalizeMarketplaceRequestLifecycleStatus(operationalRequest || 'pending');
    if (status === 'completed' || ownerExecutionDraft.returnSavedAt) return 'completed';
    if ((status === 'active' || ownerExecutionDraft.startedAt) && ownerExecutionDraft.returnPendingAt) return 'return_pending';
    if (status === 'active' || ownerExecutionDraft.startedAt) return 'live';
    if (status === 'approved' || ownerExecutionDraft.startReadyAt) return ownerExecutionDraft.startReadyAt ? 'ready_to_start' : 'handoff';
    if (status === 'pre_approved') return 'approved';
    return 'requested';
  }, [operationalRequest?.requestStatus, ownerExecutionDraft.returnPendingAt, ownerExecutionDraft.returnSavedAt, ownerExecutionDraft.startedAt, ownerExecutionDraft.startReadyAt]);
  const ownerExecutionHandoffLocked = useMemo(
    () => isOwnerExecutionHandoffLocked(ownerExecutionDraft, operationalRequest?.requestStatus),
    [ownerExecutionDraft, operationalRequest?.requestStatus]
  );
  const ownerExecutionStartedAt = useMemo(
    () => ownerExecutionDraft.startedAt || operationalRequest?.rawRequest?.counter_offer?.owner_execution?.startedAt || operationalRequest?.updatedAt || null,
    [operationalRequest?.rawRequest?.counter_offer?.owner_execution?.startedAt, operationalRequest?.updatedAt, ownerExecutionDraft.startedAt]
  );
  const ownerExecutionCanEndRental = useMemo(
    () => ownerExecutionStage === 'live' && Boolean(ownerExecutionStartedAt),
    [ownerExecutionStage, ownerExecutionStartedAt]
  );
  const ownerExecutionReturnLocked = useMemo(
    () => isOwnerExecutionReturnLocked(ownerExecutionDraft, operationalRequest?.requestStatus),
    [ownerExecutionDraft, operationalRequest?.requestStatus]
  );
  const ownerHandoffReady = useMemo(
    () => [
      ownerExecutionDraft.handoffChecked,
      ownerExecutionDraft.handoffMediaReady,
      Number.isFinite(Number(ownerExecutionDraft.startOdometer)) && Number(ownerExecutionDraft.startOdometer) >= 0,
      Number.isFinite(Number(ownerExecutionDraft.startFuelLevel)) && Number(ownerExecutionDraft.startFuelLevel) >= 0,
      ownerExecutionDraft.legalDocsChecked,
      ownerExecutionDraft.depositConfirmed,
      ownerExecutionDraft.contractSigned,
    ].every(Boolean),
    [
      ownerExecutionDraft.handoffChecked,
      ownerExecutionDraft.contractSigned,
      ownerExecutionDraft.depositConfirmed,
      ownerExecutionDraft.handoffMediaReady,
      ownerExecutionDraft.legalDocsChecked,
      ownerExecutionDraft.startFuelLevel,
      ownerExecutionDraft.startOdometer,
    ]
  );
  const ownerReturnReady = useMemo(
    () => [
      ownerExecutionDraft.returnMediaReady,
      Number.isFinite(Number(ownerExecutionDraft.returnOdometer)) &&
        Number(ownerExecutionDraft.returnOdometer) >= 0 &&
        (!Number.isFinite(Number(ownerExecutionDraft.startOdometer)) ||
          Number(ownerExecutionDraft.returnOdometer) >= Number(ownerExecutionDraft.startOdometer)),
      Number.isFinite(Number(ownerExecutionDraft.returnFuelLevel)) && Number(ownerExecutionDraft.returnFuelLevel) >= 0,
      ownerExecutionDraft.issueReviewed,
    ].every(Boolean),
    [
      ownerExecutionDraft.issueReviewed,
      ownerExecutionDraft.returnFuelLevel,
      ownerExecutionDraft.returnMediaReady,
      ownerExecutionDraft.startOdometer,
      ownerExecutionDraft.returnOdometer,
    ]
  );
  const ownerHandoffCurrentStep = useMemo(() => {
    if (!ownerExecutionDraft.handoffChecked) return OWNER_HANDOFF_STEPS[0];
    if (!ownerExecutionDraft.handoffMediaReady) return OWNER_HANDOFF_STEPS[1];
    if (!(Number.isFinite(Number(ownerExecutionDraft.startOdometer)) && Number(ownerExecutionDraft.startOdometer) >= 0)) return OWNER_HANDOFF_STEPS[2];
    if (!(Number.isFinite(Number(ownerExecutionDraft.startFuelLevel)) && Number(ownerExecutionDraft.startFuelLevel) >= 0)) return OWNER_HANDOFF_STEPS[3];
    if (!ownerExecutionDraft.legalDocsChecked) return OWNER_HANDOFF_STEPS[4];
    if (!ownerExecutionDraft.depositConfirmed) return OWNER_HANDOFF_STEPS[5];
    if (!ownerExecutionDraft.contractSigned) return OWNER_HANDOFF_STEPS[6];
    return OWNER_HANDOFF_STEPS[6];
  }, [
    ownerExecutionDraft.handoffChecked,
    ownerExecutionDraft.contractSigned,
    ownerExecutionDraft.depositConfirmed,
    ownerExecutionDraft.handoffMediaReady,
    ownerExecutionDraft.legalDocsChecked,
    ownerExecutionDraft.startFuelLevel,
    ownerExecutionDraft.startOdometer,
  ]);
  const ownerReturnCurrentStep = useMemo(() => {
    if (!ownerExecutionDraft.returnMediaReady) return OWNER_RETURN_STEPS[0];
    if (
      !(Number.isFinite(Number(ownerExecutionDraft.returnOdometer)) &&
        Number(ownerExecutionDraft.returnOdometer) >= 0 &&
        (!Number.isFinite(Number(ownerExecutionDraft.startOdometer)) ||
          Number(ownerExecutionDraft.returnOdometer) >= Number(ownerExecutionDraft.startOdometer)))
    ) return OWNER_RETURN_STEPS[1];
    if (!(Number.isFinite(Number(ownerExecutionDraft.returnFuelLevel)) && Number(ownerExecutionDraft.returnFuelLevel) >= 0)) return OWNER_RETURN_STEPS[2];
    if (!ownerExecutionDraft.issueReviewed) return OWNER_RETURN_STEPS[3];
    return OWNER_RETURN_STEPS[4];
  }, [
    ownerExecutionDraft.issueReviewed,
    ownerExecutionDraft.returnFuelLevel,
    ownerExecutionDraft.returnMediaReady,
    ownerExecutionDraft.startOdometer,
    ownerExecutionDraft.returnOdometer,
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
      const raw = window.localStorage.getItem(ownerExecutionStorageKey);
      setOwnerExecutionDraft(raw ? normalizeOwnerExecutionDraft(JSON.parse(raw)) : createOwnerExecutionDraft());
    } catch (storageError) {
      console.warn('Failed to restore owner execution flow:', storageError);
      setOwnerExecutionDraft(createOwnerExecutionDraft());
    }
  }, [operationalRequest?.ownerExecution, ownerExecutionStorageKey]);

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
        return;
      }

      const normalizedDraft = normalizeOwnerExecutionDraft(nextDraft);
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
            return {
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
          })
        );
      } catch (saveError) {
        console.warn('Failed to persist owner execution flow:', saveError);
      } finally {
        setOwnerExecutionSaving(false);
      }
    },
    [operationalRequest?.id, user?.id]
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
        ? tr('Photos uploaded', 'Photos téléversées')
        : tr('Photos uploaded', 'Photos téléversées'),
      attachments,
      metadata: {
        requestId: String(operationalRequest.id),
        requestStatus: operationalRequest.requestStatus,
        photoEvidenceKind: kind,
        photoEvidenceLabel: kind === 'handoff'
          ? tr('Pickup evidence', 'Preuve de départ')
          : tr('Return evidence', 'Preuve de retour'),
        href: `/account/vehicles?requestId=${encodeURIComponent(String(operationalRequest.id))}#requests`,
      },
    });
  }, [operationalRequest?.customerId, operationalRequest?.id, operationalRequest?.listingTitle, operationalRequest?.requestStatus, tr]);

  const sendOwnerExecutionSystemMessage = useCallback(async ({ body, event, requestStatus }) => {
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
        href: `/account/vehicles?requestId=${encodeURIComponent(String(operationalRequest.id))}#requests`,
      },
    });
  }, [operationalRequest?.customerId, operationalRequest?.id, operationalRequest?.listingTitle, operationalRequest?.requestStatus, tr]);

  const saveRentalPhotoRows = useCallback(async (kind, attachments = []) => {
    const rows = (Array.isArray(attachments) ? attachments : [])
      .filter((attachment) => attachment?.publicUrl)
      .map((attachment) => ({
        request_id: operationalRequest?.id || null,
        vehicle_id: vehicle?.id || null,
        phase: kind,
        kind: attachment?.kind || 'photo',
        bucket: attachment?.bucket || null,
        storage_path: attachment?.storagePath || null,
        public_url: attachment?.publicUrl,
        thumbnail_url: attachment?.thumbnailUrl || attachment?.publicUrl || null,
        mime_type: attachment?.mimeType || null,
        original_filename: attachment?.originalFilename || null,
        file_size: Number(attachment?.fileSize || 0) || 0,
        created_by: user?.id || null,
      }));

    if (!rows.length) return;

    try {
      await supabase.from(RENTAL_PHOTOS_TABLE).insert(rows);
    } catch (photoRowError) {
      console.warn('Failed to save rental photo rows:', photoRowError);
    }
  }, [operationalRequest?.id, user?.id, vehicle?.id]);

  const toggleOwnerExecutionFlag = useCallback((field) => {
    if (ownerExecutionHandoffLocked && ['handoffChecked', 'handoffMediaReady', 'legalDocsChecked', 'depositConfirmed', 'contractSigned'].includes(field)) {
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

  const saveOwnerExecutionReturnOdometer = useCallback((value) => {
    if (ownerExecutionReturnLocked) return;
    const normalizedValue = Number(value);
    const startOdometer = Number(ownerExecutionDraft.startOdometer);
    if (!Number.isFinite(normalizedValue) || normalizedValue < 0) return;
    if (Number.isFinite(startOdometer) && normalizedValue < startOdometer) return;

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

  const markOwnerExecutionReadyToStart = useCallback(() => {
    if (!ownerHandoffReady) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      startReadyAt: ownerExecutionDraft.startReadyAt || new Date().toISOString(),
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
    })();
  }, [ownerExecutionDraft, ownerHandoffReady, persistOwnerExecutionDraft, sendOwnerExecutionSystemMessage, tr]);

  const markOwnerExecutionStarted = useCallback(() => {
    if (!ownerExecutionDraft.startReadyAt || !ownerHandoffReady) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      startReadyAt: ownerExecutionDraft.startReadyAt || new Date().toISOString(),
      startedAt: ownerExecutionDraft.startedAt || new Date().toISOString(),
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft, 'active');
      await sendOwnerExecutionSystemMessage({
        body: tr('Rental started', 'Location démarrée'),
        event: 'started',
        requestStatus: 'active',
      });
    })();
  }, [ownerExecutionDraft, ownerHandoffReady, persistOwnerExecutionDraft, sendOwnerExecutionSystemMessage, tr]);

  const markOwnerExecutionReturnPending = useCallback(() => {
    if (!ownerExecutionCanEndRental) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      returnPendingAt: ownerExecutionDraft.returnPendingAt || new Date().toISOString(),
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft);
    })();
  }, [ownerExecutionCanEndRental, ownerExecutionDraft, persistOwnerExecutionDraft, sendOwnerExecutionSystemMessage, tr]);

  const setOwnerIssueReview = useCallback((issueReported) => {
    if (ownerExecutionReturnLocked) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      issueReviewed: true,
      issueReported: Boolean(issueReported),
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

  const saveOwnerReturnFlow = useCallback(() => {
    if (!ownerReturnReady || ownerExecutionReturnLocked) return;
    const nextDraft = {
      ...ownerExecutionDraft,
      returnSavedAt: ownerExecutionDraft.returnSavedAt || new Date().toISOString(),
    };
    void (async () => {
      await persistOwnerExecutionDraft(nextDraft, 'completed');
      await sendOwnerExecutionSystemMessage({
        body: tr('Rental completed', 'Location terminée'),
        event: 'completed',
        requestStatus: 'completed',
      });
    })();
  }, [ownerExecutionDraft, ownerExecutionReturnLocked, ownerReturnReady, persistOwnerExecutionDraft, sendOwnerExecutionSystemMessage, tr]);

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
          : {
              returnPhotos: stampedAttachments,
              returnMediaReady: stampedAttachments.length >= OWNER_RETURN_MIN_PHOTOS,
            }),
      };

      await persistOwnerExecutionDraft(nextDraft);
      await saveRentalPhotoRows(kind, stampedAttachments);
      await sendOwnerExecutionPhotoMessage({ kind, attachments: uploadedAttachments });
    } catch (photoError) {
      console.warn(`Failed to upload ${kind} execution photos:`, photoError);
      toast.error(photoError?.message || tr('Unable to upload photos right now.', 'Impossible de téléverser les photos pour le moment.'));
    } finally {
      setOwnerExecutionSaving(false);
    }
  }, [operationalRequest?.id, ownerExecutionDraft, persistOwnerExecutionDraft, saveRentalPhotoRows, sendOwnerExecutionPhotoMessage, tr, user?.id]);
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
        tr('Vehicle photos saved.', 'Photos du véhicule enregistrées.')
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

    setFormData((current) => {
      const updated = { ...current };

      if (success && extractedData) {
        const categoryFieldKeys = VEHICLE_LEGAL_OCR_FIELD_MAP[normalizedCategory] || [];

        categoryFieldKeys.forEach((fieldKey) => {
          const extractedValueMap = {
            registrationNumber: extractedData.registration_number,
            registrationDate: extractedData.registration_date,
            registrationExpiryDate: extractedData.registration_expiry_date,
            insurancePolicyNumber: extractedData.insurance_policy_number,
            insuranceProvider: extractedData.insurance_provider,
            insuranceExpiryDate: extractedData.insurance_expiry_date,
          };

          const value = extractedValueMap[fieldKey];
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
        pendingSave: Boolean(!persisted),
        success: Boolean(persisted && success && filledFieldLabels.length > 0 && combinedMissingFieldLabels.length === 0),
        requestSent: Boolean(
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
          : tr('Document scanned and legal fields updated.', 'Document scanné et champs légaux mis à jour.')
      );
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
    if (!vehicleVerificationEntityId) return;

    try {
      const verificationFileResult = await VerificationService.getEntityVerificationFile(
        'vehicle',
        vehicleVerificationEntityId,
        { forceRefresh: true }
      );

      setVehicleVerificationSummary(verificationFileResult?.summary || null);
      setVehicleDocuments(mapVehicleVerificationRequestsToDocuments(verificationFileResult?.requests || []));
    } catch (verificationRefreshError) {
      console.warn('Unable to refresh vehicle verification documents:', verificationRefreshError);
    }
  }, [vehicleVerificationEntityId]);

  const handleDeleteVehicleDocument = useCallback(async (deletedDocumentId) => {
    setVehicleDocuments((current) =>
      (Array.isArray(current) ? current : []).filter((document) => String(document?.id || '').trim() !== String(deletedDocumentId || '').trim())
    );

    await refreshVehicleVerificationDocuments();
  }, [refreshVehicleVerificationDocuments]);

  const persistVehicle = async (submitForReview = false, saveListing = false, overrideFormData = null, successMessageOverride = '') => {
    if (!user?.id) return;

    try {
      if (submitForReview) {
        setSubmitting(true);
      } else {
        setSaving(true);
      }
      setSaveError('');
      setSaveSuccess('');

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

      const result = await BusinessMarketplaceService.saveOwnerVehicle({
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
      });

      setVehicle(result?.vehicle || null);
      setFormData(buildFormData(result?.vehicle || null));
      storeOwnerVehicleId(user?.id, result?.vehicle?.id, { incrementCount: isNewVehicle });
      if (result?.vehicle?.id) {
        void activatePrivateOwnerAccount({ source: 'vehicle_saved' });
      }
      setFieldErrors({});
      setIsEditingVehicle(false);
      setTaxEditing(false);
      setSaveSuccess(
        successMessageOverride || (
          submitForReview
            ? tr('Full vehicle package sent for review.', 'Dossier complet du véhicule envoyé en revue.')
            : tr('Vehicle changes saved.', 'Modifications du véhicule enregistrées.')
        )
      );
      if (isNewVehicle && result?.vehicle?.id) {
        const nextTab = ['overview', 'listing', 'bookings', 'finance', 'legal'].includes(String(activeTab || '').toLowerCase())
          ? String(activeTab).toLowerCase()
          : 'overview';
        navigate(
          `/account/vehicles/${encodeURIComponent(String(result.vehicle.id))}/profile?tab=${encodeURIComponent(nextTab)}`,
          {
            replace: true,
            state: {
              ...(location.state || {}),
              from: location.state?.from || '/account/vehicles',
            },
          }
        );
      }
    } catch (saveErrorValue) {
      setSaveError(saveErrorValue?.message || tr('Unable to save this vehicle right now.', 'Impossible d’enregistrer ce véhicule pour le moment.'));
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const handleConfirmVehicleLegalDetails = async () => {
    await persistVehicle(
      false,
      false,
      null,
      tr('Legal details saved.', 'Détails légaux enregistrés.')
    );
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
    await persistVehicle(false, activeTab === 'listing');
  };

  const tabs = useMemo(() => {
    return [
      { key: 'overview', label: tr('Overview', 'Aperçu'), icon: Car },
      { key: 'listing', label: tr('Listing', 'Annonce'), icon: Store },
      { key: 'bookings', label: tr('Bookings', 'Réservations'), icon: CalendarClock },
      { key: 'finance', label: tr('Finance', 'Finance'), icon: DollarSign },
      { key: 'legal', label: tr('Legal & documents', 'Légal & documents'), icon: ShieldCheck },
    ];
  }, [isFrench]);

  if (loading && suppressBlockingLoader) {
    return <AccountWorkspaceLoadingShell cardCount={1} showStatsRow={false} showHeader={true} />;
  }

  if (loading && !suppressBlockingLoader) {
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
  const vehicleLegalStepComplete = vehicleVerificationReady || vehicleLegalScanComplete || (vehicleVerificationSubmitted && vehicleLegalFieldsComplete);
  const vehicleLegalManualFallbackSubmitted = vehicleVerificationSubmitted && !vehicleLegalStepComplete;
  const nextVehicleLegalUploadCategory =
    !registrationFieldsComplete && !vehicleVerificationLatestByType.vehicle_registration
      ? 'registration'
      : !insuranceFieldsComplete && !vehicleVerificationLatestByType.vehicle_insurance
        ? 'insurance'
        : !registrationFieldsComplete
          ? 'registration'
          : !insuranceFieldsComplete
            ? 'insurance'
            : 'registration';
  const marketplaceVerificationReady = ownerVerificationReady && vehicleVerificationReady;
  const verificationMissingLabels = [...ownerVerificationMissing, ...vehicleVerificationMissing].map((type) =>
    getVerificationTypeLabel(type, isFrench ? 'fr' : 'en')
  );
  const effectiveMarketplaceJourneyState = getEffectiveMarketplaceJourneyState({
    marketplaceVerificationReady,
    hasStartedDraft,
    listingStatus: vehicle?.listingStatus,
    reviewStatus: vehicle?.reviewStatus,
    moderationStatus: vehicle?.moderationStatus,
  });
  const marketplaceJourneyMeta = getMarketplaceJourneyMeta(effectiveMarketplaceJourneyState, tr);
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
  const ownerProfileAlerts = [
    formData.nextOilChangeDue ? { id: 'oil', label: tr('Oil change due', 'Vidange à prévoir') } : null,
    formData.registrationExpiryDate ? { id: 'registration', label: tr('Registration tracked', "Immatriculation suivie") } : null,
    insuranceExpired ? { id: 'insurance', label: tr('Insurance expired', 'Assurance expirée') } : null,
  ].filter(Boolean);
  const vehicleLegalScanCards = ['registration', 'insurance']
    .map((category) => vehicleLegalScanResults[category])
    .filter(Boolean)
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  const vehicleLegalDocumentStatusMap = {
    registration: vehicleVerificationReady || registrationScanComplete || (vehicleVerificationSubmitted && registrationFieldsComplete)
      ? {
          label: tr(vehicleVerificationReady ? 'Verified' : 'Verified by scan', vehicleVerificationReady ? 'Vérifié' : 'Vérifié par scan'),
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
    insurance: vehicleVerificationReady || insuranceScanComplete || (vehicleVerificationSubmitted && insuranceFieldsComplete)
      ? {
          label: tr(vehicleVerificationReady ? 'Verified' : 'Verified by scan', vehicleVerificationReady ? 'Vérifié' : 'Vérifié par scan'),
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
      label: tr('Go live', 'Mettre en ligne'),
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
    tr,
  });
  const ownerJourneyDisplay = canSendFullReview && !['pending_review', 'approved', 'live'].includes(effectiveMarketplaceJourneyState)
    ? {
        listingLabel: tr('Ready for review', 'Prêt pour revue'),
        reviewLabel: tr('Ready for review', 'Prêt pour revue'),
        tone: 'border-violet-200 bg-violet-50 text-violet-700',
      }
    : marketplaceJourneyMeta;
  const listingTone = ownerJourneyDisplay.tone;
  const listingLabel = ownerJourneyDisplay.listingLabel;
  const reviewLabel = ownerJourneyDisplay.reviewLabel;
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
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Verify owner', 'Vérifier le propriétaire'),
        body: '',
        actionLabel: tr('Open verification', 'Ouvrir la vérification'),
      }
    : ownerVerificationStatus === 'pending'
      ? {
          statusLabel: tr('Waiting', 'En attente'),
          statusTone: 'bg-amber-100 text-amber-700',
          title: tr('Verify owner', 'Vérifier le propriétaire'),
          body: tr(
            'Your ID and driver license were sent to admin. We are waiting for approval before the listing can move forward.',
            'Votre pièce et votre permis ont été envoyés à l’admin. Nous attendons l’approbation avant de faire avancer l’annonce.'
          ),
          actionLabel: tr('Open verification', 'Ouvrir la vérification'),
        }
      : {
          statusLabel: tr('Action required', 'Action requise'),
          statusTone: 'bg-violet-100 text-violet-700',
          title: tr('Verify owner', 'Vérifier le propriétaire'),
          body: tr(
            'Start with your profile ID and driver license. This must be approved before vehicle review can begin.',
            'Commencez par votre pièce d’identité et votre permis. Cela doit être approuvé avant de lancer la revue du véhicule.'
          ),
          actionLabel: tr('Complete step 1', 'Compléter l’étape 1'),
        };
  const vehicleBasicsComplete = Boolean(formData.brandName && formData.modelName && formData.plateNumber && formData.cityName);
  const ownerWorkflowStepTwo = vehicleBasicsComplete
    ? {
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Complete vehicle basics', 'Compléter les bases du véhicule'),
        body: '',
        actionLabel: tr('Open vehicle basics', 'Ouvrir les bases du véhicule'),
      }
    : {
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
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Upload legal documents', 'Téléverser les documents légaux'),
        body: '',
        actionLabel: tr('Open legal documents', 'Ouvrir les documents légaux'),
      }
    : vehicleLegalManualFallbackSubmitted
      ? {
          statusLabel: tr('Request sent', 'Demande envoyée'),
          statusTone: 'bg-amber-100 text-amber-700',
          title: tr('Upload legal documents', 'Téléverser les documents légaux'),
          body: tr(
            'Your legal documents were uploaded, but some fields still need manual completion. The request was sent to admin and is waiting for approval.',
            'Vos documents légaux ont été téléversés, mais certains champs demandent encore une saisie manuelle. La demande a été envoyée à l’admin et attend une approbation.'
          ),
          actionLabel: tr('Open legal documents', 'Ouvrir les documents légaux'),
        }
      : vehicleVerificationWaitingOnAdmin || vehicleVerificationSubmitted
      ? {
          statusLabel: tr('Waiting', 'En attente'),
          statusTone: 'bg-amber-100 text-amber-700',
          title: tr('Upload legal documents', 'Téléverser les documents légaux'),
          body: tr(
            'Your registration and insurance documents were sent to admin. We are waiting for vehicle verification approval.',
            'Vos documents d’immatriculation et d’assurance ont été envoyés à l’admin. Nous attendons l’approbation de la vérification véhicule.'
          ),
          actionLabel: tr('Open legal documents', 'Ouvrir les documents légaux'),
        }
      : {
          statusLabel: tr('Action required', 'Action requise'),
          statusTone: 'bg-violet-100 text-violet-700',
          title: tr('Upload legal documents', 'Téléverser les documents légaux'),
          body: tr(
            'Upload the registration and insurance files. Once they are sent, admin review can start automatically.',
          'Téléversez les fichiers d’immatriculation et d’assurance. Une fois envoyés, la revue admin peut commencer automatiquement.'
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
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Prepare the listing', "Préparer l'annonce"),
        body: '',
        actionLabel: tr('Open listing setup', "Ouvrir la configuration de l'annonce"),
      }
    : {
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
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Prepare pickup', 'Préparer le départ'),
        body: '',
        actionLabel: tr('Open pickup setup', 'Ouvrir la préparation du départ'),
      }
    : {
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
        statusLabel: tr('Done', 'Fait'),
        statusTone: 'bg-emerald-100 text-emerald-700',
        title: tr('Review and go live', 'Revoir et publier'),
        body: '',
        actionLabel: tr('View live status', 'Voir le statut en ligne'),
        actionMode: 'journey',
      }
    : effectiveMarketplaceJourneyState === 'approved'
      ? {
          statusLabel: tr('Action required', 'Action requise'),
          statusTone: 'bg-violet-100 text-violet-700',
          title: tr('Review and go live', 'Revoir et publier'),
          body: tr(
            'Admin approval is complete. The last step is publishing this listing live.',
            'L’approbation admin est terminée. La dernière étape consiste à publier cette annonce.'
          ),
          actionLabel: tr('Go live', 'Mettre en ligne'),
          actionMode: 'journey',
        }
      : effectiveMarketplaceJourneyState === 'pending_review'
        ? {
            statusLabel: tr('Waiting', 'En attente'),
            statusTone: 'bg-amber-100 text-amber-700',
            title: tr('Review and go live', 'Revoir et publier'),
            body: tr(
              'Your full package is already with admin. We are waiting for review before the listing can go live.',
              'Votre dossier complet est déjà chez l’admin. Nous attendons la revue avant que l’annonce puisse être publiée.'
            ),
            actionLabel: tr('Open messages', 'Ouvrir les messages'),
            actionMode: 'messages',
          }
        : canSendFullReview
          ? {
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
  const marketplaceMilestoneMeta = getMarketplaceMilestoneMeta({
    effectiveMarketplaceJourneyState,
    canSendFullReview,
    nextMarketplaceChecklistItem,
    completedMarketplaceChecklistCount,
    totalMarketplaceChecklistCount: marketplaceChecklist.length,
    tr,
  });
  const openMarketplaceChecklistTask = (item) => {
    if (!item) return;
    if (item.route) {
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
    setActiveTab(item.tab);
    setFocusedSectionId(item.section || '');
  };
  const handleOpenReviewThread = () => {
    if (!vehicle?.listingId) return;
    setReviewThreadOpenSignal((current) => current + 1);
  };

  return (
    <div className="space-y-5">
      <div className={`sticky top-0 z-30 ${workspaceShellClass}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => navigate(backLink)}
              className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              title={location.state?.from ? tr('Back', 'Retour') : tr('Back to marketplace', 'Retour à marketplace')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className={workspaceEyebrowClass}>{tr('Vehicle Profile', 'Profil véhicule')}</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
                {formData.plateNumber || [formData.brandName, formData.modelName].filter(Boolean).join(' ') || tr('Vehicle profile', 'Profil véhicule')}
              </h1>
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
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {vehicle?.listingId && listingIsLive ? (
              <a
                href={`/marketplace/marketplace-${encodeURIComponent(String(vehicle.listingId))}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ExternalLink className="w-4 h-4" />
                {tr('View public listing', 'Voir la fiche publique')}
              </a>
            ) : null}
            {isEditingVehicle ? (
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

      <div className="sticky top-[120px] z-20 -mx-3 overflow-x-auto px-3 py-2 sm:top-[140px] sm:mx-0">
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

      {activeTab === 'overview' ? (
        <>
          <SectionCard
            title={tr('Overview', "Vue d'ensemble")}
            description={tr('A quick operational snapshot for this vehicle.', 'Un aperçu opérationnel rapide de ce véhicule.')}
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
              <h2 className="text-xl font-bold text-slate-950">{tr('Basic information', 'Informations de base')}</h2>
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
                  <OwnerField label={tr('Short summary', 'Résumé court')}>
                    <textarea value={formData.shortDescription} onChange={(event) => updateField('shortDescription', event.target.value)} className={`${baseFieldClassName} min-h-[96px] resize-y`} />
                  </OwnerField>
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
                  <div className="sm:col-span-2">
                    <ViewField label={tr('Short summary', 'Résumé court')} value={formData.shortDescription} />
                  </div>
                  <ViewField label={tr('Current odometer reading', 'Kilométrage actuel')} value={formData.currentOdometer ? `${formData.currentOdometer} km` : '—'} />
                  <ViewField label={tr('Engine hours', 'Heures moteur')} value={formData.engineHours ? `${formData.engineHours} h` : '—'} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <section id="operations-snapshot" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'operations-snapshot')}`}>
                <h2 className="text-xl font-bold text-slate-950">{tr('Operational snapshot', 'Aperçu opérationnel')}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {tr('Keep the quick operational details here. Maintenance planning and booking readiness live in Bookings.', 'Gardez ici les détails opérationnels rapides. La planification maintenance et l’état de réservation se trouvent dans Réservations.')}
                </p>
                <div className="mt-5 space-y-3">
                  <InfoRow label={tr('Linked fleet record', 'Fiche flotte liée')} value={linkedFleetVehicleId ? `#${linkedFleetVehicleId}` : tr('Created after first save', 'Créée après le premier enregistrement')} />
                  <InfoRow label={tr('Current fuel level', 'Niveau de carburant actuel')} value={linkedFleetVehicleId ? `${vehicleFuelState?.current_fuel_lines ?? 0}/8` : '—'} />
                  <InfoRow label={tr('Profile status', 'Statut du profil')} value={listingLabel} />
                  <InfoRow label={tr('Listing title', 'Titre de l’annonce')} value={formData.listingTitle || '—'} />
                  <InfoRow label={tr('Pickup location', 'Point de retrait')} value={formData.pickupLocationName || '—'} />
                  <InfoRow label={tr('Half-day rental', 'Location demi-journée')} value={formData.halfDayPriceAmount ? `${formData.halfDayPriceAmount} MAD` : tr('Not set', 'Non défini')} />
                </div>
              </section>

              <section id="primary-photo" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'primary-photo')}`}>
                <h2 className="text-xl font-bold text-slate-950">{tr('Vehicle photos', 'Photos du véhicule')}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {tr('Upload the required hero, context, and detail shots here.', 'Téléversez ici les photos requises : principale, contexte et détail.')}
                </p>
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

      {activeTab === 'listing' ? (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <section id="listing-details" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'listing-details')}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Listing setup', "Configuration de l'annonce")}</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Complete your listing', 'Finalisez votre annonce')}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${listingTone}`}>
                      {listingLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-5 rounded-[1.4rem] border border-violet-200 bg-violet-50/70 p-4">
                  <div className="rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {tr('Step 1 of 6', 'Étape 1 sur 6')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {ownerWorkflowStepOne.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {ownerWorkflowStepOne.body}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ownerWorkflowStepOne.statusTone}`}>
                        {ownerWorkflowStepOne.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => openMarketplaceChecklistTask(marketplaceChecklist.find((item) => item.key === 'owner_verification'))}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                      >
                        {ownerWorkflowStepOne.actionLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {tr('Step 2 of 6', 'Étape 2 sur 6')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {ownerWorkflowStepTwo.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {ownerWorkflowStepTwo.body}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ownerWorkflowStepTwo.statusTone}`}>
                        {ownerWorkflowStepTwo.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => openMarketplaceChecklistTask(marketplaceChecklist.find((item) => item.key === 'vehicle_profile'))}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                      >
                        {ownerWorkflowStepTwo.actionLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {tr('Step 3 of 6', 'Étape 3 sur 6')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {ownerWorkflowStepThree.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {ownerWorkflowStepThree.body}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ownerWorkflowStepThree.statusTone}`}>
                        {ownerWorkflowStepThree.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => openMarketplaceChecklistTask(marketplaceChecklist.find((item) => item.key === 'vehicle_documents'))}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                      >
                        {ownerWorkflowStepThree.actionLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {tr('Step 4 of 6', 'Étape 4 sur 6')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {ownerWorkflowStepFour.title}
                        </p>
                        {ownerWorkflowStepFour.body ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {ownerWorkflowStepFour.body}
                          </p>
                        ) : null}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ownerWorkflowStepFour.statusTone}`}>
                        {ownerWorkflowStepFour.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => openMarketplaceChecklistTask(stepFourTargetItem)}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                      >
                        {ownerWorkflowStepFour.actionLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {tr('Step 5 of 6', 'Étape 5 sur 6')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {ownerWorkflowStepFive.title}
                        </p>
                        {ownerWorkflowStepFive.body ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {ownerWorkflowStepFive.body}
                          </p>
                        ) : null}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ownerWorkflowStepFive.statusTone}`}>
                        {ownerWorkflowStepFive.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => openMarketplaceChecklistTask(marketplaceChecklist.find((item) => item.key === 'renter_setup'))}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                      >
                        {ownerWorkflowStepFive.actionLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {tr('Step 6 of 6', 'Étape 6 sur 6')}
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {ownerWorkflowStepSix.title}
                        </p>
                        {ownerWorkflowStepSix.body ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {ownerWorkflowStepSix.body}
                          </p>
                        ) : null}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${ownerWorkflowStepSix.statusTone}`}>
                        {ownerWorkflowStepSix.statusLabel}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (ownerWorkflowStepSix.actionMode === 'submit-review') {
                            void persistVehicle(true);
                            return;
                          }
                          if (ownerWorkflowStepSix.actionMode === 'messages') {
                            handleOpenReviewThread();
                            return;
                          }
                          openMarketplaceChecklistTask(marketplaceChecklist.find((item) => item.key === 'listing_review'));
                        }}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                      >
                        {ownerWorkflowStepSix.actionLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">{tr('Progress', 'Progression')}</p>
                      <p className="mt-2 text-3xl font-black text-slate-950">
                        {Math.round((completedMarketplaceChecklistCount / marketplaceChecklist.length) * 100)}%
                      </p>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {nextMarketplaceChecklistItem
                          ? tr('Next step', 'Étape suivante') + `: ${nextMarketplaceChecklistItem.label}`
                          : tr('Ready to review', 'Prête pour la revue')}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-center shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{tr('Tasks', 'Tâches')}</p>
                      <p className="mt-1 text-xl font-black text-slate-950">
                        {completedMarketplaceChecklistCount}/{marketplaceChecklist.length}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/90">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all"
                      style={{ width: `${(completedMarketplaceChecklistCount / marketplaceChecklist.length) * 100}%` }}
                    />
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-white/80 bg-white/85 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Next action', 'Action suivante')}</p>
                    <p className="mt-2 text-base font-bold text-slate-950">
                      {nextMarketplaceChecklistItem?.label || (
                        effectiveMarketplaceJourneyState === 'pending_review'
                          ? tr('Admin review in progress', 'Revue admin en cours')
                          : effectiveMarketplaceJourneyState === 'approved'
                            ? tr('Go live', 'Mettre en ligne')
                            : tr('Send for review', 'Envoyer en revue')
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {nextMarketplaceChecklistItem
                        ? tr('Finish this step to keep your listing moving.', 'Terminez cette étape pour faire avancer votre annonce.')
                        : effectiveMarketplaceJourneyState === 'pending_review'
                          ? tr('Your full package is already with admin. We are waiting for review before the listing can go live.', 'Votre dossier complet est déjà chez l’admin. Nous attendons la revue avant que l’annonce puisse être publiée.')
                        : marketplaceVerificationReady
                          ? tr('Everything important is ready. Send your listing when you are ready.', 'Tout l’essentiel est prêt. Envoyez votre annonce quand vous êtes prêt.')
                          : tr('Wait for verification approval before sending this listing.', 'Attendez la validation de la vérification avant d’envoyer cette annonce.')}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {nextMarketplaceChecklistItem ? (
                        <button
                          type="button"
                          onClick={() => openMarketplaceChecklistTask(nextMarketplaceChecklistItem)}
                          className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(79,70,229,0.20)] transition hover:-translate-y-0.5"
                        >
                          {tr('Continue setup', 'Continuer la configuration')}
                        </button>
                      ) : effectiveMarketplaceJourneyState === 'pending_review' ? (
                        <button
                          type="button"
                          onClick={handleOpenReviewThread}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                        >
                          <MessageSquareText className="h-4 w-4" />
                          {tr('Open messages', 'Ouvrir les messages')}
                        </button>
                      ) : !isEditingVehicle ? (
                        <button
                          type="button"
                          onClick={() => void persistVehicle(true)}
                          disabled={saving || submitting || !canSendFullReview}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(79,70,229,0.20)] transition hover:-translate-y-0.5 disabled:opacity-60"
                        >
                          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {tr('Send for review', 'Envoyer en revue')}
                        </button>
                      ) : (
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                          {tr('Save changes to continue.', 'Enregistrez les changements pour continuer.')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Checklist', 'Checklist')}</p>
                    <div className="mt-3 space-y-3">
                      {marketplaceChecklist.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => openMarketplaceChecklistTask(item)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                            item.done
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.key === nextMarketplaceChecklistItem?.key
                                ? 'bg-violet-100 text-violet-700'
                                : item.key === 'verification' && !vehicleVerificationReady
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.done
                              ? tr('Done', 'Fait')
                              : item.key === nextMarketplaceChecklistItem?.key
                                ? tr('Action required', 'Action requise')
                                : item.key === 'verification' && !vehicleVerificationReady
                                  ? tr('Waiting', 'En attente')
                                  : tr('Action required', 'Action requise')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {isEditingVehicle ? (
                  <>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <OwnerField label={tr('Short summary', 'Résumé court')}>
                        <textarea value={formData.shortDescription} onChange={(event) => updateField('shortDescription', event.target.value)} className={`${baseFieldClassName} min-h-[96px] resize-y`} />
                      </OwnerField>
                      <OwnerField label={tr('Detailed description', 'Description détaillée')}>
                        <textarea value={formData.fullDescription} onChange={(event) => updateField('fullDescription', event.target.value)} className={`${baseFieldClassName} min-h-[144px] resize-y`} />
                      </OwnerField>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <OwnerField label={tr('Listing title', 'Titre de l’annonce')}>
                        <input value={formData.listingTitle} onChange={(event) => updateField('listingTitle', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Daily price', 'Prix journalier')}>
                        <input value={formData.dailyPriceAmount} onChange={(event) => updateField('dailyPriceAmount', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Half-day package price', 'Prix du forfait demi-journée')}>
                        <input value={formData.halfDayPriceAmount} onChange={(event) => updateField('halfDayPriceAmount', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Half-day minimum hours', 'Heures minimum demi-journée')}>
                        <input type="number" min="1" value={formData.halfDayMinHours} onChange={(event) => updateField('halfDayMinHours', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Half-day maximum hours', 'Heures maximum demi-journée')}>
                        <input type="number" min="1" value={formData.halfDayMaxHours} onChange={(event) => updateField('halfDayMaxHours', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Deposit', 'Caution')}>
                        <input value={formData.depositAmount} onChange={(event) => updateField('depositAmount', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Included kilometers', 'Kilomètres inclus')}>
                        <input value={formData.mileageLimitKm} onChange={(event) => updateField('mileageLimitKm', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Extra kilometer rate', 'Tarif kilomètre supplémentaire')}>
                        <input value={formData.extraKmRate} onChange={(event) => updateField('extraKmRate', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-[1.25rem] border border-sky-200 bg-sky-50 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">{tr('Daily guide', 'Guide journalier')}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {tr('Recommended', 'Recommandé')}: {pricingGuide.daily.recommendedMin}-{pricingGuide.daily.recommendedMax} MAD
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          {tr('Allowed range', 'Plage autorisée')}: {pricingGuide.daily.allowedMin}-{pricingGuide.daily.allowedMax} MAD
                        </p>
                      </div>
                      <div className="rounded-[1.25rem] border border-violet-200 bg-violet-50 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">{tr('Half-day guide', 'Guide demi-journée')}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {tr('Recommended', 'Recommandé')}: {pricingGuide.halfDay.recommendedMin}-{pricingGuide.halfDay.recommendedMax} MAD
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          {tr('Allowed range', 'Plage autorisée')}: {pricingGuide.halfDay.allowedMin}-{pricingGuide.halfDay.allowedMax} MAD
                        </p>
                        <p className="mt-2 text-xs font-semibold text-violet-700">
                          {tr('Best owner flow: treat half-day as a 4-5 hour package.', 'Meilleur flux propriétaire : traitez la demi-journée comme un forfait de 4 à 5 heures.')}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <ViewField label={tr('Short summary', 'Résumé court')} value={formData.shortDescription} />
                    <ViewField label={tr('Detailed description', 'Description détaillée')} value={formData.fullDescription} />
                    <ViewField label={tr('Listing title', 'Titre de l’annonce')} value={formData.listingTitle} />
                    <ViewField label={tr('Daily price', 'Prix journalier')} value={formData.dailyPriceAmount ? `${formData.dailyPriceAmount} MAD` : '—'} />
                    <ViewField label={tr('Half-day package price', 'Prix du forfait demi-journée')} value={formData.halfDayPriceAmount ? `${formData.halfDayPriceAmount} MAD` : '—'} />
                    <ViewField label={tr('Half-day hours', 'Heures demi-journée')} value={formData.halfDayMinHours && formData.halfDayMaxHours ? `${formData.halfDayMinHours}-${formData.halfDayMaxHours} h` : '—'} />
                    <ViewField label={tr('Deposit', 'Caution')} value={formData.depositAmount ? `${formData.depositAmount} MAD` : '—'} />
                    <ViewField label={tr('Included kilometers', 'Kilomètres inclus')} value={formData.mileageLimitKm ? `${formData.mileageLimitKm} km` : '—'} />
                    <ViewField label={tr('Extra kilometer rate', 'Tarif kilomètre supplémentaire')} value={formData.extraKmRate ? `${formData.extraKmRate} MAD` : '—'} />
                  </div>
                )}
                {fieldErrors.pricing ? <p className="mt-3 text-xs font-semibold text-rose-600">{fieldErrors.pricing}</p> : null}
                {fieldErrors.halfDayHours ? <p className="mt-2 text-xs font-semibold text-rose-600">{fieldErrors.halfDayHours}</p> : null}
              </section>

              <section id="listing-rules" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'listing-rules')}`}>
                <h2 className="text-xl font-bold text-slate-950">{tr('Renter setup', 'Configuration locataire')}</h2>
                {isEditingVehicle ? (
                  <>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <OwnerField label={tr('Pickup location name', 'Nom du point de retrait')}>
                        <input value={formData.pickupLocationName} onChange={(event) => updateField('pickupLocationName', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                      <OwnerField label={tr('Fuel policy', 'Politique carburant')}>
                        <input value={formData.fuelPolicy} onChange={(event) => updateField('fuelPolicy', event.target.value)} className={baseFieldClassName} />
                      </OwnerField>
                    </div>
                    <OwnerField label={tr('Pickup address', 'Adresse de retrait')}>
                      <textarea value={formData.pickupAddress} onChange={(event) => updateField('pickupAddress', event.target.value)} className={`${baseFieldClassName} min-h-[96px] resize-y`} />
                    </OwnerField>
                    <OwnerField label={tr('Extras (comma separated)', 'Extras (séparés par des virgules)')}>
                      <input value={formData.extrasText} onChange={(event) => updateField('extrasText', event.target.value)} className={baseFieldClassName} />
                    </OwnerField>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        <input type="checkbox" checked={formData.termsAcceptedForSubmission} onChange={(event) => updateField('termsAcceptedForSubmission', event.target.checked)} />
                        {tr('Ready to submit for review', 'Prêt à envoyer en revue')}
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <ViewField label={tr('Pickup location name', 'Nom du point de retrait')} value={formData.pickupLocationName} />
                    <ViewField label={tr('Fuel policy', 'Politique carburant')} value={formData.fuelPolicy} />
                    <ViewField label={tr('Pickup address', 'Adresse de retrait')} value={formData.pickupAddress} />
                    <ViewField label={tr('Extras', 'Extras')} value={formData.extrasText} />
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-4">
              <section id="listing-journey" className={`${workspacePanelClass} ${getFocusedSectionClass(focusedSectionId, 'listing-journey')}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Verification status', 'Statut de vérification')}</p>
                <div className={`mt-4 rounded-[1.25rem] border px-4 py-4 ${marketplaceVerificationReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className="text-base font-bold text-slate-950">
                    {marketplaceVerificationReady ? tr('Approved', 'Approuvée') : tr('Waiting', 'En attente')}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {marketplaceVerificationReady
                      ? tr('Your listing can move forward as soon as the remaining setup is done.', 'Votre annonce peut avancer dès que la configuration restante est terminée.')
                      : tr('Verification must be approved before this listing can go live.', 'La vérification doit être approuvée avant que cette annonce puisse être publiée.')}
                  </p>
                  {!marketplaceVerificationReady && verificationMissingLabels.length ? (
                    <p className="mt-3 text-sm font-semibold text-amber-900">
                      {tr('Missing', 'Manquants')} : {verificationMissingLabels.join(', ')}
                    </p>
                  ) : null}
                  {vehicle?.listingId ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={handleOpenReviewThread}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        {listingReviewThreadHasVisibleMessages
                          ? tr('Open messages', 'Ouvrir les messages')
                          : tr('Open approval messages', "Ouvrir les messages d'approbation")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
              <section className={workspacePanelClass}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Listing preview', "Aperçu de l'annonce")}</p>
                <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-lg font-bold text-slate-950">{formData.listingTitle || tr('Untitled listing', 'Annonce sans titre')}</p>
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
                    {tr('Edit listing', "Modifier l'annonce")}
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

      {activeTab === 'bookings' ? (
        <div className="space-y-4">
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

          <SectionCard
            title={tr('Bookings & requests', 'Réservations & demandes')}
            description={tr('Requests, demand signals, and operational booking context for this vehicle.', 'Demandes, signaux de demande et contexte opérationnel de réservation pour ce véhicule.')}
            icon={CalendarClock}
          >
            {vehicleRequests.length ? (
              <div className="space-y-4">
              {operationalRequest && operationalExecutionMeta ? (
                <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${operationalExecutionMeta.tone}`}>
                          {operationalExecutionMeta.badge}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          {operationalRequest?.customerName || tr('Customer', 'Client')}
                        </span>
                      </div>
                      <h3 className="mt-3 text-xl font-bold text-slate-950">{tr('Rental execution', "Exécution de location")}</h3>
                      <p className="mt-2 text-sm text-slate-600">{operationalExecutionMeta.note}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        {[operationalRequest?.customerEmail || operationalRequest?.customerPhone || '', formatDateTime(operationalRequest?.requestedStartAt, isFrench ? 'fr' : 'en')].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-[250px]">
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
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {operationalExecutionMeta.steps.map((step) => (
                      <ExecutionStep key={step.key} step={step} />
                    ))}
                  </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Owner flow', 'Flux propriétaire')}</p>
                          <p className="mt-2 text-base font-bold text-slate-950">{ownerExecutionSummary.badge}</p>
                          <p className="mt-1 text-sm text-slate-600">{ownerExecutionSummary.note}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <OwnerExecutionStagePill label={tr('Handoff', 'Remise')} active={ownerExecutionStage === 'handoff'} />
                          <OwnerExecutionStagePill label={tr('Ready', 'Prête')} active={ownerExecutionStage === 'ready_to_start'} />
                          <OwnerExecutionStagePill label={tr('Live', 'Active')} active={ownerExecutionStage === 'live'} />
                          <OwnerExecutionStagePill label={tr('Return', 'Retour')} active={ownerExecutionStage === 'return_pending'} />
                          <OwnerExecutionStagePill label={tr('Done', 'Terminée')} active={ownerExecutionStage === 'completed'} />
                        </div>
                      </div>

                    {ownerExecutionStage === 'approved' || ownerExecutionStage === 'handoff' ? (
                      <div className="mt-4 space-y-4">
                        {ownerHandoffReady ? (
                          <OwnerStepperStepCard
                            stepNumber={tr('Step 1', 'Étape 1')}
                            title={tr('Ready to start rental', 'Prête à démarrer la location')}
                            note={tr('The handoff checklist is complete. Lock it and move into the live rental state.', 'La checklist de remise est terminée. Verrouillez-la et passez à la location active.')}
                            statusLabel={ownerExecutionSaving ? tr('Saving…', 'Enregistrement…') : tr('Admin stepper flow', 'Flux stepper admin')}
                            primaryActionLabel={tr('Ready to start rental', 'Prête à démarrer la location')}
                            onPrimaryAction={markOwnerExecutionReadyToStart}
                            primaryDisabled={ownerExecutionSaving}
                            primaryTone="emerald"
                          >
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                              {tr('Pickup evidence, documents, deposit, and signature are complete.', 'Les preuves de départ, documents, caution et signature sont terminés.')}
                            </div>
                          </OwnerStepperStepCard>
                        ) : (
                          <OwnerStepperStepCard
                            stepNumber={tr('Step 1', 'Étape 1')}
                            title={tr(ownerHandoffCurrentStep.label.en, ownerHandoffCurrentStep.label.fr)}
                            note={tr(ownerHandoffCurrentStep.note.en, ownerHandoffCurrentStep.note.fr)}
                            statusLabel={ownerExecutionSaving ? tr('Saving…', 'Enregistrement…') : tr('Admin stepper flow', 'Flux stepper admin')}
                            primaryActionLabel={
                              ownerHandoffCurrentStep.key === 'handoff_check'
                                ? tr('Begin handoff', 'Commencer la remise')
                                : ownerHandoffCurrentStep.key === 'vehicle_photos'
                                  ? tr('Open camera', 'Ouvrir la caméra')
                                  : ownerHandoffCurrentStep.key === 'start_odometer'
                                    ? tr('Save odometer', 'Enregistrer le compteur')
                                    : ownerHandoffCurrentStep.key === 'start_fuel'
                                      ? tr('Save fuel level', 'Enregistrer le carburant')
                                  : ownerHandoffCurrentStep.key === 'legal_docs'
                                    ? tr('Confirm documents', 'Confirmer les documents')
                                    : ownerHandoffCurrentStep.key === 'deposit'
                                      ? tr('Confirm deposit', 'Confirmer la caution')
                                    : tr('Save signature', 'Enregistrer la signature')
                            }
                            onPrimaryAction={() => {
                              if (ownerHandoffCurrentStep.key === 'handoff_check') {
                                toggleOwnerExecutionFlag('handoffChecked');
                                return;
                              }
                              if (ownerHandoffCurrentStep.key === 'start_odometer') {
                                saveOwnerExecutionStartOdometer(handoffOdometerInput);
                                return;
                              }
                              if (ownerHandoffCurrentStep.key === 'start_fuel') {
                                saveOwnerExecutionStartFuelLevel(ownerExecutionDraft.startFuelLevel);
                                return;
                              }
                              if (ownerHandoffCurrentStep.key === 'legal_docs') {
                                toggleOwnerExecutionFlag('legalDocsChecked');
                                return;
                              }
                              if (ownerHandoffCurrentStep.key === 'deposit') {
                                toggleOwnerExecutionFlag('depositConfirmed');
                                return;
                                }
                              toggleOwnerExecutionFlag('contractSigned');
                            }}
                            primaryDisabled={
                              ownerExecutionSaving ||
                              ownerHandoffCurrentStep.key === 'vehicle_photos' ||
                              (ownerHandoffCurrentStep.key === 'start_odometer' &&
                                !(Number.isFinite(Number(handoffOdometerInput)) && Number(handoffOdometerInput) >= 0)) ||
                              (ownerHandoffCurrentStep.key === 'start_fuel' &&
                                !(Number.isFinite(Number(ownerExecutionDraft.startFuelLevel)) && Number(ownerExecutionDraft.startFuelLevel) >= 0))
                            }
                          >
                            {ownerHandoffCurrentStep.key === 'vehicle_photos' ? (
                              <RentalPhotoEvidenceCapture
                                title={tr('Pickup evidence', 'Preuve de départ')}
                                subtitle={tr('Take at least 3 clear pickup photos before the vehicle leaves.', 'Prenez au moins 3 photos claires avant le départ du véhicule.')}
                                helper={tr('Use the camera, review the images, then confirm the upload.', 'Utilisez la caméra, vérifiez les images, puis confirmez le téléversement.')}
                                sessionToken={`owner-handoff-${String(operationalRequest?.id || 'request')}`}
                                photos={ownerExecutionDraft.handoffPhotos}
                                minPhotos={OWNER_HANDOFF_MIN_PHOTOS}
                                maxPhotos={6}
                                saving={ownerExecutionSaving}
                                disabled={ownerExecutionHandoffLocked}
                                onSubmit={(files) => uploadOwnerExecutionPhotos('handoff', files)}
                                tr={tr}
                              />
                            ) : ownerHandoffCurrentStep.key === 'start_odometer' ? (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                                  <label className="min-w-0 flex-1">
                                    <span className="text-sm font-bold text-slate-950">{tr('Starting odometer', 'Kilométrage de départ')}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={handoffOdometerInput}
                                      onChange={(event) => setHandoffOdometerInput(event.target.value)}
                                      disabled={ownerExecutionHandoffLocked || ownerExecutionSaving}
                                      placeholder={String(formData.currentOdometer || '0')}
                                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-violet-300"
                                    />
                                  </label>
                                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                    <p className="font-semibold text-slate-900">{tr('Current fleet reading', 'Lecture flotte actuelle')}</p>
                                    <p className="mt-1">{formData.currentOdometer ? `${formData.currentOdometer} km` : '—'}</p>
                                  </div>
                                </div>
                              </div>
                            ) : ownerHandoffCurrentStep.key === 'start_fuel' ? (
                              <OwnerFuelLevelPicker
                                value={ownerExecutionDraft.startFuelLevel}
                                onChange={(level) => {
                                  setOwnerExecutionDraft((current) => ({
                                    ...current,
                                    startFuelLevel: String(level),
                                  }));
                                }}
                                disabled={ownerExecutionHandoffLocked || ownerExecutionSaving}
                                tr={tr}
                                litersLabel={
                                  Number.isFinite(Number(ownerExecutionDraft.startFuelLevel))
                                    ? `${FuelTransactionService.linesToLiters(Number(ownerExecutionDraft.startFuelLevel), vehicleFuelState?.tank_capacity_liters || undefined).toFixed(1)} L`
                                    : ''
                                }
                              />
                            ) : (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                {ownerHandoffCurrentStep.key === 'legal_docs'
                                  ? tr('Match the registration and insurance to the vehicle before release.', "Vérifiez la carte grise et l'assurance avant remise.")
                                  : ownerHandoffCurrentStep.key === 'deposit'
                                    ? tr('Confirm the external deposit was handled directly between renter and owner.', 'Confirmez que la caution externe a été gérée directement entre le locataire et le propriétaire.')
                                    : ownerHandoffCurrentStep.key === 'signature'
                                      ? tr('Get the renter signature before starting.', 'Obtenez la signature du locataire avant démarrage.')
                                      : tr('Use the same step-by-step rhythm as admin rental handoff.', 'Utilisez le même rythme étape par étape que la remise admin.')}
                              </div>
                            )}
                          </OwnerStepperStepCard>
                        )}

                        <div className="grid gap-3 md:grid-cols-5">
                          {OWNER_HANDOFF_STEPS.map((step, index) => {
                            const complete = step.gate(ownerExecutionDraft);
                            const active = ownerHandoffCurrentStep.key === step.key;
                            return (
                              <ExecutionStep
                                key={step.key}
                                step={{
                                  key: step.key,
                                  label: `${index + 1}. ${tr(step.label.en, step.label.fr)}`,
                                  done: complete,
                                  active,
                                }}
                              />
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
                            to={`/account/vehicles?requestId=${encodeURIComponent(String(operationalRequest.id))}&messageRequestId=${encodeURIComponent(String(operationalRequest.id))}#requests`}
                            state={{ from: currentPath }}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                          >
                            <MessageSquareText className="h-4 w-4" />
                            {tr('Chat', 'Chat')}
                          </Link>
                          <Link
                            to={`/account/vehicles?requestId=${encodeURIComponent(String(operationalRequest.id))}&messageRequestId=${encodeURIComponent(String(operationalRequest.id))}#requests`}
                            state={{ from: currentPath }}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                          >
                            <AlertCircle className="h-4 w-4" />
                            {tr('Help', 'Aide')}
                          </Link>
                          <button
                            type="button"
                            onClick={markOwnerExecutionReturnPending}
                            disabled={ownerExecutionSaving || !ownerExecutionCanEndRental}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
                          >
                            <FileText className="h-4 w-4" />
                            {tr('End rental', 'Fin de location')}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {ownerExecutionStage === 'return_pending' ? (
                      <div className="mt-4 space-y-4">
                        <OwnerStepperStepCard
                          stepNumber={tr('Step 2', 'Étape 2')}
                          title={tr(ownerReturnCurrentStep.label.en, ownerReturnCurrentStep.label.fr)}
                          note={tr(ownerReturnCurrentStep.note.en, ownerReturnCurrentStep.note.fr)}
                          statusLabel={ownerExecutionSaving ? tr('Saving…', 'Enregistrement…') : tr('Admin stepper flow', 'Flux stepper admin')}
                          primaryActionLabel={
                            ownerReturnCurrentStep.key === 'return_photos'
                              ? tr('Open camera', 'Ouvrir la caméra')
                              : ownerReturnCurrentStep.key === 'return_odometer'
                                ? tr('Save odometer', 'Enregistrer le compteur')
                                : ownerReturnCurrentStep.key === 'return_fuel'
                                  ? tr('Save fuel level', 'Enregistrer le carburant')
                                  : ownerReturnCurrentStep.key === 'issue_report'
                                ? tr('No issue', 'Aucun incident')
                              : tr('End rental', 'Fin de location')
                          }
                          onPrimaryAction={() => {
                            if (ownerReturnCurrentStep.key === 'issue_report') {
                              setOwnerIssueReview(false);
                              return;
                            }
                            if (ownerReturnCurrentStep.key === 'return_odometer') {
                              saveOwnerExecutionReturnOdometer(returnOdometerInput);
                              return;
                            }
                            if (ownerReturnCurrentStep.key === 'return_fuel') {
                              saveOwnerExecutionReturnFuelLevel(ownerExecutionDraft.returnFuelLevel);
                              return;
                            }
                            saveOwnerReturnFlow();
                          }}
                          primaryDisabled={
                            ownerExecutionSaving ||
                            ownerReturnCurrentStep.key === 'return_photos' ||
                            (ownerReturnCurrentStep.key === 'return_odometer' &&
                              !(Number.isFinite(Number(returnOdometerInput)) &&
                                Number(returnOdometerInput) >= 0 &&
                                (!Number.isFinite(Number(ownerExecutionDraft.startOdometer)) ||
                                  Number(returnOdometerInput) >= Number(ownerExecutionDraft.startOdometer)))) ||
                            (ownerReturnCurrentStep.key === 'return_fuel' &&
                              !(Number.isFinite(Number(ownerExecutionDraft.returnFuelLevel)) &&
                                Number(ownerExecutionDraft.returnFuelLevel) >= 0)) ||
                            (ownerReturnCurrentStep.key === 'end_rental' ? !ownerReturnReady : false)
                          }
                          primaryTone={ownerReturnCurrentStep.key === 'end_rental' ? 'slate' : 'violet'}
                        >
                          <div className="space-y-3">
                            {ownerReturnCurrentStep.key === 'return_photos' ? (
                              <RentalPhotoEvidenceCapture
                                title={tr('Return evidence', 'Preuve de retour')}
                                subtitle={tr('Take at least 3 clear return photos before closing the rental.', 'Prenez au moins 3 photos claires avant de clôturer la location.')}
                                helper={tr('Capture the vehicle condition on return. Issue reporting stays optional in the next step.', 'Capturez l’état du véhicule au retour. Le signalement d’incident reste optionnel à l’étape suivante.')}
                                sessionToken={`owner-return-${String(operationalRequest?.id || 'request')}`}
                                photos={ownerExecutionDraft.returnPhotos}
                                minPhotos={OWNER_RETURN_MIN_PHOTOS}
                                maxPhotos={6}
                                saving={ownerExecutionSaving}
                                disabled={ownerExecutionReturnLocked}
                                onSubmit={(files) => uploadOwnerExecutionPhotos('return', files)}
                                tr={tr}
                              />
                            ) : null}
                            {ownerReturnCurrentStep.key === 'return_odometer' ? (
                              <div className="space-y-3">
                                <label className="block">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    {tr('Return odometer', 'Compteur retour')}
                                  </span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={Number.isFinite(Number(ownerExecutionDraft.startOdometer)) ? Number(ownerExecutionDraft.startOdometer) : 0}
                                    step="1"
                                    value={returnOdometerInput}
                                    onChange={(event) => setReturnOdometerInput(event.target.value)}
                                    disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                                    className={`${fieldClassName} mt-2`}
                                    placeholder={tr('Enter final odometer', 'Entrez le compteur final')}
                                  />
                                </label>
                                <p className="text-xs text-slate-500">
                                  {Number.isFinite(Number(ownerExecutionDraft.startOdometer))
                                    ? tr(
                                        `Must be at least ${Math.round(Number(ownerExecutionDraft.startOdometer))}.`,
                                        `Doit être au moins ${Math.round(Number(ownerExecutionDraft.startOdometer))}.`
                                      )
                                    : tr('Use the final odometer reading shown at return.', 'Utilisez le relevé final du compteur au retour.')}
                                </p>
                              </div>
                            ) : null}
                            {ownerReturnCurrentStep.key === 'return_fuel' ? (
                              <OwnerFuelLevelPicker
                                tr={tr}
                                value={ownerExecutionDraft.returnFuelLevel}
                                onSelect={(level) => {
                                  if (ownerExecutionReturnLocked) return;
                                  setOwnerExecutionDraft((current) => ({
                                    ...current,
                                    returnFuelLevel: String(level),
                                  }));
                                }}
                                disabled={ownerExecutionSaving || ownerExecutionReturnLocked}
                              />
                            ) : null}
                            {ownerReturnCurrentStep.key === 'issue_report' ? (
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
                                  <p className="text-xs text-amber-700">
                                    {tr(
                                      'Issue documented. End the rental once the return evidence is complete.',
                                      'Incident documenté. Terminez la location une fois la preuve de retour complète.'
                                    )}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </OwnerStepperStepCard>

                        <div className="grid gap-3 md:grid-cols-4">
                          {OWNER_RETURN_STEPS.map((step, index) => {
                            const complete = step.gate(ownerExecutionDraft);
                            const active = ownerReturnCurrentStep.key === step.key;
                            return (
                              <ExecutionStep
                                key={step.key}
                                step={{
                                  key: step.key,
                                  label: `${index + 1}. ${tr(step.label.en, step.label.fr)}`,
                                  done: complete,
                                  active,
                                }}
                              />
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
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Funds flow', 'Flux financier')}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {operationalFundsLifecycle.map((step) => (
                        <FundsLifecycleStep key={step.key} {...step} />
                      ))}
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
                      to={`/account/vehicles?requestId=${encodeURIComponent(String(operationalRequest.id))}&messageRequestId=${encodeURIComponent(String(operationalRequest.id))}#requests`}
                      state={{ from: currentPath }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
                    >
                      <MessageSquareText className="h-4 w-4" />
                      {tr('Open in messages', 'Ouvrir dans messages')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setFocusedSectionId(`vehicle-request-${String(operationalRequest.id)}`)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {tr('Review request', 'Voir la demande')}
                    </button>
                  </div>
                </div>
              ) : null}

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
                  </article>
                ))}
              </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {tr('Booking requests will appear here once renters start a conversation.', 'Les demandes apparaîtront ici dès que les locataires démarrent une conversation.')}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'finance' ? (
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

      {activeTab === 'legal' ? (
        <div className="space-y-4">
          <div id="legal-documents" className={getFocusedSectionClass(focusedSectionId, 'legal-documents')}>
          <SectionCard
            title={tr('Legal & documents', 'Légal & documents')}
            description={tr('Upload, scan, confirm, then continue.', 'Téléversez, scannez, confirmez, puis continuez.')}
            icon={ShieldCheck}
          >
            <div className={`mt-6 ${workspaceInsetPanelClass}`}>
              <h3 className="text-sm font-semibold text-slate-900">{tr('Registration & insurance documents', 'Documents d’immatriculation et d’assurance')}</h3>
              <div className="mt-4">
                <VehicleDocuments
                  vehicleId={vehicle?.id || (isNewVehicle && user?.id ? `owner-draft-${user.id}` : resolvedVehicleId)}
                  documents={vehicleDocuments}
                  onDocumentsChange={setVehicleDocuments}
                  onDeleteDocument={handleDeleteVehicleDocument}
                  loadFromStorage={false}
                  canDelete={true}
                  documentStatusMap={vehicleLegalDocumentStatusMap}
                />
              </div>
              {!vehicleLegalScanComplete && !vehicleVerificationReady ? (
                <div className="mt-4">
                  <DocumentUpload
                    vehicleId={vehicle?.id || (isNewVehicle && user?.id ? `owner-draft-${user.id}` : resolvedVehicleId)}
                    verificationEntityId={vehicleVerificationEntityId}
                    ownerUserId={user?.id || null}
                    documents={vehicleDocuments}
                    onDocumentsChange={setVehicleDocuments}
                    onOcrExtracted={handleVehicleLegalOcrExtracted}
                    allowedCategoryValues={['registration', 'insurance']}
                    defaultCategory={nextVehicleLegalUploadCategory}
                    lockedCategory={nextVehicleLegalUploadCategory}
                    onUploadComplete={() => {
                      void refreshVehicleVerificationDocuments();
                    }}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 shadow-sm">
                  <p className="font-bold text-emerald-900">
                    {tr('Legal documents completed', 'Documents légaux terminés')}
                  </p>
                  <p className="mt-1">
                    {tr(
                      vehicleVerificationReady
                        ? 'Registration and insurance are verified and ready.'
                        : 'Registration and insurance were both verified by scan and filled automatically.',
                      vehicleVerificationReady
                        ? 'L’immatriculation et l’assurance sont vérifiées et prêtes.'
                        : 'L’immatriculation et l’assurance ont toutes deux été vérifiées par scan et remplies automatiquement.'
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
              {(vehicleVerificationReady || vehicleLegalScanComplete) ? (
                <div className="mt-4 rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 shadow-sm">
                  <p className="font-bold text-emerald-900">
                    {tr('Documents uploaded and verified', 'Documents téléversés et vérifiés')}
                  </p>
                  <p className="mt-1">
                    {tr('Your vehicle is ready for review.', 'Votre véhicule est prêt pour la revue.')}
                  </p>
                </div>
              ) : null}
            </div>
          </SectionCard>
          </div>

          <section className={workspacePanelClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">{tr('Confirm details', 'Confirmer les détails')}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {tr('Review the scanned details and edit anything missing before you continue.', 'Vérifiez les détails scannés et modifiez les champs manquants avant de continuer.')}
                </p>
              </div>
              {isEditingVehicle ? (
                <button
                  type="button"
                  onClick={() => void handleConfirmVehicleLegalDetails()}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(124,58,237,0.24)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? tr('Saving...', 'Enregistrement...') : tr('Save & continue', 'Enregistrer et continuer')}
                </button>
              ) : null}
            </div>
            {isEditingVehicle ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <OwnerField label={tr('Registration number', "Numéro d'immatriculation administratif")}>
                  <input value={formData.registrationNumber} onChange={(event) => updateField('registrationNumber', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Registration date', "Date d'immatriculation")}>
                  <input type="date" value={formData.registrationDate} onChange={(event) => updateField('registrationDate', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Registration expiry', "Expiration de l'immatriculation")}>
                  <input type="date" value={formData.registrationExpiryDate} onChange={(event) => updateField('registrationExpiryDate', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Policy number', "Numéro de police d'assurance")}>
                  <input value={formData.insurancePolicyNumber} onChange={(event) => updateField('insurancePolicyNumber', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Insurance provider', 'Assureur')}>
                  <input value={formData.insuranceProvider} onChange={(event) => updateField('insuranceProvider', event.target.value)} className={baseFieldClassName} />
                </OwnerField>
                <OwnerField label={tr('Insurance expiry', "Expiration de l'assurance")}>
                  <input type="date" value={formData.insuranceExpiryDate} onChange={(event) => updateField('insuranceExpiryDate', event.target.value)} className={baseFieldClassName} />
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
            description={tr('Track annual road tax payments for the linked fleet vehicle.', 'Suivez les paiements de taxe routière annuelle pour le véhicule flotte lié.')}
            icon={FileText}
          >
            {linkedFleetVehicleId ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    {tr('Use this section exactly like fleet management: add the annual payment, dates, and keep the receipt in Legal & documents.', 'Utilisez cette section comme dans la flotte : ajoutez le paiement annuel, les dates, et gardez le reçu dans Légal & documents.')}
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
                              ? tr('Linked from Legal & documents.', 'Lié depuis Légal & documents.')
                              : tr('Upload the receipt in Legal & documents using “Annual vehicle tax receipt”.', 'Téléversez le reçu dans Légal & documents avec « Reçu de taxe annuelle véhicule ».')}
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
                              {tr('Go to Legal & documents', 'Aller à Légal & documents')}
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

      {!vehicle ? (
        <div className={`${workspacePanelClass} border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{tr('This vehicle is not fully configured yet.', 'Ce véhicule n’est pas encore configuré.')}</span>
          </div>
        </div>
      ) : null}

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
        />
      ) : null}
    </div>
  );
};

export default AccountMarketplaceVehicleProfile;
