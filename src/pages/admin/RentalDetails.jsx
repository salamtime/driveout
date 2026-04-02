
import { shortenUrl as shortenUrlService } from '../../services/UrlShortenerService';
import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { apiManager } from '../../services/apiManager';
import FuelPricingService from '../../services/FuelPricingService';
import FuelTransactionService from '../../services/FuelTransactionService';
import { generateThumbnailFromBlob, uploadThumbnail } from '../../utils/thumbnailGenerator';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Alert, AlertDescription } from '../../components/ui/alert';
import RentalVideos from '../../components/RentalVideos';
import ViewCustomerDetailsDrawer from '../../components/admin/ViewCustomerDetailsDrawer';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import RentalContract from '../../components/admin/RentalContract';
import SignaturePadModal from '../../components/SignaturePadModal';
import ExtensionRequestModal from '../../components/admin/ExtensionRequestModal';
import ExtensionHistory from '../../components/admin/ExtensionHistory';
import FuelLevelModal from '../../components/admin/FuelLevelModal';
import ExtensionPricingService from '../../services/ExtensionPricingService';
import OverageCalculationService from '../../services/OverageCalculationService';
import { getPaymentStatusStyle } from '../../config/statusColors';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminOrOwner, canApprovePriceOverrides, canApproveRentalExtensions, canEditRentalPrice, canEditRentalPriceWithoutApproval, canEditExtensionHistory, canEditRentalContract } from '../../utils/permissionHelpers';
import PricingRulesService from '../../services/PricingRulesService';
import { ArrowLeft, Printer, X, Upload, Play, Plus, AlertTriangle, Clock, CheckCircle, XCircle, Calendar, PlayCircle, Maximize2, User, Users, CreditCard, FileSignature, Edit, Save, DollarSign, StopCircle, Video, FileVideo, Camera, Flashlight, Info, Gauge, Package, FileText, FileImage, Receipt, Share2, Smartphone, Fuel, Loader, Wrench } from 'lucide-react';
import { FaWhatsapp, FaCheck, FaFilePdf, FaFileInvoice, FaVideo } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import InvoiceTemplate from '../../components/InvoiceTemplate';
import ContractTemplate from '../../components/ContractTemplate';
import ReceiptTemplate from '../../components/ReceiptTemplate';
import { processMedia, getMediaType, createThumbnail } from '../../utils/mediaProcessor';
import TierPricingDisplay from '../../components/TierPricingDisplay';
import MaintenanceService from '../../services/MaintenanceService';
import { getUsers } from '../../services/UserService';
import VehicleReportService from '../../services/VehicleReportService';
import { DynamicPricingService } from '../../services/DynamicPricingService';
import { formatMaintenanceReference } from '../../utils/maintenanceReference';
import { getCompressedVideoRecorderOptions } from '../../utils/videoRecording';
import { uploadFile } from '../../utils/storageUpload';
import i18n from '../../i18n';
import { fetchSystemSettings } from '../../services/systemSettingsApi';


// Set to true to enable verbose logging in RentalDetails
const RENTAL_DEBUG = false;

const PRIMARY_ACTION_BUTTON_CLASS = 'rounded-xl border border-violet-700 bg-violet-700 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-violet-800 hover:border-violet-800';
const SECONDARY_ACTION_BUTTON_CLASS = 'rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50';
const WARNING_ACTION_BUTTON_CLASS = 'rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600';
const SUCCESS_ACTION_BUTTON_CLASS = 'rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 hover:border-emerald-700';
const MOBILE_FOOTER_BUTTON_BASE_CLASS = 'min-h-[52px] rounded-2xl px-4 py-3 text-xs font-semibold shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition-all';
const MOBILE_FOOTER_SECONDARY_CLASS = `${MOBILE_FOOTER_BUTTON_BASE_CLASS} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const MOBILE_FOOTER_PRIMARY_CLASS = `${MOBILE_FOOTER_BUTTON_BASE_CLASS} border border-violet-600 bg-violet-600 text-white hover:bg-violet-700 hover:border-violet-700`;
const MOBILE_FOOTER_SUCCESS_CLASS = `${MOBILE_FOOTER_BUTTON_BASE_CLASS} border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700`;
const MOBILE_FOOTER_DISABLED_CLASS = `${MOBILE_FOOTER_BUTTON_BASE_CLASS} border border-slate-200 bg-slate-100 text-slate-400 shadow-none`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const translateRentalStatusLabel = (status) => {
  const value = String(status || '').toLowerCase();
  const labels = {
    active: tr('ACTIVE', 'ACTIVE'),
    completed: tr('COMPLETED', 'TERMINÉE'),
    cancelled: tr('CANCELLED', 'ANNULÉE'),
    scheduled: tr('SCHEDULED', 'PLANIFIÉE'),
    impounded: tr('IMPOUNDED', 'MIS EN FOURRIÈRE'),
    unpaid: tr('UNPAID', 'IMPAYÉE'),
    paid: tr('PAID', 'PAYÉE'),
    partial: tr('PARTIAL', 'PARTIEL'),
  };
  return labels[value] || String(status || '').toUpperCase();
};

const getRentalAttentionState = (rental, vehicleReport) => {
  const report = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
  if (!report) return null;

  if (
    String(rental?.rental_status || '').toLowerCase() === 'completed' &&
    report.status === 'maintenance_completed'
  ) {
    return {
      text: tr('Maintenance Closed', 'Maintenance clôturée'),
      className: 'bg-slate-100 text-slate-800 border border-slate-300',
      detailText: tr(
        'This rental had a linked maintenance issue that was resolved after return',
        'Cette location avait un problème de maintenance lié qui a été résolu après le retour'
      ),
    };
  }

  if (
    report.maintenance_id ||
    rental?.vehicle?.status === 'maintenance' ||
    ['maintenance_created', 'maintenance_in_progress', 'maintenance_completed'].includes(report.status)
  ) {
    return {
      text: tr('Under Maintenance', 'En maintenance'),
      className: 'bg-orange-100 text-orange-800 border border-orange-200',
      detailText: tr('Vehicle report linked to Quad Maintenance', 'Rapport véhicule lié à la maintenance du quad'),
    };
  }

  const labels = {
    damage: tr('Damage Report Saved', 'Rapport de dommage enregistré'),
    accident: tr('Accident Report Saved', "Rapport d'accident enregistré"),
    mechanical_issue: tr('Mechanical Report Saved', 'Rapport mécanique enregistré'),
  };

  return {
    text: labels[report.report_type] || tr('Vehicle Report Saved', 'Rapport véhicule enregistré'),
    className: 'bg-red-100 text-red-800 border border-red-200',
    detailText: tr(
      'Vehicle inspection report saved on this rental while the timer continues',
      "Rapport d'inspection véhicule enregistré sur cette location pendant que le minuteur continue"
    ),
  };
};

const getRentalKilometerPackage = (rental, packageDetails) => {
  const pkg = rental?.package || packageDetails;
  if (!pkg) return null;

  const hasLinkedPackage = Boolean(rental?.package_id || pkg?.id);
  const hasKmConfig =
    pkg.included_kilometers !== null && pkg.included_kilometers !== undefined ||
    pkg.extra_km_rate !== null && pkg.extra_km_rate !== undefined;

  return hasLinkedPackage && hasKmConfig ? pkg : null;
};

const hasRecordedReturnFuel = (rental, endFuelLevel) => {
  return endFuelLevel !== null && endFuelLevel !== undefined ||
    rental?.end_fuel_level !== null && rental?.end_fuel_level !== undefined ||
    String(rental?.rental_status || '').toLowerCase() === 'completed';
};

const getEffectiveFuelChargeAmount = ({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }) => {
  if (!fuelChargeEnabled || !hasRecordedReturnFuel(rental, endFuelLevel)) {
    return 0;
  }

  return parseFloat(fuelCharge || rental?.fuel_charge || 0) || 0;
};

const getCorrectedDisplayedPaidAmount = ({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }) => {
  const rawPaidAmount = parseFloat(rental?.deposit_amount || 0) || 0;
  if (fuelChargeEnabled === false || rental?.fuel_charge_enabled === false) {
    return rawPaidAmount;
  }
  const effectiveFuelCharge = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
  const rawFuelCharge = parseFloat(rental?.fuel_charge || 0) || 0;
  const staleFuelCharge = Math.max(0, rawFuelCharge - effectiveFuelCharge);
  const rawTotalAmount = parseFloat(rental?.total_amount || 0) || 0;
  const paymentStatus = String(rental?.payment_status || '').toLowerCase();
  const mirrorsStoredTotal = rawPaidAmount > 0 && rawTotalAmount > 0 && Math.abs(rawPaidAmount - rawTotalAmount) < 0.01;
  const shouldNormalizePaidAmount = staleFuelCharge > 0 && mirrorsStoredTotal && paymentStatus === 'paid';

  return shouldNormalizePaidAmount
    ? Math.max(0, rawPaidAmount - staleFuelCharge)
    : rawPaidAmount;
};

const normalizeMoneyInputValue = (value) => {
  if (value === null || value === undefined) return '';

  const normalized = String(value).replace(',', '.').replace(/[^\d.]/g, '');
  if (!normalized) return '';

  const [integerPartRaw = '', ...decimalParts] = normalized.split('.');
  const decimalPart = decimalParts.join('');

  let integerPart = integerPartRaw.replace(/^0+(?=\d)/, '');
  if (integerPart === '') integerPart = '0';

  if (normalized.startsWith('.')) {
    return `0.${decimalPart}`;
  }

  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
};

const parsePriceOverrideMeta = (rawValue) => {
  if (!rawValue) return null;

  if (typeof rawValue === 'object' && rawValue !== null) {
    return rawValue;
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const buildPriceOverrideMeta = ({
  note,
  currentUser,
  previousPrice,
  newPrice,
  editedAt = new Date().toISOString(),
}) => ({
  note: note || '',
  editedById: currentUser?.id || null,
  editedByName: currentUser?.full_name || currentUser?.name || currentUser?.email || null,
  previousPrice: Math.max(0, Number(previousPrice || 0) || 0),
  newPrice: Math.max(0, Number(newPrice || 0) || 0),
  editedAt,
});

const resolveDisplayedStartingOdometer = (rental, fallbackValue = null) => {
  const rentalOdometer = Number(rental?.start_odometer);
  if (Number.isFinite(rentalOdometer) && rentalOdometer > 0) {
    return rentalOdometer;
  }

  const vehicleOdometer = Number(rental?.vehicle?.current_odometer);
  if (Number.isFinite(vehicleOdometer) && vehicleOdometer > 0) {
    return vehicleOdometer;
  }

  const fallbackOdometer = Number(fallbackValue);
  if (Number.isFinite(fallbackOdometer) && fallbackOdometer > 0) {
    return fallbackOdometer;
  }

  return 0;
};

const normalizeRentalLifecycleStatus = (rental) => {
  if (!rental) return rental;

  const rawStatus = String(rental.rental_status || rental.status || '').toLowerCase();
  let nextStatus = rawStatus;

  if (['cancelled', 'expired'].includes(rawStatus)) {
    nextStatus = rawStatus;
  } else if (rental.completed_at) {
    nextStatus = 'completed';
  } else if (
    rental.started_at &&
    !['completed', 'cancelled', 'expired', 'impounded'].includes(rawStatus)
  ) {
    nextStatus = 'active';
  } else if (!nextStatus) {
    nextStatus = 'scheduled';
  }

  return {
    ...rental,
    rental_status: nextStatus,
    status: nextStatus,
  };
};

const insertSharedActivityLog = async (payload) => {
  const primaryAttempt = await supabase
    .from('saharax_0u4w4d_activity_log')
    .insert(payload);

  if (!primaryAttempt.error) {
    return primaryAttempt;
  }

  const message = String(primaryAttempt.error?.message || '');
  if (!message.includes("'action' column")) {
    return primaryAttempt;
  }

  const fallbackPayload = {
    ...payload,
    title: payload.action,
  };
  delete fallbackPayload.action;

  return supabase
    .from('saharax_0u4w4d_activity_log')
    .insert(fallbackPayload);
};

const isActivityLogPermissionError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();

  return (
    code === '42501' ||
    message.includes('permission denied for table saharax_0u4w4d_activity_log')
  );
};

const recordRentalContractPriceEditActivity = async ({
  rental,
  currentUser,
  overrideMeta,
}) => {
  if (!rental?.id || !currentUser?.id) return;

  try {
    const actorName =
      currentUser.full_name ||
      currentUser.name ||
      currentUser.email ||
      'Staff';
    const sharedMetadata = {
      rental_id: rental.id,
      rental_reference: rental.rental_id || null,
      customer_name: rental.customer_name || null,
      previous_price: overrideMeta?.previousPrice || 0,
      new_price: overrideMeta?.newPrice || 0,
      override_note: overrideMeta?.note || null,
      edited_by_id: currentUser.id,
      edited_by_name: actorName,
      edited_at: overrideMeta?.editedAt || new Date().toISOString(),
    };

      const { error: sharedError } = await insertSharedActivityLog({
        user_id: currentUser.id,
        created_by: actorName,
        action: 'rental_contract_price_edited',
        description: `Edited rental contract price for ${rental.rental_id || rental.id}`,
        entity_type: 'rental',
        entity_id: rental.id,
        reason: overrideMeta?.note || null,
        details: sharedMetadata,
      });

      if (sharedError) {
        console.warn('⚠️ Failed to record shared rental contract price edit activity:', sharedError);
      }
  } catch (activityError) {
    console.warn('⚠️ Failed to record rental contract price edit activity:', activityError);
  }
};

const recordSecurityHoldActivity = async ({
  rental,
  currentUser,
  amount,
  method,
  cleared = false,
}) => {
  if (!rental?.id || !currentUser?.id) return;

  try {
    const actorName =
      currentUser.full_name ||
      currentUser.name ||
      currentUser.email ||
      'Staff';
    const sharedMetadata = {
      rental_id: rental.id,
      rental_reference: rental.rental_id || null,
      customer_name: rental.customer_name || null,
      amount: Number(amount || 0),
      method: method || null,
      cleared,
      updated_by_id: currentUser.id,
      updated_by_name: actorName,
      updated_at: new Date().toISOString(),
    };

    const title = cleared ? 'rental_security_hold_cleared' : 'rental_security_hold_updated';
    const details = cleared
      ? `${actorName} cleared the recorded security hold for ${rental.rental_id || rental.id}`
      : `${actorName} recorded ${Number(amount || 0)} MAD security hold via ${method === 'bank_transfer' ? 'bank transfer' : 'cash'} for ${rental.rental_id || rental.id}`;

    const { error: sharedError } = await insertSharedActivityLog({
      user_id: currentUser.id,
      created_by: actorName,
      action: title,
      description: cleared ? `Cleared security hold for ${rental.rental_id || rental.id}` : `Updated security hold for ${rental.rental_id || rental.id}`,
      entity_type: 'rental',
      entity_id: rental.id,
      reason: method || null,
      details: sharedMetadata,
    });

    if (sharedError) {
      console.warn('⚠️ Failed to record shared security hold activity:', sharedError);
    }
  } catch (activityError) {
    console.warn('⚠️ Failed to record security hold activity:', activityError);
  }
};

const getWeekendImpoundEstimatedReleaseDate = (impoundedAt) => {
  const impoundDate = new Date(impoundedAt || '');
  if (Number.isNaN(impoundDate.getTime())) return null;

  const day = impoundDate.getDay();
  let daysToAdd = 0;

  if (day === 5) daysToAdd = 3; // Friday -> Monday
  else if (day === 6) daysToAdd = 2; // Saturday -> Monday
  else if (day === 0) daysToAdd = 1; // Sunday -> Monday

  if (daysToAdd === 0) return null;

  const estimate = new Date(impoundDate);
  estimate.setDate(estimate.getDate() + daysToAdd);
  return estimate;
};

const activityLogMatchesRental = (log, rentalId) => {
  if (!log || !rentalId) return false;
  const details = log.details;
  if (details && typeof details === 'object') {
    return String(details.rental_id || '') === String(rentalId);
  }
  return String(log.entity_id || '') === String(rentalId);
};

const getWeekendMinimumEstimatedDays = (impoundedAt) => {
  const impoundDate = new Date(impoundedAt || '');
  if (Number.isNaN(impoundDate.getTime())) return 0;
  const day = impoundDate.getDay();
  // Estimate the additional rental days carried until a Monday court release.
  if (day === 4 || day === 5) return 3; // Thursday or Friday -> Monday
  if (day === 6) return 2; // Saturday -> Monday
  if (day === 0) return 1; // Sunday -> Monday
  return 0;
};

const DEFAULT_RENTAL_TIMING_SETTINGS = {
  graceMinutes: 120,
  softLockMinutes: 90,
};

const CANONICAL_PUBLIC_APP_URL =
  import.meta.env.VITE_PUBLIC_APP_URL ||
  import.meta.env.VITE_APP_URL ||
  'https://rental-system-frontend.vercel.app';

const getPublicAppOrigin = () => {
  try {
    return new URL(CANONICAL_PUBLIC_APP_URL).origin;
  } catch {
    return CANONICAL_PUBLIC_APP_URL;
  }
};

const getRentalElapsedTone = (rental, currentTime = Date.now()) => {
  const startedAtTime = new Date(rental?.started_at || rental?.rental_start_date || '').getTime();
  const plannedEndTime = new Date(
    rental?.actual_end_date || rental?.actual_end_time || rental?.rental_end_date || ''
  ).getTime();
  const durationMs = plannedEndTime - startedAtTime;

  if (!Number.isFinite(startedAtTime) || !Number.isFinite(plannedEndTime) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return {
      valueClass: 'text-green-600',
      iconClass: 'text-green-600',
      badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      labelClass: 'text-emerald-500',
      expired: false,
    };
  }

  const elapsedMs = Math.max(0, currentTime - startedAtTime);
  const progress = elapsedMs / durationMs;

  if (progress >= 1) {
    return {
      valueClass: 'text-red-600',
      iconClass: 'text-red-600',
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: true,
    };
  }

  if (progress >= 0.75) {
    return {
      valueClass: 'text-red-600',
      iconClass: 'text-red-600',
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: false,
    };
  }

  if (progress >= 0.45) {
    return {
      valueClass: 'text-amber-600',
      iconClass: 'text-amber-600',
      badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
      labelClass: 'text-amber-500',
      expired: false,
    };
  }

  return {
    valueClass: 'text-green-600',
    iconClass: 'text-green-600',
    badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    labelClass: 'text-emerald-500',
    expired: false,
  };
};

const STORAGE_PUBLIC_MARKER = '/storage/v1/object/public/';

const parseStoragePathFromPublicUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const markerIndex = url.indexOf(STORAGE_PUBLIC_MARKER);
  if (markerIndex === -1) return null;
  const storagePath = url.slice(markerIndex + STORAGE_PUBLIC_MARKER.length);
  const firstSlash = storagePath.indexOf('/');
  if (firstSlash === -1) return null;
  const path = decodeURIComponent(storagePath.slice(firstSlash + 1));
  return path || null;
};

const formatRentalScheduleDateTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return tr('Not scheduled', 'Non planifié');
  return date.toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatImpoundDateTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return tr('Not set', 'Non défini');
  return date.toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledRentalTimingState = (scheduledStartValue, timingSettings, nowValue = new Date()) => {
  const scheduledStart = new Date(scheduledStartValue || '');
  if (Number.isNaN(scheduledStart.getTime())) {
    return null;
  }

  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const graceMinutes = Number(timingSettings?.graceMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes);
  const softLockMinutes = Number(timingSettings?.softLockMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes);
  const minutesLate = Math.floor((now.getTime() - scheduledStart.getTime()) / 60000);
  const expiredAt = new Date(scheduledStart.getTime() + graceMinutes * 60000);

  return {
    now,
    scheduledStart,
    expiredAt,
    graceMinutes,
    softLockMinutes,
    minutesLate,
    isExpired: minutesLate > graceMinutes,
    isSoftLocked: minutesLate >= softLockMinutes,
    startsInMinutes: minutesLate < 0 ? Math.abs(minutesLate) : 0,
    minutesPastGrace: minutesLate > graceMinutes ? minutesLate - graceMinutes : 0,
  };
};

const WEBSITE_BOOKING_SOURCE_FIELDS = [
  'booking_source',
  'rental_source',
  'source',
  'channel',
  'origin',
  'created_via',
];

const WEBSITE_BOOKING_SOURCE_KEYWORDS = [
  'website',
  'web',
  'online',
  'customer',
  'self',
  'public',
];

const hasStaffCreatedRentalMetadata = (rentalLike = {}) => {
  return Boolean(
    rentalLike?.created_by ||
    rentalLike?.created_by_name ||
    rentalLike?.started_by ||
    rentalLike?.started_by_name ||
    rentalLike?.contract_signed_by ||
    rentalLike?.contract_signed_by_name
  );
};

const isWebsiteCustomerBooking = (rentalLike = {}) => {
  const explicitWebsiteSource = WEBSITE_BOOKING_SOURCE_FIELDS.some((field) => {
    const value = rentalLike?.[field];
    if (value === null || value === undefined) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    return WEBSITE_BOOKING_SOURCE_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
  });

  if (explicitWebsiteSource) return true;
  if (hasStaffCreatedRentalMetadata(rentalLike)) return false;

  // Safe default: only explicitly website/customer bookings auto-expire.
  return false;
};

const shouldAutoExpireScheduledRental = (rentalLike = {}) => {
  const scheduledStartRaw = rentalLike?.rental_start_date;
  const createdAtRaw = rentalLike?.created_at;

  if (scheduledStartRaw && createdAtRaw) {
    const scheduledStart = new Date(scheduledStartRaw);
    const createdAt = new Date(createdAtRaw);

    if (
      !Number.isNaN(scheduledStart.getTime()) &&
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getTime() > scheduledStart.getTime()
    ) {
      return false;
    }
  }

  return isWebsiteCustomerBooking(rentalLike);
};

const getRentalSourceChip = (rentalLike = {}) => {
  if (isWebsiteCustomerBooking(rentalLike)) {
    return {
      label: tr('Website reservation', 'Reservation site web'),
      className: 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
    };
  }

  const source = String(rentalLike?.inventory_source || '').trim().toLowerCase();
  if (source === 'marketplace') {
    return {
      label: tr('Marketplace reservation', 'Reservation marketplace'),
      className: 'border border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  return null;
};

const VEHICLE_REPORT_AREAS = [
  { id: 'front', label: 'Front', position: 'left-[50%] top-2 -translate-x-1/2' },
  { id: 'rear', label: 'Rear', position: 'left-[50%] bottom-2 -translate-x-1/2' },
  { id: 'left_side', label: 'Left Side', position: 'left-2 top-[50%] -translate-y-1/2' },
  { id: 'right_side', label: 'Right Side', position: 'right-2 top-[50%] -translate-y-1/2' },
  { id: 'front_left', label: 'Front Left', position: 'left-5 top-8' },
  { id: 'front_right', label: 'Front Right', position: 'right-5 top-8' },
  { id: 'rear_left', label: 'Rear Left', position: 'left-5 bottom-8' },
  { id: 'rear_right', label: 'Rear Right', position: 'right-5 bottom-8' },
  { id: 'seat_center', label: 'Center / Seat', position: 'left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2' },
];

const DEFAULT_VEHICLE_REPORT_DRAFT = {
  enabled: false,
  report_type: 'damage',
  severity: 'minor',
  description: '',
  affected_areas: [],
  customer_chargeable: false,
  customer_charge_amount: '',
  send_to_maintenance: true,
};

const getReceiptPreviewMeta = (rentalLike = {}) => {
  const isFinalPaymentReceipt =
    String(rentalLike?.payment_status || '').toLowerCase() === 'paid' &&
    String(rentalLike?.rental_status || '').toLowerCase() === 'completed' &&
    !rentalLike?.impound_is_estimate;

  return {
    title: isFinalPaymentReceipt ? 'Payment Receipt' : 'Estimate Receipt',
    description: isFinalPaymentReceipt
      ? 'Review the finalized payment receipt before sending it to the customer.'
      : 'Review the estimated charges before sending them to the customer.',
    listLabel: isFinalPaymentReceipt ? 'Payment Receipt' : 'Estimate Receipt',
    listDescription: isFinalPaymentReceipt
      ? 'Transaction details and payment confirmation'
      : 'Estimated charges while the rental is still open',
  };
};

export default function RentalDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isFrench = isFrenchLocale();
  const finishWorkflowStorageKey = id ? `rental_finish_workflow_${id}` : null;
  
  // 🔍 DEBUG: WhatsApp button click handler
  const [rental, setRental] = useState(null);
  const [linkedCustomerProfile, setLinkedCustomerProfile] = useState(null);
  const [tierPricingBreakdown, setTierPricingBreakdown] = useState(null);
  const [priceOverrideAuditMeta, setPriceOverrideAuditMeta] = useState(null);

  const removeFile = async (fileUrl, fileType) => {
    try {
      // Extract the file path from the URL
      const urlParts = fileUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const folderPath = urlParts.slice(-2, -1)[0]; // Get the folder name (e.g., 'opening_videos', 'closing_videos')
      
      // Delete from Supabase storage
      const { error: deleteError } = await supabase.storage
        .from('rental-media')
        .remove([`${folderPath}/${fileName}`]);
      
      if (deleteError) {
        console.error('Error deleting file from storage:', deleteError);
        throw deleteError;
      }
      
      // Update the rental record to remove the file reference
      let updateData = {};
      if (fileType === 'opening_video') {
        updateData.opening_video_url = null;
      } else if (fileType === 'closing_video') {
        updateData.closing_video_url = null;
      }
      
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id);
      
      if (updateError) throw updateError;
      
      // Update local state
      setRental(prev => ({
        ...prev,
        ...updateData
      }));
      
      toast.success('File removed successfully');
      await loadRentalData(true);
      
    } catch (err) {
      console.error('❌ Error removing file:', err);
      toast.error(`Failed to remove file: ${err.message}`);
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [elapsedTime, setElapsedTime] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [rentalTimingSettings, setRentalTimingSettings] = useState(DEFAULT_RENTAL_TIMING_SETTINGS);
  
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  
  const [capturedMedia, setCapturedMedia] = useState([]);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'opening' or 'closing'
  const [showMediaReview, setShowMediaReview] = useState(false); // Renamed from capturedMedia
  const [startWorkflowPresence, setStartWorkflowPresence] = useState([]);
  const [startWorkflowTakeover, setStartWorkflowTakeover] = useState(false);
  const [finishWorkflowPresence, setFinishWorkflowPresence] = useState([]);
  const [finishWorkflowTakeover, setFinishWorkflowTakeover] = useState(false);
  const [workflowClientSessionKey] = useState(() => {
    if (typeof window === 'undefined') return 'server';
    const storageKey = 'rental_workflow_client_session_key';
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const generated = `tab-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(storageKey, generated);
    return generated;
  });
  const [mediaStepComplete, setMediaStepComplete] = useState(false);
  const [mediaCount, setMediaCount] = useState({ photos: 0, videos: 0 });

  // Calculate media counts and update completion status
  const updateMediaCounts = (media) => {
    const photos = media.filter(m => m.type?.startsWith('image/')).length;
    const videos = media.filter(m => m.type?.startsWith('video/')).length;
    setMediaCount({ photos, videos });
    setMediaStepComplete(photos + videos > 0);
  };

  // Handle Done button click in modal
  const handleMediaCaptureDone = () => {
    setOpeningModalOpen(false);
    setClosingModalOpen(false);
    setShowMediaReview(true);
    // Don't upload yet, just show in review area
  };

  // Remove a captured media item
  const removeCapturedMedia = (mediaId) => {
    const mediaToRemove = capturedMedia.find((m) => m.id === mediaId);
    if (mediaToRemove?.url && mediaToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(mediaToRemove.url);
    }
    const updated = capturedMedia.filter(m => m.id !== mediaId);
    setCapturedMedia(updated);
    updateMediaCounts(updated);
  };

  const clearCapturedMediaState = () => {
    capturedMedia.forEach((media) => {
      if (media?.url && media.url.startsWith('blob:')) {
        URL.revokeObjectURL(media.url);
      }
    });
    setCapturedMedia([]);
    setShowMediaReview(false);
    updateMediaCounts([]);
  };

  const getWorkflowResetFields = () => ({
    contract_signed: false,
    signature_url: null,
    contract_signed_by: null,
    contract_signed_by_name: null,
    contract_signed_at: null,
    updated_at: new Date().toISOString(),
  });

  const handleResetOpeningInspection = async () => {
    try {
      const openingRecords = openingMedia.filter((media) => media?.id);
      const storagePaths = Array.from(
        new Set(
          openingRecords
            .flatMap((media) => [
              media.storage_path,
              parseStoragePathFromPublicUrl(media.thumbnail_url),
            ])
            .filter(Boolean)
        )
      );

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('rental-videos')
          .remove(storagePaths);
        if (storageError) {
          console.warn('Opening media storage cleanup warning:', storageError);
        }
      }

      if (openingRecords.length > 0) {
        const { error: mediaDeleteError } = await supabase
          .from('app_2f7bf469b0_rental_media')
          .delete()
          .in('id', openingRecords.map((media) => media.id));

        if (mediaDeleteError) throw mediaDeleteError;
      }

      const updateFields = {
        ...getWorkflowResetFields(),
        opening_video_url: null,
        opening_video_thumbnail: null,
      };

      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateFields)
        .eq('id', rental.id)
        .select('id')
        .single();

      if (error) throw error;

      clearCapturedMediaState();
      setOpeningMedia([]);
      await loadRentalData(true);
      toast.success('Opening inspection reset');
    } catch (err) {
      console.error('❌ Error resetting opening inspection:', err);
      toast.error(`Failed to reset opening inspection: ${err.message}`);
    }
  };

  const handleResetStartOdometer = async () => {
    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ...getWorkflowResetFields(),
          start_odometer: null,
        })
        .eq('id', rental.id)
        .select('id')
        .single();

      if (error) throw error;

      setIsEditingOdometer(false);
      if (rental?.vehicle?.current_odometer) {
        setStartOdometer(String(rental.vehicle.current_odometer));
      } else {
        setStartOdometer('');
      }
      await loadRentalData(true);
      toast.success('Starting odometer reset');
    } catch (err) {
      console.error('❌ Error resetting start odometer:', err);
      toast.error(`Failed to reset starting odometer: ${err.message}`);
    }
  };

  const handleResetPayment = async () => {
    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ...getWorkflowResetFields(),
          payment_status: 'unpaid',
          deposit_amount: 0,
          remaining_amount: rentalBillingSummary.grandTotal || 0,
        })
        .eq('id', rental.id)
        .select('id')
        .single();

      if (error) throw error;

      await loadRentalData(true);
      toast.success('Payment step reset');
    } catch (err) {
      console.error('❌ Error resetting payment step:', err);
      toast.error(`Failed to reset payment step: ${err.message}`);
    }
  };

  const handleSaveSecurityHold = async (nextAmountOverride = null, methodOverride = null) => {
    if (!rental?.id || isSavingSecurityHold) return;

    const nextAmount = Math.max(
      0,
      Number(nextAmountOverride !== null ? nextAmountOverride : securityHoldAmountInput) || 0
    );
    const nextMethod = nextAmount > 0
      ? (methodOverride || securityHoldAuditMeta?.method || 'cash')
      : null;

    try {
      setIsSavingSecurityHold(true);

      const updateData = {
        damage_deposit_received_amount: nextAmount,
        damage_deposit_received_at: nextAmount > 0
          ? rental?.damage_deposit_received_at || new Date().toISOString()
          : null,
        damage_deposit_source: nextAmount > 0 ? nextMethod : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id);

      if (error) throw error;

      setRental((prev) => prev ? { ...prev, ...updateData } : prev);
      setSecurityHoldAmountInput(nextAmount > 0 ? String(nextAmount) : '');
      setIsEditingSecurityHold(nextAmount <= 0);
      setSecurityHoldAuditMeta(
        nextAmount > 0
          ? {
              amount: nextAmount,
              method: nextMethod,
              updatedAt: updateData.damage_deposit_received_at || new Date().toISOString(),
              updatedByName: currentUser?.full_name || currentUser?.name || currentUser?.email || null,
            }
          : null
      );
      await recordSecurityHoldActivity({
        rental,
        currentUser,
        amount: nextAmount,
        method: nextMethod,
        cleared: nextAmount <= 0,
      });
      toast.success(
        nextAmount > 0
          ? tr(
              nextMethod === 'bank_transfer' ? 'Security hold recorded by bank transfer' : 'Security hold recorded by cash',
              nextMethod === 'bank_transfer' ? 'Garantie enregistrée par virement bancaire' : 'Garantie enregistrée en espèces'
            )
          : tr('Security cash cleared', 'Montant de garantie effacé')
      );
    } catch (err) {
      console.error('❌ Error saving security hold:', err);
      toast.error(`${tr('Failed to save security hold', 'Échec de l’enregistrement de la garantie')} : ${err.message}`);
    } finally {
      setIsSavingSecurityHold(false);
    }
  };

  const handleResetStartFuel = async () => {
    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ...getWorkflowResetFields(),
          start_fuel_level: null,
        })
        .eq('id', rental.id)
        .select('id')
        .single();

      if (error) throw error;

      setStartFuelLevel(null);
      await loadRentalData(true);
      toast.success('Starting fuel reset');
    } catch (err) {
      console.error('❌ Error resetting start fuel:', err);
      toast.error(`Failed to reset starting fuel: ${err.message}`);
    }
  };

  const openStartFuelModal = () => {
    setShowStartFuelModal(true);

    if (rental?.vehicle_id) {
      void (async () => {
        try {
          const currentState = await FuelTransactionService.getVehicleFuelState(rental.vehicle_id);
          if (currentState?.current_fuel_lines !== null && currentState?.current_fuel_lines !== undefined) {
            setCurrentVehicleFuelLevel(currentState.current_fuel_lines);
          }
        } catch (err) {
          console.error('❌ Error loading current vehicle fuel state:', err);
        }
      })();
    }
  };

  // Handle final upload of all captured media
  const handleUploadAllMedia = async () => {
    if (capturedMedia.length === 0) return;
    
    setIsProcessingVideo(true);
    try {
      // Upload all captured media sequentially
      for (const media of capturedMedia) {
        await uploadMediaItem(media);
      }
      setCapturedMedia([]);
      setShowMediaReview(false);
      updateMediaCounts([]);
      toast.success('All media uploaded successfully!');
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Failed to upload some media items. Please try again.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Upload a single media item
  const uploadMediaItem = async (media) => {
    const isOpening = media.isOpening !== false; // default to opening if not specified
    const fileName = `${isOpening ? 'opening' : 'closing'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const filePath = `${id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('rental-videos')
      .upload(filePath, media.file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('rental-videos')
      .getPublicUrl(filePath);

    const { error: dbError } = await supabase
      .from('rental_videos')
      .insert({
        rental_id: id,
        video_url: publicUrl,
        video_type: isOpening ? 'opening' : 'closing',
        file_type: media.type?.startsWith('image/') ? 'image' : 'video'
      });

    if (dbError) throw dbError;

    // Refresh media list
    if (isOpening) {
      setOpeningMedia(prev => [...prev, { video_url: publicUrl, file_type: media.type?.startsWith('image/') ? 'image' : 'video' }]);
    } else {
      setClosingMedia(prev => [...prev, { video_url: publicUrl, file_type: media.type?.startsWith('image/') ? 'image' : 'video' }]);
    }
  };
  
  const [openingMedia, setOpeningMedia] = useState([]);
  const [closingMedia, setClosingMedia] = useState([]);
  const [openingMediaMode, setOpeningMediaMode] = useState('video'); // 'video' or 'photo'
  const [closingMediaMode, setClosingMediaMode] = useState('video'); // 'video' or 'photo'
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  
  const [isSigning, setIsSigning] = useState(false);
  const [returnSignatureUrl, setReturnSignatureUrl] = useState(null);
  const [isSigningReturnContract, setIsSigningReturnContract] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const [documentLanguage, setDocumentLanguage] = useState('fr');
  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const forceMobileRender = async () => {
    if (!isMobileDevice()) return;
    
    // Force React to re-render hidden templates
    await new Promise(resolve => {
      setVideoRefreshKey(prev => prev + 1);
      setTimeout(resolve, 500);
    });
  };


  const [contractPreviewModal, setContractPreviewModal] = useState(false);
  const [receiptPreviewModal, setReceiptPreviewModal] = useState(false);
  const [impoundActionLoading, setImpoundActionLoading] = useState(false);
  const [showImpoundModal, setShowImpoundModal] = useState(false);
  const [showReleaseImpoundModal, setShowReleaseImpoundModal] = useState(false);
  const [impoundForm, setImpoundForm] = useState({
    reason: '',
    note: '',
    reference: '',
  });
  const [impoundChargeForm, setImpoundChargeForm] = useState({
    hours: 0,
    days: 0,
    rate: 0,
    discount: 0,
    total: 0,
    pricingMode: 'hourly',
    rateMode: 'package',
    pricingLabel: '',
  });
  const [impoundEstimatePreview, setImpoundEstimatePreview] = useState(null);
  const [waiveImpoundExtraDailyCharge, setWaiveImpoundExtraDailyCharge] = useState(false);
  const [savingImpoundCharge, setSavingImpoundCharge] = useState(false);
  const [impoundReceiptUploading, setImpoundReceiptUploading] = useState(false);
  const [releaseImpoundSubmitting, setReleaseImpoundSubmitting] = useState(false);
  const [releaseImpoundExceededPreview, setReleaseImpoundExceededPreview] = useState({
    days: 0,
    hours: 0,
    pricingLabel: '',
    estimatedTotal: 0,
    depositApplied: 0,
    remainingToPrepare: 0,
  });
  const [releaseImpoundChargePreset, setReleaseImpoundChargePreset] = useState(null);
  const [releaseImpoundForm, setReleaseImpoundForm] = useState({
    days: 0,
    hours: 0,
    rate: 0,
    discount: 0,
    impoundCharge: 0,
    calculatedTotal: 0,
    amountPaid: 0,
    pricingMode: 'hourly',
    rateMode: 'package',
    pricingLabel: '',
    receiptUrl: null,
    receiptName: '',
    receiptPath: null,
    receiptUploadedAt: null,
  });
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [isGeneratingBoth, setIsGeneratingBoth] = useState(false);

  // WhatsApp modal state
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappOptions, setWhatsappOptions] = useState({
    contract: true,
    receipt: true,
    openingVideo: false,
    closingVideo: false,
    bankingInfo: false
  });

  const [logoUrl, setLogoUrl] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);

  // Price editing state
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [manualPrice, setManualPrice] = useState('');
  const [priceOverrideReason, setPriceOverrideReason] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Video refresh trigger
  const [videoRefreshKey, setVideoRefreshKey] = useState(0);
  const [mobileLoading, setMobileLoading] = useState(false);

  // Extension state
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [editingExtension, setEditingExtension] = useState(null);
  const [extensions, setExtensions] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);

  // Late fee state
  const [lateFee, setLateFee] = useState(null);
  const [rentalHistory, setRentalHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Deposit return state
  const [showDepositSignatureModal, setShowDepositSignatureModal] = useState(false);
  const [deductFromDeposit, setDeductFromDeposit] = useState(false);
  const [depositReturnAmount, setDepositReturnAmount] = useState(0);
  const [securityHoldAmountInput, setSecurityHoldAmountInput] = useState('');
  const [isSavingSecurityHold, setIsSavingSecurityHold] = useState(false);
  const [securityHoldAuditMeta, setSecurityHoldAuditMeta] = useState(null);
  const [showSecurityHoldReminderModal, setShowSecurityHoldReminderModal] = useState(false);
  const [isEditingSecurityHold, setIsEditingSecurityHold] = useState(false);

  // Odometer state
  const [startOdometer, setStartOdometer] = useState('');
  const [isEditingOdometer, setIsEditingOdometer] = useState(false);
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);
  const [endOdometer, setEndOdometer] = useState('');
  const [showEndOdometerPrompt, setShowEndOdometerPrompt] = useState(false);
  const [isProcessingEndOdometer, setIsProcessingEndOdometer] = useState(false);
  const [isEditingEndOdometer, setIsEditingEndOdometer] = useState(false);
  const [isEditingStartOdometer, setIsEditingStartOdometer] = useState(false);
  const [startOdometerEditValue, setStartOdometerEditValue] = useState('');
  const [endOdometerEditValue, setEndOdometerEditValue] = useState('');

  // Fuel level state
  const [startFuelLevel, setStartFuelLevel] = useState(null);
  const [endFuelLevel, setEndFuelLevel] = useState(null);
  const [currentVehicleFuelLevel, setCurrentVehicleFuelLevel] = useState(null);
  const [showStartFuelModal, setShowStartFuelModal] = useState(false);
  const [showEndFuelModal, setShowEndFuelModal] = useState(false);
  const [fuelPricePerLine, setFuelPricePerLine] = useState(0);
  const [fuelCharge, setFuelCharge] = useState(0);
  const [finishRentalSteps, setFinishRentalSteps] = useState({
    showWorkflow: false,
    closingVideoComplete: false,
    endOdometerComplete: false,
    endFuelComplete: false
  });
  const [requiresClosingInspectionReview, setRequiresClosingInspectionReview] = useState(false);
  const [vehicleReportDraft, setVehicleReportDraft] = useState(DEFAULT_VEHICLE_REPORT_DRAFT);
  const [vehicleReport, setVehicleReport] = useState(null);
  const [savingVehicleReport, setSavingVehicleReport] = useState(false);
  const [maintenanceChargeForm, setMaintenanceChargeForm] = useState({
    days: 0,
    dailyRate: 0,
    discount: 0,
    total: 0,
    source: 'none',
  });
  const [savingMaintenanceCharge, setSavingMaintenanceCharge] = useState(false);
  const restoredFinishWorkflowRef = useRef(null);
  const notifiedAutoExpiredRentalsRef = useRef(new Set());

  const hasClosingInspectionMedia = closingMedia.length > 0;
  const reportRequired = vehicleReportDraft.enabled;
  const reportSaved = Boolean(vehicleReport?.id);
  const shouldShowVehicleReport = Boolean(
    vehicleReport && (
      String(vehicleReport.description || '').trim() ||
      (Array.isArray(vehicleReport.photos) && vehicleReport.photos.length > 0) ||
      (Array.isArray(vehicleReport.affected_areas) && vehicleReport.affected_areas.length > 0) ||
      vehicleReport.maintenance ||
      vehicleReport.send_to_maintenance ||
      vehicleReport.customer_chargeable
    )
  );
  const reportNeedsAffectedAreas = vehicleReportDraft.report_type !== 'mechanical_issue';
  const hasAffectedAreas = Array.isArray(vehicleReportDraft.affected_areas) && vehicleReportDraft.affected_areas.length > 0;

  const normalizedVehicleReportDraft = reportRequired ? {
    report_type: vehicleReportDraft.report_type || 'damage',
    severity: vehicleReportDraft.severity || 'minor',
    description: vehicleReportDraft.description.trim(),
    affected_areas: [...(vehicleReportDraft.affected_areas || [])].sort(),
    customer_chargeable: Boolean(vehicleReportDraft.customer_chargeable),
    customer_charge_amount: vehicleReportDraft.send_to_maintenance ? '' : String(vehicleReportDraft.customer_charge_amount ?? ''),
    send_to_maintenance: Boolean(vehicleReportDraft.send_to_maintenance),
  } : null;

  const normalizedSavedVehicleReport = vehicleReport ? {
    report_type: vehicleReport.report_type || 'damage',
    severity: vehicleReport.severity || 'minor',
    description: (vehicleReport.description || '').trim(),
    affected_areas: [...(Array.isArray(vehicleReport.affected_areas) ? vehicleReport.affected_areas : [])].sort(),
    customer_chargeable: Boolean(vehicleReport.customer_chargeable),
    customer_charge_amount: vehicleReport.send_to_maintenance ? '' : String(vehicleReport.customer_charge_amount ?? ''),
    send_to_maintenance: Boolean(vehicleReport.send_to_maintenance),
  } : null;

  const reportHasUnsavedChanges = reportRequired && (
    !reportSaved ||
    JSON.stringify(normalizedVehicleReportDraft) !== JSON.stringify(normalizedSavedVehicleReport)
  );

  const canSaveVehicleReport = reportRequired &&
    hasClosingInspectionMedia &&
    (!reportNeedsAffectedAreas || hasAffectedAreas) &&
    !savingVehicleReport;

  const rentalAttention = getRentalAttentionState(rental, vehicleReport);
  const reportWorkflowLocked = reportSaved;
  const maintenanceStatus = String(vehicleReport?.maintenance?.status || '').toLowerCase();
  const vehicleStillUnderMaintenance = Boolean(
    rentalAttention?.status === 'under_maintenance' ||
    (vehicleReport?.maintenance && maintenanceStatus !== 'completed') ||
    (vehicleReport?.send_to_maintenance && !vehicleReport?.maintenance)
  );
  const incidentSummaryToneClass = vehicleStillUnderMaintenance
    ? 'border-orange-200 bg-orange-50 text-orange-800'
    : 'border-green-200 bg-green-50 text-green-800';
  const incidentSummaryTitle = vehicleStillUnderMaintenance
    ? tr('Vehicle sent to maintenance', 'Véhicule envoyé en maintenance')
    : tr('Vehicle report saved', 'Rapport véhicule enregistré');
  const incidentSummaryBody = vehicleStillUnderMaintenance
    ? tr('Inspection complete, report saved, and the vehicle is now held under maintenance until an admin closes the maintenance record.', "Inspection terminée, rapport enregistré, et le véhicule reste en maintenance jusqu'à la clôture du dossier par un administrateur.")
    : tr('Inspection complete and report saved. The timer can continue until the rental is financially completed.', "Inspection terminée et rapport enregistré. Le minuteur peut continuer jusqu'à la clôture financière de la location.");

  const inspectionComplete = reportRequired
    ? hasClosingInspectionMedia && reportSaved && !reportHasUnsavedChanges && !requiresClosingInspectionReview
    : hasClosingInspectionMedia && !requiresClosingInspectionReview;
  const closingInspectionStepComplete = finishRentalSteps.closingVideoComplete || inspectionComplete || reportWorkflowLocked;

  const scrollToVehicleReport = () => {
    vehicleReportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToRentalMedia = () => {
    rentalMediaSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };


  const [customerDetailsDrawer, setCustomerDetailsDrawer] = useState({
    isOpen: false,
    customerId: null,
    rental: null,
    secondDrivers: [],
    viewMode: 'customer'
  });
  const syncedCustomerDetails = useMemo(() => ({
    fullName: linkedCustomerProfile?.full_name || rental?.customer_name || '',
    email: linkedCustomerProfile?.email || rental?.customer_email || '',
    phone: linkedCustomerProfile?.phone || rental?.customer_phone || '',
    address: linkedCustomerProfile?.address || rental?.customer_address || '',
    licenceNumber:
      linkedCustomerProfile?.licence_number ||
      rental?.customer_licence_number ||
      rental?.customer_id_number ||
      '',
    nationality: linkedCustomerProfile?.nationality || rental?.customer_nationality || '',
  }), [linkedCustomerProfile, rental]);
  const syncedCustomerPhone = syncedCustomerDetails.phone || '';
  // Fuel charge toggle state - use safe default
  const [fuelChargeEnabled, setFuelChargeEnabled] = useState(true);
// Camera recording state - NEW for native camera support
const [isRecording, setIsRecording] = useState(false);
const [facingMode, setFacingMode] = useState('environment'); // Default to back camera
const [isFirstLoad, setIsFirstLoad] = useState(true);
const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false); // 'environment' = back, 'user' = front
const [recordingStream, setRecordingStream] = useState(null);
const [mediaRecorder, setMediaRecorder] = useState(null);
const [recordedChunks, setRecordedChunks] = useState([]);
const [torchEnabled, setTorchEnabled] = useState(false);
const videoPreviewRef = useRef(null);
const canvasRef = useRef(null);
const animationFrameRef = useRef(null);

// Separate refs for each modal to avoid conflicts
const openingVideoRef = useRef(null);
const openingCanvasRef = useRef(null);
const closingVideoRef = useRef(null);
const closingCanvasRef = useRef(null);
const endOdometerEditInputRef = useRef(null);
const endOdometerPromptInputRef = useRef(null);

// Video conversion state - for iOS .MOV/HEVC to mp4 conversion
const [isConverting, setIsConverting] = useState(false);
const [conversionProgress, setConversionProgress] = useState(0);
const [pdfCache, setPdfCache] = useState({
  contractUrl: null,
  receiptUrl: null,
  contractGenerating: false,
  receiptGenerating: false
});
// Package and kilometer tracking state
const [includedKilometers, setIncludedKilometers] = useState(0);
const [extraKmRate, setExtraKmRate] = useState(0);
const [packageDetails, setPackageDetails] = useState(null);
const [mediaViewMode, setMediaViewMode] = useState('list');

// Update fuel charge enabled state when rental data loads
useEffect(() => {
  if (rental) {
    setFuelChargeEnabled(rental.fuel_charge_enabled ?? true);
  }
}, [rental?.id, rental?.fuel_charge_enabled]);

useEffect(() => {
  let cancelled = false;

  const loadRentalTimingSettings = async () => {
    try {
      const data = await fetchSystemSettings();
      if (cancelled || !data) return;

      setRentalTimingSettings({
        graceMinutes: Number(data.rentalGracePeriodMinutes ?? data.rental_grace_period_minutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes),
        softLockMinutes: Number(data.rentalSoftLockMinutes ?? data.rental_soft_lock_minutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes),
      });
    } catch (_error) {
      if (!cancelled) {
        setRentalTimingSettings(DEFAULT_RENTAL_TIMING_SETTINGS);
      }
    }
  };

  loadRentalTimingSettings();

  return () => {
    cancelled = true;
  };
}, []);

const contractRef = useRef();
const invoiceRef = useRef();
const contractTemplateRef = useRef();
const receiptTemplateRef = useRef();
const contractPdfRef = useRef();
const receiptPdfRef = useRef();
const contractShareRef = useRef();   // dedicated off-screen ref for WhatsApp sharing
const receiptShareRef = useRef();    // dedicated off-screen ref for WhatsApp sharing
const vehicleReportSectionRef = useRef(null);
const rentalMediaSectionRef = useRef(null);
const contractUrlRef = useRef(null);
const receiptUrlRef = useRef(null);
const impoundReceiptInputRef = useRef(null);
const impoundReceiptCameraInputRef = useRef(null);
const releaseImpoundReceiptInputRef = useRef(null);
const releaseImpoundReceiptCameraInputRef = useRef(null);
// Clear global PDF cache on mount so stale URLs never get reused
if (typeof window !== 'undefined') {
  window.__pdfCache = {};
  window.__pdfGenerating = {};
}

// Capture template as high-res image using same method as handlePrintContract/Receipt
// but upload to Supabase instead of saving/opening
// Public view URLs — perfect quality, works on all devices, no upload needed
const generateContractPDFBlob = async () => {
  return `${getPublicAppOrigin()}/view/rental/${rental.id}?type=contract&lang=${documentLanguage}`;
};

const generateReceiptPDFBlob = async () => {
  return `${getPublicAppOrigin()}/view/rental/${rental.id}?type=receipt&lang=${documentLanguage}`;
};

const handlePrintContract = async ({ shareOnly = false } = {}) => {
  if (!contractTemplateRef.current) {
    toast.error('Contract template not found');
    return null;
  }

  try {
    // Use contractTemplateRef (modal) — always renders correctly
    const contractRoot = contractTemplateRef.current || contractPdfRef.current;
    const page1 = contractRoot?.querySelector('.page-container') || contractRoot;
    const contractElement = page1;
    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;
    const MARGIN = 10;

    const canvas = await html2canvas(contractElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: (A4_WIDTH - MARGIN * 2) * 3.78,
      windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const imgWidth = A4_WIDTH - (MARGIN * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yPos = MARGIN;
    if (imgHeight > A4_HEIGHT - (MARGIN * 2)) {
      const scaleFactor = (A4_HEIGHT - (MARGIN * 2)) / imgHeight;
      const scaledWidth = imgWidth * scaleFactor;
      const scaledHeight = imgHeight * scaleFactor;
      const xPos = (A4_WIDTH - scaledWidth) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', xPos, yPos, scaledWidth, scaledHeight);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', MARGIN, yPos, imgWidth, imgHeight);
    }

    const pdfBlob = pdf.output('blob');

    // Upload to Supabase — required for WhatsApp sharing
    const filePath = `contracts/contract_${rental.rental_id}_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('rental-documents')
      .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
    let uploadedUrl = null;
    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(filePath);
      contractUrlRef.current = publicUrl;
      uploadedUrl = publicUrl;
    } else {
      console.error('Contract upload error:', upErr);
    }

    if (!shareOnly) {
      const filename = `Contract_${rental?.rental_id || rental?.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
      } else {
        pdf.save(filename);
      }
    }

    return uploadedUrl;
  } catch (error) {
    console.error('❌ Error generating contract PDF:', error);
    toast.error('Failed to generate contract PDF. Please try again.');
    return null;
  }
};

const handlePrintReceipt = async ({ shareOnly = false } = {}) => {
  if (!receiptTemplateRef.current) {
    toast.error('Receipt template not found');
    return null;
  }

  try {
    const receiptRoot = receiptTemplateRef.current || receiptPdfRef.current;
    const page1 = receiptRoot?.querySelector('.page-container') || receiptRoot?.querySelector('.receipt-container') || receiptRoot;
    const receiptElement = page1;

    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;
    const MARGIN = 10;

    const canvas = await html2canvas(receiptElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: (A4_WIDTH - MARGIN * 2) * 3.78,
      windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const imgWidth = A4_WIDTH - (MARGIN * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yPos = MARGIN;
    if (imgHeight > A4_HEIGHT - (MARGIN * 2)) {
      const scaleFactor = (A4_HEIGHT - (MARGIN * 2)) / imgHeight;
      const scaledWidth = imgWidth * scaleFactor;
      const scaledHeight = imgHeight * scaleFactor;
      const xPos = (A4_WIDTH - scaledWidth) / 2;

      pdf.addImage(
        canvas.toDataURL('image/jpeg', 1.0),
        'JPEG',
        xPos,
        yPos,
        scaledWidth,
        scaledHeight
      );
    } else {
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 1.0),
        'JPEG',
        MARGIN,
        yPos,
        imgWidth,
        imgHeight
      );
    }
    
    const pdfBlobReceipt = pdf.output('blob');

    // Upload to Supabase — required for WhatsApp sharing
    const receiptFilePath = `receipts/receipt_${rental.rental_id}_${Date.now()}.pdf`;
    const { error: receiptUpErr } = await supabase.storage
      .from('rental-documents')
      .upload(receiptFilePath, pdfBlobReceipt, { contentType: 'application/pdf', upsert: true });
    let receiptUploadedUrl = null;
    if (!receiptUpErr) {
      const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(receiptFilePath);
      receiptUrlRef.current = publicUrl;
      receiptUploadedUrl = publicUrl;
    } else {
      console.error('Receipt upload error:', receiptUpErr);
    }

    if (!shareOnly) {
      const filename = `Receipt_${rental.rental_id || rental.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        const pdfUrl = URL.createObjectURL(pdfBlobReceipt);
        window.open(pdfUrl, '_blank');
      } else {
        pdf.save(filename);
      }
    }

    if (RENTAL_DEBUG) console.log('✅ Receipt PDF generated successfully');
    return receiptUploadedUrl;
  } catch (error) {
    console.error('❌ Error generating receipt PDF:', error);
    toast.error(tr('Failed to generate receipt PDF. Please try again.', 'Impossible de générer le reçu PDF. Veuillez réessayer.'));
    return null;
  }
};

const handlePrintInvoice = () => {
  if (!rental?.id) { 
    toast.error(tr('Rental ID missing', "ID de location manquant")); 
    return; 
  }
  window.open(`/invoice/${rental.id}`, "_blank");
};

// ── Shared: generate PDF blob using exact same logic as print buttons ─────────
const generatePDFBlob = async (element) => {
  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;
  const MARGIN = 10;

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: (A4_WIDTH - MARGIN * 2) * 3.78,
    windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const imgWidth = A4_WIDTH - MARGIN * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > A4_HEIGHT - MARGIN * 2) {
    const scale = (A4_HEIGHT - MARGIN * 2) / imgHeight;
    const sw = imgWidth * scale;
    const sh = imgHeight * scale;
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', (A4_WIDTH - sw) / 2, MARGIN, sw, sh);
  } else {
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', MARGIN, MARGIN, imgWidth, imgHeight);
  }

  return pdf.output('blob');
};

// Upload a PDF blob to Supabase and return public URL
const uploadPDFBlob = async (blob, prefix) => {
  const filePath = `${prefix}s/${prefix}_${rental.rental_id}_${Date.now()}.pdf`;
  const { data, error } = await supabase.storage
    .from('rental-documents')
    .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(filePath);
  return publicUrl;
};

const toDataURL = (url) =>
  fetch(url)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );

// Calculate tier pricing breakdown
const calculateTierPricingBreakdown = async () => {
  // 🚨 CRITICAL: Add this null check FIRST
  if (!rental) {
    if (RENTAL_DEBUG) console.log('⏳ Rental data not loaded yet, skipping tier pricing');
    setTierPricingBreakdown(null);
    return null;
  }

  // 🚨 Then check for package
  if (packageDetails || rental?.package) {
    if (RENTAL_DEBUG) console.log('📦 Package exists, skipping tier pricing breakdown');
    setTierPricingBreakdown(null);
    return null;
  }

    // Now it's safe to access rental properties
    if (rental.rental_type !== 'hourly') return null;

    try {
      let standardHourlyRate = 0;
      let priceSource = 'fallback'; // Track where the price came from
      
      // First try: Fetch from base_prices table using vehicle_model_id
      if (rental.vehicle?.vehicle_model?.id) {
        try {
          const { data: priceData, error } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('hourly_price')
            .eq('vehicle_model_id', rental.vehicle.vehicle_model.id)
            .eq('is_active', true)
            .maybeSingle(); // Use maybeSingle() to avoid errors when no row found
          
          if (error) {
            console.warn('⚠️ Error fetching base_prices:', error.message);
          } else if (priceData?.hourly_price) {
            standardHourlyRate = parseFloat(priceData.hourly_price);
            priceSource = 'database';
            if (RENTAL_DEBUG) console.log('✅ Got hourly rate from database:', standardHourlyRate);
          }
        } catch (apiError) {
          console.warn('⚠️ API call failed for base_prices:', apiError.message);
        }
      }

      // Second try: Check the vehicle model hourly price, matching the rental form logic
      if (standardHourlyRate === 0 && rental.vehicle?.vehicle_model?.hourly_price) {
        standardHourlyRate = parseFloat(rental.vehicle.vehicle_model.hourly_price);
        priceSource = 'vehicle_model';
      }

      // Third try: Check if vehicle has hourly_rate directly
      if (standardHourlyRate === 0 && rental.vehicle?.hourly_rate) {
        standardHourlyRate = parseFloat(rental.vehicle.hourly_rate);
        priceSource = 'vehicle_rate';
      }

      // Final fallback: keep these aligned with the rental form defaults
      if (standardHourlyRate === 0) {
        const vehicleModelId = rental.vehicle?.vehicle_model?.id;
        if (vehicleModelId === '9f6cca16-9269-4a0e-9d99-d775d4c67b5b') {
          standardHourlyRate = 399;
        } else if (vehicleModelId === 'cec1ed26-b093-4482-9f0d-70eab752ee56') {
          standardHourlyRate = 599;
        } else if (vehicleModelId === 'dc2fcf54-1135-4149-a876-43d73e7fd87e') {
          standardHourlyRate = 999;
        } else {
          standardHourlyRate = 400;
        }
        priceSource = 'fallback';
      }

      if (standardHourlyRate <= 0) {
        setTierPricingBreakdown(null);
        return;
      }

      // Use quantity_hours for hourly rentals, fallback to quantity_days
      let duration = rental.quantity_hours ?? rental.quantity_days ?? 1;
      
      // Only use date calculation for SCHEDULED rentals (not started yet)
      // Once rental is active/completed, rental_end_date includes extensions
      if (rental.rental_status === 'scheduled' && rental.rental_start_date && rental.rental_end_date) {
        const start = new Date(rental.rental_start_date);
        const end = new Date(rental.rental_end_date);
        const actualHours = Math.ceil((end - start) / (1000 * 60 * 60));
        if (actualHours > 0) {
          duration = actualHours;
          if (RENTAL_DEBUG) console.log('📊 Using original scheduled duration:', duration, 'hours');
        }
      } else {
        if (RENTAL_DEBUG) console.log('📊 Using quantity_hours for base duration:', duration, 'hours');
      }
      const tierRate = rental.unit_price || 0;
      
      const standardTotal = duration * standardHourlyRate;
      const tierTotal = duration * tierRate;
      const savings = standardTotal - tierTotal;
      const savingsPercentage = standardTotal > 0 ? (savings / standardTotal * 100).toFixed(1) : 0;
      const isDiscounted = savings > 0;

      const getTierDescription = () => {
        if (duration === 1) return "1-hour standard rate";
        if (duration === 2) return "2-hour special rate";
        if (duration === 3) return "3-hour package deal";
        if (duration >= 4 && duration < 24) return `${duration}-hour bundle`;
        if (duration >= 24) return "Daily package (24h)";
        return `${duration}-hour package`;
      };

      const breakdown = {
        vehicleName: rental.vehicle?.name || 'Vehicle',
        duration: duration,
        standardHourlyRate: standardHourlyRate,
        tierRate: tierRate,
        standardTotal: standardTotal,
        tierTotal: tierTotal,
        savings: savings,
        savingsPercentage: savingsPercentage,
        isDiscounted: isDiscounted,
        tierDescription: getTierDescription(),
        isSamePrice: savings === 0,
        source: priceSource // Add source tracking
      };

      setTierPricingBreakdown(breakdown);

    } catch (error) {
      console.error('❌ Error calculating tier pricing breakdown:', error);
      setTierPricingBreakdown(null);
    }
  };

  // Calculate daily tier pricing breakdown
  const calculateDailyTierPricingBreakdown = async () => {
    // 🚨 CRITICAL: Add this null check FIRST
    if (!rental) {
      if (RENTAL_DEBUG) console.log('⏳ Rental data not loaded yet, skipping daily tier pricing');
      setTierPricingBreakdown(null);
      return null;
    }

    // 🚨 Then check for package
    if (packageDetails || rental?.package) {
      if (RENTAL_DEBUG) console.log('📦 Package exists, skipping daily tier pricing breakdown');
      setTierPricingBreakdown(null);
      return null;
    }

    // Now it's safe to access rental properties
    if (rental.rental_type !== 'daily') return null;

    try {
      let standardDailyRate = 0;
      let priceSource = 'fallback';

      // First try: Fetch from base_prices table using vehicle_model_id
      if (rental.vehicle?.vehicle_model?.id) {
        try {
          const { data: priceData, error } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('daily_price')
            .eq('vehicle_model_id', rental.vehicle.vehicle_model.id)
            .eq('is_active', true)
            .maybeSingle();

          if (error) {
            console.warn('⚠️ Error fetching daily base_prices:', error.message);
          } else if (priceData?.daily_price) {
            standardDailyRate = parseFloat(priceData.daily_price);
            priceSource = 'database';
            if (RENTAL_DEBUG) console.log('✅ Got daily rate from database:', standardDailyRate);
          }
        } catch (apiError) {
          console.warn('⚠️ API call failed for daily base_prices:', apiError.message);
        }
      }

      // Second try: Check the vehicle model daily price, matching the rental form logic
      if (standardDailyRate === 0 && rental.vehicle?.vehicle_model?.daily_price) {
        standardDailyRate = parseFloat(rental.vehicle.vehicle_model.daily_price);
        priceSource = 'vehicle_model';
      }

      // Third try: Check if vehicle has daily_rate directly
      if (standardDailyRate === 0 && rental.vehicle?.daily_rate) {
        standardDailyRate = parseFloat(rental.vehicle.daily_rate);
        priceSource = 'vehicle_rate';
      }

      // Final fallback: keep these aligned with the rental form defaults
      if (standardDailyRate === 0) {
        const vehicleModelId = rental.vehicle?.vehicle_model?.id;
        if (vehicleModelId === '9f6cca16-9269-4a0e-9d99-d775d4c67b5b') {
          standardDailyRate = 1499;
        } else if (vehicleModelId === 'cec1ed26-b093-4482-9f0d-70eab752ee56') {
          standardDailyRate = 1999;
        } else if (vehicleModelId === 'dc2fcf54-1135-4149-a876-43d73e7fd87e') {
          standardDailyRate = 3499;
        } else {
          standardDailyRate = 1500;
        }
        priceSource = 'fallback';
      }

      if (standardDailyRate <= 0) {
        setTierPricingBreakdown(null);
        return;
      }

      // Calculate duration in days
      let duration = rental.quantity_days || 1;

      if (rental.rental_status === 'scheduled' && rental.rental_start_date && rental.rental_end_date) {
        const start = new Date(rental.rental_start_date);
        const end = new Date(rental.rental_end_date);
        const actualDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        if (actualDays > 0) {
          duration = actualDays;
          if (RENTAL_DEBUG) console.log('📊 Using original scheduled duration:', duration, 'days');
        }
      } else {
        if (RENTAL_DEBUG) console.log('📊 Using quantity_days for base duration:', duration, 'days');
      }

      const tierRate = rental.unit_price || 0;
      const standardTotal = duration * standardDailyRate;
      const tierTotal = duration * tierRate;
      const savings = standardTotal - tierTotal;
      const savingsPercentage = standardTotal > 0 ? (savings / standardTotal * 100).toFixed(1) : 0;
      const isDiscounted = savings > 0;

      const getTierDescription = () => {
        if (duration === 1) return "1-day standard rate";
        if (duration === 2) return "2-day package deal";
        if (duration === 3) return "3-day special offer";
        if (duration >= 4 && duration < 7) return `${duration}-day extended package`;
        if (duration >= 7) return "Weekly+ package (7+ days)";
        return `${duration}-day package`;
      };

      const breakdown = {
        vehicleName: rental.vehicle?.name || 'Vehicle',
        duration: duration,
        standardHourlyRate: standardDailyRate, // Keep same field name for compatibility
        tierRate: tierRate,
        standardTotal: standardTotal,
        tierTotal: tierTotal,
        savings: savings,
        savingsPercentage: savingsPercentage,
        isDiscounted: isDiscounted,
        tierDescription: getTierDescription(),
        isSamePrice: savings === 0,
        source: priceSource,
        isDaily: true // Flag to indicate daily pricing
      };

      setTierPricingBreakdown(breakdown);

    } catch (error) {
      console.error('❌ Error calculating daily tier pricing breakdown:', error);
      setTierPricingBreakdown(null);
    }
  };

  useEffect(() => {
    // 🚨 Add this null check
    if (!rental) return;
    
    if (rental?.unit_price && rental?.vehicle?.id) {
      if (rental?.rental_type === 'hourly') {
        calculateTierPricingBreakdown();
      } else if (rental?.rental_type === 'daily') {
        calculateDailyTierPricingBreakdown();
      }
    }
  }, [rental?.unit_price, rental?.vehicle?.id, rental?.rental_type, rental?.quantity_days, rental?.quantity_hours]); 
  // 📊 RENTAL DATA LOGGING - only on rental ID change to prevent spam
  useEffect(() => {
    if (rental) {
      if (RENTAL_DEBUG) console.log('📊 Rental data loaded:', {
        id: rental.rental_id,
        type: rental.rental_type,
        hours: rental.quantity_hours,
        days: rental.quantity_days,
        rate: rental.unit_price,
        total: rental.rental_type === 'hourly' 
          ? (rental.quantity_hours ?? 1) * rental.unit_price
          : (rental.quantity_days ?? 1) * rental.unit_price
      });
    }
  }, [rental?.id]);

  useEffect(() => {
    toDataURL("/assets/logo.jpg").then((dataUrl) => {
      setLogoUrl(dataUrl);
    });
    toDataURL("/assets/stamp.png").then((dataUrl) => {
      setStampUrl(dataUrl);
    });
  }, []);

  // Handle openExtension URL parameter (from Dashboard urgent rentals)
  useEffect(() => {
    // Check if URL has openExtension parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('openExtension') === 'true') {
      if (RENTAL_DEBUG) console.log('🔍 Found openExtension parameter, opening extension modal...');
      
      // Small delay to ensure component is fully loaded
      setTimeout(() => {
        // Make sure setExtensionModalOpen exists in your component
        if (typeof setExtensionModalOpen === 'function') {
          setEditingExtension(null);
          setExtensionModalOpen(true);
          
          // Clean up the URL (remove the query parameter)
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }, 500);
    }
  }, []);
  useEffect(() => {
    if (!userProfile) return;

    setCurrentUser({
      ...userProfile,
      full_name: userProfile.full_name || userProfile.fullName || userProfile.email,
    });
  }, [userProfile]);

  // Load extensions for this rental
  const loadRentalHistory = async (rentalId) => {
    if (!rentalId) return;
    try {
      const { data } = await supabase
        .from('saharax_0u4w4d_activity_log')
        .select('*')
        .eq('entity_type', 'rental')
        .order('created_at', { ascending: false })
        .limit(150);
      setRentalHistory((data || []).filter((log) => activityLogMatchesRental(log, rentalId)));
    } catch(e) { setRentalHistory([]); }
  };

  const syncVehicleCurrentOdometer = async (vehicleId, odometerValue) => {
    if (!vehicleId || Number.isNaN(odometerValue)) return;

    const { error } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .update({
        current_odometer: odometerValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vehicleId);

    if (error) throw error;
  };

  const handleEditStartOdometer = async () => {
    const newStart = parseFloat(startOdometerEditValue);
    if (isNaN(newStart) || newStart < 0) { toast.error('Invalid start odometer'); return; }
    const endOdom = parseFloat(rental?.ending_odometer || 0);
    if (endOdom > 0 && newStart > endOdom) { toast.error(`Start (${newStart}) cannot exceed end (${endOdom})`); return; }
    try {
      const totalKm = endOdom > 0 ? endOdom - newStart : 0;
      await supabase.from('app_4c3a7a6153_rentals').update({
        start_odometer: newStart,
        total_kilometers_driven: totalKm,
        total_distance: totalKm
      }).eq('id', rental.id);
      setRental(prev => ({
        ...prev,
        start_odometer: newStart,
        total_kilometers_driven: totalKm,
        total_distance: totalKm,
      }));
      setIsEditingStartOdometer(false);
      toast.success(`Start odometer updated to ${newStart} km`);
    } catch(err) { toast.error(`Failed: ${err.message}`); }
  };

  const loadExtensions = async (forceRefresh = false) => {
    if (!id) return;
    
    const cacheKey = `extensions_${id}`;
    if (forceRefresh) {
      apiManager.invalidate(cacheKey);
    }
    
    setLoadingExtensions(true);
    try {
      const data = await apiManager.request(cacheKey, async () => {
        const { extensions } = await ExtensionPricingService.getExtensionsByRental(id);
        return extensions || [];
      });
      
      setExtensions(data);
      if (RENTAL_DEBUG) console.log('✅ Extensions loaded:', data?.length || 0);
    } catch (err) {
      console.error('❌ Error loading extensions:', err);
    } finally {
      setLoadingExtensions(false);
    }
  };

  // Load rental data and fetch vehicle's current odometer - UPDATED to include package
  // ✅ FIXED: Fetch second drivers separately to ensure data is loaded
  // ✅ FIXED: Fetch second drivers separately - REMOVED the invalid unit_price column
  const fetchSecondDriversSeparately = async (rentalId) => {
    const cacheKey = `second_drivers_${rentalId}`;
    
    try {
      const data = await apiManager.request(cacheKey, async () => {
        const { data, error } = await fetchWithRetry(() =>
          supabase
            .from('app_4c3a7a6153_rental_second_drivers')
            .select('*')
            .eq('rental_id', rentalId)
        );
        
        if (error) {
          console.error('Error fetching second drivers:', error);
          throw error;
        }
        
        return data || [];
      });
      
      if (RENTAL_DEBUG) console.log('✅ Separately fetched second drivers:', data?.length || 0);
      return data;
    } catch (err) {
      console.error('❌ Error in separate fetch:', err);
      return [];
    }
  };


  // ✅ Rate-limit protection: fetchWithRetry with exponential backoff
  // Handles both thrown errors AND Supabase response objects with error.status === 429
  const fetchWithRetry = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await fn();
        // Check if Supabase returned a 429 in the response object (not thrown)
        if (result?.error?.message?.includes('429') || result?.error?.code === '429' || result?.status === 429) {
          if (i < maxRetries - 1) {
            const waitTime = Math.pow(2, i + 1) * 1000;
            if (RENTAL_DEBUG) console.log(`⏳ Rate limited (response), retrying in ${waitTime}ms... (attempt ${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        return result;
      } catch (error) {
        if ((error?.status === 429 || error?.message?.includes('429')) && i < maxRetries - 1) {
          const waitTime = Math.pow(2, i + 1) * 1000;
          if (RENTAL_DEBUG) console.log(`⏳ Rate limited (thrown), retrying in ${waitTime}ms... (attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (i === maxRetries - 1) {
          console.error('❌ fetchWithRetry: All retries exhausted', error);
          throw error;
        } else {
          throw error;
        }
      }
    }
  };

  // ✅ Cooldown tracking to prevent too-frequent fetches
  const lastFetchTimeRef = useRef(0);
  const startRentalInFlightRef = useRef(false);
  const FETCH_COOLDOWN = 5000; // 5 seconds between fetches (increased from 2s to reduce 429s)

  // Global cooldown for manual actions
  const [lastActionTime, setLastActionTime] = useState(0);
  const [isStartingRental, setIsStartingRental] = useState(false);

  useEffect(() => {
    const receivedAmount = Number(rental?.damage_deposit_received_amount || 0);
    setSecurityHoldAmountInput(receivedAmount > 0 ? String(receivedAmount) : '');
  }, [rental?.id, rental?.damage_deposit_received_amount]);
  const ACTION_COOLDOWN = 2000; // 2 seconds between actions

  const canPerformAction = () => {
    const now = Date.now();
    if (now - lastActionTime < ACTION_COOLDOWN) {
      return false;
    }
    setLastActionTime(now);
    return true;
  };


  // ✅ Global API call throttle to prevent 429 errors
  const apiCallCountRef = useRef(0);
  const apiCallResetTimerRef = useRef(null);
  const MAX_API_CALLS_PER_WINDOW = 15;
  const API_WINDOW_MS = 10000; // 10 second window
  const extensionsLoadedRef = useRef(null);
  const lateFeeCalculatedRef = useRef(null);
  const pdfCheckDoneRef = useRef(null);

  const loadRentalData = async (force = false) => {
    if (!id) return;
    
    const cacheKey = `rental_${id}`;
    
    // Invalidate cache if force refresh
    if (force) {
      apiManager.invalidate(cacheKey);
    }
    
    // Prevent too-frequent fetches unless forced
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < FETCH_COOLDOWN) {
      if (RENTAL_DEBUG) console.log('⏳ Skipping fetch - cooldown active');
      return;
    }
    lastFetchTimeRef.current = now;
    
    try {
      if (RENTAL_DEBUG) console.log(`🔄 loadRentalData - Fetching data for rental ${id}`);
      
      const rentalData = await apiManager.request(cacheKey, async () => {
        let baseRental = null;
        let lastError = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const { data, error } = await fetchWithRetry(() =>
            supabase
              .from('app_4c3a7a6153_rentals')
              .select('*')
              .eq('id', id)
              .maybeSingle()
          );

          if (error) {
            console.error('❌ loadRentalData - Base rental query failed:', {
              error_message: error.message,
              error_code: error.code,
              error_details: error.details,
              error_hint: error.hint,
              rental_id: id,
              attempt: attempt + 1,
            });
            lastError = error;
          } else if (data) {
            baseRental = data;
            break;
          } else {
            lastError = {
              code: 'PGRST116',
              message: 'Rental row not returned yet',
              details: 'The result contains 0 rows',
              hint: null,
            };
          }

          if (attempt < 2) {
            await sleep(250 * (attempt + 1));
          }
        }

        if (!baseRental) {
          throw lastError || new Error('Failed to load rental details');
        }

        const [
          vehicleResult,
          extensionsResult,
          secondDriversResult,
          packageResult,
        ] = await Promise.all([
          baseRental.vehicle_id
            ? supabase
                .from('saharax_0u4w4d_vehicles')
                .select(`
                  *,
                  vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
                `)
                .eq('id', baseRental.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('rental_extensions')
            .select('*')
            .eq('rental_id', id),
          supabase
            .from('app_4c3a7a6153_rental_second_drivers')
            .select('*')
            .eq('rental_id', id),
          baseRental.package_id
            ? supabase
                .from('app_4c3a7a6153_rental_km_packages')
                .select('*')
                .eq('id', baseRental.package_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (vehicleResult?.error) {
          console.warn('⚠️ loadRentalData - Vehicle relation fetch failed:', vehicleResult.error);
        }
        if (extensionsResult?.error) {
          console.warn('⚠️ loadRentalData - Extensions fetch failed:', extensionsResult.error);
        }
        if (secondDriversResult?.error) {
          console.warn('⚠️ loadRentalData - Second drivers fetch failed:', secondDriversResult.error);
        }
        if (packageResult?.error) {
          console.warn('⚠️ loadRentalData - Package fetch failed:', packageResult.error);
        }

        return {
          ...baseRental,
          quantity_hours: baseRental.quantity_hours,
          quantity_days: baseRental.quantity_days,
          vehicle: vehicleResult?.data || null,
          extensions: extensionsResult?.data || [],
          second_drivers: secondDriversResult?.data || [],
          package: packageResult?.data || null,
        };
      });
      
      if (RENTAL_DEBUG) console.log('✅ loadRentalData - Fresh data received:', {
        rental_id: rentalData.rental_id,
        payment_status: rentalData.payment_status,
        package_id: rentalData.package_id,
        unit_price: rentalData.unit_price,
        quantity_hours: rentalData.quantity_hours,
        quantity_days: rentalData.quantity_days,
        rental_type: rentalData.rental_type
      });

      let liveCustomerProfile = null;
      if (rentalData.customer_id) {
        const { data: customerProfile, error: customerProfileError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('id, full_name, email, phone, address, nationality, licence_number')
          .eq('id', rentalData.customer_id)
          .maybeSingle();

        if (customerProfileError) {
          console.warn('Failed to fetch live customer profile for rental details:', customerProfileError);
        } else {
          liveCustomerProfile = customerProfile || null;
        }
      }
      setLinkedCustomerProfile(liveCustomerProfile);


      // Only customer website bookings auto-expire automatically.
      let finalRentalData = normalizeRentalLifecycleStatus({ ...rentalData });
      if (rentalData.rental_status === 'scheduled' && rentalData.rental_start_date) {
        const timingState = getScheduledRentalTimingState(rentalData.rental_start_date, rentalTimingSettings, new Date());
        if (timingState?.isExpired && shouldAutoExpireScheduledRental(rentalData)) {
          const autoExpireKey = `${rentalData.id}:scheduled-expired`;
          finalRentalData.rental_status = 'expired';
          supabase.from('app_4c3a7a6153_rentals').update({ rental_status: 'expired' }).eq('id', rentalData.id).then(() => {});
          if (rentalData.vehicle_id) supabase.from('saharax_0u4w4d_vehicles').update({ status: 'available' }).eq('id', rentalData.vehicle_id).then(() => {});
          if (!notifiedAutoExpiredRentalsRef.current.has(autoExpireKey)) {
            notifiedAutoExpiredRentalsRef.current.add(autoExpireKey);
            toast(`⚠️ Rental ${rentalData.rental_id} auto-expired. Vehicle freed.`, { duration: 5000, icon: '❌' });
          }
        }
      }
      // Set rental state early so secondary fetch failures do not blank the page.
      setRental(finalRentalData);

      // ✅ DYNAMIC: Always load package details if package_id exists
      try {
        if (rentalData.package_id) {
          if (RENTAL_DEBUG) console.log('📦 Package ID found:', rentalData.package_id);
          await loadPackageDetails(rentalData.package_id);
        } else {
          if (RENTAL_DEBUG) console.log('⚠️ No package_id found in rental');
          setPackageDetails(null);
          setIncludedKilometers(null);
          setExtraKmRate(null);
        }
      } catch (packageLoadError) {
        console.error('❌ Non-critical package load failure:', packageLoadError);
        setPackageDetails(null);
        setIncludedKilometers(null);
        setExtraKmRate(null);
      }

      // DEBUG: Check dates after loading
if (RENTAL_DEBUG) console.log('📅 DATE DEBUG AFTER LOAD:', {
  rental_id: rentalData.rental_id,
  rental_end_date: rentalData.rental_end_date,
  actual_end_date: rentalData.actual_end_date,
  started_at: rentalData.started_at,
  time_until_end: rentalData.rental_end_date
    ? Math.round((new Date(rentalData.rental_end_date) - new Date()) / (1000 * 60 * 60)) + ' hours'
    : 'N/A',
  time_since_start: rentalData.started_at
    ? Math.round((new Date() - new Date(rentalData.started_at)) / (1000 * 60 * 60)) + ' hours'
    : 'N/A'
});
      
      // ✅ FIXED: Fetch second drivers separately to ensure they're loaded
      if (rentalData.id) {
        try {
          const secondDrivers = await fetchSecondDriversSeparately(rentalData.id);
          if (RENTAL_DEBUG) console.log('🔄 Rental loaded with second drivers:', {
            rentalId: rentalData.id,
            secondDrivers: secondDrivers,
            secondDriversCount: secondDrivers?.length || 0,
            rentalStatus: rentalData.rental_status
          });
          // DEBUG: Check what dates are actually in the database
if (RENTAL_DEBUG) console.log('📅 DATABASE DATE CHECK:', {
  rental_id: rentalData.rental_id,
  rental_end_date_in_db: rentalData.rental_end_date,
  actual_end_date_in_db: rentalData.actual_end_date,
  started_at: rentalData.started_at,
  extensions_count: extensions.length,
  expected_end_with_extensions: rentalData.started_at 
    ? new Date(new Date(rentalData.started_at).getTime() + 
        (1 + (extensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0))) * 60 * 60 * 1000)
        .toISOString()
    : 'N/A'
});
          if (secondDrivers.length > 0) {
            finalRentalData.second_drivers = secondDrivers;
            setRental((prev) => prev ? ({ ...prev, second_drivers: secondDrivers }) : prev);
          }
        } catch (secondDriverLoadError) {
          console.error('❌ Non-critical second driver load failure:', secondDriverLoadError);
        }
      }

      // Load fuel pricing for the vehicle model
      if (rentalData?.vehicle?.vehicle_model?.id) {
        try {
          const pricePerLine = await FuelPricingService.getFuelPricingForModel(
            rentalData.vehicle.vehicle_model.id,
            rentalData.rental_type || 'daily'
          );
          setFuelPricePerLine(pricePerLine);
          
          // Calculate fuel charge if both levels exist and normalize any legacy saved value
          if (rentalData.start_fuel_level !== null && rentalData.end_fuel_level !== null) {
            const recalculatedCharge = FuelPricingService.calculateFuelCharge(
              rentalData.start_fuel_level,
              rentalData.end_fuel_level,
              pricePerLine,
              rentalData.rental_type || 'daily'
            );
            const storedCharge = parseFloat(rentalData.fuel_charge || 0) || 0;
            setFuelCharge(recalculatedCharge);
            setRental(prev => prev ? ({ ...prev, fuel_charge: recalculatedCharge }) : prev);

            if (Math.abs(storedCharge - recalculatedCharge) > 0.009) {
              try {
                await supabase
                  .from('app_4c3a7a6153_rentals')
                  .update({
                    fuel_charge: recalculatedCharge,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', rentalData.id);
                if (RENTAL_DEBUG) {
                  console.log(`⛽ Normalized legacy fuel charge from ${storedCharge.toFixed(2)} to ${recalculatedCharge.toFixed(2)} MAD`);
                }
              } catch (syncErr) {
                console.error('❌ Failed to normalize legacy fuel charge:', syncErr);
              }
            } else if (RENTAL_DEBUG) {
              console.log(`⛽ Fuel charge calculated on load: ${recalculatedCharge.toFixed(2)} MAD`);
            }
          }
        } catch (err) {
          console.error('❌ Error loading fuel pricing:', err);
        }
      }

      
      // Set existing fuel levels if available
      if (rentalData.start_fuel_level !== null) {
        setStartFuelLevel(rentalData.start_fuel_level);
      }
      if (rentalData?.vehicle_id) {
        try {
          const currentState = await FuelTransactionService.getVehicleFuelState(rentalData.vehicle_id);
          setCurrentVehicleFuelLevel(
            currentState?.current_fuel_lines !== null && currentState?.current_fuel_lines !== undefined
              ? currentState.current_fuel_lines
              : null
          );
        } catch (fuelStateError) {
          console.error('❌ Error loading current vehicle fuel level:', fuelStateError);
          setCurrentVehicleFuelLevel(null);
        }
      } else {
        setCurrentVehicleFuelLevel(null);
      }
      if (rentalData.end_fuel_level !== null) {
        // setEndFuelLevel(rentalData.end_fuel_level); // Commented out - this was setting FINISH fuel from START fuel!
      }
      if (
        rentalData.fuel_charge &&
        (rentalData.start_fuel_level === null || rentalData.end_fuel_level === null)
      ) {
        setFuelCharge(rentalData.fuel_charge);
      }


      
      
      // Debug extension data
      if (RENTAL_DEBUG) console.log('🔍 DEBUG Extension Data:', {
        rentalExtensions: rentalData.extensions,
        rentalExtensionCount: rentalData.extension_count,
        loadedExtensions: extensions,
        loadedExtensionCount: extensions.length,
        approvedExtensions: extensions.filter(ext => ext.status === "approved"),
        approvedCount: extensions.filter(ext => ext.status === "approved").length,
        totalExtensionFees: extensions.filter(ext => ext.status === "approved")
          .reduce((sum, ext) => sum + (parseFloat(ext.extension_price) || 0), 0)
      });
      const nextDisplayedStartingOdometer = resolveDisplayedStartingOdometer(rentalData);
      setStartOdometer(nextDisplayedStartingOdometer > 0 ? nextDisplayedStartingOdometer.toString() : '');
      
      try {
        await loadRentalMedia(rentalData.id);
      } catch (mediaLoadError) {
        console.error('❌ Non-critical rental media load failure:', mediaLoadError);
      }

      try {
        const latestVehicleReport = await VehicleReportService.getLatestReportForRental(rentalData.id);
        if (latestVehicleReport) {
          const hydratedReport = await VehicleReportService.hydrateReportWithMaintenance(latestVehicleReport);
          setVehicleReport(hydratedReport);
          setRental(prev => prev ? ({ ...prev, vehicleReport: hydratedReport }) : prev);
          setVehicleReportDraft({
            enabled: true,
            report_type: hydratedReport.report_type || 'damage',
            severity: hydratedReport.severity || 'minor',
            description: hydratedReport.description || '',
            affected_areas: Array.isArray(hydratedReport.affected_areas) ? hydratedReport.affected_areas : [],
            customer_chargeable: Boolean(hydratedReport.customer_chargeable),
            customer_charge_amount: hydratedReport.customer_charge_amount ? String(hydratedReport.customer_charge_amount) : '',
            send_to_maintenance: hydratedReport.send_to_maintenance !== false,
          });
        } else {
          setVehicleReport(null);
          setRental(prev => prev ? ({ ...prev, vehicleReport: null }) : prev);
        }
      } catch (reportError) {
        console.error('Failed to load vehicle report for rental:', reportError);
        setVehicleReport(null);
      }
      
    } catch (err) {
      console.error('❌ Error loading rental:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        raw: err,
      });
      const errorMsg = err?.message?.includes('429')
        ? 'Too many requests. Please wait a moment and try again.'
        : 'Failed to load rental details';
      setError(errorMsg);
    }
  };

  // Load extensions when rental is loaded (guarded to prevent double-loading)
  useEffect(() => {
    if (rental?.id && extensionsLoadedRef.current !== rental.id) {
      extensionsLoadedRef.current = rental.id;
      loadExtensions();
    }
  }, [rental?.id]);


  // ============================================
  // 🔥 REAL-TIME SUBSCRIPTION - Keep rental state in sync across devices
  // ============================================
  const realtimeReloadTimerRef = useRef(null);
  const depositReturnSectionRef = useRef(null);

  const broadcastRentalWorkflowUpdate = async (workflow, stepKey, extraPayload = {}) => {
    if (!rental?.id || !workflow || !stepKey) return;

    try {
      await supabase
        .channel('rental-updates')
        .send({
          type: 'broadcast',
          event: 'workflow_step_updated',
          payload: {
            rental_id: rental.id,
            workflow,
            step_key: stepKey,
            updated_at: new Date().toISOString(),
            ...extraPayload,
          },
        });
    } catch (broadcastErr) {
      console.warn('Workflow broadcast failed (non-critical):', broadcastErr);
    }
  };

  useEffect(() => {
    if (!rental?.id) return;

    if (RENTAL_DEBUG) console.log('📡 Setting up real-time subscription for rental:', rental.id);

    // Use a single channel with config to prevent duplicate connections
    const channel = supabase.channel(`rental-${rental.id}`, {
      config: {
        broadcast: { self: false },
      },
    });

    const subscription = channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_4c3a7a6153_rentals',
          filter: `id=eq.${rental.id}`
        },
        (payload) => {
          if (RENTAL_DEBUG) {
            console.log('🔥 REAL-TIME UPDATE RECEIVED:', {
              old_status: payload.old?.rental_status,
              new_status: payload.new?.rental_status,
              old_payment: payload.old?.payment_status,
              new_payment: payload.new?.payment_status,
              old_started_at: payload.old?.started_at,
              new_started_at: payload.new?.started_at
            });
          }

          const hasMeaningfulChange = [
            'rental_status',
            'payment_status',
            'deposit_amount',
            'remaining_amount',
            'started_at',
            'started_by',
            'started_by_name',
            'actual_end_date',
            'rental_end_date',
            'contract_signed',
            'contract_signed_by',
            'contract_signed_by_name',
            'completed_at',
            'completed_by',
            'completed_by_name',
            'signature_url',
            'start_odometer',
            'start_fuel_level',
            'end_fuel_level',
            'fuel_charge',
            'opening_video_url',
            'opening_video_thumbnail',
            'damage_deposit_received_amount',
            'damage_deposit_received_at',
            'customer_licence_number',
            'customer_id_number',
            'customer_id_image',
            'id_scan_url',
            'customer_uploaded_images',
          ].some((field) => payload.new?.[field] !== payload.old?.[field]);

          if (!hasMeaningfulChange) {
            return;
          }

          const normalizedRealtimeRental = normalizeRentalLifecycleStatus({
            ...payload.new,
          });

          setRental((prev) => ({
            ...prev,
            ...normalizedRealtimeRental,
            vehicle: prev?.vehicle,
            package: prev?.package,
          }));

          if (realtimeReloadTimerRef.current) {
            clearTimeout(realtimeReloadTimerRef.current);
          }

          const lifecycleChanged =
            payload.new?.rental_status !== payload.old?.rental_status ||
            payload.new?.started_at !== payload.old?.started_at ||
            payload.new?.completed_at !== payload.old?.completed_at;

          realtimeReloadTimerRef.current = setTimeout(() => {
            if (RENTAL_DEBUG) console.log('📡 Real-time: Debounced reload triggered');
            loadRentalData(true);
          }, lifecycleChanged ? 150 : 500);
        }
      )
      .subscribe((status) => {
        if (RENTAL_DEBUG) console.log('📡 Subscription status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      if (RENTAL_DEBUG) console.log('📡 Cleaning up real-time subscription');
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      subscription.unsubscribe();
    };
  }, [rental?.id]); // Re-run when rental ID changes

  useEffect(() => {
    setStartWorkflowTakeover(false);
  }, [rental?.id]);

  useEffect(() => {
    setFinishWorkflowTakeover(false);
  }, [rental?.id]);

  useEffect(() => {
    if (!rental?.id) return;

    const workflowChannel = supabase.channel('rental-updates', {
      config: {
        broadcast: { self: false },
      },
    });

    const subscription = workflowChannel
      .on('broadcast', { event: 'workflow_step_updated' }, ({ payload }) => {
        if (payload?.rental_id !== rental.id) {
          return;
        }

        if (payload?.workflow === 'finish') {
          if (typeof payload?.showWorkflow === 'boolean') {
            setFinishRentalSteps((prev) => ({
              ...prev,
              showWorkflow: payload.showWorkflow,
              closingVideoComplete: payload?.steps?.closingVideoComplete ?? prev.closingVideoComplete,
              endOdometerComplete: payload?.steps?.endOdometerComplete ?? prev.endOdometerComplete,
              endFuelComplete: payload?.steps?.endFuelComplete ?? prev.endFuelComplete,
            }));
          }

          if (realtimeReloadTimerRef.current) {
            clearTimeout(realtimeReloadTimerRef.current);
          }

          realtimeReloadTimerRef.current = setTimeout(() => {
            loadRentalData(true);
          }, payload?.step_key === 'workflow_opened' ? 60 : 120);
          return;
        }

        if (payload?.workflow !== 'start') {
          return;
        }

        if (realtimeReloadTimerRef.current) {
          clearTimeout(realtimeReloadTimerRef.current);
        }

        realtimeReloadTimerRef.current = setTimeout(() => {
          loadRentalData(true);
        }, payload?.step_key === 'opening_media' ? 75 : 120);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [rental?.id]);

  useEffect(() => {
    const workflowUser =
      currentUser ||
      (userProfile
        ? {
            ...userProfile,
            full_name: userProfile.full_name || userProfile.fullName || userProfile.email,
          }
        : null);
    const workflowPresenceKey = `${workflowUser?.id || workflowUser?.email || `anon-${id || 'rental'}`}::${workflowClientSessionKey}`;

    if (!rental?.id || !workflowUser) return;

    const isStartWorkflowRental =
      String(rental?.rental_status || '').toLowerCase() === 'scheduled';

    if (!isStartWorkflowRental) {
      setStartWorkflowPresence([]);
      return;
    }

    const workflowChannel = supabase.channel(`rental-workflow-${rental.id}`, {
      config: {
        presence: {
          key: workflowPresenceKey,
        },
      },
    });

    workflowChannel
      .on('presence', { event: 'sync' }, () => {
        const state = workflowChannel.presenceState();
        const nextPresence = Object.entries(state).flatMap(([presenceKey, entries]) =>
          (entries || []).map((entry) => ({
            presenceKey,
            ...entry,
          }))
        );
        setStartWorkflowPresence(nextPresence);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await workflowChannel.track({
          presenceKey: workflowPresenceKey,
          userId: workflowUser?.id || null,
          name: workflowUser?.full_name || workflowUser?.fullName || workflowUser?.email || 'Staff',
          role: workflowUser?.role || null,
          workflow: 'start',
          active: true,
          joinedAt: new Date().toISOString(),
        });
      });

    return () => {
      workflowChannel.untrack();
      workflowChannel.unsubscribe();
    };
  }, [rental?.id, rental?.rental_status, currentUser, userProfile, id, workflowClientSessionKey]);

  useEffect(() => {
    const workflowUser =
      currentUser ||
      (userProfile
        ? {
            ...userProfile,
            full_name: userProfile.full_name || userProfile.fullName || userProfile.email,
          }
        : null);
    const workflowPresenceKey = `${workflowUser?.id || workflowUser?.email || `anon-${id || 'rental'}`}::${workflowClientSessionKey}`;

    if (!rental?.id || !workflowUser) return;

    const isFinishWorkflowRental =
      String(rental?.rental_status || '').toLowerCase() === 'active' &&
      finishRentalSteps.showWorkflow;

    if (!isFinishWorkflowRental) {
      setFinishWorkflowPresence([]);
      return;
    }

    const workflowChannel = supabase.channel(`rental-finish-workflow-${rental.id}`, {
      config: {
        presence: {
          key: workflowPresenceKey,
        },
      },
    });

    workflowChannel
      .on('presence', { event: 'sync' }, () => {
        const state = workflowChannel.presenceState();
        const nextPresence = Object.entries(state).flatMap(([presenceKey, entries]) =>
          (entries || []).map((entry) => ({
            presenceKey,
            ...entry,
          }))
        );
        setFinishWorkflowPresence(nextPresence);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await workflowChannel.track({
          presenceKey: workflowPresenceKey,
          userId: workflowUser?.id || null,
          name: workflowUser?.full_name || workflowUser?.fullName || workflowUser?.email || 'Staff',
          role: workflowUser?.role || null,
          workflow: 'finish',
          active: true,
          joinedAt: new Date().toISOString(),
        });
      });

    return () => {
      workflowChannel.untrack();
      workflowChannel.unsubscribe();
    };
  }, [rental?.id, rental?.rental_status, finishRentalSteps.showWorkflow, currentUser, userProfile, id, workflowClientSessionKey]);



  // ✅ MEMOIZED: Calculate extension totals to prevent unnecessary recalculations
  const approvedExtensions = useMemo(
    () => (Array.isArray(extensions) ? extensions : []).filter((ext) => ext.status === 'approved'),
    [extensions]
  );

  const totalExtensionFees = useMemo(() => {
    if (approvedExtensions.length === 0) return 0;
    
    const total = approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_price) || 0), 0);
    
    if (RENTAL_DEBUG) console.log("📊 Extension Fees Calculation:", {
      totalExtensions: (Array.isArray(extensions) ? extensions.length : 0),
      approvedCount: approvedExtensions.length,
      breakdown: approvedExtensions.map(ext => ({
        hours: ext.extension_hours,
        price: ext.extension_price
      })),
      totalFees: total
    });
    
    return total;
  }, [approvedExtensions, extensions]);

  const totalExtendedHours = useMemo(() => {
    if (approvedExtensions.length === 0) return 0;
    return approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);
  }, [approvedExtensions]);

  const getStoredRentalChargeAmount = useCallback(() => {
    if (!rental) return 0;
    return parseFloat(rental.total_amount || 0) || 0;
  }, [rental]);

  const getBaseRentalAmountExcludingExtensions = useCallback(() => {
    if (!rental) return 0;

    const storedRentalCharge = getStoredRentalChargeAmount();
    const extensionFees = parseFloat(totalExtensionFees || 0);

    // The rental row's total_amount should already include approved extensions.
    // Use extension rows only for the breakdown, not as extra charges on top of total_amount.
    if (storedRentalCharge > 0) {
      return Math.max(0, storedRentalCharge - extensionFees);
    }

    if (rental.rental_type === 'hourly') {
      const duration = rental.quantity_hours ?? rental.quantity_days ?? 1;
      return (rental.unit_price || 0) * duration;
    }

    const duration = rental.quantity_days ?? 1;
    return (rental.unit_price || 0) * duration;
  }, [getStoredRentalChargeAmount, rental, totalExtensionFees]);
  // Calculate late fee for completed rentals (guarded to prevent duplicate calls)
  useEffect(() => {
    const calculateLateFee = async () => {
      if (rental?.rental_status === 'completed') {
        // Guard: only calculate once per rental ID
        if (lateFeeCalculatedRef.current === rental?.id) return;
        lateFeeCalculatedRef.current = rental?.id;
        try {
          const isLocalDev =
            typeof window !== 'undefined' &&
            ['localhost', '127.0.0.1'].includes(window.location.hostname);
          if (isLocalDev) {
            console.info('Skipping late fee edge function in local dev to avoid CORS failures.');
            return;
          }

          const result = await adminApiRequest('/api/apply-late-fee', {
            method: 'POST',
            body: JSON.stringify({
              rental_id: rental.id,
              actual_end_time: rental.actual_return_time || new Date().toISOString(),
            }),
          });
          
          if (result.error) {
            console.error('Error calculating late fee:', result.error);
          } else if (result.success && result.late_fee > 0) {
            // Store the full result including tier info
            setLateFee({
              late_fee: result.late_fee,
              hours_late: result.hours_late,
              effective_hourly_rate: result.effective_hourly_rate,
              calculation_method: result.calculation_method,
              tier_info: result.tier_info,
              is_late: true,
            });
          }
        } catch (error) {
          console.error('Error calculating late fee:', error);
        }
      }
    };
    
    calculateLateFee();
  }, [rental?.id, rental?.rental_status]);

  // Generate and send invoice (For customer documents)
  const handleGenerateInvoice = async () => {
    if (!syncedCustomerPhone) {
      toast.error("Customer phone number is not available.");
      return;
    }

    setIsSharing(true);
    try {
      const invoiceElement = invoiceRef.current;
      if (!invoiceElement) {
        throw new Error("Invoice template could not be found.");
      }

      const canvas = await html2canvas(invoiceElement, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output('blob');

      const filePath = `invoices/${rental.rental_id}_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`PDF Upload Error: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(uploadData.path);
        
      const invoiceUrl = publicUrlData.publicUrl;

      let videoUrl = 'Not available';
      const allMedia = [...openingMedia, ...closingMedia].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      if (allMedia.length > 0 && allMedia[0].public_url) {
        videoUrl = allMedia[0].public_url;
      }

      const message = `Hi ${rental.customer_name}!\n\nYour rental documents:\nInvoice: ${invoiceUrl}\nVideo: ${videoUrl}\n\nThank you!`;
      
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${syncedCustomerPhone.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;

      window.location.href = whatsappUrl;

    } catch (err) {
      console.error('❌ Error:', err);
      toast.error(`Failed to share via WhatsApp. Error: ${err.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  // ✅ NEW: Function to send extension approval notification to admins
  const handleExtensionApprovalRequest = async () => {
    if (!rental?.id) {
      toast.error("Rental information not available.");
      return;
    }

    setIsSharing(true);
    
    try {
      // 1. Fetch all admins with WhatsApp notifications enabled
      const allUsers = await getUsers();
      const admins = (allUsers || []).filter(
        (user) =>
          ['admin', 'owner'].includes(String(user.role || '')) &&
          user.whatsapp_notifications
      );
      
      if (!admins || admins.length === 0) {
        toast.error("No admins have WhatsApp notifications enabled.");
        setIsSharing(false);
        return;
      }
      
      // 2. Get extension details
      const pendingExtensions = extensions.filter(ext => ext.status === "pending" || ext.status === "approved");
      if (pendingExtensions.length === 0) {
        toast.error("No extensions require approval.");
        setIsSharing(false);
        return;
      }
      
      const latestExtension = pendingExtensions[pendingExtensions.length - 1];
      
      // 3. Create approval message
      const rentalDetailsUrl = `${window.location.origin}/admin/rentals/${rental.id}`;
      
      const message = `🔔 Extension Approval Request

Rental ID: ${rental.rental_id}
Customer: ${rental.customer_name}
Vehicle: ${rental.vehicle?.name} - ${rental.vehicle?.model}

📋 Extension Details:
• Hours: ${latestExtension.extension_hours}h
• Price: ${latestExtension.extension_price} MAD
• Status: ${latestExtension.status}

🔗 Review & Approve:
${rentalDetailsUrl}

Click the link above to review and approve the extension.`;
      
      const encodedMessage = encodeURIComponent(message);
      
      // 4. Send to each admin
      let sentCount = 0;
      for (const admin of admins) {
        if (admin.phone_number) {
          const whatsappUrl = `https://wa.me/${admin.phone_number.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
          
          // Open in new tab for each admin
          window.open(whatsappUrl, '_blank');
          sentCount++;
          
          // Small delay between opening tabs to avoid blocking
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (sentCount > 0) {
        toast.success(`Extension approval request sent to ${sentCount} admin(s).`);
      } else {
        toast.error("No admins have valid phone numbers configured.");
      }
      
    } catch (error) {
      console.error('❌ Error sending extension approval:', error);
      toast.error(`Failed to send approval request: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  // Handle price approval WhatsApp notification (manual trigger)
  const handlePriceApprovalRequest = async () => {
    if (!rental?.id) {
      toast.error("Rental information not available.");
      return;
    }

    setIsSharing(true);
    
    try {
      const allUsers = await getUsers();
      const admins = (allUsers || []).filter(
        (user) =>
          ['admin', 'owner'].includes(String(user.role || '')) &&
          user.whatsapp_notifications
      );
      
      if (!admins || admins.length === 0) {
        toast.error("No admins have WhatsApp notifications enabled.");
        setIsSharing(false);
        return;
      }
      
      const rentalDetailsUrl = `${window.location.origin}/admin/rentals/${rental.id}`;
      
      const message = `🔔 Price Override Request\n\nRental ID: ${rental.rental_id}\nCustomer: ${rental.customer_name}\nVehicle: ${rental.vehicle?.name} - ${rental.vehicle?.model}\n\n💰 Price Details:\n• Current Price: ${rental.total_amount} MAD\n• Requested Price: ${rental.pending_total_request} MAD\n• Reason: ${rental.price_override_reason || 'No reason provided'}\n\n🔗 Review & Approve:\n${rentalDetailsUrl}\n\nClick the link above to review and approve the price change.`;
      
      const encodedMessage = encodeURIComponent(message);
      
      let sentCount = 0;
      for (const admin of admins) {
        if (admin.phone_number) {
          const whatsappUrl = `https://wa.me/${admin.phone_number.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
          window.open(whatsappUrl, '_blank');
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (sentCount > 0) {
        toast.success(`Price change request sent to ${sentCount} admin(s).`);
      } else {
        toast.error("No admins have valid phone numbers configured.");
      }
      
    } catch (error) {
      console.error('❌ Error sending price approval:', error);
      toast.error(`Failed to send approval request: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  // ─── Shared PDF builder ─────────────────────────────────────────────────────
  // Renders any template element → compressed single-page A4 → uploads → returns public URL
  const buildAndUploadPDF = async (element, storageBucket, filePrefix) => {
    const A4_WIDTH  = 210;
    const A4_HEIGHT = 297;
    const MARGIN    = 10;

    // Use EXACT same settings as handlePrintContract/handlePrintReceipt
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: (A4_WIDTH - MARGIN * 2) * 3.78,
      windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    const imgWidth  = A4_WIDTH - MARGIN * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Always scale to fit 1 page
    if (imgHeight > A4_HEIGHT - MARGIN * 2) {
      const scale = (A4_HEIGHT - MARGIN * 2) / imgHeight;
      const sw = imgWidth * scale;
      const sh = imgHeight * scale;
      const xPos = (A4_WIDTH - sw) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', xPos, MARGIN, sw, sh);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', MARGIN, MARGIN, imgWidth, imgHeight);
    }

    const pdfBlob = pdf.output('blob');
    const fileName = `${filePrefix}_${rental.rental_id}_${Date.now()}.pdf`;
    const filePath = `${filePrefix}s/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(storageBucket)
      .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(storageBucket).getPublicUrl(filePath);
    return publicUrl;
  };

  const generateContractPDF = async () => {
    return `${getPublicAppOrigin()}/view/rental/${rental.id}?type=contract&lang=${documentLanguage}`;
  };

  const generateReceiptPDF = async () => {
    return `${getPublicAppOrigin()}/view/rental/${rental.id}?type=receipt&lang=${documentLanguage}`;
  };

  // PDF Caching Functions
  const generateAndCacheContractPDF = async (rentalData = rental) => {
    const url = `${getPublicAppOrigin()}/view/rental/${(rentalData || rental).id}?type=contract&lang=${documentLanguage}`;
    window.__pdfCache = window.__pdfCache || {};
    window.__pdfCache[`contract_${(rentalData || rental).id}`] = url;
    setPdfCache(prev => ({ ...prev, contractUrl: url }));
    return url;
  };

  const generateAndCacheReceiptPDF = async () => {
    const url = `${getPublicAppOrigin()}/view/rental/${rental.id}?type=receipt&lang=${documentLanguage}`;
    window.__pdfCache = window.__pdfCache || {};
    window.__pdfCache[`receipt_${rental.rental_id}`] = url;
    setPdfCache(prev => ({ ...prev, receiptUrl: url }));
    return url;
  };


  // Send Contract Only via WhatsApp - OPTIMIZED
  const sendContractOnly = async () => {
    if (!syncedCustomerPhone) {
      toast.error("Customer phone number is not available.");
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const contractUrl = await getContractWebUrl();
      const message = `Here is your contract:\n${contractUrl}`;
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${syncedCustomerPhone.replace(/[^0-9]/g, '')}&text=${encodedMessage}`;
      
      window.location.assign(whatsappUrl);
    } catch (error) {
      console.error('Error sending contract:', error);
      toast.error('Failed to send contract. Please try again.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Send Receipt Only via WhatsApp - OPTIMIZED
  const sendReceiptOnly = async () => {
    if (!syncedCustomerPhone) {
      toast.error("Customer phone number is not available.");
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const receiptUrl = await getReceiptWebUrl();
      const message = `Here is your receipt:\n${receiptUrl}`;
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${syncedCustomerPhone.replace(/[^0-9]/g, '')}&text=${encodedMessage}`;

      
      window.location.assign(whatsappUrl);
    } catch (error) {
      console.error('Error sending receipt:', error);
      toast.error('Failed to send receipt. Please try again.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };



  // Handle extension request creation
  // ✅ OPTIMIZED: Generate PDFs on demand when user interacts with WhatsApp button
  let pdfGenerationTimeout = null;
  
  const ensurePDFsReady = () => {
    // Debounce: Only run once every 2 seconds
    if (pdfGenerationTimeout) {
      clearTimeout(pdfGenerationTimeout);
    }
    
    pdfGenerationTimeout = setTimeout(() => {
      // Auto-generation disabled — PDFs are generated fresh when sharing/printing
    }, 500); // Wait 500ms before starting generation (debounce)
  };

  // ✅ MODIFIED: Remove auto-WhatsApp trigger from extension creation
  const handleExtensionCreated = async (extensionContext = null) => {
    if (RENTAL_DEBUG) console.log('🔄 Extension created, reloading data...');
    if (extensionContext?.extension) {
      setExtensions((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const next = safePrev.filter((item) => item.id !== extensionContext.extension.id);
        next.unshift(extensionContext.extension);
        return next;
      });
    }
    if (extensionContext?.autoApprove && extensionContext?.newEndDate) {
      setRental((prev) => {
        if (!prev) return prev;

        const extensionHours = parseFloat(extensionContext.extensionHours) || 0;
        const extensionPrice = parseFloat(extensionContext.extensionPrice) || 0;
        const isHourlyRental = prev.rental_type === 'hourly';
        const currentQuantityHours = parseFloat(prev.quantity_hours) || 0;
        const currentQuantityDays = parseFloat(prev.quantity_days) || 0;
        const currentExtensionCount = parseFloat(prev.extension_count) || 0;
        const currentExtendedHours = parseFloat(prev.total_extended_hours) || 0;
        const currentExtensionPrice = parseFloat(prev.total_extension_price) || 0;

        return {
          ...prev,
          rental_end_date: extensionContext.newEndDate,
          actual_end_date: extensionContext.newEndDate,
          total_amount: (parseFloat(prev.total_amount) || 0) + extensionPrice,
          remaining_amount: Math.max(
            0,
            ((parseFloat(prev.total_amount) || 0) + extensionPrice) - (parseFloat(prev.deposit_amount) || 0)
          ),
          quantity_hours: isHourlyRental
            ? currentQuantityHours + extensionHours
            : (currentQuantityDays + (extensionHours / 24)) * 24,
          quantity_days: isHourlyRental
            ? currentQuantityDays || (currentQuantityHours + extensionHours)
            : currentQuantityDays + (extensionHours / 24),
          extension_count: currentExtensionCount + 1,
          total_extended_hours: currentExtendedHours + extensionHours,
          total_extension_price: currentExtensionPrice + extensionPrice,
          current_extension_id: extensionContext.extension?.id || prev.current_extension_id,
        };
      });

    }
    await loadRentalData(true);
    await loadExtensions(true);
    // No automatic WhatsApp trigger here anymore
  };

  const handleEditExtension = (extension) => {
    setEditingExtension(extension);
    setExtensionModalOpen(true);
  };

  // Handle extension approval
  const handleApproveExtension = async (extensionId) => {
    try {
      setActionLoading(prev => ({ ...prev, [extensionId]: true }));
      
      // Get extension details
      const { data: extension, error: extError } = await supabase
        .from('rental_extensions')
        .select('*')
        .eq('id', extensionId)
        .single();
        
      if (extError) throw extError;
      
      // Get current rental
      const { data: currentRental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .eq('id', rental.id)
        .single();
        
      if (rentalError) throw rentalError;
      
      const extensionHours = parseFloat(extension.extension_hours) || 0;
      const extensionPrice = parseFloat(extension.extension_price) || 0;
      const approvedExtensionsBefore = (Array.isArray(extensions) ? extensions : [])
        .filter((item) => item.status === 'approved' && item.id !== extension.id);
      const nextExtensionCount = approvedExtensionsBefore.length + 1;
      const nextExtendedHours = approvedExtensionsBefore.reduce(
        (sum, item) => sum + (parseFloat(item.extension_hours) || 0),
        0
      ) + extensionHours;
      const nextExtensionPrice = approvedExtensionsBefore.reduce(
        (sum, item) => sum + (parseFloat(item.extension_price) || 0),
        0
      ) + extensionPrice;
      
      // IMPORTANT: Use the CURRENT rental_end_date, not the original
      const currentEndDate = new Date(currentRental.rental_end_date);
      const newEndDate = new Date(currentEndDate.getTime() + (extensionHours * 60 * 60 * 1000));
      
      console.log('Extension approval:', {
        extensionHours,
        currentEndDate: currentEndDate.toISOString(),
        newEndDate: newEndDate.toISOString()
      });
      
      // Calculate new totals
      const newTotalAmount = (parseFloat(currentRental.total_amount) || 0) + (parseFloat(extension.extension_price) || 0);
      
      // Calculate new quantity
      let newQuantityHours = currentRental.quantity_hours || 0;
      let newQuantityDays = currentRental.quantity_days || 0;
      
      if (currentRental.rental_type === 'hourly') {
        newQuantityHours = (parseFloat(currentRental.quantity_hours) || 0) + extensionHours;
        newQuantityDays = newQuantityHours; // Keep in sync
      } else {
        // For daily rentals, convert extension hours to days
        const extensionDays = extensionHours / 24;
        newQuantityDays = (parseFloat(currentRental.quantity_days) || 0) + extensionDays;
        newQuantityHours = newQuantityDays * 24; // Keep in sync
      }
      
      // Update rental with NEW end date
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_end_date: newEndDate.toISOString(),
          actual_end_date: newEndDate.toISOString(), // Also update actual_end_date
          total_amount: newTotalAmount,
          remaining_amount: Math.max(0, newTotalAmount - (parseFloat(currentRental.deposit_amount) || 0)),
          quantity_hours: newQuantityHours,
          quantity_days: newQuantityDays,
          extension_count: nextExtensionCount,
          total_extended_hours: nextExtendedHours,
          total_extension_price: nextExtensionPrice,
          current_extension_id: extension.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);
        
      if (updateError) throw updateError;
      
      // Update extension status
      await supabase
        .from('rental_extensions')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: currentUser?.id
        })
        .eq('id', extensionId);
      
      // Force reload all data
      await loadRentalData(true);
      await loadExtensions();
      
      toast.success(`✅ Extension approved! New end date: ${newEndDate.toLocaleString()}`);
      
    } catch (err) {
      console.error('Error approving extension:', err);
      toast.error('Failed to approve extension');
    } finally {
      setActionLoading(prev => ({ ...prev, [extensionId]: false }));
    }
  };

  // Handle extension rejection
  // Handle extension rejection
  const handleRejectExtension = async (extensionId) => {
    if (!confirm('Cancel this extension request?')) return;
    
    try {
      await ExtensionPricingService.rejectExtension(extensionId, currentUser?.id, null);
      toast.success('Extension request cancelled.');
      await loadExtensions();
    } catch (err) {
      console.error('❌ Error rejecting extension:', err);
      toast.error(`Failed to cancel extension: ${err.message}`);
    }
  };

  // ✅ RADICAL OPTIMIZATION: Use web view URLs instead of PDFs for instant WhatsApp
  const getContractWebUrl = async () => {
    const rawUrl = `${getPublicAppOrigin()}/view/rental/${rental.id}?type=contract&lang=${documentLanguage}`;
    return await shortenUrl(rawUrl, 'contract');
  };

  const getReceiptWebUrl = async () => {
    const rawUrl = `${getPublicAppOrigin()}/view/rental/${rental.id}?type=receipt&lang=${documentLanguage}`;
    return await shortenUrl(rawUrl, 'receipt');
  };

  const getOpeningMediaShareUrl = async () => {
    const rawUrl = `${getPublicAppOrigin()}/view/rental/${rental.id}?type=opening-media`;
    return await shortenUrl(rawUrl, 'opening_video');
  };

  const getClosingMediaShareUrl = async () => {
    const rawUrl = `${getPublicAppOrigin()}/view/rental/${rental.id}?type=closing-media`;
    return await shortenUrl(rawUrl, 'closing_video');
  };

  const getDocumentsHubShareUrl = async (options = {}) => {
    const rawUrl = `${getPublicAppOrigin()}/view/rental/${rental.id}?type=documents`;
    return await shortenUrl(rawUrl, 'documents');
  };

  const getBankingInfoShareUrl = async () => {
    const rawUrl = `${getPublicAppOrigin()}/images/bank-transfer-info.png`;
    return await shortenUrl(rawUrl, 'banking-info');
  };

  const getContractUrl = async (preferWeb = true) => {
    if (preferWeb) {
      return await getContractWebUrl();
    }
    // Fallback to PDF if web view not available
    return await generateContractPDF();
  };

  const getReceiptUrl = async (preferWeb = true) => {
    if (preferWeb) {
      return await getReceiptWebUrl();
    }
    // Fallback to PDF if web view not available
    return await generateReceiptPDF();
  };

  // Handle WhatsApp selection and sending - INSTANT WEB VIEW VERSION
  const handleSendWhatsAppSelection = async (options) => {
    setIsSharing(true);
    setWhatsappModalOpen(false);
    toast.loading('Preparing documents…', { id: 'wa-prepare' });
    
    try {
      if (RENTAL_DEBUG) console.log('📱 Starting WhatsApp send with options:', options);
      
      const hasDocuments =
        Boolean(options.contract && rental.signature_url) ||
        Boolean(options.receipt && dynamicPaymentState.isPaid) ||
        Boolean(options.openingVideo && openingMedia.length > 0) ||
        Boolean(options.closingVideo && closingMedia.length > 0) ||
        Boolean(options.bankingInfo);
      
      // If no lines were added (no documents), don't send WhatsApp
      if (!hasDocuments) {
        toast.error('No documents selected or documents are not ready yet. Please try again in a moment.');
        setIsSharing(false);
        return;
      }
      const selectedItems = [];

      if (options.contract && rental.signature_url) {
        selectedItems.push({
          label: tr('Rental Contract', 'Contrat de location'),
          url: await getContractWebUrl(),
        });
      }

      if (options.receipt && dynamicPaymentState.isPaid) {
        selectedItems.push({
          label: receiptPreviewMeta.listLabel,
          url: await getReceiptWebUrl(),
        });
      }

      if (options.openingVideo && openingMedia.length > 0) {
        selectedItems.push({
          label: tr('Opening Media', 'Médias de départ'),
          url: await getOpeningMediaShareUrl(),
        });
      }

      if (options.closingVideo && closingMedia.length > 0) {
        selectedItems.push({
          label: tr('Closing Media', 'Médias de retour'),
          url: await getClosingMediaShareUrl(),
        });
      }

      if (options.bankingInfo) {
        selectedItems.push({
          label: tr('Banking Info', 'Informations bancaires'),
          url: await getBankingInfoShareUrl(),
        });
      }

      const intro = tr(
        `Here are your rental items for ${rental.rental_id}:`,
        `Voici les éléments de votre location ${rental.rental_id} :`
      );

      const message = [
        intro,
        '',
        ...selectedItems.map((item) => `${item.label}:\n${item.url}`)
      ].join('\n');

      const phoneNumber = syncedCustomerPhone.replace(/[^0-9]/g, '');
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
      
      if (RENTAL_DEBUG) console.log('📱 Opening WhatsApp with URL:', whatsappUrl);
      
      // Use top-level navigation for WhatsApp so mobile browsers hand off reliably.
      toast.dismiss('wa-prepare');
      window.location.assign(whatsappUrl);
      
    } catch (error) {
      toast.dismiss('wa-prepare');
      console.error('❌ Error sending WhatsApp:', error);
      toast.error(`Failed to send WhatsApp message: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareViaWhatsApp = async () => {
    await handleGenerateInvoice();
  };

  const calculateMaintenanceStayDays = useCallback((report, maintenance) => {
    if (!report || !maintenance) return 0;

    const startDate = new Date(report.created_at || maintenance.created_at || Date.now());
    const endDate = new Date(
      maintenance.completed_date ||
      maintenance.service_date ||
      maintenance.updated_at ||
      Date.now()
    );

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return 1;
    }

    const millisecondsInDay = 1000 * 60 * 60 * 24;
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    return Math.max(1, Math.ceil(diffMs / millisecondsInDay));
  }, []);

  const calculateMaintenanceStayTotal = useCallback((days, dailyRate, discount) => {
    const normalizedDays = Math.max(0, parseInt(days || 0, 10) || 0);
    const normalizedRate = Math.max(0, Number(dailyRate || 0));
    const normalizedDiscount = Math.max(0, Number(discount || 0));
    return Math.max(0, (normalizedDays * normalizedRate) - normalizedDiscount);
  }, []);

  const getEffectiveRentalEndDate = useCallback((rentalData) => {
    if (!rentalData) return null;
    const endCandidates = [rentalData.rental_end_date, rentalData.actual_end_date]
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));

    if (endCandidates.length === 0) return null;
    return endCandidates.reduce((latest, current) => (current > latest ? current : latest));
  }, []);

  const calculateImpoundChargeTotal = useCallback((days, hours, rate, discount, rentalType, rateMode = 'package') => {
    const normalizedRate = Math.max(0, Number(rate || 0));
    const normalizedDiscount = Math.max(0, Number(discount || 0));
    const normalizedDays = Math.max(0, Number(days || 0));
    const subtotal = rentalType === 'daily' && rateMode === 'per_day'
      ? normalizedRate * normalizedDays
      : normalizedRate;
    return Math.max(0, subtotal - normalizedDiscount);
  }, []);

  const resolveImpoundChargeSnapshot = useCallback(async (rentalData, releaseAt, discountOverride = null) => {
    const plannedEnd = getEffectiveRentalEndDate(rentalData);
    const releaseDate = releaseAt ? new Date(releaseAt) : new Date();
    const safeReleaseDate = Number.isNaN(releaseDate.getTime()) ? new Date() : releaseDate;
    const discount = Math.max(0, Number(discountOverride ?? rentalData?.impound_discount ?? 0));
    const vehicleId = rentalData?.vehicle_id || rentalData?.vehicle?.id;
    const vehicleModelId = rentalData?.vehicle?.vehicle_model?.id || rentalData?.vehicle?.vehicle_model_id || rentalData?.vehicle_model_id;

    if (!plannedEnd || Number.isNaN(plannedEnd.getTime()) || safeReleaseDate <= plannedEnd) {
      return {
        days: 0,
        hours: 0,
        rate: 0,
        discount,
        total: 0,
        pricingMode: rentalData?.rental_type === 'daily' ? 'daily' : 'hourly',
        pricingLabel: '',
      };
    }

    const diffMs = safeReleaseDate.getTime() - plannedEnd.getTime();
    const dayMs = 1000 * 60 * 60 * 24;
    const hourMs = 1000 * 60 * 60;

    const exceededHours = Math.max(1, Math.ceil(diffMs / hourMs));
    const exceededDays = Math.max(1, Math.ceil(diffMs / dayMs));
    let days = 0;
    let hours = 0;
    let pricingMode = 'hourly';
    let rateMode = 'package';
    let pricingLabel = '';
    let rate = 0;

    if (rentalData?.rental_type === 'daily') {
      pricingMode = 'daily';
      days = exceededDays;
      hours = Math.max(0, Math.ceil((diffMs - ((exceededDays - 1) * dayMs)) / hourMs));
      const pricing = vehicleModelId
        ? await DynamicPricingService.getPricingForDuration(vehicleModelId, days)
        : { price: await DynamicPricingService.getDynamicPrice(vehicleId, 'daily', days), source: 'vehicle' };
      rate = Math.max(0, Number(pricing?.price || 0));
      rateMode = pricing?.source === 'base_price' ? 'per_day' : 'package';
      pricingLabel = rateMode === 'per_day'
        ? `${days} day estimate @ ${formatCurrency(rate)} MAD/day`
        : `${days} day pricing`;
    } else {
      let hourlyTierPrice = 0;

      if (vehicleModelId && exceededHours < 24) {
        const { data: hourlyTiers } = await supabase
          .from('pricing_tiers')
          .select('min_hours,max_hours,price_amount')
          .eq('vehicle_model_id', vehicleModelId)
          .eq('is_active', true);

        const hasHourlyTier = Array.isArray(hourlyTiers) && hourlyTiers.some((tier) => {
          const min = Number(tier.min_hours ?? 0);
          const max = Number(tier.max_hours ?? 0);
          return Number(tier.price_amount || 0) > 0 && exceededHours >= min && exceededHours <= max;
        });

        if (hasHourlyTier && vehicleId) {
          hourlyTierPrice = await DynamicPricingService.getDynamicPrice(vehicleId, 'hourly', exceededHours);
        }
      }

      if (hourlyTierPrice > 0 && exceededHours < 24) {
        hours = exceededHours;
        pricingMode = 'hourly';
        rateMode = 'package';
        rate = Math.max(0, Number(hourlyTierPrice || 0));
        pricingLabel = `${hours} hour tier pricing`;
      } else {
        pricingMode = 'daily';
        days = Math.max(1, Math.ceil(exceededHours / 24));
        hours = exceededHours < 24 ? exceededHours : Math.max(0, exceededHours - ((days - 1) * 24));
        const pricing = vehicleModelId
          ? await DynamicPricingService.getPricingForDuration(vehicleModelId, days)
          : { price: await DynamicPricingService.getDynamicPrice(vehicleId, 'daily', days), source: 'vehicle' };
        rate = Math.max(0, Number(pricing?.price || 0));
        rateMode = pricing?.source === 'base_price' ? 'per_day' : 'package';
        pricingLabel = rateMode === 'per_day'
          ? `${days} day estimate @ ${formatCurrency(rate)} MAD/day`
          : `${days} day pricing`;
      }
    }

    return {
      days,
      hours,
      rate,
      discount,
      total: calculateImpoundChargeTotal(days, hours, rate, discount, rentalData?.rental_type, rateMode),
      pricingMode,
      rateMode,
      pricingLabel,
    };
  }, [calculateImpoundChargeTotal, getEffectiveRentalEndDate]);

  const upsertVehicleReportLocally = useCallback((nextReport) => {
    setVehicleReport(nextReport);
    setRental(prev => prev ? ({ ...prev, vehicleReport: nextReport }) : prev);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncMaintenanceStayPricing = async () => {
      if (!vehicleReport?.id || !vehicleReport?.customer_chargeable || !vehicleReport?.maintenance) {
        const fallbackTotal = calculateMaintenanceStayTotal(
          vehicleReport?.maintenance_daily_days || 0,
          vehicleReport?.maintenance_daily_rate || 0,
          vehicleReport?.maintenance_daily_discount || 0
        );
        setMaintenanceChargeForm({
          days: vehicleReport?.maintenance_daily_days || 0,
          dailyRate: vehicleReport?.maintenance_daily_rate || 0,
          discount: vehicleReport?.maintenance_daily_discount || 0,
          total: fallbackTotal,
          source: 'none',
        });
        return;
      }

      const vehicleModelId = rental?.vehicle?.vehicle_model?.id || rental?.vehicle?.vehicle_model_id;
      const suggestedDays = vehicleReport.maintenance_daily_days || calculateMaintenanceStayDays(vehicleReport, vehicleReport.maintenance);
      let suggestedRate = Number(vehicleReport.maintenance_daily_rate || 0);
      let rateSource = vehicleReport.maintenance_daily_rate ? 'saved' : 'none';

      if (suggestedRate <= 0 && vehicleModelId) {
        const pricing = await DynamicPricingService.getPricingForDuration(vehicleModelId, Math.max(1, suggestedDays));
        suggestedRate = Number(pricing?.price || 0);
        rateSource = pricing?.source || 'base_price';
      }

      const discount = Number(vehicleReport.maintenance_daily_discount || 0);
      const total = calculateMaintenanceStayTotal(suggestedDays, suggestedRate, discount);

      if (cancelled) return;

      setMaintenanceChargeForm({
        days: suggestedDays,
        dailyRate: suggestedRate,
        discount,
        total,
        source: rateSource,
      });

      const needsSync =
        (Number(vehicleReport.maintenance_daily_days || 0) !== suggestedDays) ||
        (Number(vehicleReport.maintenance_daily_rate || 0) !== suggestedRate) ||
        (Number(vehicleReport.maintenance_daily_total || 0) !== total);

      if (needsSync) {
        try {
          const syncedReport = await VehicleReportService.saveChargeConfig(vehicleReport.id, {
            maintenance_daily_days: suggestedDays,
            maintenance_daily_rate: suggestedRate,
            maintenance_daily_discount: discount,
          });

          if (!cancelled) {
            upsertVehicleReportLocally({
              ...vehicleReport,
              ...syncedReport,
              maintenance: vehicleReport.maintenance,
            });
          }
        } catch (error) {
          console.error('Failed to sync maintenance stay pricing:', error);
        }
      }
    };

    syncMaintenanceStayPricing();

    return () => {
      cancelled = true;
    };
  }, [
    vehicleReport?.id,
    vehicleReport?.customer_chargeable,
    vehicleReport?.maintenance?.id,
    vehicleReport?.maintenance?.completed_date,
    vehicleReport?.maintenance?.updated_at,
    vehicleReport?.maintenance_daily_days,
    vehicleReport?.maintenance_daily_rate,
    vehicleReport?.maintenance_daily_discount,
    rental?.vehicle?.vehicle_model?.id,
    rental?.vehicle?.vehicle_model_id,
    calculateMaintenanceStayDays,
    calculateMaintenanceStayTotal,
    upsertVehicleReportLocally,
  ]);

  useEffect(() => {
    if (!rental) return;

    setWaiveImpoundExtraDailyCharge(false);

    const savedDays = Math.max(0, parseInt(rental.impound_charge_days || 0, 10) || 0);
    const savedHours = Math.max(0, parseInt(rental.impound_charge_hours || 0, 10) || 0);
    const savedRate = Math.max(0, Number(rental.impound_rate || rental.unit_price || 0));
    const savedDiscount = Math.max(0, Number(rental.impound_discount || 0));
    const savedTotal = Math.max(
      0,
      Number(
        rental.impound_total ||
        calculateImpoundChargeTotal(savedDays, savedHours, savedRate, savedDiscount, rental.rental_type)
      )
    );

    setImpoundChargeForm({
      days: savedDays,
      hours: savedHours,
      rate: savedRate,
      discount: savedDiscount,
      total: savedTotal,
      pricingMode: rental.rental_type === 'daily' || savedDays > 0 ? 'daily' : 'hourly',
      rateMode: 'package',
      pricingLabel: savedDays > 0
        ? `${savedDays} day pricing`
        : savedHours > 0
          ? `${savedHours} hour tier pricing`
          : '',
    });
  }, [calculateImpoundChargeTotal, rental]);

  const impoundPricingTickKey = useMemo(() => {
    if (!rental || !Boolean(rental?.is_impounded)) return null;
    const plannedEnd = getEffectiveRentalEndDate(rental);
    if (!plannedEnd) return null;
    const diffMs = Date.now() - plannedEnd.getTime();
    if (diffMs <= 0) return 'not-expired';
    const exceededHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
    const exceededDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return `${rental.id}:${rental.rental_type}:${exceededHours}:${exceededDays}`;
  }, [elapsedTime, getEffectiveRentalEndDate, rental, timeRemaining]);

  useEffect(() => {
    let cancelled = false;

    const syncImpoundLivePricing = async () => {
      if (!rental || !Boolean(rental?.is_impounded)) return;
      const snapshot = await resolveImpoundChargeSnapshot(rental, new Date().toISOString(), impoundChargeForm.discount);
      if (cancelled) return;
      setImpoundChargeForm(prev => ({
        ...prev,
        days: snapshot.days,
        hours: snapshot.hours,
        rate: snapshot.rate,
        total: snapshot.total,
        pricingMode: snapshot.pricingMode,
        rateMode: snapshot.rateMode,
        pricingLabel: snapshot.pricingLabel,
      }));
    };

    syncImpoundLivePricing();

    return () => {
      cancelled = true;
    };
  }, [impoundPricingTickKey, impoundChargeForm.discount, rental, resolveImpoundChargeSnapshot]);

  useEffect(() => {
    let cancelled = false;

    const loadImpoundEstimatePreview = async () => {
      if (!rental || !Boolean(rental?.is_impounded)) {
        setImpoundEstimatePreview(null);
        return;
      }

      const weekendEstimatedRelease = getWeekendImpoundEstimatedReleaseDate(rental?.impounded_at);
      const minimumWeekendDays = getWeekendMinimumEstimatedDays(rental?.impounded_at);
      const estimateDate = weekendEstimatedRelease || new Date();
      let snapshot = await resolveImpoundChargeSnapshot(
        rental,
        estimateDate.toISOString(),
        impoundChargeForm.discount
      );

      if (
        weekendEstimatedRelease &&
        rental?.rental_type === 'daily' &&
        minimumWeekendDays > 0
      ) {
        const liveDaysNow = Math.max(0, Number(impoundChargeForm.days || 0));
        const targetEstimatedDays = Math.max(liveDaysNow, minimumWeekendDays);
        const vehicleId = rental?.vehicle_id || rental?.vehicle?.id;
        const vehicleModelId = rental?.vehicle?.vehicle_model?.id || rental?.vehicle?.vehicle_model_id || rental?.vehicle_model_id;
        const pricing = vehicleModelId
          ? await DynamicPricingService.getPricingForDuration(vehicleModelId, targetEstimatedDays)
          : { price: await DynamicPricingService.getDynamicPrice(vehicleId, 'daily', targetEstimatedDays), source: 'vehicle' };
        const adjustedRate = Math.max(0, Number(pricing?.price || 0));
        const adjustedRateMode = pricing?.source === 'base_price' ? 'per_day' : 'package';

        snapshot = {
          ...snapshot,
          days: targetEstimatedDays,
          hours: 0,
          rate: adjustedRate,
          rateMode: adjustedRateMode,
          total: calculateImpoundChargeTotal(
            targetEstimatedDays,
            0,
            adjustedRate,
            impoundChargeForm.discount,
            rental?.rental_type,
            adjustedRateMode
          ),
          pricingLabel: adjustedRateMode === 'per_day'
            ? `${targetEstimatedDays} day estimate @ ${formatCurrency(adjustedRate)} MAD/day`
            : `${targetEstimatedDays} day pricing`,
        };
      }

      if (cancelled) return;

      setImpoundEstimatePreview({
        ...snapshot,
        estimatedReleaseAt: estimateDate.toISOString(),
        weekendCarry: Boolean(weekendEstimatedRelease),
        note: weekendEstimatedRelease
          ? `Weekend estimate assumes the vehicle remains held until Monday before release can happen. It prepares the customer for the added rental days beyond the live charge already running now.`
          : 'Estimate based on the current held time. Final charge may change until the impound is released.',
      });
    };

    loadImpoundEstimatePreview();

    return () => {
      cancelled = true;
    };
  }, [calculateImpoundChargeTotal, impoundPricingTickKey, impoundChargeForm.discount, rental, resolveImpoundChargeSnapshot]);

  const saveMaintenanceChargeConfig = useCallback(async () => {
    if (!vehicleReport?.id) return;

    setSavingMaintenanceCharge(true);
    try {
      const nextReport = await VehicleReportService.saveChargeConfig(vehicleReport.id, {
        maintenance_daily_days: maintenanceChargeForm.days,
        maintenance_daily_rate: maintenanceChargeForm.dailyRate,
        maintenance_daily_discount: maintenanceChargeForm.discount,
      });

      upsertVehicleReportLocally({
        ...vehicleReport,
        ...nextReport,
        maintenance: vehicleReport.maintenance,
      });
      toast.success('Maintenance stay charge updated');
    } catch (error) {
      console.error('Failed to save maintenance stay charge config:', error);
      toast.error(`Failed to save maintenance stay charge: ${error.message}`);
    } finally {
      setSavingMaintenanceCharge(false);
    }
  }, [maintenanceChargeForm.dailyRate, maintenanceChargeForm.days, maintenanceChargeForm.discount, upsertVehicleReportLocally, vehicleReport]);

  const getLinkedMaintenanceChargeAmount = () => {
    const linkedReport = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
    if (!linkedReport?.customer_chargeable) return 0;

    return parseFloat(linkedReport?.customer_charge_amount || 0) || 0;
  };

  const getLinkedMaintenanceRepairAmount = () => {
    const linkedReport = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
    if (!linkedReport?.customer_chargeable) return 0;
    return parseFloat(linkedReport?.maintenance_cost_total || linkedReport?.maintenance?.cost || 0) || 0;
  };

  const getLinkedMaintenanceStayAmount = () => {
    const linkedReport = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
    if (!linkedReport?.customer_chargeable) return 0;
    return parseFloat(linkedReport?.maintenance_daily_total || 0) || 0;
  };

  const getMaintenanceStayRateSourceLabel = (source) => {
    switch (source) {
      case 'tier':
        return 'Tier price';
      case 'base_price':
        return 'Base daily price';
      case 'saved':
        return 'Saved rate';
      case 'manual':
        return 'Manual override';
      default:
        return 'No rate';
    }
  };

  const rentalBillingSummary = useMemo(() => {
      if (!rental) {
      return {
        baseAmount: 0,
        overageCharge: 0,
        extensionFees: 0,
        fuelChargeAmount: 0,
        impoundChargeAmount: 0,
        impoundDiscountAmount: 0,
        maintenanceRepairAmount: 0,
        maintenanceStayAmount: 0,
        maintenanceDiscountAmount: 0,
        maintenanceChargeAmount: 0,
        grandTotal: 0,
        depositPaid: 0,
        rawBalanceDue: 0,
        damageDepositHeld: 0,
        autoDepositSeizedAmount: 0,
        autoDepositReturnAmount: 0,
        hasAutoDepositSeizure: false,
        balanceDue: 0,
      };
    }

    const baseAmount = getBaseRentalAmountExcludingExtensions();
    const rentalChargeAmount = getStoredRentalChargeAmount() || (baseAmount + (parseFloat(totalExtensionFees || 0) || 0));
    const pkg = getRentalKilometerPackage(rental, packageDetails);
    const overageCharge = pkg ? parseFloat(rental.overage_charge || 0) : 0;
    const fuelChargeAmount = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
    const extensionFees = parseFloat(totalExtensionFees || 0);
    const hasActiveImpoundRecord = Boolean(rental?.is_impounded || rental?.impounded_at);
    const hasReleasedImpoundCharge = Boolean(
      rental?.released_from_impound_at &&
      rental?.impound_charge_applied_at &&
      Number(rental?.impound_total || 0) > 0
    );
    const rawImpoundChargeAmount = hasActiveImpoundRecord
      ? Math.max(
          0,
          Number(
            impoundChargeForm.total ??
            rental.impound_total ??
            calculateImpoundChargeTotal(
              impoundChargeForm.days ?? rental.impound_charge_days ?? 0,
              impoundChargeForm.hours ?? rental.impound_charge_hours ?? 0,
              impoundChargeForm.rate ?? rental.impound_rate ?? rental.unit_price ?? 0,
              impoundChargeForm.discount ?? rental.impound_discount ?? 0,
              rental.rental_type,
              impoundChargeForm.rateMode
            )
          )
        )
      : hasReleasedImpoundCharge
        ? Math.max(0, Number(rental?.impound_total || 0))
        : 0;
    const impoundManualChargeAmount = hasReleasedImpoundCharge
      ? Math.max(0, Number(rental?.impound_manual_charge || 0))
      : 0;
    const impoundBaseChargeAmount = Math.max(0, rawImpoundChargeAmount - impoundManualChargeAmount);
    const impoundChargeAmount = waiveImpoundExtraDailyCharge ? 0 : rawImpoundChargeAmount;
    const impoundDiscountAmount = waiveImpoundExtraDailyCharge
      ? 0
      : hasActiveImpoundRecord
        ? Math.max(0, Number(impoundChargeForm.discount ?? rental.impound_discount ?? 0))
        : hasReleasedImpoundCharge
          ? Math.max(0, Number(rental.impound_discount ?? 0))
          : 0;
    const maintenanceRepairAmount = getLinkedMaintenanceRepairAmount();
    const maintenanceStayAmount = getLinkedMaintenanceStayAmount();
    const maintenanceChargeAmount = maintenanceRepairAmount + maintenanceStayAmount;
    const maintenanceDiscountAmount = parseFloat(vehicleReport?.maintenance_daily_discount || 0) || 0;
    const grandTotal = rentalChargeAmount + overageCharge + fuelChargeAmount + impoundChargeAmount + maintenanceChargeAmount;
    const rawDisplayedPaidAmount = getCorrectedDisplayedPaidAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
    const depositPaid = grandTotal > 0
      ? Math.min(rawDisplayedPaidAmount, grandTotal)
      : rawDisplayedPaidAmount;
    const rawBalanceDue = Math.max(0, grandTotal - depositPaid);
    const damageDepositHeld = Math.max(0, parseFloat(rental?.damage_deposit || 0));
    const hasAutoDepositSeizure = damageDepositHeld > 0 && (maintenanceChargeAmount > 0 || impoundChargeAmount > 0);
    const autoDepositSeizedAmount = hasAutoDepositSeizure ? Math.min(rawBalanceDue, damageDepositHeld) : 0;
    const autoDepositReturnAmount = hasAutoDepositSeizure ? Math.max(0, damageDepositHeld - autoDepositSeizedAmount) : damageDepositHeld;
    const balanceDue = Math.max(0, rawBalanceDue - autoDepositSeizedAmount);

    return {
      baseAmount,
      overageCharge,
      extensionFees,
      fuelChargeAmount,
      impoundChargeAmount,
      impoundBaseChargeAmount,
      impoundManualChargeAmount,
      impoundDiscountAmount,
      maintenanceRepairAmount,
      maintenanceStayAmount,
      maintenanceDiscountAmount,
      maintenanceChargeAmount,
      grandTotal,
      depositPaid,
      rawBalanceDue,
      damageDepositHeld,
      autoDepositSeizedAmount,
      autoDepositReturnAmount,
      hasAutoDepositSeizure,
      balanceDue,
    };
  }, [calculateImpoundChargeTotal, endFuelLevel, fuelCharge, fuelChargeEnabled, impoundChargeForm.days, impoundChargeForm.discount, impoundChargeForm.hours, impoundChargeForm.rate, impoundChargeForm.rateMode, impoundChargeForm.total, packageDetails, rental, totalExtensionFees, vehicleReport, waiveImpoundExtraDailyCharge]);

  const dynamicPaymentState = useMemo(() => {
    if (!rental) {
      return {
        status: 'unpaid',
        label: tr('UNPAID', 'IMPAYÉE'),
        chipClass: 'bg-red-100 text-red-800',
        coveredAmount: 0,
        isPaid: false,
        isPartial: false,
      };
    }

    if (rental?.is_impounded) {
      return {
        status: 'estimate',
        label: tr('ESTIMATE ACTIVE', 'ESTIMATION ACTIVE'),
        chipClass: 'bg-amber-100 text-amber-800',
        coveredAmount: rentalBillingSummary.depositPaid + rentalBillingSummary.autoDepositSeizedAmount,
        isPaid: false,
        isPartial: false,
      };
    }

    const coveredAmount = rentalBillingSummary.depositPaid + rentalBillingSummary.autoDepositSeizedAmount;
    if (rentalBillingSummary.grandTotal > 0 && coveredAmount >= rentalBillingSummary.grandTotal) {
      return {
        status: 'paid',
        label: tr('PAID', 'PAYÉE'),
        chipClass: 'bg-green-100 text-green-800',
        coveredAmount,
        isPaid: true,
        isPartial: false,
      };
    }

    if (coveredAmount > 0) {
      return {
        status: 'partial',
        label: tr('PARTIAL', 'PARTIEL'),
        chipClass: 'bg-yellow-100 text-yellow-800',
        coveredAmount,
        isPaid: false,
        isPartial: true,
      };
    }

    return {
      status: 'unpaid',
      label: tr('UNPAID', 'IMPAYÉE'),
      chipClass: 'bg-red-100 text-red-800',
      coveredAmount,
      isPaid: false,
      isPartial: false,
    };
  }, [rental, rentalBillingSummary.autoDepositSeizedAmount, rentalBillingSummary.depositPaid, rentalBillingSummary.grandTotal]);

  const paymentStepRemainingBalance = useMemo(() => {
    if (!rental) return 0;

    const hasApprovedManualPrice = ['approved', 'auto'].includes(String(rental?.approval_status || '').toLowerCase());
    const storedRemainingAmount = Math.max(0, parseFloat(rental?.remaining_amount || 0) || 0);

    if (hasApprovedManualPrice && storedRemainingAmount > 0) {
      return storedRemainingAmount;
    }

    return rentalBillingSummary.balanceDue;
  }, [rental, rentalBillingSummary.balanceDue]);
  const hasPreviouslyMarkedPaid = String(rental?.payment_status || '').toLowerCase() === 'paid';

  const receiptRentalData = useMemo(() => {
    if (!rental) return null;

    const liveImpoundSnapshot = rental?.is_impounded ? impoundChargeForm : null;
    const activeImpoundEstimate = rental?.is_impounded ? impoundEstimatePreview : null;
    const weekendImpoundPreview = activeImpoundEstimate?.weekendCarry ? activeImpoundEstimate : null;
    const liveDays = Number(liveImpoundSnapshot?.days ?? rental?.impound_charge_days ?? 0);
    const liveHours = Number(liveImpoundSnapshot?.hours ?? rental?.impound_charge_hours ?? 0);
    const liveRate = Number(liveImpoundSnapshot?.rate ?? rental?.impound_rate ?? 0);
    const liveDiscount = Number(liveImpoundSnapshot?.discount ?? rental?.impound_discount ?? 0);
    const liveTotal = waiveImpoundExtraDailyCharge ? 0 : Number(liveImpoundSnapshot?.total ?? rental?.impound_total ?? 0);
    const estimatedDays = Number(weekendImpoundPreview?.days ?? activeImpoundEstimate?.days ?? liveDays);
    const estimatedHours = Number(weekendImpoundPreview?.hours ?? activeImpoundEstimate?.hours ?? liveHours);
    const estimatedRate = Number(weekendImpoundPreview?.rate ?? activeImpoundEstimate?.rate ?? liveRate);
    const estimatedDiscount = waiveImpoundExtraDailyCharge ? 0 : Number(weekendImpoundPreview?.discount ?? activeImpoundEstimate?.discount ?? liveDiscount);
    const estimatedTotal = waiveImpoundExtraDailyCharge
      ? liveTotal
      : Number(weekendImpoundPreview?.total ?? activeImpoundEstimate?.total ?? liveTotal);
    const estimatedExtraDays = waiveImpoundExtraDailyCharge ? 0 : Math.max(0, estimatedDays - liveDays);
    const estimatedExtraAmount = waiveImpoundExtraDailyCharge
      ? 0
      : Math.max(
          0,
          rental?.rental_type === 'daily'
            ? Math.max(0, estimatedDays - liveDays) * estimatedRate
            : estimatedTotal - liveTotal
        );
    const impoundEstimateNoteText = waiveImpoundExtraDailyCharge
      ? tr(
        'No extra daily charge approved. Extra impound rental charge has been waived for this estimate.',
        'Aucun supplément journalier approuvé. Le supplément de location lié à la fourrière est annulé pour cette estimation.'
      )
      : (activeImpoundEstimate?.note || null);

    return {
      ...rental,
      payment_status: dynamicPaymentState.status === 'estimate' ? rental.payment_status : dynamicPaymentState.status,
      deposit_amount: rentalBillingSummary.depositPaid,
      fuel_charge: getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }),
      start_fuel_level: rental?.start_fuel_level,
      end_fuel_level: rental?.end_fuel_level,
      impound_charge_days: liveDays,
      impound_charge_hours: liveHours,
      impound_rate: liveRate,
      impound_manual_charge: Number(rental?.impound_manual_charge || 0),
      impound_discount: liveDiscount,
      impound_total: liveTotal,
      impound_live_charge_days: liveDays,
      impound_live_charge_hours: liveHours,
      impound_live_rate: liveRate,
      impound_live_discount: liveDiscount,
      impound_live_total: liveTotal,
      impound_is_estimate: Boolean(activeImpoundEstimate),
      impound_estimated_release_at: activeImpoundEstimate?.estimatedReleaseAt || null,
      impound_estimate_note: impoundEstimateNoteText,
      impound_extra_daily_charge_waived: Boolean(waiveImpoundExtraDailyCharge),
      impound_estimate_weekend_carry: Boolean(activeImpoundEstimate?.weekendCarry),
      impound_estimate_pricing_label: activeImpoundEstimate?.pricingLabel || '',
      impound_estimated_days_total: estimatedDays,
      impound_estimated_hours_total: estimatedHours,
      impound_estimated_rate: estimatedRate,
      impound_estimated_discount: estimatedDiscount,
      impound_estimated_total: estimatedTotal,
      impound_estimated_extra_days: estimatedExtraDays,
      impound_estimated_extra_amount: estimatedExtraAmount,
      vehicle: {
        ...rental?.vehicle,
        vehicle_model: {
          ...rental?.vehicle?.vehicle_model,
          fuel_price: fuelPricePerLine || rental?.vehicle?.vehicle_model?.fuel_price || 0
        }
      }
    };
  }, [dynamicPaymentState.status, fuelPricePerLine, impoundChargeForm.days, impoundChargeForm.discount, impoundChargeForm.hours, impoundChargeForm.rate, impoundChargeForm.total, impoundEstimatePreview, rental, rentalBillingSummary.depositPaid, waiveImpoundExtraDailyCharge, tr]);

  const receiptPreviewMeta = useMemo(
    () => getReceiptPreviewMeta(receiptRentalData || rental || {}),
    [receiptRentalData, rental]
  );

  const contractRentalData = useMemo(() => {
    if (!rental) return null;

    return {
      ...rental,
      customer_name: syncedCustomerDetails.fullName || rental.customer_name,
      customer_email: syncedCustomerDetails.email || rental.customer_email,
      customer_phone: syncedCustomerDetails.phone || rental.customer_phone,
      customer_address: syncedCustomerDetails.address || rental.customer_address,
      customer_nationality: syncedCustomerDetails.nationality || rental.customer_nationality,
      customer_licence_number: syncedCustomerDetails.licenceNumber || rental.customer_licence_number,
      linkedCustomerProfile: linkedCustomerProfile || rental.linkedCustomerProfile,
      deposit_amount: rentalBillingSummary.depositPaid,
      fuel_charge: getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }),
      vehicle: {
        ...rental?.vehicle,
        vehicle_model: {
          ...rental?.vehicle?.vehicle_model,
          fuel_price: fuelPricePerLine || rental?.vehicle?.vehicle_model?.fuel_price || 0
        }
      }
    };
  }, [fuelPricePerLine, linkedCustomerProfile, rental, rentalBillingSummary.depositPaid, syncedCustomerDetails]);

  const isPaymentSufficient = () => {
  if (!rental) return false;
  return rentalBillingSummary.depositPaid >= rentalBillingSummary.grandTotal;
};

    // ✅ UPDATED: Calculate deposit return amount with toggle support
  const calculateDepositReturn = () => {
    const damageDeposit = parseFloat(rental?.damage_deposit || 0);
    const totalRentalCost = rentalBillingSummary.grandTotal;
    const rawBalanceDue = rentalBillingSummary.rawBalanceDue;
    const balanceDue = rentalBillingSummary.balanceDue;
    const autoDeductionAmount = rentalBillingSummary.autoDepositSeizedAmount;
    const hasAutoDepositSeizure = rentalBillingSummary.hasAutoDepositSeizure;
    
    // Apply deduction automatically for maintenance / impound, otherwise rely on manual toggle
    const useDeduction = hasAutoDepositSeizure
      ? autoDeductionAmount > 0 && !rental.deposit_returned_at
      : deductFromDeposit && rawBalanceDue > 0 && !rental.deposit_returned_at;
    const deductionAmount = hasAutoDepositSeizure
      ? autoDeductionAmount
      : (useDeduction ? Math.min(rawBalanceDue, damageDeposit) : 0);
    const depositReturn = useDeduction 
      ? Math.max(0, damageDeposit - deductionAmount)
      : damageDeposit;
    const additionalOwed = hasAutoDepositSeizure
      ? balanceDue
      : Math.max(0, rawBalanceDue - damageDeposit);
    
    return {
      damageDeposit,
      totalRentalCost,
      rawBalanceDue,
      balanceDue,
      maintenanceChargeAmount: rentalBillingSummary.maintenanceChargeAmount,
      impoundChargeAmount: rentalBillingSummary.impoundChargeAmount,
      deductionAmount,
      depositReturn,
      hasDeduction: deductionAmount > 0,
      additionalOwed,
      useDeduction,
      hasAutoDepositSeizure,
    };
  };

  // Fix for mobile blank screen - initialize mobile templates (only on rental ID change)
  useEffect(() => {
    const initializeMobile = async () => {
      if (isMobileDevice() && rental) {
        setMobileLoading(true);
        // Force initial render of templates
        await new Promise(resolve => setTimeout(resolve, 1000));
        setVideoRefreshKey(prev => prev + 1);
        setMobileLoading(false);
      }
    };

    if (rental) {
      initializeMobile();
    }
  }, [rental?.id]);

  const getPaymentStatusBadge = (paymentStatus) => {
    const { label, background, text } = getPaymentStatusStyle(paymentStatus);
    const colorClass = `${background} ${text}`;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
        {label}
      </span>
    );
  };
  // 🔍 DEBUG: WhatsApp button click handler
  const handleWhatsAppClick = async () => {
    if (RENTAL_DEBUG) console.log('✅ WhatsApp button clicked!', {
      signature: !!rental?.signature_url,
      paid: dynamicPaymentState.isPaid,
      time: Date.now()
    });
    
    // Ensure PDFs are generated before opening modal
    setIsSharing(true);
    
    try {
      // PDFs are generated fresh on demand when sharing
      
      // Generate receipt PDF if paid and not already cached
      if (dynamicPaymentState.isPaid && !pdfCache.receiptUrl && !rental.receipt_pdf_url) {
        if (RENTAL_DEBUG) console.log('🔄 Generating receipt PDF before WhatsApp modal...');
        await generateAndCacheReceiptPDF();
      }
      
      // Open modal after PDFs are ready
      setWhatsappModalOpen(true);
    } catch (error) {
      console.error('Error preparing PDFs for WhatsApp:', error);
      toast.error('Failed to prepare documents. Please try again.');
      // Still open modal even if PDF generation fails - user can retry
      setWhatsappModalOpen(true);
    } finally {
      setIsSharing(false);
    }
  };

  // 🔍 DEBUG: Check what's controlling the WhatsApp button
  // Tier Pricing Display Component
  // Tier Pricing Display Component
const TierPricingDisplay = ({ breakdown, isMobile = false }) => {
  if (!breakdown || !breakdown.isDiscounted) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className={`mt-4 rounded-[24px] border border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/70 p-4 shadow-[0_18px_40px_rgba(76,29,149,0.07)] ${isMobile ? 'text-sm' : ''}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-2xl bg-violet-100 text-violet-700 shadow-sm flex items-center justify-center`}>
          <svg className={isMobile ? "w-4 h-4" : "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h4 className={`${isMobile ? 'text-sm font-bold' : 'font-bold'} text-slate-900`}>
            {breakdown.isDaily ? 'Daily Rate Breakdown' : 'Tier Pricing Breakdown'}
          </h4>
          <p className="text-violet-700 text-xs font-medium">{breakdown.tierDescription}</p>
          {/* Price Source Indicator */}
          {breakdown.source === 'database' ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Dynamic price from database
            </p>
          ) : breakdown.source === 'vehicle_rate' ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-violet-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              From vehicle {breakdown.isDaily ? 'daily' : 'hourly'} rate
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.346 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Using fallback pricing
            </p>
          )}
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Vehicle</div>
            <div className={`${isMobile ? 'text-xs font-semibold' : 'text-sm font-semibold'} text-gray-900 truncate`}>{breakdown.vehicleName}</div>
          </div>
          
          <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Duration</div>
            <div className={`${isMobile ? 'text-xs font-semibold' : 'text-sm font-semibold'} text-gray-900`}>{breakdown.duration} {breakdown.isDaily ? (breakdown.duration > 1 ? 'days' : 'day') : (breakdown.duration > 1 ? 'hours' : 'hour')}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Your Tier Rate</div>
            <div className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-green-600`}>{formatCurrency(breakdown.tierRate)}</div>
            <div className="text-green-600 text-xs">MAD per {breakdown.isDaily ? 'day' : 'hour'}</div>
            <div className="text-xs text-green-500 mt-2">{breakdown.tierDescription}</div>
          </div>
          
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Standard Rate</div>
            <div className={`${isMobile ? 'text-lg' : 'text-xl'} text-gray-400 line-through`}>{formatCurrency(breakdown.standardHourlyRate)}</div>
            <div className="text-gray-500 text-xs">MAD per {breakdown.isDaily ? 'day' : 'hour'}</div>
            <div className="text-xs text-gray-400 mt-2">Base {breakdown.isDaily ? 'daily' : 'hourly'} price</div>
            {/* Price Source Badge */}
            <div className="mt-1">
              {breakdown.source === 'database' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  DB
                </span>
              )}
              {breakdown.source === 'vehicle_rate' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  Vehicle
                </span>
              )}
              {breakdown.source === 'fallback' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  Fallback
                </span>
              )}
            </div>
          </div>
        </div>

        {breakdown.isDiscounted && (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} bg-green-100 rounded-full flex items-center justify-center`}>
                  <svg className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-green-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold text-green-800`}>{tr('Total Savings', 'Économies totales')}</div>
                  <div className="text-green-600 text-xs">{tr("You're paying less!", 'Vous payez moins !')}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-green-700`}>{formatCurrency(breakdown.savings)} MAD</div>
                <div className="text-green-600 text-xs">{breakdown.savingsPercentage}% off</div>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-green-700">
              <div className="flex justify-between mb-1">
                <span>Standard total:</span>
                <span className="line-through">{formatCurrency(breakdown.standardTotal)} MAD</span>
              </div>
              <div className="flex justify-between">
                <span>Tier total:</span>
                <span className="font-bold">{formatCurrency(breakdown.tierTotal)} MAD</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-violet-100 bg-white/90 px-4 py-3 text-xs text-gray-500 shadow-sm">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-medium text-gray-700">How tier pricing works:</span> 
              {breakdown.isDaily 
                ? ` Special discounted rate for ${breakdown.duration}-day rentals`
                : breakdown.duration === 2 
                  ? " Special discounted rate for 2-hour rentals"
                  : " Fixed price for " + breakdown.duration + "-hour rental slot"}
              <div className="mt-1 text-gray-600">
                {breakdown.source === 'database' ? (
                  <span>Standard rate fetched from pricing database</span>
                ) : breakdown.source === 'vehicle_model' ? (
                  <span>Standard rate from vehicle model pricing</span>
                ) : breakdown.source === 'vehicle_rate' ? (
                  <span>Standard rate from vehicle record</span>
                ) : (
                  <span>Standard rate estimated from vehicle type</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

      
      
// Calculate the correct rental total
const baseAmount = getBaseRentalAmountExcludingExtensions();
const overageCharge = parseFloat(rental?.overage_charge || 0);
const extensionFees = parseFloat(totalExtensionFees || 0);
const fuelChargeAmount = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
const rentalChargeAmount = getStoredRentalChargeAmount() || (baseAmount + extensionFees);

// This is the GRAND TOTAL for the RENTAL ONLY
const rentalGrandTotal = rentalChargeAmount + overageCharge + fuelChargeAmount;


    

// ==================== FUEL CHARGE TOGGLE COMPONENT ====================
const FuelChargeToggle = ({
  enabled,
  onToggle,
  pricePerLine = 0,
  rentalType,
  disabled = false,
  compact = false
}) => {
  const isHourly = rentalType === 'hourly';

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={enabled ? `Charge ${pricePerLine} MAD per missing fuel line` : 'No fuel charge'}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    );
  }

  return (
    <div className={`rounded-lg border transition-all ${
      enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Single row — full-width tap target, min height for easy tapping */}
      <button
        type="button"
        onClick={() => !disabled && onToggle(!enabled)}
        disabled={disabled}
        className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-lg text-left gap-2 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:bg-black/5'
        }`}
      >
        {/* Left: icon + label + hint all on one line */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Fuel className={`w-4 h-4 flex-shrink-0 ${enabled ? 'text-green-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium text-gray-900 leading-tight whitespace-nowrap">
            Fuel Charge
          </span>
          {enabled && pricePerLine > 0 && (
            <span className="text-xs text-orange-500 truncate">
              · ⛽ {pricePerLine} MAD/line
            </span>
          )}
          {enabled && pricePerLine === 0 && (
            <span className="text-xs text-amber-500 truncate">
              · Set in Pricing Mgmt
            </span>
          )}
          {!enabled && (
            <span className="text-xs text-gray-400 truncate">
              · No charge
            </span>
          )}
        </div>

        {/* Right: toggle pill — large enough for mobile tap */}
        <div className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        }`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </div>
      </button>
    </div>
  );
};

   const markAsPaid = async () => {
  if (isUpdatingPayment) return;
  if (!canPerformAction()) {
    toast.error('Please wait a moment before performing another action');
    return;
  }
  
  try {
    setIsUpdatingPayment(true);
    const rentalGrandTotal = rentalBillingSummary.grandTotal;
    
    console.log('markAsPaid - Rental payment:', {
      ...rentalBillingSummary,
      rentalGrandTotal,
      damageDeposit: rental.damage_deposit
    });
    
    // Update ONLY the rental payment fields
    const paymentUpdateData = {
      payment_status: 'paid',
      deposit_amount: rentalGrandTotal, // Set deposit to full rental amount
      remaining_amount: 0,
      updated_at: new Date().toISOString()
    };
    
    // Sync quantity_hours for hourly rentals
    if (rental.rental_type === 'hourly' && rental.quantity_hours == null && rental.quantity_days) {
      paymentUpdateData.quantity_hours = rental.quantity_days;
    }
    
    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update(paymentUpdateData)
      .eq('id', rental.id);
    
    if (updateError) throw updateError;
    
    // Update local state
    setRental(prev => ({
      ...prev,
      payment_status: 'paid',
      deposit_amount: rentalGrandTotal,
      remaining_amount: 0
    }));
    
    // Force a refresh of all data
    await loadRentalData(true);
    
    // Broadcast real-time update for dashboard
    try {
      await supabase
        .channel('rental-updates')
        .send({
          type: 'broadcast',
          event: 'payment_updated',
          payload: { 
            rental_id: rental.id, 
            payment_status: 'paid',
            updated_at: new Date().toISOString()
          }
        });
    } catch (broadcastErr) {
      console.warn('Broadcast failed (non-critical):', broadcastErr);
    }
    
    // Generate receipt in background
    setTimeout(() => {
      generateAndCacheReceiptPDF();
    }, 500);
    
    toast.success(`Rental payment marked as PAID! Total: ${rentalGrandTotal.toFixed(2)} MAD | Damage Deposit: ${rental.damage_deposit?.toFixed(2) || 0} MAD (separate)`);
    
    // Log the new payment status to verify
    console.log('Payment status updated to PAID, isPaymentSufficient:', isPaymentSufficient());
    
  } catch (err) {
    console.error('Payment Update Error:', err);
    toast.error(`Unable to update payment status: ${err.message}`);
  } finally {
    setIsUpdatingPayment(false);
  }
};

  const handleSignatureSave = async (signatureUrl) => {
    if (!rental) return;
    setIsSigning(false);
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
            contract_signed: true, 
            signature_url: signatureUrl,
            contract_signed_by: currentUser?.id || null,
            contract_signed_by_name: currentUser?.full_name || currentUser?.email || null,
            contract_signed_at: new Date().toISOString(),
            updated_at: new Date().toISOString() 
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();
      if (error) throw error;
      setRental(data);
      await broadcastRentalWorkflowUpdate('start', 'contract_signature', {
        contract_signed: true,
      });
    
    // ✅ AUTO-GENERATE CONTRACT PDF IN BACKGROUND
    setTimeout(() => {
      generateAndCacheContractPDF(data);
    }, 500);
    
    toast.success('Contract signed and signature saved! PDF will be generated in background.');
    } catch (err) {
      console.error('❌ Error:', err);
      toast.error(`Failed to save signature: ${err.message}`);
    }
  };

    // ✅ UPDATED: Handle deposit return signature with toggle support
  const handleDepositSignatureSave = async (signatureUrl) => {
    try {
      if (isDocumentDeposit) {
        const updateData = {
          deposit_return_signature_url: signatureUrl,
          deposit_returned_at: new Date().toISOString(),
          deposit_return_amount: 0,
          deposit_deduction_amount: 0,
          deposit_deduction_reason: 'Security document returned to customer.',
          final_deposit_return_amount: 0,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update(updateData)
          .eq('id', rental.id);

        if (error) throw error;

        setShowDepositSignatureModal(false);
        setDeductFromDeposit(false);
        await loadRentalData(true);
        toast.success('Security document returned and signed');
        return;
      }

      const rentalGrandTotal = rentalBillingSummary.grandTotal;
      const depositPaid = rentalBillingSummary.depositPaid;
      const rawBalanceDue = rentalBillingSummary.rawBalanceDue;
      const balanceDue = rentalBillingSummary.balanceDue;
      const damageDeposit = parseFloat(rental.damage_deposit || 0);
      const hasAutoDepositSeizure = rentalBillingSummary.hasAutoDepositSeizure;
      
      // The amount that can be deducted from deposit (cannot exceed deposit)
      const deductionAmount = hasAutoDepositSeizure
        ? rentalBillingSummary.autoDepositSeizedAmount
        : (deductFromDeposit ? Math.min(rawBalanceDue, damageDeposit) : 0);
      const remainingBalance = hasAutoDepositSeizure
        ? balanceDue
        : (rawBalanceDue - deductionAmount);
      const depositReturn = damageDeposit - deductionAmount;
      
      // Create detailed deduction reason
      let deductionReason = '';
      const parts = [];
      parts.push(`Base Rental: ${formatCurrency(rentalBillingSummary.baseAmount)} MAD`);
      if (rentalBillingSummary.overageCharge > 0) {
        parts.push(`Overage (${rental.extra_kilometers || 0}km × ${rental.extra_km_rate_applied || 20}MAD): +${formatCurrency(rentalBillingSummary.overageCharge)} MAD`);
      }
      if (rentalBillingSummary.fuelChargeAmount > 0) {
        parts.push(`Fuel: +${formatCurrency(rentalBillingSummary.fuelChargeAmount)} MAD`);
      }
      if (rentalBillingSummary.extensionFees > 0) {
        parts.push(`Extensions: +${formatCurrency(rentalBillingSummary.extensionFees)} MAD`);
      }
      if (rentalBillingSummary.maintenanceRepairAmount > 0) {
        parts.push(`Damage / Maintenance Bill: +${formatCurrency(rentalBillingSummary.maintenanceRepairAmount)} MAD`);
      }
      if (rentalBillingSummary.maintenanceStayAmount > 0) {
        parts.push(`Maintenance stay charge: +${formatCurrency(rentalBillingSummary.maintenanceStayAmount)} MAD`);
      }
      if (rentalBillingSummary.maintenanceDiscountAmount > 0) {
        parts.push(`Maintenance discount: -${formatCurrency(rentalBillingSummary.maintenanceDiscountAmount)} MAD`);
      }
      if (rentalBillingSummary.impoundChargeAmount > 0) {
        const baseImpoundCharge = Math.max(0, Number(rentalBillingSummary.impoundBaseChargeAmount || rentalBillingSummary.impoundChargeAmount || 0));
        if (baseImpoundCharge > 0) {
          parts.push(`Impound extra time: +${formatCurrency(baseImpoundCharge)} MAD`);
        }
      }
      if (rentalBillingSummary.impoundManualChargeAmount > 0) {
        parts.push(`Additional impound charge: +${formatCurrency(rentalBillingSummary.impoundManualChargeAmount)} MAD`);
      }
      if (rentalBillingSummary.impoundDiscountAmount > 0) {
        parts.push(`Impound discount: -${formatCurrency(rentalBillingSummary.impoundDiscountAmount)} MAD`);
      }
      
      if (deductionAmount > 0) {
        deductionReason = `${hasAutoDepositSeizure ? 'Automatically seized' : 'Applied'} ${formatCurrency(deductionAmount)} MAD from damage deposit to balance. ` +
          `Total: ${formatCurrency(rentalGrandTotal)} MAD - Deposit Paid: ${formatCurrency(depositPaid)} MAD = Balance Due: ${formatCurrency(rawBalanceDue)} MAD. ` +
          `Deposit applied: ${formatCurrency(deductionAmount)} MAD, Remaining balance: ${formatCurrency(remainingBalance)} MAD.`;
      }
      
      const updateData = {
        deposit_return_signature_url: signatureUrl,
        deposit_returned_at: new Date().toISOString(),
        deposit_return_amount: depositReturn,
        deposit_deduction_amount: deductionAmount,
        deposit_deduction_reason: deductionReason || null,
        final_deposit_return_amount: depositReturn,
        updated_at: new Date().toISOString()
      };

      // If deposit fully covered the balance, mark rental as paid
      if (remainingBalance <= 0 && depositPaid + deductionAmount >= rentalGrandTotal) {
        updateData.payment_status = 'paid';
        updateData.remaining_amount = 0;
        updateData.deposit_amount = rentalGrandTotal;
      } else {
        // Update remaining balance
        updateData.remaining_amount = remainingBalance;
      }
      
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id);

      if (error) throw error;

      setShowDepositSignatureModal(false);
      setDeductFromDeposit(false);
      await loadRentalData(true);
      
      if (deductionAmount > 0) {
        toast.success(`Deposit applied — ${formatCurrency(deductionAmount)} MAD deducted, ${formatCurrency(depositReturn)} MAD returned`);
      } else {
        toast.success(`Full deposit returned: ${formatCurrency(depositReturn)} MAD`);
      }
    } catch (err) {
      console.error('Error saving deposit signature:', err);
      toast.error(`Failed to save deposit return: ${err.message}`);
    }
  };

  // Handle odometer save
  const handleSaveOdometer = async () => {
    if (!startOdometer || parseFloat(startOdometer) <= 0) {
      toast.error('Please enter a valid odometer reading.');
      return;
    }

    setIsSavingOdometer(true);
    try {
      const startOdometerValue = parseFloat(startOdometer);
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          start_odometer: startOdometerValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (error) throw error;

      setRental({
        ...data,
      });
      setIsEditingOdometer(false);
      await broadcastRentalWorkflowUpdate('start', 'start_odometer', {
        start_odometer: startOdometerValue,
      });
      toast.success('Odometer reading saved successfully!');
    } catch (err) {
      console.error('❌ Error saving odometer:', err);
      toast.error(`Failed to save odometer reading. Error: ${err.message}`);
    } finally {
      setIsSavingOdometer(false);
    }
  };


  // Fuel level handlers
  const handleSaveStartFuel = async (fuelLevel) => {
    try {
      let previousVehicleFuelLevel = null;
      if (rental?.vehicle_id) {
        const currentState = await FuelTransactionService.getVehicleFuelState(rental.vehicle_id);
        previousVehicleFuelLevel = currentState?.current_fuel_lines ?? null;
      }

      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ start_fuel_level: fuelLevel })
        .eq('id', id);

      if (error) throw error;

      setStartFuelLevel(fuelLevel);
      setCurrentVehicleFuelLevel(fuelLevel);
      setRental(prev => ({ ...prev, start_fuel_level: fuelLevel }));
      if (rental?.vehicle_id) {
        await FuelTransactionService.recordRentalFuelSnapshot({
          rentalId: id,
          vehicleId: rental.vehicle_id,
          fuelLevel,
          stage: 'rental_opening_level',
          actor: currentUser,
          notes: previousVehicleFuelLevel !== null && previousVehicleFuelLevel !== fuelLevel
            ? `Rental opening fuel updated from ${previousVehicleFuelLevel}/8 to ${fuelLevel}/8 for ${rental.customer_name || 'customer'}`
            : `Rental opening fuel recorded at ${fuelLevel}/8 for ${rental.customer_name || 'customer'}`,
        });
      }
      await broadcastRentalWorkflowUpdate('start', 'start_fuel', {
        start_fuel_level: fuelLevel,
      });
      if (RENTAL_DEBUG) console.log('✅ Start fuel level saved:', fuelLevel);
    } catch (err) {
      console.error('❌ Error saving start fuel level:', err);
      toast.error('Failed to save fuel level');
    }
  };

  const handleSaveEndFuel = async (fuelLevel) => {
  try {
    // Calculate fuel charge for both daily AND hourly when toggle is enabled
    let charge = 0;
    if (fuelChargeEnabled) {
      charge = FuelPricingService.calculateFuelCharge(
        startFuelLevel || rental?.start_fuel_level,
        fuelLevel,
        fuelPricePerLine,
        rental.rental_type || 'daily'
      );
    } else {
      if (RENTAL_DEBUG) console.log('⛽ Fuel charge disabled - no charge applied');
    }

    const { error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        end_fuel_level: fuelLevel,
        fuel_charge: charge
      })
      .eq('id', id);

    if (error) throw error;

    setEndFuelLevel(fuelLevel);
    setFuelCharge(charge);
    setRental(prev => ({
      ...prev,
      end_fuel_level: fuelLevel,
      fuel_charge: charge
    }));

    if (rental?.vehicle_id) {
      await FuelTransactionService.recordRentalFuelSnapshot({
        rentalId: id,
        vehicleId: rental.vehicle_id,
        fuelLevel,
        stage: 'rental_closing_level',
        actor: currentUser,
          notes: `Rental return fuel recorded${charge > 0 ? ` with ${charge.toFixed(2)} MAD fuel charge` : ''}`,
        });
      }
      await broadcastRentalWorkflowUpdate('finish', 'end_fuel', {
        showWorkflow: true,
        steps: {
          ...buildFinishWorkflowState(),
          endFuelComplete: true,
        },
      });

      if (RENTAL_DEBUG) console.log('✅ End fuel level saved:', { fuelLevel, charge, rentalType: rental.rental_type });
    
    if (charge > 0 && fuelChargeEnabled) {
      toast.success(`Fuel charge applied: ${charge.toFixed(2)} MAD (deficit: ${(startFuelLevel || rental?.start_fuel_level) - fuelLevel} lines)`);
    } else if (!fuelChargeEnabled) {
      toast.success('Fuel level recorded (fuel charge disabled)');
    } else {
      toast.success('Fuel level recorded (no deficit)');
    }
  } catch (err) {
    console.error('❌ Error saving end fuel level:', err);
    toast.error('Failed to save fuel level');
  }
};

      // Handle manual edit of fuel charge
  const handleEditFuelCharge = async (newCharge) => {
    try {
      if (RENTAL_DEBUG) console.log('💰 Updating fuel charge to:', newCharge);
      
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          fuel_charge: newCharge,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (error) throw error;

      // Update local state
      setFuelCharge(newCharge);
      setRental(prev => ({
        ...prev,
        fuel_charge: newCharge
      }));

      toast.success(`Fuel charge updated to ${newCharge.toFixed(2)} MAD`);
      
    } catch (err) {
      console.error('❌ Error updating fuel charge:', err);
      toast.error(`Failed to update fuel charge: ${err.message}`);
    }
  };

  // Update fuel charge toggle
const handleFuelChargeToggle = async (enabled) => {
  try {
    setFuelChargeEnabled(enabled);
    
    // If disabling fuel charge, set fuel_charge to 0 in the database
    // If enabling, recalculate based on current fuel levels
    let newFuelCharge = 0;
    
    if (enabled) {
      const startLevel = startFuelLevel || rental?.start_fuel_level;
      const endLevel = endFuelLevel || rental?.end_fuel_level;
      
      if (startLevel !== null && endLevel !== null && endLevel < startLevel) {
        newFuelCharge = FuelPricingService.calculateFuelCharge(
          startLevel,
          endLevel,
          fuelPricePerLine,
          rental?.rental_type || 'daily'
        );
      }
    }
    
    const { error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({ 
        fuel_charge_enabled: enabled, // Save the enabled state
        fuel_charge: newFuelCharge,
        updated_at: new Date().toISOString()
      })
      .eq('id', rental.id);

    if (error) throw error;
    
    setFuelCharge(newFuelCharge);
    toast.success(`Fuel charge ${enabled ? 'enabled' : 'disabled'}`);
    
    // Refresh rental data to get the updated values
    await loadRentalData(true);
    
  } catch (err) {
    console.error('Error updating fuel charge:', err);
    toast.error('Failed to update fuel charge');
    // Revert state on error
    setFuelChargeEnabled(!enabled);
  }
};

  const persistVehicleReport = async () => {
    if (!vehicleReportDraft.enabled) {
      return null;
    }

    if (!rental?.vehicle_id) {
      throw new Error('Vehicle information is missing for this rental');
    }

    if (!hasClosingInspectionMedia) {
      throw new Error('Upload closing photos or videos before saving the report');
    }

    if (reportNeedsAffectedAreas && !hasAffectedAreas) {
      throw new Error('Please tap the vehicle map to mark the affected area');
    }

    setSavingVehicleReport(true);
    try {
      const actorName = currentUser?.full_name || currentUser?.email || 'Staff';
      const reportPayload = {
        rental_id: rental.id,
        vehicle_id: rental.vehicle_id,
        report_type: vehicleReportDraft.report_type,
        severity: vehicleReportDraft.severity,
        description: vehicleReportDraft.description.trim(),
        affected_areas: Array.isArray(vehicleReportDraft.affected_areas)
          ? vehicleReportDraft.affected_areas
          : [],
        photos: closingMedia.map((media) => ({
          id: media.id,
          url: media.url || media.public_url || media.video_url,
          type: media.file_type || (media.isImage ? 'image/*' : 'video/*'),
          phase: media.phase || 'in',
          created_at: media.created_at || new Date().toISOString(),
        })),
        customer_chargeable: vehicleReportDraft.customer_chargeable,
        customer_charge_amount: vehicleReportDraft.send_to_maintenance ? 0 : (vehicleReportDraft.customer_charge_amount || 0),
        send_to_maintenance: vehicleReportDraft.send_to_maintenance,
        created_by_user_id: currentUser?.id || null,
        created_by_name: actorName,
      };

      let nextReport = vehicleReport
        ? await VehicleReportService.updateReport(vehicleReport.id, reportPayload)
        : await VehicleReportService.createReport(reportPayload);

      if (reportPayload.send_to_maintenance && !nextReport.maintenance_id) {
        const maintenance = await VehicleReportService.createMaintenanceFromReport({
          report: nextReport,
          rental,
          actorName,
        });

        if (maintenance) {
          nextReport = await VehicleReportService.updateReport(nextReport.id, {
            maintenance_id: maintenance.id,
            maintenance_cost_total: maintenance.cost || 0,
            status: 'maintenance_created',
          });

          await supabase
            .from('saharax_0u4w4d_vehicles')
            .update({
              status: 'maintenance',
              updated_at: new Date().toISOString(),
            })
            .eq('id', rental.vehicle_id);
        }
      }

      const hydratedReport = await VehicleReportService.hydrateReportWithMaintenance(nextReport);
      setRequiresClosingInspectionReview(false);
      setVehicleReport(hydratedReport);
      setRental(prev => prev ? ({ ...prev, vehicleReport: hydratedReport }) : prev);
      setFinishRentalSteps(prev => ({
        ...prev,
        closingVideoComplete: true,
      }));
      await broadcastRentalWorkflowUpdate('finish', 'closing_inspection', {
        showWorkflow: true,
        steps: {
          ...buildFinishWorkflowState(),
          closingVideoComplete: true,
        },
      });
      toast.success(reportPayload.send_to_maintenance ? 'Vehicle report saved and maintenance created' : 'Vehicle report saved');
      return hydratedReport;
    } finally {
      setSavingVehicleReport(false);
    }
  };

  const toggleAffectedArea = (areaId) => {
    setVehicleReportDraft(prev => {
      const currentAreas = Array.isArray(prev.affected_areas) ? prev.affected_areas : [];
      const nextAreas = currentAreas.includes(areaId)
        ? currentAreas.filter((item) => item !== areaId)
        : [...currentAreas, areaId];

      return {
        ...prev,
        affected_areas: nextAreas,
      };
    });
  };

  const clearFinishWorkflowState = () => {
    if (!finishWorkflowStorageKey || typeof window === 'undefined') return;
    window.localStorage.removeItem(finishWorkflowStorageKey);
  };

  const buildFinishWorkflowState = () => ({
    showWorkflow: true,
    closingVideoComplete: closingInspectionStepComplete,
    endOdometerComplete: !!rental?.ending_odometer,
    endFuelComplete: endFuelLevel !== null || rental?.end_fuel_level !== null,
  });

  const openFinishWorkflow = async () => {
    const nextState = buildFinishWorkflowState();
    setFinishRentalSteps(nextState);
    await broadcastRentalWorkflowUpdate('finish', 'workflow_opened', {
      showWorkflow: true,
      steps: nextState,
    });
  };

  const handleCancelFinishWorkflow = async () => {
    try {
      if (rental?.id && rental?.rental_status !== 'completed') {
        const { error } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update({
            ending_odometer: null,
            end_fuel_level: null,
            fuel_charge: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rental.id);

        if (error) throw error;

        setRental((prev) => prev ? ({
          ...prev,
          ending_odometer: null,
          end_fuel_level: null,
          fuel_charge: 0,
        }) : prev);
      }

      setEndOdometer('');
      setEndOdometerEditValue('');
      setIsEditingEndOdometer(false);
      setShowEndOdometerPrompt(false);
      setEndFuelLevel(null);
      setFuelCharge(0);
      setShowEndFuelModal(false);
      setRequiresClosingInspectionReview(closingMedia.length > 0);

      const nextState = {
        showWorkflow: false,
        closingVideoComplete: false,
        endOdometerComplete: false,
        endFuelComplete: false
      };
      setFinishRentalSteps(nextState);
      clearFinishWorkflowState();
      setFinishWorkflowTakeover(false);
      await broadcastRentalWorkflowUpdate('finish', 'workflow_closed', {
        showWorkflow: false,
        steps: nextState,
        ending_odometer: null,
        end_fuel_level: null,
        fuel_charge: 0,
      });
    } catch (err) {
      console.error('❌ Error cancelling finish workflow:', err);
      toast.error(tr('Failed to cancel finish workflow', 'Échec de l’annulation du flux de retour'));
    }
  };

  const scrollToDepositReturnSection = () => {
    depositReturnSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const ensureCompletedRentalPersistence = async ({
    rentalId,
    vehicleId,
    completedAt,
    vehicleStatus,
    extraRentalFields = {},
  }) => {
    const completionPayload = {
      rental_status: 'completed',
      status: 'completed',
      completed_at: completedAt,
      actual_end_date: completedAt,
      updated_at: new Date().toISOString(),
      ...extraRentalFields,
    };

    const { data: refreshedRental, error: refreshedRentalError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('id, rental_status, status, completed_at, actual_end_date, vehicle_id')
      .eq('id', rentalId)
      .maybeSingle();

    if (refreshedRentalError) {
      throw refreshedRentalError;
    }

    const normalizedRefreshedRental = normalizeRentalLifecycleStatus(refreshedRental);
    if (
      !normalizedRefreshedRental ||
      normalizedRefreshedRental.rental_status !== 'completed' ||
      !normalizedRefreshedRental.completed_at
    ) {
      const { error: completionRetryError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(completionPayload)
        .eq('id', rentalId);

      if (completionRetryError) {
        throw completionRetryError;
      }
    }

    if (vehicleId) {
      const { data: refreshedVehicle, error: refreshedVehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, status')
        .eq('id', vehicleId)
        .maybeSingle();

      if (refreshedVehicleError) {
        throw refreshedVehicleError;
      }

      if (refreshedVehicle && refreshedVehicle.status !== vehicleStatus) {
        const { error: vehicleRetryError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({
            status: vehicleStatus,
            updated_at: completedAt,
          })
          .eq('id', vehicleId);

        if (vehicleRetryError) {
          throw vehicleRetryError;
        }
      }
    }
  };

  const finalizeRentalCompletion = async () => {
    try {
      let latestReport = vehicleReport;
      if (vehicleReportDraft.enabled) {
        latestReport = await persistVehicleReport();
      }

      const effectiveEndingOdometer = rental?.ending_odometer ?? endOdometer ?? null;
      const effectiveEndFuelLevel = endFuelLevel ?? rental?.end_fuel_level ?? null;
      const completedAt = new Date().toISOString();

      if (!effectiveEndingOdometer) {
        toast.error('Please enter ending odometer first');
        return;
      }

      if (effectiveEndFuelLevel === null || effectiveEndFuelLevel === undefined) {
        toast.error('Please record return fuel level first');
        return;
      }

      const currentPaymentStatus = String(rental?.payment_status || '').toLowerCase();
      const currentRemainingAmount = Math.max(0, Number(rental?.remaining_amount || 0) || 0);
      if (currentPaymentStatus !== 'paid' && currentRemainingAmount > 0) {
        toast.error('Rental must be fully paid before completion.');
        return;
      }

      const updateData = {
        rental_status: 'completed', 
        status: 'completed',
        completed_at: completedAt,
        actual_end_date: completedAt,
        ending_odometer: effectiveEndingOdometer,
        end_fuel_level: effectiveEndFuelLevel,
        updated_at: new Date().toISOString()
      };
      
      // If return signature exists, update it
      if (returnSignatureUrl) {
        updateData.signature_url = returnSignatureUrl;
      }

      const { data: completedRental, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*)')
        .single();

      if (error) {
        console.error('❌ Database error:', error);
        throw new Error(`Database update failed: ${error.message}`);
      }
      
      // Update vehicle status
      const targetVehicleStatus = latestReport?.send_to_maintenance && latestReport?.maintenance_id ? 'maintenance' : 'available';
      if (rental.vehicle_id) {
        const { error: vehicleUpdateError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ 
            status: targetVehicleStatus,
            updated_at: completedAt
          })
          .eq('id', rental.vehicle_id);

        if (vehicleUpdateError) {
          throw vehicleUpdateError;
        }
      }

      if (completedRental) {
        setRental((prev) => ({
          ...(prev || {}),
          ...completedRental,
          vehicle: completedRental.vehicle || prev?.vehicle,
          package: completedRental.package || prev?.package,
        }));
      } else {
        setRental((prev) => prev ? ({
          ...prev,
          rental_status: 'completed',
          status: 'completed',
          completed_at: completedAt,
          actual_end_date: completedAt,
          ending_odometer: effectiveEndingOdometer,
          end_fuel_level: effectiveEndFuelLevel,
          vehicle: prev?.vehicle
            ? {
                ...prev.vehicle,
                status: targetVehicleStatus,
              }
            : prev?.vehicle,
        }) : prev);
      }

      await ensureCompletedRentalPersistence({
        rentalId: rental.id,
        vehicleId: rental.vehicle_id,
        completedAt,
        vehicleStatus: targetVehicleStatus,
        extraRentalFields: {
          ending_odometer: effectiveEndingOdometer,
          end_fuel_level: effectiveEndFuelLevel,
          signature_url: returnSignatureUrl || rental?.signature_url || null,
        },
      });

      // Reload rental data
      await loadRentalData(true);
      
      // Broadcast real-time update for dashboard and close the shared finish workflow
      try {
        const closedWorkflowState = {
          showWorkflow: false,
          closingVideoComplete: false,
          endOdometerComplete: false,
          endFuelComplete: false
        };

        await broadcastRentalWorkflowUpdate('finish', 'workflow_closed', {
          showWorkflow: false,
          steps: closedWorkflowState,
          rental_status: 'completed',
          completed_at: completedAt,
        });

        await supabase
          .channel('rental-updates')
          .send({
            type: 'broadcast',
            event: 'status_updated',
            payload: { 
              rental_id: rental.id, 
              rental_status: 'completed',
              completed_at: completedAt,
              updated_at: completedAt
            }
          });
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-critical):', broadcastErr);
      }
      
      // Hide workflow
      setFinishRentalSteps({
        showWorkflow: false,
        closingVideoComplete: false,
        endOdometerComplete: false,
        endFuelComplete: false
      });
      clearFinishWorkflowState();
      
      setReturnSignatureUrl(null);
      
      toast.success('Rental completed successfully!');
      
    } catch (err) {
      console.error('❌ Error finalizing rental:', err);
      throw err;
    }
  };


  // Load package details for kilometer calculations
const loadPackageDetails = async (packageId = null) => {
  const pkgId = packageId || rental?.package_id;
  
  if (!pkgId) {
    if (RENTAL_DEBUG) console.log('⚠️ No package_id found');
    setPackageDetails(null);
    setIncludedKilometers(null);
    setExtraKmRate(null);
    return;
  }
  
  try {
    if (RENTAL_DEBUG) console.log('📦 Loading package with ID:', pkgId);
    
    const { data, error } = await fetchWithRetry(() =>
      supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .select('*')
        .eq('id', pkgId)
        .single()
    );
    
    if (error) {
      console.error('❌ Error loading package:', error);
      setPackageDetails(null);
      setIncludedKilometers(null);
      setExtraKmRate(null);
      return;
    }
    
    if (data) {
      if (RENTAL_DEBUG) console.log('✅ Package loaded:', {
        id: data.id,
        name: data.name,
        included_kilometers: data.included_kilometers,
        extra_km_rate: data.extra_km_rate,
        fixed_amount: data.fixed_amount
      });
      
      setPackageDetails(data);
      setIncludedKilometers(parseFloat(data.included_kilometers) || 0);
      setExtraKmRate(parseFloat(data.extra_km_rate) || 0);
    }
  } catch (err) {
    console.error('❌ Error in loadPackageDetails:', err);
    setPackageDetails(null);
    setIncludedKilometers(null);
    setExtraKmRate(null);
  }
};

// Load fuel charge settings — reads from fuel_pricing table by vehicle model
const loadFuelChargeSettings = async () => {
  try {
    const modelId = rental?.vehicle?.vehicle_model?.id || rental?.vehicle?.vehicle_model_id;
    if (!modelId) return;

    const type = rental?.rental_type || 'daily';
    const { data, error } = await supabase
      .from('fuel_pricing')
      .select('price_per_line, hourly_price_per_line, daily_price_per_line')
      .eq('model_id', modelId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading fuel pricing:', error);
      return;
    }

    if (data) {
      const price = type === 'hourly'
        ? parseFloat(data.hourly_price_per_line ?? data.price_per_line) || 0
        : parseFloat(data.daily_price_per_line ?? data.price_per_line) || 0;
      setFuelPricePerLine(price);
    }
  } catch (error) {
    console.error('Error loading fuel charge settings:', error);
  }
};


  // ✅ REMOVED: Duplicate loadPackageDetails useEffect - already called inside loadRentalData()
  // Package loading is handled in loadRentalData() when rental data is fetched

  // Clear tier pricing when package is loaded
  useEffect(() => {
    if (packageDetails) {
      if (RENTAL_DEBUG) console.log('📦 Package loaded, clearing tier pricing');
      setTierPricingBreakdown(null);
    }
  }, [packageDetails]);

  // Debug useEffect removed to reduce unnecessary re-renders and console spam


  const resolveEndOdometerValue = (rawValue = null) => {
    const candidateValue = [
      rawValue,
      endOdometerPromptInputRef.current?.value,
      endOdometerEditInputRef.current?.value,
      endOdometerEditValue,
      endOdometer,
    ].find((value) => value !== null && value !== undefined && String(value).trim() !== '');

    const normalizedValue = String(candidateValue ?? '').replace(/,/g, '.').trim();
    const parsedValue = parseFloat(normalizedValue);

    return { normalizedValue, parsedValue };
  };

  const handleEndOdometerSubmit = async (rawValue = null) => {
    const { normalizedValue, parsedValue: endOdometerValue } = resolveEndOdometerValue(rawValue);

    if (!Number.isFinite(endOdometerValue) || endOdometerValue <= 0) {
      toast.error(`Please enter a valid ending odometer reading. Received: ${normalizedValue || '(empty)'}`);
      return;
    }
    const startOdometerValue = resolveDisplayedStartingOdometer(rental, startOdometer);

    if (endOdometerValue < startOdometerValue) {
      toast.error(`Invalid: Ending odometer (${endOdometerValue} km) cannot be less than starting (${startOdometerValue} km).`);
      return;
    }

    setIsProcessingEndOdometer(true);
    try {
      // Calculate total distance
      const totalDistance = endOdometerValue - startOdometerValue;
      
      // Get package details
      const pkg = getRentalKilometerPackage(rental, packageDetails);
      const includedKm = pkg ? parseFloat(pkg.included_kilometers || 0) : 0;
      const extraRate = pkg ? parseFloat(pkg.extra_km_rate || 0) : 0;
      
      // Calculate extra kilometers and overage charge only for real kilometer packages
      const extraKms = pkg ? Math.max(0, totalDistance - includedKm) : 0;
      const overageCharge = pkg ? extraKms * extraRate : 0;
      
      if (RENTAL_DEBUG) console.log('📊 Odometer calculation:', {
        startOdometer: startOdometerValue,
        endOdometer: endOdometerValue,
        totalDistance,
        includedKm,
        extraKms,
        extraRate,
        overageCharge
      });
      
      // Preserve original price
      const originalPrice = rental.rental_type === 'hourly'
        ? (rental.quantity_hours ?? rental.quantity_days ?? 1) * (rental.unit_price || 0)
        : rental.unit_price ? rental.unit_price * (rental.quantity_days ?? 1) : (rental.total_amount || 0);
      const extensionFees = totalExtensionFees || 0;
      const fuelChargeAmount = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
      const maintenanceChargeAmount = getLinkedMaintenanceChargeAmount();
      const finalTotal = originalPrice + overageCharge + extensionFees + fuelChargeAmount + maintenanceChargeAmount;

      // Update rental with all calculated values
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ending_odometer: endOdometerValue,
          overage_charge: overageCharge, // This is the source of truth
          total_distance: totalDistance,
          total_kilometers_driven: totalDistance,
          included_kilometers_applied: pkg ? includedKm : null,
          extra_km_rate_applied: pkg ? extraRate : null,
          total_amount: originalPrice,
          remaining_amount: Math.max(0, finalTotal - (parseFloat(rental.deposit_amount) || 0)),
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Update vehicle odometer
      if (rental.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ 
            current_odometer: endOdometerValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', rental.vehicle_id);

        if (vehicleError) {
          console.error('Failed to update vehicle odometer:', vehicleError);
        }
      }

      // Update local state
      setRental(prev => ({
        ...prev,
        ending_odometer: endOdometerValue,
        overage_charge: overageCharge,
        total_distance: totalDistance,
        total_kilometers_driven: totalDistance,
        included_kilometers_applied: pkg ? includedKm : null,
        extra_km_rate_applied: pkg ? extraRate : null,
        remaining_amount: Math.max(0, finalTotal - (parseFloat(prev.deposit_amount) || 0))
      }));

      setShowEndOdometerPrompt(false);
      setEndOdometer('');
      
      // Update workflow completion
      setFinishRentalSteps(prev => ({
        ...prev,
        endOdometerComplete: true
      }));
      await broadcastRentalWorkflowUpdate('finish', 'end_odometer', {
        showWorkflow: true,
        steps: {
          ...buildFinishWorkflowState(),
          endOdometerComplete: true,
        },
      });
      
      const overageMessage = !pkg
        ? `\nNo kilometer package applied`
        : overageCharge > 0 
        ? `
⚠️ Overage: ${extraKms} km × ${extraRate} MAD = ${overageCharge.toFixed(2)} MAD`
        : `
✅ No overage (${totalDistance} km within ${includedKm} km limit)`;
      
      toast.success(`Ending odometer saved: ${endOdometerValue} km

Distance: ${totalDistance.toFixed(2)} km${overageMessage}`);
      
    } catch (err) {
      console.error('❌ Error saving ending odometer:', err);
      toast.error(`Failed to save ending odometer. Error: ${err.message}`);
    } finally {
      setIsProcessingEndOdometer(false);
    }
  };

  // Handle editing the end odometer
  const handleEditEndOdometer = async () => {
    const { normalizedValue, parsedValue: newEndOdometer } = resolveEndOdometerValue(endOdometerEditValue);
    if (!Number.isFinite(newEndOdometer) || newEndOdometer <= 0) {
      toast.error(`Please enter a valid ending odometer reading. Received: ${normalizedValue || '(empty)'}`);
      return;
    }

    const startOdometerValue = resolveDisplayedStartingOdometer(rental, startOdometer);

    if (newEndOdometer < startOdometerValue) {
      toast.error(`Invalid Odometer Reading

Ending odometer (${newEndOdometer} km) cannot be less than starting odometer (${startOdometerValue} km).`);
      return;
    }

    setIsProcessingEndOdometer(true);
    try {
      // Recalculate with dynamic package values only when a real kilometer package exists
      const totalDistance = newEndOdometer - startOdometerValue;
      const pkg = getRentalKilometerPackage(rental, packageDetails);
      const packageIncludedKilometers = pkg ? parseFloat(pkg.included_kilometers || 0) : 0;
      const packageExtraKmRate = pkg ? parseFloat(pkg.extra_km_rate || 0) : 0;
      const extraKms = pkg ? Math.max(0, totalDistance - packageIncludedKilometers) : 0;
      const overageCharge = pkg ? extraKms * packageExtraKmRate : 0;
      
      const originalPrice = rental.total_amount || rental.unit_price || 0;
      const extensionFees = totalExtensionFees || 0;
      const maintenanceChargeAmount = getLinkedMaintenanceChargeAmount();
      const finalTotal = originalPrice + overageCharge + extensionFees + maintenanceChargeAmount;

      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ending_odometer: newEndOdometer,
          total_distance: totalDistance,
          total_kilometers_driven: totalDistance,
          overage_charge: overageCharge,
          included_kilometers_applied: pkg ? packageIncludedKilometers : null,
          extra_km_rate_applied: pkg ? packageExtraKmRate : null,
          remaining_amount: Math.max(0, finalTotal - (parseFloat(rental.deposit_amount) || 0)),
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Update vehicle odometer
      if (rental.vehicle_id) {
        await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ 
            current_odometer: newEndOdometer,
            updated_at: new Date().toISOString()
          })
          .eq('id', rental.vehicle_id);
      }

      setRental(prev => ({
        ...prev,
        ending_odometer: newEndOdometer,
        total_distance: totalDistance,
        total_kilometers_driven: totalDistance,
        overage_charge: overageCharge,
        included_kilometers_applied: pkg ? packageIncludedKilometers : null,
        extra_km_rate_applied: pkg ? packageExtraKmRate : null,
        remaining_amount: Math.max(0, finalTotal - (parseFloat(prev.deposit_amount) || 0))
      }));
      
      setIsEditingEndOdometer(false);
      await broadcastRentalWorkflowUpdate('finish', 'end_odometer', {
        showWorkflow: true,
        steps: {
          ...buildFinishWorkflowState(),
          endOdometerComplete: true,
        },
      });
      
      const overageMessage = !pkg
        ? `\nNo kilometer package applied`
        : overageCharge > 0 
        ? `\n⚠️ Overage: ${extraKms} km × ${packageExtraKmRate} MAD = ${overageCharge.toFixed(2)} MAD`
        : `\n✅ No overage (${totalDistance} km within ${packageIncludedKilometers} km limit)`;
      
      toast.success(`Ending odometer updated successfully! | Distance: ${totalDistance.toFixed(2)} km${overageMessage}`);
      
    } catch (err) {
      console.error('❌ Error updating ending odometer:', err);
      toast.error(`Failed to update ending odometer. Error: ${err.message}`);
    } finally {
      setIsProcessingEndOdometer(false);
    }
  };
  const handleSaveEndOdometer = async (rawValue = null) => {
  const { normalizedValue, parsedValue: newEndOdometer } = resolveEndOdometerValue(rawValue);

  if (!Number.isFinite(newEndOdometer) || newEndOdometer <= 0) {
    toast.error(`Please enter a valid ending odometer reading. Received: ${normalizedValue || '(empty)'}`);
    return;
  }

  const startOdometerValue = resolveDisplayedStartingOdometer(rental, startOdometer);

  if (newEndOdometer < startOdometerValue) {
    toast.error(`Invalid Odometer Reading | Ending odometer (${newEndOdometer} km) cannot be less than starting odometer (${startOdometerValue} km).`);
    return;
  }

  setIsProcessingEndOdometer(true);
  try {
    // Calculate new total distance
    const totalDistance = newEndOdometer - startOdometerValue;
    
    // Recalculate overage charge only for real kilometer packages
    let overageCharge = 0;
    let includedKilometers = 0;
    let extraKms = 0;
    let extraKmRate = 0;
    const pkg = getRentalKilometerPackage(rental, packageDetails);

    if (pkg) {
      includedKilometers = parseFloat(pkg.included_kilometers || 0);
      extraKmRate = parseFloat(pkg.extra_km_rate || 0);
      extraKms = Math.max(0, totalDistance - includedKilometers);
      overageCharge = extraKms * extraKmRate;
    }
    
    // Preserve original price
    const originalPrice = rental.total_amount || rental.unit_price || 0;
    const extensionFees = totalExtensionFees || 0;
    const maintenanceChargeAmount = getLinkedMaintenanceChargeAmount();
    const finalTotal = originalPrice + overageCharge + extensionFees + maintenanceChargeAmount;

    if (RENTAL_DEBUG) console.log('🔍 DEBUG - Odometer Edit Recalculation:', {
      startOdometer: startOdometerValue,
      newEndOdometer,
      totalDistance,
      includedKilometers,
      extraKms,
      extraKmRate,
      overageCharge,
      finalTotal
    });

    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        ending_odometer: newEndOdometer,
        total_distance: totalDistance,
        total_kilometers_driven: totalDistance,
        overage_charge: overageCharge,
        included_kilometers_applied: pkg ? includedKilometers : null,
        extra_km_rate_applied: pkg ? extraKmRate : null,
        remaining_amount: Math.max(0, finalTotal - (parseFloat(rental.deposit_amount) || 0)),
        updated_at: new Date().toISOString()
      })
      .eq('id', rental.id);

    if (updateError) throw updateError;

    // Update vehicle odometer
    if (rental.vehicle_id) {
      await supabase
        .from('saharax_0u4w4d_vehicles')
        .update({ 
          current_odometer: newEndOdometer,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.vehicle_id);
    }

    // 🔥 FIX: Update local state with ALL recalculated values
    setRental(prev => ({
      ...prev,
      ending_odometer: newEndOdometer,
      total_distance: totalDistance,
      total_kilometers_driven: totalDistance,
      overage_charge: overageCharge,
      included_kilometers_applied: pkg ? includedKilometers : null,
      extra_km_rate_applied: pkg ? extraKmRate : null,
      remaining_amount: Math.max(0, finalTotal - (parseFloat(prev.deposit_amount) || 0))
    }));
    
    setIsEditingEndOdometer(false);
    toast.success(`Ending odometer updated successfully! | Distance: ${totalDistance.toFixed(2)} km | Overage: ${overageCharge.toFixed(2)} MAD`);
    
  } catch (err) {
    console.error('❌ Error updating ending odometer:', err);
    toast.error(`Failed to update ending odometer. Error: ${err.message}`);
  } finally {
    setIsProcessingEndOdometer(false);
  }
};


  // Helper function to get media counts
  const getMediaCounts = (mediaArray) => {
    const images = mediaArray.filter(m => m.file_type?.startsWith('image/')).length;
    const videos = mediaArray.filter(m => m.file_type?.startsWith('video/')).length;
    const parts = [];
    if (images > 0) parts.push(`${images} image${images !== 1 ? 's' : ''}`);
    if (videos > 0) parts.push(`${videos} video${videos !== 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  const loadRentalMedia = async (rentalId) => {
    try {
      const { data: mediaRecords, error: mediaError } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .select('*')
        .eq('rental_id', rentalId)
        .order('created_at', { ascending: false });

      if (mediaError) {
        console.error('❌ Error:', mediaError);
        return;
      }

      if (mediaRecords && mediaRecords.length > 0) {
        const openingMedia = mediaRecords
          .filter(r => r.phase === 'out')
          .map(r => ({
            ...r,
            url: r.public_url,
            isImage: r.file_type?.startsWith('image/') || false,
            isVideo: r.file_type?.startsWith('video/') || false
          }));
        
        const closingMedia = mediaRecords
          .filter(r => r.phase === 'in')
          .map(r => ({
            ...r,
            url: r.public_url,
            isImage: r.file_type?.startsWith('image/') || false,
            isVideo: r.file_type?.startsWith('video/') || false
          }));

        setOpeningMedia(openingMedia);
        setClosingMedia(closingMedia);
        
        const imageCount = openingMedia.filter(m => m.isImage).length + closingMedia.filter(m => m.isImage).length;
        const videoCount = openingMedia.filter(m => m.isVideo).length + closingMedia.filter(m => m.isVideo).length;
        if (RENTAL_DEBUG) console.log(`📹 Media loaded: ${mediaRecords.length} (Images: ${imageCount}, Videos: ${videoCount})`);
      } else {
        setOpeningMedia([]);
        setClosingMedia([]);
      }
    } catch (err) {
      console.error('❌ Error:', err);
    }
  };

  useEffect(() => {
    const loadRental = async () => {
      try {
        setLoading(true);
        await loadRentalData(true);
      } catch (err) {
        console.error('❌ Error:', err);
        setError('Failed to load rental details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadRental();
    }
  }, [id]);

  useEffect(() => {
    if (!finishWorkflowStorageKey || typeof window === 'undefined') return;
    const workflowRental = normalizeRentalLifecycleStatus(rental);
    if (!workflowRental || workflowRental.rental_status !== 'active') {
      clearFinishWorkflowState();
      restoredFinishWorkflowRef.current = null;
      return;
    }

    if (restoredFinishWorkflowRef.current === finishWorkflowStorageKey) {
      return;
    }

    const rawState = window.localStorage.getItem(finishWorkflowStorageKey);
    if (!rawState) return;

    try {
      const parsedState = JSON.parse(rawState);
      if (parsedState?.showWorkflow) {
        const nextSteps = {
          showWorkflow: true,
          closingVideoComplete: inspectionComplete,
          endOdometerComplete: Boolean(rental.ending_odometer),
          endFuelComplete: endFuelLevel !== null || rental?.end_fuel_level !== null
        };
        setFinishRentalSteps((prev) => (
          prev.showWorkflow === nextSteps.showWorkflow &&
          prev.closingVideoComplete === nextSteps.closingVideoComplete &&
          prev.endOdometerComplete === nextSteps.endOdometerComplete &&
          prev.endFuelComplete === nextSteps.endFuelComplete
        ) ? prev : nextSteps);
      }

      if (parsedState?.vehicleReportDraft && !vehicleReport?.id) {
        const nextDraft = {
          ...DEFAULT_VEHICLE_REPORT_DRAFT,
          ...parsedState.vehicleReportDraft,
          affected_areas: Array.isArray(parsedState.vehicleReportDraft.affected_areas)
            ? parsedState.vehicleReportDraft.affected_areas
            : []
        };
        setVehicleReportDraft((prev) => (
          JSON.stringify({
            ...prev,
            customer_charge_amount: String(prev.customer_charge_amount ?? ''),
          }) === JSON.stringify({
            ...nextDraft,
            customer_charge_amount: String(nextDraft.customer_charge_amount ?? ''),
          })
        ) ? prev : nextDraft);
      }

      restoredFinishWorkflowRef.current = finishWorkflowStorageKey;
    } catch (error) {
      console.error('Failed to restore finish rental workflow state:', error);
      clearFinishWorkflowState();
      restoredFinishWorkflowRef.current = null;
    }
  }, [finishWorkflowStorageKey, rental, rental?.id, rental?.rental_status, rental?.completed_at, rental?.started_at, rental?.ending_odometer, rental?.end_fuel_level, endFuelLevel, inspectionComplete, vehicleReport?.id]);

  useEffect(() => {
    if (!finishWorkflowStorageKey || typeof window === 'undefined') return;
    const workflowRental = normalizeRentalLifecycleStatus(rental);
    if (!workflowRental || workflowRental.rental_status !== 'active') return;

    if (!finishRentalSteps.showWorkflow) return;

    const payload = {
      showWorkflow: true,
      vehicleReportDraft,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(finishWorkflowStorageKey, JSON.stringify(payload));
  }, [finishWorkflowStorageKey, rental?.id, rental?.rental_status, finishRentalSteps.showWorkflow, vehicleReportDraft]);
  // ✅ OPTIMIZED: Single ref-based timer to avoid full re-renders every second.
  // Instead of a `currentTime` state (which triggered 3 state updates/sec),
  // we use one setInterval that directly computes & sets display strings.
  const currentTimeRef = useRef(Date.now());
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    const getApprovedExtensionHoursFromState = () =>
      (Array.isArray(extensions) ? extensions : [])
        .filter((ext) => ext.status === 'approved')
        .reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);

    const getEffectiveEndTime = (rentalData) => {
      if (!rentalData) return null;

      const endCandidates = [rentalData.rental_end_date, rentalData.actual_end_date]
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()));

      if (rentalData.rental_type === 'hourly' && rentalData.started_at) {
        const startDate = new Date(rentalData.started_at);
        if (!Number.isNaN(startDate.getTime())) {
          const quantityHours = parseFloat(rentalData.quantity_hours);
          if (!Number.isNaN(quantityHours) && quantityHours > 0) {
            endCandidates.push(new Date(startDate.getTime() + quantityHours * 60 * 60 * 1000));
          } else {
            const approvedExtensionHours = getApprovedExtensionHoursFromState();
            const baseEnd = rentalData.rental_end_date ? new Date(rentalData.rental_end_date) : null;
            const baseStart = rentalData.rental_start_date ? new Date(rentalData.rental_start_date) : null;

            if (
              baseEnd &&
              baseStart &&
              !Number.isNaN(baseEnd.getTime()) &&
              !Number.isNaN(baseStart.getTime())
            ) {
              const baseHours = Math.max(0, (baseEnd.getTime() - baseStart.getTime()) / (1000 * 60 * 60));
              endCandidates.push(
                new Date(startDate.getTime() + (baseHours + approvedExtensionHours) * 60 * 60 * 1000)
              );
            }
          }
        }
      }

      if (!endCandidates.length) return null;

      return endCandidates.reduce((latest, candidate) =>
        candidate.getTime() > latest.getTime() ? candidate : latest
      );
    };

    // Helper: compute time-remaining string
    const calcTimeRemaining = (rentalData) => {
      if (!rentalData) return null;
      const now = new Date(currentTimeRef.current);

      const endTime = getEffectiveEndTime(rentalData);
      if (!endTime) return null;

      const diff = endTime - now;
      if (diff <= 0) return 'Expired';
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      return `${hours}h ${minutes}m ${seconds}s`;
    };

    // Helper: compute elapsed-time string
    const calcElapsedTime = (rentalData) => {
      if (!rentalData?.started_at || rentalData.rental_status !== 'active') return '';
      const now = new Date(currentTimeRef.current);
      const startDate = new Date(rentalData.started_at);
      const diff = now - startDate;
      if (diff < 0) return '';
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (days > 0) return `${days}d ${hours}h ${minutes}m`;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Run once immediately
    currentTimeRef.current = Date.now();
    const tr = calcTimeRemaining(rental);
    if (tr !== null) setTimeRemaining(tr);
    setElapsedTime(calcElapsedTime(rental));

    // Update every second for live timer display
    timerIntervalRef.current = setInterval(() => {
      currentTimeRef.current = Date.now();
      const newTR = calcTimeRemaining(rental);
      if (newTR !== null) setTimeRemaining(prev => prev === newTR ? prev : newTR);
      const newET = calcElapsedTime(rental);
      setElapsedTime(prev => prev === newET ? prev : newET);
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [rental?.rental_end_date, rental?.actual_end_date, rental?.rental_status, rental?.started_at, rental?.quantity_hours, rental?.rental_start_date, extensions]);



    /**
   * ENHANCED CAMERA RECORDING - iOS/Android Compatible
   * Ensures mp4 output format for maximum compatibility
   * Torch/flashlight support for both platforms
   */

  
  const startPhotoPreview = async (modalType = null) => {
    try {
      const modal = modalType || activeModal || 'opening';
      const videoRef = modal === 'opening' ? openingVideoRef : closingVideoRef;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setRecordingStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      toast.error('Could not access camera. Please check permissions.');
    }
  };

  const switchCamera = async () => {
    if (!isRecording) return;
    
    try {
      if (RENTAL_DEBUG) console.log('🔄 Switching camera...');
      
      // Stop current recording and stream
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
      }
      
      // Stop canvas rendering
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Toggle facing mode
      const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(newFacingMode);
      
      // Restart with new camera
      const constraints = {
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setRecordingStream(stream);

      // Setup canvas rendering
      if (videoPreviewRef.current && canvasRef.current) {
        const video = videoPreviewRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        video.setAttribute('muted', 'true');
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;
          
          const drawFrame = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            animationFrameRef.current = requestAnimationFrame(drawFrame);
          };
          
          video.play().then(() => {
            if (RENTAL_DEBUG) console.log('✅ Camera switched, canvas rendering started');
            drawFrame();
            window.dispatchEvent(new Event('resize'));
          }).catch(err => {
            console.error('❌ Video play failed after switch:', err);
          });
        };
      }

      // Setup new MediaRecorder with lighter defaults to reduce storage
      const recorderOptions = getCompressedVideoRecorderOptions();
      const mimeType = recorderOptions.mimeType || 'video/webm';

      const recorder = new MediaRecorder(stream, recorderOptions);

      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Prevent double execution
        if (isProcessingThumbnail) {
          return;
        }
        setIsProcessingThumbnail(true);
        
        // Create blob with recorded MIME type
        const videoBlob = new Blob(chunks, { type: mimeType });
        const timestamp = Date.now();
        
        // Always use .mp4 extension for consistency
        const filename = `recorded_${timestamp}.mp4`;
        
        // Create preview URL (will be revoked after upload)
        const previewUrl = URL.createObjectURL(videoBlob);

        // Get video duration
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = URL.createObjectURL(videoBlob);
        
        const getDuration = () => new Promise((resolve) => {
          tempVideo.onloadedmetadata = () => {
            const dur = tempVideo.duration;
            URL.revokeObjectURL(tempVideo.src);
            resolve(isFinite(dur) ? Math.round(dur) : 0);
          };
          setTimeout(() => resolve(0), 2000);
        });
        
        const duration = await getDuration();

        const fileObj = {
          id: timestamp + Math.random(),
          type: 'video',
          blob: videoBlob,
          url: previewUrl,
          name: filename,
          timestamp: new Date().toISOString(),
          duration: duration,
          size: videoBlob.size,
          source: 'camera',
          mimeType: mimeType
        };

        setCapturedMedia(prev => [...prev, fileObj]);
        setRecordedChunks([]);
        
        // Cleanup camera stream and preview
        stream.getTracks().forEach(track => {
          track.stop();
        });
        
        // CRITICAL: Properly release camera hardware
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
          videoPreviewRef.current.load();
        }
        
        setRecordingStream(null);
        setIsProcessingThumbnail(false);
      };

      setMediaRecorder(recorder);
      setRecordedChunks(chunks);
      recorder.start();
      
      if (RENTAL_DEBUG) console.log(`✅ Camera switched to ${newFacingMode} and recording restarted`);
      
    } catch (err) {
      console.error('❌ Camera switch error:', err);
      toast.error(`Failed to switch camera: ${err.message}`);
    }
  };

  const startCameraRecording = async (modalType = 'opening') => {
  try {
    if (RENTAL_DEBUG) console.log(`📹 Starting camera recording for ${modalType} modal...`);
    
    // Determine which refs to use based on modal type
    const videoRef = modalType === 'opening' ? openingVideoRef : closingVideoRef;
    const canvasElRef = modalType === 'opening' ? openingCanvasRef : closingCanvasRef;
    
    // Set isRecording FIRST to render DOM elements
    setIsRecording(true);
    
    // Wait for React to render the DOM elements
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (RENTAL_DEBUG) console.log('🔧 Checking refs after delay - Video:', !!videoRef.current, 'Canvas:', !!canvasElRef.current);
    
    if (!videoRef.current || !canvasElRef.current) {
      console.error('❌ Video or Canvas ref not available after delay!');
      setIsRecording(false);
      return;
    }
    
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: true
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setRecordingStream(stream);
    
    if (RENTAL_DEBUG) console.log('✅ Camera stream acquired');
    
    const video = videoRef.current;
    const canvas = canvasElRef.current;
    
    // Configure video element
    video.muted = true;
    video.setAttribute('muted', 'true');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.playsInline = true;
    video.autoplay = true;
    
    // Attach stream to video
    video.srcObject = stream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        if (video.readyState >= 2) {
          if (RENTAL_DEBUG) console.log('✅ Video ready, dimensions:', video.videoWidth, 'x', video.videoHeight);
          resolve();
        } else {
          video.onloadeddata = () => {
            if (RENTAL_DEBUG) console.log('✅ Video loadeddata event fired');
            resolve();
          };
          // Fallback timeout
          setTimeout(resolve, 2000);
        }
      };
      checkReady();
    });
    
    // Set canvas dimensions
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    if (RENTAL_DEBUG) console.log('📐 Canvas dimensions set:', canvas.width, 'x', canvas.height);
    
    // Play video
    try {
      await video.play();
      if (RENTAL_DEBUG) console.log('✅ Video playing');
      
      // Start painting frames to canvas
      const ctx = canvas.getContext('2d');
      
      const paintFrame = () => {
        if (videoRef.current && !videoRef.current.paused && videoRef.current.readyState >= 2) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }
        animationFrameRef.current = requestAnimationFrame(paintFrame);
      };
      
      paintFrame();
      
    } catch (err) {
      console.error('❌ Video play failed:', err);
    }
    
    // Initialize MediaRecorder with lighter defaults to reduce storage
    const recorderOptions = getCompressedVideoRecorderOptions();
    const mimeType = recorderOptions.mimeType || '';
    
    if (!mimeType) {
      throw new Error('No supported video format found');
    }
    
    const recorder = new MediaRecorder(stream, recorderOptions);
    
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    recorder.onstop = async () => {
      if (isProcessingThumbnail) {
        return;
      }
      
      setIsProcessingThumbnail(true);
      
      const videoBlob = new Blob(chunks, { type: mimeType });
      const timestamp = Date.now();
      const filename = `recorded_${timestamp}.mp4`;
      const previewUrl = URL.createObjectURL(videoBlob);
      
      // Get video duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = URL.createObjectURL(videoBlob);
      
      const getDuration = () => new Promise((resolve) => {
        tempVideo.onloadedmetadata = () => {
          const dur = tempVideo.duration;
          URL.revokeObjectURL(tempVideo.src);
          resolve(isFinite(dur) ? Math.round(dur) : 0);
        };
        // Fallback if metadata doesn't load
        setTimeout(() => resolve(0), 2000);
      });
      
      const duration = await getDuration();
      
      const fileObj = {
        id: timestamp + Math.random(),
        type: 'video',
        blob: videoBlob,
        url: previewUrl,
        name: filename,
        timestamp: new Date().toISOString(),
        duration: duration,
        size: videoBlob.size,
        source: 'camera',
        mimeType: mimeType
      };
      
      setCapturedMedia(prev => [...prev, fileObj]);
      setRecordedChunks([]);
      
      // Cleanup
      stream.getTracks().forEach(track => track.stop());
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
      
      setRecordingStream(null);
      setIsProcessingThumbnail(false);
      setIsRecording(false);
    };
    
    setMediaRecorder(recorder);
    setRecordedChunks(chunks);
    recorder.start();
    
    if (RENTAL_DEBUG) console.log('✅ Recording started');
    
  } catch (err) {
    console.error('❌ Camera recording error:', err);
    setIsRecording(false);
    toast.error(`Failed to start camera: ${err.message}`);
  }
};

  const stopCameraRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      
      // Cleanup: Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        if (RENTAL_DEBUG) console.log('🛑 Paint loop cancelled in stopCameraRecording');
      }
      
      if (torchEnabled) {
        toggleTorch();
      }
    }
  };

  const capturePhoto = (modalType = null) => {
    const modal = modalType || activeModal || 'opening';
    const videoRef = modal === 'opening' ? openingVideoRef : closingVideoRef;
    const canvasElRef = modal === 'opening' ? openingCanvasRef : closingCanvasRef;
    
    if (!videoRef.current || !canvasElRef.current) {
      console.error('❌ Video or canvas ref not available for photo capture');
      return;
    }
    
    // Trigger flash effect
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 200);
    
    const video = videoRef.current;
    const canvas = canvasElRef.current;
    
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const fileName = `photo_${Date.now()}.jpg`;
        const fileObj = {
          id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          blob: blob,
          name: fileName,
          type: 'image/jpeg',
          url: URL.createObjectURL(blob),
          thumbnail: URL.createObjectURL(blob),
          source: 'camera',
          mediaType: 'image'
        };
        setCapturedMedia(prev => [...prev, fileObj]);
        if (navigator.vibrate) navigator.vibrate(50);
        if (RENTAL_DEBUG) console.log('✅ Photo captured:', fileName);
      }
    }, 'image/jpeg', 0.92);
  };

  /**
   * Toggle flashlight/torch during recording
   * iOS 15+: Supports torch via ImageCapture API
   * Android Chrome: Native torch support via MediaStreamTrack
   */
  const toggleTorch = async () => {
    if (!recordingStream) return;

    try {
      const videoTrack = recordingStream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities();

      // Check if torch is supported on this device
      // iOS 15+: Supports torch via MediaStreamTrack constraints
      // Android Chrome: Native torch support via MediaStreamTrack
      if (!capabilities.torch) {
        toast.error('Flashlight not supported on this device');
        return;
      }

      const newTorchState = !torchEnabled;
      
      // Apply torch constraint to the video track
      await videoTrack.applyConstraints({
        advanced: [{ torch: newTorchState }]
      });

      setTorchEnabled(newTorchState);
      if (RENTAL_DEBUG) console.log(`🔦 Torch ${newTorchState ? 'enabled' : 'disabled'}`);

    } catch (err) {
      console.error('❌ Torch toggle error:', err);
      toast.error('Failed to toggle flashlight');
    }
  };

  // Cleanup camera stream on component unmount
  useEffect(() => {
    return () => {
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [recordingStream]);

  // Load fuel charge settings
  useEffect(() => {
    loadFuelChargeSettings();
  }, []);


  // Load cached PDFs and auto-generate missing ones - OPTIMIZED
  useEffect(() => {
    if (rental) {
      // Guard: only run PDF check once per rental ID
      if (pdfCheckDoneRef.current === rental?.id) return;
      pdfCheckDoneRef.current = rental?.id;

      // PDF URLs are always regenerated fresh — never load old ones from DB
      
      // ✅ OPTIMIZED: Delay PDF generation for better UX
      const generatePDFsIfNeeded = () => {
        // Only generate if user has been on page for 3 seconds (page is interactive)
        if (rental.signature_url && !pdfCache.contractUrl && !pdfCache.contractGenerating) {
          setTimeout(() => generateAndCacheContractPDF(), 3000);
        }
        if (dynamicPaymentState.isPaid && !pdfCache.receiptUrl && !pdfCache.receiptGenerating) {
          setTimeout(() => generateAndCacheReceiptPDF(), 3500);
        }
      };
      
      // Wait 2 seconds before starting PDF generation
      const timer = setTimeout(generatePDFsIfNeeded, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [dynamicPaymentState.isPaid, rental?.id, rental?.signature_url]);

  // Auto-close extension modal when closing video is uploaded
  useEffect(() => {
    if (closingMedia.length > 0 && extensionModalOpen) {
      setExtensionModalOpen(false);
    }
  }, [closingMedia, extensionModalOpen]);
  // Update finish steps when closing video is uploaded
  useEffect(() => {
    if (!finishRentalSteps.showWorkflow) return;

    setFinishRentalSteps(prev => (
      prev.closingVideoComplete === inspectionComplete
        ? prev
        : {
            ...prev,
            closingVideoComplete: inspectionComplete
          }
    ));
  }, [finishRentalSteps.showWorkflow, inspectionComplete]);

  // Update finish steps when end odometer is saved
  useEffect(() => {
    if (rental?.ending_odometer && finishRentalSteps.showWorkflow) {
      setFinishRentalSteps(prev => (
        prev.endOdometerComplete ? prev : {
          ...prev,
          endOdometerComplete: true
        }
      ));
    }
  }, [rental?.ending_odometer, finishRentalSteps.showWorkflow]);

  // Update finish steps when end fuel is saved
useEffect(() => {
  if ((endFuelLevel !== null || rental?.end_fuel_level) && finishRentalSteps.showWorkflow) {
    setFinishRentalSteps(prev => (
      prev.endFuelComplete ? prev : {
        ...prev,
        endFuelComplete: true
      }
    ));
    
    // Calculate fuel charge - only for daily rentals and if fuel charge is enabled
    const startLevel = startFuelLevel || rental?.start_fuel_level;
    const endLevel = endFuelLevel || rental?.end_fuel_level;
    
    // Only calculate and set fuel charge if fuel charge is enabled
    if (fuelChargeEnabled) {
      if (startLevel !== null && endLevel !== null && endLevel < startLevel) {
        const charge = FuelPricingService.calculateFuelCharge(
          startLevel,
          endLevel,
          fuelPricePerLine || 0,
          rental?.rental_type || 'daily'
        );
        setFuelCharge(charge);
      }
    } else {
      setFuelCharge(0);
    }
  }
}, [endFuelLevel, rental?.end_fuel_level, finishRentalSteps.showWorkflow, startFuelLevel, rental?.start_fuel_level, fuelPricePerLine, fuelChargeEnabled]);




    /**
   * ENHANCED GALLERY UPLOAD - iOS .MOV/HEVC Auto-Conversion
   * Automatically converts iOS videos to mp4 before upload
   * Shows conversion progress to user
   */
  const uploadFromGallery = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mov,.MOV,.mp4,.MP4,.m4v,.M4V'; // Accept all video formats
    input.multiple = true; // Allow multiple file selection
    
    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      if (RENTAL_DEBUG) console.log(`📹 Gallery files selected: ${files.length} file(s)`);
      
      setIsUploading(true);
      
      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (RENTAL_DEBUG) console.log(`📹 Processing file ${i + 1}/${files.length}:`, file.name, file.type, `${(file.size / 1024 / 1024).toFixed(2)}MB`);

        // Check file size (50MB limit per file)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          toast.error(`File "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit. Skipping this file.`);
          continue;
        }

        setIsConverting(true);
        setConversionProgress(0);

        try {
          // Process video: convert iOS .MOV/HEVC to mp4 if needed
          if (RENTAL_DEBUG) console.log('🔍 Checking if video needs conversion...');
          
          // Use file directly (no conversion needed for most browsers)
          const blob = file;
          const converted = false;
          setConversionProgress(100);
          if (RENTAL_DEBUG) console.log(`🔄 Processing file ${i + 1}: 100%`);

          // Create file object with converted blob
          const timestamp = Date.now();
          const filename = file.name.replace(/\.(mov|MOV|m4v|M4V)$/i, '.mp4');
          const blobUrl = URL.createObjectURL(blob);

          // Try to get video duration
          let galleryDuration = 0;
          try {
            const tempVid = document.createElement('video');
            tempVid.preload = 'metadata';
            tempVid.src = blobUrl;
            galleryDuration = await new Promise((resolve) => {
              tempVid.onloadedmetadata = () => {
                const dur = tempVid.duration;
                resolve(isFinite(dur) ? Math.round(dur) : 0);
              };
              setTimeout(() => resolve(0), 2000);
            });
          } catch (durErr) {
            console.warn('Could not get video duration:', durErr);
          }

          const fileObj = {
            id: timestamp + Math.random(),
            type: 'video',
            blob: blob,
            url: blobUrl,
            name: filename,
            timestamp: new Date().toISOString(),
            duration: galleryDuration,
            size: blob.size,
            source: 'gallery',
            converted: converted
          };

          setCapturedMedia(prev => [...prev, fileObj]);

        } catch (error) {
          console.error(`❌ Video processing failed for ${file.name}:`, error);
          toast.error(`Failed to process "${file.name}": ${error.message} | Skipping this file.`);
        }
      }
      
      setIsConverting(false);
      setConversionProgress(0);
      setIsUploading(false);
    };
    
    // Trigger file picker
    input.click();
  };

  // Take photo from camera
  const takePhoto = async (type) => {
    const setCapturedMedia = type === 'opening' ? setOpeningCapturedFiles : setClosingCapturedFiles;
    const setIsConverting = type === 'opening' ? setOpeningIsConverting : setClosingIsConverting;
    const streamRef = type === 'opening' ? openingStreamRef : closingStreamRef;
    const videoRef = type === 'opening' ? openingVideoRef : closingVideoRef;
    
    if (!streamRef.current || !videoRef.current) {
      console.error('Camera not ready');
      return;
    }
    
    setIsCapturingPhoto(true);
    
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });
      
      // Create object URL for preview
      const url = URL.createObjectURL(blob);
      
      // Add to captured files
      const photoFile = {
        blob,
        url,
        name: `photo_${Date.now()}.jpg`,
        size: blob.size,
        mediaType: 'image'
      };
      
      setCapturedMedia(prev => [...prev, photoFile]);
      if (RENTAL_DEBUG) console.log('📸 Photo captured successfully');
      
    } catch (error) {
      console.error('Failed to capture photo:', error);
    } finally {
      setIsCapturingPhoto(false);
    }
  };


  // Helper to shorten URLs using is.gd via a CORS Proxy
  // Helper function to format file sizes
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const shortenUrl = async (url, documentType = 'other') => {
    try {
      return await shortenUrlService(url, rental?.id, documentType);
    } catch (error) {
      console.error('URL shortening failed:', error);
      return url;
    }
  };
  // WhatsApp URL opening helper - uses multiple methods
  const openWhatsAppUrl = (url) => {
    if (RENTAL_DEBUG) console.log('🔗 Opening WhatsApp URL with multiple methods:', url);
    
    // Method 1: Create and click a temporary link (most reliable)
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = 'position: fixed; left: -9999px; top: -9999px; width: 1px; height: 1px;';
    
    document.body.appendChild(link);
    
    try {
      // Native click
      link.click();
      if (RENTAL_DEBUG) console.log('✅ Method 1: Native click attempted');
    } catch (err) {
      if (RENTAL_DEBUG) console.log('Native click failed, trying programmatic click');
    }
    
    // Method 2: MouseEvent (for strict browsers)
    setTimeout(() => {
      try {
        const event = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(event);
        if (RENTAL_DEBUG) console.log('✅ Method 2: MouseEvent dispatched');
      } catch (err) {
        if (RENTAL_DEBUG) console.log('MouseEvent failed');
      }
    }, 10);
    
    // Method 3: window.open as fallback
    setTimeout(() => {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        if (RENTAL_DEBUG) console.log('✅ Method 3: window.open attempted');
      } catch (err) {
        if (RENTAL_DEBUG) console.log('window.open failed, showing manual option');
        // Show URL for manual copy
        toast.error(`WhatsApp blocked by browser. Please copy this link manually: | ${url}`);
      }
    }, 50);
    
    // Cleanup
    setTimeout(() => {
      if (link.parentNode) {
        document.body.removeChild(link);
      }
    }, 1000);
  };



  // ✅ UPDATED: Enhanced saveMedia with improved retry logic and non-blocking thumbnail generation
    /**
   * ENHANCED SAVE MEDIA - First-Try Upload Success with Progress
   * Implements robust upload with real-time progress tracking
   * Automatic thumbnail generation after successful upload
   * Retry logic only for network errors
   */
  /**
   * ENHANCED SAVE MEDIA - First-Try Upload Success with Progress
   * Implements robust upload with real-time progress tracking
   * Automatic thumbnail generation after successful upload
   * Retry logic only for network errors
   */
  const handleOpenOpeningModal = () => {
    setActiveModal('opening');
    setCapturedMedia([]);
    setOpeningMediaMode('photo');
    setIsCapturingPhoto(false);
    setIsRecording(false);
    setOpeningModalOpen(true);
  };

  const handleOpenClosingModal = () => {
    setActiveModal('closing');
    setCapturedMedia([]);
    setClosingMediaMode('photo');
    setIsCapturingPhoto(false);
    setIsRecording(false);
    setRequiresClosingInspectionReview(false);
    setClosingModalOpen(true);
  };

  const saveMedia = async (type) => {
    if (capturedMedia.length === 0) {
      toast.error('Please capture or select media first');
      return;
    }

    setIsProcessingVideo(true);
    setUploadProgress(0);

    try {
      // Process all captured files
      const uploadedMedia = [];
      const totalFiles = capturedMedia.length;
      
      for (let i = 0; i < capturedMedia.length; i++) {
        const file = capturedMedia[i];
        
        // Normalize file object - handle both File objects and our custom structure
        const fileBlob = file.blob || file;
        const fileName_orig = file.name || (file instanceof File ? file.name : `media_${Date.now()}`);
        const fileType = file.type || file.mediaType || (fileBlob.type || 'application/octet-stream');
        const isImage = fileType.startsWith('image/');
        
        if (RENTAL_DEBUG) console.log(`📤 Starting upload for ${type} ${isImage ? 'image' : 'video'} (${i + 1}/${totalFiles}):`, fileName_orig);

        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = fileName_orig.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${type}_${rental.rental_id}_${timestamp}_${sanitizedName}`;
        const mediaFolder = isImage ? 'images' : 'videos';
        const filePath = `rentals/${rental.rental_id}/${type}/${mediaFolder}/${fileName}`;

        if (RENTAL_DEBUG) console.log(`📤 Upload path: ${filePath}`);

        // Upload with progress tracking
        const baseProgress = (i / totalFiles) * 100;
        const progressRange = 100 / totalFiles;
        const uploadResult = await uploadWithProgress(fileBlob, filePath, (progress) => {
          const overallProgress = Math.round(baseProgress + (progress * progressRange / 100));
          setUploadProgress(overallProgress);
          if (RENTAL_DEBUG) console.log(`📤 Upload progress: ${overallProgress}%`);
        });

      if (RENTAL_DEBUG) console.log('✅ Upload successful:', uploadResult.url);

        // Generate thumbnail for videos, use image itself for images
        let thumbnailUrl = null;
        
        if (isImage) {
          thumbnailUrl = uploadResult.url; // Use the image itself as thumbnail
        } else {
          try {
            if (RENTAL_DEBUG) console.log('🖼️ Generating video thumbnail...');
            const { generateThumbnailSafe } = await import('../../utils/uploadWithRetry');
            thumbnailUrl = await generateThumbnailSafe(
              file.url || URL.createObjectURL(fileBlob),
              `rentals/${rental.rental_id}/${type}/${mediaFolder}/thumb_${fileName.replace(/\.[^.]+$/, '.jpg')}`
            );
            if (RENTAL_DEBUG) console.log('✅ Thumbnail generated:', thumbnailUrl);
          } catch (thumbError) {
            console.warn('⚠️ Thumbnail generation failed (non-critical):', thumbError);
          }
        }

        // Insert into rental_media table
        const phase = type === 'opening' ? 'out' : 'in';
        
        // Parse duration as integer (seconds) - round to nearest whole number
        const durationValue = isImage ? 0 : Math.round(file.duration || 0);

        const mediaRecord = {
          rental_id: rental.id,
          phase: phase,
          file_type: fileType,
          file_name: fileName,
          original_filename: fileName_orig,
          file_size: parseInt(fileBlob.size) || 0,
          storage_path: filePath,
          public_url: uploadResult.url,
          thumbnail_url: thumbnailUrl || null,
          duration: durationValue,
          created_at: new Date().toISOString()
        };

        if (RENTAL_DEBUG) console.log('📝 Inserting media record:', mediaRecord);

        const { error: mediaError } = await supabase
          .from('app_2f7bf469b0_rental_media')
          .insert([mediaRecord]);

        if (mediaError) {
          console.error('❌ Failed to insert media record:', mediaError);
          throw new Error(`Failed to save media record: ${mediaError.message}`);
        }

        uploadedMedia.push({ url: uploadResult.url, thumbnailUrl, isImage });
        if (RENTAL_DEBUG) console.log(`✅ ${isImage ? 'Image' : 'Video'} ${i + 1}/${totalFiles} saved successfully`);
      }

      // Update rental record with first video URL for backward compatibility
      const firstVideo = uploadedMedia.find(m => !m.isImage);
      if (firstVideo) {
        const updateField = type === 'opening' ? 'opening_video_url' : 'closing_video_url';
        const thumbField = type === 'opening' ? 'opening_video_thumbnail' : 'closing_video_thumbnail';
        
        const updateData = {
          [updateField]: firstVideo.url,
          ...(firstVideo.thumbnailUrl && { [thumbField]: firstVideo.thumbnailUrl })
        };

        const { error: updateError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update(updateData)
          .eq('id', rental.id);

        if (updateError) {
          console.warn('⚠️ Failed to update rental record (non-critical):', updateError);
        }

        setRental(prev => ({
          ...prev,
          ...updateData
        }));
      }

      if (RENTAL_DEBUG) console.log(`✅ All ${type} media saved successfully`);

      // Cleanup
      capturedMedia.forEach(f => {
        if (f.url) URL.revokeObjectURL(f.url);
        if (f.thumbnail && f.thumbnail !== f.url) URL.revokeObjectURL(f.thumbnail);
      });
      setCapturedMedia([]);
      
      if (type === 'opening') {
        setOpeningModalOpen(false);
      } else {
        setClosingModalOpen(false);
      }

      const imageCount = uploadedMedia.filter(m => m.isImage).length;
      const videoCount = uploadedMedia.filter(m => !m.isImage).length;
      const mediaTypes = [];
      if (imageCount > 0) mediaTypes.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
      if (videoCount > 0) mediaTypes.push(`${videoCount} video${videoCount > 1 ? 's' : ''}`);
      
      toast.success(`${type === 'opening' ? 'Opening' : 'Closing'} condition: ${mediaTypes.join(' and ')} uploaded successfully!`);
      
      // Reload media to show the newly uploaded content
      await loadRentalMedia(rental.id);
      if (type === 'opening') {
        await broadcastRentalWorkflowUpdate('start', 'opening_media', {
          media_phase: 'out',
        });
      } else {
        await broadcastRentalWorkflowUpdate('finish', 'closing_inspection', {
          media_phase: 'in',
          showWorkflow: true,
          steps: {
            ...buildFinishWorkflowState(),
            closingVideoComplete: true,
          },
        });
      }
      
      // Trigger video refresh in RentalVideos component
      setVideoRefreshKey(prev => prev + 1);
      
      if (RENTAL_DEBUG) console.log('✅ Media list reloaded, video should now be visible');

    } catch (error) {
      console.error(`❌ Failed to save ${type} video:`, error);
      toast.error(`Failed to upload video: ${error.message} | Please check your internet connection and try again.`);
    } finally {
      setIsProcessingVideo(false);
      setUploadProgress(0);
    }
  };

  /**
   * Upload with progress tracking and retry logic
   * Uses XMLHttpRequest for upload progress events
   * Retries only on network errors with exponential backoff
   */
  const uploadWithProgress = async (blob, path, onProgress) => {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        if (RENTAL_DEBUG) console.log(`📤 Upload attempt ${attempt}/${maxRetries}`);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('rental-videos')
          .upload(path, blob, {
            contentType: 'video/mp4',
            upsert: false,
            onUploadProgress: (progress) => {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              onProgress(percent);
            }
          });

        if (error) {
          // Check if it's a network error (retryable)
          if (error.message.includes('network') || error.message.includes('timeout')) {
            throw new Error('NETWORK_ERROR: ' + error.message);
          }
          throw error;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('rental-videos')
          .getPublicUrl(path);

        return {
          path: data.path,
          url: urlData.publicUrl
        };

      } catch (error) {
        console.error(`❌ Upload attempt ${attempt} failed:`, error);

        // Retry only on network errors
        if (error.message.startsWith('NETWORK_ERROR') && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          if (RENTAL_DEBUG) console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-network error or max retries reached
        throw error;
      }
    }

    throw new Error('Échec du téléversement après le nombre maximal de tentatives');
  };


  /**
   * Upload with progress tracking and retry logic
   * Uses XMLHttpRequest for upload progress events
   * Retries only on network errors with exponential backoff
   */
  



  const startRental = async () => {
    if (isStartingRental || startRentalInFlightRef.current) {
      return;
    }
    if (!startWorkflowStepMap.customer_verification?.complete) {
      toast.error(tr('Complete customer verification before starting this rental.', 'Complétez la vérification client avant de démarrer cette location.'));
      openCustomerVerificationForm();
      return;
    }
    if (!startWorkflowStepMap.payment?.complete) { toast.error('Payment must be "Paid" before starting.'); return; }
    if (!startWorkflowStepMap.opening_media?.complete) { handleOpenOpeningModal(); return; }
    startRentalInFlightRef.current = true;
    setIsStartingRental(true);
    try {
      const now = new Date();
      const scheduledStart = new Date(rental.rental_start_date);
      const rentalType = rental.rental_type || 'hourly';
      const duration = rentalType === 'hourly'
        ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
        : (rental.quantity_days ?? 1);

      const timingState = getScheduledRentalTimingState(rental.rental_start_date, rentalTimingSettings, now);
      const EXPIRY_MINUTES = timingState?.graceMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes;
      const SOFT_LOCK_MINUTES = timingState?.softLockMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes;
      const minutesLate = timingState?.minutesLate ?? Math.floor((now - scheduledStart) / 60000);

      const autoExpireAllowed = shouldAutoExpireScheduledRental(rental);

      if (timingState?.isExpired && autoExpireAllowed) {
        const autoExpireKey = `${rental.id}:scheduled-expired`;
        await supabase.from('app_4c3a7a6153_rentals').update({ rental_status: 'expired' }).eq('id', rental.id);
        if (rental.vehicle_id) await supabase.from('saharax_0u4w4d_vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);
        await loadRentalData(true);
        if (!notifiedAutoExpiredRentalsRef.current.has(autoExpireKey)) {
          notifiedAutoExpiredRentalsRef.current.add(autoExpireKey);
          window.alert(
            `RENTAL EXPIRED\n\nCustomer: ${rental.customer_name}\nRental: ${rental.rental_id}\n\n` +
            `Scheduled: ${formatRentalScheduleDateTime(timingState.scheduledStart)}\nGrace: ${EXPIRY_MINUTES} min\n` +
            `Expired at: ${formatRentalScheduleDateTime(timingState.expiredAt)}\nNow: ${formatRentalScheduleDateTime(now)} (${timingState.minutesPastGrace} min past)\n\n` +
            `Vehicle has been freed.`
          );
        }
        return;
      }

      if (timingState?.isSoftLocked) {
        const confirmed = window.confirm(
          autoExpireAllowed
            ? `⚠️ LATE WARNING\n\nCustomer is ${minutesLate} min late.\nAuto-expires in ${EXPIRY_MINUTES - minutesLate} min.\n\nStart now and adjust end time?`
            : `⚠️ LATE ARRIVAL\n\nCustomer is ${minutesLate} min late.\nThis rental will stay available for staff review.\n\nStart now and adjust end time?`
        );
        if (!confirmed) return;
      }

      let actualStartTime, actualEndTime;
      if (minutesLate > 0) {
        actualStartTime = now.toISOString();
        actualEndTime = new Date(now.getTime() + duration * (rentalType === 'hourly' ? 3600000 : 86400000)).toISOString();
      } else {
        actualStartTime = scheduledStart.toISOString();
        actualEndTime = rental.rental_end_date;
      }

      const { data: updatedRental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_status: 'active', status: 'active', started_at: actualStartTime,
          actual_end_date: actualEndTime, rental_end_date: actualEndTime,
          quantity_days: duration, quantity_hours: rentalType === 'hourly' ? duration : null,
          late_start_minutes: minutesLate > 0 ? minutesLate : 0,
          started_by: currentUser?.id || null,
          started_by_name: currentUser?.full_name || currentUser?.email || null
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (rentalError) throw rentalError;
      if (rental.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ status: 'rented' })
          .eq('id', rental.vehicle_id);
        if (vehicleError) throw vehicleError;
      }
      try {
        await supabase
          .channel('rental-updates')
          .send({
            type: 'broadcast',
            event: 'status_updated',
            payload: {
              rental_id: rental.id,
              rental_status: 'active',
              started_at: actualStartTime,
              updated_at: new Date().toISOString(),
            }
          });
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-critical):', broadcastErr);
      }
      if (rental.signature_url) setTimeout(() => generateAndCacheContractPDF(), 1000);
      setRental((prev) => prev ? ({
        ...prev,
        ...updatedRental,
        rental_status: 'active',
        started_at: actualStartTime,
        actual_end_date: actualEndTime,
        rental_end_date: actualEndTime,
      }) : updatedRental);
      await loadRentalData(true);
      if (minutesLate > 0) {
        toast(`⚠️ Started ${minutesLate} min late — new end: ${new Date(actualEndTime).toLocaleTimeString()}`, {
          id: `start-rental-${rental.id}`,
          icon: '⏰',
          duration: 5000,
        });
      } else if (minutesLate < 0) {
        toast.success(`✅ Started ${Math.abs(minutesLate)} min early`, {
          id: `start-rental-${rental.id}`,
        });
      } else {
        toast.success('Rental started successfully!', {
          id: `start-rental-${rental.id}`,
        });
      }
    } catch(err) {
      console.error('❌ Error starting rental:', err);
      toast.error('Failed to start rental.');
    } finally {
      startRentalInFlightRef.current = false;
      setIsStartingRental(false);
    }
  };
  const completeRental = async () => {
    // Prevent duplicate calls
    if (isProcessingEndOdometer) {
      return;
    }

    const currentPaymentStatus = String(rental?.payment_status || '').toLowerCase();
    const currentRemainingAmount = Math.max(0, Number(rental?.remaining_amount || 0) || 0);
    if (currentPaymentStatus !== 'paid' && currentRemainingAmount > 0) {
      toast.error('Rental must be fully paid before completion.');
      return;
    }

    // Step 1: Check if closing video exists
    if (closingMedia.length === 0) {
      handleOpenClosingModal();
      return;
    }

    // Step 2: Check if ending odometer is already recorded
    if (!rental.ending_odometer) {
      // Show End Odometer Prompt to user
      setShowEndOdometerPrompt(true);
      return;
    }

    // Step 2.5: Check if ending fuel level is recorded (for daily rentals only)
    if (!endFuelLevel && !rental?.end_fuel_level) { // Fuel level required for all rental types
      if (RENTAL_DEBUG) console.log('⛽ Fuel level not recorded, prompting...');
      setShowEndFuelModal(true);
      return;
    }

    // Step 3: If both closing video and ending odometer exist, complete the rental
    try {
      const completedAt = new Date().toISOString();
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: 'completed', 
          status: 'completed',
          completed_at: completedAt,
          actual_end_date: completedAt,
        })
        .eq('id', rental.id);

      if (error) throw error;
      
      if (rental.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ status: 'available', updated_at: completedAt })
          .eq('id', rental.vehicle_id);
        
        if (vehicleError) {
          throw vehicleError;
        }
      }

      setRental((prev) => prev ? ({
        ...prev,
        rental_status: 'completed',
        status: 'completed',
        completed_at: completedAt,
        actual_end_date: completedAt,
        vehicle: prev?.vehicle
          ? {
              ...prev.vehicle,
              status: 'available',
            }
          : prev?.vehicle,
      }) : prev);
      setFinishRentalSteps({
        customer_return: true,
        closing_video: true,
        end_odometer: true,
        final_payment: true,
      });
      clearFinishWorkflowState();
      await ensureCompletedRentalPersistence({
        rentalId: rental.id,
        vehicleId: rental.vehicle_id,
        completedAt,
        vehicleStatus: 'available',
      });
      await loadRentalData(true);
      
      toast.success('Rental completed successfully!');
    } catch (err) {
      console.error('❌ Error:', err);
      toast.error('Failed to complete rental. Please try again.');
    }
  };
  const cancelRental = async () => {
    if (confirm('Are you sure you want to cancel this rental?')) {
      try {
        const { error } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update({ rental_status: 'cancelled' })
          .eq('id', rental.id);

        if (error) throw error;
        
        if (rental.vehicle_id) {
          const { error: vehicleError } = await supabase
            .from('saharax_0u4w4d_vehicles')
            .update({ status: 'available' })
            .eq('id', rental.vehicle_id);
          
          if (vehicleError) {
            console.error('Failed to update vehicle status:', vehicleError);
          }
        }
        
        toast.success('Rental cancelled successfully!');
      } catch (err) {
        console.error('❌ Error:', err);
        toast.error('Failed to cancel rental. Please try again.');
      }
    }
  };

  const openImpoundModal = () => {
    setImpoundForm({
      reason: rental?.impound_reason || 'Police impound',
      note: rental?.impound_note || '',
      reference: rental?.impound_reference || '',
    });
    setShowImpoundModal(true);
  };

  const openReleaseImpoundModal = async () => {
    if (!rental?.id) return;

    try {
      setImpoundActionLoading(true);
      const snapshot = await resolveImpoundChargeSnapshot(
        rental,
        new Date().toISOString(),
        impoundChargeForm.discount
      );

      setWaiveImpoundExtraDailyCharge(false);
      const damageDepositHeld = Math.max(0, Number(rental?.damage_deposit || 0));
      const depositApplied = Math.min(damageDepositHeld, Math.max(0, Number(snapshot.total || 0)));
      const remainingToPrepare = Math.max(0, Math.max(0, Number(snapshot.total || 0)) - depositApplied);
      setReleaseImpoundExceededPreview({
        days: snapshot.days,
        hours: snapshot.hours,
        pricingLabel: snapshot.pricingLabel,
        estimatedTotal: Math.max(0, Number(snapshot.total || 0)),
        depositApplied,
        remainingToPrepare,
      });
      setReleaseImpoundChargePreset(snapshot.days >= 1 && snapshot.days <= 7 ? snapshot.days : null);
      setReleaseImpoundForm({
        days: snapshot.days,
        hours: snapshot.hours,
        rate: snapshot.rate,
        discount: snapshot.discount,
        impoundCharge: 0,
        calculatedTotal: snapshot.total,
        amountPaid: snapshot.total,
        pricingMode: snapshot.pricingMode,
        rateMode: snapshot.rateMode,
        pricingLabel: snapshot.pricingLabel,
        receiptUrl: rental?.impound_receipt_url || null,
        receiptName: rental?.impound_receipt_name || '',
        receiptPath: rental?.impound_receipt_path || null,
        receiptUploadedAt: rental?.impound_receipt_uploaded_at || null,
      });
      setShowReleaseImpoundModal(true);
    } catch (error) {
      console.error('❌ Error preparing impound release:', error);
      toast.error('Failed to prepare impound release.');
    } finally {
      setImpoundActionLoading(false);
    }
  };

  const isRetryableSchemaError = (error) => {
    const normalizedError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      normalizedError.includes('schema cache') ||
      normalizedError.includes('could not find the') ||
      normalizedError.includes('column') ||
      normalizedError.includes('pgrst')
    );
  };

  const getMissingColumnFromError = (error) => {
    const message = `${error?.message || ''}`;
    const match = message.match(/Could not find the '([^']+)' column/i);
    return match?.[1] || null;
  };

  const updateRentalWithSchemaFallback = async (payload) => {
    let nextPayload = { ...payload };

    while (true) {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(nextPayload)
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (!error) {
        return { data, error: null };
      }

      if (!isRetryableSchemaError(error)) {
        return { data: null, error };
      }

      const missingColumn = getMissingColumnFromError(error);
      if (!missingColumn || !(missingColumn in nextPayload)) {
        return { data: null, error };
      }

      const { [missingColumn]: _removed, ...rest } = nextPayload;
      nextPayload = rest;
    }
  };

  const handleImpoundReceiptUpload = async (file) => {
    if (!file || !rental?.id) return;

    try {
      setImpoundReceiptUploading(true);

      const uploadResult = await uploadFile(file, {
        bucket: 'rental-documents',
        pathPrefix: `impound-receipts/${rental.id}`,
        optimizationProfile: 'document',
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload impound receipt');
      }

      const { data, error } = await updateRentalWithSchemaFallback({
        impound_receipt_url: uploadResult.url,
        impound_receipt_name: file.name || 'Impound receipt',
        impound_receipt_path: uploadResult.path,
        impound_receipt_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setRental(data);
      toast.success('Impound receipt attached to this rental.');
    } catch (error) {
      console.error('❌ Error uploading impound receipt:', error);
      toast.error(error.message || 'Failed to upload impound receipt.');
    } finally {
      setImpoundReceiptUploading(false);
      if (impoundReceiptInputRef.current) impoundReceiptInputRef.current.value = '';
      if (impoundReceiptCameraInputRef.current) impoundReceiptCameraInputRef.current.value = '';
    }
  };

  const applyReleaseImpoundDayChargePreset = (days) => {
    setWaiveImpoundExtraDailyCharge(false);
    setReleaseImpoundChargePreset(days);
    setReleaseImpoundForm((current) => {
      const recalculated = calculateImpoundChargeTotal(
        days,
        0,
        current.rate,
        current.discount,
        rental?.rental_type,
        current.rateMode
      );

      return {
        ...current,
        days,
        hours: 0,
        calculatedTotal: recalculated,
        amountPaid: Math.max(0, recalculated + Math.max(0, Number(current.impoundCharge || 0))),
      };
    });
  };

  const handleReleaseImpoundReceiptUpload = async (file) => {
    if (!file || !rental?.id) return;

    try {
      setImpoundReceiptUploading(true);

      const uploadResult = await uploadFile(file, {
        bucket: 'rental-documents',
        pathPrefix: `impound-receipts/${rental.id}`,
        optimizationProfile: 'document',
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload impound receipt');
      }

      setReleaseImpoundForm((prev) => ({
        ...prev,
        receiptUrl: uploadResult.url,
        receiptName: file.name || 'Impound receipt',
        receiptPath: uploadResult.path,
        receiptUploadedAt: new Date().toISOString(),
      }));
      toast.success('Impound receipt ready to save with release.');
    } catch (error) {
      console.error('❌ Error uploading impound receipt:', error);
      toast.error(error.message || 'Failed to upload impound receipt.');
    } finally {
      setImpoundReceiptUploading(false);
      if (releaseImpoundReceiptInputRef.current) releaseImpoundReceiptInputRef.current.value = '';
      if (releaseImpoundReceiptCameraInputRef.current) releaseImpoundReceiptCameraInputRef.current.value = '';
    }
  };

  const markRentalImpounded = async () => {
    if (!rental?.id) return;

    try {
      setImpoundActionLoading(true);

      const nextVehicleStatus = 'impounded';
      if (rental?.vehicle_id || rental?.vehicle?.id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({
            status: nextVehicleStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rental?.vehicle_id || rental?.vehicle?.id);

        if (vehicleError) throw vehicleError;
      }

      const updatePayload = {
        is_impounded: true,
        rental_status: 'impounded',
        status: 'impounded',
        impounded_at: rental?.impounded_at || new Date().toISOString(),
        released_from_impound_at: null,
        impound_reason: impoundForm.reason.trim() || 'Police impound',
        impound_note: impoundForm.note.trim() || null,
        impound_reference: impoundForm.reference.trim() || null,
        impound_charge_hours: 0,
        impound_charge_days: 0,
        impound_rate: Math.max(0, Number(rental?.unit_price || 0)),
        impound_discount: 0,
        impound_total: 0,
        impound_charge_applied_at: null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updatePayload)
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (error) throw error;

      setRental(data);
      setShowImpoundModal(false);
      toast.success('Rental marked as impounded. Timer continues running.');
    } catch (error) {
      console.error('❌ Error marking rental impounded:', error);
      toast.error('Failed to mark rental as impounded.');
    } finally {
      setImpoundActionLoading(false);
    }
  };

  const saveImpoundChargeConfig = useCallback(async () => {
    if (!rental?.id) return;

    setSavingImpoundCharge(true);
    try {
      const nextTotal = rental?.released_from_impound_at
        ? Math.max(0, Number(impoundChargeForm.total || 0))
        : calculateImpoundChargeTotal(
            impoundChargeForm.days,
            impoundChargeForm.hours,
            impoundChargeForm.rate,
            impoundChargeForm.discount,
            rental.rental_type,
            impoundChargeForm.rateMode
          );

      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          impound_charge_days: impoundChargeForm.days,
          impound_charge_hours: impoundChargeForm.hours,
          impound_rate: impoundChargeForm.rate,
          impound_discount: impoundChargeForm.discount,
          impound_total: nextTotal,
          impound_charge_applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (error) throw error;

      setImpoundChargeForm((prev) => ({ ...prev, total: nextTotal }));
      setRental(data);
      toast.success('Estimate updated.');
    } catch (error) {
      console.error('❌ Error saving impound charge:', error);
      toast.error('Failed to save impound charge.');
    } finally {
      setSavingImpoundCharge(false);
    }
  }, [calculateImpoundChargeTotal, impoundChargeForm.days, impoundChargeForm.discount, impoundChargeForm.hours, impoundChargeForm.rate, impoundChargeForm.rateMode, impoundChargeForm.total, rental?.id, rental?.rental_type, rental?.released_from_impound_at]);

  const finalizeImpoundRelease = useCallback(async ({ waiveCharge = false, releaseOverride = null } = {}) => {
    if (!rental?.id) return;

    const releaseAt = new Date().toISOString();
    const snapshot = waiveCharge
      ? {
          days: 0,
          hours: 0,
          rate: 0,
          discount: 0,
          manualCharge: 0,
          total: 0,
          amountPaid: 0,
          discountedByUs: Math.max(0, Number(releaseImpoundExceededPreview.remainingToPrepare || 0)),
          pricingMode: rental?.rental_type === 'daily' ? 'daily' : 'hourly',
          rateMode: 'package',
          pricingLabel: '',
        }
      : releaseOverride || await resolveImpoundChargeSnapshot(rental, releaseAt, impoundChargeForm.discount);

    try {
      setImpoundActionLoading(true);

      const nextVehicleStatus = 'available';
      if (rental?.vehicle_id || rental?.vehicle?.id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({
            status: nextVehicleStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rental?.vehicle_id || rental?.vehicle?.id);

        if (vehicleError) throw vehicleError;
      }

      const { data, error } = await updateRentalWithSchemaFallback({
        is_impounded: false,
        rental_status: rental?.started_at ? 'active' : 'scheduled',
        status: rental?.started_at ? 'active' : 'scheduled',
        released_from_impound_at: releaseAt,
        impound_charge_days: snapshot.days,
        impound_charge_hours: snapshot.hours,
        impound_rate: snapshot.rate,
        impound_manual_charge: waiveCharge ? 0 : Math.max(0, Number(snapshot.manualCharge || 0)),
        impound_discount: waiveCharge
          ? 0
          : Math.max(0, Number(snapshot.discountedByUs ?? snapshot.discount ?? 0)),
        impound_total: snapshot.total,
        impound_charge_applied_at: waiveCharge ? null : releaseAt,
        impound_receipt_url: waiveCharge ? null : (snapshot.receiptUrl || rental?.impound_receipt_url || null),
        impound_receipt_name: waiveCharge ? null : (snapshot.receiptName || rental?.impound_receipt_name || null),
        impound_receipt_path: waiveCharge ? null : (snapshot.receiptPath || rental?.impound_receipt_path || null),
        impound_receipt_uploaded_at: waiveCharge ? null : (snapshot.receiptUploadedAt || rental?.impound_receipt_uploaded_at || null),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setImpoundChargeForm({
        days: snapshot.days,
        hours: snapshot.hours,
        rate: snapshot.rate,
        discount: waiveCharge
          ? 0
          : Math.max(0, Number(snapshot.discountedByUs ?? snapshot.discount ?? 0)),
        total: snapshot.total,
        pricingMode: snapshot.pricingMode,
        rateMode: snapshot.rateMode,
        pricingLabel: snapshot.pricingLabel,
      });
      setRental(data);
      setShowReleaseImpoundModal(false);

      if (waiveCharge) {
        toast.success('Impound cancelled. No additional rental amount applied.');
      } else if (snapshot.total > 0) {
        toast.success(`Impound released. Additional rental amount applied: ${formatCurrency(snapshot.total)} MAD.`);
      } else {
        toast.success('Impound released. No additional rental amount applied.');
      }
    } catch (error) {
      console.error('❌ Error releasing rental impound:', error);
      toast.error('Failed to release rental from impound.');
    } finally {
      setImpoundActionLoading(false);
    }
  }, [impoundChargeForm.discount, releaseImpoundExceededPreview.remainingToPrepare, rental, resolveImpoundChargeSnapshot]);

  const releaseRentalImpound = async () => {
    if (!rental?.id) return;
    try {
      setReleaseImpoundSubmitting(true);
      if (waiveImpoundExtraDailyCharge) {
        await finalizeImpoundRelease({ waiveCharge: true });
        return;
      }
      await finalizeImpoundRelease({
        waiveCharge: false,
        releaseOverride: {
          days: releaseImpoundForm.days,
          hours: releaseImpoundForm.hours,
          rate: releaseImpoundForm.rate,
          discount: releaseImpoundForm.discount,
          manualCharge: Math.max(0, Number(releaseImpoundForm.impoundCharge || 0)),
          discountedByUs: releaseImpoundDiscountedByUs,
          amountPaid: Math.max(0, Number(releaseImpoundForm.amountPaid || 0)),
          total: Math.max(0, Number(releaseImpoundForm.amountPaid || 0)),
          pricingMode: releaseImpoundForm.pricingMode,
          pricingLabel: releaseImpoundForm.pricingLabel,
          rateMode: releaseImpoundForm.rateMode,
          receiptUrl: releaseImpoundForm.receiptUrl,
          receiptName: releaseImpoundForm.receiptName,
          receiptPath: releaseImpoundForm.receiptPath,
          receiptUploadedAt: releaseImpoundForm.receiptUploadedAt || new Date().toISOString(),
        },
      });
    } finally {
      setReleaseImpoundSubmitting(false);
    }
  };

  const cancelRentalImpound = async () => {
    if (!rental?.id) return;
    if (!window.confirm('Cancel this impound with no extra impound charge?')) {
      return;
    }
    await finalizeImpoundRelease({ waiveCharge: true });
  };

  const handleViewCustomerDetails = (customerId) => {
    setCustomerDetailsDrawer({
      isOpen: true,
      customerId: customerId,
      rental: rental,
      secondDrivers: [],
      viewMode: 'customer'
    });
  };

  const handleViewAdditionalDrivers = () => {
    setCustomerDetailsDrawer({
      isOpen: true,
      customerId: rental?.customer_id || null,
      rental: rental,
      secondDrivers: secondDriversList,
      viewMode: 'drivers'
    });
  };

  const handleEditPrice = () => {
    setManualPrice(rental.total_amount?.toString() || '');
    setPriceOverrideReason('');
    setIsEditingPrice(true);
  };

  const handleCancelEditPrice = () => {
    setIsEditingPrice(false);
    setManualPrice('');
    setPriceOverrideReason('');
  };

  const handleSaveManualPrice = async () => {
  if (RENTAL_DEBUG) {
    if (RENTAL_DEBUG) console.log('🎯 handleSaveManualPrice TRIGGERED!');
    if (RENTAL_DEBUG) console.log('manualPrice:', manualPrice);
    if (RENTAL_DEBUG) console.log('rental.id:', rental?.id);
  }
  
  if (!manualPrice || parseFloat(manualPrice) <= 0) {
    toast.error('Please enter a valid price amount.');
    return;
  }

  setIsSavingPrice(true);
  try {
    const newPrice = parseFloat(manualPrice);
    const actingUser = resolvedCurrentUser || currentUser;
    const canApplyPriceDirectly =
      canApprovePriceOverrides(actingUser) ||
      canEditRentalPriceWithoutApproval(actingUser);
    const currentPaidAmount = Math.max(0, parseFloat(rental.deposit_amount || 0) || 0);
    const currentPaymentStatus = String(rental.payment_status || '').toLowerCase();
    const isAlreadyPaid = currentPaymentStatus === 'paid';
    const activeDuration = Math.max(
      1,
      Number(
        rental.rental_type === 'hourly'
          ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
          : (rental.quantity_days ?? 1)
      ) || 1
    );
    const derivedUnitPrice = Number((newPrice / activeDuration).toFixed(2));

    let updateData = {
      updated_at: new Date().toISOString()
    };

    if (canApplyPriceDirectly) {
      const previousPrice = Math.max(0, parseFloat(rental.total_amount || rental.unit_price || 0) || 0);
      const overrideMeta = buildPriceOverrideMeta({
        note: priceOverrideReason || '',
        currentUser: actingUser,
        previousPrice,
        newPrice,
      });
      updateData.total_amount = newPrice;
      updateData.unit_price = derivedUnitPrice;
      updateData.approval_status = 'auto';
      updateData.pending_total_request = null;
      updateData.price_override_reason = JSON.stringify(overrideMeta);
      if (isAlreadyPaid) {
        updateData.deposit_amount = newPrice;
        updateData.remaining_amount = 0;
        updateData.payment_status = 'paid';
      } else {
        updateData.remaining_amount = Math.max(0, newPrice - currentPaidAmount);
      }
    } else {
      updateData.approval_status = 'pending';
      updateData.pending_total_request = newPrice;
      updateData.price_override_reason = priceOverrideReason || null;
    }

    if (RENTAL_DEBUG) console.log('📝 Updating rental with data:', updateData);
    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update(updateData)
      .eq('id', rental.id);

    if (updateError) {
      console.error('❌ Database update failed:', updateError);
      throw updateError;
    }
    if (RENTAL_DEBUG) console.log('✅ Database update successful');

    const { data, error: fetchError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('*')
      .eq('id', rental.id)
      .single();

    if (fetchError) {
      console.error('❌ Fetch after update failed:', fetchError);
      throw fetchError;
    }
    if (RENTAL_DEBUG) console.log('✅ Fetched updated rental:', data);

    if (canApplyPriceDirectly) {
      await recordRentalContractPriceEditActivity({
        rental,
        currentUser: actingUser,
        overrideMeta: buildPriceOverrideMeta({
          note: priceOverrideReason || '',
          currentUser: actingUser,
          previousPrice: Math.max(0, parseFloat(rental.total_amount || rental.unit_price || 0) || 0),
          newPrice,
        }),
      });
    }

    setRental(data);
    setIsEditingPrice(false);
    setManualPrice('');
    setPriceOverrideReason('');
    
    if (canApplyPriceDirectly) {
      toast.success('Price updated successfully!');
    } else {
      toast.success('Price override request submitted for admin approval.');
      // ❌ REMOVED: No auto WhatsApp notification
    }
  } catch (err) {
    console.error('❌ Error saving price:', err);
    toast.error(`Failed to save price. Error: ${err.message}`);
  } finally {
    setIsSavingPrice(false);
  }
};

  const handleApprovePrice = async () => {
    if (!rental.pending_total_request) {
      toast.error('No pending price request found.');
      return;
    }

    if (!confirm(`Approve manual price of ${rental.pending_total_request} MAD?`)) {
      return;
    }

    try {
      const newPrice = parseFloat(rental.pending_total_request);
      const previousPrice = Math.max(0, parseFloat(rental.total_amount || rental.unit_price || 0) || 0);
      const overrideMeta = buildPriceOverrideMeta({
        note: typeof rental.price_override_reason === 'string' ? rental.price_override_reason : '',
        currentUser,
        previousPrice,
        newPrice,
      });
      // Step 1: Update the rental
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          total_amount: newPrice,
          remaining_amount: Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0)),
          approval_status: 'approved',
          pending_total_request: null,
          price_override_reason: JSON.stringify(overrideMeta),
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Step 2: Fetch the updated rental with relations
      const { data: updatedRental, error: fetchError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          ),
          package:app_4c3a7a6153_rental_km_packages!package_id(*)
        `)
        .eq('id', rental.id)
        .single();

      if (fetchError) throw fetchError;

      await recordRentalContractPriceEditActivity({
        rental,
        currentUser,
        overrideMeta,
      });

      setRental(updatedRental);
      toast.success('Price override approved!');
    } catch (err) {
      console.error('❌ Error approving price:', err);
      toast.error(`Failed to approve price. Error: ${err.message}`);
    }
  };

  const handleDeclinePrice = async () => {
    if (!rental.pending_total_request) {
      toast.error('No pending price request found.');
      return;
    }

    if (!confirm('Decline this price override request? The price will be recalculated automatically.')) {
      return;
    }

    try {
      let autoCalculatedPrice = rental.total_amount;
      
      if (rental.vehicle?.id && rental.rental_start_date && rental.rental_end_date) {
        try {
          const priceResult = await PricingRulesService.calculatePrice(
            rental.vehicle.id,
            rental.rental_start_date,
            rental.rental_end_date,
            rental.rental_type || 'daily'
          );
          if (priceResult.price > 0) {
            autoCalculatedPrice = priceResult.price;
          }
        } catch (calcError) {
          console.warn('⚠️ Could not recalculate price:', calcError);
        }
      }

      // Step 1: Update the rental
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          total_amount: autoCalculatedPrice,
          remaining_amount: Math.max(0, autoCalculatedPrice - (parseFloat(rental.deposit_amount) || 0)),
          approval_status: 'declined',
          pending_total_request: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Step 2: Fetch the updated rental with relations
      const { data: updatedRental, error: fetchError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          ),
          package:app_4c3a7a6153_rental_km_packages!package_id(*)
        `)
        .eq('id', rental.id)
        .single();

      if (fetchError) throw fetchError;

      setRental(updatedRental);
      toast.success('Price override declined. Price recalculated to auto rate.');
    } catch (err) {
      console.error('❌ Error declining price:', err);
      toast.error(`Failed to decline price. Error: ${err.message}`);
    }
  };

  const handleVideoUpdate = () => {
    if (RENTAL_DEBUG) console.log('🔄 Video update triggered, refreshing media...');
    loadRentalMedia(rental.id);
    setVideoRefreshKey(prev => prev + 1);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // ============================================
  // 🔧 FIX: Memoized base amount calculation to prevent re-render loops
  // Must be declared before any early returns to satisfy React hooks rules
  // ============================================
  const correctedBaseAmount = useMemo(() => {
    if (!rental) return 0;
    
    // For hourly rentals: use quantity_hours, fallback to quantity_days, then default 1
    if (rental.rental_type === 'hourly') {
      const hours = rental.quantity_hours ?? rental.quantity_days ?? 1;
      return hours * (rental.unit_price || 0);
    }
    
    // For daily rentals: use quantity_days
    if (rental.rental_type === 'daily') {
      const days = rental.quantity_days ?? 1;
      return days * (rental.unit_price || 0);
    }
    
    return (rental.unit_price || 0) * (rental.quantity_days || 1);
  }, [rental?.rental_type, rental?.quantity_hours, rental?.quantity_days, rental?.unit_price]);

  // Wrapper function for backward compatibility with existing callers
  const getCorrectedBaseAmount = useCallback(() => correctedBaseAmount, [correctedBaseAmount]);

  useEffect(() => {
    if (rentalBillingSummary.hasAutoDepositSeizure) {
      setDeductFromDeposit(true);
    }
  }, [rentalBillingSummary.hasAutoDepositSeizure]);

  useEffect(() => {
    let active = true;
    const hasManualPriceOverride = ['approved', 'auto'].includes(String(rental?.approval_status || '').toLowerCase());
    const inlinePriceOverrideMeta = parsePriceOverrideMeta(rental?.price_override_reason);

    const loadPriceOverrideAuditMeta = async () => {
      if (!rental?.id || !hasManualPriceOverride || inlinePriceOverrideMeta) {
        if (active) setPriceOverrideAuditMeta(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('saharax_0u4w4d_activity_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          if (!isActivityLogPermissionError(error)) {
            console.warn('⚠️ Failed to load rental contract price audit log:', error);
          }
          if (active) setPriceOverrideAuditMeta(null);
          return;
        }

        const latestLog = Array.isArray(data)
          ? data.find((log) => {
              const logAction = String(log?.action || log?.title || log?.action_type || '');
              return logAction === 'rental_contract_price_edited' && activityLogMatchesRental(log, rental.id);
            }) || null
          : null;
        const meta = latestLog?.details || null;

        if (active && meta) {
          setPriceOverrideAuditMeta({
            note: meta.override_note || '',
            editedById: meta.edited_by_id || null,
            editedByName: meta.edited_by_name || latestLog?.created_by || null,
            previousPrice: Number(meta.previous_price || 0) || 0,
            newPrice: Number(meta.new_price || rental?.total_amount || 0) || 0,
            editedAt: meta.edited_at || latestLog?.created_at || null,
          });
        } else if (active) {
          setPriceOverrideAuditMeta(null);
        }
      } catch (auditError) {
        if (!isActivityLogPermissionError(auditError)) {
          console.warn('⚠️ Failed to load rental contract price audit log:', auditError);
        }
        if (active) setPriceOverrideAuditMeta(null);
      }
    };

    loadPriceOverrideAuditMeta();
    return () => {
      active = false;
    };
  }, [rental?.id, rental?.total_amount, rental?.approval_status, rental?.price_override_reason]);

  useEffect(() => {
    let active = true;

    const loadSecurityHoldAuditMeta = async () => {
      if (!rental?.id) {
        if (active) setSecurityHoldAuditMeta(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('saharax_0u4w4d_activity_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          if (!isActivityLogPermissionError(error)) {
            console.warn('⚠️ Failed to load rental security hold audit log:', error);
          }
          if (active) setSecurityHoldAuditMeta(null);
          return;
        }

        const latestLog = Array.isArray(data)
          ? data.find((log) => {
              const logAction = String(log?.action || log?.title || log?.action_type || '');
              return ['rental_security_hold_updated', 'rental_security_hold_cleared'].includes(logAction) && activityLogMatchesRental(log, rental.id);
            }) || null
          : null;
        const meta = latestLog?.details || null;

        if (active && meta && latestLog?.action !== 'rental_security_hold_cleared') {
          setSecurityHoldAuditMeta({
            amount: Number(meta.amount || rental?.damage_deposit_received_amount || 0) || 0,
            method: meta.method || null,
            updatedAt: meta.updated_at || latestLog?.created_at || null,
            updatedByName: meta.updated_by_name || latestLog?.user_name || null,
          });
        } else if (active) {
          setSecurityHoldAuditMeta(null);
        }
      } catch (auditError) {
        if (!isActivityLogPermissionError(auditError)) {
          console.warn('⚠️ Failed to load rental security hold audit log:', auditError);
        }
        if (active) setSecurityHoldAuditMeta(null);
      }
    };

    loadSecurityHoldAuditMeta();
    return () => {
      active = false;
    };
  }, [rental?.id, rental?.damage_deposit_received_amount, rental?.damage_deposit_received_at]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminModuleHero
          className="w-full"
          eyebrow={tr('Rental Details', 'Détails de location')}
          title={tr('Rental Management', 'Gestion des locations')}
          description={tr(
            'Review rental status, customer details, vehicle condition, payment, and operational steps from one place.',
            'Consultez le statut de la location, les détails client, l’état du véhicule, le paiement et les étapes opérationnelles depuis un seul endroit.'
          )}
        />

        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 text-4xl animate-spin">⏳</div>
              <p className="text-base font-medium text-slate-700">
                {tr('Loading rental details...', 'Chargement des détails de la location...')}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {tr('Preparing customer, vehicle, and payment data.', 'Préparation des données client, véhicule et paiement.')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ FIXED: Calculate rental base amount correctly for hourly rentals
  const calculateRentalBaseAmount = () => {
    if (!rental) return 0;
    
    // For hourly rentals - use tier pricing breakdown if available
    if (rental.rental_type === 'hourly') {
      // Priority 1: Use tier pricing breakdown if calculated (most accurate)
      if (tierPricingBreakdown?.tierTotal) {
        return tierPricingBreakdown.tierTotal;
      }
      
      const calculatedAmount = getBaseRentalAmountExcludingExtensions();
      
      if (RENTAL_DEBUG) console.log('💰 Calculated from base duration:', {
        storedTotalAmount: rental.total_amount,
        totalExtensionFees,
        calculatedAmount,
        note: 'Using stored total less approved extensions'
      });
      return calculatedAmount;
    }
    
    return getBaseRentalAmountExcludingExtensions();
  };









  // Calculate tier breakdown
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="text-center">
        <p className="text-red-500 text-lg font-semibold mb-2">⚠️ {error}</p>
        <p className="text-gray-500 text-sm mb-4">{tr('This may be due to too many requests. Please wait a moment and try again.', 'Cela peut être dû à un trop grand nombre de requêtes. Veuillez patienter un instant puis réessayer.')}</p>
        <Button
          onClick={() => {
            setError(null);
            setLoading(true);
            loadRentalData(true).finally(() => setLoading(false));
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          🔄 {tr('Retry', 'Réessayer')}
        </Button>
      </div>
    </div>
  );

  // Button state logic


  // Keep document actions available for scheduled rentals too.
  // The templates already handle unsigned/unpaid states by rendering
  // contract previews and estimate receipts instead of blocking desktop users.
  const canSendContract = Boolean(rental?.id);
  const canSendReceipt = Boolean(rental?.id);
  const canSendBoth = Boolean(rental?.id && syncedCustomerPhone);

  if (!rental) return <div className="flex items-center justify-center min-h-screen"><p>{tr('Rental not found', 'Location introuvable')}</p></div>;

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'impounded': return 'bg-amber-100 text-amber-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'expired': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const normalizedLifecycleRental = normalizeRentalLifecycleStatus(rental);
  const rawDerivedRentalStatus = String(normalizedLifecycleRental?.rental_status || '').toLowerCase();
  const hasHistoricalImpoundStatus = Boolean(
    rental?.is_impounded ||
    rental?.impounded_at ||
    rental?.released_from_impound_at
  );
  const operationalRentalStatus = rawDerivedRentalStatus || 'scheduled';
  const displayRentalStatus = hasHistoricalImpoundStatus ? 'impounded' : operationalRentalStatus;

  const isActive = operationalRentalStatus === 'active';
  const isScheduled = operationalRentalStatus === 'scheduled';
  const isCompleted = operationalRentalStatus === 'completed';
  const isImpounded = Boolean(rental?.is_impounded);
  const hasImpoundRecord = hasHistoricalImpoundStatus;
  const displayedStartingOdometer = resolveDisplayedStartingOdometer(rental, startOdometer);
  const hasImpoundChargeHistory = Boolean(
    hasImpoundRecord && (
      rental?.impounded_at ||
      rental?.released_from_impound_at ||
      Number(rental?.impound_total || 0) > 0 ||
      Number(rental?.impound_charge_hours || 0) > 0 ||
      Number(rental?.impound_charge_days || 0) > 0
    )
  );
  const hasHeldSecurityDocument = Boolean(
    rental?.damage_deposit_document_url ||
    rental?.damage_deposit_document_name ||
    String(rental?.damage_deposit_source || '').toLowerCase() === 'document'
  );
  const hasMonetaryDamageDeposit = Math.max(0, Number(rental?.damage_deposit || 0)) > 0;
  const requiredSecurityAmount = Math.max(0, Number(rental?.damage_deposit || 0));
  const receivedSecurityAmount = Math.max(0, Number(rental?.damage_deposit_received_amount || 0));
  const showSecurityHoldSection = hasHeldSecurityDocument || hasMonetaryDamageDeposit || receivedSecurityAmount > 0;
  const isDocumentDeposit = hasHeldSecurityDocument && !hasMonetaryDamageDeposit;
  const persistedSecurityHoldMethod = ['cash', 'bank_transfer'].includes(String(rental?.damage_deposit_source || '').toLowerCase())
    ? String(rental?.damage_deposit_source || '').toLowerCase()
    : null;
  const securityHoldReceivedMethod = securityHoldAuditMeta?.method || persistedSecurityHoldMethod || null;
  const securityHoldMethodLabel = securityHoldReceivedMethod === 'bank_transfer'
    ? tr('Bank transfer', 'Virement bancaire')
    : securityHoldReceivedMethod === 'cash'
      ? tr('Cash', 'Espèces')
      : tr('Not recorded', 'Non enregistré');
  const hasRecordedSecurityPayment = receivedSecurityAmount > 0 && Boolean(securityHoldReceivedMethod);
  const showSecurityHoldEditor = !hasRecordedSecurityPayment || isEditingSecurityHold;
  const securityHoldStatus = (() => {
    if (hasHeldSecurityDocument) {
      return {
        label: tr('Secured', 'Garantie sécurisée'),
        className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        helper: tr('A physical security document is being held.', 'Un document physique de garantie est retenu.'),
      };
    }

    if (requiredSecurityAmount <= 0 && receivedSecurityAmount <= 0) {
      return {
        label: tr('No Security Required', 'Aucune garantie requise'),
        className: 'border border-slate-200 bg-slate-50 text-slate-600',
        helper: tr('No monetary security or document is currently required.', 'Aucune garantie monétaire ou documentaire n’est actuellement requise.'),
      };
    }

    if (requiredSecurityAmount > 0 && receivedSecurityAmount >= requiredSecurityAmount) {
      return {
        label: tr('Secured', 'Garantie sécurisée'),
        className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        helper: tr('The full required security hold has been received.', 'La garantie requise a été reçue en totalité.'),
      };
    }

    if (receivedSecurityAmount > 0) {
      return {
        label: tr('Partially Secured', 'Garantie partielle'),
        className: 'border border-amber-200 bg-amber-50 text-amber-700',
        helper: tr('A partial security hold was received. This does not block the rental start.', 'Une garantie partielle a été reçue. Cela ne bloque pas le démarrage de la location.'),
      };
    }

    return {
      label: tr('Not Secured', 'Garantie non reçue'),
      className: 'border border-rose-200 bg-rose-50 text-rose-700',
      helper: tr('No security payment or document has been recorded yet. This remains optional.', 'Aucun paiement de garantie ou document n’a encore été enregistré. Cela reste optionnel.'),
    };
  })();
  const openSignatureFlow = () => {
    if (
      requiredSecurityAmount > 0 &&
      receivedSecurityAmount <= 0 &&
      !securityHoldReceivedMethod
    ) {
      setSecurityHoldAmountInput((prev) => prev || String(requiredSecurityAmount));
      setShowSecurityHoldReminderModal(true);
      return;
    }

    setIsSigning(true);
  };

  const handleSecurityHoldReminderAction = async (method = null) => {
    if (!method) {
      setShowSecurityHoldReminderModal(false);
      setIsSigning(true);
      return;
    }

    const amountToSave = Math.max(
      0,
      Number(securityHoldAmountInput || requiredSecurityAmount || 0)
    );

    await handleSaveSecurityHold(amountToSave, method);
    setShowSecurityHoldReminderModal(false);
    setIsSigning(true);
  };
  const liveImpoundDisplay = impoundChargeForm;
  const weekendImpoundEstimate = isImpounded && impoundEstimatePreview?.weekendCarry ? impoundEstimatePreview : null;
  const liveImpoundAmount = Math.max(0, Number(liveImpoundDisplay?.total || 0));
  const liveImpoundDays = Math.max(0, Number(liveImpoundDisplay?.days || 0));
  const totalEstimatedImpoundDays = Math.max(liveImpoundDays, Number(weekendImpoundEstimate?.days || 0));
  const weekendEstimatedExtraDays = waiveImpoundExtraDailyCharge ? 0 : Math.max(0, totalEstimatedImpoundDays - liveImpoundDays);
  const weekendEstimatedDailyRate = Math.max(0, Number(weekendImpoundEstimate?.rate || 0));
  const weekendEstimatedExtraAmount = waiveImpoundExtraDailyCharge
    ? 0
    : rental?.rental_type === 'daily'
    ? weekendEstimatedExtraDays * weekendEstimatedDailyRate
    : Math.max(0, Number(weekendImpoundEstimate?.total || 0) - liveImpoundAmount);
  const estimatedTotalByMonday = liveImpoundAmount + weekendEstimatedExtraAmount;
  const estimatedDepositAppliedForImpound = Math.min(rentalBillingSummary.damageDepositHeld, estimatedTotalByMonday);
  const estimatedRemainingToPrepare = Math.max(0, estimatedTotalByMonday - rentalBillingSummary.damageDepositHeld);
  const selectedReleaseImpoundBaseCharge = waiveImpoundExtraDailyCharge ? 0 : Math.max(0, Number(releaseImpoundForm.calculatedTotal || 0));
  const selectedReleaseImpoundManualCharge = waiveImpoundExtraDailyCharge ? 0 : Math.max(0, Number(releaseImpoundForm.impoundCharge || 0));
  const selectedReleaseImpoundChargeTotal = waiveImpoundExtraDailyCharge
    ? 0
    : Math.max(0, selectedReleaseImpoundBaseCharge + selectedReleaseImpoundManualCharge);
  const releaseImpoundDiscountedByUs = Math.max(
    0,
    Math.max(0, Number(releaseImpoundExceededPreview.remainingToPrepare || 0)) -
      Math.max(0, Number(releaseImpoundForm.amountPaid || 0))
  );
  const weekendEstimateMessage = waiveImpoundExtraDailyCharge
      ? tr(
          'No extra daily charge approved. Extra impound rental charge has been waived for this estimate.',
          'Aucun supplément journalier approuvé. Le supplément de location lié à la fourrière est annulé pour cette estimation.'
        )
    : weekendImpoundEstimate
      ? `Weekend estimate assumes the vehicle remains held until Monday before release can happen. This adds ${weekendEstimatedExtraDays} more rental day${weekendEstimatedExtraDays === 1 ? '' : 's'} beyond the live charge already running.`
      : null;
  const isLikelyUuid = (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const createdByDisplay = rental?.created_by_name
    || (rental?.created_by && !isLikelyUuid(rental.created_by) ? rental.created_by : null)
    || 'Not recorded';
  const signedByDisplay = rental?.contract_signed_by_name
    || (rental?.contract_signed_by && !isLikelyUuid(rental.contract_signed_by) ? rental.contract_signed_by : null)
    || null;
  const startedByDisplay = rental?.started_by_name
    || (rental?.started_by && !isLikelyUuid(rental.started_by) ? rental.started_by : null)
    || null;
  const rentalElapsedTone = isActive ? getRentalElapsedTone(rental, currentTimeRef.current) : null;
  const maintenanceChargeLocked = isCompleted;
  const impoundChargeLocked = isCompleted;
  const hasOpeningVideo = openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview;
  const hasOdometerReading = !!rental.start_odometer;
  const hasStartFuelRecorded = startFuelLevel !== null || rental?.start_fuel_level !== null;
  const hasSecondDriver = (rental?.second_drivers && rental?.second_drivers.length > 0) || 
    rental?.second_driver_name || rental?.second_driver_license || rental?.second_driver_id_image;

  // Helper function to get second drivers with backwards compatibility
// ✅ FIXED: Helper function to get second drivers
  const getSecondDrivers = (rentalData) => {
    // Check if second_drivers exists and is an array
    if (rentalData?.second_drivers && Array.isArray(rentalData.second_drivers)) {
      return rentalData.second_drivers.filter(driver => 
        driver && (driver.full_name || driver.name || driver.licence_number)
      );
    }
    
    // Fallback: Check if there's a second_driver object (singular)
    if (rentalData?.second_driver && typeof rentalData.second_driver === 'object') {
      return [rentalData.second_driver];
    }
    
    // Fallback to legacy columns
    if (rentalData?.second_driver_name) {
      return [{
        id: `legacy_${rentalData.id}`,
        full_name: rentalData.second_driver_name,
        licence_number: rentalData.second_driver_license || rentalData.second_driver_licence_number,
        id_number: rentalData.second_driver_id_number,
        date_of_birth: rentalData.second_driver_dob,
        nationality: rentalData.second_driver_nationality,
        id_scan_url: rentalData.second_driver_id_image,
        is_legacy: true
      }];
    }
    
    return [];
  };

  const getSecondDriverImageUrl = (driver) => {
    if (!driver) return null;
    return driver.id_scan_url || driver.customer_id_image || driver.id_image || null;
  };

  
  const secondDriversList = getSecondDrivers(rental);
  const resolvedCurrentUser =
    currentUser ||
    (userProfile
      ? {
          ...userProfile,
          full_name: userProfile.full_name || userProfile.fullName || userProfile.email,
        }
      : null);
  const isPendingApproval = rental.approval_status === 'pending';
  const hasAppliedManualPriceOverride = ['approved', 'auto'].includes(String(rental?.approval_status || '').toLowerCase());
  const isAdmin = canApproveRentalExtensions(resolvedCurrentUser);
  const canEditExtensionEntries = canEditExtensionHistory(resolvedCurrentUser);
  const canCancelImpound = ['owner', 'admin'].includes(resolvedCurrentUser?.role);
  const canEditImpoundDiscount = ['owner', 'admin', 'employee'].includes(resolvedCurrentUser?.role);
  const currentUserRole = String(resolvedCurrentUser?.role || '').toLowerCase();
  const canEditRentalPriceOverride = canEditRentalPrice(resolvedCurrentUser);
  const rentalStatusLower = String(rental?.rental_status || '').toLowerCase();
  const canEditLifecycleRentalPrice =
    (currentUserRole === 'owner' || canEditRentalPriceOverride) &&
    ['active', 'completed'].includes(rentalStatusLower);
  const currentWorkflowPresenceKey = `${resolvedCurrentUser?.id || resolvedCurrentUser?.email || `anon-${id || 'rental'}`}::${workflowClientSessionKey}`;
  const canManageScheduledRental =
    isScheduled &&
    (
      currentUserRole === 'owner' ||
      canEditRentalContract(resolvedCurrentUser)
    );
  const canDeleteScheduledRental = isScheduled && ['owner', 'admin'].includes(resolvedCurrentUser?.role);
  const priceOverrideMeta = parsePriceOverrideMeta(rental?.price_override_reason);
  const effectivePriceOverrideMeta = priceOverrideMeta || priceOverrideAuditMeta;
  const rawPriceOverrideReason =
    typeof rental?.price_override_reason === 'string' ? rental.price_override_reason.trim() : '';
  const priceOverrideNoteText =
    effectivePriceOverrideMeta?.note ||
    (rawPriceOverrideReason && !rawPriceOverrideReason.startsWith('{') && !rawPriceOverrideReason.startsWith('[')
      ? rawPriceOverrideReason
      : '');

  const hasCustomerVerificationIdentity = Boolean(
    String(rental?.customer_licence_number || '').trim() ||
    String(rental?.customer_id_number || '').trim()
  );
  const hasCustomerVerificationMedia = Boolean(
    rental?.customer_id_image ||
    rental?.id_scan_url ||
    (Array.isArray(rental?.customer_uploaded_images) && rental.customer_uploaded_images.length > 0)
  );
  const hasCustomerVerification = hasCustomerVerificationIdentity && hasCustomerVerificationMedia;
  const customerVerificationMethod = hasCustomerVerification
    ? rental?.id_scan_url
      ? 'id_scan'
      : 'manual_verification'
    : null;
  const customerVerificationMethodLabel = customerVerificationMethod === 'id_scan'
    ? tr('Verified from ID scan', "Vérifié par scan d'identité")
    : customerVerificationMethod === 'manual_verification'
      ? tr('Verified manually', 'Vérifié manuellement')
      : null;
  const startWorkflowSteps = [
    {
      key: 'customer_verification',
      label: tr('Customer Verification', 'Vérification client'),
      complete: hasCustomerVerification,
      method: customerVerificationMethod,
    },
    {
      key: 'opening_media',
      label: tr('Vehicle Inspection', 'Inspection véhicule'),
      complete: hasOpeningVideo,
    },
    {
      key: 'start_odometer',
      label: tr('Starting Odometer', 'Kilométrage de départ'),
      complete: hasOdometerReading,
    },
    {
      key: 'payment',
      label: tr('Payment', 'Paiement'),
      complete: isPaymentSufficient(),
    },
    {
      key: 'start_fuel',
      label: tr('Starting Fuel', 'Carburant de départ'),
      complete: hasStartFuelRecorded,
    },
    {
      key: 'contract_signature',
      label: tr('Contract Signature', 'Signature du contrat'),
      complete: Boolean(rental?.contract_signed || rental?.signature_url),
    },
  ];
  const startWorkflowStepMap = Object.fromEntries(
    startWorkflowSteps.map((step) => [step.key, step])
  );
  const nextStartWorkflowStep = startWorkflowSteps.find((step) => !step.complete) || null;
  const startWorkflowNextStepHint = (() => {
    switch (nextStartWorkflowStep?.key) {
      case 'customer_verification':
        return tr('Customer verification is required before contract start.', 'La vérification du client est obligatoire avant le démarrage du contrat.');
      case 'opening_media':
        return tr('Opening media is still required.', "Les médias d'ouverture sont encore requis.");
      case 'start_odometer':
        return tr('Starting odometer reading is still required.', 'Le kilométrage de départ est encore requis.');
      case 'payment':
        return tr('Payment is still required.', 'Le paiement est encore requis.');
      case 'start_fuel':
        return tr('Starting fuel level is still required.', 'Le niveau de carburant de départ est encore requis.');
      case 'contract_signature':
        return tr('Customer signature is still required.', 'La signature du client est encore requise.');
      default:
        return tr('Requirements not met', 'Conditions non remplies');
    }
  })();
  const activeStartWorkflowActors = startWorkflowPresence.filter(
    (actor) => actor?.userId !== resolvedCurrentUser?.id && actor?.presenceKey !== currentWorkflowPresenceKey
  );
  const primaryStartWorkflowActor = activeStartWorkflowActors[0] || null;
  const isStartWorkflowSoftLocked =
    isScheduled &&
    !isActive &&
    !isCompleted &&
    Boolean(primaryStartWorkflowActor) &&
    !startWorkflowTakeover;
  const startWorkflowHandlerName = primaryStartWorkflowActor?.name || tr('Another staff member', 'Un autre membre du personnel');
  const startWorkflowLockTitle = tr(
    `${startWorkflowHandlerName} is currently handling the start workflow.`,
    `${startWorkflowHandlerName} gère actuellement le démarrage.`
  );
  const finishWorkflowStepsModel = [
    {
      key: 'closing_inspection',
      label: tr('Closing Inspection', 'Inspection de retour'),
      complete: closingInspectionStepComplete,
    },
    {
      key: 'end_odometer',
      label: tr('Ending Odometer', 'Kilométrage de retour'),
      complete: finishRentalSteps.endOdometerComplete,
    },
    {
      key: 'end_fuel',
      label: tr('Fuel Level', 'Niveau de carburant'),
      complete: finishRentalSteps.endFuelComplete,
    },
  ];
  const finishWorkflowStepMap = Object.fromEntries(
    finishWorkflowStepsModel.map((step) => [step.key, step])
  );
  const nextFinishWorkflowStep = finishWorkflowStepsModel.find((step) => !step.complete) || null;
  const finishWorkflowNextStepHint = (() => {
    switch (nextFinishWorkflowStep?.key) {
      case 'closing_inspection':
        return tr('Closing media or return inspection review is still required.', "Les médias de retour ou la vérification d'inspection sont encore requis.");
      case 'end_odometer':
        return tr('Ending odometer reading is still required.', 'Le kilométrage de retour est encore requis.');
      case 'end_fuel':
        return tr('Return fuel level is still required.', 'Le niveau de carburant de retour est encore requis.');
      default:
        return tr('Requirements not met', 'Conditions non remplies');
    }
  })();
  const activeFinishWorkflowActors = finishWorkflowPresence.filter(
    (actor) => actor?.userId !== resolvedCurrentUser?.id && actor?.presenceKey !== currentWorkflowPresenceKey
  );
  const primaryFinishWorkflowActor = activeFinishWorkflowActors[0] || null;
  const isFinishWorkflowSoftLocked =
    isActive &&
    finishRentalSteps.showWorkflow &&
    Boolean(primaryFinishWorkflowActor) &&
    !finishWorkflowTakeover;
  const finishWorkflowHandlerName = primaryFinishWorkflowActor?.name || tr('Another staff member', 'Un autre membre du personnel');
  const finishWorkflowLockTitle = tr(
    `${finishWorkflowHandlerName} is currently handling the finish workflow.`,
    `${finishWorkflowHandlerName} gère actuellement la clôture.`
  );

  const canStartRental = startWorkflowSteps.every((step) => step.complete);
  const canSignContract =
    startWorkflowStepMap.customer_verification?.complete &&
    startWorkflowStepMap.opening_media?.complete &&
    startWorkflowStepMap.start_odometer?.complete &&
    startWorkflowStepMap.payment?.complete &&
    startWorkflowStepMap.start_fuel?.complete &&
    !startWorkflowStepMap.contract_signature?.complete;
  const canSendWhatsApp = rental.contract_signed || !!rental.signature_url;
  const canGenerateInvoice = rental.contract_signed || !!rental.signature_url;
  const rentalSourceChip = getRentalSourceChip(rental);

  // Check if workflow should be disabled (pending approval for non-admin users)
  const isWorkflowDisabled = () => {
    return isPendingApproval && !isAdmin;
  };
  const startWorkflowActionHint = isStartWorkflowSoftLocked
    ? startWorkflowLockTitle
    : isWorkflowDisabled()
      ? tr('Rental start is locked until price override is approved by admin', 'Le démarrage de la location est bloqué jusqu’à l’approbation du prix par un administrateur')
      : startWorkflowNextStepHint;

  const formattedRentalForInvoice = {
    ...rental,
    customer_license_number: 'N/A',
    vehicle_details: rental.vehicle,
    start_date: rental.started_at ? new Date(rental.started_at).toLocaleString() : (rental.rental_start_date ? new Date(rental.rental_start_date).toLocaleString() : 'N/A'),
    end_date: rental.actual_end_date ? new Date(rental.actual_end_date).toLocaleString() : (rental.rental_end_date ? new Date(rental.rental_end_date).toLocaleString() : 'N/A'),
  };

  const handleOpenRentalEdit = () => {
    navigate('/admin/rentals', {
      state: {
        openForm: true,
        editingRental: rental,
      },
    });
  };

  const openCustomerVerificationForm = () => {
    navigate('/admin/rentals', {
      state: {
        openForm: true,
        editingRental: rental,
        forceStep: 1,
        requireCustomerVerification: true,
        customerScanNote: tr(
          'Complete customer license or ID verification before starting this rental.',
          'Complétez la vérification du permis ou de la pièce d’identité du client avant de démarrer cette location.'
        ),
      },
    });
  };

// ✅ Calculate extension totals before rendering
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-6xl px-4 pb-20 pt-6 sm:pb-8 sm:pt-8">
        <div className="mb-6 rounded-[28px] border border-violet-100/90 bg-white p-4 shadow-[0_20px_55px_rgba(76,29,149,0.08)] ring-1 ring-white sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/admin/rentals')}
                  className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
                  title={tr('Back to rentals', 'Retour aux locations')}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-500">{tr('Rental Details', 'Détails de location')}</p>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
                    {rental.vehicle?.name} {rental.vehicle?.model ? `- ${rental.vehicle.model}` : ''}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {rental.vehicle?.plate_number && (
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-blue-900">
                        {rental.vehicle.plate_number}
                      </span>
                    )}
                    <Badge className={`${getStatusColor(displayRentalStatus)} border px-3 py-1 text-xs font-semibold tracking-wide`}>
                      {translateRentalStatusLabel(displayRentalStatus)}
                    </Badge>
                    {rentalAttention && (
                      <Badge className={`${rentalAttention.className} px-3 py-1 text-xs font-semibold tracking-wide`}>
                        {rentalAttention.text}
                      </Badge>
                    )}
                    {rentalSourceChip && (
                      <Badge className={`${rentalSourceChip.className} px-3 py-1 text-xs font-semibold tracking-wide`}>
                        {rentalSourceChip.label}
                      </Badge>
                    )}
                    {isImpounded && (
                      <Badge className="border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800">
                        🚨 IMPOUNDED
                      </Badge>
                    )}
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${dynamicPaymentState.chipClass}`}>
                      {dynamicPaymentState.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-600">
                      {tr('Rental ID:', 'ID location :')} {rental.rental_id}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{rental.customer_name}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setDocumentLanguage('fr')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${documentLanguage === 'fr' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                  >
                    FR
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocumentLanguage('en')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${documentLanguage === 'en' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                  >
                    EN
                  </button>
                </div>

                {canManageScheduledRental && (
                  <Button onClick={handleOpenRentalEdit} className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] hover:scale-[1.01]">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}

                {canDeleteScheduledRental && (
                  <Button onClick={cancelRental} variant="destructive" className="rounded-2xl">
                    <XCircle className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}

                {isActive && (
                  <Button onClick={cancelRental} variant="destructive" className="rounded-2xl">
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}

                {isActive && !isImpounded && (
                  <Button
                    onClick={openImpoundModal}
                    disabled={impoundActionLoading}
                    className="rounded-2xl bg-amber-600 text-white hover:bg-amber-700"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {impoundActionLoading ? tr('Saving...', 'Enregistrement...') : tr('Impound', 'Mise en fourrière')}
                  </Button>
                )}

                {isActive && isImpounded && (
                  <Button
                    onClick={openReleaseImpoundModal}
                    disabled={impoundActionLoading}
                    className="rounded-2xl bg-violet-700 text-white hover:bg-violet-800"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {impoundActionLoading ? tr('Preparing...', 'Préparation...') : tr('Release Impound', 'Libérer la fourrière')}
                  </Button>
                )}

                {syncedCustomerPhone && (
                  <>
                    <Button
                      onClick={() => setContractPreviewModal(true)}
                      disabled={!canSendContract}
                      className={`hidden rounded-2xl sm:inline-flex ${canSendContract ? 'bg-violet-700 text-white hover:bg-violet-800' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                      title={tr('Preview contract', 'Aperçu du contrat')}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {tr('Contract', 'Contrat')}
                    </Button>
                    <Button
                      onClick={async () => {
                        if (isMobileDevice()) {
                          await forceMobileRender();
                          await new Promise(resolve => setTimeout(resolve, 300));
                        }
                        setReceiptPreviewModal(true);
                      }}
                      disabled={!canSendReceipt}
                      className={`hidden rounded-2xl sm:inline-flex ${canSendReceipt ? 'bg-violet-700 text-white hover:bg-violet-800' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                      title={tr('Preview receipt', 'Aperçu du reçu')}
                    >
                      <Receipt className="mr-2 h-4 w-4" />
                      {tr('Receipt', 'Reçu')}
                    </Button>
                    <Button
                      onClick={handleWhatsAppClick}
                      onMouseEnter={ensurePDFsReady}
                      disabled={isSharing || !canSendBoth}
                      className={`hidden rounded-2xl sm:inline-flex ${isSharing || !canSendBoth ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600 hover:border-emerald-700'}`}
                      title={tr('Send documents via WhatsApp', 'Envoyer les documents via WhatsApp')}
                    >
                      {isSharing ? (
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FaWhatsapp className="mr-2" size={18} />
                      )}
                      {isSharing ? tr('Preparing...', 'Préparation...') : 'WhatsApp'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{tr('Customer', 'Client')}</p>
                <p className="mobile-summary-value mt-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{rental.customer_name || tr('Unknown customer', 'Client inconnu')}</p>
                <p className="mobile-summary-support mt-1 text-sm font-medium text-slate-500">{rental.rental_id}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{tr('Schedule', 'Planning')}</p>
                <p className="mobile-summary-schedule mt-2 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  {new Date(rental.rental_start_date || rental.started_at || '').toLocaleString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="mobile-summary-support mt-1 text-sm font-medium text-slate-500">
                  {tr('to', 'au')} {new Date(rental.rental_end_date || rental.actual_end_date || '').toLocaleString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{tr('Payment', 'Paiement')}</p>
                <p className="mobile-summary-value mt-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{dynamicPaymentState.label}</p>
                <p className="mobile-summary-support mt-1 text-sm font-medium text-slate-500">{formatCurrency(rentalBillingSummary.depositPaid)} MAD {tr('received', 'reçus')}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{tr('Security', 'Garantie')}</p>
                <p className="mobile-summary-value mt-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{securityHoldStatus.label}</p>
                <p className="mobile-summary-support mt-1 text-sm font-medium text-slate-500">
                  {formatCurrency(receivedSecurityAmount)} / {formatCurrency(requiredSecurityAmount)} MAD
                </p>
                {securityHoldReceivedMethod && (
                  <p className="mobile-summary-support mt-1 text-xs font-medium text-slate-400">
                    {securityHoldReceivedMethod === 'bank_transfer'
                      ? tr('Paid by bank transfer', 'Payé par virement bancaire')
                      : tr('Paid in cash', 'Payé en espèces')}
                  </p>
                )}
                {hasHeldSecurityDocument && (
                  <p className="mobile-summary-support mt-1 text-xs font-medium text-slate-400">
                    {tr('Held document:', 'Document retenu :')}{' '}
                    {rental.damage_deposit_document_name || tr('Passport', 'Passeport')}
                  </p>
                )}
              </div>
            </div>

            {rentalAttention && (
              <Alert className={`${rentalAttention.className} border`}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <span className="font-semibold">{rentalAttention.text}</span>
                  <span className="ml-2">{rentalAttention.detailText}</span>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <Card className="overflow-hidden rounded-[28px] border border-violet-100/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <CardContent className="p-4 sm:p-6">
          {/* SCHEDULED Rental - Show Workflow Steps */}
          {isScheduled && !rental.contract_signed && !rental.signature_url && (
            <div className="mb-6 rounded-[24px] border border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/70 p-3 shadow-[0_18px_45px_rgba(76,29,149,0.06)] sm:p-6">
              <div className="mb-3 sm:mb-4">
                <h3 className="mb-1 text-sm font-semibold text-slate-900 sm:text-base">
                  {tr('Ready to Start Rental', 'Prêt à démarrer la location')}
                </h3>
                <p className="text-xs text-slate-500">{tr('Complete these steps to begin the rental:', 'Complétez ces étapes pour démarrer la location :')}</p>
              </div>

              {primaryStartWorkflowActor && (
                <div className={`mb-3 sm:mb-4 flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  isStartWorkflowSoftLocked
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
                }`}>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${isStartWorkflowSoftLocked ? 'text-amber-800' : 'text-emerald-800'}`}>
                      {isStartWorkflowSoftLocked
                        ? tr('Currently handled by', 'Actuellement géré par')
                        : tr('You took over this workflow', 'Vous avez repris ce workflow')}
                      {' '}
                      {startWorkflowHandlerName}
                    </p>
                    <p className={`text-xs ${isStartWorkflowSoftLocked ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {isStartWorkflowSoftLocked
                        ? tr('You can stay read-only or take over if you need to continue from this device.', 'Vous pouvez rester en lecture seule ou reprendre la main si nécessaire depuis cet appareil.')
                        : tr('This remains a soft lock, so the other device will still see your progress mirrored live.', "Ceci reste un verrou souple, donc l'autre appareil verra toujours votre progression en direct.")}
                    </p>
                  </div>
                  {isStartWorkflowSoftLocked ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setStartWorkflowTakeover(true)}
                      className="w-full rounded-xl bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
                    >
                      {tr('Take Over', 'Reprendre la main')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setStartWorkflowTakeover(false)}
                      className="w-full rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                    >
                      {tr('Release Takeover', 'Relâcher la reprise')}
                    </Button>
                  )}
                </div>
              )}
              
              {/* Warning banner when approval is pending */}
              {isPendingApproval && !isAdmin && (
                <div className="mb-3 sm:mb-4 p-2.5 bg-yellow-100 border border-yellow-300 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-yellow-800 text-xs sm:text-sm">{tr('Price Override Pending Approval', 'Modification de prix en attente d’approbation')}</p>
                      <p className="text-xs text-yellow-700 mt-0.5">
                        {tr('Rental workflow is locked until admin approves the price change.', "Le workflow de location est bloqué jusqu'à l'approbation du changement de prix par un administrateur.")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2.5 sm:space-y-4">
                <div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${
                  hasCustomerVerification ? 'border border-emerald-200 bg-emerald-50/80' : 'border border-slate-200 bg-white shadow-sm'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    hasCustomerVerification ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {hasCustomerVerification ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">1</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Customer Verification', 'Vérification client')}</h4>
                        {hasCustomerVerification && (
                          <div className="mt-0.5 break-words">
                            <p className="text-xs text-gray-600">
                              {`✓ ${tr('License / ID verification completed', 'Vérification du permis / de la pièce terminée')}`}
                            </p>
                            {customerVerificationMethodLabel && (
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700/80">
                                {customerVerificationMethodLabel}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {!hasCustomerVerification && (
                        <Button
                          onClick={openCustomerVerificationForm}
                          size="sm"
                          disabled={isStartWorkflowSoftLocked}
                          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                          title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : undefined}
                        >
                          <FileImage className="w-3 h-3 mr-1.5" />
                          <span className="whitespace-nowrap">{tr('Verify Customer', 'Vérifier le client')}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 1: Vehicle Inspection */}
                <div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${
                  (openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) 
                    ? 'border border-emerald-200 bg-emerald-50/80' 
                    : 'border border-slate-200 bg-white shadow-sm'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    (openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) 
                      ? 'bg-green-500' 
                      : 'bg-gray-300'
                  }`}>
                    {(openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">1</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Vehicle Inspection (Optional)', 'Inspection du véhicule (optionnelle)')}</h4>
                        {(openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) && (
                          <p className="text-xs text-gray-600 mt-0.5 break-words">
                            {openingMedia.length > 0 
                              ? `✓ ${openingMedia.length} ${openingMedia.length !== 1 ? tr('media items uploaded', 'éléments média téléversés') : tr('media item uploaded', 'élément média téléversé')} (${getMediaCounts(openingMedia)})` 
                              : `✓ ${capturedMedia.length} ${capturedMedia.length !== 1 ? tr('items captured, ready to upload', 'éléments capturés, prêts à être téléversés') : tr('item captured, ready to upload', 'élément capturé, prêt à être téléversé')}`
                            }
                          </p>
                        )}
                        
                        {/* Show media preview thumbnails if media exists but not uploaded */}
                        {(capturedMedia.length > 0 || showMediaReview) && openingMedia.length === 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-amber-600">
                                ⚠️ {tr('Media captured but not uploaded', 'Média capturé mais non téléversé')}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpeningModalOpen(true)}
                                disabled={isStartWorkflowSoftLocked}
                                className="text-xs h-6 px-2 text-blue-600"
                                title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : undefined}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                {tr('Add More', 'Ajouter plus')}
                              </Button>
                            </div>
                            
                            {/* Thumbnail grid */}
                            <div className="grid grid-cols-4 gap-1 mb-2">
                              {capturedMedia.slice(0, 4).map((media, idx) => (
                                <div key={media.id || idx} className="relative aspect-square bg-gray-100 rounded overflow-hidden border">
                                  {media.type?.startsWith('image/') ? (
                                    <img src={media.url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <video src={media.url} className="w-full h-full object-cover" muted />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeCapturedMedia(media.id)}
                                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition hover:bg-red-600"
                                    aria-label="Remove captured media"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[8px] px-1">
                                    {media.type?.startsWith('image/') ? '📷' : '🎥'}
                                  </div>
                                </div>
                              ))}
                              {capturedMedia.length > 4 && (
                                <div className="aspect-square bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">
                                  +{capturedMedia.length - 4}
                                </div>
                              )}
                            </div>
                            
                            {/* Upload button */}
                            <Button
                              onClick={() => saveMedia('opening')}
                              size="sm"
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs h-8"
                              disabled={isProcessingVideo || isStartWorkflowSoftLocked}
                              title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : undefined}
                            >
                              <Upload className="w-3 h-3 mr-1.5" />
                              {isProcessingVideo ? tr('Uploading...', 'Téléversement...') : `${tr('Upload', 'Téléverser')} ${capturedMedia.length} ${capturedMedia.length !== 1 ? tr('items', 'éléments') : tr('item', 'élément')}`}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Main action button */}
                      <div className="mt-2 sm:mt-0 flex w-full sm:w-auto items-center gap-2">
                        {openingMedia.length === 0 && (
                          <Button 
                            onClick={() => setOpeningModalOpen(true)}
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : isWorkflowDisabled() ? tr('Workflow locked - price approval pending', 'Workflow bloqué - approbation du prix en attente') : tr('Capture vehicle condition', "Capturer l'état du véhicule")}
                            size="sm"
                            disabled={isStartWorkflowSoftLocked}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                          >
                            <Camera className="w-3 h-3 mr-1.5" />
                            <span className="whitespace-nowrap">
                              {capturedMedia.length > 0 ? tr('Review Media', 'Vérifier les médias') : tr('Add Media', 'Ajouter un média')}
                            </span>
                          </Button>
                        )}
                        {(openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleResetOpeningInspection}
                            disabled={isStartWorkflowSoftLocked}
                            className="h-7 w-7 shrink-0 border-red-200 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : tr('Reset vehicle inspection', "Réinitialiser l'inspection du véhicule")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Starting Odometer */}
                <div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${hasOdometerReading ? 'border border-emerald-200 bg-emerald-50/80' : 'border border-slate-200 bg-white shadow-sm'}`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${hasOdometerReading ? 'bg-green-500' : 'bg-gray-300'}`}>
                    {hasOdometerReading ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">2</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Starting Odometer', 'Kilométrage de départ')}</h4>
                        {displayedStartingOdometer > 0 && (
                          <p className="text-xs text-gray-600 mt-0.5 break-words">
                            {`✓ ${tr('Starting odometer:', 'Kilométrage de départ :')} ${displayedStartingOdometer} km`}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 sm:mt-0 flex w-full sm:w-auto items-center gap-2">
                        {!hasOdometerReading && !isEditingOdometer && (
                          <Button 
                            onClick={() => setIsEditingOdometer(true)}
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : isWorkflowDisabled() ? tr('Workflow locked - price approval pending', 'Workflow bloqué - approbation du prix en attente') : tr('Add Reading', 'Ajouter le relevé')}
                            size="sm"
                            disabled={isStartWorkflowSoftLocked}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                          >
                            <Gauge className="w-3 h-3 mr-1.5" />
                            <span className="whitespace-nowrap">{tr('Add Reading', 'Ajouter le relevé')}</span>
                          </Button>
                        )}
                        {hasOdometerReading && !isEditingOdometer && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleResetStartOdometer}
                            disabled={isStartWorkflowSoftLocked}
                            className="h-7 w-7 shrink-0 border-red-200 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : tr('Reset starting odometer', 'Réinitialiser le kilométrage de départ')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isEditingOdometer && (
                      <div className="mt-2 space-y-2">
                        <input
                          type="number"
                          value={startOdometer}
                          onChange={(e) => setStartOdometer(e.target.value)}
                          placeholder={tr('Enter odometer reading (km)', "Saisissez le kilométrage (km)")}
                          className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          step="1"
                          disabled={isStartWorkflowSoftLocked}
                        />
                        <div className="flex gap-1.5">
                          <Button 
                            onClick={handleSaveOdometer}
                            size="sm"
                            disabled={isStartWorkflowSoftLocked || isSavingOdometer}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : undefined}
                          >
                            <Save className="w-3 h-3 mr-1.5" />
                            {isSavingOdometer ? tr('Saving...', 'Enregistrement...') : tr('Save', 'Enregistrer')}
                          </Button>
                          <Button 
                            onClick={() => {
                              setIsEditingOdometer(false);
                              setStartOdometer(displayedStartingOdometer > 0 ? String(displayedStartingOdometer) : '');
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs h-7"
                          >
                            <X className="w-3 h-3 mr-1.5" />
                            {tr('Cancel', 'Annuler')}
                          </Button>
                        </div>
                      </div>
                    )}
                    {hasOdometerReading && !isEditingOdometer && (
                      <Button 
                        onClick={() => setIsEditingOdometer(true)}
                        size="sm"
                        variant="ghost"
                        disabled={isStartWorkflowSoftLocked}
                        className="mt-2 text-xs h-7 px-2"
                        title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : undefined}
                      >
                        <Edit className="w-3 h-3 mr-1.5" />
                        {tr('Edit Reading', 'Modifier le relevé')}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Step 3: Payment */}
                <div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${
                  isPaymentSufficient() ? 'border border-emerald-200 bg-emerald-50/80' : 
                  isPendingApproval && !isAdmin ? 'border border-amber-200 bg-amber-50/80' : 'border border-slate-200 bg-white shadow-sm'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    isPaymentSufficient() ? 'bg-green-500' : 
                    isPendingApproval && !isAdmin ? 'bg-yellow-500' : 'bg-gray-300'
                  }`}>
                    {isPaymentSufficient() ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : isPendingApproval && !isAdmin ? (
                      <Clock className="w-3 h-3 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">3</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Payment', 'Paiement')}</h4>
                        {(isPendingApproval && !isAdmin) || isPaymentSufficient() ? (
                          <p className="text-xs text-gray-600 mt-0.5 break-words">
                            {isPendingApproval && !isAdmin ? (
                              <span className="text-yellow-600">⏳ {tr('Price override pending approval', 'Modification de prix en attente d’approbation')}</span>
                            ) : (
                              `✓ ${tr('Payment received', 'Paiement reçu')}`
                            )}
                          </p>
                        ) : null}
                        {!isPaymentSufficient() && !(isPendingApproval && !isAdmin) && (
                          <div className="mt-2 inline-flex flex-col rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                              {tr('Remaining Balance', 'Solde restant')}
                            </span>
                            <span className="text-sm font-bold text-amber-900">
                              {formatCurrency(paymentStepRemainingBalance)} MAD
                            </span>
                            {rentalBillingSummary.autoDepositSeizedAmount > 0 && (
                              <span className="mt-0.5 text-[11px] text-amber-700">
                                {tr(
                                  `After applying ${formatCurrency(rentalBillingSummary.autoDepositSeizedAmount)} MAD from the damage deposit`,
                                  `Après application de ${formatCurrency(rentalBillingSummary.autoDepositSeizedAmount)} MAD depuis la caution dommages`
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 sm:mt-0 flex w-full sm:w-auto items-center gap-2">
                        {!isPaymentSufficient() && !(isPendingApproval && !isAdmin) && (
                          <Button 
                            onClick={markAsPaid}
                            size="sm"
                            disabled={isStartWorkflowSoftLocked}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : undefined}
                          >
                            <CreditCard className="w-3 h-3 mr-1.5" />
                            <span className="whitespace-nowrap">{tr('Mark Paid', 'Marquer comme payé')}</span>
                          </Button>
                        )}
                        {isPaymentSufficient() && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleResetPayment}
                            disabled={isStartWorkflowSoftLocked}
                            className="h-7 w-7 shrink-0 border-red-200 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                            title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : tr('Reset payment step', "Réinitialiser l'étape de paiement")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency fix button removed - quantity_hours is now used correctly */}


                {/* Step 4: Fuel Level - Now shown for all rental types */}
                <div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${
                    startFuelLevel !== null ? 'border border-emerald-200 bg-emerald-50/80' : 'border border-slate-200 bg-white shadow-sm'
                  }`}>
                    <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                      startFuelLevel !== null ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      {startFuelLevel !== null ? (
                        <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                      ) : (
                        <span className="text-white font-bold text-xs">4</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Fuel Level', 'Niveau de carburant')}</h4>
                          {startFuelLevel !== null && (
                            <p className="text-xs text-gray-600 mt-0.5 break-words">
                              {`✓ ${tr('Starting fuel:', 'Carburant de départ :')} ${startFuelLevel}/8 (${startFuelLevel === 8 ? tr('Full', 'Plein') : startFuelLevel === 0 ? tr('Empty', 'Vide') : `${startFuelLevel}/8`})`}
                            </p>
                          )}
                        </div>
                        <div className="mt-2 sm:mt-0 flex w-full sm:w-auto items-center gap-2">
                          {startFuelLevel === null && (
                            <Button 
                              onClick={openStartFuelModal}
                              title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : isWorkflowDisabled() ? tr('Workflow locked - price approval pending', 'Workflow bloqué - approbation du prix en attente') : tr('Record Fuel', 'Enregistrer le carburant')}
                              size="sm"
                              disabled={isStartWorkflowSoftLocked}
                              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                            >
                              <Fuel className="w-3 h-3 mr-1.5" />
                              <span className="whitespace-nowrap">{tr('Record Fuel', 'Enregistrer le carburant')}</span>
                            </Button>
                          )}
                          {startFuelLevel !== null && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleResetStartFuel}
                              disabled={isStartWorkflowSoftLocked}
                              className="h-7 w-7 shrink-0 border-red-200 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : tr('Reset starting fuel', 'Réinitialiser le carburant de départ')}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                {/* Fuel Charge Toggle - Shown for both hourly and daily rentals */}
<div className="ml-8 sm:ml-11 mt-2">
  <FuelChargeToggle
    enabled={fuelChargeEnabled}
    onToggle={handleFuelChargeToggle}
    pricePerLine={fuelPricePerLine}
    rentalType={rental?.rental_type}
    disabled={rental?.rental_status !== 'scheduled'}
  />
</div>

                {/* Step 5: Sign Contract */}
<div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${(rental.contract_signed || rental.signature_url) ? 'border border-emerald-200 bg-emerald-50/80' : 'border border-slate-200 bg-white shadow-sm'}`}>
  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${(rental.contract_signed || rental.signature_url) ? 'bg-green-500' : 'bg-gray-300'}`}>
    {(rental.contract_signed || rental.signature_url) ? (
      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
    ) : (
      <span className="text-white font-bold text-xs">5</span>
    )}
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Sign Contract', 'Signer le contrat')}</h4>
        <p className="text-xs text-gray-600 mt-0.5 break-words">
          {(rental.contract_signed || rental.signature_url) ? `✓ ${tr('Contract signed', 'Contrat signé')}` : tr('Customer signs rental agreement', 'Le client signe le contrat de location')}
        </p>
      </div>
      {!rental.contract_signed && !rental.signature_url && rental.rental_status !== 'completed' && (
        <Button 
          onClick={openSignatureFlow}
          size="sm"
          disabled={!canSignContract || isStartWorkflowSoftLocked}
          className={`mt-2 sm:mt-0 w-full sm:w-auto text-xs h-7 px-2.5 sm:px-3 ${
            canSignContract && !isStartWorkflowSoftLocked
              ? 'bg-violet-700 hover:bg-violet-800 text-white' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
          }`}
          title={isStartWorkflowSoftLocked ? startWorkflowLockTitle : !canSignContract ? tr('Complete all previous steps first', "Complétez d'abord toutes les étapes précédentes") : tr('Sign contract', 'Signer le contrat')}
        >
          <FileSignature className="w-3 h-3 mr-1.5" />
          <span className="whitespace-nowrap">{tr('Sign Contract', 'Signer le contrat')}</span>
        </Button>
      )}
    </div>
  </div>
</div>

                {!startWorkflowStepMap.customer_verification?.complete && (
                  <p className="text-xs text-amber-600 mt-2 text-center">
                    ⚠️ {startWorkflowNextStepHint}
                  </p>
                )}
                {isWorkflowDisabled() && (
                  <p className="text-xs text-yellow-600 mt-2 text-center">
                    ⏳ {tr('Rental start is locked until price override is approved by admin', 'Le démarrage de la location est bloqué jusqu’à l’approbation du prix par un administrateur')}
                  </p>
                )}
              </div>
            </div>
          )}



          {/* Contract Signed but Not Started - Show Start Button */}
          {(rental.contract_signed || rental.signature_url) && !isCompleted && !isActive && (
            <div className="rounded-[24px] border border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/60 p-4 shadow-[0_18px_45px_rgba(76,29,149,0.06)] sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                  <span>{tr('Rental Timer', 'Minuteur de location')}</span>
                </h3>
              </div>

              <div className="text-center py-6 sm:py-8">
                {/* Late/Expiry Status Banner */}
                {rental.rental_start_date && (() => {
                  const timingState = getScheduledRentalTimingState(rental.rental_start_date, rentalTimingSettings, new Date());
                  if (!timingState) return null;

                  const { now, scheduledStart, expiredAt, minutesLate, minutesPastGrace, graceMinutes, isExpired, isSoftLocked, startsInMinutes } = timingState;
                  const autoExpireAllowed = shouldAutoExpireScheduledRental(rental);

                  if (isExpired) return autoExpireAllowed ? (
                    <div className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-left">
                      <p className="text-sm font-bold text-red-800 mb-1">❌ {tr('Rental Expired', 'Location expirée')}</p>
                      <div className="text-xs text-red-700 space-y-1">
                        <p>📅 {tr('Scheduled:', 'Planifié :')} <strong>{formatRentalScheduleDateTime(scheduledStart)}</strong></p>
                        <p>🔴 {tr('Expired at:', 'Expirée à :')} <strong>{formatRentalScheduleDateTime(expiredAt)}</strong></p>
                        <p>🕐 {tr('Now:', 'Maintenant :')} <strong>{formatRentalScheduleDateTime(now)}</strong> ({minutesPastGrace} {tr('min past', 'min de retard')})</p>
                        <p className="mt-1">{tr('This customer booking has passed its website grace window and will stay expired.', 'Cette réservation client a dépassé son délai de grâce web et restera expirée.')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left">
                      <p className="text-sm font-bold text-amber-800 mb-1">⚠️ {tr('Late Arrival Warning', 'Alerte retard client')}</p>
                      <div className="text-xs text-amber-700 space-y-1">
                        <p>📅 {tr('Scheduled:', 'Planifié :')} <strong>{formatRentalScheduleDateTime(scheduledStart)}</strong></p>
                        <p>🕐 {tr('Now:', 'Maintenant :')} <strong>{formatRentalScheduleDateTime(now)}</strong> ({minutesPastGrace} {tr('min past the website grace window', 'min après le délai de grâce web')})</p>
                        <p className="mt-1">{tr('This staff-created rental stays available. Staff can still start it manually and the end time will adjust from now.', 'Cette location créée par le personnel reste disponible. Le personnel peut toujours la démarrer manuellement et l’heure de fin sera recalculée à partir de maintenant.')}</p>
                      </div>
                    </div>
                  );
                  if (isSoftLocked) return (
                    autoExpireAllowed ? (
                      <div className="mb-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-3 text-left">
                        <p className="text-sm font-bold text-orange-800">⚠️ {tr('Auto-cancel in', 'Annulation auto dans')} {graceMinutes - minutesLate} {tr('min', 'min')}</p>
                        <p className="text-xs text-orange-700">
                          {tr('Scheduled for', 'Planifié pour')} {formatRentalScheduleDateTime(scheduledStart)} · {minutesLate} {tr('min late.', 'min de retard.')}
                        </p>
                      </div>
                    ) : (
                      <div className="mb-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-3 text-left">
                        <p className="text-sm font-bold text-orange-800">⚠️ {tr('Late Arrival Review', 'Contrôle retard')}</p>
                        <p className="text-xs text-orange-700">
                          {tr('Scheduled for', 'Planifié pour')} {formatRentalScheduleDateTime(scheduledStart)} · {minutesLate} {tr('min late. Staff can still start this rental manually.', 'min de retard. Le personnel peut toujours démarrer cette location manuellement.')}
                        </p>
                      </div>
                    )
                  );
                  if (minutesLate > 0) return (
                    <div className="mb-4 flex gap-2 rounded-2xl border border-yellow-300 bg-yellow-50 p-3 text-left">
                      <span>⏰</span>
                      <div>
                        <p className="text-sm font-semibold text-yellow-800">{minutesLate} {tr('min late', 'min de retard')}</p>
                        <p className="text-xs text-yellow-700">
                          {autoExpireAllowed
                            ? `${tr('Scheduled for', 'Planifié pour')} ${formatRentalScheduleDateTime(scheduledStart)} · ${graceMinutes - minutesLate} ${tr('min before auto-expire', 'min avant expiration auto')}`
                            : `${tr('Scheduled for', 'Planifié pour')} ${formatRentalScheduleDateTime(scheduledStart)} · ${tr('staff can still start it manually', 'le personnel peut toujours la démarrer manuellement')}`}
                        </p>
                      </div>
                    </div>
                  );
                  if (minutesLate < 0) return (
                    <div className="mb-4 flex gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-left">
                      <span>🕐</span><p className="text-sm font-semibold text-blue-800">{tr('Starts in', 'Commence dans')} {startsInMinutes} {tr('min', 'min')} · {formatRentalScheduleDateTime(scheduledStart)}</p>
                    </div>
                  );
                  return (
                    <div className="mb-4 flex gap-2 rounded-2xl border border-green-200 bg-green-50 p-3 text-left">
                      <span>✅</span><p className="text-sm font-semibold text-green-800">{tr('On time — ready to start at', 'À l’heure — prêt à démarrer à')} {formatRentalScheduleDateTime(scheduledStart)}</p>
                    </div>
                  );
                })()}
                {rental.rental_status !== 'expired' && (
                  <div className="mb-4 sm:mb-6">
                    <p className="text-sm sm:text-base text-gray-600 mb-2">{tr('Contract signed and ready to start', 'Contrat signé et prêt à démarrer')}</p>
                    <p className="text-xs sm:text-sm text-gray-500">{tr('Click "Start Now" to begin the rental timer', 'Cliquez sur "Démarrer maintenant" pour lancer le minuteur de location')}</p>
                  </div>
                )}
                {primaryStartWorkflowActor && (
                  <div className={`mb-4 rounded-2xl border px-3 py-2 text-left ${
                    isStartWorkflowSoftLocked ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
                  }`}>
                    <p className={`text-sm font-semibold ${isStartWorkflowSoftLocked ? 'text-amber-800' : 'text-emerald-800'}`}>
                      {isStartWorkflowSoftLocked
                        ? tr('Currently handled by', 'Actuellement géré par')
                        : tr('Workflow takeover active', 'Reprise du workflow active')}
                      {' '}
                      {startWorkflowHandlerName}
                    </p>
                  </div>
                )}
                {rental.rental_status === 'expired' ? (
                  <p className="text-sm text-red-600 font-medium">❌ {tr('Expired — vehicle has been freed.', 'Expirée — le véhicule a été libéré.')}</p>
                ) : (
                  <>
                    <Button
                      onClick={startRental}
                      disabled={!canStartRental || isStartWorkflowSoftLocked || isWorkflowDisabled() || isStartingRental}
                      title={startWorkflowActionHint}
                      className={`${!canStartRental || isStartWorkflowSoftLocked || isWorkflowDisabled() || isStartingRental ? 'bg-gray-300 cursor-not-allowed' : 'bg-violet-700 hover:bg-violet-800'} text-white px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold shadow-sm transition-all duration-200 hover:scale-[1.01] rounded-lg`}
                    >
                      <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                      {isStartingRental ? tr('Starting...', 'Démarrage...') : tr('Start Now', 'Démarrer maintenant')}
                    </Button>
                    {!canStartRental && (
                      <div className="mt-3 space-y-1">
                        {nextStartWorkflowStep && (
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {tr('Next required step', 'Prochaine étape requise')} · {nextStartWorkflowStep.label}
                          </p>
                        )}
                        <p className="text-xs text-red-500">{startWorkflowNextStepHint}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Active Rental - Show Timer */}
          {isActive && (
            <>
              {!finishRentalSteps.showWorkflow ? (
                /* Show Timer + End Now Button when NOT in finish workflow */
                <div className="mb-6 rounded-[24px] border border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/60 p-4 shadow-[0_18px_45px_rgba(76,29,149,0.06)] sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                      <span>{tr('Rental Timer', 'Minuteur de location')}</span>
                    </h3>
                    <Badge className="bg-green-100 text-green-800 px-3 py-1 self-start sm:self-auto">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                        {tr('Active', 'Active')}
                      </div>
                    </Badge>
                    {isImpounded && (
                      <Badge className="border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800 self-start sm:self-auto">
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>🚨 {tr('Impounded', 'Mis en fourrière')}</span>
                        </div>
                      </Badge>
                    )}
                  </div>

                  <div>
                    {isImpounded && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-amber-900">
                            {tr('Vehicle is currently impounded. The timer keeps running so extra impound time remains billable.', 'Le véhicule est actuellement en fourrière. Le minuteur continue pour que le temps supplémentaire reste facturable.')}
                          </p>
                          {canCancelImpound && (
                            <button
                              type="button"
                              onClick={cancelRentalImpound}
                              disabled={impoundActionLoading}
                              className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white/80 text-amber-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={tr('Cancel impound', 'Annuler la mise en fourrière')}
                              title={tr('Cancel impound', 'Annuler la mise en fourrière')}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-amber-800 space-y-1">
                          <p>{tr('Impounded at:', 'Mise en fourrière le :')} <strong>{formatImpoundDateTime(rental?.impounded_at)}</strong></p>
                          {rental?.impound_reason && <p>{tr('Reason:', 'Raison :')} <strong>{rental.impound_reason}</strong></p>}
                          {rental?.impound_reference && <p>{tr('Reference:', 'Référence :')} <strong>{rental.impound_reference}</strong></p>}
                          {rental?.impound_note && <p>{tr('Note:', 'Note :')} {rental.impound_note}</p>}
                        </div>
                      </div>
                    )}
                    <div className="mb-4 grid grid-cols-1 gap-4 sm:mb-6 sm:grid-cols-2 sm:gap-6">
                      <div className="min-h-[140px] rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)] sm:min-h-0 sm:p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <PlayCircle className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${rentalElapsedTone?.iconClass || 'text-green-600'}`} />
                          <p className="text-xs sm:text-sm text-gray-600 font-medium">{tr('Time Elapsed', 'Temps écoulé')}</p>
                        </div>
                        <div className="mt-1">
                          <span
                            className={`mobile-timer-value block whitespace-nowrap text-3xl font-extrabold leading-[0.92] tracking-[-0.05em] tabular-nums ${rentalElapsedTone?.valueClass || 'text-green-600'}`}
                          >
                            {elapsedTime || '00:00:00'}
                          </span>
                        </div>
                        {rentalElapsedTone?.expired ? (
                          <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${rentalElapsedTone.labelClass}`}>
                            {tr('Expired', 'Expirée')}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-h-[140px] rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)] sm:min-h-0 sm:p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                          <p className="text-xs sm:text-sm text-gray-600 font-medium">{tr('Time Remaining', 'Temps restant')}</p>
                        </div>
                        <div className="mt-1">
                          <span
                            className={`mobile-timer-value block whitespace-nowrap text-3xl font-extrabold leading-[0.92] tracking-[-0.05em] tabular-nums ${timeRemaining === 'Expired' ? 'text-red-600' : 'text-blue-600'}`}
                          >
                            {timeRemaining || 'N/A'}
                          </span>
                        </div>
                        {extensions.length > 0 && (
                          <p className="mt-2 text-xs text-gray-500">
                            {tr('Extended by', 'Prolongée de')} {extensions.filter(e => e.status === 'approved').reduce((sum, e) => sum + (parseFloat(e.extension_hours) || 0), 0)}h
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row justify-center gap-3">
                      <Button 
                        onClick={() => { void openFinishWorkflow(); }}
                        className="bg-violet-700 hover:bg-violet-800 text-white px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold shadow-sm transition-all duration-200 hover:scale-[1.01] rounded-lg"
                      >
                        <StopCircle className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                        {tr('End Now', 'Terminer maintenant')}
                      </Button>
                      
                      {closingMedia.length === 0 && (
                        <Button 
                          onClick={() => {
                            setEditingExtension(null);
                            setExtensionModalOpen(true);
                          }}
                          className="bg-violet-700 hover:bg-violet-800 text-white px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold shadow-sm transition-all duration-200 hover:scale-[1.01] rounded-lg"
                        >
                          <Clock className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                          {tr('Extend Time', 'Prolonger')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* MATCHING "Ready to Start Rental" Harmonic Design */
                <div className="mb-6 rounded-[24px] border border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/70 p-3 shadow-[0_18px_45px_rgba(76,29,149,0.06)] sm:p-6">
                  <div className="mb-3 sm:mb-4">
                    <h3 className="mb-1 text-sm font-semibold text-slate-900 sm:text-base">
                      {tr('Ready to Finish Rental', 'Prêt à terminer la location')}
                    </h3>
                    <p className="text-xs text-slate-500">{tr('Complete these steps to end the rental:', 'Complétez ces étapes pour terminer la location :')}</p>
                  </div>

                  {primaryFinishWorkflowActor && (
                    <div className={`mb-3 sm:mb-4 flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                      isFinishWorkflowSoftLocked
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-emerald-200 bg-emerald-50'
                    }`}>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${isFinishWorkflowSoftLocked ? 'text-amber-800' : 'text-emerald-800'}`}>
                          {isFinishWorkflowSoftLocked
                            ? tr('Currently handled by', 'Actuellement géré par')
                            : tr('You took over this workflow', 'Vous avez repris ce workflow')}
                          {' '}
                          {finishWorkflowHandlerName}
                        </p>
                        <p className={`text-xs ${isFinishWorkflowSoftLocked ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {isFinishWorkflowSoftLocked
                            ? tr('You can stay read-only or take over if you need to continue from this device.', 'Vous pouvez rester en lecture seule ou reprendre la main si nécessaire depuis cet appareil.')
                            : tr('This remains a soft lock, so the other device will still see your closing progress mirrored live.', "Ceci reste un verrou souple, donc l'autre appareil verra toujours votre progression de clôture en direct.")}
                        </p>
                      </div>
                      {isFinishWorkflowSoftLocked ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setFinishWorkflowTakeover(true)}
                          className="w-full rounded-xl bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
                        >
                          {tr('Take Over', 'Reprendre la main')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setFinishWorkflowTakeover(false)}
                          className="w-full rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                        >
                          {tr('Release Takeover', 'Relâcher la reprise')}
                        </Button>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-2.5 sm:space-y-4">
                    {/* Step 1: Closing Vehicle Inspection */}
                    <div className={`flex items-start gap-2.5 rounded-2xl p-3 sm:gap-3 ${
                      closingInspectionStepComplete ? 'border border-emerald-200 bg-emerald-50/80' : 'border border-slate-200 bg-white shadow-sm'
                    }`}>
                      <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                        closingInspectionStepComplete ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {closingInspectionStepComplete ? (
                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        ) : (
                          <span className="text-white font-bold text-xs">1</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-xs sm:text-sm text-gray-900">{tr('Vehicle Inspection (Optional)', 'Inspection du véhicule (optionnelle)')}</h4>
                            <p className="text-xs text-gray-600 mt-0.5 break-words">
                              {closingInspectionStepComplete
                                ? `✓ ${tr('Inspection complete', 'Inspection terminée')}`
                                : reportWorkflowLocked
                                  ? tr('Inspection complete and report saved', "Inspection terminée et rapport enregistré")
                                : reportRequired && hasClosingInspectionMedia && !reportSaved
                                  ? tr('Closing media uploaded - save the report to continue', 'Médias de retour téléversés - enregistrez le rapport pour continuer')
                                  : reportRequired && reportHasUnsavedChanges && reportSaved
                                    ? tr('Report changed - update the saved report to continue', 'Rapport modifié - mettez à jour le rapport enregistré pour continuer')
                                : closingMedia.length > 0 && requiresClosingInspectionReview
                                  ? tr('Existing closing media found - review or add more before continuing', 'Des médias de retour existent déjà - vérifiez-les ou ajoutez-en avant de continuer')
                                  : tr('Skip this unless you want return photos or a damage report', 'Ignorez ceci sauf si vous voulez des photos de retour ou un rapport de dommages')}
                            </p>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className={`rounded-md px-2.5 py-2 text-[11px] ${
                                hasClosingInspectionMedia && !requiresClosingInspectionReview
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {tr('Media:', 'Médias :')} {hasClosingInspectionMedia ? (requiresClosingInspectionReview ? tr('Needs review', 'À vérifier') : tr('Done', 'Terminé')) : tr('Optional', 'Optionnel')}
                              </div>
                              <div className={`rounded-md px-2.5 py-2 text-[11px] ${
                                !reportRequired
                                  ? 'bg-gray-100 text-gray-600'
                                  : reportSaved && !reportHasUnsavedChanges
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}>
                                {tr('Report:', 'Rapport :')} {!reportRequired ? tr('Not needed', 'Non requis') : reportSaved && !reportHasUnsavedChanges ? tr('Saved', 'Enregistré') : reportSaved ? tr('Update needed', 'Mise à jour requise') : tr('Pending save', 'En attente d’enregistrement')}
                              </div>
                            </div>
                          </div>
                          {!reportWorkflowLocked && !closingInspectionStepComplete ? (
                            <Button 
                              onClick={handleOpenClosingModal}
                              size="sm"
                              disabled={isFinishWorkflowSoftLocked}
                              className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                              title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                            >
                              <Video className="w-3 h-3 mr-1.5" />
                              <span className="whitespace-nowrap">
                                {closingMedia.length > 0
                                  ? tr('Review / Add Media', 'Vérifier / ajouter des médias')
                                  : tr('Upload Media', 'Téléverser des médias')}
                              </span>
                            </Button>
                          ) : reportWorkflowLocked ? (
                            <div className="mt-2 sm:mt-0 flex w-full sm:w-auto flex-col sm:flex-row gap-2">
                              <Button
                                type="button"
                                onClick={scrollToRentalMedia}
                                size="sm"
                                variant="outline"
                                disabled={isFinishWorkflowSoftLocked}
                                className="w-full sm:w-auto text-xs h-7 px-2.5 sm:px-3"
                                title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                              >
                                <FileImage className="w-3 h-3 mr-1.5" />
                                <span className="whitespace-nowrap">{tr('View Media', 'Voir les médias')}</span>
                              </Button>
                              <Button
                                type="button"
                                onClick={scrollToVehicleReport}
                                size="sm"
                                variant="outline"
                                disabled={isFinishWorkflowSoftLocked}
                                className="w-full sm:w-auto text-xs h-7 px-2.5 sm:px-3"
                                title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                              >
                                <FileText className="w-3 h-3 mr-1.5" />
                                <span className="whitespace-nowrap">{tr('View Report', 'Voir le rapport')}</span>
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-3 rounded-2xl border border-violet-100 bg-white p-3 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                          {!reportWorkflowLocked ? (
                            <>
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-gray-900">{tr('Damage or Accident Report', "Rapport de dommage ou d'accident")}</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {tr('Turn this on only if the return inspection found damage, an accident, or a mechanical issue.', "Activez ceci uniquement si l'inspection de retour a trouvé un dommage, un accident ou un problème mécanique.")}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setVehicleReportDraft(prev => ({ ...prev, enabled: !prev.enabled }))}
                                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors md:max-w-[280px] lg:min-w-[220px] lg:max-w-[280px] ${
                                    vehicleReportDraft.enabled
                                      ? 'border-red-200 bg-red-50 text-red-700'
                                      : 'border-gray-200 bg-gray-50 text-gray-600'
                                  }`}
                                  aria-pressed={vehicleReportDraft.enabled}
                                >
                                  <span className="min-w-0">
                                    <span className="block text-xs font-semibold">
                                      {vehicleReportDraft.enabled ? tr('Report Enabled', 'Rapport activé') : tr('No Report', 'Aucun rapport')}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] opacity-80">
                                      {vehicleReportDraft.enabled
                                        ? tr('Damage workflow enabled', 'Flux de dommage activé')
                                        : tr('Tap to enable report', 'Touchez pour activer le rapport')}
                                    </span>
                                  </span>
                                  <span
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                                      vehicleReportDraft.enabled ? 'bg-red-500' : 'bg-gray-300'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                                        vehicleReportDraft.enabled ? 'translate-x-5' : 'translate-x-1'
                                      }`}
                                    />
                                  </span>
                                </button>
                              </div>

                              {vehicleReportDraft.enabled && (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Report Type</label>
                                      <div className="grid grid-cols-3 gap-2">
                                        {[
                                          { value: 'damage', label: 'Damage' },
                                          { value: 'accident', label: 'Accident' },
                                          { value: 'mechanical_issue', label: 'Mechanical' },
                                        ].map((option) => (
                                          <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setVehicleReportDraft(prev => ({ ...prev, report_type: option.value }))}
                                            className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                              vehicleReportDraft.report_type === option.value
                                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
                                      <div className="grid grid-cols-3 gap-2">
                                        {[
                                          { value: 'minor', label: 'Minor' },
                                          { value: 'moderate', label: 'Moderate' },
                                          { value: 'major', label: 'Major' },
                                        ].map((option) => (
                                          <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setVehicleReportDraft(prev => ({ ...prev, severity: option.value }))}
                                            className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                              vehicleReportDraft.severity === option.value
                                                ? 'border-red-500 bg-red-50 text-red-700'
                                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                    <textarea
                                      value={vehicleReportDraft.description}
                                      onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, description: e.target.value }))}
                                      rows={3}
                                      placeholder="Describe the issue found during return inspection..."
                                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs resize-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Affected Areas</label>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                      <div className="relative mx-auto h-64 max-w-[220px]">
                                        <div className="absolute inset-x-8 top-6 bottom-6 rounded-[2rem] border-2 border-gray-300 bg-white shadow-sm">
                                          <div className="absolute inset-x-10 top-4 h-8 rounded-full border border-gray-200 bg-gray-100" />
                                          <div className="absolute inset-x-12 top-16 h-10 rounded-xl border border-gray-200 bg-gray-50" />
                                          <div className="absolute inset-x-10 bottom-4 h-8 rounded-full border border-gray-200 bg-gray-100" />
                                          <div className="absolute inset-x-8 top-[40%] h-10 -translate-y-1/2 rounded-xl border border-dashed border-gray-200 bg-gray-50" />
                                        </div>

                                        {VEHICLE_REPORT_AREAS.map((area) => {
                                          const selected = (vehicleReportDraft.affected_areas || []).includes(area.id);
                                          return (
                                            <button
                                              key={area.id}
                                              type="button"
                                              onClick={() => toggleAffectedArea(area.id)}
                                              className={`absolute ${area.position} rounded-full border px-2.5 py-1 text-[10px] font-medium shadow-sm transition-colors ${
                                                selected
                                                  ? 'border-red-500 bg-red-500 text-white'
                                                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                                              }`}
                                            >
                                              {area.label}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {(vehicleReportDraft.affected_areas || []).length > 0 ? (
                                          vehicleReportDraft.affected_areas.map((areaId) => {
                                            const area = VEHICLE_REPORT_AREAS.find((item) => item.id === areaId);
                                            return (
                                              <span
                                                key={areaId}
                                                className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700"
                                              >
                                                {area?.label || areaId}
                                              </span>
                                            );
                                          })
                                        ) : (
                                          <p className="text-[11px] text-gray-500">
                                            Tap the vehicle map to mark the damaged area.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={vehicleReportDraft.send_to_maintenance}
                                        onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, send_to_maintenance: e.target.checked }))}
                                      />
                                      Send vehicle to maintenance
                                    </label>
                                    <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={vehicleReportDraft.customer_chargeable}
                                        onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, customer_chargeable: e.target.checked }))}
                                      />
                                      Customer should be charged
                                    </label>
                                  </div>

                                  {vehicleReportDraft.customer_chargeable && !vehicleReportDraft.send_to_maintenance && (
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">{tr('Estimated Customer Charge (MAD)', 'Montant estimé à facturer au client (MAD)')}</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={vehicleReportDraft.customer_charge_amount}
                                        onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, customer_charge_amount: e.target.value }))}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs"
                                      />
                                    </div>
                                  )}

                                  {!hasClosingInspectionMedia && (
                                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                      Upload the closing inspection photos or videos first, then save the report.
                                    </div>
                                  )}

                                  {hasClosingInspectionMedia && reportNeedsAffectedAreas && !hasAffectedAreas && (
                                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                      Tap the vehicle map to mark the affected area before saving the report.
                                    </div>
                                  )}

                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await persistVehicleReport();
                                          await loadRentalData(true);
                                        } catch (err) {
                                          toast.error(err.message || 'Failed to save vehicle report');
                                        }
                                      }}
                                      disabled={!canSaveVehicleReport || isFinishWorkflowSoftLocked}
                                      title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                                      size="sm"
                                      className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 text-white text-xs"
                                    >
                                      <FileText className="w-3 h-3 mr-1.5" />
                                      {savingVehicleReport
                                        ? 'Saving Report...'
                                        : reportSaved
                                          ? 'Update Report'
                                          : 'Save Report to Continue'}
                                    </Button>
                                    {vehicleReport?.maintenance_id && (
                                      <Button
                                        type="button"
                                        onClick={() => navigate(`/admin/maintenance?maintenanceId=${vehicleReport.maintenance_id}`)}
                                        size="sm"
                                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                                      >
                                        <Wrench className="w-3 h-3 mr-1.5" />
                                        Open in Quad Maintenance
                                      </Button>
                                    )}
                                    {vehicleReport && (
                                      <div className="flex items-center text-xs text-green-700">
                                        <CheckCircle className="w-3 h-3 mr-1.5" />
                                        Report saved{vehicleReport.maintenance_id ? ` and linked to ${formatMaintenanceReference(vehicleReport.maintenance_id)}` : ''}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className={`rounded-lg border p-3 ${incidentSummaryToneClass}`}>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-wide">{incidentSummaryTitle}</p>
                                  <p className="mt-1 text-xs leading-relaxed opacity-90">
                                    {incidentSummaryBody}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                    <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 font-medium">
                                      {tr('Closing inspection saved', 'Inspection de retour enregistrée')}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 font-medium">
                                      {tr('Vehicle report saved', 'Rapport véhicule enregistré')}
                                    </span>
                                    {vehicleReport?.maintenance_id && (
                                      <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 font-medium">
                                        {formatMaintenanceReference(vehicleReport.maintenance_id)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Button
                                    type="button"
                                    onClick={scrollToRentalMedia}
                                    size="sm"
                                    variant="outline"
                                    disabled={isFinishWorkflowSoftLocked}
                                    className="text-xs"
                                    title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                                  >
                                    <FileImage className="w-3 h-3 mr-1.5" />
                                    {tr('View Media', 'Voir les médias')}
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={scrollToVehicleReport}
                                    size="sm"
                                    variant="outline"
                                    disabled={isFinishWorkflowSoftLocked}
                                    className="text-xs"
                                    title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                                  >
                                    <FileText className="w-3 h-3 mr-1.5" />
                                    {tr('View Report', 'Voir le rapport')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Ending Odometer */}
                <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
                  finishRentalSteps.endOdometerComplete ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    finishRentalSteps.endOdometerComplete ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {finishRentalSteps.endOdometerComplete ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">2</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Ending Odometer</h4>
                        {!isEditingEndOdometer ? (
                          <p className="text-xs text-gray-600 mt-0.5 break-words">
                            {finishRentalSteps.endOdometerComplete 
                              ? `✓ Ending odometer: ${rental.ending_odometer} km` 
                              : 'Enter ending kilometer reading'}
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <input
                              ref={endOdometerEditInputRef}
                              type="number"
                              value={endOdometerEditValue}
                              onChange={(e) => setEndOdometerEditValue(e.target.value)}
                              placeholder="Enter ending odometer (km)"
                              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              min={rental.start_odometer || 0}
                              step="1"
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <Button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSaveEndOdometer(endOdometerEditValue);
                                }}
                                size="sm"
                                disabled={isFinishWorkflowSoftLocked || isProcessingEndOdometer}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                                title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                              >
                                {isProcessingEndOdometer ? tr('Saving...', 'Enregistrement...') : tr('Save', 'Enregistrer')}
                              </Button>
                              <Button 
                                type="button"
                                onClick={() => {
                                  setIsEditingEndOdometer(false);
                                  setEndOdometerEditValue('');
                                }}
                                variant="outline"
                                size="sm"
                                className="flex-1 text-xs h-7"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {finishRentalSteps.endOdometerComplete && !isEditingEndOdometer && (
                        <Button 
                          type="button"
                          onClick={() => { setIsEditingEndOdometer(true); setEndOdometerEditValue(rental.ending_odometer?.toString() || ""); }}
                          size="sm"
                          variant="ghost"
                          className="mt-2 sm:mt-0 text-xs h-7 px-2"
                        >
                          <Edit className="w-3 h-3 mr-1.5" />
                          Edit
                        </Button>
                      )}
                      {!finishRentalSteps.endOdometerComplete && !isEditingEndOdometer && (
                        <Button 
                          type="button"
                          onClick={() => setShowEndOdometerPrompt(true)}
                          size="sm"
                          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                        >
                          <Gauge className="w-3 h-3 mr-1.5" />
                          <span className="whitespace-nowrap">Add Reading</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                    {/* Step 3: Fuel Level - WITH EDIT CAPABILITY */}
<div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
  finishRentalSteps.endFuelComplete ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
}`}>
  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
    finishRentalSteps.endFuelComplete ? 'bg-green-500' : 'bg-gray-300'
  }`}>
    {finishRentalSteps.endFuelComplete ? (
      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
    ) : (
      <span className="text-white font-bold text-xs">3</span>
    )}
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Fuel Level</h4>
        <p className="text-xs text-gray-600 mt-0.5 break-words">
          {finishRentalSteps.endFuelComplete 
            ? `✓ Ending fuel: ${endFuelLevel || rental?.end_fuel_level}/8 ${startFuelLevel ? `(Started: ${startFuelLevel}/8)` : ''}` 
            : 'Record fuel level at return'}
        </p>
      </div>
      
      {/* Record Fuel Button (shown when not complete) */}
      {!finishRentalSteps.endFuelComplete && (
        <Button 
          onClick={() => setShowEndFuelModal(true)}
          size="sm"
          disabled={isFinishWorkflowSoftLocked}
          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
          title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
        >
          <Fuel className="w-3 h-3 mr-1.5" />
          <span className="whitespace-nowrap">Record Fuel</span>
        </Button>
      )}
    </div>

    {/* FUEL CHARGE DISPLAY — compact, shows prices & calc */}
    {finishRentalSteps.endFuelComplete && (
      <>
        {fuelChargeEnabled ? (
          (() => {
            const startL = startFuelLevel || rental?.start_fuel_level || 0;
            const endL   = endFuelLevel   || rental?.end_fuel_level   || 0;
            const deficit = Math.max(0, startL - endL);
            const charge  = fuelCharge || rental?.fuel_charge || 0;
            return (
              <div className="mt-2 bg-gray-50 rounded-lg px-2.5 py-2 space-y-1">
                {/* One-line summary */}
                <div className="flex items-center justify-between flex-wrap gap-x-2">
                  <span className={`text-xs font-semibold ${charge > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ⛽ {deficit} line{deficit !== 1 ? 's' : ''} missing · {deficit} × {fuelPricePerLine} = <strong>{charge.toFixed(0)} MAD</strong>
                  </span>
                  <Button
                    onClick={() => {
                      const val = prompt(`Override fuel charge (MAD):
${deficit} lines × ${fuelPricePerLine} MAD = ${charge.toFixed(2)} MAD`, charge.toString());
                      if (val !== null) {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) handleEditFuelCharge(n);
                        else toast.error('Enter a valid number');
                      }
                    }}
                    size="sm" variant="ghost"
                    className="h-5 px-1.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Edit className="w-3 h-3 mr-0.5" />Edit
                  </Button>
                </div>
                {/* Breakdown — only when deficit > 0 */}
                {deficit > 0 && (
                  <p className="text-xs text-gray-400 leading-tight">
                    Start {startL}/8 → End {endL}/8 · {fuelPricePerLine} MAD/line · {rental?.rental_type}
                  </p>
                )}
                {deficit === 0 && (
                  <p className="text-xs text-green-600 leading-tight">✓ Fuel returned at same level — no charge</p>
                )}
              </div>
            );
          })()
        ) : (
          /* Disabled — show what WOULD be charged */
          (() => {
            const startL  = startFuelLevel || rental?.start_fuel_level || 0;
            const endL    = endFuelLevel   || rental?.end_fuel_level   || 0;
            const deficit = Math.max(0, startL - endL);
            const wouldBe = deficit * (fuelPricePerLine || 0);
            return (
              <div className="mt-2 bg-gray-50 rounded-lg px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-x-2">
                  <span className="text-xs text-gray-500 font-medium">
                    ⛽ Fuel charge OFF
                    {wouldBe > 0 && <span className="text-amber-600 ml-1">(would be {wouldBe.toFixed(0)} MAD)</span>}
                  </span>
                  <Button
                    onClick={() => {
                      const val = prompt(`Manual fuel charge (MAD):
${deficit} lines × ${fuelPricePerLine} MAD = ${wouldBe.toFixed(2)} MAD`, '0');
                      if (val !== null) {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) handleEditFuelCharge(n);
                        else toast.error('Enter a valid number');
                      }
                    }}
                    size="sm" variant="ghost"
                    className="h-5 px-1.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Edit className="w-3 h-3 mr-0.5" />Override
                  </Button>
                </div>
                {rental.rental_type === 'hourly' && (
                  <p className="text-xs text-gray-400 leading-tight">
                    Start {startL}/8 → End {endL}/8 · fuel included in hourly rate
                  </p>
                )}
              </div>
            );
          })()
        )}
      </>
    )}
  </div>
</div>

                    {/* Complete Rental — appears inline once all 3 steps done */}
                    {closingInspectionStepComplete &&
                     finishRentalSteps.endOdometerComplete &&
                     finishRentalSteps.endFuelComplete && (
                      <div className="pt-1 space-y-2">
                        {/* Balance warning */}
                        {(() => {
                          const balanceDue = rentalBillingSummary.balanceDue;
                          if (balanceDue > 0) return (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                              <p className="text-xs text-yellow-800 font-medium">Balance due: {formatCurrency(balanceDue)} MAD — can collect after completion</p>
                            </div>
                          );
                          return null;
                        })()}
                        {rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 flex items-center gap-2">
                            <span className="text-lg flex-shrink-0">🔒</span>
                            <p className="text-xs text-orange-800">
                              <span className="font-semibold">Damage deposit of {formatCurrency(rental.damage_deposit)} MAD not yet returned</span>
                              {' '}— you can complete now and return it separately.
                            </p>
                          </div>
                        )}
                        {vehicleStillUnderMaintenance && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-800">
                              {tr('Completing this rental will not release the vehicle. Vehicle remains under maintenance until an admin closes the maintenance record.', "Terminer cette location ne libérera pas le véhicule. Le véhicule reste en maintenance jusqu'à la clôture du dossier par un administrateur.")}
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={async () => {
                            try { await finalizeRentalCompletion(); }
                            catch (err) { toast.error(`Failed: ${err.message}`); }
                          }}
                          disabled={isFinishWorkflowSoftLocked}
                          className="bg-green-600 hover:bg-green-700 text-white py-3 text-sm font-semibold shadow-lg w-full"
                          title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Complete Rental
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Cancel Workflow Button */}
                  <div className="flex justify-end mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelFinishWorkflow}
                      disabled={isFinishWorkflowSoftLocked}
                      className="text-gray-500 hover:text-gray-700 text-xs"
                      title={isFinishWorkflowSoftLocked ? finishWorkflowLockTitle : undefined}
                    >
                      Cancel workflow
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {shouldShowVehicleReport && (
        <div ref={vehicleReportSectionRef}>
        <Card className="mb-6 overflow-hidden rounded-[28px] border border-violet-100/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-rose-50/40 to-violet-50/60">
            <CardTitle className="flex items-center justify-between gap-3 text-base sm:text-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Vehicle Report</span>
              </div>
              <Badge className="bg-red-100 text-red-800">
                {String(vehicleReport.severity || 'reported').replace(/_/g, ' ')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">{tr('Report Type', 'Type de rapport')}</p>
                <p className="mt-1 font-medium text-gray-900">{String(vehicleReport.report_type || 'damage').replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">{tr('Photos / Media', 'Photos / médias')}</p>
                <p className="mt-1 font-medium text-gray-900">{vehicleReport.photos?.length || 0} {tr('linked item(s)', 'élément(s) lié(s)')}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-slate-50/70 p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
              <p className="text-xs uppercase tracking-wide text-slate-400">{tr('Inspection Note', "Note d'inspection")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{vehicleReport.description || tr('No description recorded.', 'Aucune description enregistrée.')}</p>
            </div>

            {vehicleReport.maintenance ? (
              <div className="space-y-3 rounded-[24px] border border-orange-200 bg-orange-50/80 p-4 shadow-[0_12px_30px_rgba(249,115,22,0.08)]">
                {(() => {
                  const maintenanceParts = Array.isArray(vehicleReport.maintenance.parts_used)
                    ? vehicleReport.maintenance.parts_used
                    : [];
                  const maintenanceSummaryItems = [
                    vehicleReport.maintenance.maintenance_type || null,
                    ...maintenanceParts
                      .map((part) => part.item_name || part.part_name)
                      .filter(Boolean)
                      .slice(0, 3)
                  ];
                  const uniqueSummaryItems = [...new Set(maintenanceSummaryItems)];
                  const hasMoreParts = maintenanceParts.length > 3;

                  return uniqueSummaryItems.length > 0 ? (
                    <div className="rounded-2xl border border-orange-200 bg-white/80 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Work performed</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {uniqueSummaryItems.join(' • ')}
                        {hasMoreParts ? ' • more items' : ''}
                      </p>
                    </div>
                  ) : null;
                })()}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Linked Maintenance</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {vehicleReport.maintenance.maintenance_type || 'Repair'} • {vehicleReport.maintenance.status || 'scheduled'}
                    </p>
                    <p className="text-xs text-orange-700 mt-1">
                      Ref: {formatMaintenanceReference(vehicleReport.maintenance.id)}
                    </p>
                  </div>
                  <Badge className="bg-orange-100 text-orange-800">
                    {vehicleReport.maintenance.status || 'scheduled'}
                  </Badge>
                </div>
                {vehicleReport.maintenance.status === 'completed' ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50/80 p-3">
                    <p className="text-sm font-semibold text-green-900">Repair completed</p>
                    <p className="mt-1 text-xs text-green-700">
                      The linked Quad Maintenance record is complete. This rental is now ready to be reviewed and closed with the final bill.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-orange-200 bg-white/80 p-3">
                    <p className="text-sm font-semibold text-orange-900">Vehicle under maintenance</p>
                    <p className="mt-1 text-xs text-orange-700">
                      Finish the linked Quad Maintenance record to pull the final repair total back into this rental and close it with confidence.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Parts</p>
                    <p className="font-medium text-gray-900">{formatCurrency(vehicleReport.maintenance.parts_cost_mad || 0)} MAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Labor</p>
                    <p className="font-medium text-gray-900">{formatCurrency(vehicleReport.maintenance.labor_rate_mad || 0)} MAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">External</p>
                    <p className="font-medium text-gray-900">{formatCurrency(vehicleReport.maintenance.external_cost_mad || 0)} MAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Bill</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(vehicleReport.maintenance.cost || 0)} MAD</p>
                  </div>
                </div>
                {vehicleReport.customer_chargeable && (
                  <div className="space-y-3 rounded-[24px] border border-blue-200 bg-blue-50/80 p-4 shadow-[0_12px_30px_rgba(59,130,246,0.08)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Maintenance stay charge</p>
                        <p className="mt-1 text-xs text-blue-700">
                          Uses the saved rate first, then falls back to the vehicle model tier or base daily price.
                        </p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800">
                        {getMaintenanceStayRateSourceLabel(maintenanceChargeForm.source)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Days in maintenance</label>
                        <input
                          type="number"
                          min="1"
                          value={maintenanceChargeForm.days || ''}
                          disabled={maintenanceChargeLocked}
                          onChange={(e) => {
                            const days = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
                            setMaintenanceChargeForm(prev => ({
                              ...prev,
                              days,
                              total: calculateMaintenanceStayTotal(days, prev.dailyRate, prev.discount),
                              source: prev.source === 'none' ? 'manual' : prev.source,
                            }));
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Daily rate (MAD)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={maintenanceChargeForm.dailyRate || ''}
                          disabled={maintenanceChargeLocked}
                          onChange={(e) => {
                            const dailyRate = Math.max(0, Number(e.target.value || 0));
                            setMaintenanceChargeForm(prev => ({
                              ...prev,
                              dailyRate,
                              total: calculateMaintenanceStayTotal(prev.days, dailyRate, prev.discount),
                              source: 'manual',
                            }));
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Employee discount (MAD)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={maintenanceChargeForm.discount || ''}
                          disabled={maintenanceChargeLocked}
                          onChange={(e) => {
                            const discount = Math.max(0, Number(e.target.value || 0));
                            setMaintenanceChargeForm(prev => ({
                              ...prev,
                              discount,
                              total: calculateMaintenanceStayTotal(prev.days, prev.dailyRate, discount),
                            }));
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl border border-blue-100 bg-white/85 p-3">
                        <p className="text-xs text-gray-500">Stay subtotal</p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {formatCurrency((maintenanceChargeForm.days || 0) * (maintenanceChargeForm.dailyRate || 0))} MAD
                        </p>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-white/85 p-3">
                        <p className="text-xs text-gray-500">Discount</p>
                        <p className="mt-1 font-semibold text-green-700">
                          -{formatCurrency(maintenanceChargeForm.discount || 0)} MAD
                        </p>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-white/85 p-3">
                        <p className="text-xs text-gray-500">Stay charge total</p>
                        <p className="mt-1 font-semibold text-blue-900">
                          {formatCurrency(maintenanceChargeForm.total || 0)} MAD
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-xs text-blue-700">
                        Final customer charge = maintenance bill {formatCurrency(vehicleReport.maintenance.cost || 0)} MAD + stay charge {formatCurrency(maintenanceChargeForm.total || 0)} MAD
                        {maintenanceChargeLocked ? ' • Contract completed, charge setup locked.' : ''}
                      </p>
                      <Button
                        type="button"
                        onClick={saveMaintenanceChargeConfig}
                        disabled={savingMaintenanceCharge || maintenanceChargeLocked}
                        className="rounded-2xl bg-violet-600 text-xs text-white shadow-sm hover:bg-violet-700"
                      >
                        <Save className="w-3 h-3 mr-1.5" />
                        {savingMaintenanceCharge
                          ? tr('Saving...', 'Enregistrement...')
                          : maintenanceChargeLocked
                            ? tr('Charge setup locked', 'Configuration de frais verrouillée')
                            : tr('Register charge configuration', 'Enregistrer la configuration des frais')}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    onClick={() => navigate(`/admin/maintenance?maintenanceId=${vehicleReport.maintenance.id}`)}
                    className="rounded-2xl border border-slate-200 bg-white text-xs text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Wrench className="w-3 h-3 mr-1.5" />
                    {tr('Open in Quad Maintenance', 'Ouvrir dans Quad Maintenance')}
                  </Button>
                </div>
              </div>
            ) : vehicleReport.send_to_maintenance ? (
              <div className="rounded-2xl border border-yellow-200 bg-yellow-50/80 p-3 text-sm text-yellow-800 shadow-[0_12px_30px_rgba(234,179,8,0.08)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span>Maintenance has been requested for this report and will appear here once the linked record is available.</span>
                  <Button
                    type="button"
                    onClick={() => navigate(`/admin/maintenance?action=create&reportId=${vehicleReport.id}&vehicleId=${rental.vehicle_id}&rentalId=${rental.id}`)}
                    className="rounded-2xl border border-slate-200 bg-white text-xs text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Wrench className="w-3 h-3 mr-1.5" />
                    {tr('Open in Quad Maintenance', 'Ouvrir dans Quad Maintenance')}
                  </Button>
                </div>
              </div>
            ) : null}

            {vehicleReport.customer_chargeable && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3 shadow-[0_12px_30px_rgba(59,130,246,0.08)]">
                <p className="text-sm font-medium text-blue-900">
                  Customer chargeable amount: {formatCurrency(vehicleReport.customer_charge_amount || vehicleReport.maintenance_cost_total || 0)} MAD
                </p>
                {(vehicleReport.maintenance_daily_total || 0) > 0 && (
                  <p className="mt-1 text-xs text-blue-700">
                    Includes maintenance stay charge of {formatCurrency(vehicleReport.maintenance_daily_total || 0)} MAD
                    {vehicleReport.maintenance_daily_discount > 0 ? ` after ${formatCurrency(vehicleReport.maintenance_daily_discount)} MAD discount` : ''}.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}
      
      {(isScheduled || isActive || isCompleted) && (
        <div className="mb-6" ref={rentalMediaSectionRef}>
          <RentalVideos 
            key={videoRefreshKey} 
            rental={rental} 
            onUpdate={handleVideoUpdate} 
            isProcessing={isProcessingVideo} 
          />
        </div>
      )}

      {/* Extension History Section */}
      {extensions.length > 0 && (
  <div className="mb-6">
    <ExtensionHistory 
      extensions={extensions}
      onApprove={isAdmin ? handleApproveExtension : undefined} // Only pass if admin
      onReject={isAdmin ? handleRejectExtension : undefined} // Only pass if admin
      isAdmin={isAdmin}
      onEdit={canEditExtensionEntries ? handleEditExtension : undefined}
      canEdit={canEditExtensionEntries}
    />

          {/* Completed Rental Message */}
          {closingMedia.length > 0 && rental.rental_status === 'completed' && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-[0_12px_30px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className="font-semibold text-green-900">{tr('Rental Completed', 'Location terminée')}</h4>
                  <p className="text-sm text-green-700 mt-1">
                    {tr('This rental has been completed and closed. Extensions are no longer available.', 'Cette location a été terminée et clôturée. Les prolongations ne sont plus disponibles.')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="mb-6 overflow-hidden rounded-[28px] border border-violet-100/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/70 pb-4">
          <CardTitle className="text-xl text-slate-900">{tr('Rental Information', 'Informations de location')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-5 sm:p-6">
          {(createdByDisplay || startedByDisplay || signedByDisplay) && (
            <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">👤 {tr('Rental Staff', 'Personnel de location')}</h3>
                  <p className="mt-1 text-xs text-slate-500">{tr('Who created, signed, and started this rental.', 'Qui a créé, signé et démarré cette location.')}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!showHistory) await loadRentalHistory(rental.id);
                    setShowHistory(h => !h);
                  }}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  {showHistory ? tr('Hide', 'Masquer') : `📋 ${tr('History', 'Historique')}`}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-3">
                <p><strong>{tr('Created by:', 'Créée par :')}</strong> {createdByDisplay}</p>
                {signedByDisplay && <p><strong>{tr('Signed by:', 'Signée par :')}</strong> {signedByDisplay}</p>}
                {startedByDisplay && <p><strong>{tr('Started by:', 'Démarrée par :')}</strong> {startedByDisplay}</p>}
              </div>
              {showHistory && (
                <div className="mt-3 border-t border-violet-100 pt-3">
                  <p className="mb-2 text-xs font-semibold text-slate-500">{tr('Action History', 'Historique des actions')}</p>
                  {rentalHistory.length === 0 ? (
                    <p className="text-xs italic text-slate-400">{tr('No history yet — run SQL migration first', 'Aucun historique pour le moment — exécutez d’abord la migration SQL')}</p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {rentalHistory.map((log, i) => (
                        <div key={i} className="flex gap-2 border-b border-slate-100 py-1 text-xs last:border-0">
                          <span className="whitespace-nowrap text-slate-400">
                            {new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="flex-1 text-slate-700">{log.description}</span>
                          {log.user_name && <span className="whitespace-nowrap text-blue-600">{log.user_name}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
            <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{tr('Customer Details', 'Détails client')}</h3>
              <Button onClick={() => handleViewCustomerDetails(rental.customer_id)} size="sm" className="rounded-xl border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100">
                <User className="mr-2 h-4 w-4" />
                {tr('View Details', 'Voir les détails')}
              </Button>
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2 text-sm sm:text-base text-slate-700">
              <p><strong>{tr('Full Name:', 'Nom complet :')}</strong> {syncedCustomerDetails.fullName || tr('N/A', 'N/D')}</p>
              <p><strong>{tr('Email:', 'Email :')}</strong> {syncedCustomerDetails.email || tr('N/A', 'N/D')}</p>
              <p><strong>{tr('Phone:', 'Téléphone :')}</strong> {syncedCustomerDetails.phone || tr('N/A', 'N/D')}</p>
              <p><strong>{tr('ID/License:', 'ID/Permis :')}</strong> {syncedCustomerDetails.licenceNumber || tr('N/A', 'N/D')}</p>
            </div>
          </div>
          {hasSecondDriver && (
            <>
              <Separator />
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                <h3 className="font-semibold mb-3 text-lg">
                  {tr('Additional Drivers', 'Conducteurs supplémentaires')} ({secondDriversList.length})
                </h3>
                <div className="mt-2 rounded-2xl border border-violet-100 bg-slate-50/70 p-4 text-sm text-slate-600">
                  <p>
                    {secondDriversList.length === 1
                      ? tr('1 additional driver is linked to this rental.', '1 conducteur supplémentaire est lié à cette location.')
                      : `${secondDriversList.length} ${tr('additional drivers are linked to this rental.', 'conducteurs supplémentaires sont liés à cette location.')}`}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {tr('Open the side panel to view ID image, license details, and scanned information.', 'Ouvrez le panneau latéral pour voir l’image de la pièce, les détails du permis et les informations scannées.')}
                  </p>
                </div>
                <Button onClick={handleViewAdditionalDrivers} size="sm" className="mt-4 rounded-xl border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100">
                    <Users className="w-4 h-4 mr-2" />
                    {tr('View Additional Driver', 'Voir le conducteur supplémentaire')}{secondDriversList.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
          <Separator className="bg-violet-100" />
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">{tr('Vehicle Details', 'Détails véhicule')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base text-slate-700">
              <p><strong>{tr('Vehicle:', 'Véhicule :')}</strong> {rental.vehicle?.name}</p>
              <p><strong>{tr('Model:', 'Modèle :')}</strong> {rental.vehicle?.model}</p>
              <p><strong>{tr('Plate:', 'Plaque :')}</strong> {rental.vehicle?.plate_number}</p>
              <p><strong>{tr('Type:', 'Type :')}</strong> {rental.vehicle?.vehicle_type}</p>
              {rental.start_odometer && (
                <div className="flex items-center gap-2">
                  {isEditingStartOdometer ? (
                    <div className="flex items-center gap-1">
                      <strong>{tr('Start Odometer:', 'Kilométrage départ :')}</strong>
                      <input type="number" value={startOdometerEditValue}
                        onChange={e => setStartOdometerEditValue(e.target.value)}
                        className="w-24 border border-gray-300 rounded px-2 py-0.5 text-sm" min={0} autoFocus />
                      <span className="text-sm text-gray-500">km</span>
                      <Button type="button" size="sm" onClick={handleEditStartOdometer} className="h-6 px-2 bg-blue-600 text-white text-xs">{tr('Save', 'Enregistrer')}</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingStartOdometer(false)} className="h-6 px-2 text-xs">✕</Button>
                    </div>
                  ) : (
                    <>
                      <p><strong>{tr('Start Odometer:', 'Kilométrage départ :')}</strong> {rental.start_odometer} km</p>
                      {isCompleted && ['admin', 'owner', 'employee'].includes(currentUser?.role) && (
                        <Button type="button" onClick={() => { setIsEditingStartOdometer(true); setStartOdometerEditValue(rental.start_odometer?.toString() || ''); }}
                          size="sm" variant="ghost" className="h-6 w-6 p-0" title={tr('Edit start odometer', 'Modifier le kilométrage de départ')}>
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
              {rental.ending_odometer && (
                <div className="flex items-center gap-2">
                  {isEditingEndOdometer ? (
                    <div className="flex items-center gap-1">
                      <strong>{tr('End Odometer:', 'Kilométrage retour :')}</strong>
                      <input ref={endOdometerEditInputRef} type="number" value={endOdometerEditValue}
                        onChange={e => setEndOdometerEditValue(e.target.value)}
                        className="w-24 border border-gray-300 rounded px-2 py-0.5 text-sm" min={0} autoFocus />
                      <span className="text-sm text-gray-500">km</span>
                      <Button type="button" size="sm" onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveEndOdometer(endOdometerEditValue);
                      }} className="h-6 px-2 bg-blue-600 text-white text-xs">{tr('Save', 'Enregistrer')}</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingEndOdometer(false)} className="h-6 px-2 text-xs">✕</Button>
                    </div>
                  ) : (
                    <>
                      <p><strong>{tr('End Odometer:', 'Kilométrage retour :')}</strong> {rental.ending_odometer} km</p>
                      {isCompleted && ['admin', 'owner', 'employee'].includes(currentUser?.role) && (
                        <Button type="button" onClick={() => { setIsEditingEndOdometer(true); setEndOdometerEditValue(rental.ending_odometer?.toString() || ''); }}
                          size="sm" variant="ghost" className="h-6 w-6 p-0" title={tr('Edit end odometer', 'Modifier le kilométrage de retour')}>
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
              {rental.total_kilometers_driven && (
                <p><strong>{tr('Total Distance:', 'Distance totale :')}</strong> {(rental.total_kilometers_driven || 0).toFixed(2)} km</p>
              )}
              {/* Fuel Information Display */}
              {(rental.start_fuel_level !== null || startFuelLevel !== null) && (
                <div>
                  <p>
                    <strong>⛽ {tr('Fuel at Departure:', 'Carburant au départ :')}</strong>{' '}
                    <span className="text-blue-600 font-semibold">
                      {startFuelLevel || rental.start_fuel_level}/8
                    </span>
                  </p>
                  {/* Fuel Gauge Progress Bar */}
                  <div className="flex gap-0.5 mt-1">
                    {[1,2,3,4,5,6,7,8].map(segment => (
                      <div 
                        key={segment}
                        className={`w-3 h-5 rounded ${segment <= (startFuelLevel || rental.start_fuel_level) ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {(rental.end_fuel_level !== null || endFuelLevel !== null) && (
                <div>
                  <p>
                    <strong>⛽ {tr('Fuel at Return:', 'Carburant au retour :')}</strong>{' '}
                    <span className={`font-semibold ${
                      (endFuelLevel || rental.end_fuel_level) >= (startFuelLevel || rental.start_fuel_level) 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }`}>
                      {endFuelLevel || rental.end_fuel_level}/8
                    </span>
                    {(endFuelLevel || rental.end_fuel_level) >= (startFuelLevel || rental.start_fuel_level) && (
                      <span className="text-green-600 ml-2">✓</span>
                    )}
                  </p>
                  {/* Fuel Gauge Progress Bar */}
                  <div className="flex gap-0.5 mt-1">
                    {[1,2,3,4,5,6,7,8].map(segment => (
                      <div 
                        key={segment}
                        className={`w-3 h-5 rounded ${segment <= (endFuelLevel || rental.end_fuel_level) ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* FUEL CHARGE - only show when toggle ON, end fuel recorded, and deficit > 0 */}
              {(() => {
                const startL  = startFuelLevel ?? rental.start_fuel_level ?? null;
                const endL    = endFuelLevel   ?? rental.end_fuel_level   ?? null;
                const deficit = (startL !== null && endL !== null) ? Math.max(0, startL - endL) : 0;
                const charge = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });

                // Toggle ON + end fuel recorded + deficit > 0 → show charge
                if (fuelChargeEnabled && endL !== null && deficit > 0 && charge > 0) {
                  return (
                    <p className="col-span-2">
                      <strong>⛽ {tr('Fuel Charge:', 'Frais carburant :')}</strong>{' '}
                      <span className="text-red-600 font-semibold">
                        {deficit} lines × {fuelPricePerLine || 0} MAD = {charge.toFixed(2)} MAD
                      </span>
                    </p>
                  );
                }

                // Toggle ON + end fuel recorded + no deficit → show no charge
                if (fuelChargeEnabled && endL !== null && deficit === 0) {
                  return (
                    <p className="col-span-2 text-sm text-green-600">
                      <strong>⛽ {tr('Fuel:', 'Carburant :')}</strong> {tr('Returned full — no charge ✓', 'Rendu plein — aucun frais ✓')}
                    </p>
                  );
                }

                // Toggle OFF → show included
                if (!fuelChargeEnabled && startL !== null) {
                  return (
                    <p className="col-span-2 text-sm text-green-600">
                      <strong>⛽ {tr('Fuel:', 'Carburant :')}</strong> {tr('Included in rate ✓', 'Inclus dans le tarif ✓')}
                    </p>
                  );
                }

                return null;
              })()}
            </div>

            {/* ========== PACKAGE SUMMARY - OVERRIDES TIER PRICING ========== */}
            {(rental.package || packageDetails) && (
              <div className="mt-4 p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-5 h-5 text-purple-600" />
                  <h4 className="font-semibold text-purple-900">{tr('Selected Package', 'Forfait sélectionné')}</h4>
                  <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full ml-auto">
                    {tr('Package Applied', 'Forfait appliqué')}
                  </span>
                </div>
                
                {(() => {
                  const pkg = packageDetails || rental?.package;
                  if (!pkg) return null;
                  const packageRate = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
                  const duration = rental.rental_type === 'hourly'
                    ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
                    : (rental.quantity_days ?? 1);
                  
                  return (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{tr('Package:', 'Forfait :')}</span>
                        <span className="text-sm font-bold text-purple-700">{pkg.name || tr('Kilometer Package', 'Forfait kilométrique')}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{tr('Rate per', 'Tarif par')} {rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour')}:</span>
                        <span className="text-sm font-bold text-gray-900">{packageRate.toFixed(2)} MAD</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{tr('Duration:', 'Durée :')}</span>
                        <span className="text-sm font-bold text-gray-900">
                          {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? tr('hours', 'heures') : tr('days', 'jours')) : (rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour'))}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                        <span className="text-base font-semibold text-purple-900">{tr('Package Total:', 'Total forfait :')}</span>
                        <span className="text-xl font-bold text-purple-700">
                          {(packageRate * duration).toFixed(2)} MAD
                        </span>
                      </div>

                      {/* Package Features */}
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {pkg.included_kilometers && (
                          <div className="bg-green-50 px-3 py-2 rounded-lg border border-green-100">
                            <div className="text-xs text-green-600 font-medium">✓ {tr('Included KM', 'KM inclus')}</div>
                            <div className="text-sm font-bold text-green-700">{pkg.included_kilometers} km</div>
                          </div>
                        )}
                        {pkg.extra_km_rate > 0 && (
                          <div className="bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
                            <div className="text-xs text-orange-600 font-medium">{tr('Extra KM rate', 'Tarif km supplémentaire')}</div>
                            <div className="text-sm font-bold text-orange-600">{pkg.extra_km_rate} MAD/km</div>
                          </div>
                        )}
                      </div>

                      {/* Overage Calculation if applicable */}
                      {rental.total_kilometers_driven > 0 && pkg.included_kilometers && (
                        <div className="mt-2 text-xs bg-white p-2 rounded border border-purple-100">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium text-gray-700">{tr('Distance summary:', 'Résumé distance :')} </span>
                              <span>{rental.total_kilometers_driven} km driven</span>
                              {rental.total_kilometers_driven > pkg.included_kilometers ? (
                                <span className="text-orange-600 block mt-1">
                                  ⚠️ {tr('Extra:', 'Supplément :')} {rental.total_kilometers_driven - pkg.included_kilometers} km × {pkg.extra_km_rate} MAD = {' '}
                                  {((rental.total_kilometers_driven - pkg.included_kilometers) * pkg.extra_km_rate).toFixed(2)} MAD
                                </span>
                              ) : (
                                <span className="text-green-600 block mt-1">
                                  ✓ {tr('Within package limit', 'Dans la limite du forfait')} ({pkg.included_kilometers} km)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Only show Tier Pricing if NO package is selected and it is a real discounted tier */}
            {!rental.package && !packageDetails && tierPricingBreakdown?.isDiscounted && (rental?.rental_type === 'hourly' || rental?.rental_type === 'daily') && (
              <div className="col-span-1 sm:col-span-2 mt-4">
                <TierPricingDisplay 
                  breakdown={tierPricingBreakdown} 
                  isMobile={window.innerWidth < 640} 
                />
              </div>
            )}

            {/* If no package and no discounted tier pricing, show standard/base rate info */}
            {!rental.package && !packageDetails && (!tierPricingBreakdown || !tierPricingBreakdown.isDiscounted) && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-blue-900">
                        {rental.rental_type === 'daily' ? tr('Base Daily Rate Applied', 'Tarif journalier de base appliqué') : tr('Standard Rate Applied', 'Tarif standard appliqué')}
                    </h4>
                    <p className="text-sm text-blue-700 mt-1">
                      {rental.rental_type === 'hourly' ? (rental.quantity_hours ?? rental.quantity_days ?? 0) : (rental.quantity_days || 0)} {rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour')}{' '}
                      {tr('rental at', 'de location à')} {rental.unit_price?.toFixed(2)} MAD
                      {rental.rental_type === 'hourly' ? '/heure' : '/jour'}
                    </p>
                    {tierPricingBreakdown?.isSamePrice && rental.rental_type === 'daily' && (
                      <p className="text-xs text-blue-600 mt-2">
                        {tr('This rental is using the normal base daily price, so no tier discount breakdown applies.', 'Cette location utilise le tarif journalier de base normal ; aucun détail de remise par palier ne s’applique.')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <Separator className="bg-slate-100" />
          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">{tr('Rental Period', 'Période de location')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base text-slate-700">
              <p><strong>{tr('Start:', 'Début :')}</strong> {new Date(rental.started_at || rental.rental_start_date).toLocaleString(isFrench ? 'fr-FR' : 'en-US')}
   {rental.started_at && <span className="text-green-600 text-xs ml-2">({tr('Actual', 'Réel')})</span>}</p>
              <p><strong>{tr('End:', 'Fin :')}</strong> {
                (() => {
                  // Use the latest of rental_end_date and actual_end_date (both updated by extensions)
                  const endDate = new Date(rental.rental_end_date);
                  const actualDate = rental.actual_end_date ? new Date(rental.actual_end_date) : null;
                  // Pick whichever is later to ensure we show the most current end date
                  const displayDate = actualDate && actualDate > endDate ? actualDate : endDate;
                  return displayDate.toLocaleString(isFrench ? 'fr-FR' : 'en-US');
                })()
              }
   {(() => {
     const hasExt = rental.extensions?.some(e => e.status === 'approved');
     if (hasExt) return <span className="text-green-600 text-xs ml-2">({tr('Extended', 'Prolongée')})</span>;
     if (rental.actual_end_date) return <span className="text-blue-600 text-xs ml-2">({tr('Adjusted', 'Ajustée')})</span>;
     return <span className="text-gray-500 text-xs ml-2">({tr('Scheduled', 'Planifiée')})</span>;
   })()}</p>
              <p><strong>{tr('Type:', 'Type :')}</strong> 
                  <span className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 ml-2 rounded-full text-sm font-bold capitalize
                    ${rental.rental_type === 'hourly' 
                      ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                      : rental.rental_type === 'daily'
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-purple-100 text-purple-800 border border-purple-300'
                    }
                  `}>
                    {rental.rental_type === 'hourly' && <Clock className="w-4 h-4" />}
                    {rental.rental_type === 'daily' && <Calendar className="w-4 h-4" />}
                    {(!rental.rental_type || rental.rental_type === 'weekly' || rental.rental_type === 'monthly') && 
                      <Calendar className="w-4 h-4" />
                    }
                    {rental.rental_type || tr('daily', 'journalière')}
                  </span>
                </p>
              <p><strong>{tr('Pickup:', 'Départ :')}</strong> {rental.pickup_location}</p>

            </div>
          </div>
           <Separator className="bg-slate-100" />
          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">{tr('Inclusions & Add-ons', 'Inclus et options')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm sm:text-base text-slate-700">
                <p><strong>{tr('Insurance:', 'Assurance :')}</strong> {rental.insurance_included ? tr('Yes', 'Oui') : tr('No', 'Non')}</p>
                <p><strong>{tr('Helmet:', 'Casque :')}</strong> {rental.helmet_included ? tr('Yes', 'Oui') : tr('No', 'Non')}</p>
                <p><strong>{tr('Gear:', 'Équipement :')}</strong> {rental.gear_included ? tr('Yes', 'Oui') : tr('No', 'Non')}</p>
            </div>
          </div>
          <Separator className="bg-slate-100" />
          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">{tr('Financial Information', 'Informations financières')}</h3>
            {!isEditingPrice && canEditLifecycleRentalPrice && (
              <div className="mb-4 flex justify-end">
                <Button
                  type="button"
                  onClick={handleEditPrice}
                  size="sm"
                  className={PRIMARY_ACTION_BUTTON_CLASS}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {tr('Edit Rental Cost', 'Modifier le coût de location')}
                </Button>
              </div>
            )}
  
  {isPendingApproval && (
    <Alert className="mb-4 bg-yellow-50 border-yellow-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <AlertDescription className="text-yellow-800">
            <strong>{tr('Pending Admin Approval', 'Approbation admin en attente')}</strong>
            <p className="mt-1">{tr('Manual price override requested:', 'Demande de modification manuelle du prix :')} <strong>{rental.pending_total_request} MAD</strong></p>
            {priceOverrideNoteText && (
              <p className="mt-1 text-sm">{tr('Reason:', 'Raison :')} {priceOverrideNoteText}</p>
            )}
          </AlertDescription>
        </div>
        
        {!isAdmin && (
          <Button
            onClick={handlePriceApprovalRequest}
            className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
            size="sm"
            disabled={isSharing}
          >
            <FaWhatsapp className="w-4 h-4 mr-2" />
            {isSharing ? tr('Sending...', 'Envoi...') : tr('Notify Admin via WhatsApp', 'Notifier l’admin via WhatsApp')}
          </Button>
        )}
      </div>
    </Alert>
  )}

  {isPendingApproval && isAdmin && (
    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h4 className="font-semibold text-blue-900 mb-3">{tr('Price Approval Required', 'Approbation du prix requise')}</h4>
      <div className="space-y-2 mb-3 text-sm">
        <p><strong>{tr('Current Auto Price:', 'Prix auto actuel :')}</strong> {rental.total_amount} MAD</p>
        <p><strong>{tr('Requested Manual Price:', 'Prix manuel demandé :')}</strong> {rental.pending_total_request} MAD</p>
        {priceOverrideNoteText && (
          <p><strong>{tr('Reason:', 'Raison :')}</strong> {priceOverrideNoteText}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button 
          onClick={handleApprovePrice}
          className="bg-green-600 hover:bg-green-700 text-white"
          size="sm"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {tr('Approve', 'Approuver')}
        </Button>
        <Button 
          onClick={handleDeclinePrice}
          variant="destructive"
          size="sm"
        >
          <XCircle className="w-4 h-4 mr-2" />
          {tr('Decline', 'Refuser')}
        </Button>
      </div>
    </div>
  )}

  {hasAppliedManualPriceOverride && (
    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/80 p-4 shadow-[0_12px_30px_rgba(76,29,149,0.08)]">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
        <div className="text-sm text-violet-900">
          <p className="font-semibold">
            {tr('Manual contract price applied', 'Prix manuel du contrat appliqué')}
          </p>
          {effectivePriceOverrideMeta?.editedByName && (
            <p className="mt-1">
              {tr('Contract edited by:', 'Contrat modifié par :')} <strong>{effectivePriceOverrideMeta.editedByName}</strong>
            </p>
          )}
          {effectivePriceOverrideMeta?.previousPrice > 0 && (
            <p className="mt-1">
              {tr('Previous contract price:', 'Prix précédent du contrat :')}{' '}
              <strong>{formatCurrency(effectivePriceOverrideMeta.previousPrice)} MAD</strong>
            </p>
          )}
          {(effectivePriceOverrideMeta?.newPrice > 0 || rental.total_amount > 0) && (
            <p className="mt-1">
              {tr('New contract price:', 'Nouveau prix du contrat :')}{' '}
              <strong>{formatCurrency(effectivePriceOverrideMeta?.newPrice || rental.total_amount || 0)} MAD</strong>
            </p>
          )}
          {(effectivePriceOverrideMeta?.previousPrice > 0 || effectivePriceOverrideMeta?.newPrice > 0) && (
            <p className="mt-1">
              {tr('Price change:', 'Changement de prix :')}{' '}
              <strong>{formatCurrency(effectivePriceOverrideMeta?.previousPrice || 0)} MAD</strong>
              {' → '}
              <strong>{formatCurrency(effectivePriceOverrideMeta?.newPrice || rental.total_amount || 0)} MAD</strong>
            </p>
          )}
          <p className="mt-1">
            {tr('Current contract price:', 'Prix actuel du contrat :')} <strong>{formatCurrency(rental.total_amount || 0)} MAD</strong>
          </p>
          {priceOverrideNoteText && (
            <p className="mt-1">
              {tr('Override note:', 'Note de modification :')} {priceOverrideNoteText}
            </p>
          )}
        </div>
      </div>
    </div>
  )}

  {!isEditingPrice ? (
    <div className="space-y-3 text-sm sm:text-base">
      {/* Package Information Display - OVERRIDES tier pricing */}
      {getRentalKilometerPackage(rental, packageDetails) ? (
        (() => {
          const pkg = getRentalKilometerPackage(rental, packageDetails);
          if (!pkg) return null;
          
          const packageRate = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
          const duration = rental.rental_type === 'hourly'
            ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
            : (rental.quantity_days ?? 1);
          
          // Calculate total included kilometers for the entire duration
          const totalIncludedKm = pkg.included_kilometers ? pkg.included_kilometers * duration : null;
          
          return (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-3">
              <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                <Package className="w-5 h-5" />
                {tr('Package Applied:', 'Forfait appliqué :')} {pkg.name || tr('Kilometer Package', 'Forfait kilométrique')}
              </h4>
              
              <div className="space-y-3">
                {/* Rate and Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 mb-1">{tr('Rate per', 'Tarif par')} {rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour')}</div>
                    <div className="text-lg font-bold text-gray-900">{packageRate.toFixed(2)} MAD</div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 mb-1">{tr('Duration', 'Durée')}</div>
                    <div className="text-lg font-bold text-gray-900">
                      {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? tr('hours', 'heures') : tr('days', 'jours')) : (rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour'))}
                    </div>
                  </div>
                </div>

                {/* Package Features */}
                <div className="grid grid-cols-2 gap-3">
                  {pkg.included_kilometers && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                      <div className="flex flex-col">
                        <span className="text-xs text-green-600 font-medium">{tr('Included per unit', 'Inclus par unité')}</span>
                        <span className="text-sm font-bold text-green-700">{pkg.included_kilometers} km</span>
                        <span className="text-xs text-gray-500 mt-1">
                          &times; {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? tr('hours', 'heures') : tr('days', 'jours')) : (rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour'))}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {totalIncludedKm && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="flex flex-col">
                        <span className="text-xs text-blue-600 font-medium">{tr('Total included', 'Total inclus')}</span>
                        <span className="text-lg font-bold text-blue-700">{totalIncludedKm} km</span>
                        <span className="text-xs text-gray-500 mt-1">
                          {pkg.included_kilometers} km &times; {duration}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Extra KM Rate */}
                {pkg.extra_km_rate > 0 && (
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                    <div className="flex items-center justify-between">
                    <span className="text-sm text-orange-700">{tr('Extra KM rate:', 'Tarif km supplémentaire :')}</span>
                      <span className="text-lg font-bold text-orange-600">{parseFloat(pkg.extra_km_rate).toFixed(2)} MAD/km</span>
                    </div>
                  </div>
                )}

                {/* Package Total */}
                <div className="bg-purple-100 p-4 rounded-lg border-2 border-purple-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-purple-800">{tr('Package Total', 'Total du forfait')}</span>
                      <div className="text-xs text-purple-600 mt-1">
                        {packageRate.toFixed(2)} MAD &times; {duration} = {(packageRate * duration).toFixed(2)} MAD
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-purple-800">
                      {(packageRate * duration).toFixed(2)} MAD
                    </span>
                  </div>
                </div>

                {/* Info Note */}
                <div className="text-xs text-gray-500 bg-white p-2 rounded border border-purple-100">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-gray-700">{tr('Package summary:', 'Résumé du forfait :')} </span>
                      {pkg.included_kilometers ? (
                        <>
                          {tr('Total included kilometers:', 'Kilomètres inclus au total :')} {totalIncludedKm} km ({pkg.included_kilometers} km &times; {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? tr('hours', 'heures') : tr('days', 'jours')) : (rental.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour'))})
                          {pkg.extra_km_rate > 0 && ` • ${tr('Extra:', 'Supplément :')} ${pkg.extra_km_rate} MAD/km`}
                        </>
                      ) : (
                        `${tr('No kilometer limit', 'Aucune limite kilométrique')} • ${tr('Extra rate:', 'Tarif supplémentaire :')} ${pkg.extra_km_rate} MAD/km`
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* Single Distance & Overage Calculation */}
      {rental.total_kilometers_driven > 0 && (
          <div className="mb-3 rounded-2xl border border-violet-100 bg-slate-50/70 p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
          <h4 className="font-semibold text-gray-900 mb-3">🚗 {tr('Distance Summary', 'Résumé distance')}</h4>
          
          {/* Odometer Readings */}
          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between">
              <span>{tr('Start:', 'Début :')}</span>
              <span className="font-medium">{rental.start_odometer} km</span>
            </div>
            <div className="flex justify-between">
              <span>{tr('End:', 'Fin :')}</span>
              <span className="font-medium">{rental.ending_odometer} km</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">{tr('Total Distance:', 'Distance totale :')}</span>
              <span className="font-bold text-blue-600">{(rental.total_kilometers_driven || 0).toFixed(2)} km</span>
            </div>
          </div>

          {/* Overage Calculation */}
          {(() => {
  const pkg = getRentalKilometerPackage(rental, packageDetails);
  if (!pkg) return null;

  if (!includedKilometers || !extraKmRate) {
    return (
      <div className="bg-yellow-50 rounded-lg p-3">
        <p className="text-sm text-yellow-700">⚠️ Package rates not configured.</p>
      </div>
    );
  }
  
  const totalKm = rental.total_kilometers_driven || 0;
  const extraKm = Math.max(0, totalKm - includedKilometers);
  const overageCharge = extraKm * extraKmRate;
  
  return (
    <div className={`${extraKm > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'} rounded-2xl p-3`}>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{tr('Package limit:', 'Limite forfait :')}</span>
          <span className="font-medium">{includedKilometers} km</span>
        </div>
        {extraKm > 0 ? (
          <>
            <div className="flex justify-between text-sm text-orange-600">
              <span>{tr('Extra kilometers:', 'Kilomètres supplémentaires :')}</span>
              <span className="font-medium">+{extraKm} km</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-orange-200 pt-2">
              <span>{tr('Overage', 'Surcoût')} ({extraKmRate} MAD/km):</span>
              <span className="text-red-600">+{overageCharge.toFixed(2)} MAD</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-green-600 font-medium">
            ✅ {tr('Within package limit', 'Dans la limite du forfait')} ({totalKm} km ≤ {includedKilometers} km)
          </div>
        )}
      </div>
    </div>
  );
})()}
        </div>
      )}

      {hasImpoundChargeHistory && (
        <div className="mb-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-[0_12px_30px_rgba(245,158,11,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {isImpounded ? tr('Live additional rental time', 'Temps de location supplémentaire en direct') : tr('Additional rental time', 'Temps de location supplémentaire')}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                {isImpounded
                  ? tr('This is the real additional rental time already running now while the vehicle is still held.', 'Ceci correspond au temps de location supplémentaire réel déjà en cours tant que le véhicule reste retenu.')
                  : tr('Cancel impound keeps this at zero. Releasing impound finalizes the additional rental time using your normal pricing.', 'Annuler la fourrière maintient ce montant à zéro. La libération de la fourrière finalise le temps supplémentaire avec votre tarification normale.')}
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-800">
              {liveImpoundDisplay.pricingLabel || (rental?.rental_type === 'daily' ? 'Daily pricing' : 'Hourly pricing')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {liveImpoundDisplay.pricingMode === 'daily' ? tr('Live extra days', 'Jours supplémentaires en direct') : tr('Live extra hours', 'Heures supplémentaires en direct')}
              </label>
              <input
                type="number"
                min="0"
                value={liveImpoundDisplay.pricingMode === 'daily' ? (liveImpoundDisplay.days || '') : (liveImpoundDisplay.hours || '')}
                disabled
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tr('Exceeded time', 'Temps dépassé')}</label>
              <input
                type="text"
                value={`${liveImpoundDisplay.days || 0}d ${liveImpoundDisplay.hours || 0}h`}
                disabled
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tr('Current rental pricing (MAD)', 'Tarif location actuel (MAD)')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={liveImpoundDisplay.rate || ''}
                disabled
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tr('Employee discount (MAD)', 'Remise employé (MAD)')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={impoundChargeForm.discount || ''}
                disabled={!isImpounded || !canEditImpoundDiscount || impoundChargeLocked || savingImpoundCharge}
                onChange={(e) => {
                  const discount = Math.max(0, Number(e.target.value || 0));
                  setImpoundChargeForm(prev => ({
                    ...prev,
                    discount,
                    total: calculateImpoundChargeTotal(prev.days, prev.hours, prev.rate, discount, rental?.rental_type, prev.rateMode),
                  }));
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl border border-amber-100 bg-white/85 p-3">
              <p className="text-xs text-gray-500">{tr('Tier/base pricing', 'Tarif palier/base')}</p>
              <p className="mt-1 font-semibold text-gray-900">
                {formatCurrency(impoundChargeForm.rate || 0)} MAD
              </p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-white/85 p-3">
              <p className="text-xs text-gray-500">{tr('Discount', 'Remise')}</p>
              {Number(impoundChargeForm.discount || 0) > 0 ? (
                <p className="mt-1 font-semibold text-green-700">
                  -{formatCurrency(impoundChargeForm.discount || 0)} MAD
                </p>
              ) : (
                <p className="mt-1 font-semibold text-slate-600">
                  {tr('Not set yet', 'Pas encore défini')}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-amber-100 bg-white/85 p-3">
              <p className="text-xs text-gray-500">
                {rental?.released_from_impound_at ? tr('Amount paid', 'Montant payé') : tr('Live additional rental total', 'Total location supplémentaire en direct')}
              </p>
              <p className="mt-1 font-semibold text-amber-900">
                {formatCurrency(impoundChargeForm.total || 0)} MAD
              </p>
            </div>
          </div>

          {isImpounded && weekendImpoundEstimate && (
            <div className="rounded-[20px] border border-amber-300 bg-white/90 p-4 shadow-[0_12px_30px_rgba(245,158,11,0.08)] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">{tr('Weekend court estimate', 'Estimation week-end tribunal')}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {tr('This is the extra amount the customer should prepare for Monday, on top of the live running rental loss.', 'Ceci est le montant supplémentaire que le client doit préparer pour lundi, en plus de la perte locative déjà en cours.')}
                  </p>
                </div>
                <Badge className="bg-amber-100 text-amber-800">
                  {weekendImpoundEstimate.pricingLabel || 'Weekend estimate'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Live days now', 'Jours en cours')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {liveImpoundDays} day{liveImpoundDays === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Extra estimate to Monday', 'Estimation supplémentaire jusqu’à lundi')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {weekendEstimatedExtraDays} day{weekendEstimatedExtraDays === 1 ? '' : 's'}
                  </p>
                  {weekendEstimatedExtraDays > 0 && weekendEstimatedDailyRate > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {weekendEstimatedExtraDays} × {formatCurrency(weekendEstimatedDailyRate)} MAD/day
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Weekend estimate to add', 'Estimation week-end à ajouter')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatCurrency(weekendEstimatedExtraAmount)} MAD
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Estimated total by Monday', 'Total estimé d’ici lundi')}</p>
                  <p className="mt-1 text-lg font-bold text-red-600">
                    {formatCurrency(estimatedTotalByMonday)} MAD
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-amber-700">
              {rental?.released_from_impound_at
                ? `${tr('Released from impound at', 'Libéré de fourrière le')} ${formatImpoundDateTime(rental.released_from_impound_at)}.`
                : (impoundEstimatePreview?.note || tr('This estimate updates while the vehicle is held. Cancel impound keeps the extra rental estimate at 0 MAD.', 'Cette estimation se met à jour tant que le véhicule est retenu. L’annulation de la fourrière garde l’estimation supplémentaire à 0 MAD.'))}
              {impoundChargeLocked ? ` • ${tr('Contract completed, charge setup locked.', 'Contrat terminé, configuration du montant verrouillée.')}` : ''}
            </p>
            {isImpounded && (
              <Button
                type="button"
                onClick={saveImpoundChargeConfig}
                disabled={!canEditImpoundDiscount || savingImpoundCharge || impoundChargeLocked || !hasImpoundChargeHistory}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
              >
                <Save className="w-3 h-3 mr-1.5" />
                {savingImpoundCharge ? tr('Saving...', 'Enregistrement...') : impoundChargeLocked ? tr('Charge setup locked', 'Configuration verrouillée') : tr('Save estimate discount', 'Enregistrer la remise estimée')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Financial Breakdown - Single Source */}
      <div className="space-y-2">
        {/* Base Rental Rate - Use package rate when available */}
        <div className="flex justify-between">
          <span className="text-gray-600">{tr('Base Rental Rate:', 'Tarif de base location :')}</span>
          <span className="font-medium">
            {formatCurrency(rentalBillingSummary.baseAmount)} MAD
          </span>
        </div>

        {/* Overage Charge - Only once */}
        {(() => {
          return rentalBillingSummary.overageCharge > 0 ? (
            <div className="flex justify-between text-red-600">
              <span>{tr('Overage charge:', 'Frais dépassement :')}</span>
              <span className="font-medium">+{formatCurrency(rentalBillingSummary.overageCharge)} MAD</span>
            </div>
          ) : null;
        })()}

        {rentalBillingSummary.extensionFees > 0 && (
          <div className="flex justify-between text-purple-600">
            <span>{tr('Extensions:', 'Prolongations :')}</span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.extensionFees)} MAD</span>
          </div>
        )}

        {/* Fuel charge — gated on toggle + end fuel recorded + deficit */}
        {(() => {
          const startL  = startFuelLevel ?? rental?.start_fuel_level ?? null;
          const endL    = endFuelLevel   ?? rental?.end_fuel_level   ?? null;
          const deficit = (startL !== null && endL !== null) ? Math.max(0, startL - endL) : 0;
          const charge  = fuelCharge || parseFloat(rental?.fuel_charge || 0);

          // Toggle ON + end recorded + deficit → show charge
          if (fuelChargeEnabled && endL !== null && deficit > 0 && charge > 0) {
            return (
              <div className="flex justify-between text-red-600">
                <span>⛽ {tr('Fuel charge:', 'Frais carburant :')}</span>
                <span className="font-medium">+{formatCurrency(charge)} MAD</span>
              </div>
            );
          }

          // Toggle OFF → show included
          if (!fuelChargeEnabled && startL !== null) {
            return (
              <div className="flex justify-between text-green-600 text-sm">
                <span>⛽ {tr('Fuel:', 'Carburant :')}</span>
                <span className="font-medium">{tr('Included ✓', 'Inclus ✓')}</span>
              </div>
            );
          }

          return null;
        })()}

        {rentalBillingSummary.maintenanceRepairAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>{tr('Damage / Maintenance Bill:', 'Facture dommages / maintenance :')}</span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.maintenanceRepairAmount)} MAD</span>
          </div>
        )}

        {rentalBillingSummary.maintenanceStayAmount > 0 && (
          <div className="flex justify-between text-orange-600">
            <span>
              {tr('Maintenance stay', 'Séjour maintenance')} ({maintenanceChargeForm.days || vehicleReport?.maintenance_daily_days || 0} {((maintenanceChargeForm.days || vehicleReport?.maintenance_daily_days || 0) === 1 ? tr('day', 'jour') : tr('days', 'jours'))} × {formatCurrency(maintenanceChargeForm.dailyRate || vehicleReport?.maintenance_daily_rate || 0)} MAD):
            </span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.maintenanceStayAmount)} MAD</span>
          </div>
        )}

        {rentalBillingSummary.maintenanceDiscountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>{tr('Maintenance discount:', 'Remise maintenance :')}</span>
            <span className="font-medium">-{formatCurrency(rentalBillingSummary.maintenanceDiscountAmount)} MAD</span>
          </div>
        )}

        {rentalBillingSummary.impoundChargeAmount > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>
              {isImpounded ? tr('Live additional rental time', 'Temps supplémentaire en direct') : tr('Additional rental time', 'Temps supplémentaire')} (
              {liveImpoundDisplay.pricingLabel || `${liveImpoundDisplay.days || 0}d ${liveImpoundDisplay.hours || 0}h`}
              ):
            </span>
            <span className="font-medium">+{formatCurrency(Math.max(0, Number(rentalBillingSummary.impoundBaseChargeAmount || rentalBillingSummary.impoundChargeAmount || 0)))} MAD</span>
          </div>
        )}

        {rentalBillingSummary.impoundManualChargeAmount > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>{tr('Additional impound charge:', 'Frais de fourrière additionnels :')}</span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.impoundManualChargeAmount)} MAD</span>
          </div>
        )}

        {isImpounded && weekendEstimatedExtraAmount > 0 && (
          <div className="flex justify-between text-orange-700">
            <span>
              {tr('Weekend estimate to Monday', 'Estimation week-end jusqu’à lundi')} ({weekendEstimatedExtraDays} {tr('extra', 'suppl.')}{' '}{weekendEstimatedExtraDays === 1 ? tr('day', 'jour') : tr('days', 'jours')} × {formatCurrency(weekendEstimatedDailyRate)} MAD/{tr('day', 'jour')}):
            </span>
            <span className="font-medium">+{formatCurrency(weekendEstimatedExtraAmount)} MAD</span>
          </div>
        )}

        {rentalBillingSummary.impoundDiscountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>
              {rental?.released_from_impound_at && !rental?.is_impounded
                ? tr('Discounted by us:', 'Remis par nous :')
                : tr('Impound discount:', 'Remise fourrière :')}
            </span>
            <span className="font-medium">-{formatCurrency(rentalBillingSummary.impoundDiscountAmount)} MAD</span>
          </div>
        )}

        {isImpounded ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
            <div className="rounded-lg border border-amber-200 bg-white/85 p-4">
              <p className="text-sm font-semibold text-amber-900">{tr('Impound Estimate Summary', 'Résumé estimation fourrière')}</p>
              <p className="mt-1 text-xs text-amber-700">
                {tr('Live rental loss keeps running now. The weekend estimate shows the extra amount the customer should prepare for Monday release.', 'La perte locative en direct continue. L’estimation week-end indique le montant supplémentaire que le client doit préparer pour une libération lundi.')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Live Additional Rental Days', 'Jours supplémentaires en direct')}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {liveImpoundDays} day{liveImpoundDays === 1 ? '' : 's'}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Rental Already Paid', 'Location déjà payée')}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(rentalBillingSummary.depositPaid)} MAD</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Security Deposit Held', 'Dépôt de garantie retenu')}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(rentalBillingSummary.damageDepositHeld)} MAD</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Live Additional Rental Amount', 'Montant supplémentaire en direct')}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(rentalBillingSummary.impoundChargeAmount)} MAD</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Weekend Estimate To Add', 'Estimation week-end à ajouter')}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(weekendEstimatedExtraAmount)} MAD</p>
                {weekendEstimatedExtraDays > 0 && weekendEstimatedDailyRate > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {weekendEstimatedExtraDays} × {formatCurrency(weekendEstimatedDailyRate)} MAD/day
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Estimated Total By Monday', 'Total estimé d’ici lundi')}</p>
                <p className="mt-1 text-lg font-bold text-red-600">
                  {formatCurrency(estimatedTotalByMonday)} MAD
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Deposit Already Seized', 'Dépôt déjà saisi')}</p>
                <p className="mt-1 text-lg font-bold text-orange-700">
                  -{formatCurrency(estimatedDepositAppliedForImpound)} MAD
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{tr('Estimated Remaining To Prepare', 'Reste estimé à préparer')}</p>
                <p className={`mt-1 text-2xl font-extrabold ${estimatedRemainingToPrepare > 0 ? 'text-red-700' : 'text-green-600'}`}>
                  {formatCurrency(estimatedRemainingToPrepare)} MAD
                </p>
                {estimatedRemainingToPrepare > 0 && (
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-600">
                    {tr('Customer should prepare this amount', 'Le client doit préparer ce montant')}
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-2">
              <p className="text-xs text-amber-800">
                {tr('Once impound is applied, the security deposit is seized automatically against the added rental loss.', 'Une fois la fourrière appliquée, le dépôt de garantie est automatiquement saisi contre la perte locative supplémentaire.')}
              </p>
              {weekendEstimateMessage && (
                <p className="text-xs text-amber-800">
                  {weekendEstimateMessage}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between pt-2 border-t-2 border-gray-300 text-lg">
              <span className="font-bold text-gray-900">{tr('Final Rental Total:', 'Total final location :')}</span>
              <span className="font-bold text-green-600">
                {formatCurrency(rentalBillingSummary.grandTotal)} MAD
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{tr('Amount Paid:', 'Montant payé :')}</span>
              <span className="font-medium">{formatCurrency(rentalBillingSummary.depositPaid)} MAD</span>
            </div>

            {rentalBillingSummary.autoDepositSeizedAmount > 0 && (
              <div className="flex justify-between text-orange-700 text-sm">
                <span>{tr('Security deposit seized:', 'Dépôt de garantie saisi :')}</span>
                <span className="font-medium">-{formatCurrency(rentalBillingSummary.autoDepositSeizedAmount)} MAD</span>
              </div>
            )}

            <div className="flex justify-between text-base">
              <span className="font-semibold text-gray-900">{tr('Amount Still Due:', 'Montant restant dû :')}</span>
              <span className={`font-bold ${rentalBillingSummary.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(rentalBillingSummary.balanceDue)} MAD
              </span>
            </div>
          </>
        )}

        {/* Rental Payment Status - removed duplicate, see Payment Status section below */}

        {/* Security Hold - separate from rental payment and always visible */}
        {showSecurityHoldSection && (
            <div className="mt-4 space-y-4 rounded-[24px] border border-sky-200 bg-sky-50/70 p-4 shadow-[0_12px_30px_rgba(14,165,233,0.08)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-slate-900">{tr('Security Hold', 'Garantie retenue')}</h4>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${securityHoldStatus.className}`}>
                    {securityHoldStatus.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-sky-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  {tr('Required Security', 'Garantie requise')}
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCurrency(requiredSecurityAmount)} MAD
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  {tr('Cash Received', 'Espèces reçues')}
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCurrency(receivedSecurityAmount)} MAD
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  {tr('Held Document', 'Document retenu')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {hasHeldSecurityDocument
                    ? (rental.damage_deposit_document_name || tr('Security document', 'Document de garantie'))
                    : tr('None recorded', 'Aucun document enregistré')}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  {tr('Received Via', 'Reçu via')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {securityHoldMethodLabel}
                </p>
                {securityHoldReceivedMethod && (
                  <p className="mt-1 text-xs text-slate-500">
                    {securityHoldReceivedMethod === 'bank_transfer'
                      ? tr('Recorded by bank transfer', 'Enregistré par virement bancaire')
                      : tr('Recorded in cash', 'Enregistré en espèces')}
                  </p>
                )}
              </div>
            </div>

            {showSecurityHoldEditor ? (
              <div className="rounded-2xl border border-sky-200 bg-white p-3 shadow-[0_12px_30px_rgba(14,165,233,0.05)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-2">
                      {tr('Update Security Received', 'Mettre à jour la garantie reçue')}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={securityHoldAmountInput}
                      onChange={(e) => setSecurityHoldAmountInput(normalizeMoneyInputValue(e.target.value))}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {requiredSecurityAmount > 0 && receivedSecurityAmount < requiredSecurityAmount && (
                      <Button
                        type="button"
                        onClick={() => handleSaveSecurityHold(requiredSecurityAmount, 'cash')}
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={isSavingSecurityHold}
                      >
                        {tr('Mark Full Received', 'Marquer reçu en totalité')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => handleSaveSecurityHold(null, 'cash')}
                      size="sm"
                      className={`text-xs ${PRIMARY_ACTION_BUTTON_CLASS}`}
                      disabled={isSavingSecurityHold}
                    >
                      {isSavingSecurityHold ? tr('Saving...', 'Enregistrement...') : tr('Mark Cash Received', 'Marquer espèces reçues')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleSaveSecurityHold(null, 'bank_transfer')}
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      disabled={isSavingSecurityHold}
                    >
                      {tr('Mark Bank Transfer', 'Marquer virement reçu')}
                    </Button>
                    {(receivedSecurityAmount > 0 || securityHoldAmountInput) && (
                      <Button
                        type="button"
                        onClick={() => handleSaveSecurityHold(0)}
                        size="sm"
                        variant="outline"
                        className="text-xs text-rose-600 hover:text-rose-700"
                        disabled={isSavingSecurityHold}
                      >
                        {tr('Clear Cash', 'Effacer espèces')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-white p-3 shadow-[0_12px_30px_rgba(14,165,233,0.05)]">
                <p className="text-sm text-slate-600">
                  {tr(
                    `Security hold recorded by ${securityHoldMethodLabel.toLowerCase()}.`,
                    `Garantie enregistrée par ${securityHoldMethodLabel.toLowerCase()}.`
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setIsEditingSecurityHold(true)}
                  >
                    {tr('Edit Security Hold', 'Modifier la garantie')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs text-rose-600 hover:text-rose-700"
                    onClick={() => handleSaveSecurityHold(0)}
                    disabled={isSavingSecurityHold}
                  >
                    {tr('Clear Cash', 'Effacer espèces')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {hasMonetaryDamageDeposit && (
          <div className="mt-4 flex justify-between border-t border-violet-100 pt-4">
            <div>
              <span className="text-gray-600 font-medium">
                {tr('Damage Deposit (Security):', 'Caution dommages (garantie) :')}
              </span>
              {!rental.deposit_returned_at && rental.rental_status === 'completed' && (
                <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  🔒 {tr('Pending Return', 'Retour en attente')}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="font-bold text-blue-600">
                {formatCurrency(rental.damage_deposit || 0)} MAD
              </span>
              {!rental.deposit_returned_at && rentalBillingSummary.autoDepositSeizedAmount > 0 && (
                <div className="text-xs text-orange-700 mt-1">
                  {isImpounded
                    ? `Applied to estimate: ${formatCurrency(rentalBillingSummary.autoDepositSeizedAmount)} MAD`
                    : `Auto-seized now: ${formatCurrency(rentalBillingSummary.autoDepositSeizedAmount)} MAD`}
                </div>
              )}
              {rental.deposit_returned_at && (
                <div className="text-xs text-green-600 mt-1">
                  {`✓ ${tr('Returned:', 'Retourné :')} ${formatCurrency(rental.deposit_return_amount || rental.damage_deposit)} MAD`}
                  {rental.deposit_deduction_amount > 0 && (
                    <span className="text-orange-600 ml-1">
                      ({tr('Deducted:', 'Déduit :')} {formatCurrency(rental.deposit_deduction_amount)} MAD)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {hasHeldSecurityDocument && (
          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 shadow-[0_12px_30px_rgba(59,130,246,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-900">{tr('Held document', 'Document retenu')}</p>
                <p className="truncate text-xs text-blue-700">
                  {rental.damage_deposit_document_name || tr('Security document', 'Document de garantie')}
                </p>
              </div>
              {rental.damage_deposit_document_url ? (
                <a
                  href={rental.damage_deposit_document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                >
                  {tr('View Document', 'Voir le document')}
                </a>
              ) : null}
            </div>
          </div>
        )}

        {/* Show deposit return summary if already returned */}
        {rental.deposit_returned_at && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50/80 p-4 shadow-[0_12px_30px_rgba(34,197,94,0.08)]">
            <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {isDocumentDeposit ? tr('Document Returned', 'Document rendu') : tr('Deposit Returned', 'Caution rendue')}
            </h4>
            
            <div className="space-y-2">
              {isDocumentDeposit ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Returned document:', 'Document rendu :')}</span>
                    <span className="font-medium">{rental.damage_deposit_document_name || tr('Security document', 'Document de garantie')}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-bold">
                    <span>{tr('Status:', 'Statut :')}</span>
                    <span className="text-green-600">{tr('Returned to customer', 'Rendu au client')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Original Deposit:', 'Caution initiale :')}</span>
                    <span className="font-medium">{formatCurrency(rental.damage_deposit)} MAD</span>
                  </div>
                  
                  {rental.deposit_deduction_amount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{tr('Less: Applied to balance:', 'Moins : appliqué au solde :')}</span>
                      <span className="font-medium">-{formatCurrency(rental.deposit_deduction_amount)} MAD</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between pt-2 border-t font-bold">
                    <span>{tr('Amount Returned:', 'Montant rendu :')}</span>
                    <span className="text-green-600">{formatCurrency(rental.deposit_return_amount || 0)} MAD</span>
                  </div>
                </>
              )}
              
              {rental.deposit_deduction_reason && (
                <div className="text-xs text-gray-600 bg-white p-2 rounded border border-green-100 mt-2">
                  <div className="font-medium text-gray-700 mb-1">
                    {isDocumentDeposit ? tr('Return note:', 'Note de retour :') : tr('Applied to:', 'Appliqué à :')}
                  </div>
                  <div className="whitespace-pre-wrap">{rental.deposit_deduction_reason}</div>
                </div>
              )}
              
              <div className="text-xs text-gray-500 pt-1">
                {tr('Returned on:', 'Rendu le :')} {new Date(rental.deposit_returned_at).toLocaleString()}
              </div>
              
              {rental.deposit_return_signature_url && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-1">{tr('Return Signature:', 'Signature de retour :')}</p>
                  <img 
                    src={rental.deposit_return_signature_url} 
                    alt={tr('Deposit Return Signature', 'Signature de restitution de la caution')}
                    className="h-16 w-auto border rounded"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : canEditRentalPriceOverride ? (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
      <h4 className="font-semibold text-gray-900">{tr('Edit Price', 'Modifier le prix')}</h4>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {tr('New Price (MAD)', 'Nouveau prix (MAD)')}
        </label>
        <input
          type="number"
          value={manualPrice}
          onChange={(e) => setManualPrice(e.target.value)}
          placeholder={tr('Enter new price', 'Saisir le nouveau prix')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {tr('Reason for Override', 'Raison de la modification')}
        </label>
        <textarea
          value={priceOverrideReason}
          onChange={(e) => setPriceOverrideReason(e.target.value)}
          placeholder={tr('Enter reason for price change', 'Saisir la raison du changement de prix')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={handleSaveManualPrice}
          className="rounded-lg bg-violet-700 hover:bg-violet-800 text-white"
          size="sm"
          disabled={isSavingPrice}
        >
          {isSavingPrice ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isSavingPrice ? tr('Saving...', 'Enregistrement...') : tr('Save Price', 'Enregistrer le prix')}
        </Button>
        <Button
          onClick={handleCancelEditPrice}
          variant="outline"
          size="sm"
        >
          <X className="w-4 h-4 mr-2" />
          {tr('Cancel', 'Annuler')}
        </Button>
      </div>
    </div>
  ) : (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
      <h4 className="font-semibold text-gray-900">{tr('Edit Price', 'Modifier le prix')}</h4>
      <p className="text-sm text-gray-600">
        {tr('You do not have permission to change the rental price. Ask an admin or owner to enable it in User Management.', "Vous n'avez pas l'autorisation de modifier le prix de la location. Demandez à un administrateur ou au propriétaire de l'activer dans la gestion des utilisateurs.")}
      </p>
    </div>
  )}

  {/* Payment Status - Force correct display based on actual numbers */}
  <div className="mt-4 flex flex-wrap items-center gap-4">
    <strong>{tr('Payment Status:', 'Statut du paiement :')}</strong> 
    {(() => {
      if (isImpounded) {
        return (
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
              ESTIMATE ACTIVE
            </span>
            <span className="text-xs text-gray-500">
              Base rental is paid. Security deposit is covering the current impound estimate.
            </span>
          </div>
        );
      }
      const effectiveCoveredAmount = dynamicPaymentState.coveredAmount;
      
      return (
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${dynamicPaymentState.chipClass}`}>
            {dynamicPaymentState.label}
          </span>
          {dynamicPaymentState.isPartial && (
            <span className="text-xs text-gray-500">
              ({formatCurrency(effectiveCoveredAmount)} covered of {formatCurrency(rentalBillingSummary.grandTotal)})
            </span>
          )}
          {dynamicPaymentState.isPaid && rentalBillingSummary.autoDepositSeizedAmount > 0 && (
            <span className="text-xs text-gray-500">
              (includes {formatCurrency(rentalBillingSummary.autoDepositSeizedAmount)} MAD seized from security deposit)
            </span>
          )}
          
          {hasPreviouslyMarkedPaid && dynamicPaymentState.isPartial && rentalBillingSummary.balanceDue > 0 && (
            <Button
              onClick={markAsPaid}
              size="sm"
              className={`ml-2 h-8 px-3 text-xs ${SUCCESS_ACTION_BUTTON_CLASS}`}
              disabled={isUpdatingPayment || isPendingApproval}
            >
              {isUpdatingPayment ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
              ) : (
                <CreditCard className="w-3 h-3 mr-1" />
              )}
              {tr('Mark Paid', 'Marquer comme payé')}
            </Button>
          )}
        </div>
      );
    })()}
    
    {isPendingApproval && (
      <span className="text-xs text-yellow-600 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {tr('Payment disabled during price approval', 'Paiement désactivé pendant l’approbation du prix')}
      </span>
    )}
  </div>

    {(() => {
    // Only show on completed rentals OR when in return workflow
    const isCompleted = rental.rental_status === 'completed';
    const isInReturnWorkflow = finishRentalSteps.showWorkflow;
    
    if (!isCompleted && !isInReturnWorkflow) return null;
    
    let overageCharge = 0;
    let extraKm = 0;
    let includedKm = 0;
    let rate = 0;
    
    const pkg = getRentalKilometerPackage(rental, packageDetails);
    if (pkg && pkg.included_kilometers && pkg.extra_km_rate && rental.total_kilometers_driven > 0) {
      const totalKm = rental.total_kilometers_driven || 0;
      includedKm = pkg.included_kilometers;
      rate = pkg.extra_km_rate;
      extraKm = Math.max(0, totalKm - includedKm);
      overageCharge = extraKm * rate;
    } else if (rental.overage_charge > 0) {
      overageCharge = rental.overage_charge;
      extraKm = rental.extra_kilometers || 0;
      includedKm = rental.included_kilometers_applied || 80;
      rate = rental.extra_km_rate_applied || 2.00;
    }
    
    const grandTotal = rentalBillingSummary.grandTotal;
    const depositPaid = rentalBillingSummary.depositPaid;
    const rawBalanceDue = rentalBillingSummary.rawBalanceDue;
    const balanceDue = rentalBillingSummary.balanceDue;
    const displayImpoundChargeAmount = waiveImpoundExtraDailyCharge ? 0 : rentalBillingSummary.impoundChargeAmount;
    const displayImpoundDiscountAmount = waiveImpoundExtraDailyCharge ? 0 : rentalBillingSummary.impoundDiscountAmount;
    const damageDeposit = parseFloat(rental?.damage_deposit || 0);
    const hasAutoDepositSeizure = rentalBillingSummary.hasAutoDepositSeizure;
    const autoSeizedAmount = rentalBillingSummary.autoDepositSeizedAmount;
    const impoundChargeWasWaived = waiveImpoundExtraDailyCharge && Boolean(rental?.is_impounded || rental?.impounded_at);
    
    // Calculate return amounts
    const useDeduction = hasAutoDepositSeizure
      ? autoSeizedAmount > 0 && !rental.deposit_returned_at
      : deductFromDeposit && rawBalanceDue > 0 && !rental.deposit_returned_at;
    const depositReturn = useDeduction 
      ? Math.max(0, damageDeposit - (hasAutoDepositSeizure ? autoSeizedAmount : rawBalanceDue))
      : damageDeposit;
    const additionalOwed = hasAutoDepositSeizure ? balanceDue : Math.max(0, rawBalanceDue - damageDeposit);
    
    // Don't show if already returned
    if (rental.deposit_returned_at) return null;
    
    // Don't show if no damage deposit
    if (damageDeposit <= 0) return null;
    
    return (
      <div ref={depositReturnSectionRef} className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 shadow-[0_12px_30px_rgba(59,130,246,0.08)]">
        <div className="border-b border-orange-200 bg-orange-50/90 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none">🔒</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                {hasHeldSecurityDocument && hasMonetaryDamageDeposit
                  ? tr('Security Items Not Returned', 'Garanties non restituées')
                  : isDocumentDeposit
                    ? tr('Security Document Not Returned', 'Document de garantie non rendu')
                    : tr('Deposit Not Returned', 'Caution non rendue')}
              </p>
              <p className="mt-1 text-xs text-orange-700">
                {hasHeldSecurityDocument && hasMonetaryDamageDeposit
                  ? tr(
                      'A security document and a monetary damage deposit are still being held for this rental. Review and complete the return below.',
                      'Un document de garantie et un dépôt de garantie monétaire sont encore retenus pour cette location. Vérifiez et terminez le retour ci-dessous.'
                    )
                  : isDocumentDeposit
                    ? tr(
                        'The security document is still being held. Review and complete the return below.',
                        'Le document de garantie est toujours retenu. Vérifiez et terminez le retour ci-dessous.'
                      )
                    : tr(
                        `The ${formatCurrency(rental.damage_deposit)} MAD deposit is still being held. Review and complete the return below.`,
                        `La caution de ${formatCurrency(rental.damage_deposit)} MAD est toujours retenue. Vérifiez et terminez le retour ci-dessous.`
                      )}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
        <div className="flex flex-col items-center gap-4">
          <h4 className="font-semibold text-blue-900 flex items-center gap-2 text-center w-full justify-center">
            <DollarSign className="w-4 h-4" />
            {hasHeldSecurityDocument
              ? tr('Security Return', 'Restitution de garantie')
              : tr('Damage Deposit Return', 'Restitution de la caution dommages')}
          </h4>
          <p className="text-sm text-blue-700 text-center max-w-md">
            {isCompleted
              ? (
                  hasHeldSecurityDocument
                    ? tr(
                        'The rental has been completed. Return the held security items and confirm everything with one signature below.',
                        'La location est terminée. Restituez les éléments de garantie retenus et confirmez le tout avec une seule signature ci-dessous.'
                      )
                    : tr('The rental has been completed. Process the damage deposit return below.', 'La location est terminée. Traitez la restitution de la caution ci-dessous.')
                )
              : tr('Complete the return to process the damage deposit.', 'Terminez le retour pour traiter la caution dommages.')}
          </p>
          
          <div className="w-full max-w-sm mx-auto space-y-4">
            {/* Deposit Amount */}
            <div className="bg-white p-4 rounded-lg border border-blue-200 text-center">
              <span className="text-blue-600 text-sm block">{tr('Security Deposit Held', 'Caution retenue')}</span>
              <div className="font-bold text-blue-600 text-2xl">
                {formatCurrency(damageDeposit)} MAD
              </div>
            </div>
            
            {/* Balance Breakdown - only show if there's a balance due */}
            {rawBalanceDue > 0 && (
            <div className="bg-white p-3 rounded-lg border border-blue-100">
              <div className="text-xs text-blue-600 font-medium mb-2 text-center">{tr('Rental Balance Details', 'Détails du solde de location')}</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>{tr('Base Rental:', 'Location de base :')}</span>
                  <span>{formatCurrency(rentalBillingSummary.baseAmount)} MAD</span>
                </div>
                {overageCharge > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Overage ({extraKm}km × {rate}MAD):</span>
                    <span>+{formatCurrency(overageCharge)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.extensionFees > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Extensions:</span>
                    <span>+{formatCurrency(rentalBillingSummary.extensionFees)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.fuelChargeAmount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Fuel Charge:</span>
                    <span>+{formatCurrency(rentalBillingSummary.fuelChargeAmount)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.maintenanceRepairAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Damage / Maintenance Bill:</span>
                    <span>+{formatCurrency(rentalBillingSummary.maintenanceRepairAmount)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.maintenanceStayAmount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Maintenance stay charge:</span>
                    <span>+{formatCurrency(rentalBillingSummary.maintenanceStayAmount)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.maintenanceDiscountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Maintenance discount:</span>
                    <span>-{formatCurrency(rentalBillingSummary.maintenanceDiscountAmount)} MAD</span>
                  </div>
                )}
                {displayImpoundChargeAmount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Impound extra time:</span>
                    <span>+{formatCurrency(Math.max(0, Number(rentalBillingSummary.impoundBaseChargeAmount || displayImpoundChargeAmount || 0)))} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.impoundManualChargeAmount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>{tr('Additional impound charge:', 'Frais de fourrière additionnels :')}</span>
                    <span>+{formatCurrency(rentalBillingSummary.impoundManualChargeAmount)} MAD</span>
                  </div>
                )}
                {displayImpoundDiscountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      {rental?.released_from_impound_at && !rental?.is_impounded
                        ? tr('Discounted by us:', 'Remis par nous :')
                        : 'Impound discount:'}
                    </span>
                    <span>-{formatCurrency(displayImpoundDiscountAmount)} MAD</span>
                  </div>
                )}
                {impoundChargeWasWaived && (
                  <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                    {tr(
                      'No extra daily charge approved. Impound extra time is waived for this balance review.',
                      'Aucun supplément journalier approuvé. Le temps supplémentaire de mise en fourrière est annulé pour ce récapitulatif.'
                    )}
                  </div>
                )}
                <div className="flex justify-between font-bold pt-2 border-t mt-2">
                  <span>{tr('Grand Total:', 'Total général :')}</span>
                  <span>{formatCurrency(grandTotal)} MAD</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>{tr('Deposit Paid:', 'Acompte versé :')}</span>
                  <span>-{formatCurrency(depositPaid)} MAD</span>
                </div>
                {autoSeizedAmount > 0 && (
                  <div className="flex justify-between text-orange-700">
                    <span>{tr('Security deposit seized:', 'Caution saisie :')}</span>
                    <span>-{formatCurrency(autoSeizedAmount)} MAD</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-red-600 pt-2 border-t mt-2">
                  <span>{autoSeizedAmount > 0 ? 'Balance Still Due:' : 'Balance Due:'}</span>
                  <span>{formatCurrency(balanceDue)} MAD</span>
                </div>
              </div>
            </div>
            )}
            
            {/* Check if there's any balance due */}
            {(() => {
              const maxDeductible = Math.min(balanceDue, damageDeposit);
              const depositReturnAfterDeduction = damageDeposit - maxDeductible;
              const remainingAfterDeduction = balanceDue - maxDeductible;
              
              return (
                <div className="space-y-3">
                  {/* Deduct from deposit if balance due */}
                  {hasAutoDepositSeizure ? (
                    <div className="bg-white p-4 rounded-lg border border-orange-200">
                      <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-orange-800">
                          {rentalBillingSummary.maintenanceChargeAmount > 0
                            ? 'Damage deposit is automatically seized for maintenance charges.'
                            : impoundChargeWasWaived
                              ? 'No extra impound daily charge is being seized from the damage deposit.'
                              : 'Damage deposit is automatically seized for impound charges.'}
                        </p>
                      </div>

                      <div className="w-full pt-3 border-t border-gray-200 text-center">
                        <div className="text-sm text-gray-600 mb-2">Automatic deposit handling:</div>
                        <div className="flex justify-between items-center text-base mb-2">
                          <span>Seized from deposit:</span>
                          <span className="font-bold text-orange-700">
                            {formatCurrency(autoSeizedAmount)} MAD
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-base mb-3">
                          <span>Amount to return:</span>
                          <span className="font-bold text-green-600">
                            {formatCurrency(depositReturn)} MAD
                          </span>
                        </div>
                        {additionalOwed > 0 && (
                          <div className="text-xs text-red-600 mb-3">
                            Additional amount still owed after seizure: {formatCurrency(additionalOwed)} MAD
                          </div>
                        )}
                        {impoundChargeWasWaived && rentalBillingSummary.maintenanceChargeAmount <= 0 && (
                          <div className="text-xs text-green-700 mb-3">
                            {tr(
                              'Extra impound daily charge has been waived for this estimate.',
                              'Le supplément journalier de mise en fourrière a ete annule pour cette estimation.'
                            )}
                          </div>
                        )}
                        {!impoundChargeWasWaived && rental?.released_from_impound_at && !rental?.is_impounded && displayImpoundDiscountAmount > 0 && (
                          <div className="text-xs text-green-700 mb-3">
                            {tr(
                              `Discounted by us from the original impound estimate: ${formatCurrency(displayImpoundDiscountAmount)} MAD.`,
                              `Remis par nous sur l estimation initiale de fourriere : ${formatCurrency(displayImpoundDiscountAmount)} MAD.`
                            )}
                          </div>
                        )}

                        <Button
                          onClick={() => setShowDepositSignatureModal(true)}
                          className={`w-full ${PRIMARY_ACTION_BUTTON_CLASS}`}
                          size="sm"
                        >
                          <FileSignature className="w-4 h-4 mr-2" />
                          {tr('Review Security Return', 'Vérifier la restitution')}
                        </Button>
                      </div>
                    </div>
                  ) : balanceDue > 0 && balanceDue <= damageDeposit ? (
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="deductFromDeposit"
                            checked={deductFromDeposit}
                            onChange={(e) => setDeductFromDeposit(e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor="deductFromDeposit" className="text-sm font-medium text-gray-700">
                            Deduct {formatCurrency(balanceDue)} MAD from deposit
                          </label>
                        </div>
                        
                        {deductFromDeposit && (
                          <div className="w-full pt-3 border-t border-gray-200 text-center">
                            <div className="text-sm text-gray-600 mb-2">After deduction:</div>
                            <div className="flex justify-between items-center text-base mb-3">
                              <span>Amount to return:</span>
                              <span className="font-bold text-green-600">
                                {formatCurrency(damageDeposit - balanceDue)} MAD
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mb-3">
                              {formatCurrency(damageDeposit)} MAD - {formatCurrency(balanceDue)} MAD = {formatCurrency(damageDeposit - balanceDue)} MAD
                            </div>
                            
                            <Button
                              onClick={() => setShowDepositSignatureModal(true)}
                              className={`w-full ${PRIMARY_ACTION_BUTTON_CLASS}`}
                              size="sm"
                            >
                              <FileSignature className="w-4 h-4 mr-2" />
                              {tr('Review Security Return', 'Vérifier la restitution')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : balanceDue > 0 && balanceDue > damageDeposit ? (
                    <div className="bg-white p-4 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">
                          Balance due ({formatCurrency(balanceDue)} MAD) exceeds deposit amount ({formatCurrency(damageDeposit)} MAD)
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="deductFromDeposit"
                            checked={deductFromDeposit}
                            onChange={(e) => setDeductFromDeposit(e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor="deductFromDeposit" className="text-sm font-medium text-gray-700">
                            Apply full deposit ({formatCurrency(damageDeposit)} MAD) to balance
                          </label>
                        </div>
                        
                        {deductFromDeposit && (
                          <div className="w-full pt-3 border-t border-gray-200 text-center">
                            <div className="text-sm text-gray-600 mb-2">After applying deposit:</div>
                            <div className="flex justify-between items-center text-base mb-3">
                              <span>Remaining balance:</span>
                              <span className="font-bold text-red-600">
                                {formatCurrency(balanceDue - damageDeposit)} MAD
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mb-3">
                              {formatCurrency(balanceDue)} MAD - {formatCurrency(damageDeposit)} MAD = {formatCurrency(balanceDue - damageDeposit)} MAD still owed
                            </div>
                            
                            <Button
                              onClick={() => setShowDepositSignatureModal(true)}
                              className={`w-full ${PRIMARY_ACTION_BUTTON_CLASS}`}
                              size="sm"
                            >
                              <FileSignature className="w-4 h-4 mr-2" />
                              {tr('Review Security Return', 'Vérifier la restitution')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  
                  {/* Return Full Deposit Option - Only if no deduction selected */}
                  {!deductFromDeposit && (
                    <div className="text-center">
                      <Button
                        onClick={() => {
                          setDeductFromDeposit(false);
                          setShowDepositSignatureModal(true);
                        }}
                        className={`mx-auto w-full max-w-xs ${SUCCESS_ACTION_BUTTON_CLASS}`}
                        size="sm"
                      >
                        <FileSignature className="w-4 h-4 mr-2" />
                        {hasHeldSecurityDocument && hasMonetaryDamageDeposit
                          ? tr('Review Security Return', 'Vérifier la restitution')
                          : isDocumentDeposit
                            ? tr('Review Document Return', 'Vérifier le retour du document')
                            : tr('Review Deposit Return', 'Vérifier le retour de caution')}
                      </Button>
                      {balanceDue > 0 && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Balance due of {formatCurrency(balanceDue)} MAD will still be owed
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        </div>
      </div>
    );
  })()}

  {rental.signature_url ? (
    <div className="mt-4">
      <h4 className="mb-2 text-base font-semibold text-gray-900">Customer Signature</h4>
      <img
        src={rental.signature_url}
        alt="Customer Signature"
        className="h-24 w-auto rounded-md border bg-gray-100 p-2"
      />
      <div className="mt-4">
        <Button
          onClick={handlePrintInvoice}
          className={PRIMARY_ACTION_BUTTON_CLASS}
          title={!canGenerateInvoice ? 'Please sign the contract before generating invoice' : 'Print Invoice'}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Invoice
        </Button>
      </div>
    </div>
  ) : null}
          </div>
</CardContent>
</Card>

      <Dialog open={openingModalOpen} onOpenChange={(open) => {
  setOpeningModalOpen(open);
  if (!open) {
    if (isRecording) stopCameraRecording();
    if (isCapturingPhoto) {
      if (openingVideoRef.current?.srcObject) {
        openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
        openingVideoRef.current.srcObject = null;
      }
      setIsCapturingPhoto(false);
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
      setRecordingStream(null);
    }
  }
}}>
  <DialogContent className="w-[100vw] h-[100vh] sm:w-[90vw] sm:max-w-md sm:h-auto p-0 m-0 rounded-none sm:rounded-lg">
    <DialogHeader className="p-4 pb-2 border-b bg-white sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Video className="w-4 h-4 text-blue-600" />
          {tr('Opening Condition', 'État de départ')}
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            setOpeningModalOpen(false);
            if (isRecording) stopCameraRecording();
            if (isCapturingPhoto) {
              if (openingVideoRef.current?.srcObject) {
                openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                openingVideoRef.current.srcObject = null;
              }
              setIsCapturingPhoto(false);
            }
            if (recordingStream) {
              recordingStream.getTracks().forEach(t => t.stop());
              setRecordingStream(null);
            }
            capturedMedia.forEach(file => file.url && URL.revokeObjectURL(file.url));
            setCapturedMedia([]);
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </DialogHeader>
    
    <div className="h-[calc(100vh-120px)] overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        {/* Mode Selector */}
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clean up camera
                if (openingVideoRef.current?.srcObject) {
                  openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  openingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setOpeningMediaMode('photo');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                openingMediaMode === 'photo' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Camera className="w-4 h-4" />
              {tr('Photo', 'Photo')}
            </button>
            <button
              onClick={() => {
                if (openingVideoRef.current?.srcObject) {
                  openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  openingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setOpeningMediaMode('video');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                openingMediaMode === 'video' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Video className="w-4 h-4" />
              {tr('Video', 'Vidéo')}
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-end mb-2">
          <div className="bg-gray-100 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setMediaViewMode('list')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'list' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              {tr('List', 'Liste')}
            </button>
            <button
              onClick={() => setMediaViewMode('grid')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'grid' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              {tr('Grid', 'Grille')}
            </button>
          </div>
        </div>

        {/* Photo Mode UI */}
        {openingMediaMode === 'photo' && (
          <div className="space-y-4">
            {!isCapturingPhoto ? (
              <>
                {/* Gallery Preview Section */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} {capturedMedia.length > 1 ? tr('photos captured', 'photos capturées') : tr('photo captured', 'photo capturée')}
                      </p>
                      {capturedMedia.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          {tr('Clear All', 'Tout effacer')}
                        </Button>
                      )}
                    </div>
                    
                    {/* Photo Grid */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-3 gap-2 mb-3" : "flex flex-col gap-2 mb-3"}>
                      {capturedMedia.map((file, index) => {
                        const fileUrl = file.url || (file instanceof File ? URL.createObjectURL(file) : null);
                        return (
                          <div key={file.id || index} className={`relative group rounded-lg overflow-hidden bg-gray-100 border ${mediaViewMode === 'grid' ? 'aspect-square' : 'flex flex-row h-20'}`}>
                            <img 
                              src={fileUrl} 
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <Button 
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((f, i) => (f.id ? f.id !== file.id : i !== index)));
                              }}
                              variant="ghost" 
                              size="sm"
                              className="absolute top-1 right-1 h-6 w-6 p-0 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                              #{index + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons - BOTTOM for mobile */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <button
                    onClick={async () => {
                      setActiveModal('opening');
                      setIsCapturingPhoto(true);
                      await startPhotoPreview('opening');
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                  >
                    <Camera className="w-5 h-5" />
                    {capturedMedia.length > 0 ? tr('Take Another Photo', 'Prendre une autre photo') : tr('Open Camera', 'Ouvrir la caméra')}
                  </button>

                  <button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mt-3"
                  >
                    <Upload className="w-5 h-5" />
                    {tr('Choose from Gallery', 'Choisir depuis la galerie')}
                  </button>
                </div>

                {/* Save Button - Only appears after at least one capture */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg">
                    <button
                      onClick={() => saveMedia('opening')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Enregistrement...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {tr('Save', 'Enregistrer')} {capturedMedia.length} {capturedMedia.length > 1 ? tr('Photos', 'photos') : tr('Photo', 'photo')}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Camera Preview Mode */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <video 
                    ref={openingVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="w-full aspect-[4/3] object-cover"
                  />
                  
                  {/* Camera Controls Overlay */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <button
                      onClick={() => capturePhoto('opening')}
                      className={`w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform ${captureFlash ? 'capture-flash' : ''}`}
                    >
                      <div className="w-16 h-16 rounded-full border-4 border-blue-600"></div>
                    </button>
                    
                    <button
                      onClick={() => {
                        if (openingVideoRef.current?.srcObject) {
                          openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                          openingVideoRef.current.srcObject = null;
                        }
                        if (recordingStream) {
                          recordingStream.getTracks().forEach(t => t.stop());
                          setRecordingStream(null);
                        }
                        setIsCapturingPhoto(false);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium"
                    >
                      {tr('Done', 'Terminé')}
                    </button>
                  </div>

                  {/* Camera controls - torch & switch */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <canvas ref={openingCanvasRef} style={{ display: 'none' }} />

                {/* Thumbnails of captured photos */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">
                      {capturedMedia.length} {capturedMedia.length > 1 ? tr('photos captured', 'photos capturées') : tr('photo captured', 'photo capturée')}
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {capturedMedia.map((file, index) => (
                        <div key={file.id || index} className="relative flex-shrink-0">
                          <img 
                            src={file.url} 
                            alt={`Capture ${index + 1}`}
                            className="w-16 h-16 rounded-lg object-cover border-2 border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeCapturedMedia(file.id)}
                            className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
                            aria-label="Remove captured photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Video Mode UI - Keep existing video mode content */}
        {openingMediaMode === 'video' && (
          <div className="space-y-4">
            {!isRecording && !isCapturingPhoto ? (
              <>
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} {capturedMedia.length > 1 ? tr('videos captured', 'vidéos capturées') : tr('video captured', 'vidéo capturée')}
                      </p>
                      {capturedMedia.length > 1 && (
                        <button
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          {tr('Clear All', 'Tout effacer')}
                        </button>
                      )}
                    </div>
                    
                    {/* Video Grid with Thumbnails */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "flex flex-col gap-2"}>
                      {capturedMedia.map((file, idx) => (
                        <div key={file.id || idx} className={`relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100 ${mediaViewMode === 'list' ? 'flex flex-row h-24' : ''}`}>
                          <div className={mediaViewMode === 'grid' ? "aspect-video relative" : "w-32 h-24 relative flex-shrink-0"}>
                            <video 
                              src={file.url} 
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              onClick={(e) => {
                                e.preventDefault();
                                if (e.target.paused) {
                                  e.target.play();
                                } else {
                                  e.target.pause();
                                }
                              }}
                            />
                            {/* Play/Pause Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <svg className="w-4 h-4 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                            
                            {/* Duration Badge */}
                            {file.duration > 0 && (
                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                                {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </div>
                            )}
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className={mediaViewMode === 'list' ? "p-2 flex-1 flex flex-col justify-center min-w-0" : "p-2"}>
                            <p className="text-xs text-gray-600 truncate">
                              {file.name || `${tr('Video', 'Vidéo')} ${idx + 1}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatFileSize(file.size)}
                            </p>
                            {mediaViewMode === 'list' && file.duration > 0 && (
                              <p className="text-xs text-gray-400">
                                {tr('Duration:', 'Durée :')} {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <Button
                    onClick={() => {
                      setActiveModal('opening');
                      startCameraRecording('opening');
                    }}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mb-3"
                    disabled={isUploading || isConverting}
                  >
                    <Video className="w-5 h-5" />
                    {capturedMedia.length > 0 ? tr('Record Another Video', 'Enregistrer une autre vidéo') : tr('Record Video', 'Enregistrer une vidéo')}
                  </Button>
                  
                  <Button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                    disabled={isRecording || isConverting}
                  >
                    <Upload className="w-5 h-5" />
                    {isUploading ? tr('Processing...', 'Traitement...') : isConverting ? `${tr('Converting', 'Conversion')} ${conversionProgress}%` : tr('Choose from Gallery', 'Choisir depuis la galerie')}
                  </Button>
                </div>

                {/* Save Button */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg rounded-lg">
                    <Button
                      onClick={() => saveMedia('opening')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                      disabled={isProcessingVideo}
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Enregistrement...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {tr('Save', 'Enregistrer')} {capturedMedia.length} {capturedMedia.length > 1 ? tr('Videos', 'vidéos') : tr('Video', 'vidéo')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Recording UI with canvas preview */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <canvas
                    ref={openingCanvasRef}
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <video ref={openingVideoRef} muted playsInline autoPlay style={{ display: 'none' }} />
                  
                  {/* Recording indicator */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                    <span className="text-white text-sm">REC</span>
                  </div>
                  
                  {/* Stop button */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button
                      onClick={stopCameraRecording}
                      className="px-6 py-3 bg-red-600 text-white rounded-full font-medium flex items-center gap-2"
                    >
                      <StopCircle className="w-5 h-5" />
                      Stop Recording
                    </button>
                  </div>

                  {/* Camera controls */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-500">
                  You can record multiple clips before saving
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </DialogContent>
</Dialog>
      
      {/* Enhanced Closing Media Modal */}
      <Dialog open={closingModalOpen} onOpenChange={(open) => {
  setClosingModalOpen(open);
  if (!open) {
    if (isRecording) stopCameraRecording();
    if (isCapturingPhoto) {
      if (closingVideoRef.current?.srcObject) {
        closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
        closingVideoRef.current.srcObject = null;
      }
      setIsCapturingPhoto(false);
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
      setRecordingStream(null);
    }
  }
}}>
  <DialogContent className="w-[100vw] h-[100vh] sm:w-[90vw] sm:max-w-md sm:h-auto p-0 m-0 rounded-none sm:rounded-lg">
    <DialogHeader className="p-4 pb-2 border-b bg-white sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Video className="w-4 h-4 text-blue-600" />
          {tr('Closing Condition', 'État de retour')}
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            setClosingModalOpen(false);
            if (isRecording) stopCameraRecording();
            if (isCapturingPhoto) {
              if (closingVideoRef.current?.srcObject) {
                closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                closingVideoRef.current.srcObject = null;
              }
              setIsCapturingPhoto(false);
            }
            if (recordingStream) {
              recordingStream.getTracks().forEach(t => t.stop());
              setRecordingStream(null);
            }
            capturedMedia.forEach(file => file.url && URL.revokeObjectURL(file.url));
            setCapturedMedia([]);
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </DialogHeader>
    
    <div className="h-[calc(100vh-120px)] overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        {/* Mode Selector */}
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clean up camera
                if (closingVideoRef.current?.srcObject) {
                  closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  closingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setClosingMediaMode('photo');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                closingMediaMode === 'photo' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Camera className="w-4 h-4" />
              {tr('Photo', 'Photo')}
            </button>
            <button
              onClick={() => {
                if (closingVideoRef.current?.srcObject) {
                  closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  closingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setClosingMediaMode('video');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                closingMediaMode === 'video' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Video className="w-4 h-4" />
              {tr('Video', 'Vidéo')}
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-end mb-2">
          <div className="bg-gray-100 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setMediaViewMode('list')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'list' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              {tr('List', 'Liste')}
            </button>
            <button
              onClick={() => setMediaViewMode('grid')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'grid' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              {tr('Grid', 'Grille')}
            </button>
          </div>
        </div>

        {/* Photo Mode UI */}
        {closingMediaMode === 'photo' && (
          <div className="space-y-4">
            {!isCapturingPhoto ? (
              <>
                {/* Gallery Preview Section */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} {capturedMedia.length > 1 ? tr('photos captured', 'photos capturées') : tr('photo captured', 'photo capturée')}
                      </p>
                      {capturedMedia.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          {tr('Clear All', 'Tout effacer')}
                        </Button>
                      )}
                    </div>
                    
                    {/* Photo Grid */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-3 gap-2 mb-3" : "flex flex-col gap-2 mb-3"}>
                      {capturedMedia.map((file, index) => {
                        const fileUrl = file.url || (file instanceof File ? URL.createObjectURL(file) : null);
                        return (
                          <div key={file.id || index} className={`relative group rounded-lg overflow-hidden bg-gray-100 border ${mediaViewMode === 'grid' ? 'aspect-square' : 'flex flex-row h-20'}`}>
                            <img 
                              src={fileUrl} 
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <Button 
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((f, i) => (f.id ? f.id !== file.id : i !== index)));
                              }}
                              variant="ghost" 
                              size="sm"
                              className="absolute top-1 right-1 h-6 w-6 p-0 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                              #{index + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons - BOTTOM for mobile */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <button
                    onClick={async () => {
                      setActiveModal('closing');
                      setIsCapturingPhoto(true);
                      await startPhotoPreview('closing');
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                  >
                    <Camera className="w-5 h-5" />
                    {capturedMedia.length > 0 ? tr('Take Another Photo', 'Prendre une autre photo') : tr('Open Camera', 'Ouvrir la caméra')}
                  </button>

                  <button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mt-3"
                  >
                    <Upload className="w-5 h-5" />
                    {tr('Choose from Gallery', 'Choisir depuis la galerie')}
                  </button>
                </div>

                {/* Save Button - Only appears after at least one capture */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg">
                    <button
                      onClick={() => saveMedia('closing')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Enregistrement...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {tr('Save', 'Enregistrer')} {capturedMedia.length} {capturedMedia.length > 1 ? tr('Photos', 'photos') : tr('Photo', 'photo')}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Camera Preview Mode */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <video 
                    ref={closingVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="w-full aspect-[4/3] object-cover"
                  />
                  
                  {/* Camera Controls Overlay */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <button
                      onClick={() => capturePhoto('closing')}
                      className={`w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform ${captureFlash ? 'capture-flash' : ''}`}
                    >
                      <div className="w-16 h-16 rounded-full border-4 border-blue-600"></div>
                    </button>
                    
                    <button
                      onClick={() => {
                        if (closingVideoRef.current?.srcObject) {
                          closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                          closingVideoRef.current.srcObject = null;
                        }
                        if (recordingStream) {
                          recordingStream.getTracks().forEach(t => t.stop());
                          setRecordingStream(null);
                        }
                        setIsCapturingPhoto(false);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium"
                    >
                      {tr('Done', 'Terminé')}
                    </button>
                  </div>

                  {/* Camera controls - torch & switch */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <canvas ref={closingCanvasRef} style={{ display: 'none' }} />

                {/* Thumbnails of captured photos */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">
                      {capturedMedia.length} {capturedMedia.length > 1 ? tr('photos captured', 'photos capturées') : tr('photo captured', 'photo capturée')}
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {capturedMedia.map((file, index) => (
                        <div key={index} className="relative flex-shrink-0">
                          <img 
                            src={file.url} 
                            alt={`Capture ${index + 1}`}
                            className="w-16 h-16 rounded-lg object-cover border-2 border-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Video Mode UI - Keep existing video mode content */}
        {closingMediaMode === 'video' && (
          <div className="space-y-4">
            {!isRecording && !isCapturingPhoto ? (
              <>
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} {capturedMedia.length > 1 ? tr('videos captured', 'vidéos capturées') : tr('video captured', 'vidéo capturée')}
                      </p>
                      {capturedMedia.length > 1 && (
                        <button
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          {tr('Clear All', 'Tout effacer')}
                        </button>
                      )}
                    </div>
                    
                    {/* Video Grid with Thumbnails */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "flex flex-col gap-2"}>
                      {capturedMedia.map((file, idx) => (
                        <div key={file.id || idx} className={`relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100 ${mediaViewMode === 'list' ? 'flex flex-row h-24' : ''}`}>
                          <div className={mediaViewMode === 'grid' ? "aspect-video relative" : "w-32 h-24 relative flex-shrink-0"}>
                            <video 
                              src={file.url} 
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              onClick={(e) => {
                                e.preventDefault();
                                if (e.target.paused) {
                                  e.target.play();
                                } else {
                                  e.target.pause();
                                }
                              }}
                            />
                            {/* Play/Pause Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <svg className="w-4 h-4 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                            
                            {/* Duration Badge */}
                            {file.duration > 0 && (
                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                                {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </div>
                            )}
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className={mediaViewMode === 'list' ? "p-2 flex-1 flex flex-col justify-center min-w-0" : "p-2"}>
                            <p className="text-xs text-gray-600 truncate">
                              {file.name || `${tr('Video', 'Vidéo')} ${idx + 1}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatFileSize(file.size)}
                            </p>
                            {mediaViewMode === 'list' && file.duration > 0 && (
                              <p className="text-xs text-gray-400">
                                {tr('Duration:', 'Durée :')} {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <Button
                    onClick={async () => {
                      try {
                        setActiveModal('closing');
                        if (closingVideoRef.current?.srcObject) {
                          closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                          closingVideoRef.current.srcObject = null;
                        }
                        if (recordingStream) {
                          recordingStream.getTracks().forEach(track => track.stop());
                          setRecordingStream(null);
                        }
                        await startCameraRecording('closing');
                      } catch (err) {
                        console.error('Failed to start recording:', err);
                        toast.error(tr('Could not start camera. Please check permissions.', "Impossible d'ouvrir la caméra. Veuillez vérifier les autorisations."));
                      }
                    }}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mb-3"
                    disabled={isUploading || isConverting}
                  >
                    <Video className="w-5 h-5" />
                    {capturedMedia.length > 0 ? tr('Record Another Video', 'Enregistrer une autre vidéo') : tr('Record Video', 'Enregistrer une vidéo')}
                  </Button>
                  
                  <Button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                    disabled={isRecording || isConverting}
                  >
                    <Upload className="w-5 h-5" />
                    {isUploading ? tr('Processing...', 'Traitement...') : isConverting ? `${tr('Converting', 'Conversion')} ${conversionProgress}%` : tr('Choose from Gallery', 'Choisir depuis la galerie')}
                  </Button>
                </div>

                {/* Save Button */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg rounded-lg">
                    <Button
                      onClick={() => saveMedia('closing')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                      disabled={isProcessingVideo}
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Enregistrement...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {tr('Save', 'Enregistrer')} {capturedMedia.length} {capturedMedia.length > 1 ? tr('Videos', 'vidéos') : tr('Video', 'vidéo')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Recording UI with canvas preview */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <canvas
                    ref={closingCanvasRef}
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <video ref={closingVideoRef} muted playsInline autoPlay style={{ display: 'none' }} />
                  
                  {/* Recording indicator */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                    <span className="text-white text-sm">{tr('REC', 'REC')}</span>
                  </div>
                  
                  {/* Stop button */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button
                      onClick={stopCameraRecording}
                      className="px-6 py-3 bg-red-600 text-white rounded-full font-medium flex items-center gap-2"
                    >
                      <StopCircle className="w-5 h-5" />
                      {tr('Stop Recording', "Arrêter l'enregistrement")}
                    </button>
                  </div>

                  {/* Camera controls */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-500">
                  You can record multiple clips before saving
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </DialogContent>
</Dialog>

      {/* Starting Fuel Level Dialog - Step 4 of starting workflow (All rental types) */}
      <FuelLevelModal
          isOpen={showStartFuelModal}
          onClose={() => setShowStartFuelModal(false)}
          onSave={handleSaveStartFuel}
          currentLevel={startFuelLevel ?? rental?.start_fuel_level ?? currentVehicleFuelLevel}
          title="Starting Fuel Level"
          description="Select the fuel level before rental starts"
      />

      {/* End Odometer Prompt Modal */}
      <Dialog open={showEndOdometerPrompt} onOpenChange={setShowEndOdometerPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Gauge className="w-5 h-5 text-blue-600" />
              Enter Ending Odometer Reading
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Please enter the vehicle's odometer reading at the end of the rental.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-800">
                Please enter the vehicle's odometer reading at the end of the rental.
                {displayedStartingOdometer > 0 && (
                  <p className="mt-2">
                    <strong>Starting odometer:</strong> {displayedStartingOdometer} km
                  </p>
                )}
              </AlertDescription>
            </Alert>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ending Odometer (km)
              </label>
              <input
                ref={endOdometerPromptInputRef}
                type="number"
                value={endOdometer}
                onChange={(e) => setEndOdometer(e.target.value)}
                placeholder="Enter ending odometer reading"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={displayedStartingOdometer || 0}
                step="1"
                autoFocus
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => {
                  setShowEndOdometerPrompt(false);
                  setEndOdometer('');
                }}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Skip for Now
              </Button>
              <Button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleEndOdometerSubmit();
                }}
                className={`order-1 w-full sm:order-2 sm:flex-1 ${PRIMARY_ACTION_BUTTON_CLASS}`}
              >
                {isProcessingEndOdometer ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    {tr('Saving...', 'Enregistrement...')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {tr('Save Odometer', "Enregistrer l'odomètre")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Ending Fuel Level Dialog - Step 3 of closing workflow (ALL rental types) */}
        <FuelLevelModal
          isOpen={showEndFuelModal}
          onClose={() => setShowEndFuelModal(false)}
          onSave={handleSaveEndFuel}
          currentLevel={endFuelLevel}
          title="Ending Fuel Level"
          description="Select the fuel level at return"
      />

      <Dialog open={showImpoundModal} onOpenChange={setShowImpoundModal}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-white via-amber-50 to-white px-6 py-5 text-lg sm:text-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Mark Rental as Impounded
            </DialogTitle>
            <DialogDescription className="px-6 pt-3 text-sm text-slate-600">
              The timer will keep running. Use this to record an impound while the rental remains active.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <input
                type="text"
                value={impoundForm.reason}
                onChange={(e) => setImpoundForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Police impound"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reference Number
              </label>
              <input
                type="text"
                value={impoundForm.reference}
                onChange={(e) => setImpoundForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Case / police reference"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Note
              </label>
              <textarea
                value={impoundForm.note}
                onChange={(e) => setImpoundForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Optional note"
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowImpoundModal(false)}
                className={`order-2 w-full sm:order-1 sm:w-auto ${SECONDARY_ACTION_BUTTON_CLASS}`}
                disabled={impoundActionLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={markRentalImpounded}
                className={`order-1 w-full sm:order-2 sm:flex-1 ${WARNING_ACTION_BUTTON_CLASS}`}
                disabled={impoundActionLoading}
              >
                {impoundActionLoading ? tr('Saving...', 'Enregistrement...') : tr('Confirm Impound', 'Confirmer la mise en fourrière')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showReleaseImpoundModal}
        onOpenChange={(open) => {
          if (!releaseImpoundSubmitting && !impoundReceiptUploading) {
            if (!open) {
              setWaiveImpoundExtraDailyCharge(false);
              setReleaseImpoundChargePreset(null);
            }
            setShowReleaseImpoundModal(open);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl sm:max-w-2xl">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <CheckCircle className="w-5 h-5 text-violet-600" />
              {tr('Release Impound', 'Libérer la fourrière')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                <div className="text-xs font-medium text-amber-700">{tr('Exceeded time', 'Temps dépassé')}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {releaseImpoundExceededPreview.days || 0}d {releaseImpoundExceededPreview.hours || 0}h
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  {releaseImpoundExceededPreview.pricingLabel || (
                    rental?.rental_type === 'daily'
                      ? tr('Daily rental pricing', 'Tarification journalière')
                      : tr('Hourly tier pricing', 'Tarification horaire')
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                <div className="text-xs font-medium text-amber-700">{tr('Estimated remaining to prepare', 'Reste estimé à préparer')}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatCurrency(
                    waiveImpoundExtraDailyCharge
                      ? 0
                      : Math.max(0, Number(releaseImpoundExceededPreview.remainingToPrepare || 0))
                  )} MAD
                </div>
                <div className="mt-1 space-y-1 text-xs text-amber-700">
                  {waiveImpoundExtraDailyCharge
                    ? tr('Extra impound rental charge will be waived on release', 'Le supplément de fourrière sera annulé à la libération')
                    : tr('Based on your normal rental pricing until release', 'Basé sur votre tarification normale jusqu à la libération')}
                  {!waiveImpoundExtraDailyCharge && (
                    <div className="text-[11px] text-amber-800/90">
                      Extra rental amount {formatCurrency(Math.max(0, Number(releaseImpoundExceededPreview.estimatedTotal || 0)))} MAD minus seized security deposit {formatCurrency(Math.max(0, Number(releaseImpoundExceededPreview.depositApplied || 0)))} MAD
                    </div>
                  )}
                  {!waiveImpoundExtraDailyCharge && releaseImpoundDiscountedByUs > 0 && (
                    <div className="text-[11px] font-semibold text-green-700">
                      Discounted by us: {formatCurrency(releaseImpoundDiscountedByUs)} MAD
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {tr('Charge selection', 'Sélection de facturation')}
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                <button
                  type="button"
                  onClick={() => {
                    if (waiveImpoundExtraDailyCharge) {
                      setReleaseImpoundChargePreset(null);
                      setWaiveImpoundExtraDailyCharge(false);
                      setReleaseImpoundForm((current) => {
                        const manualCharge = Math.max(0, Number(current.impoundCharge || 0));
                        return {
                          ...current,
                          days: 0,
                          hours: 0,
                          discount: 0,
                          calculatedTotal: 0,
                          amountPaid: manualCharge,
                        };
                      });
                      return;
                    }

                    setReleaseImpoundChargePreset('waive');
                    setWaiveImpoundExtraDailyCharge(true);
                    setReleaseImpoundForm((current) => ({
                      ...current,
                      days: 0,
                      hours: 0,
                      discount: 0,
                      impoundCharge: 0,
                      calculatedTotal: 0,
                      amountPaid: 0,
                    }));
                  }}
                  className={`col-span-2 inline-flex items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold transition-colors sm:col-span-2 ${
                    waiveImpoundExtraDailyCharge
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {tr('No charge', 'Sans frais')}
                </button>
                {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => applyReleaseImpoundDayChargePreset(days)}
                    title={tr(`Extra charge ${days} day${days > 1 ? 's' : ''}`, `Supplément ${days} jour${days > 1 ? 's' : ''}`)}
                    className={`inline-flex items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                      !waiveImpoundExtraDailyCharge && releaseImpoundChargePreset === days
                        ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('Discount (MAD)', 'Remise (MAD)')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={releaseImpoundForm.discount || ''}
                  disabled={waiveImpoundExtraDailyCharge}
                  onChange={(e) => {
                    const discount = Math.max(0, Number(e.target.value || 0));
                    const recalculated = calculateImpoundChargeTotal(
                      releaseImpoundForm.days,
                      releaseImpoundForm.hours,
                      releaseImpoundForm.rate,
                      discount,
                      rental?.rental_type,
                      releaseImpoundForm.rateMode
                    );
                    setReleaseImpoundForm((prev) => ({
                      ...prev,
                      discount,
                      calculatedTotal: recalculated,
                      amountPaid: Math.max(0, recalculated + Math.max(0, Number(prev.impoundCharge || 0))),
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('Impound charge (MAD)', 'Frais de fourrière (MAD)')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={waiveImpoundExtraDailyCharge ? 0 : (releaseImpoundForm.impoundCharge || '')}
                  disabled={waiveImpoundExtraDailyCharge}
                  onChange={(e) => {
                    const impoundCharge = Math.max(0, Number(e.target.value || 0));
                    setReleaseImpoundForm((prev) => ({
                      ...prev,
                      impoundCharge,
                      amountPaid: Math.max(0, Number(prev.calculatedTotal || 0) + impoundCharge),
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('Total charge (MAD)', 'Frais totaux (MAD)')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={waiveImpoundExtraDailyCharge ? 0 : (releaseImpoundForm.amountPaid || '')}
                  disabled={waiveImpoundExtraDailyCharge}
                  onChange={(e) => {
                    const amountPaid = Math.max(0, Number(e.target.value || 0));
                    setReleaseImpoundForm((prev) => ({
                      ...prev,
                      amountPaid,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                {!waiveImpoundExtraDailyCharge && (
                  <p className="mt-2 text-xs text-slate-500">
                    One-day extra charge uses the applied contract rate. Base charge {formatCurrency(selectedReleaseImpoundBaseCharge)} MAD + impound charge {formatCurrency(selectedReleaseImpoundManualCharge)} MAD = total charge {formatCurrency(Math.max(0, Number(releaseImpoundForm.amountPaid || 0)))} MAD.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-amber-100 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{tr('Impound receipt', 'Reçu de fourrière')}</p>
                  {releaseImpoundForm.receiptUrl ? (
                    <div className="mt-1 space-y-1">
                      <p className="text-sm text-gray-700">
                        {releaseImpoundForm.receiptName || tr('Impound receipt attached', 'Reçu de fourrière joint')}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={releaseImpoundForm.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-amber-700 underline underline-offset-2"
                        >
                          {tr('View attached receipt', 'Voir le reçu joint')}
                        </a>
                        {releaseImpoundForm.receiptUploadedAt && (
                          <span className="text-xs text-gray-500">
                            {tr('Uploaded', 'Téléversé')} {formatImpoundDateTime(releaseImpoundForm.receiptUploadedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-600">{tr('Attach the impound receipt.', 'Joignez le reçu de mise en fourrière.')}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    ref={releaseImpoundReceiptCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleReleaseImpoundReceiptUpload(e.target.files?.[0])}
                  />
                  <input
                    ref={releaseImpoundReceiptInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleReleaseImpoundReceiptUpload(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => releaseImpoundReceiptCameraInputRef.current?.click()}
                    disabled={impoundReceiptUploading || releaseImpoundSubmitting}
                    className={SECONDARY_ACTION_BUTTON_CLASS}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {impoundReceiptUploading ? tr('Uploading...', 'Téléversement...') : tr('Take Photo', 'Prendre une photo')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => releaseImpoundReceiptInputRef.current?.click()}
                    disabled={impoundReceiptUploading || releaseImpoundSubmitting}
                    className={SECONDARY_ACTION_BUTTON_CLASS}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {impoundReceiptUploading ? tr('Uploading...', 'Téléversement...') : tr('Import Receipt', 'Importer le reçu')}
                  </Button>
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 border-t border-slate-100 bg-white px-4 pt-3 sm:-mx-6 sm:px-6">
              <div className="flex justify-end gap-2 pb-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReleaseImpoundModal(false)}
                disabled={releaseImpoundSubmitting || impoundReceiptUploading}
                className={SECONDARY_ACTION_BUTTON_CLASS}
              >
                {tr('Cancel', 'Annuler')}
              </Button>
              <Button
                type="button"
                onClick={releaseRentalImpound}
                disabled={releaseImpoundSubmitting || impoundReceiptUploading}
                className={PRIMARY_ACTION_BUTTON_CLASS}
              >
                {releaseImpoundSubmitting ? tr('Releasing...', 'Libération...') : tr('Confirm Release', 'Confirmer la libération')}
              </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract Preview Modal */}
      <Dialog open={contractPreviewModal} onOpenChange={setContractPreviewModal}>
        <DialogContent className="sm:max-w-4xl w-full h-full sm:h-[90vh] p-0 flex flex-col mx-0 sm:mx-4">
          <DialogHeader className="p-4 sm:p-6 pb-3">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <FileText className="w-5 h-5 text-blue-600" />
          {tr('Contract Preview', 'Aperçu du contrat')}
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden"
          onClick={() => setContractPreviewModal(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <DialogDescription className="text-sm sm:text-base">
        {tr('Review before sending to', 'Vérifiez avant envoi à')} {rental.customer_name}
      </DialogDescription>
          </DialogHeader>

          {/* PDF Preview Area - FIXED SCROLL */}
          <div className="border-y border-gray-200 flex-1 min-h-0">
            <div className="h-full overflow-auto p-2 sm:p-4">
              <div className="bg-white p-3 sm:p-6">
                <div ref={contractTemplateRef}>
                  <ContractTemplate rental={contractRentalData} logoUrl={logoUrl} stampUrl={stampUrl} language={documentLanguage} />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons - Single Print Button */}
          <div className="flex justify-center p-4 sm:p-6 pt-0">
            <Button 
              onClick={handlePrintContract}
              className={`${PRIMARY_ACTION_BUTTON_CLASS} px-8 py-3 text-sm`}
            >
              <Printer className="w-4 h-4 mr-2" />
              {tr('Print Contract', 'Imprimer le contrat')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract PDF capture div — always rendered, captured on demand */}
      <div
        ref={contractPdfRef}
        style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', opacity: 0, zIndex: -9999, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <ContractTemplate rental={contractRentalData} logoUrl={logoUrl} stampUrl={stampUrl} language={documentLanguage} />
      </div>


      {/* Receipt Preview Modal */}
      <Dialog open={receiptPreviewModal} onOpenChange={setReceiptPreviewModal}>
        <DialogContent className="sm:max-w-4xl w-full h-full sm:h-[90vh] p-0 flex flex-col mx-0 sm:mx-4">
          <DialogHeader className="p-4 sm:p-6 pb-3">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">

          <Receipt className="w-5 h-5 text-purple-600" />
          {receiptPreviewMeta.title}
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden"
          onClick={() => setReceiptPreviewModal(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <DialogDescription className="text-sm sm:text-base">
        {receiptPreviewMeta.description}
      </DialogDescription>
          </DialogHeader>

          {/* PDF Preview Area - FIXED SCROLL */}
          <div className="border-y border-gray-200 flex-1 min-h-0">
            <div className="h-full overflow-auto p-2 sm:p-4">
              <div className="bg-white p-3 sm:p-6">
                <div ref={receiptTemplateRef}>
                  <ReceiptTemplate 
            rental={receiptRentalData} 
            logoUrl={logoUrl} 
            stampUrl={stampUrl} 
            bookingGraceMinutes={rentalTimingSettings.graceMinutes}
            language={documentLanguage}
          />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons - Single Print Button */}
          <div className="flex justify-center p-4 sm:p-6 pt-0">
            <Button 
              onClick={handlePrintReceipt}
              className={`${PRIMARY_ACTION_BUTTON_CLASS} px-8 py-3 text-sm`}
            >
              <Printer className="w-4 h-4 mr-2" />
              {tr('Print Receipt', 'Imprimer le reçu')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt PDF capture div — always rendered, captured on demand */}
      <div
        ref={receiptPdfRef}
        style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', opacity: 0, zIndex: -9999, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <ReceiptTemplate
          rental={receiptRentalData}
          logoUrl={logoUrl}
          stampUrl={stampUrl}
          bookingGraceMinutes={rentalTimingSettings.graceMinutes}
          language={documentLanguage}
        />
      </div>

      {/* WhatsApp Send Modal */}
      <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-white via-violet-50 to-white px-6 py-5">
              <FaWhatsapp className="text-violet-600" />
              {tr('Send via WhatsApp', 'Envoyer via WhatsApp')}
            </DialogTitle>
            <DialogDescription className="px-6 pt-3 text-sm text-slate-600">
              {tr('Select items to send to', 'Sélectionnez les éléments à envoyer à')} {rental.customer_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 px-6 py-4">
            {/* Contract Box */}
            <div 
              className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${whatsappOptions.contract ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
              onClick={() => setWhatsappOptions({...whatsappOptions, contract: !whatsappOptions.contract})}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${whatsappOptions.contract ? 'border-violet-500 bg-violet-500' : 'border-slate-400 bg-white'}`}>
                    {whatsappOptions.contract && <FaCheck className="text-white text-xs" />}
                  </div>
                  <div>
                    <p className="font-medium">{tr('Rental Contract', 'Contrat de location')}</p>
                    <p className="text-sm text-gray-500">{tr('PDF document with terms and conditions', 'Document PDF avec les termes et conditions')}</p>
                  </div>
                </div>
                <FaFilePdf className="text-red-500" />
              </div>
            </div>
            
            {/* Receipt Box */}
            <div 
              className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${whatsappOptions.receipt ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
              onClick={() => setWhatsappOptions({...whatsappOptions, receipt: !whatsappOptions.receipt})}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${whatsappOptions.receipt ? 'border-violet-500 bg-violet-500' : 'border-slate-400 bg-white'}`}>
                    {whatsappOptions.receipt && <FaCheck className="text-white text-xs" />}
                  </div>
                  <div>
                    <p className="font-medium">{receiptPreviewMeta.listLabel}</p>
                    <p className="text-sm text-gray-500">{receiptPreviewMeta.listDescription}</p>
                  </div>
                </div>
                <FaFileInvoice className="text-violet-500" />
              </div>
            </div>
            
                                    {/* Opening Media Box - Only show if opening media exists */}
      {openingMedia.length > 0 && (
        <div 
          className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${whatsappOptions.openingVideo ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
          onClick={() => setWhatsappOptions({...whatsappOptions, openingVideo: !whatsappOptions.openingVideo})}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${whatsappOptions.openingVideo ? 'border-violet-500 bg-violet-500' : 'border-slate-400 bg-white'}`}>
                {whatsappOptions.openingVideo && <FaCheck className="text-white text-xs" />}
              </div>
              <div>
                <p className="font-medium">{tr('Opening Media', 'Médias de départ')}</p>
                <p className="text-sm text-gray-500">{tr('Vehicle condition at rental start', "État du véhicule au départ")}</p>
              </div>
            </div>
            <FaVideo className="text-purple-500" />
          </div>
        </div>
      )}
      
      {/* Closing Media Box - Only show if closing media exists */}
            {closingMedia.length > 0 && (
        <div 
          className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${whatsappOptions.closingVideo ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
          onClick={() => setWhatsappOptions({...whatsappOptions, closingVideo: !whatsappOptions.closingVideo})}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${whatsappOptions.closingVideo ? 'bg-amber-500 border-amber-500' : 'bg-white border-gray-400'}`}>
                {whatsappOptions.closingVideo && <FaCheck className="text-white text-xs" />}
              </div>
              <div>
                <p className="font-medium">{tr('Closing Media', 'Médias de retour')}</p>
                <p className="text-sm text-gray-500">{tr('Vehicle condition at return', "État du véhicule au retour")}</p>
              </div>
            </div>
            <FaVideo className="text-amber-500" />
          </div>
        </div>
      )}

      <div 
        className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${whatsappOptions.bankingInfo ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
        onClick={() => setWhatsappOptions({...whatsappOptions, bankingInfo: !whatsappOptions.bankingInfo})}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${whatsappOptions.bankingInfo ? 'border-emerald-500 bg-emerald-500' : 'border-slate-400 bg-white'}`}>
              {whatsappOptions.bankingInfo && <FaCheck className="text-white text-xs" />}
            </div>
            <div>
              <p className="font-medium">{tr('Banking Info', 'Informations bancaires')}</p>
              <p className="text-sm text-gray-500">{tr('QR code and bank details image', 'Image avec QR code et coordonnées bancaires')}</p>
            </div>
          </div>
          <CreditCard className="h-5 w-5 text-emerald-600" />
        </div>
      </div>
          
          </div>
      <div className="flex gap-3 border-t border-slate-100 pt-5 pb-1 mt-2">
        <Button
          variant="outline"
          onClick={() => setWhatsappModalOpen(false)}
          className={SECONDARY_ACTION_BUTTON_CLASS}
        >
          {tr('Cancel', 'Annuler')}
        </Button>
        <Button
          className={`${PRIMARY_ACTION_BUTTON_CLASS} flex items-center gap-2`}
          onClick={async () => {
            // Use the updated handleSendWhatsAppSelection function
            await handleSendWhatsAppSelection(whatsappOptions);
          }}
        >
          <FaWhatsapp size={18} />
          {tr('Send via WhatsApp', 'Envoyer via WhatsApp')}
        </Button>
      </div>
    </DialogContent>
  </Dialog>

      <Dialog open={showSecurityHoldReminderModal} onOpenChange={setShowSecurityHoldReminderModal}>
        <DialogContent className="sm:max-w-md rounded-[28px] border border-violet-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {tr('Security Hold Reminder', 'Rappel garantie')}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {tr(
                'Before signing, confirm whether the customer already gave the security deposit.',
                'Avant la signature, confirmez si le client a déjà remis la garantie.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                {tr('Suggested amount', 'Montant suggéré')}
              </p>
              <input
                type="text"
                inputMode="decimal"
                value={securityHoldAmountInput}
                onChange={(e) => setSecurityHoldAmountInput(normalizeMoneyInputValue(e.target.value))}
                placeholder={String(requiredSecurityAmount || 0)}
                className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              <p className="mt-2 text-xs text-slate-500">
                {tr(
                  `Required security: ${formatCurrency(requiredSecurityAmount)} MAD`,
                  `Garantie requise : ${formatCurrency(requiredSecurityAmount)} MAD`
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                onClick={() => handleSecurityHoldReminderAction('cash')}
                className={SUCCESS_ACTION_BUTTON_CLASS}
                disabled={isSavingSecurityHold}
              >
                {tr('Yes, Cash', 'Oui, espèces')}
              </Button>
              <Button
                type="button"
                onClick={() => handleSecurityHoldReminderAction('bank_transfer')}
                className={PRIMARY_ACTION_BUTTON_CLASS}
                disabled={isSavingSecurityHold}
              >
                {tr('Yes, Bank Transfer', 'Oui, virement')}
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => handleSecurityHoldReminderAction(null)}
              className="w-full"
              disabled={isSavingSecurityHold}
            >
              {tr('No, Continue to Sign', 'Non, continuer à signer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
            

      <SignaturePadModal
        isOpen={isSigning}
        onClose={() => setIsSigning(false)}
        onSave={handleSignatureSave}
      />

      <SignaturePadModal
        isOpen={showDepositSignatureModal}
        onClose={() => setShowDepositSignatureModal(false)}
        onSave={handleDepositSignatureSave}
        title={
          tr('Signature', 'Signature')
        }
        description={(() => {
          if (hasHeldSecurityDocument && hasMonetaryDamageDeposit) {
            const depositCalc = calculateDepositReturn();
            if (deductFromDeposit && depositCalc.hasDeduction) {
              return `I confirm receipt of my held security document and ${depositCalc.depositReturn.toFixed(2)} MAD as damage deposit return.

Breakdown:
• Held document returned to me
• Original Deposit: ${depositCalc.damageDeposit.toFixed(2)} MAD
• Less: Unpaid Balance: ${depositCalc.balanceDue.toFixed(2)} MAD
• Net Return: ${depositCalc.depositReturn.toFixed(2)} MAD${depositCalc.additionalOwed > 0 ? `

⚠️ Note: Additional ${depositCalc.additionalOwed.toFixed(2)} MAD is still owed.` : ''}`;
            }

            return `I confirm receipt of my held security document and ${depositCalc.depositReturn.toFixed(2)} MAD as full damage deposit return.`;
          }
          if (isDocumentDeposit) {
            return 'I confirm receipt of my security document and acknowledge that it has been returned to me.';
          }
          const depositCalc = calculateDepositReturn();
          if (deductFromDeposit && depositCalc.hasDeduction) {
            return `I confirm receipt of ${depositCalc.depositReturn.toFixed(2)} MAD as damage deposit return.

Breakdown:
• Original Deposit: ${depositCalc.damageDeposit.toFixed(2)} MAD
• Less: Unpaid Balance: ${depositCalc.balanceDue.toFixed(2)} MAD
• Net Return: ${depositCalc.depositReturn.toFixed(2)} MAD${depositCalc.additionalOwed > 0 ? `

⚠️ Note: Additional ${depositCalc.additionalOwed.toFixed(2)} MAD is still owed.` : ''}`;
          } else {
            return `I confirm receipt of ${depositCalc.depositReturn.toFixed(2)} MAD as full damage deposit return.`;
          }
        })()}
      />

      {/* Separate Signature Modal for Return Contract */}
      <SignaturePadModal
        isOpen={isSigningReturnContract}
        onClose={() => setIsSigningReturnContract(false)}
        onSave={async (signatureUrl) => {
          try {
            // Save return signature
            setReturnSignatureUrl(signatureUrl);
            setIsSigningReturnContract(false);
            
            // ✅ REPLACE the previous signature with the new one
            const { error } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({ 
                signature_url: signatureUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (error) throw error;
            
            // Update local state
            setRental(prev => ({
              ...prev,
              signature_url: signatureUrl
            }));
            
            toast.success('Return contract signed! This signature replaces the previous one.');
            
          } catch (err) {
            console.error('❌ Error saving return signature:', err);
            toast.error(`Failed to save return signature. Error: ${err.message}`);
          }
        }}
        title="Sign Return Contract"
        description="Please sign to confirm vehicle return and accept any additional charges"
      />

      <ViewCustomerDetailsDrawer
        isOpen={customerDetailsDrawer.isOpen}
        onClose={() => setCustomerDetailsDrawer({ isOpen: false, customerId: null, rental: null, secondDrivers: [], viewMode: 'customer' })}
        customerId={customerDetailsDrawer.customerId}
        rental={rental}
        secondDrivers={customerDetailsDrawer.secondDrivers}
        viewMode={customerDetailsDrawer.viewMode}
      />

      <ExtensionRequestModal
        isOpen={extensionModalOpen}
        onClose={() => {
          setExtensionModalOpen(false);
          setEditingExtension(null);
        }}
        rental={rental}
        onExtensionCreated={handleExtensionCreated}
        currentUser={currentUser}
        editingExtension={editingExtension}
      />

      <div className="fixed inset-0 pointer-events-none opacity-0 z-[-1]" aria-hidden="true">
        <div ref={contractRef}>
            <RentalContract rental={rental} />
        </div>
        <div ref={invoiceRef}>
            {rental && <InvoiceTemplate rental={formattedRentalForInvoice} logoUrl={logoUrl} stampUrl={stampUrl} />}
        </div>
      </div>

      {/* Share capture divs — position:absolute so they render at full height, no viewport clipping */}
      <div ref={contractShareRef} style={{
        position: 'absolute',
        left: '-9999px',
        top: 0,
        width: '794px',
        pointerEvents: 'none',
        opacity: 0
      }} aria-hidden="true">
        <ContractTemplate rental={contractRentalData} logoUrl={logoUrl} stampUrl={stampUrl} language={documentLanguage} />
      </div>
      <div ref={receiptShareRef} style={{
        position: 'absolute',
        left: '-9999px',
        top: 0,
        width: '794px',
        pointerEvents: 'none',
        opacity: 0
      }} aria-hidden="true">
        <ReceiptTemplate 
          rental={receiptRentalData} 
          logoUrl={logoUrl} 
          stampUrl={stampUrl}
          bookingGraceMinutes={rentalTimingSettings.graceMinutes}
          language={documentLanguage}
        />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-violet-100/80 bg-white/96 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-18px_36px_rgba(76,29,149,0.08)] backdrop-blur sm:hidden">
    <div className="rounded-[24px] border border-violet-100/80 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 p-2 shadow-[0_14px_30px_rgba(76,29,149,0.08)]">
      <div className="grid grid-cols-3 gap-2">
        <Button
            onClick={() => setContractPreviewModal(true)}
            className={`h-auto ${MOBILE_FOOTER_SECONDARY_CLASS}`}
            size="sm"
        >
            {isGeneratingContract ? '...' : 'Contract'}
        </Button>
        <Button
            onClick={() => setReceiptPreviewModal(true)}
            className={`h-auto ${MOBILE_FOOTER_PRIMARY_CLASS}`}
            size="sm"
        >
            {isGeneratingReceipt ? '...' : 'Receipt'}
        </Button>
        <Button
            onClick={handleWhatsAppClick}
            onTouchStart={ensurePDFsReady}
            disabled={isSharing}
            className={`h-auto ${isSharing ? MOBILE_FOOTER_DISABLED_CLASS : MOBILE_FOOTER_SUCCESS_CLASS}`}
            size="sm"
        >
            {isSharing ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <FaWhatsapp size={12} className="mr-1" />
            )}
            {isSharing ? '...' : 'WhatsApp'}
        </Button>
      </div>
    </div>
</div>

            {/* Capture Flash Animation */}
      <style>{`
        @keyframes capture-flash {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        .capture-flash {
          animation: capture-flash 0.2s ease-out;
        }
        @media (max-width: 639px) {
          .mobile-timer-value {
            font-size: 2.65rem !important;
            line-height: 0.96 !important;
            letter-spacing: -0.03em !important;
          }
          .mobile-summary-value {
            font-size: 1.26rem !important;
            line-height: 1.08 !important;
            letter-spacing: -0.02em !important;
          }
          .mobile-summary-schedule {
            font-size: 1rem !important;
            line-height: 1.12 !important;
            letter-spacing: -0.01em !important;
          }
          .mobile-summary-support {
            font-size: 0.88rem !important;
            line-height: 1.3 !important;
          }
        }
      `}</style>

    </div>
    </div>
  );
}
