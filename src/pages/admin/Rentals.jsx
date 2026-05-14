import React, { useState, useEffect, useMemo, useDeferredValue, useRef, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import EnhancedStepperRentalForm from '../../components/admin/EnhancedStepperRentalForm';
import VideoContractModal from '../../components/VideoContractModal';
import ViewCustomerDetailsDrawer from '../../components/admin/ViewCustomerDetailsDrawer';
import VehicleReportService from '../../services/VehicleReportService';
import FuelTransactionService from '../../services/FuelTransactionService';
import EnhancedTransactionalRentalService from '../../services/EnhancedTransactionalRentalService';
import PricingRulesService from '../../services/PricingRulesService';
import appWarmupService from '../../services/AppWarmupService';
import rentalSummaryService from '../../services/RentalSummaryService';
import { DEFAULT_RENTAL_TIMING_SETTINGS, deriveEffectiveRentalStatus, getScheduledRentalTimingState, normalizeRentalLifecycle } from '../../utils/rentalLifecycle';
import { getPaymentStatusStyle, normalizePaymentStatus } from '../../config/statusColors';
import { roundTo } from '../../utils/fuelMath';
import { Plus, Clock, ClipboardList, List, Grid, LayoutGrid, CheckCircle, XCircle, Calendar, MessageCircle, RectangleHorizontal, ChevronDown, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import i18n from '../../i18n';
import { canEditRentalContract } from '../../utils/permissionHelpers';
import { fetchSystemSettings } from '../../services/systemSettingsApi';
import { TABLE_NAMES } from '../../config/tableNames';
import { dispatchRentalLifecycleTelegramEvent } from '../../services/RentalLifecycleDispatchService';
import { buildRentalTelegramVehicleLabel } from '../../utils/rentalTelegram';
import { getScopedOrganizationId, applyOrganizationScope } from '../../services/OrganizationService';
import { getHostContext, isFirstPartyTenantHost } from '../../utils/hostContext';
import {
  getRentalCollectedAmount as getRentalCollectedAmountShared,
  getRentalCollectedAmountInWindow,
  getRentalCompanyDiscountAmount,
} from '../../utils/rentalFinancials';
import { toast } from 'sonner';

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 800 });
  }

  return window.setTimeout(callback, 0);
};

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);
const normalizeRentalSearchText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const RENTAL_STATUS_DISPLAY_PRIORITY = {
  active: 0,
  scheduled: 1,
  completed: 2,
  expired: 3,
  cancelled: 4,
};

const getRentalDisplayTimestamp = (rental) => (
  rental?.updated_at ||
  rental?.started_at ||
  rental?.completed_at ||
  rental?.rental_start_date ||
  rental?.created_at ||
  0
);

const sortRentalsForDisplay = (rentals, getEffectiveRentalStatus) =>
  [...rentals].sort((left, right) => {
    const leftStatus = getEffectiveRentalStatus(left);
    const rightStatus = getEffectiveRentalStatus(right);
    const leftPriority = RENTAL_STATUS_DISPLAY_PRIORITY[leftStatus] ?? 99;
    const rightPriority = RENTAL_STATUS_DISPLAY_PRIORITY[rightStatus] ?? 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(getRentalDisplayTimestamp(right)).getTime() - new Date(getRentalDisplayTimestamp(left)).getTime();
  });

const buildRentalExtensionsMap = (extensions = []) =>
  (extensions || []).reduce((acc, extension) => {
    const rentalId = extension?.rental_id;
    if (!rentalId) return acc;
    if (!acc[rentalId]) {
      acc[rentalId] = [];
    }
    acc[rentalId].push(extension);
    return acc;
  }, {});
const openRentalWizard = (setShowStepperForm, setWizardUiVariant, variant = 'default') => () => {
  setWizardUiVariant(variant);
  setShowStepperForm(true);
};

const buildVehicleReminderLabel = (rental) => {
  const vehicleDisplay = resolveRentalVehicleDisplay(rental);
  const vehicleName = vehicleDisplay.name || '';
  const vehicleModel = vehicleDisplay.model || '';
  const plateNumber = vehicleDisplay.plateNumber || '';

  return [vehicleName, vehicleModel].filter(Boolean).join(' - ') || plateNumber || tr('your vehicle', 'votre véhicule');
};

const openWhatsAppContact = (url) => {
  window.location.assign(url);
};

const isAbortLikeError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  return (
    name === 'aborterror' ||
    message.includes('aborterror') ||
    message.includes('signal is aborted') ||
    message.includes('signal has been aborted') ||
    message.includes('the operation was aborted') ||
    message.includes('body stream already read')
  );
};

const insertSharedRentalActivityLog = async (payload) => {
  const modernPayload = {
    actor_id: payload.user_id || null,
    actor_type: 'user',
    event_type: payload.action || 'rental_activity',
    entity_id: payload.entity_id || null,
    entity_type: payload.entity_type || 'rental',
    user_name: payload.created_by || null,
    payload: payload.description ? { description: payload.description, reason: payload.reason || null } : null,
    metadata: payload.details || payload.metadata || null,
  };

  const modernAttempt = await supabase
    .from(TABLE_NAMES.ACTIVITY_LOG)
    .insert(modernPayload);

  if (!modernAttempt.error) return modernAttempt;

  return supabase
    .from(TABLE_NAMES.ACTIVITY_LOG)
    .insert(payload);
};

const buildVehicleHistorySnapshot = (vehicle) => ({
  vehicle_id: vehicle?.id || null,
  plate_number_snapshot: vehicle?.plate_number || null,
  vehicle_name_snapshot: vehicle?.name || vehicle?.vehicle_model?.name || null,
  vehicle_model_snapshot: vehicle?.model || vehicle?.vehicle_model?.model || null,
});

const resolveRentalVehicleDisplay = (rental) => {
  const vehicle = rental?.vehicle || null;

  return {
    plateNumber:
      vehicle?.plate_number ||
      rental?.vehicle_plate_number ||
      rental?.selected_vehicle_plate_snapshot ||
      rental?.plate_number_snapshot ||
      null,
    name:
      vehicle?.name ||
      vehicle?.vehicle_model?.name ||
      vehicle?.vehicle_model?.model ||
      rental?.vehicle_name_snapshot ||
      rental?.selected_vehicle_name_snapshot ||
      rental?.vehicle_label_snapshot ||
      null,
    model:
      vehicle?.model ||
      vehicle?.vehicle_model?.model ||
      vehicle?.vehicle_model?.name ||
      rental?.vehicle_model_snapshot ||
      rental?.selected_vehicle_model_snapshot ||
      null,
    vehicleType:
      vehicle?.vehicle_type ||
      rental?.vehicle_type_snapshot ||
      null,
  };
};

const RENTALS_BASE_SELECT = `
  id,
  rental_id,
  customer_id,
  customer_name,
  customer_email,
  customer_phone,
  booking_source,
  inventory_source,
  booking_mode,
  rental_type,
  rental_status,
  rental_start_date,
  rental_end_date,
  rental_start_time,
  rental_end_time,
  actual_end_date,
  started_at,
  completed_at,
  created_at,
  vehicle_id,
  status,
  payment_status,
  approval_status,
  pending_total_request,
  total_amount,
  deposit_amount,
  remaining_amount,
  deposit_deduction_amount,
  amount_due_override_reason,
  fuel_charge,
  end_fuel_level,
  unit_price,
  quantity_days,
  quantity_hours,
  vehicle_plate_number,
  package_id,
  package_name,
  package_rate_per_unit,
  package_total_included_km,
  use_package_pricing,
  signature_url,
  contract_signed,
  opening_video_url,
  start_odometer,
  start_fuel_level,
  damage_deposit,
  deposit_returned_at,
  is_impounded,
  impounded_at,
  released_from_impound_at,
  vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
    id,
    name,
    model,
    plate_number,
    status,
    vehicle_type
  ),
  package:app_4c3a7a6153_rental_km_packages!package_id(
    id,
    name,
    duration_units,
    fixed_amount,
    included_kilometers,
    extra_km_rate
  )
`;

const RENTALS_OPTIONAL_AUDIT_SELECT = `
  amount_due_override_previous_amount
`;

const RENTALS_OPTIONAL_VEHICLE_SNAPSHOT_SELECT = `
  selected_vehicle_plate_snapshot,
  plate_number_snapshot,
  selected_vehicle_name_snapshot,
  selected_vehicle_model_snapshot,
  vehicle_name_snapshot,
  vehicle_model_snapshot,
  vehicle_label_snapshot
`;

const RENTALS_RETURN_SNAPSHOT_STORAGE_KEY = 'rentals_return_snapshot';

const buildRentalsSelect = ({ includeAuditColumns = true, includeVehicleSnapshots = true } = {}) => `
  ${RENTALS_BASE_SELECT}
  ${includeAuditColumns ? `,${RENTALS_OPTIONAL_AUDIT_SELECT}` : ''}
  ${includeVehicleSnapshots ? `,${RENTALS_OPTIONAL_VEHICLE_SNAPSHOT_SELECT}` : ''}
`;

const isMissingRentalsAuditColumnError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return (
    (code === 'PGRST204' || code === '42703') &&
    message.includes('amount_due_override_previous_amount')
  );
};

const isMissingRentalsVehicleSnapshotColumnError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return (
    (code === 'PGRST204' || code === '42703') &&
    (
      message.includes('selected_vehicle_plate_snapshot') ||
      message.includes('plate_number_snapshot') ||
      message.includes('selected_vehicle_name_snapshot') ||
      message.includes('selected_vehicle_model_snapshot') ||
      message.includes('vehicle_name_snapshot') ||
      message.includes('vehicle_model_snapshot') ||
      message.includes('vehicle_label_snapshot')
    )
  );
};

const formatRentalWhatsAppDate = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return tr('your scheduled time', 'votre horaire prévu');
  }

  return parsed.toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildRentalWhatsAppOptions = (rental, effectiveRentalStatus, paymentSnapshot) => {
  const cleanPhone = String(rental?.customer_phone || '').replace(/\D/g, '');
  if (!cleanPhone) return [];

  const now = new Date();
  const startDate = rental?.rental_start_date ? new Date(rental.rental_start_date) : null;
  const endDate = rental?.rental_end_date ? new Date(rental.rental_end_date) : null;
  const vehicleLabel = buildVehicleReminderLabel(rental);
  const customerName = rental?.customer_name || tr('there', 'bonjour');
  const rentalId = rental?.rental_id || '';
  const formattedStart = formatRentalWhatsAppDate(rental?.rental_start_date);
  const formattedEnd = formatRentalWhatsAppDate(rental?.rental_end_date);
  const hasValidStart = startDate instanceof Date && !Number.isNaN(startDate.getTime());
  const hasValidEnd = endDate instanceof Date && !Number.isNaN(endDate.getTime());
  const startsWithin24Hours =
    hasValidStart && startDate.getTime() > now.getTime() && startDate.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
  const isLateForPickup =
    effectiveRentalStatus === 'scheduled' &&
    hasValidStart &&
    startDate.getTime() <= now.getTime();
  const nearReturn =
    effectiveRentalStatus === 'active' &&
    hasValidEnd &&
    endDate.getTime() >= now.getTime() &&
    endDate.getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
  const balanceDue = Number(paymentSnapshot?.balanceDue || 0);

  const templates = [
    {
      id: 'general',
      priority: 1,
      label: tr('General contact', 'Contact général'),
      preview: tr('General message about this rental.', 'Message général à propos de cette location.'),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, nous vous contactons au sujet de votre location ${rentalId} pour ${vehicleLabel}.`
        : `Hi ${customerName}, we are contacting you regarding your rental ${rentalId} for ${vehicleLabel}.`,
    },
    {
      id: 'upcoming',
      priority: startsWithin24Hours ? 0 : 3,
      hidden: !startsWithin24Hours && effectiveRentalStatus !== 'scheduled',
      label: tr('Upcoming reminder', 'Rappel à venir'),
      preview: tr('Reminder for the upcoming rental time.', "Rappel pour l'heure de location à venir."),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, rappel amical : votre location ${rentalId} pour ${vehicleLabel} est prévue le ${formattedStart}. Répondez-nous ici si vous avez besoin d'aide ou d'un ajustement.`
        : `Hi ${customerName}, friendly reminder: your rental ${rentalId} for ${vehicleLabel} is scheduled for ${formattedStart}. Reply here if you need any help or adjustment.`,
    },
    {
      id: 'late',
      priority: isLateForPickup ? 0 : 4,
      hidden: !isLateForPickup,
      label: tr('Customer late', 'Client en retard'),
      preview: tr('Quick check-in when the customer is late.', 'Vérification rapide lorsque le client est en retard.'),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, nous vous attendons pour votre location ${rentalId} prévue à ${formattedStart}. Êtes-vous en route ?`
        : `Hi ${customerName}, we are waiting for your rental ${rentalId} scheduled at ${formattedStart}. Are you on your way?`,
    },
    {
      id: 'arrived',
      priority: isLateForPickup ? 1 : 5,
      hidden: !isLateForPickup,
      label: tr('Customer arrived', 'Client arrivé'),
      preview: tr('Confirm arrival and next step.', "Confirmer l'arrivée et la prochaine étape."),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, merci. Une fois arrivé(e), présentez-vous à l'équipe SaharaX et nous terminerons votre départ pour ${vehicleLabel}.`
        : `Hi ${customerName}, thank you. Once you arrive, please check in with the SaharaX team and we will complete your departure for ${vehicleLabel}.`,
    },
    {
      id: 'no_show',
      priority: isLateForPickup ? 2 : 6,
      hidden: !isLateForPickup,
      label: tr('No-show warning', 'Avertissement absence'),
      preview: tr('Last warning before marking no-show.', "Dernier avertissement avant marquage en absence."),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, sans réponse rapide de votre part, votre location ${rentalId} pourra être marquée comme absence et le véhicule sera remis à disposition.`
        : `Hi ${customerName}, if we do not hear from you shortly, your rental ${rentalId} may be marked as a no-show and the vehicle will be released.`,
    },
    {
      id: 'documents',
      priority: 4,
      label: tr('Documents sent', 'Documents envoyés'),
      preview: tr('Tell the customer their documents were sent.', 'Informer le client que ses documents ont été envoyés.'),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, nous venons de vous envoyer les documents de votre location ${rentalId}. Dites-nous si vous avez besoin d'autre chose.`
        : `Hi ${customerName}, we have just sent the documents for your rental ${rentalId}. Let us know if you need anything else.`,
    },
    {
      id: 'payment',
      priority: balanceDue > 0 ? 0 : 5,
      hidden: balanceDue <= 0,
      label: tr('Payment reminder', 'Rappel de paiement'),
      preview: tr('Follow up on the remaining balance.', 'Suivi du solde restant.'),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, il reste ${balanceDue.toFixed(0)} MAD à régler pour votre location ${rentalId}. Merci de nous confirmer votre mode de paiement.`
        : `Hi ${customerName}, there is still ${balanceDue.toFixed(0)} MAD due for your rental ${rentalId}. Please confirm how you would like to settle it.`,
    },
    {
      id: 'extension',
      priority: effectiveRentalStatus === 'active' ? 3 : 6,
      hidden: effectiveRentalStatus !== 'active',
      label: tr('Extension follow-up', 'Suivi extension'),
      preview: tr('Ask whether the customer wants more time.', "Demander si le client souhaite plus de temps."),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, souhaitez-vous prolonger votre location ${rentalId} pour ${vehicleLabel} ? Nous pouvons vous confirmer les options ici sur WhatsApp.`
        : `Hi ${customerName}, would you like to extend your rental ${rentalId} for ${vehicleLabel}? We can confirm the options here on WhatsApp.`,
    },
    {
      id: 'return',
      priority: nearReturn ? 0 : 5,
      hidden: effectiveRentalStatus !== 'active',
      label: tr('Return reminder', 'Rappel de retour'),
      preview: tr('Reminder about the upcoming return time.', "Rappel de l'heure de retour à venir."),
      message: isFrenchLocale()
        ? `Bonjour ${customerName}, votre location ${rentalId} pour ${vehicleLabel} se termine le ${formattedEnd}. Merci de nous informer si vous êtes en route pour le retour.`
        : `Hi ${customerName}, your rental ${rentalId} for ${vehicleLabel} ends on ${formattedEnd}. Please let us know when you are on your way back.`,
    },
  ];

  return templates
    .filter((template) => !template.hidden)
    .sort((a, b) => a.priority - b.priority);
};

const recalculateAutoRentalPrice = async (rental) => {
  let autoCalculatedPrice = parseFloat(rental?.total_amount) || 0;

  if (rental?.vehicle?.id && rental?.rental_start_date && rental?.rental_end_date) {
    try {
      const priceResult = await PricingRulesService.calculatePrice(
        rental.vehicle.id,
        rental.rental_start_date,
        rental.rental_end_date,
        rental.rental_type || 'daily'
      );

      if (priceResult?.price > 0) {
        autoCalculatedPrice = priceResult.price;
      }
    } catch (calcError) {
      console.warn('⚠️ Could not recalculate rental price while declining override:', calcError);
    }
  }

  return autoCalculatedPrice;
};


// Helper function to get rental type badge
const getRentalTypeBadge = (rentalType) => {
  if (rentalType === 'daily') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
        📅 {tr('DAILY', 'JOURNALIER')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">
      ⏰ {tr('HOURLY', 'HORAIRE')}
    </span>
  );
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

const isWebsiteCustomerBooking = (rental = {}) =>
  WEBSITE_BOOKING_SOURCE_FIELDS.some((field) => {
    const value = rental?.[field];
    if (value === null || value === undefined) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    return WEBSITE_BOOKING_SOURCE_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
  });

const getBookingSourceBadge = (rental) => {
  const source = String(rental?.booking_source || rental?.inventory_source || '').toLowerCase();

  if (isWebsiteCustomerBooking(rental) || source === 'website') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
        🌐 {tr('WEBSITE RESERVATION', 'RESERVATION SITE WEB')}
      </span>
    );
  }

  if (source === 'marketplace') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
        🛍️ {tr('MARKETPLACE', 'MARKETPLACE')}
      </span>
    );
  }

  return null;
};

const isNoShowCancellation = (rental = {}) =>
  String(rental?.cancellation_reason || '').trim().toLowerCase() === 'no_show';

const BUSINESS_DAY_START_HOUR = 10;
const BUSINESS_DAY_END_HOUR = 3;
const RENTALS_WORKSPACE_PREF_KEY = 'saharax:rentals:workspace';

const getStoredRentalsWorkspace = () => {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(RENTALS_WORKSPACE_PREF_KEY);
  return ['today', 'upcoming', 'past'].includes(stored) ? stored : null;
};
const STATUS_TAB_KEYS = ['all', 'active', 'scheduled', 'completed', 'no_show_review', 'cancelled', 'maintenance', 'impounded'];

const toDateInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
};

const fromDateInputValue = (value) => {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const startOfWeek = (date) => {
  const base = new Date(date);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  base.setHours(12, 0, 0, 0);
  return base;
};

const endOfWeek = (date) => {
  const base = startOfWeek(date);
  base.setDate(base.getDate() + 6);
  base.setHours(12, 0, 0, 0);
  return base;
};

const startOfMonth = (date) => {
  const base = new Date(date);
  base.setDate(1);
  base.setHours(12, 0, 0, 0);
  return base;
};

const normalizeDateRange = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  startDate.setHours(12, 0, 0, 0);
  endDate.setHours(12, 0, 0, 0);
  return startDate <= endDate
    ? { start: startDate, end: endDate }
    : { start: endDate, end: startDate };
};

const isSameCalendarDay = (left, right) => {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return toDateInputValue(leftDate) === toDateInputValue(rightDate);
};

const isDateWithinInclusiveRange = (date, start, end) => {
  const target = new Date(date).getTime();
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  return target >= from && target <= to;
};

const toSafeDate = (value) => {
  const parsed = value ? new Date(value) : null;
  return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const getBusinessDayWindow = (now = new Date()) => {
  const current = new Date(now);
  const start = new Date(current);
  const hour = current.getHours();

  if (hour < BUSINESS_DAY_END_HOUR) {
    start.setDate(start.getDate() - 1);
  }

  start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);

  return { start, end };
};

const getBusinessWeekWindow = (now = new Date()) => {
  const { start: businessDayStart } = getBusinessDayWindow(now);
  const start = new Date(businessDayStart);
  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + mondayOffset);
  start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);

  return { start, end };
};

const getCalendarDayWindow = (now = new Date()) => {
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getDateFocusWindow = (focus, workspace, now = new Date(), customRange = null) => {
  if (focus === 'custom' && customRange?.start && customRange?.end) {
    const start = new Date(customRange.start);
    const end = new Date(customRange.end);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (focus === 'calendar-day') {
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (focus === 'day') {
    return getBusinessDayWindow(now);
  }

  if (focus === 'week') {
    const { start: businessDayStart, end: businessDayEnd } = getBusinessDayWindow(now);

    if (workspace === 'past') {
      const start = new Date(businessDayStart);
      start.setDate(start.getDate() - 7);
      return { start, end: businessDayStart };
    }

    if (workspace === 'upcoming') {
      const end = new Date(businessDayEnd);
      end.setDate(end.getDate() + 7);
      return { start: businessDayEnd, end };
    }

    return getBusinessWeekWindow(now);
  }

  if (focus === 'last7') {
    const { end } = getBusinessDayWindow(now);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { start, end };
  }

  if (focus === 'month') {
    const { end } = getBusinessDayWindow(now);
    const start = startOfMonth(now);
    start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
    return { start, end };
  }

  return null;
};

const getDefaultDateFocusForWorkspace = (workspace) => {
  if (workspace === 'today') return 'calendar-day';
  return 'all';
};

const getPackageRentalDurationUnits = (rental = {}) => {
  const storedDuration = rental?.rental_type === 'hourly'
    ? Number(rental?.quantity_hours ?? rental?.quantity_days)
    : Number(rental?.quantity_days);

  if (Number.isFinite(storedDuration) && storedDuration > 0) {
    return storedDuration;
  }

  if (rental?.use_package_pricing) {
    const packageDuration = Number(
      rental?.package?.duration_units ??
      rental?.package_duration_units ??
      rental?.packageDurationUnits
    );

    if (Number.isFinite(packageDuration) && packageDuration > 0) {
      return packageDuration;
    }
  }

  return null;
};

const getRentalFinancialSnapshot = (rental) => {
  const quantity = getPackageRentalDurationUnits(rental) || 1;
  const baseTotal = rental?.use_package_pricing
    ? ((Number(rental?.unit_price) || Number(rental?.package_rate_per_unit) || 0) * quantity)
    : (Number(rental?.unit_price) || 0) * quantity;
  const storedTotal = parseFloat(rental?.total_amount) || 0;
  const pendingRequestedTotal = Math.max(0, parseFloat(rental?.pending_total_request || 0) || 0);
  // Rental Details is the source of truth for saved contract totals.
  // The rentals list should reflect the stored row values directly and
  // must not re-run side calculations like fuel stripping or base-price fallbacks
  // unless the contract total has never been saved.
  const computedTotal = storedTotal > 0 ? storedTotal : baseTotal;
  const companyDiscount = getRentalCompanyDiscountAmount(rental);
  const grossTotal = pendingRequestedTotal > 0 ? pendingRequestedTotal : computedTotal;
  const grandTotal = Math.max(0, grossTotal - companyDiscount);
  const rawAmountPaid = Math.max(0, parseFloat(rental?.deposit_amount) || 0);
  const storedRemainingAmount = Math.max(0, Number(rental?.remaining_amount || 0) || 0);
  const cappedPaidAmount = grandTotal > 0 ? Math.min(rawAmountPaid, grandTotal) : rawAmountPaid;
  const balanceDue = storedRemainingAmount;
  const normalizedPaymentStatus = normalizePaymentStatus(
    rental?.payment_status,
    balanceDue
  );
  // Rental Details displays the saved paid amount from the contract row.
  // Keep the list consistent with that source of truth instead of inflating
  // paid-in-full rows to the grand total when remaining_amount is zero.
  const amountPaid = cappedPaidAmount;

  let status = 'UNPAID';
  let className = 'rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 border border-rose-100';

  if (normalizedPaymentStatus === 'paid') {
    status = 'PAID';
    className = 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100';
  } else if (normalizedPaymentStatus === 'partial') {
    status = 'PARTIAL';
    className = 'rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 border border-amber-100';
  } else if (normalizedPaymentStatus === 'overdue') {
    status = 'OVERDUE';
    className = 'rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 border border-orange-100';
  } else if (normalizedPaymentStatus === 'refunded') {
    status = 'REFUNDED';
    className = 'rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 border border-sky-100';
  }

  return {
    grossTotal,
    grandTotal,
    balanceDue,
    amountPaid,
    status,
    className,
  };
};

const getRentalCollectedAmount = (rental) => {
  return getRentalCollectedAmountShared(rental);
};

const getApprovedExtensionHours = (rental) =>
  (rental?.extensions || [])
    .filter((ext) => ext.status === 'approved')
    .reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);

const shouldUseCompletedActualEndDate = (rental) =>
  String(rental?.rental_status || '').toLowerCase() === 'completed' ||
  Boolean(rental?.completed_at);

const getEffectiveRentalWindow = (rental) => {
  const startDate = new Date(rental?.started_at || rental?.rental_start_date);
  const scheduledEndDate = rental?.rental_end_date ? new Date(rental.rental_end_date) : null;
  const actualEndDate = shouldUseCompletedActualEndDate(rental) && rental?.actual_end_date
    ? new Date(rental.actual_end_date)
    : null;

  let endDate =
    actualEndDate && scheduledEndDate && actualEndDate > scheduledEndDate
      ? actualEndDate
      : (actualEndDate || scheduledEndDate);

  if ((!endDate || Number.isNaN(endDate.getTime())) && rental?.rental_end_date) {
    endDate = new Date(rental.rental_end_date);
  }

  if (
    endDate &&
    !Number.isNaN(endDate.getTime()) &&
    !rental?.actual_end_date &&
    rental?.extensions?.length
  ) {
    endDate = new Date(endDate.getTime() + (getApprovedExtensionHours(rental) * 60 * 60 * 1000));
  }

  return { startDate, endDate };
};

const getRentalOperationalWindow = (rental) => {
  const { startDate, endDate } = getEffectiveRentalWindow(rental);
  const completedAt = toSafeDate(rental?.completed_at || rental?.actual_end_date);
  const updatedAt = toSafeDate(rental?.updated_at);
  const createdAt = toSafeDate(rental?.created_at);

  const start = startDate && !Number.isNaN(startDate.getTime()) ? startDate : createdAt;
  const end = completedAt || endDate || updatedAt || start;

  return { start, end };
};

const doesRentalIntersectWindow = (rental, windowStart, windowEnd) => {
  const { start, end } = getRentalOperationalWindow(rental);

  if (!start && !end) return false;

  const effectiveStart = start || end;
  const effectiveEnd = end || start;

  if (!effectiveStart || !effectiveEnd) return false;

  return effectiveStart < windowEnd && effectiveEnd >= windowStart;
};

const getRentalWorkspaceBucket = (rental, now = new Date()) => {
  const { start, end } = getRentalOperationalWindow(rental);
  const { start: dayStart, end: dayEnd } = getCalendarDayWindow(now);

  if (doesRentalIntersectWindow(rental, dayStart, dayEnd)) {
    return 'today';
  }

  const effectiveStart = start || end;
  const effectiveEnd = end || start;

  if (effectiveStart && effectiveStart >= dayEnd) {
    return 'upcoming';
  }

  if (effectiveEnd && effectiveEnd < dayStart) {
    return 'past';
  }

  return 'today';
};

// ✅ FIXED: Calculate time remaining to match RentalDetails.jsx exactly
const calculateSmartTimeRemaining = (rental, nowTimestamp = Date.now()) => {
  if (rental.rental_status !== 'active') {
    return { text: null, color: null, bgColor: null, isBadge: false };
  }
  
  const now = new Date(nowTimestamp);

  // Use the real stored effective end datetime just like Rental Details.
  const rentalEndDate = rental?.rental_end_date ? new Date(rental.rental_end_date) : null;
  const actualEndDate = shouldUseCompletedActualEndDate(rental) && rental?.actual_end_date
    ? new Date(rental.actual_end_date)
    : null;
  const endDate =
    actualEndDate && rentalEndDate
      ? (actualEndDate > rentalEndDate ? actualEndDate : rentalEndDate)
      : (actualEndDate || rentalEndDate);
  const isHourly = rental.rental_type === 'hourly';

  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    return { text: null, color: null, bgColor: null, isBadge: false };
  }

  // Fallback for older hourly rentals that still rely on a separate end-time field.
  if (isHourly && rental.rental_end_time && !String(rental.rental_end_date || '').includes('T')) {
    const [hours, minutes] = rental.rental_end_time.split(':');
    endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }

  // Older rentals may not have actual_end_date updated yet, so keep this extension fallback only then.
  if (!rental?.actual_end_date && rental.extensions && rental.extensions.length > 0) {
    const approvedExtensions = rental.extensions.filter(ext => ext.status === "approved");
    const totalExtensionHours = approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);
    endDate.setHours(endDate.getHours() + totalExtensionHours);
  }
  
  const diffMs = endDate - now;
  
  // EXPIRED/OVERDUE STATES
  if (diffMs <= 0) {
    return {
      text: isHourly ? '00:00:00' : 'Overdue',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      icon: '⚠️',
      isDigital: isHourly
    };
  }
  
  // HOURLY RENTAL STATES (fallback for when started_at is missing)
  if (isHourly) {
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    return {
      text: timeStr,
      color: hours === 0 && minutes <= 30 ? 'text-red-600' : hours <= 2 ? 'text-orange-600' : 'text-green-600',
      bgColor: hours === 0 && minutes <= 30 ? 'bg-red-50' : hours <= 2 ? 'bg-orange-50' : 'bg-green-50',
      icon: hours === 0 && minutes <= 30 ? '🔴' : '⏰',
      isDigital: true
    };
  }
  
  // DAILY RENTAL STATES
  const totalSeconds = Math.floor(diffMs / 1000);
  const diffDays = Math.floor(totalSeconds / (24 * 60 * 60));
  const remainingAfterDays = totalSeconds % (24 * 60 * 60);
  const diffHours = Math.floor(remainingAfterDays / 3600);
  const diffMinutes = Math.floor((remainingAfterDays % 3600) / 60);
  const diffSeconds = remainingAfterDays % 60;
  
  if (diffDays > 0) {
    const text = diffDays === 1 ? tr('1 day', '1 jour') : tr(`${diffDays} days`, `${diffDays} jours`);
    const fullText = diffHours > 0 ? `${text} ${diffHours}h` : text;
    return { 
      text: fullText, 
      color: diffDays <= 1 ? 'text-orange-600' : 'text-green-600',
      bgColor: diffDays <= 1 ? 'bg-orange-50' : 'bg-green-50',
      icon: diffDays <= 1 ? '⏰' : '✅',
      isDigital: false
    };
  }

  if (diffHours > 0) {
    return { 
      text: tr(`${diffHours}h ${diffMinutes}m left`, `${diffHours}h ${diffMinutes}m restantes`), 
      color: diffHours <= 3 ? 'text-red-600' : 'text-orange-600',
      bgColor: diffHours <= 3 ? 'bg-red-50' : 'bg-orange-50',
      icon: diffHours <= 3 ? '🔴' : '⏰',
      isDigital: false
    };
  }

  return {
    text: tr(`${diffMinutes}m ${diffSeconds}s left`, `${diffMinutes}m ${diffSeconds}s restantes`),
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: '🔴',
    isDigital: true,
  };
};

const RentalTimeIndicator = memo(({ rental, compact = false, attention = null }) => {
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());

  useEffect(() => {
    if (rental?.rental_status !== 'active') {
      return undefined;
    }

    const tickMs = rental?.rental_type === 'hourly' ? 1000 : 30000;
    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [rental?.rental_status, rental?.rental_type, rental?.id]);

  if (attention) {
    return (
      <div className={`mt-1 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${attention.className}`}>
        {attention.text}
      </div>
    );
  }

  const timeRemaining = calculateSmartTimeRemaining(rental, nowTimestamp);
  if (!timeRemaining?.text) return null;

  if (compact) {
    return (
      <div className={`mt-1 inline-flex items-center gap-2 rounded-lg border border-white/70 px-3 py-2 ${timeRemaining.bgColor}`}>
        <Clock className={`h-3.5 w-3.5 ${timeRemaining.color}`} />
        <span className={`text-sm font-extrabold ${timeRemaining.color} tracking-tight`}>
          {timeRemaining.text}
        </span>
      </div>
    );
  }

  return (
    <div className={`mt-1 inline-block px-2.5 py-1.5 rounded text-sm font-semibold ${timeRemaining.bgColor} ${timeRemaining.color}`}>
      {timeRemaining.text}
    </div>
  );
});

// Smart date formatter that adapts to view mode
const formatSmartDate = (rental, isMobile = false) => {
  if (!rental.rental_start_date || !rental.rental_end_date) return 'N/A';
  
  const startDate = new Date(rental.rental_start_date);
  const endDate = new Date(rental.rental_end_date);
  const locale = isFrenchLocale() ? 'fr-FR' : 'en-US';
  const startLabel = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const endLabel = endDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const startTime = startDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const endTime = endDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const sameDay = startDate.toDateString() === endDate.toDateString();

  if (sameDay) {
    return isMobile
      ? `${startLabel}, ${startTime} - ${endTime}`
      : `${startLabel}, ${startTime} - ${endTime}`;
  }

  return isMobile
    ? `${startLabel}, ${startTime} - ${endLabel}, ${endTime}`
    : `${startLabel}, ${startTime} - ${endLabel}, ${endTime}`;
};

// Calculate duration badge
const getDurationBadge = (rental) => {
  if (!rental.rental_start_date || !rental.rental_end_date) return null;
  
  const startDate = new Date(rental.rental_start_date);
  const endDate = new Date(rental.rental_end_date);
  
  if (rental.rental_type === 'hourly' && rental.rental_start_time && rental.rental_end_time) {
    const [startHours, startMinutes] = rental.rental_start_time.split(':').map(Number);
    const [endHours, endMinutes] = rental.rental_end_time.split(':').map(Number);
    startDate.setHours(startHours, startMinutes);
    endDate.setHours(endHours, endMinutes);
    
    const packageAwareHours = getPackageRentalDurationUnits(rental);
    const diffHours = Number.isFinite(packageAwareHours) && packageAwareHours > 0
      ? packageAwareHours
      : Math.max(0.5, Math.round(((endDate - startDate) / (1000 * 60 * 60)) * 2) / 2);
    const durationLabel = diffHours === 0.5 ? '30m' : `${diffHours}h`;
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-purple-50 text-purple-700 border border-purple-200">
        {durationLabel}
      </span>
    );
  }
  
  const storedDurationDays = getPackageRentalDurationUnits(rental);
  const diffDays = Number.isFinite(storedDurationDays) && storedDurationDays > 0
    ? storedDurationDays
    : Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
      {diffDays}d
    </span>
  );
};

const Rentals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasFeature } = useAuth();
  const hostContext = useMemo(() => getHostContext(), []);
  const organizationId = useMemo(() => getScopedOrganizationId(user), [user]);
  const isTenantWorkspace = hostContext.kind === 'tenant';
  const shouldScopeSharedTenantData = isTenantWorkspace && !isFirstPartyTenantHost(hostContext);
  const isFrench = isFrenchLocale();
  const canUseWhatsAppTools = hasFeature('whatsapp_tools');
  const warmRentalsSnapshot = useMemo(() => appWarmupService.getWarmRentalsSnapshot(), []);
  const hasWarmRentalsHint = useMemo(
    () => Boolean(warmRentalsSnapshot) || appWarmupService.isWarmupLikelyActive(),
    [warmRentalsSnapshot]
  );
  
  // Helper function to normalize phone numbers for better searching
  const normalizePhone = (phone) => {
    if (!phone) return '';
    return phone.replace(/[\s\-\(\)\.\+]/g, '');
  };

  // Helper function to format phone for display
  const formatPhoneForDisplay = (phone) => {
    if (!phone) return 'N/A';
    if (phone.includes('-') || phone.includes(' ') || phone.includes('(')) {
      return phone;
    }
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const [rentalTimingSettings, setRentalTimingSettings] = useState(DEFAULT_RENTAL_TIMING_SETTINGS);

  const getEffectiveRentalStatus = useCallback(
    (rental) => deriveEffectiveRentalStatus(rental, rentalTimingSettings),
    [rentalTimingSettings]
  );

  const handleContactCustomerWhatsApp = (rental, event) => {
    event?.stopPropagation?.();

    const cleanPhone = String(rental?.customer_phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      alert(tr('Customer phone number is missing for this rental.', 'Le numéro de téléphone du client est manquant pour cette location.'));
      return;
    }
    setWhatsAppCustomMessage('');
    setWhatsAppSheetRental(rental);
    if (!canUseWhatsAppTools) {
      toast.info(
        tr(
          'WhatsApp tools are available on Growth and Pro. Upgrade this workspace to send rental messages.',
          'Les outils WhatsApp sont disponibles sur Growth et Pro. Mettez à niveau ce workspace pour envoyer des messages de location.'
        )
      );
    }
  };

  const [rentals, setRentals] = useState(() => warmRentalsSnapshot?.rentals || []);
  const [rentalUniverse, setRentalUniverse] = useState(() => warmRentalsSnapshot?.rentalUniverse || []);
  const [rentalReportMap, setRentalReportMap] = useState(() => warmRentalsSnapshot?.rentalReportMap || {});

    const [searchTerm, setSearchTerm] = useState('');

  const [vehicles, setVehicles] = useState(() => warmRentalsSnapshot?.vehicles || []);
  const [loading, setLoading] = useState(() => !hasWarmRentalsHint);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => hasWarmRentalsHint);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showStepperForm, setShowStepperForm] = useState(false);
  const [wizardUiVariant, setWizardUiVariant] = useState('default');
  const [wizardReturnTo, setWizardReturnTo] = useState(null);
  const [editingRental, setEditingRental] = useState(null);
  const [wizardInitialStep, setWizardInitialStep] = useState(1);
  const [wizardCustomerScanNote, setWizardCustomerScanNote] = useState('');
  const [wizardRequiresCustomerVerification, setWizardRequiresCustomerVerification] = useState(false);
  const [wizardCustomerVerificationCaptureOnly, setWizardCustomerVerificationCaptureOnly] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const initialWorkspaceTab = warmRentalsSnapshot?.workspaceTab || getStoredRentalsWorkspace() || 'today';
  const [workspaceTab, setWorkspaceTab] = useState(initialWorkspaceTab);
  const [availabilityQuickFilter, setAvailabilityQuickFilter] = useState('all');
  const [dateFocusFilter, setDateFocusFilter] = useState(() => getDefaultDateFocusForWorkspace(initialWorkspaceTab));
  const [dateFocusCounts, setDateFocusCounts] = useState(() => warmRentalsSnapshot?.dateFocusCounts || { day: 0, week: 0 });
  const [showDateFocusPanel, setShowDateFocusPanel] = useState(false);
  const [bouncingWeekDayKey, setBouncingWeekDayKey] = useState(null);
  const [bouncingDateFocusLauncher, setBouncingDateFocusLauncher] = useState(false);
  const [customDateRange, setCustomDateRange] = useState(null);
  const [dateFocusAnchor, setDateFocusAnchor] = useState(() => toDateInputValue(new Date()));
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(() => warmRentalsSnapshot?.currentPage || 1);
  const [itemsPerPage, setItemsPerPage] = useState(() => warmRentalsSnapshot?.itemsPerPage || 10);
  const [totalCount, setTotalCount] = useState(() => warmRentalsSnapshot?.totalCount || 0);
  const [totalPages, setTotalPages] = useState(() => warmRentalsSnapshot?.totalPages || 0);
  const [vehicleFuelStateMap, setVehicleFuelStateMap] = useState(() => warmRentalsSnapshot?.vehicleFuelStateMap || {});
  const [rentalOverviewSnapshot, setRentalOverviewSnapshot] = useState(() => warmRentalsSnapshot?.rentalOverviewSnapshot || {
    activeVehicleIds: [],
    scheduledVehicleIds: [],
  });
  const [whatsAppSheetRental, setWhatsAppSheetRental] = useState(null);
  const [whatsAppCustomMessage, setWhatsAppCustomMessage] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'list', 'table', or 'grid'
  const [showFilters, setShowFilters] = useState(false); // Mobile filter collapse
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const rentalRefreshTimeoutRef = useRef(null);
  const isFetchingRentalsRef = useRef(false);
  const activeRentalsFetchRef = useRef(null);
  const userSelectedWorkspaceRef = useRef(false);
  const quickDayBounceTimeoutRef = useRef(null);
  const dateFocusLauncherBounceTimeoutRef = useRef(null);
  const lastQuickDateTapRef = useRef({ key: null, timestamp: 0 });

  const dateFocusAnchorDate = useMemo(() => fromDateInputValue(dateFocusAnchor), [dateFocusAnchor]);
  const weekStart = useMemo(() => startOfWeek(dateFocusAnchorDate), [dateFocusAnchorDate]);
  const weekEnd = useMemo(() => endOfWeek(dateFocusAnchorDate), [dateFocusAnchorDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + index);
        return day;
      }),
    [weekStart]
  );

  const matchesWorkspaceTab = useCallback((rental, targetTab = workspaceTab) => {
    if (!targetTab || targetTab === 'all') return true;
    return getRentalWorkspaceBucket(rental) === targetTab;
  }, [workspaceTab]);

  const closeWhatsAppSheet = useCallback(() => {
    setWhatsAppSheetRental(null);
    setWhatsAppCustomMessage('');
  }, []);

  const handleSendWhatsAppTemplate = useCallback((rental, message) => {
    if (!canUseWhatsAppTools) {
      toast.info(
        tr(
          'Upgrade to Growth or Pro to send WhatsApp messages from Rentals.',
          'Passez à Growth ou Pro pour envoyer des messages WhatsApp depuis les locations.'
        )
      );
      return;
    }

    const cleanPhone = String(rental?.customer_phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      alert(tr('Customer phone number is missing for this rental.', 'Le numéro de téléphone du client est manquant pour cette location.'));
      return;
    }

    openWhatsAppContact(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`);
    closeWhatsAppSheet();
  }, [canUseWhatsAppTools, closeWhatsAppSheet]);

  useEffect(() => {
    let cancelled = false;

    const loadRentalTimingSettings = async () => {
      try {
        const data = await fetchSystemSettings();
        if (cancelled || !data) return;

        setRentalTimingSettings({
          graceMinutes: Number(
            data.rentalGracePeriodMinutes ??
            data.rental_grace_period_minutes ??
            DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes
          ),
          softLockMinutes: Number(
            data.rentalSoftLockMinutes ??
            data.rental_soft_lock_minutes ??
            DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes
          ),
        });
      } catch {
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    return () => {
      if (quickDayBounceTimeoutRef.current) {
        window.clearTimeout(quickDayBounceTimeoutRef.current);
      }
      if (dateFocusLauncherBounceTimeoutRef.current) {
        window.clearTimeout(dateFocusLauncherBounceTimeoutRef.current);
      }
    };
  }, []);

  const triggerQuickDayBounce = useCallback((key) => {
    setBouncingWeekDayKey(key);
    if (quickDayBounceTimeoutRef.current) {
      window.clearTimeout(quickDayBounceTimeoutRef.current);
    }
    quickDayBounceTimeoutRef.current = window.setTimeout(() => {
      setBouncingWeekDayKey((current) => (current === key ? null : current));
    }, 340);
  }, []);

  const triggerDateFocusLauncherBounce = useCallback(() => {
    setBouncingDateFocusLauncher(true);
    if (dateFocusLauncherBounceTimeoutRef.current) {
      window.clearTimeout(dateFocusLauncherBounceTimeoutRef.current);
    }
    dateFocusLauncherBounceTimeoutRef.current = window.setTimeout(() => {
      setBouncingDateFocusLauncher(false);
    }, 340);
  }, []);

  const vehicleAvailabilitySummary = useMemo(() => {
    const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    const activeVehicleIds = new Set((rentalOverviewSnapshot.activeVehicleIds || []).map(String));
    const scheduledVehicleIds = new Set((rentalOverviewSnapshot.scheduledVehicleIds || []).map(String));

    const summary = {
      total: 0,
      available: 0,
      rented: 0,
      scheduled: 0,
      maintenance: 0,
      out_of_service: 0,
    };

    summary.total = safeVehicles.length;
    summary.rented = activeVehicleIds.size;
    summary.scheduled = scheduledVehicleIds.size;

    const blockedVehicleIds = new Set([
      ...activeVehicleIds,
      ...scheduledVehicleIds,
    ]);

    safeVehicles.forEach((vehicle) => {
      const vehicleId = String(vehicle?.id || '');
      const status = String(vehicle?.status || '').toLowerCase();

      if (status === 'maintenance') {
        summary.maintenance += 1;
        if (vehicleId) blockedVehicleIds.add(vehicleId);
      } else if (status === 'out_of_service') {
        summary.out_of_service += 1;
        if (vehicleId) blockedVehicleIds.add(vehicleId);
      }
    });    

    summary.available = Math.max(summary.total - blockedVehicleIds.size, 0);

    return summary;
  }, [vehicles, rentalOverviewSnapshot]);

  const applyQuickRange = useCallback((mode, payloadDate = new Date()) => {
    const todayBase = new Date();
    todayBase.setHours(12, 0, 0, 0);
    const base = new Date(payloadDate);
    base.setHours(12, 0, 0, 0);

    let nextAnchor = new Date(base);
    if (mode === 'today') {
      nextAnchor = new Date(todayBase);
      setDateFocusFilter('day');
    } else if (mode === 'yesterday') {
      nextAnchor = new Date(todayBase);
      nextAnchor.setDate(nextAnchor.getDate() - 1);
      setDateFocusFilter('day');
    } else if (mode === 'week') {
      setDateFocusFilter('week');
    } else if (mode === 'last7') {
      setDateFocusFilter('last7');
    } else if (mode === 'month') {
      setDateFocusFilter('month');
    } else if (mode === 'day') {
      setDateFocusFilter('day');
    }

    setCustomDateRange(null);
    setDateFocusAnchor(toDateInputValue(nextAnchor));
  }, []);

  const shiftWeek = useCallback((direction) => {
    const nextAnchor = new Date(dateFocusAnchorDate);
    nextAnchor.setDate(nextAnchor.getDate() + direction * 7);
    nextAnchor.setHours(12, 0, 0, 0);

    // Keep any in-progress custom range anchor while moving the visible week.
    // Only the week focus mode should update the active date filter here.
    if (dateFocusFilter === 'week') {
      setDateFocusFilter('week');
    }

    setDateFocusAnchor(toDateInputValue(nextAnchor));
  }, [dateFocusAnchorDate, dateFocusFilter]);

  const clearCustomDateRange = useCallback(() => {
    lastQuickDateTapRef.current = { key: null, timestamp: 0 };
    setCustomDateRange(null);
    applyQuickRange('day', new Date());
  }, [applyQuickRange]);

  const handleQuickDayPress = useCallback((day) => {
    const targetDate = day instanceof Date ? new Date(day) : new Date(day);
    if (Number.isNaN(targetDate.getTime())) return;

    const nextKey = toDateInputValue(targetDate);
    triggerQuickDayBounce(nextKey);
    const now = Date.now();
    const lastTap = lastQuickDateTapRef.current;
    const isDoubleTap = lastTap.key === nextKey && now - lastTap.timestamp <= 350;

    if (customDateRange?.start) {
      if (!customDateRange.end) {
        const normalizedRange = normalizeDateRange(customDateRange.start, targetDate);
        setCustomDateRange(normalizedRange);
        setDateFocusFilter('custom');
        setDateFocusAnchor(toDateInputValue(normalizedRange.end));
        lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
        return;
      }

      setCustomDateRange(null);
      applyQuickRange('day', targetDate);
      lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
      return;
    }

    if (isDoubleTap) {
      const normalizedStart = new Date(targetDate);
      normalizedStart.setHours(12, 0, 0, 0);
      setCustomDateRange({ start: normalizedStart, end: null });
      lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
      return;
    }

    applyQuickRange('day', targetDate);
    lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
  }, [applyQuickRange, customDateRange, triggerQuickDayBounce]);
  
  const [videoContractModal, setVideoContractModal] = useState({
    isOpen: false,
    rental: null,
    type: null // 'start' or 'close'
  });

  const [customerDetailsDrawer, setCustomerDetailsDrawer] = useState({
    isOpen: false,
    customerId: null,
    rental: null,
    secondDrivers: [],
    viewMode: 'customer'
  });

  const buildRentalsReturnSnapshot = useCallback(() => ({
    workspaceTab,
    currentPage,
    itemsPerPage,
    statusFilter,
    paymentStatusFilter,
    searchTerm,
    availabilityQuickFilter,
    dateFocusFilter,
    dateFocusAnchor,
    customDateRange: customDateRange
      ? {
          start: customDateRange.start ? new Date(customDateRange.start).toISOString() : null,
          end: customDateRange.end ? new Date(customDateRange.end).toISOString() : null,
        }
      : null,
    viewMode,
  }), [
    availabilityQuickFilter,
    currentPage,
    customDateRange,
    dateFocusAnchor,
    dateFocusFilter,
    itemsPerPage,
    paymentStatusFilter,
    searchTerm,
    statusFilter,
    viewMode,
    workspaceTab,
  ]);

  const applyRentalSummarySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setRentals((snapshot.rentals || []).map(normalizeRentalLifecycle));
    setRentalReportMap(snapshot.rentalReportMap || {});
    setTotalCount(snapshot.totalCount || 0);
    setTotalPages(snapshot.totalPages || 0);
    setCurrentPage(snapshot.currentPage || 1);
    setItemsPerPage(snapshot.itemsPerPage || 10);
    setDateFocusCounts(snapshot.dateFocusCounts || { day: 0, week: 0 });
    setVehicles(snapshot.vehicles || []);
    setVehicleFuelStateMap(snapshot.vehicleFuelStateMap || {});
    setRentalOverviewSnapshot(snapshot.rentalOverviewSnapshot || {
      activeVehicleIds: [],
      scheduledVehicleIds: [],
    });
  }, []);

  const hydrateRentalExtensions = useCallback(async (rentalIds = []) => {
    const normalizedIds = [...new Set((rentalIds || []).filter(Boolean))];
    if (normalizedIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('rental_extensions')
        .select('id,rental_id,extension_hours,extension_price,status,created_at')
        .in('rental_id', normalizedIds);

      if (error) {
        throw error;
      }

      const extensionMap = buildRentalExtensionsMap(data);
      const applyExtensions = (existingRentals) =>
        (existingRentals || []).map((rental) =>
          normalizedIds.includes(rental?.id)
            ? { ...rental, extensions: extensionMap[rental.id] || [] }
            : rental
        );

      setRentals((prev) => applyExtensions(prev));
      setRentalUniverse((prev) => applyExtensions(prev));
    } catch (extensionError) {
      console.error('❌ Error hydrating rental extensions:', extensionError);
    }
  }, []);

  const fetchRentals = async (currentStatusFilter, currentPaymentStatusFilter, page = currentPage, limit = itemsPerPage) => {
    if (isFetchingRentalsRef.current) {
      return activeRentalsFetchRef.current;
    }

    activeRentalsFetchRef.current = (async () => {
      try {
        isFetchingRentalsRef.current = true;
        if (shouldScopeSharedTenantData && !organizationId) {
          throw new Error('Workspace organization context is missing. Rentals are blocked to protect tenant isolation.');
        }
        const normalizedStatusFilter = String(currentStatusFilter || '').toLowerCase();

        // Calculate range for pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Now fetch paginated data
        const runRentalsQuery = async ({ includeAuditColumns = true, includeVehicleSnapshots = true } = {}) => {
          let query = supabase
            .from('app_4c3a7a6153_rentals')
            .select(buildRentalsSelect({ includeAuditColumns, includeVehicleSnapshots }));

          if (shouldScopeSharedTenantData) {
            query = applyOrganizationScope(query, organizationId);
          }
          query = query.order('created_at', { ascending: false });
          return query;
        };

        let includeAuditColumns = true;
        let includeVehicleSnapshots = true;
        let { data, error } = await runRentalsQuery({
          includeAuditColumns,
          includeVehicleSnapshots,
        });

        if (error && isMissingRentalsAuditColumnError(error)) {
          console.warn('Rentals table is missing amount_due_override_previous_amount; retrying without audit column.');
          includeAuditColumns = false;
          ({ data, error } = await runRentalsQuery({
            includeAuditColumns,
            includeVehicleSnapshots,
          }));
        }

        if (error && isMissingRentalsVehicleSnapshotColumnError(error)) {
          console.warn('Rentals table is missing vehicle snapshot columns; retrying without snapshot columns.');
          includeVehicleSnapshots = false;
          ({ data, error } = await runRentalsQuery({
            includeAuditColumns,
            includeVehicleSnapshots,
          }));
        }

        if (error) {
          console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
          throw error;
        }

        let normalizedRentals = sortRentalsForDisplay(
          (data || []).map(normalizeRentalLifecycle),
          getEffectiveRentalStatus
        );
        setRentalUniverse(normalizedRentals);

        let nextRentals = normalizedRentals;
        const workspaceFilteredRentals = nextRentals.filter((rental) => matchesWorkspaceTab(rental));
        const statusFilteredRentals =
          normalizedStatusFilter && normalizedStatusFilter !== 'all'
            ? workspaceFilteredRentals.filter((rental) => getEffectiveRentalStatus(rental) === normalizedStatusFilter)
            : workspaceFilteredRentals;
        const sortedStatusFilteredRentals = sortRentalsForDisplay(
          statusFilteredRentals,
          getEffectiveRentalStatus
        );
        const nextTotalCount = sortedStatusFilteredRentals.length;
        nextRentals = sortedStatusFilteredRentals.slice(from, to + 1);

        setTotalCount(nextTotalCount);
        setTotalPages(Math.ceil(nextTotalCount / limit));
        setRentals(nextRentals);
        const rentalIds = nextRentals.map((rental) => rental.id).filter(Boolean);
        scheduleBackgroundTask(() => {
          void hydrateRentalExtensions(rentalIds);
        });
        void VehicleReportService.getLatestReportsForRentals(rentalIds)
          .then((latestReports) => {
            setRentalReportMap(latestReports);
          })
          .catch((reportError) => {
            console.error('❌ Error fetching rental reports:', reportError);
          });

      } catch (err) {
        if (isAbortLikeError(err)) {
          console.warn('Ignoring aborted rental fetch:', err);
          return;
        }
        console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
        setError(err.message);
      } finally {
        isFetchingRentalsRef.current = false;
        activeRentalsFetchRef.current = null;
      }
    })();

    return activeRentalsFetchRef.current;
  };



  // Add this function to check if rental can be started from list view
  const canStartFromList = (rental) => {
    // Check payment
    const isPaid = getRentalFinancialSnapshot(rental).status === 'PAID';
    // Check if contract is signed (has signature URL)
    const isContractSigned = !!rental.signature_url || rental.contract_signed;
    // Check opening video exists
    const hasOpeningVideo = !!rental.opening_video_url;
    // Check odometer
    const hasOdometer = !!rental.start_odometer;
    // For daily rentals, also check fuel level
    const isDaily = rental.rental_type === 'daily';
    const hasFuelLevel = !isDaily || rental.start_fuel_level !== null;
    
    return isPaid && isContractSigned && hasOpeningVideo && hasOdometer && hasFuelLevel;
  };


  const handleStartRentalFromList = async (rental) => {
    if (!confirm(`Start rental ${rental.rental_id}? This will activate the rental timer.`)) {
      return;
    }

    try {
      const actorName =
        user?.user_metadata?.full_name ||
        user?.email ||
        null;

      // Calculate actual times
      const now = new Date();
      const actualStartTime = now.toISOString();
      const scheduledStart = new Date(rental.rental_start_date);
      const scheduledEnd = new Date(rental.rental_end_date);
      const originalDuration = scheduledEnd - scheduledStart;
      const actualEndTime = new Date(now.getTime() + originalDuration).toISOString();

      // Update rental status to active
      let startRentalQuery = supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: 'active', 
          status: 'active',
          rental_start_date: actualStartTime,
          rental_end_date: actualEndTime,
          started_at: actualStartTime,
          actual_end_date: actualEndTime,
          started_by: user?.id || null,
          started_by_name: actorName,
        })
        .eq('id', rental.id);

      if (shouldScopeSharedTenantData) {
        startRentalQuery = applyOrganizationScope(startRentalQuery, organizationId);
      }

      const { data: updatedRental, error: updateError } = await startRentalQuery
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          )
        `)
        .single();

      if (updateError) throw updateError;

      try {
        const { count, error: historyCountError } = await supabase
          .from('rental_vehicle_history')
          .select('id', { count: 'exact', head: true })
          .eq('rental_id', rental.id);

        if (historyCountError) throw historyCountError;

        if (!count) {
          const { error: insertHistoryError } = await supabase
            .from('rental_vehicle_history')
            .insert({
              rental_id: rental.id,
              ...buildVehicleHistorySnapshot(updatedRental?.vehicle || rental?.vehicle),
              started_at: actualStartTime,
              ended_at: null,
              replacement_reason: tr('Started rental', 'Démarrage de location'),
              change_note: null,
              changed_by: actorName || 'Staff',
              sequence_index: 1,
            });

          if (insertHistoryError) throw insertHistoryError;
        }
      } catch (vehicleHistoryError) {
        console.error('❌ Failed to create initial vehicle history from rentals list:', vehicleHistoryError);
      }

      // Update vehicle status
      if (rental.vehicle_id) {
        let vehicleStatusQuery = supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ status: 'rented' })
          .eq('id', rental.vehicle_id);
        if (shouldScopeSharedTenantData) {
          vehicleStatusQuery = applyOrganizationScope(vehicleStatusQuery, organizationId);
        }
        await vehicleStatusQuery;
      }

      try {
        await insertSharedRentalActivityLog({
          user_id: user?.id || null,
          created_by: actorName,
          action: 'rental_started',
          description: `Started rental ${rental.rental_id || rental.id}`,
          entity_type: 'rental',
          entity_id: rental.id,
          details: {
            rental_id: rental.id,
            rental_reference: rental.rental_id || null,
            customer_name: rental.customer_name || null,
            vehicle_id: rental.vehicle_id || null,
            started_at: actualStartTime,
          },
        });
      } catch (activityError) {
        console.warn('⚠️ Failed to write rental start activity log:', activityError);
      }

      void dispatchRentalLifecycleTelegramEvent({
        eventType: 'rental_started',
        actor: 'admin',
        rental: {
          id: rental.id,
          reference: rental.rental_id || '',
          vehicle: buildRentalTelegramVehicleLabel(updatedRental || rental),
          customer: rental.customer_name,
          start: actualStartTime,
          end: actualEndTime,
          total: updatedRental?.total_amount ?? rental?.total_amount ?? 0,
          amountPaid: updatedRental?.deposit_amount ?? rental?.deposit_amount ?? 0,
          remaining: updatedRental?.remaining_amount ?? rental?.remaining_amount ?? 0,
        },
      }).catch((telegramDispatchError) => {
        console.warn('⚠️ Rental started Telegram dispatch failed from rentals list (non-blocking):', telegramDispatchError);
      });

      // Show success message
      alert(`✅ Rental ${rental.rental_id} started successfully! Timer is now active.`);
      
      // Refresh the list
      appWarmupService.invalidateModule('rentals');
      fetchRentals(statusFilter, paymentStatusFilter);
      void fetchRentalOverviewSnapshot();
      appWarmupService.invalidateModule('finance');
      
    } catch (err) {
      console.error('❌ Error starting rental from list:', err);
      alert(`Failed to start rental: ${err.message}`);
    }
  };

  const handleCancelAsNoShow = async (rental) => {
    if (!confirm(tr('Cancel this rental as a no-show and free the vehicle?', 'Annuler cette location comme absence et libérer le véhicule ?'))) {
      return;
    }

    try {
      const cancelledAt = new Date().toISOString();

      const { error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_status: 'cancelled',
          status: 'cancelled',
          cancelled_at: cancelledAt,
          cancelled_by: user?.id || null,
          cancellation_reason: 'no_show',
          updated_at: cancelledAt,
        })
        .eq('id', rental.id);

      if (rentalError) throw rentalError;

      if (rental.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ status: 'available', updated_at: cancelledAt })
          .eq('id', rental.vehicle_id);

        if (vehicleError) throw vehicleError;
      }

      try {
        const actorName =
          user?.user_metadata?.full_name ||
          user?.email ||
          null;
        await insertSharedRentalActivityLog({
          user_id: user?.id || null,
          created_by: actorName,
          action: 'rental_cancelled_no_show',
          description: `Cancelled rental ${rental.rental_id || rental.id} as no-show`,
          entity_type: 'rental',
          entity_id: rental.id,
          reason: 'no_show',
          details: {
            rental_id: rental.id,
            rental_reference: rental.rental_id || null,
            customer_name: rental.customer_name || null,
            vehicle_id: rental.vehicle_id || null,
            cancelled_at: cancelledAt,
            cancellation_reason: 'no_show',
          },
        });
      } catch (activityError) {
        console.warn('⚠️ Failed to write no-show activity log:', activityError);
      }

      alert(`⚠️ ${tr('Rental cancelled as no-show. Vehicle is available again.', 'Location annulée comme absence. Le véhicule est de nouveau disponible.')}`);
      appWarmupService.invalidateModule('rentals');
      fetchRentals(statusFilter, paymentStatusFilter);
      void fetchRentalOverviewSnapshot();
      appWarmupService.invalidateModule('finance');
    } catch (err) {
      console.error('❌ Error cancelling rental as no-show:', err);
      alert(`${tr('Failed to cancel rental as no-show:', "Échec de l'annulation comme absence :")} ${err.message}`);
    }
  };

  const handleCustomerArrived = async (rental) => {
    try {
      const arrivedAt = new Date().toISOString();
      const actorName =
        user?.user_metadata?.full_name ||
        user?.email ||
        null;

      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_status: 'scheduled',
          status: 'scheduled',
          status_changed_at: arrivedAt,
          status_changed_by: actorName,
          status_change_reason: 'customer_arrived',
          updated_at: arrivedAt,
        })
        .eq('id', rental.id);

      if (error) throw error;

      try {
        await insertSharedRentalActivityLog({
          user_id: user?.id || null,
          created_by: actorName,
          action: 'rental_customer_arrived',
          description: `Marked customer arrived for rental ${rental.rental_id || rental.id}`,
          entity_type: 'rental',
          entity_id: rental.id,
          reason: 'customer_arrived',
          details: {
            rental_id: rental.id,
            rental_reference: rental.rental_id || null,
            customer_name: rental.customer_name || null,
            arrived_at: arrivedAt,
          },
        });
      } catch (activityError) {
        console.warn('⚠️ Failed to write customer arrived activity log:', activityError);
      }

      alert(`✅ ${tr('Customer arrival confirmed. Continue with the normal start flow.', "Arrivée du client confirmée. Continuez avec le démarrage normal.")}`);
      appWarmupService.invalidateModule('rentals');
      fetchRentals(statusFilter, paymentStatusFilter);
      void fetchRentalOverviewSnapshot();
    } catch (err) {
      console.error('❌ Error acknowledging late arrival:', err);
      alert(`${tr('Failed to update late-arrival status:', "Échec de la mise à jour de l'arrivée tardive :")} ${err.message}`);
    }
  };

  const shouldShowLateArrivalRecovery = (rental, effectiveRentalStatus) => {
    const timingState = getScheduledRentalTimingState(
      rental?.rental_start_date,
      rentalTimingSettings,
      new Date()
    );

    return (
      !rental?.started_at &&
      String(rental?.status_change_reason || '').toLowerCase() !== 'customer_arrived' &&
      ['scheduled', 'no_show_review'].includes(String(effectiveRentalStatus || '').toLowerCase()) &&
      Number(timingState?.minutesLate || -1) >= 0
    );
  };

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id,status')
        .order('id', { ascending: true });

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }
      setVehicles(data || []);
    } catch (err) {
      if (isAbortLikeError(err)) {
        console.warn('Ignoring aborted vehicle fetch:', err);
        return;
      }
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
  };

  const fetchVehicleFuelStates = async () => {
    try {
      const states = await FuelTransactionService.getVehicleFuelStates();
      const nextMap = {};
      (states || []).forEach((state) => {
        const stateKey = String(state?.vehicle_id || state?.id || '');
        if (stateKey) {
          nextMap[stateKey] = state;
        }
      });
      setVehicleFuelStateMap(nextMap);
    } catch (err) {
      console.error('❌ Error fetching vehicle fuel states:', err);
    }
  };

  const fetchRentalOverviewSnapshot = async () => {
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('vehicle_id, rental_status')
        .in('rental_status', ['active', 'scheduled', 'confirmed']);

      if (error) {
        throw error;
      }

      const activeVehicleIds = new Set();
      const scheduledVehicleIds = new Set();

      (data || []).forEach((row) => {
        const vehicleId = row?.vehicle_id ? String(row.vehicle_id) : '';
        const status = String(row?.rental_status || '').toLowerCase();
        if (!vehicleId) return;

        if (status === 'active') {
          activeVehicleIds.add(vehicleId);
          return;
        }

        if (status === 'scheduled' || status === 'confirmed') {
          scheduledVehicleIds.add(vehicleId);
        }
      });

      setRentalOverviewSnapshot({
        activeVehicleIds: [...activeVehicleIds],
        scheduledVehicleIds: [...scheduledVehicleIds].filter((vehicleId) => !activeVehicleIds.has(vehicleId)),
      });
    } catch (err) {
      console.error('❌ Error fetching rental overview snapshot:', err);
    }
  };

  const fetchDateFocusCounts = useCallback(async (currentStatusFilter = statusFilter, currentPaymentStatusFilter = paymentStatusFilter) => {
    try {
      const now = new Date();
      const { start: startOfToday, end: endOfToday } = getCalendarDayWindow(now);
      const { start: startOfWeek, end: endOfWeek } = getBusinessWeekWindow(now);

      const buildCountQuery = (fromDate, toDate) => {
        let query = supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_status,
            status,
            started_at,
            completed_at,
            is_impounded,
            impounded_at,
            released_from_impound_at,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              status
            )
          `, { count: 'exact' })
          .gte('rental_start_date', fromDate.toISOString())
          .lt('rental_start_date', toDate.toISOString());

        return query;
      };

      const [
        { count: dayCount, data: dayData, error: dayError },
        { count: weekCount, data: weekData, error: weekError },
      ] = await Promise.all([
        buildCountQuery(startOfToday, endOfToday),
        buildCountQuery(startOfWeek, endOfWeek),
      ]);

      if (dayError) throw dayError;
      if (weekError) throw weekError;

      const resolveCount = (rawCount, rawRows) => {
        if ((!rawRows || rawRows.length === 0) && rawCount) {
          return rawCount;
        }

        return (rawRows || [])
          .map(normalizeRentalLifecycle)
          .filter((rental) => {
            const normalizedStatusFilter = String(currentStatusFilter || '').toLowerCase();
            return !normalizedStatusFilter || normalizedStatusFilter === 'all'
              ? true
              : getEffectiveRentalStatus(rental) === normalizedStatusFilter;
          })
          .length;
      };

      const resolvedDayCount = resolveCount(dayCount, dayData);
      const resolvedWeekCount = resolveCount(weekCount, weekData);

      setDateFocusCounts({
        day: resolvedDayCount,
        week: resolvedWeekCount,
      });
    } catch (err) {
      console.error('❌ Error fetching day/week rental counts:', err);
    }
  }, [getEffectiveRentalStatus, paymentStatusFilter, statusFilter]);

  const refreshSecondaryRentalData = () => {
    void fetchVehicles();
    void fetchVehicleFuelStates();
    void fetchRentalOverviewSnapshot();
  };

  const doesRentalMatchFilters = useCallback((rental, status = statusFilter, payment = paymentStatusFilter, targetTab = workspaceTab) => {
    if (!rental) return false;

    const rentalStatus = getEffectiveRentalStatus(rental);
    const rentalPaymentStatus = normalizePaymentStatus(
      rental?.payment_status,
      rental?.remaining_amount
    );
    const matchesWorkspace = !targetTab || targetTab === 'all'
      ? true
      : matchesWorkspaceTab(rental, targetTab);

    const matchesStatus = !status || status === 'all' || rentalStatus === String(status).toLowerCase();
    const matchesPayment = !payment || payment === 'all' || rentalPaymentStatus === String(payment).toLowerCase();

    return matchesWorkspace && matchesStatus && matchesPayment;
  }, [getEffectiveRentalStatus, matchesWorkspaceTab, paymentStatusFilter, statusFilter, workspaceTab]);

  const scheduleRentalRefresh = useCallback(() => {
    if (rentalRefreshTimeoutRef.current) {
      window.clearTimeout(rentalRefreshTimeoutRef.current);
    }

    rentalRefreshTimeoutRef.current = window.setTimeout(() => {
      fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
      rentalRefreshTimeoutRef.current = null;
    }, 180);
  }, [statusFilter, paymentStatusFilter, currentPage, itemsPerPage]);

  const checkClosingVideo = async (rentalId) => {
    try {
      const { data: mediaRecords, error } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .select('*')
        .eq('rental_id', rentalId)
        .eq('phase', 'in') // 'in' = closing
        .ilike('file_type', 'video%');

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        return false;
      }

      return mediaRecords && mediaRecords.length > 0;
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      return false;
    }
  };

  const isPaymentSufficientForStart = (rental) => {
    return getRentalFinancialSnapshot(rental).status === 'PAID';
  };

  // Check if current user can delete rentals
  const canDelete = () => {
    if (!user?.id) return false;
    
    
    return user.role === 'owner';
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusFromUrl = params.get('status') || 'all';
    const paymentStatusFromUrl = params.get('paymentStatus') || 'all';
    const searchFromUrl = params.get('search') || '';
    setStatusFilter(statusFromUrl);
    setPaymentStatusFilter(paymentStatusFromUrl);
    setSearchTerm(searchFromUrl);
  }, [location.search]);

  useEffect(() => {
    const snapshot = location.state?.restoreRentalsView;
    if (!snapshot) return;

    const nextWorkspaceTab = String(snapshot.workspaceTab || getStoredRentalsWorkspace() || 'today');
    const nextCurrentPage = Number(snapshot.currentPage) || 1;
    const nextItemsPerPage = Number(snapshot.itemsPerPage) || 10;
    const nextStatusFilter = String(snapshot.statusFilter || 'all');
    const nextPaymentStatusFilter = String(snapshot.paymentStatusFilter || 'all');
    const nextSearchTerm = String(snapshot.searchTerm || '');
    const nextAvailabilityQuickFilter = String(snapshot.availabilityQuickFilter || 'all');
    const nextDateFocusFilter = String(
      snapshot.dateFocusFilter || getDefaultDateFocusForWorkspace(nextWorkspaceTab)
    );
    const nextDateFocusAnchor = String(snapshot.dateFocusAnchor || toDateInputValue(new Date()));
    const nextCustomDateRange =
      snapshot.customDateRange?.start || snapshot.customDateRange?.end
        ? {
            start: snapshot.customDateRange?.start ? new Date(snapshot.customDateRange.start) : null,
            end: snapshot.customDateRange?.end ? new Date(snapshot.customDateRange.end) : null,
          }
        : null;
    const nextViewMode = ['grid', 'list', 'table'].includes(String(snapshot.viewMode || ''))
      ? String(snapshot.viewMode)
      : 'grid';

    userSelectedWorkspaceRef.current = true;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RENTALS_WORKSPACE_PREF_KEY, nextWorkspaceTab);
    }

    setWorkspaceTab(nextWorkspaceTab);
    setCurrentPage(nextCurrentPage);
    setItemsPerPage(nextItemsPerPage);
    setStatusFilter(nextStatusFilter);
    setPaymentStatusFilter(nextPaymentStatusFilter);
    setSearchTerm(nextSearchTerm);
    setAvailabilityQuickFilter(nextAvailabilityQuickFilter);
    setDateFocusFilter(nextDateFocusFilter);
    setDateFocusAnchor(nextDateFocusAnchor);
    setCustomDateRange(nextCustomDateRange);
    setViewMode(nextViewMode);

    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const loadRentals = async () => {
      if (!hasLoadedOnce) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const shouldUseSummarySource = false;

      if (shouldUseSummarySource) {
        try {
          const summarySnapshot = await rentalSummaryService.getListSummary({
            statusFilter,
            paymentStatusFilter,
            page: currentPage,
            limit: itemsPerPage,
          });
          applyRentalSummarySnapshot(summarySnapshot);
        } catch (summaryError) {
          console.error('❌ Error fetching rental summary:', summaryError);
          await fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
        }
      } else {
        await fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
      }

      setLoading(false);
      setRefreshing(false);
      setHasLoadedOnce(true);

      scheduleBackgroundTask(() => {
        void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
      });
    };
    loadRentals();
  }, [statusFilter, paymentStatusFilter, currentPage, itemsPerPage, fetchDateFocusCounts, applyRentalSummarySnapshot, workspaceTab]);

  useEffect(() => {
    if (
      statusFilter !== 'all' ||
      paymentStatusFilter !== 'all' ||
      currentPage !== 1 ||
      itemsPerPage !== 10
    ) {
      return;
    }

    appWarmupService.setWarmRentalsSnapshot({
      rentals,
      rentalUniverse,
      rentalReportMap,
      totalCount,
      totalPages,
      currentPage,
      itemsPerPage,
      statusFilter,
      paymentStatusFilter,
      dateFocusCounts,
      vehicles,
      vehicleFuelStateMap,
      rentalOverviewSnapshot,
      workspaceTab,
    });
  }, [
    currentPage,
    dateFocusCounts,
    itemsPerPage,
    paymentStatusFilter,
    rentalOverviewSnapshot,
    rentalReportMap,
    rentalUniverse,
    rentals,
    statusFilter,
    totalCount,
    totalPages,
    vehicleFuelStateMap,
    vehicles,
    workspaceTab,
  ]);

  // Refresh list when tab becomes visible again (e.g. returning from RentalDetails)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleRentalRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scheduleRentalRefresh]);

  useEffect(() => {
    const scheduledId = scheduleBackgroundTask(() => {
      refreshSecondaryRentalData();
    });

    const rentalSubscription = supabase
      .channel('rental_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'app_4c3a7a6153_rentals' 
        }, 
        (payload) => {
          const changedRental =
            payload.eventType === 'DELETE'
              ? payload.old
              : payload.new;

          if (changedRental?.id) {
            setRentals((prev) => {
              const existingIndex = prev.findIndex((item) => item.id === changedRental.id);

              if (payload.eventType === 'DELETE') {
                return existingIndex === -1
                  ? prev
                  : prev.filter((item) => item.id !== changedRental.id);
              }

              if (payload.eventType === 'INSERT') {
                const normalizedInsertedRental = normalizeRentalLifecycle(changedRental);

                if (!doesRentalMatchFilters(normalizedInsertedRental)) {
                  return prev;
                }

                if (existingIndex !== -1) {
                  const next = [...prev];
                  next[existingIndex] = {
                    ...prev[existingIndex],
                    ...normalizedInsertedRental,
                  };
                  return sortRentalsForDisplay(next, getEffectiveRentalStatus);
                }

                const next = [normalizedInsertedRental, ...prev];
                return sortRentalsForDisplay(next, getEffectiveRentalStatus).slice(0, itemsPerPage);
              }

              if (existingIndex === -1) {
                return prev;
              }

              const mergedRental = {
                ...prev[existingIndex],
                ...changedRental,
              };
              const normalizedMergedRental = normalizeRentalLifecycle(mergedRental);

              if (!doesRentalMatchFilters(normalizedMergedRental)) {
                return prev.filter((item) => item.id !== changedRental.id);
              }

              const next = [...prev];
              next[existingIndex] = normalizedMergedRental;
              return sortRentalsForDisplay(next, getEffectiveRentalStatus);
            });
          }

          const insertedRental = payload.eventType === 'INSERT';
          const statusChanged = payload.eventType === 'UPDATE' && payload.new?.rental_status !== payload.old?.rental_status;
          const lifecycleChanged =
            statusChanged ||
            (payload.eventType === 'UPDATE' && payload.new?.started_at !== payload.old?.started_at) ||
            (payload.eventType === 'UPDATE' && payload.new?.completed_at !== payload.old?.completed_at);

          if (insertedRental || lifecycleChanged) {
            fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
            fetchDateFocusCounts(statusFilter, paymentStatusFilter);
          } else {
            scheduleRentalRefresh();
          }
          scheduleBackgroundTask(() => {
            void fetchVehicleFuelStates();
            void fetchRentalOverviewSnapshot();
            if (!insertedRental) {
              void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
            }
          });
        }
      )
      .on(
        'broadcast',
        { event: 'status_updated' },
        ({ payload }) => {
          const rentalId = payload?.rental_id;
          if (!rentalId) return;

          setRentals((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === rentalId);
            if (existingIndex === -1) return prev;

            const mergedRental = {
              ...prev[existingIndex],
              rental_status: payload?.rental_status || prev[existingIndex].rental_status,
              status: payload?.status || prev[existingIndex].status,
              started_at: payload?.started_at ?? prev[existingIndex].started_at,
              completed_at: payload?.completed_at ?? prev[existingIndex].completed_at,
              updated_at: payload?.updated_at ?? prev[existingIndex].updated_at,
            };
            const normalizedMergedRental = normalizeRentalLifecycle(mergedRental);

            if (!doesRentalMatchFilters(normalizedMergedRental)) {
              return prev.filter((item) => item.id !== rentalId);
            }

            const next = [...prev];
            next[existingIndex] = normalizedMergedRental;
            return sortRentalsForDisplay(next, getEffectiveRentalStatus);
          });

          fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
          scheduleBackgroundTask(() => {
            void fetchVehicleFuelStates();
            void fetchRentalOverviewSnapshot();
            void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
          });
        }
      )
      .on(
        'broadcast',
        { event: 'rental_created' },
        ({ payload }) => {
          const rentalId = payload?.rental_id;
          if (!rentalId) return;

          fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
          scheduleBackgroundTask(() => {
            void fetchVehicleFuelStates();
            void fetchRentalOverviewSnapshot();
            void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
          });
        }
      )
      .subscribe();

    const vehicleSubscription = supabase
      .channel('vehicle_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'saharax_0u4w4d_vehicles' 
        }, 
        () => {
          scheduleBackgroundTask(() => {
            refreshSecondaryRentalData();
          });
        }
      )
      .subscribe();

    return () => {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function' && typeof scheduledId === 'number') {
        window.cancelIdleCallback(scheduledId);
      } else {
        clearTimeout(scheduledId);
      }
      supabase.removeChannel(rentalSubscription);
      supabase.removeChannel(vehicleSubscription);
    };
  }, [doesRentalMatchFilters, fetchDateFocusCounts, statusFilter, paymentStatusFilter, scheduleRentalRefresh, workspaceTab]);

  useEffect(() => {
    return () => {
      if (rentalRefreshTimeoutRef.current) {
        window.clearTimeout(rentalRefreshTimeoutRef.current);
      }
    };
  }, []);

  // Check for openForm state from navigation
  useEffect(() => {
    if (location.state?.openForm) {
      if (location.state?.editingRental) {
        setEditingRental(location.state.editingRental);
      }
      setWizardInitialStep(Number(location.state?.forceStep) || 1);
      setWizardCustomerScanNote(location.state?.customerScanNote || '');
      setWizardRequiresCustomerVerification(Boolean(location.state?.requireCustomerVerification));
      setWizardCustomerVerificationCaptureOnly(Boolean(location.state?.customerVerificationCaptureOnly));
      setWizardUiVariant(location.state?.wizardUiVariant === 'light' ? 'light' : 'default');
      setWizardReturnTo(location.state?.wizardReturnTo || null);
      setShowStepperForm(true);
      // Clear the state to prevent reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleRentalSuccess = async (rentalData) => {
    const redirectUrl = rentalData?.__redirectUrl
      || (rentalData?.id
        ? `/admin/rentals/${rentalData.id}${rentalData?.__uiVariant === 'light' ? '?view=light#ready-to-start' : ''}`
        : null);

    if (redirectUrl) {
      navigate(redirectUrl);
    }

    setShowForm(false);
    setShowStepperForm(false);
    setEditingRental(null);
    setWizardInitialStep(1);
    setWizardCustomerScanNote('');
    setWizardRequiresCustomerVerification(false);
    setWizardCustomerVerificationCaptureOnly(false);
    setWizardUiVariant('default');
    setWizardReturnTo(null);
    appWarmupService.invalidateModule('rentals');
    appWarmupService.invalidateModule('finance');
    void fetchRentals(statusFilter, paymentStatusFilter);
    void refreshSecondaryRentalData();

    if (rentalData?.id) {
      try {
        await supabase
          .channel('rental-updates')
          .send({
            type: 'broadcast',
            event: 'rental_created',
            payload: {
              rental_id: rentalData.id,
              rental_status: rentalData.rental_status || 'scheduled',
              created_at: rentalData.created_at || new Date().toISOString(),
            },
          });
      } catch (broadcastErr) {
        console.warn('Rental created broadcast failed (non-critical):', broadcastErr);
      }
    }
  };

  const handleDeleteRental = async (rentalId) => {
    // Check owner permission first
    if (user?.role !== 'owner') {
      alert('⚠️ Only owners can delete rentals.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this rental?')) {
      return;
    }

    try {
      const result = await EnhancedTransactionalRentalService.deleteRental(rentalId);

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete rental');
      }

      appWarmupService.invalidateModule('rentals');
      appWarmupService.invalidateModule('finance');
      appWarmupService.invalidateModule('maintenance');
      fetchRentals(statusFilter, paymentStatusFilter);
      void fetchRentalOverviewSnapshot();
      if (result?.warning) {
        setError(result.warning);
      }
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
  };

  const handleViewRental = useCallback((rental) => {
    const snapshot = buildRentalsReturnSnapshot();
    const attentionState = getRentalAttentionState(rental);
    const openUnderMaintenanceResolution = attentionState?.status === 'under_maintenance';
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(RENTALS_RETURN_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {}
    }

    navigate(`/admin/rentals/${rental.id}${openUnderMaintenanceResolution ? '?view=light' : ''}`, {
      state: {
        rentalsReturnContext: snapshot,
        ...(openUnderMaintenanceResolution
          ? {
              maintenanceReturnMode: 'vehicle_issue',
              maintenanceReturnReportEnabled: true,
              maintenanceReturnSource: 'rentals_under_maintenance',
            }
          : {}),
      },
    });
  }, [buildRentalsReturnSnapshot, navigate]);

  const handleOpenRentalFromAction = useCallback((event, rental) => {
    event.stopPropagation();
    handleViewRental(rental);
  }, [handleViewRental]);

  const loadRentalDetailsDrawerContext = async (rental) => {
    if (!rental?.id) {
      return { rental, secondDrivers: [] };
    }

    const [rentalResult, secondDriversResult] = await Promise.allSettled([
      supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*)
        `)
        .eq('id', rental.id)
        .maybeSingle(),
      supabase
        .from('app_4c3a7a6153_rental_second_drivers')
        .select('*')
        .eq('rental_id', rental.id)
    ]);

    let hydratedRental = rental;
    if (rentalResult.status === 'fulfilled' && !rentalResult.value?.error && rentalResult.value?.data) {
      hydratedRental = normalizeRentalLifecycle({
        ...rental,
        ...rentalResult.value.data,
        vehicle: rentalResult.value.data.vehicle || rental.vehicle,
      });
    } else if (rentalResult.status === 'fulfilled' && rentalResult.value?.error) {
      console.warn('Failed to hydrate rental details drawer row:', rentalResult.value.error);
    } else if (rentalResult.status === 'rejected') {
      console.warn('Failed to hydrate rental details drawer row:', rentalResult.reason);
    }

    let secondDrivers = [];
    if (secondDriversResult.status === 'fulfilled' && !secondDriversResult.value?.error) {
      secondDrivers = secondDriversResult.value?.data || [];
    } else if (secondDriversResult.status === 'fulfilled' && secondDriversResult.value?.error) {
      console.warn('Failed to load drawer second drivers:', secondDriversResult.value.error);
    } else if (secondDriversResult.status === 'rejected') {
      console.warn('Failed to load drawer second drivers:', secondDriversResult.reason);
    }

    if (secondDrivers.length === 0 && hydratedRental?.second_driver_name) {
      secondDrivers = [{
        id: `legacy_${hydratedRental.id}`,
        full_name: hydratedRental.second_driver_name,
        licence_number: hydratedRental.second_driver_license || hydratedRental.second_driver_licence_number,
        id_number: hydratedRental.second_driver_id_number,
        date_of_birth: hydratedRental.second_driver_dob,
        nationality: hydratedRental.second_driver_nationality,
        id_scan_url: hydratedRental.second_driver_id_image,
        is_legacy: true,
      }];
    }

    return {
      rental: {
        ...hydratedRental,
        second_drivers: secondDrivers,
      },
      secondDrivers,
    };
  };

  const handleViewCustomerDetails = async (rental) => {
    const customerId = rental.customer_id || rental.id;
    const drawerContext = await loadRentalDetailsDrawerContext(rental);
    
    setCustomerDetailsDrawer({
      isOpen: true,
      customerId: customerId,
      rental: drawerContext.rental,
      secondDrivers: drawerContext.secondDrivers,
      viewMode: 'customer'
    });
  };

  const handleStartContract = (rental) => {
    if (!isPaymentSufficientForStart(rental)) {
      alert('⚠️ Payment must be "Paid" before starting the vehicle condition check.');
      return;
    }

    setVideoContractModal({
      isOpen: true,
      rental: rental,
      type: 'start'
    });
  };

  const handleCloseContract = async (rental) => {
    const paymentStatus = normalizePaymentStatus(
      rental?.payment_status,
      rental?.remaining_amount
    );
    const isFullyPaid = paymentStatus === 'paid';

    if (!isFullyPaid) {
      alert('⚠️ Rental must be fully paid before completion.');
      return;
    }

    const hasClosingVideo = await checkClosingVideo(rental.id);
    
    if (!hasClosingVideo) {
      setVideoContractModal({
        isOpen: true,
        rental: rental,
        type: 'close'
      });
      return;
    }

    if (!window.confirm('Are you sure you want to complete this rental?')) {
      return;
    }

    try {
      const completedAt = new Date().toISOString();
      let { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: 'completed',
          status: 'completed',
          completed_at: completedAt,
          updated_at: completedAt
        })
        .eq('id', rental.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }

      if (rental?.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({
            status: 'available',
            updated_at: completedAt
          })
          .eq('id', rental.vehicle_id);

        if (vehicleError) {
          console.error('❌ Vehicle status reset failed', { message: vehicleError.message, details: vehicleError.details, hint: vehicleError.hint, code: vehicleError.code });
          throw vehicleError;
        }
      }

      alert('✅ Rental completed successfully!');
      
      appWarmupService.invalidateModule('rentals');
      appWarmupService.invalidateModule('finance');
      fetchRentals(statusFilter, paymentStatusFilter);
      refreshSecondaryRentalData();
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      alert('❌ Failed to complete rental: ' + err.message);
    }
  };

  const handleVideoContractSuccess = (updatedRental) => {
    setVideoContractModal({
      isOpen: false,
      rental: null,
      type: null
    });
    
    const action = videoContractModal.type === 'start' ? 'started' : 'completed';
    alert(`✅ Contract ${action} successfully!`);
    
    fetchRentals(statusFilter, paymentStatusFilter);
    refreshSecondaryRentalData();
  };

  const getStatusBadge = (status) => {
    const configs = {
      'scheduled': { text: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
      'no_show_review': { text: 'No-show Review', className: 'bg-amber-100 text-amber-800' },
      'active': { text: 'Active', className: 'bg-green-100 text-green-800' },
      'impounded': { text: 'Impounded', className: 'bg-amber-100 text-amber-800' },
      'completed': { text: 'Completed', className: 'bg-gray-100 text-gray-800' },
      'cancelled': { text: 'Cancelled', className: 'bg-red-100 text-red-800' },
      'expired': { text: 'Expired', className: 'bg-yellow-100 text-yellow-800' },
      'void': { text: 'Void', className: 'bg-red-100 text-red-800' }
    };
    
    const config = configs[status] || configs['scheduled'];
    const translatedText = {
      Scheduled: tr('Scheduled', 'Planifiée'),
      'No-show Review': tr('No-show review', 'Contrôle absence'),
      Active: tr('Active', 'Active'),
      Impounded: tr('Impounded', 'Mis en fourrière'),
      Completed: tr('Completed', 'Terminée'),
      Cancelled: tr('Cancelled', 'Annulée'),
      Expired: tr('Expired', 'Expirée'),
      Void: tr('Void', 'Nulle'),
    }[config.text] || config.text;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.className}`}>
        {translatedText}
      </span>
    );
  };

  const getPaymentStatusBadge = (paymentStatus, remainingAmount = null) => {
    const { label, background, text } = getPaymentStatusStyle(paymentStatus, remainingAmount);
    const colorClass = `${background} ${text}`;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
        {label}
      </span>
    );
  };

  const getRentalAttentionState = (rental) => {
    const report = rentalReportMap[rental.id];
    if (!report) return null;

    if (
      rental.rental_status === 'completed' &&
      report.status === 'maintenance_completed'
    ) {
      return {
        status: 'maintenance_closed',
        text: tr('Maintenance Closed', 'Maintenance clôturée'),
        className: 'bg-slate-100 text-slate-800 border border-slate-300',
        detailText: tr('This rental had a linked maintenance issue that was resolved after return', 'Cette location avait un problème de maintenance lié qui a été résolu après le retour'),
      };
    }

    if (
      report.maintenance_id ||
      rental.vehicle?.status === 'maintenance' ||
      ['maintenance_created', 'maintenance_in_progress', 'maintenance_completed'].includes(report.status)
    ) {
      return {
        status: 'under_maintenance',
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
      status: 'vehicle_report',
      text: labels[report.report_type] || tr('Vehicle Report', 'Rapport véhicule'),
      className: 'bg-red-100 text-red-800 border border-red-200',
      detailText: tr('Vehicle inspection report saved on this rental', "Rapport d'inspection véhicule enregistré sur cette location"),
    };
  };

  const formatRentalId = (rental) => {
    if (rental.rental_id) {
      return rental.rental_id;
    }
    
    const date = new Date(rental.created_at || Date.now());
    const year = date.getFullYear();
    const idPart = String(rental.id).slice(-3).padStart(3, '0');
    return `RNT-${year}-${idPart}`;
  };

  const matchesDateFocusFilter = useCallback((rental, focus = dateFocusFilter) => {
    if (!focus || focus === 'all') {
      return true;
    }

    const anchorDate = focus === dateFocusFilter ? dateFocusAnchorDate : new Date();
    const window = getDateFocusWindow(
      focus,
      workspaceTab,
      anchorDate,
      focus === 'custom' || focus === dateFocusFilter ? customDateRange : null
    );

    return window ? doesRentalIntersectWindow(rental, window.start, window.end) : true;
  }, [customDateRange, dateFocusAnchorDate, dateFocusFilter, workspaceTab]);

  const isDateFocusScoped = Boolean(dateFocusFilter && dateFocusFilter !== 'all');
  const hasDateFocusOverride = useMemo(() => {
    const defaultDateFocus = getDefaultDateFocusForWorkspace(workspaceTab);
    const todayAnchor = toDateInputValue(new Date());
    const isNonDefaultDayAnchor =
      defaultDateFocus === 'day' &&
      dateFocusFilter === 'day' &&
      dateFocusAnchor !== todayAnchor;

    return Boolean(customDateRange?.start) || Boolean(isNonDefaultDayAnchor) || (dateFocusFilter && dateFocusFilter !== defaultDateFocus);
  }, [customDateRange, dateFocusAnchor, dateFocusFilter, workspaceTab]);

  const dateFocusRentalSource = useMemo(
    () => (isDateFocusScoped && rentalUniverse.length > 0 ? rentalUniverse : rentals),
    [isDateFocusScoped, rentalUniverse, rentals]
  );

  const baseVisibleRentals = useMemo(() => {
    const normalizedSearch = normalizeRentalSearchText(deferredSearchTerm);
    const isBroadSearch = normalizedSearch.length >= 3;
    const searchSource = isBroadSearch && rentalUniverse.length > 0
      ? rentalUniverse
      : dateFocusRentalSource;
    const normalizedPhoneSearch = normalizePhone(normalizedSearch);

    return searchSource.filter((rental) => {
      if (!isBroadSearch && !hasDateFocusOverride && !matchesWorkspaceTab(rental)) {
        return false;
      }

      if (!isBroadSearch && !matchesDateFocusFilter(rental)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const rentalContractId = formatRentalId(rental);
      const rentalContractSuffix = rentalContractId.split('-').pop() || '';
      const searchableValues = [
        rental.customer_name,
        rental.customer?.full_name,
        rental.customer?.name,
        rental.customer_email,
        rental.customer?.email,
        rental.customer_phone,
        rental.customer?.phone,
        rental.customer_id,
        rental.customer_id_number,
        rental.customer_licence_number,
        rental.customer_license_number,
        rental.vehicle?.name,
        rental.vehicle?.model,
        rental.vehicle?.plate_number,
        rental.vehicle_plate_number,
        rental.id,
        rentalContractId,
        rentalContractSuffix,
        rental.reference,
      ];

      const textMatches = searchableValues.some((value) =>
        normalizeRentalSearchText(value).includes(normalizedSearch)
      );
      const phoneMatches = normalizedPhoneSearch
        ? [rental.customer_phone, rental.customer?.phone].some((phone) =>
            normalizePhone(phone).includes(normalizedPhoneSearch)
          )
        : false;

      return textMatches || phoneMatches;
    });
  }, [dateFocusRentalSource, deferredSearchTerm, hasDateFocusOverride, matchesDateFocusFilter, matchesWorkspaceTab, rentalUniverse]);

  const filteredRentals = useMemo(() => {
    const normalizedStatus = String(statusFilter || 'all').toLowerCase();

    const matchingRentals = baseVisibleRentals.filter((rental) => {
      if (normalizedStatus !== 'all') {
        const effectiveStatus = getEffectiveRentalStatus(rental);
        const attentionState = getRentalAttentionState(rental);

        if (normalizedStatus === 'maintenance') {
          if (attentionState?.text !== tr('Under Maintenance', 'En maintenance')) {
            return false;
          }
        } else if (effectiveStatus !== normalizedStatus) {
          return false;
        }
      }

      if (paymentStatusFilter && paymentStatusFilter !== 'all') {
        const rentalPaymentStatus = normalizePaymentStatus(
          rental?.payment_status,
          rental?.remaining_amount
        );
        if (rentalPaymentStatus !== String(paymentStatusFilter).toLowerCase()) {
          return false;
        }
      }

      return true;
    });

    return sortRentalsForDisplay(matchingRentals, getEffectiveRentalStatus);
  }, [baseVisibleRentals, getEffectiveRentalStatus, getRentalAttentionState, paymentStatusFilter, statusFilter]);

  const statusTabCounts = useMemo(() => {
    const counts = STATUS_TAB_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

    baseVisibleRentals.forEach((rental) => {
      const effectiveStatus = getEffectiveRentalStatus(rental);
      const attentionState = getRentalAttentionState(rental);

      counts.all += 1;
      if (counts[effectiveStatus] !== undefined) {
        counts[effectiveStatus] += 1;
      }
      if (attentionState?.text === tr('Under Maintenance', 'En maintenance')) {
        counts.maintenance += 1;
      }
    });

    return counts;
  }, [baseVisibleRentals, getEffectiveRentalStatus, getRentalAttentionState]);

  const workspaceTabCounts = useMemo(() => {
    return rentalUniverse.reduce((acc, rental) => {
      const bucket = getRentalWorkspaceBucket(rental);
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, { today: 0, upcoming: 0, past: 0 });
  }, [rentalUniverse]);

  useEffect(() => {
    if (userSelectedWorkspaceRef.current || !hasLoadedOnce || rentalUniverse.length === 0) {
      return;
    }

    const nextWorkspaceTab =
      workspaceTabCounts.today > 0
        ? 'today'
        : workspaceTabCounts.past > 0
          ? 'past'
          : workspaceTabCounts.upcoming > 0
            ? 'upcoming'
            : 'today';

    if (workspaceTab === nextWorkspaceTab) {
      return;
    }

    setWorkspaceTab(nextWorkspaceTab);
    setDateFocusFilter(getDefaultDateFocusForWorkspace(nextWorkspaceTab));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RENTALS_WORKSPACE_PREF_KEY, nextWorkspaceTab);
    }
  }, [hasLoadedOnce, rentalUniverse.length, workspaceTab, workspaceTabCounts]);

  const localDateFocusCounts = useMemo(() => {
    const scopedRentals = rentalUniverse.length > 0 ? rentalUniverse : rentals;
    const workspaceRentals = scopedRentals.filter((rental) => matchesWorkspaceTab(rental));
    const dayCount = workspaceRentals.filter((rental) => matchesDateFocusFilter(rental, 'day')).length;
    const weekCount = workspaceRentals.filter((rental) => matchesDateFocusFilter(rental, 'week')).length;
    return { day: dayCount, week: weekCount };
  }, [matchesDateFocusFilter, matchesWorkspaceTab, rentalUniverse, rentals]);

  const activeQuickRangeLabel = useMemo(() => {
    const todayBase = new Date();
    todayBase.setHours(12, 0, 0, 0);
    const yesterdayBase = new Date(todayBase);
    yesterdayBase.setDate(yesterdayBase.getDate() - 1);
    const last7Start = new Date(dateFocusAnchorDate);
    last7Start.setDate(last7Start.getDate() - 6);

    if (customDateRange?.start && customDateRange?.end) {
      return `${tr('Custom Range', 'Plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${customDateRange.end.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (customDateRange?.start) {
      return `${tr('Custom Range Start', 'Début plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if ((dateFocusFilter === 'day' || dateFocusFilter === 'calendar-day') && isSameCalendarDay(dateFocusAnchorDate, todayBase)) {
      return `${tr('Today', "Aujourd'hui")} • ${todayBase.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if ((dateFocusFilter === 'day' || dateFocusFilter === 'calendar-day') && isSameCalendarDay(dateFocusAnchorDate, yesterdayBase)) {
      return `${tr('Yesterday', 'Hier')} • ${yesterdayBase.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (dateFocusFilter === 'day' || dateFocusFilter === 'calendar-day') {
      return `${tr('Selected Date', 'Date sélectionnée')} • ${dateFocusAnchorDate.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (dateFocusFilter === 'week') {
      return `${tr('Week focus', 'Focus semaine')} • ${weekStart.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (dateFocusFilter === 'month') {
      return `${tr('Month focus', 'Focus mois')} • ${dateFocusAnchorDate.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })}`;
    }
    if (dateFocusFilter === 'last7') {
      return `${tr('Last 7 Days', '7 derniers jours')} • ${last7Start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${dateFocusAnchorDate.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    return tr('All rentals', 'Toutes les locations');
  }, [customDateRange, dateFocusAnchorDate, dateFocusFilter, isFrench, weekEnd, weekStart]);

  const formatPreviewDate = useCallback((value) => {
    if (!value) return '';
    return fromDateInputValue(value).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }, [isFrench]);

  const collapsedDateFocusLabel = customDateRange?.start
    ? customDateRange.end
      ? `${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} → ${customDateRange.end.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
      : `${tr('Start', 'Début')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
    : activeQuickRangeLabel;

  const collapsedDateFocusMeta = customDateRange?.start
    ? customDateRange.end
      ? tr('Custom range active', 'Plage personnalisée active')
      : tr('Choose the end date', 'Choisissez la date de fin')
    : dateFocusFilter === 'all'
      ? tr('Showing every rental', 'Toutes les locations affichées')
      : dateFocusFilter === 'day' || dateFocusFilter === 'calendar-day'
        ? formatPreviewDate(dateFocusAnchor)
        : dateFocusFilter === 'week'
          ? `${formatPreviewDate(toDateInputValue(weekStart))} → ${formatPreviewDate(toDateInputValue(weekEnd))}`
          : dateFocusFilter === 'month'
            ? dateFocusAnchorDate.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })
            : dateFocusFilter === 'last7'
              ? tr('Rolling 7-day window', 'Fenêtre glissante de 7 jours')
              : tr('Date focus active', 'Focus date actif');

  const renderDateFocusControls = () => (
    <div className={`rounded-[20px] border p-3 shadow-sm transition-all ${
      showDateFocusPanel
        ? 'border-violet-200 bg-gradient-to-br from-violet-100 via-[#f5f0ff] to-indigo-100 shadow-[0_18px_42px_rgba(79,70,229,0.14)]'
        : 'border-violet-100 bg-slate-50/70'
    }`}>
      <button
        type="button"
        onClick={() => {
          triggerDateFocusLauncherBounce();
          setShowDateFocusPanel((value) => !value);
        }}
        className={`group w-full rounded-[1.25rem] border px-4 py-3 text-left transition-all ${bouncingDateFocusLauncher ? 'quick-date-tap-bounce' : ''} ${
          showDateFocusPanel
            ? 'border-violet-300 bg-white shadow-[0_16px_36px_rgba(79,70,229,0.14)]'
            : 'border-violet-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] hover:border-violet-300 hover:shadow-[0_16px_34px_rgba(79,70,229,0.10)]'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <Calendar className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-[0.02em] text-slate-950">{tr('Fast Date Focus', 'Focus date rapide')}</p>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                {collapsedDateFocusLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-slate-500">{collapsedDateFocusMeta}</p>
          </div>

          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.14)] transition-all duration-150 ease-out ${showDateFocusPanel ? 'rotate-180' : 'group-hover:scale-[1.03] group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-[0_14px_32px_rgba(124,58,237,0.22)]'}`}>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </button>

      <div className={showDateFocusPanel ? 'mt-3 block' : 'hidden'}>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'today', label: tr('Today', "Aujourd'hui") },
            { key: 'yesterday', label: tr('Yesterday', 'Hier') },
            { key: 'week', label: tr('This Week', 'Cette semaine') },
            { key: 'last7', label: tr('Last 7 Days', '7 derniers jours') },
            { key: 'month', label: tr('This Month', 'Ce mois') },
          ].map((chip) => {
            const isActive =
              (chip.key === 'today' && (dateFocusFilter === 'day' || dateFocusFilter === 'calendar-day') && isSameCalendarDay(dateFocusAnchorDate, new Date())) ||
              (chip.key === 'yesterday' && (() => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                return (dateFocusFilter === 'day' || dateFocusFilter === 'calendar-day') && isSameCalendarDay(dateFocusAnchorDate, yesterday);
              })()) ||
              (chip.key !== 'today' && chip.key !== 'yesterday' && dateFocusFilter === chip.key);

            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => applyQuickRange(chip.key, new Date())}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'border-violet-300 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_22px_rgba(79,70,229,0.20)]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-white hover:text-violet-700'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDateFocusFilter('all')}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              dateFocusFilter === 'all'
                ? 'border-violet-300 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_22px_rgba(79,70,229,0.20)]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-white hover:text-violet-700'
            }`}
          >
            {tr('All rentals', 'Toutes')}
          </button>
        </div>

        {customDateRange?.start ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              <span>
                {customDateRange.end
                  ? `${tr('Custom range', 'Plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${customDateRange.end.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
                  : `${tr('Custom range start', 'Début plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`}
              </span>
              <span className="text-violet-300">•</span>
              <button
                type="button"
                onClick={clearCustomDateRange}
                className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 transition hover:bg-violet-100"
              >
                {tr('Clear', 'Effacer')}
              </button>
            </div>
            {!customDateRange.end ? (
              <p className="text-[11px] font-medium text-slate-500">
                {tr('Tap another date to complete the range.', 'Touchez une autre date pour terminer la plage.')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.12)] transition duration-150 ease-out hover:-translate-x-0.5 hover:bg-violet-600 hover:text-white hover:shadow-[0_14px_32px_rgba(124,58,237,0.22)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {tr('Prev Week', 'Semaine préc.')}
            </button>
            <p className="text-xs font-semibold text-slate-900 sm:text-sm">
              {weekStart.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.12)] transition duration-150 ease-out hover:translate-x-0.5 hover:bg-violet-600 hover:text-white hover:shadow-[0_14px_32px_rgba(124,58,237,0.22)]"
            >
              {tr('Next Week', 'Semaine suiv.')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dayValue = toDateInputValue(day);
              const isSelectedDay = dateFocusFilter === 'day' && dayValue === dateFocusAnchor;
              const isWeekActive = dateFocusFilter === 'week' && isDateWithinInclusiveRange(day, weekStart, weekEnd);
              const isCustomStart = Boolean(customDateRange?.start) && isSameCalendarDay(customDateRange.start, day);
              const isCustomEnd = Boolean(customDateRange?.end) && isSameCalendarDay(customDateRange.end, day);
              const isInsideCustomRange = Boolean(customDateRange?.start && customDateRange?.end) && isDateWithinInclusiveRange(day, customDateRange.start, customDateRange.end);
              const isRangePreview = Boolean(customDateRange?.start && !customDateRange?.end) && isCustomStart;
              const isBouncing = bouncingWeekDayKey === dayValue;

              return (
                <button
                  key={dayValue}
                  type="button"
                  onClick={() => handleQuickDayPress(day)}
                  className={`rounded-2xl border px-2 py-3 text-center transition-all ${
                    isSelectedDay || isCustomStart || isCustomEnd
                      ? 'border-violet-500 bg-violet-600 text-white shadow-[0_12px_26px_rgba(79,70,229,0.22)]'
                      : isInsideCustomRange || isWeekActive || isRangePreview
                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
                  } ${isBouncing ? 'quick-date-tap-bounce' : ''}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                    {day.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { weekday: 'short' })}
                  </p>
                  <p className="mt-1 text-base font-bold">{day.getDate()}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const hasActiveUiFilters = useMemo(() => {
    const defaultDateFocus = getDefaultDateFocusForWorkspace(workspaceTab);
    return Boolean(
      searchTerm.trim() ||
      statusFilter !== 'all' ||
      paymentStatusFilter !== 'all' ||
      dateFocusFilter !== defaultDateFocus
    );
  }, [dateFocusFilter, paymentStatusFilter, searchTerm, statusFilter, workspaceTab]);

  const summaryPeriodRentals = useMemo(() => {
    return dateFocusRentalSource.filter((rental) => {
      if (!matchesDateFocusFilter(rental)) {
        return false;
      }

      return doesRentalMatchFilters(rental, statusFilter, paymentStatusFilter, 'all');
    });
  }, [dateFocusRentalSource, doesRentalMatchFilters, matchesDateFocusFilter, paymentStatusFilter, statusFilter]);

  const footerSummaryRentals = summaryPeriodRentals;
  const footerSummaryRentalCount = footerSummaryRentals.length;
  const collectedSummaryWindow = useMemo(
    () => getDateFocusWindow(
      dateFocusFilter,
      workspaceTab,
      dateFocusAnchorDate,
      dateFocusFilter === 'custom' ? customDateRange : null
    ),
    [customDateRange, dateFocusAnchorDate, dateFocusFilter, workspaceTab]
  );
  const footerSummaryCollected = footerSummaryRentals.reduce((sum, rental) => {
    const collectedAmount = getRentalCollectedAmountInWindow(
      rental,
      collectedSummaryWindow?.start || null,
      collectedSummaryWindow?.end || null
    );
    return sum + (Number.isFinite(collectedAmount) ? collectedAmount : 0);
  }, 0);

  const todayOperationalRentals = useMemo(
    () => (rentalUniverse.length > 0 ? rentalUniverse : rentals).filter((rental) => doesRentalIntersectWindow(rental, getBusinessDayWindow().start, getBusinessDayWindow().end)),
    [rentalUniverse, rentals]
  );
  const todayCashIn = useMemo(() => {
    return todayOperationalRentals.reduce((sum, rental) => {
      const paid = Number(getRentalFinancialSnapshot(rental).amountPaid || 0);
      return sum + (Number.isFinite(paid) ? paid : 0);
    }, 0);
  }, [todayOperationalRentals]);

  const formatDate = (dateString) => {
    if (!dateString) return tr('N/A', 'N/D');
    return new Date(dateString).toLocaleDateString();
  };

  const formatVehicleName = (vehicleLike) => {
    if (!vehicleLike) return tr('Unknown Vehicle', 'Véhicule inconnu');
    
    const parts = [];
    if (vehicleLike.name) parts.push(vehicleLike.name);
    if (vehicleLike.model) parts.push(vehicleLike.model);
    
    return parts.length > 0 ? parts.join(' ') : tr('Unknown Vehicle', 'Véhicule inconnu');
  };

  const formatPlateNumber = (plateNumber) => {
    if (!plateNumber) return tr('N/A', 'N/D');
    return plateNumber.toUpperCase();
  };

  const renderFuelProgressBar = (rental, compact = false) => {
    const vehicleKey = String(rental?.vehicle_id || rental?.vehicle?.id || '');
    const fuelState = vehicleFuelStateMap[vehicleKey];
    const tankCapacity = Number(fuelState?.tank_capacity_liters || 0);
    const startFuelLines = Number(rental?.start_fuel_level ?? 0);
    const endFuelLines = Number(rental?.end_fuel_level ?? 0);
    const hasCompletedFuelComparison =
      rental?.rental_status === 'completed' &&
      rental?.start_fuel_level !== null &&
      rental?.start_fuel_level !== undefined &&
      rental?.end_fuel_level !== null &&
      rental?.end_fuel_level !== undefined;

    if (!fuelState && !hasCompletedFuelComparison) return null;

    if (hasCompletedFuelComparison) {
      const safeStartLines = Math.max(0, Math.min(8, startFuelLines));
      const safeEndLines = Math.max(0, Math.min(8, endFuelLines));
      const consumedLines = Math.max(0, safeStartLines - safeEndLines);
      const extraLines = Math.max(0, safeEndLines - safeStartLines);
      const startPercent = Math.max(0, Math.min(100, (safeStartLines / 8) * 100));
      const remainingPercent = Math.max(0, Math.min(100, (safeEndLines / 8) * 100));
      const consumedPercent = Math.max(0, startPercent - remainingPercent);
      const extraPercent = Math.max(0, remainingPercent - startPercent);
      const consumedLiters = tankCapacity > 0 ? roundTo((consumedLines / 8) * tankCapacity, 1) : null;
      const extraLiters = tankCapacity > 0 ? roundTo((extraLines / 8) * tankCapacity, 1) : null;
      const hasExtraFuel = extraLines > 0;
      const hasFuelUsed = consumedLines > 0;

      return (
        <div className={`rounded-lg border border-emerald-100 bg-emerald-50/70 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={`font-semibold uppercase tracking-[0.18em] text-emerald-700 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
              {tr('Fuel Return', 'Retour carburant')}
            </span>
            <span className={`font-semibold text-slate-800 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {safeStartLines}/8 → {safeEndLines}/8
              {hasFuelUsed && consumedLiters !== null ? ` · ${consumedLiters}L ${tr('used', 'utilisés')}` : ''}
              {hasExtraFuel && extraLiters !== null ? ` · ${extraLiters}L ${tr('extra', 'en plus')}` : ''}
              {!hasFuelUsed && !hasExtraFuel ? ` · ${tr('same level', 'même niveau')}` : ''}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${startPercent}%` }}
            />
            {hasFuelUsed ? (
              <div
                className="absolute inset-y-0 rounded-full bg-rose-500/90 transition-all"
                style={{ left: `${remainingPercent}%`, width: `${consumedPercent}%` }}
              />
            ) : null}
            {hasExtraFuel ? (
              <div
                className="absolute inset-y-0 rounded-full bg-sky-500/90 transition-all"
                style={{ left: `${startPercent}%`, width: `${extraPercent}%` }}
              />
            ) : null}
          </div>
        </div>
      );
    }

    const lines = Number(fuelState.current_fuel_lines || 0);
    const liters = Number(fuelState.current_fuel_liters || 0);
    const percentage = Math.max(0, Math.min(100, (lines / 8) * 100));

    return (
      <div className={`rounded-lg border border-emerald-100 bg-emerald-50/70 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className={`font-semibold uppercase tracking-[0.18em] text-emerald-700 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
            {tr('Fuel', 'Carburant')}
          </span>
          <span className={`font-semibold text-emerald-800 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {lines}/8
            {tankCapacity > 0 ? ` · ${liters.toFixed(1)}/${tankCapacity.toFixed(tankCapacity % 1 === 0 ? 0 : 1)}L` : ` · ${liters.toFixed(1)}L`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };
  

  
  // === ENHANCED HELPER FUNCTIONS ===

  // 1. Rental Type Badge
  const getRentalTypeBadge = (rentalType) => {
    const isHourly = rentalType === 'hourly';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
        isHourly 
          ? 'bg-purple-100 text-purple-800 border border-purple-300' 
          : 'bg-blue-100 text-blue-800 border border-blue-300'
      }`}>
        {isHourly ? '⏰' : '📅'}
        <span>{isHourly ? 'HOURLY' : 'DAILY'}</span>
      </span>
    );
  };

  // 2. Smart Time Remaining Calculator (already fixed above - this is a duplicate that will be overridden)
  // 4. Duration Badge
  const getDurationBadge = (rental) => {
    const { startDate, endDate } = getEffectiveRentalWindow(rental);

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return null;
    }
    
    if (rental.rental_type === 'hourly') {
      const diffMs = Math.max(0, endDate - startDate);
      const packageAwareHours = getPackageRentalDurationUnits(rental);
      const diffHours = Number.isFinite(packageAwareHours) && packageAwareHours > 0
        ? packageAwareHours
        : Math.max(0.5, Math.round((diffMs / (1000 * 60 * 60)) * 2) / 2);
      const durationLabel = diffHours === 0.5 ? '30m' : `${diffHours}h`;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full border border-gray-300">
          <span className="font-bold">{durationLabel}</span>
          <span>{tr('duration', 'durée')}</span>
        </span>
      );
    }
    
    const diffMs = Math.max(0, endDate - startDate);
    const storedDurationDays = getPackageRentalDurationUnits(rental);
    const diffDays = Number.isFinite(storedDurationDays) && storedDurationDays > 0
      ? storedDurationDays
      : Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full border border-gray-300">
        <span className="font-bold">{diffDays}d</span>
        <span>{tr('rental', 'location')}</span>
      </span>
    );
  };

  const getExtensionBadge = (rental) => {
    const approvedExtensionHours = getApprovedExtensionHours(rental);

    if (approvedExtensionHours <= 0) return null;

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-200">
        <span>+</span>
        <span>{approvedExtensionHours}h</span>
      </span>
    );
  };

  const handleFilterChange = (setter, filterName, value) => {
    setter(value);
    if (filterName === 'status') {
      setAvailabilityQuickFilter('all');
    }
    setCurrentPage(1); // Reset to first page when changing filters
    const newParams = new URLSearchParams(location.search);
    if (value === 'all') {
      newParams.delete(filterName);
    } else {
      newParams.set(filterName, value);
    }
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
  };

  const handleAvailabilityCardClick = (key) => {
    const nextQuickFilter = availabilityQuickFilter === key ? 'all' : key;
    setAvailabilityQuickFilter(nextQuickFilter);
    setCurrentPage(1);

    const mappedStatus =
      nextQuickFilter === 'rented'
        ? 'active'
        : nextQuickFilter === 'scheduled'
          ? 'scheduled'
          : 'all';

    setStatusFilter(mappedStatus);

    const newParams = new URLSearchParams(location.search);
    if (mappedStatus === 'all') {
      newParams.delete('status');
    } else {
      newParams.set('status', mappedStatus);
    }
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
  };

  const handleDateFocusToggle = (nextFilter) => {
    setCurrentPage(1);
    setDateFocusFilter((prev) => (prev === nextFilter ? 'all' : nextFilter));
  };

  const handleWorkspaceTabChange = (nextTab) => {
    userSelectedWorkspaceRef.current = true;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RENTALS_WORKSPACE_PREF_KEY, nextTab);
    }
    setWorkspaceTab(nextTab);
    setStatusFilter('all');
    setAvailabilityQuickFilter('all');
    setDateFocusFilter(getDefaultDateFocusForWorkspace(nextTab));
    setCurrentPage(1);

    const newParams = new URLSearchParams(location.search);
    newParams.delete('status');
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
  };

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleItemsPerPageChange = (e) => {
    const newLimit = Number(e.target.value);
    setItemsPerPage(newLimit);
    setCurrentPage(1);
  };

  // Calculate page numbers to display
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminModuleHero
          className="w-full"
          icon={<ClipboardList className="h-8 w-8 text-violet-600" />}
          eyebrow={isFrench ? 'Gestion des locations' : 'Rental Management'}
          title={isFrench ? 'Gestion des locations' : 'Rental Management'}
          description={isFrench ? 'Créez, suivez et gérez les locations actives, planifiées et terminées depuis un seul espace.' : 'Create, track, and manage active, scheduled, and completed rentals from one workspace.'}
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                onClick={openRentalWizard(setShowStepperForm, setWizardUiVariant, 'default')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.18)] transition-all duration-200 hover:bg-violet-700 hover:shadow-[0_14px_28px_rgba(79,70,229,0.24)] sm:w-auto"
              >
                <Plus className="w-5 h-5" />
                <span>{isFrench ? 'Créer une location' : 'Create New Rental'}</span>
              </button>
              <button
                onClick={openRentalWizard(setShowStepperForm, setWizardUiVariant, 'light')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200/80 bg-white/85 px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-[0_10px_22px_rgba(76,29,149,0.08)] transition-all duration-200 hover:bg-violet-50 hover:border-violet-300 sm:w-auto"
              >
                <Plus className="w-5 h-5" />
                <span>{isFrench ? 'Version légère' : 'Light Version'}</span>
              </button>
            </div>
          }
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 text-4xl animate-spin">⏳</div>
              <p className="text-base font-medium text-slate-700">{isFrench ? 'Chargement des locations...' : 'Loading rentals...'}</p>
              {totalCount > 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  {isFrench ? `Résultat : ${totalCount} locations • Page ${currentPage} sur ${totalPages}` : `Found ${totalCount} rentals • Page ${currentPage} of ${totalPages}`}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">{isFrench ? 'Préparation de la vue locations...' : 'Preparing the rentals workspace...'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-600 mb-4">{isFrench ? `Erreur : ${error}` : `Error: ${error}`}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {isFrench ? 'Réessayer' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <EnhancedStepperRentalForm
          onSuccess={handleRentalSuccess}
          onCancel={() => {
            setShowForm(false);
            setEditingRental(null);
            setWizardInitialStep(1);
            setWizardCustomerScanNote('');
            setWizardRequiresCustomerVerification(false);
            setWizardCustomerVerificationCaptureOnly(false);
            setWizardReturnTo(null);
          }}
          initialData={editingRental}
          mode={editingRental ? 'edit' : 'create'}
          initialStep={wizardInitialStep}
          initialCustomerScanNote={wizardCustomerScanNote}
          requiresCustomerVerification={wizardRequiresCustomerVerification}
          customerVerificationCaptureOnly={wizardCustomerVerificationCaptureOnly}
          uiVariant={wizardUiVariant}
        />
      </div>
    );
  }

  if (showStepperForm) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <EnhancedStepperRentalForm
          mode={editingRental ? "edit" : "create"}
          onSuccess={handleRentalSuccess}
          onCancel={() => {
            if (wizardReturnTo) {
              navigate(wizardReturnTo, { replace: true });
              return;
            }
            setShowStepperForm(false);
            setEditingRental(null);
            setWizardInitialStep(1);
            setWizardCustomerScanNote('');
            setWizardRequiresCustomerVerification(false);
            setWizardCustomerVerificationCaptureOnly(false);
            setWizardUiVariant('default');
            setWizardReturnTo(null);
          }}
          initialData={editingRental}
          isLoading={loading}
          initialStep={wizardInitialStep}
          initialCustomerScanNote={wizardCustomerScanNote}
          requiresCustomerVerification={wizardRequiresCustomerVerification}
          customerVerificationCaptureOnly={wizardCustomerVerificationCaptureOnly}
          uiVariant={wizardUiVariant}
        />
      </div>
    );
  }

  const whatsAppSheetEffectiveStatus = whatsAppSheetRental
    ? getEffectiveRentalStatus(whatsAppSheetRental)
    : null;
  const whatsAppSheetPaymentSnapshot = whatsAppSheetRental
    ? getRentalFinancialSnapshot(whatsAppSheetRental)
    : null;
  const whatsAppTemplateOptions = whatsAppSheetRental
    ? buildRentalWhatsAppOptions(
        whatsAppSheetRental,
        whatsAppSheetEffectiveStatus,
        whatsAppSheetPaymentSnapshot
      )
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminModuleHero
        className="w-full"
        icon={<ClipboardList className="h-8 w-8 text-violet-600" />}
        eyebrow={isFrench ? 'Gestion des locations' : 'Rental Management'}
        title={isFrench ? 'Gestion des locations' : 'Rental Management'}
        description={isFrench ? 'Créez, suivez et gérez les locations actives, planifiées et terminées depuis un seul espace.' : 'Create, track, and manage active, scheduled, and completed rentals from one workspace.'}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              onClick={openRentalWizard(setShowStepperForm, setWizardUiVariant, 'default')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.18)] transition-all duration-200 hover:bg-violet-700 hover:shadow-[0_14px_28px_rgba(79,70,229,0.24)] sm:w-auto"
            >
              <Plus className="w-5 h-5" />
              <span>{isFrench ? 'Créer une location' : 'Create New Rental'}</span>
            </button>
            <button
              onClick={openRentalWizard(setShowStepperForm, setWizardUiVariant, 'light')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200/80 bg-white/85 px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-[0_10px_22px_rgba(76,29,149,0.08)] transition-all duration-200 hover:bg-violet-50 hover:border-violet-300 sm:w-auto"
            >
              <Plus className="w-5 h-5" />
              <span>{isFrench ? 'Version légère' : 'Light Version'}</span>
            </button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto p-6 pb-32 sm:pb-8">

        <div className="mb-4 mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
                {isFrench ? 'Vue opérationnelle' : 'Operations View'}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {workspaceTab === 'upcoming'
                  ? (isFrench ? 'Locations à venir' : 'Upcoming Rentals')
                  : workspaceTab === 'past'
                    ? (isFrench ? 'Historique récent' : 'Past Rentals')
                    : (isFrench ? "Locations du jour" : 'Today Rentals')}
              </h2>
            </div>
            <div className="inline-flex items-center rounded-2xl border border-violet-100 bg-white p-1 shadow-sm">
              {[
                { key: 'today', label: isFrench ? "Aujourd'hui" : 'Today' },
                { key: 'upcoming', label: isFrench ? 'À venir' : 'Upcoming' },
                { key: 'past', label: isFrench ? 'Passé' : 'Past' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleWorkspaceTabChange(key)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    workspaceTab === key
                      ? 'bg-violet-600 text-white shadow-[0_10px_20px_rgba(79,70,229,0.2)]'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                    workspaceTab === key ? 'bg-white/15 text-white' : 'bg-violet-50 text-violet-600'
                  }`}>
                    {workspaceTabCounts[key] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-100/80 bg-white px-3 py-2 shadow-[0_10px_24px_rgba(76,29,149,0.06)]">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {tr('Available', 'Disponibles')}: {vehicleAvailabilitySummary.available}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {tr('Active', 'Actives')}: {statusTabCounts.active}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {tr('Scheduled', 'Planifiées')}: {statusTabCounts.scheduled}
            </span>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
              {tr('Maintenance', 'Maintenance')}: {vehicleAvailabilitySummary.maintenance}
            </span>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              {tr('Collected', 'Encaissé')}: {footerSummaryCollected.toFixed(0)} MAD
            </span>
            <span className="ml-auto text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              {tr('Business Day: 10:00 → 03:00', 'Journée: 10:00 → 03:00')}
            </span>
          </div>
        </div>

        {/* Mobile Floating Action Button */}
        <button
          onClick={() => setShowStepperForm(true)}
          className="sm:hidden fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-[1.6rem] border border-violet-500/80 bg-gradient-to-r from-violet-600 via-violet-600 to-indigo-700 px-5 py-4 text-white shadow-[0_18px_36px_rgba(79,70,229,0.28)] transition-all duration-200 hover:scale-[1.01] hover:from-violet-700 hover:to-indigo-800 active:scale-[0.99]"
          aria-label={isFrench ? 'Créer une location' : 'Create New Rental'}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/16 ring-1 ring-white/20">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">{isFrench ? 'Créer une location' : 'Create New Rental'}</span>
        </button>

        <div className="mb-4 rounded-2xl border border-violet-100/70 bg-white p-3 shadow-[0_12px_32px_rgba(76,29,149,0.06)]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
            <input
              type="text"
              placeholder={isFrench ? 'Rechercher par ID, nom, téléphone, email, plaque...' : 'Search by ID, name, phone, email, plate...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-violet-100 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xl text-slate-400 hover:text-slate-600"
                title={isFrench ? 'Effacer la recherche' : 'Clear search'}
              >
                ✕
              </button>
            )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-2xl border border-violet-100/80 bg-gradient-to-r from-white via-slate-50 to-violet-50/70 p-1 shadow-[0_12px_28px_rgba(76,29,149,0.08)]">
                {isMobileViewport ? (
                  <>
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode !== 'grid'
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]'
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Grande carte' : 'Large Card View'}
                    >
                      <RectangleHorizontal className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode === 'grid'
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]'
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Vue compacte' : 'Compact Card View'}
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode === 'list' 
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]' 
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Vue liste' : 'List View'}
                    >
                      <List className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode === 'grid' 
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]' 
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Vue grille compacte' : 'Compact Grid View'}
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </>
                )}
                </div>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50"
                >
                  <span>{isFrench ? 'Plus' : 'More'}</span>
                </button>
              </div>
            </div>

            <div className="mt-4">
              {renderDateFocusControls()}
            </div>

            <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
              {[
                ['all', isFrench ? 'Tous' : 'All'],
                ['active', isFrench ? 'Actives' : 'Active'],
                ['scheduled', isFrench ? 'Planifiées' : 'Scheduled'],
                ['completed', isFrench ? 'Terminées' : 'Completed'],
                ['no_show_review', isFrench ? 'Absence' : 'No-show'],
                ['cancelled', isFrench ? 'Annulées' : 'Cancelled'],
                ['maintenance', isFrench ? 'Maintenance' : 'Maintenance'],
                ['impounded', isFrench ? 'Fourrière' : 'Impounded'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    statusFilter === key
                      ? 'border-violet-500 bg-violet-600 text-white shadow-[0_10px_18px_rgba(79,70,229,0.18)]'
                      : 'border-violet-100 bg-white text-slate-600 hover:border-violet-200 hover:text-slate-900'
                  }`}
                >
                  {label}
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                    statusFilter === key ? 'bg-white/15 text-white' : 'bg-violet-50 text-violet-600'
                  }`}>
                    {statusTabCounts[key] || 0}
                  </span>
                </button>
              ))}
            </div>

            <div className={`${showFilters ? 'flex' : 'hidden'} flex-col gap-3 sm:flex-row`}>
              <div className="flex-1">
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => handleFilterChange(setPaymentStatusFilter, 'paymentStatus', e.target.value)}
                  className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                <option value="all">{isFrench ? 'Tous les paiements' : 'All Payment Statuses'}</option>
                <option value="unpaid">{isFrench ? 'Impayé' : 'Unpaid'}</option>
                <option value="partial">{isFrench ? 'Partiel' : 'Partial'}</option>
                <option value="paid">{isFrench ? 'Payé' : 'Paid'}</option>
                <option value="overdue">{isFrench ? 'En retard' : 'Overdue'}</option>
                </select>
              </div>
              <div className="flex-1">
                <select
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(setStatusFilter, 'status', e.target.value)}
                  className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="all">{isFrench ? 'Tous les statuts' : 'All Status'}</option>
                  <option value="active">{isFrench ? 'Actif' : 'Active'}</option>
                  <option value="scheduled">{isFrench ? 'Planifié' : 'Scheduled'}</option>
                  <option value="completed">{isFrench ? 'Terminé' : 'Completed'}</option>
                  <option value="no_show_review">{isFrench ? 'Contrôle absence' : 'No-show review'}</option>
                  <option value="cancelled">{isFrench ? 'Annulé' : 'Cancelled'}</option>
                  <option value="maintenance">{isFrench ? 'Maintenance' : 'Maintenance'}</option>
                  <option value="impounded">{isFrench ? 'Mis en fourrière' : 'Impounded'}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {!isMobileViewport && viewMode === 'list' ? (
          // LIST VIEW (Original Table)
          <div className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            {filteredRentals.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 mb-2">
                  {rentals.length === 0
                    ? (workspaceTab === 'upcoming'
                        ? (isFrench ? 'Aucune location à venir trouvée' : 'No upcoming rentals found')
                        : workspaceTab === 'past'
                          ? (isFrench ? 'Aucun historique trouvé' : 'No past rentals found')
                          : (isFrench ? 'Aucune location du jour trouvée' : 'No rentals found for today'))
                    : (workspaceTab === 'upcoming'
                        ? (isFrench ? 'Aucune location à venir ne correspond à vos filtres' : 'No upcoming rentals match your filters')
                        : workspaceTab === 'past'
                          ? (isFrench ? "Aucun historique ne correspond à vos filtres" : 'No past rentals match your filters')
                          : (isFrench ? "Aucune location du jour ne correspond à vos filtres" : 'No today rentals match your filters'))}
                </p>
                {hasActiveUiFilters && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setDateFocusFilter(getDefaultDateFocusForWorkspace(workspaceTab));
                      setCurrentPage(1);
                      navigate('/admin/rentals', { replace: true });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-700 hover:shadow-[0_18px_34px_rgba(79,70,229,0.24)]"
                  >
                    <XCircle className="h-4 w-4" />
                    {isFrench ? 'Effacer les filtres' : 'Clear filters'}
                  </button>
                )}
                {rentals.length === 0 && !searchTerm && statusFilter === 'all' && paymentStatusFilter === 'all' && dateFocusFilter === getDefaultDateFocusForWorkspace(workspaceTab) && (
                  <button
                    onClick={() => setShowStepperForm(true)}
                    className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(124,58,237,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-700 hover:shadow-[0_18px_42px_rgba(124,58,237,0.28)]"
                  >
                    {isFrench ? 'Créer la première location' : 'Create First Rental'}
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'ID location' : 'Rental ID'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Client' : 'Customer'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Véhicule' : 'Vehicle'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Plaque' : 'Plate Number'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Période de location' : 'Rental Period'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Statut' : 'Status'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Statut de paiement' : 'Payment Status'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Montant' : 'Amount'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Actions' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRentals.map((rental) => {
                      const effectiveRentalStatus = getEffectiveRentalStatus(rental);
                      const canStartContract = isPaymentSufficientForStart(rental);
                      const isImmutable = effectiveRentalStatus === 'active' || effectiveRentalStatus === 'completed';
                      const rentalAttention = getRentalAttentionState(rental);
                      const showLateArrivalRecovery = shouldShowLateArrivalRecovery(rental, effectiveRentalStatus);
                      const vehicleDisplay = resolveRentalVehicleDisplay(rental);
                      
                      return (
                        <tr 
                          key={rental.id} 
                          className={`cursor-pointer transition-colors ${
                          effectiveRentalStatus === 'active' ? 'bg-green-50 hover:bg-green-100' :
                          effectiveRentalStatus === 'impounded' ? 'bg-amber-50 hover:bg-amber-100' :
                          effectiveRentalStatus === 'scheduled' ? 'bg-blue-50 hover:bg-blue-100' :
                          effectiveRentalStatus === 'no_show_review' ? 'bg-amber-50 hover:bg-amber-100' :
                          effectiveRentalStatus === 'completed' ? 'bg-gray-50 hover:bg-gray-100' :
                          effectiveRentalStatus === 'cancelled' ? 'bg-red-50 hover:bg-red-100' :
                          effectiveRentalStatus === 'expired' ? 'bg-yellow-50 hover:bg-yellow-100' :
                          'bg-yellow-50 hover:bg-yellow-100'
                        }`}
                          onClick={() => handleViewRental(rental)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewRental(rental);
                              }}
                              className="text-blue-600 hover:text-blue-900 hover:underline font-mono font-medium"
                              title={isFrench ? 'Ouvrir les détails de la location' : 'Click to view rental details'}
                            >
                              {formatRentalId(rental)}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {rental.customer_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {rental.customer_email}
                              </div>
                              {getBookingSourceBadge(rental) && (
                                <div className="mt-2">
                                  {getBookingSourceBadge(rental)}
                                </div>
                              )}
                              {isNoShowCancellation(rental) && (
                                <div className="mt-2">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                                    ⚠️ {tr('No-show', 'Absence')}
                                  </span>
                                </div>
                              )}
                              <div className="mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewCustomerDetails(rental);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-900 hover:underline font-medium"
                                  title={tr('View customer details', 'Voir les détails du client')}
                                >
                                  {tr('View Customer Details', 'Voir les détails du client')}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 shadow-sm">
                              <span className="font-mono text-sm font-extrabold tracking-wide text-slate-900">
                                {formatPlateNumber(vehicleDisplay.plateNumber)}
                              </span>
                            </div>
                            <div className="mt-2 text-sm font-medium text-gray-900">
                              {formatVehicleName(vehicleDisplay)}
                            </div>
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              {vehicleDisplay.vehicleType || 'Vehicle'}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {getRentalTypeBadge(rental.rental_type)}
                              {getDurationBadge(rental)}
                              {getExtensionBadge(rental)}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {rental.vehicle_id}
                            </div>
                            <div className="mt-2 max-w-[240px]">
                              {renderFuelProgressBar(rental)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono font-bold tracking-wide text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg inline-block">
                              {formatPlateNumber(vehicleDisplay.plateNumber)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatSmartDate(rental, false)}
                            </div>
                            <RentalTimeIndicator rental={rental} attention={rentalAttention} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(effectiveRentalStatus)}
                              {rental?.is_impounded && effectiveRentalStatus !== 'impounded' && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-amber-100 text-amber-800">
                                  🚨 Impounded
                                </span>
                              )}
                              {rentalAttention && (
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${rentalAttention.className}`}>
                                  {rentalAttention.text}
                                </span>
                              )}
                              {rental.rental_status === 'completed' && rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                                <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                                  🔒 Deposit Pending
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(() => {
                              const paymentSnapshot = getRentalFinancialSnapshot(rental);
                              return (
                                <span className={paymentSnapshot.className}>
                                  {paymentSnapshot.status}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
  <div className="flex items-center gap-2">
    {(() => {
      const paymentSnapshot = getRentalFinancialSnapshot(rental);
      return rental.pending_total_request ? (
        <>
          <span className="text-yellow-600 font-semibold">{rental.pending_total_request} MAD</span>
          <span className="text-xs text-gray-400 line-through">{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
        </>
      ) : (
        <span>{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
      );
    })()}
    
    {/* Only show pending badge, remove approved/declined badges from here */}
    {rental.approval_status === 'pending' && rental.pending_total_request && (
      <span 
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-50 text-yellow-700 border border-yellow-300"
        title={`Pending approval for ${rental.pending_total_request} MAD`}
      >
        <Clock className="w-3 h-3" />
        Pending
      </span>
    )}
  </div>
</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewRental(rental);
                                }}
                                className="text-indigo-600 hover:text-indigo-900"
                                title="View rental details"
                              >
                                View
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingRental(rental);
                                  setShowStepperForm(true);
                                }}
                                className={`text-blue-600 hover:text-blue-900 ${isImmutable || !canEditRentalContract(user) ? 'text-gray-400 cursor-not-allowed opacity-50' : ''}`}
                                title={
                                  !canEditRentalContract(user)
                                    ? "No permission to edit contract"
                                    : isImmutable
                                      ? "Cannot edit active or completed rentals"
                                      : "Edit rental"
                                }
                                disabled={isImmutable || !canEditRentalContract(user)}
                              >
                                Edit
                              </button>
                              
                              {/* Admin Approval Button for Pending Price Overrides */}
{rental.rental_status === 'scheduled' && rental.approval_status === 'pending' && rental.pending_total_request && user?.role === 'owner' && (
  <div className="flex gap-1">
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`Approve manual price of ${rental.pending_total_request} MAD for this rental?`)) {
          try {
            const newPrice = parseFloat(rental.pending_total_request);
            
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
                total_amount: newPrice,
                remaining_amount: Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0)),
                approval_status: 'approved',
                pending_total_request: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (updateError) throw updateError;
            
            alert(`✅ Price override approved! New total: ${newPrice} MAD`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error approving price:', err);
            alert(`Failed to approve price: ${err.message}`);
          }
        }
      }}
      className="px-2 py-1 text-xs font-medium border rounded-md transition-colors text-green-600 hover:text-white hover:bg-green-600 border-green-600 bg-green-50"
      title="Approve pending price override"
    >
      ✓ {rental.pending_total_request} MAD
    </button>
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`Decline price override of ${rental.pending_total_request} MAD?`)) {
          try {
            const autoCalculatedPrice = await recalculateAutoRentalPrice(rental);

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
            
            alert(`❌ Price override declined.`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error declining price:', err);
            alert(`Failed to decline price: ${err.message}`);
          }
        }
      }}
      className="px-2 py-1 text-xs font-medium border rounded-md transition-colors text-red-600 hover:text-white hover:bg-red-600 border-red-600 bg-red-50"
      title="Decline pending price override"
    >
      ✗ Decline
    </button>
  </div>
)}

{/* Regular Start Button for non-pending rentals */}
{effectiveRentalStatus === 'scheduled' && !rental.pending_total_request && canStartFromList(rental) && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleStartRentalFromList(rental);
    }}
    className="text-green-600 hover:text-green-900 cursor-pointer"
    title="Click to start rental and activate timer"
  >
    Start
  </button>
)}
<button
  onClick={(e) => handleContactCustomerWhatsApp(rental, e)}
  className={`inline-flex items-center gap-1 ${canUseWhatsAppTools ? 'text-emerald-600 hover:text-emerald-900' : 'text-slate-500 hover:text-slate-700'}`}
  title={canUseWhatsAppTools
    ? tr('Contact customer on WhatsApp', 'Contacter le client sur WhatsApp')
    : tr('WhatsApp tools are available on Growth and Pro', 'Les outils WhatsApp sont disponibles sur Growth et Pro')}
>
  {canUseWhatsAppTools ? <MessageCircle className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
  <span>{tr('WhatsApp', 'WhatsApp')}</span>
</button>
{showLateArrivalRecovery && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleCustomerArrived(rental);
    }}
    className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900"
    title={tr('Customer arrived and should continue through normal start flow', 'Le client est arrivé et doit reprendre le démarrage normal')}
  >
    <CheckCircle className="h-4 w-4" />
    <span>{tr('Arrived', 'Arrivé')}</span>
  </button>
)}
{showLateArrivalRecovery && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleCancelAsNoShow(rental);
    }}
    className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900"
    title={tr('Cancel this missed booking as a no-show', 'Annuler cette réservation manquée comme absence')}
  >
    <XCircle className="h-4 w-4" />
    <span>{tr('No-show', 'Absence')}</span>
  </button>
)}
{effectiveRentalStatus === 'scheduled' && !rental.pending_total_request && !canStartFromList(rental) && (
  <button
    onClick={(e) => handleOpenRentalFromAction(e, rental)}
    className="text-gray-400 cursor-not-allowed opacity-50"
    title={`Complete requirements: ${[
      getRentalFinancialSnapshot(rental).status !== 'PAID' ? 'Payment' : '',
      (!rental.signature_url && !rental.contract_signed) ? 'Contract signature' : '',
      !rental.opening_video_url ? 'Opening video' : '',
      !rental.start_odometer ? 'Odometer reading' : '',
      (rental.rental_type === 'daily' && rental.start_fuel_level === null) ? 'Fuel level' : ''
    ].filter(Boolean).join(', ')}`}
    disabled
  >
    Start
  </button>
)}
                              
                              {effectiveRentalStatus === 'active' && (
                    <button
                                onClick={(e) => handleOpenRentalFromAction(e, rental)}
                                className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-600 rounded-md transition-colors"
                                title="Go to rental details to close"
                              >
                                Close
                              </button>
                  )}
                              
                              {canDelete() && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRental(rental.id);
                                  }}
                                  className={`text-red-600 hover:text-red-900 ${isImmutable ? 'text-gray-400 cursor-not-allowed opacity-50' : ''}`}
                                  title={isImmutable ? "Cannot delete active or completed rentals" : "Delete rental"}
                                  disabled={isImmutable}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          // COMPACT GRID VIEW - New professional mobile-optimized view
          <div className="overflow-hidden">
            {filteredRentals.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 mb-2">
                  {rentals.length === 0
                    ? (workspaceTab === 'upcoming'
                        ? 'No upcoming rentals found'
                        : workspaceTab === 'past'
                          ? 'No past rentals found'
                          : 'No rentals found for today')
                    : (workspaceTab === 'upcoming'
                        ? 'No upcoming rentals match your filters'
                        : workspaceTab === 'past'
                          ? 'No past rentals match your filters'
                          : 'No today rentals match your filters')}
                </p>
                {hasActiveUiFilters && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setDateFocusFilter(getDefaultDateFocusForWorkspace(workspaceTab));
                      setCurrentPage(1);
                      navigate('/admin/rentals', { replace: true });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-700 hover:shadow-[0_18px_34px_rgba(79,70,229,0.24)]"
                  >
                    <XCircle className="h-4 w-4" />
                    {tr('Clear filters', 'Effacer les filtres')}
                  </button>
                )}
                {rentals.length === 0 && !searchTerm && statusFilter === 'all' && paymentStatusFilter === 'all' && dateFocusFilter === 'all' && (
                  <button
                    onClick={() => setShowStepperForm(true)}
                    className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(124,58,237,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-700 hover:shadow-[0_18px_42px_rgba(124,58,237,0.28)]"
                  >
                    {tr('Create First Rental', 'Créer la première location')}
                  </button>
                )}
              </div>
            ) : (
              <div className={`grid gap-4 p-4 ${
                isMobileViewport && viewMode === 'grid'
                  ? 'grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}>
                {filteredRentals.map((rental) => {
                  const effectiveRentalStatus = getEffectiveRentalStatus(rental);
                  const canStartContract = isPaymentSufficientForStart(rental);
                  const isImmutable = effectiveRentalStatus === 'active' || effectiveRentalStatus === 'completed';
                  const rentalAttention = getRentalAttentionState(rental);
                  const showLateArrivalRecovery = shouldShowLateArrivalRecovery(rental, effectiveRentalStatus);
                  const isCompactMobileCard = isMobileViewport && viewMode === 'grid';
                  const vehicleDisplay = resolveRentalVehicleDisplay(rental);
                  const hasSupplementalHeaderBadge =
                    Boolean(rental?.is_impounded && effectiveRentalStatus !== 'impounded') ||
                    Boolean(isNoShowCancellation(rental)) ||
                    Boolean(rentalAttention) ||
                    Boolean(rental.rental_status === 'completed' && rental.damage_deposit > 0 && !rental.deposit_returned_at);
                  const stackCompactHeader =
                    isCompactMobileCard &&
                    (
                      effectiveRentalStatus === 'no_show_review' ||
                      hasSupplementalHeaderBadge
                    );
                  const paymentSnapshot = getRentalFinancialSnapshot(rental);
                  const paymentLabel = {
                    PAID: tr('PAID', 'PAYÉE'),
                    PARTIAL: tr('PARTIAL', 'PARTIEL'),
                    UNPAID: tr('UNPAID', 'IMPAYÉE'),
                    OVERDUE: tr('OVERDUE', 'EN RETARD'),
                    REFUNDED: tr('REFUNDED', 'REMBOURSÉE'),
                  }[paymentSnapshot.status] || paymentSnapshot.status;
                  
                  return (
                    <div 
                      key={rental.id} 
                      className="cursor-pointer"
                      onClick={() => handleViewRental(rental)}
                    >
                      <div className={`${isCompactMobileCard ? 'min-h-[238px] rounded-[1.35rem] p-3' : 'min-h-[250px] rounded-xl p-3.5'} flex flex-col border bg-white transition-all hover:-translate-y-0.5 ${
                          effectiveRentalStatus === 'active'
                            ? 'border-emerald-200 shadow-[0_18px_45px_rgba(16,185,129,0.12)] hover:border-emerald-300 hover:shadow-[0_20px_50px_rgba(16,185,129,0.16)]'
                            : effectiveRentalStatus === 'impounded'
                              ? 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.12)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.16)]'
                            : effectiveRentalStatus === 'scheduled'
                              ? 'border-blue-200 shadow-[0_18px_45px_rgba(59,130,246,0.12)] hover:border-blue-300 hover:shadow-[0_20px_50px_rgba(59,130,246,0.16)]'
                              : effectiveRentalStatus === 'no_show_review'
                                ? 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.12)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.16)]'
                              : effectiveRentalStatus === 'completed'
                                ? 'border-slate-200 shadow-[0_18px_45px_rgba(100,116,139,0.10)] hover:border-slate-300 hover:shadow-[0_20px_50px_rgba(100,116,139,0.14)]'
                                : effectiveRentalStatus === 'cancelled'
                                  ? 'border-rose-200 shadow-[0_18px_45px_rgba(244,63,94,0.10)] hover:border-rose-300 hover:shadow-[0_20px_50px_rgba(244,63,94,0.14)]'
                                  : effectiveRentalStatus === 'expired'
                                    ? 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.10)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]'
                                  : 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.10)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]'
                        }`}>
                        {/* Compact Header */}
                        <div className={`mb-${isCompactMobileCard ? '2' : '2.5'} flex gap-2 border-b pb-${isCompactMobileCard ? '2' : '2.5'} ${
                          stackCompactHeader ? 'flex-col items-start' : 'items-start justify-between'
                        } ${
                          effectiveRentalStatus === 'active' ? 'border-emerald-100' :
                          effectiveRentalStatus === 'impounded' ? 'border-amber-100' :
                          effectiveRentalStatus === 'scheduled' ? 'border-blue-100' :
                          effectiveRentalStatus === 'no_show_review' ? 'border-amber-100' :
                          effectiveRentalStatus === 'completed' ? 'border-slate-100' :
                          effectiveRentalStatus === 'cancelled' ? 'border-rose-100' :
                          effectiveRentalStatus === 'expired' ? 'border-amber-100' :
                          'border-amber-100'
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRental(rental);
                            }}
                            className={`min-w-0 text-left font-mono font-bold text-violet-600 transition-colors hover:text-violet-800 ${
                              stackCompactHeader
                                ? 'w-full text-[11px] leading-tight break-all'
                                : isCompactMobileCard
                                  ? 'flex-1 text-[11px] leading-tight'
                                  : 'flex-1 text-xs break-all'
                            }`}
                            title={formatRentalId(rental)}
                          >
                            {formatRentalId(rental)}
                          </button>
                          <div className={`${stackCompactHeader ? 'self-start items-start' : 'ml-auto items-end'} flex shrink-0 flex-col gap-1`}>
                            {getStatusBadge(effectiveRentalStatus)}
                            {rental?.is_impounded && effectiveRentalStatus !== 'impounded' && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                                🚨 {tr('Impounded', 'Mis en fourrière')}
                              </span>
                            )}
                            {isNoShowCancellation(rental) && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                                ⚠️ {tr('No-show', 'Absence')}
                              </span>
                            )}
                            {rentalAttention && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${rentalAttention.className}`}>
                                {rentalAttention.text}
                              </span>
                            )}
                            {rental.rental_status === 'completed' && rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                              <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                                🔒 {tr('Deposit Pending', 'Caution en attente')}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Rental Type and Duration Badges */}
                        <div className={`mb-${isCompactMobileCard ? '2' : '2.5'} flex flex-wrap items-center gap-1.5`}>
                          {getRentalTypeBadge(rental.rental_type)}
                          {getDurationBadge(rental)}
                          {getExtensionBadge(rental)}
                          {getBookingSourceBadge(rental)}
                        </div>

                        {/* Compact Info Grid */}
                        <div className={`${isCompactMobileCard ? 'space-y-1.5' : 'space-y-2'} text-xs`}>
                          {/* Customer */}
                          <div className="flex items-start gap-2">
                            <span className={`text-gray-500 font-semibold ${isCompactMobileCard ? 'min-w-[14px] text-[11px]' : 'min-w-[50px]'}`}>👤</span>
                            <div className="flex-1 min-w-0">
                              <div className={`${isCompactMobileCard ? 'line-clamp-2 text-[12px] leading-4' : 'truncate text-sm'} font-semibold text-slate-900`}>{rental.customer_name}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewCustomerDetails(rental);
                                }}
                                className={`${isCompactMobileCard ? 'text-[9px]' : 'text-[10px]'} font-medium text-violet-600 underline hover:text-violet-800`}
                              >
                                {tr('Details', 'Détails')}
                              </button>
                            </div>
                          </div>

                          {/* Vehicle & Plate */}
                          <div className="flex items-start gap-2">
                            <span className={`text-gray-500 font-semibold ${isCompactMobileCard ? 'min-w-[14px] text-[11px]' : 'min-w-[50px]'}`}>🚗</span>
                            <div className="flex-1 min-w-0">
                              <div className={`inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 shadow-sm ${isCompactMobileCard ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}>
                                <span className={`font-mono font-extrabold tracking-wide text-slate-900 ${isCompactMobileCard ? 'text-[12px]' : 'text-sm'}`}>
                                  {formatPlateNumber(vehicleDisplay.plateNumber)}
                                </span>
                              </div>
                              <div className={`mt-1 ${isCompactMobileCard ? 'line-clamp-2 text-[12px] leading-4' : 'truncate text-sm'} font-semibold text-slate-900`}>{formatVehicleName(vehicleDisplay)}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full bg-slate-100 font-semibold uppercase tracking-[0.14em] text-slate-700 ${isCompactMobileCard ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                                  {vehicleDisplay.model || tr('N/A', 'N/D')}
                                </span>
                                <span className={`${isCompactMobileCard ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-[0.18em] text-slate-500`}>
                                  {vehicleDisplay.vehicleType || tr('Vehicle', 'Véhicule')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="flex items-start gap-2">
                            <span className={`text-gray-500 font-semibold ${isCompactMobileCard ? 'min-w-[14px] text-[11px]' : 'min-w-[50px]'}`}>📅</span>
                            <div className="flex-1 min-w-0">
                              <div className={`${isCompactMobileCard ? 'text-[11px] leading-4' : 'text-xs'} font-medium text-slate-900`}>
                                {formatSmartDate(rental, true)}
                              </div>
                              <RentalTimeIndicator rental={rental} compact attention={rentalAttention} />
                            </div>
                          </div>

                          {renderFuelProgressBar(rental, true)}

                          <div className={`grid gap-2 rounded-xl border border-slate-100 bg-slate-50/90 ${isCompactMobileCard ? 'mt-1 grid-cols-2 p-2' : 'mt-2 grid-cols-3 p-2.5'}`}>
                            <div className={isCompactMobileCard ? 'min-w-0' : ''}>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {tr('Paid', 'Payé')}
                              </div>
                              <div className={`${isCompactMobileCard ? 'text-[12px]' : 'text-sm'} font-bold text-emerald-700`}>
                                {paymentSnapshot.amountPaid.toFixed(0)} MAD
                              </div>
                            </div>
                            <div className={`min-w-0 ${isCompactMobileCard ? 'text-right' : 'text-right'}`}>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {tr('Remaining', 'Restant')}
                              </div>
                              <div className={`${isCompactMobileCard ? 'text-[12px]' : 'text-sm'} font-bold ${paymentSnapshot.balanceDue > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                {paymentSnapshot.balanceDue.toFixed(0)} MAD
                              </div>
                            </div>
                            <div className={`min-w-0 ${isCompactMobileCard ? 'col-span-2 border-t border-slate-200 pt-2 text-left' : 'text-right'}`}>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {tr('Total', 'Total')}
                              </div>
                              <div className={`${isCompactMobileCard ? 'text-[12px]' : 'text-sm'} font-bold text-slate-900`}>
                                {paymentSnapshot.grandTotal.toFixed(0)} MAD
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className={`${paymentSnapshot.className} ${isCompactMobileCard ? 'text-[10px]' : ''}`}>
                              {paymentLabel}
                            </span>
                            <div className={`${isCompactMobileCard ? 'text-[10px]' : 'text-xs'} font-medium text-slate-500 whitespace-nowrap`}>
                              {rental.pending_total_request ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-yellow-600">{tr('Requested', 'Demandé')} {rental.pending_total_request} MAD</span>
                                    <span className="text-[8px] text-gray-400 line-through">{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
                                  </div>
                                ) : (
                                  <span>{tr('Payment status', 'Statut paiement')}</span>
                                )}
                            </div>
                          </div>

{/* Only show pending badge here, remove approved/declined badges */}
{rental.approval_status === 'pending' && rental.pending_total_request && (
  <div className="flex items-center gap-1 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
    <Clock className="w-3 h-3" />
    <span>{tr('Pending approval for', 'En attente de validation pour')} {rental.pending_total_request} MAD</span>
  </div>
)}

{/* Approved and declined badges removed from here - they are now shown in actions */}
                        </div>

                        {/* Compact Actions */}
                        {!isCompactMobileCard && (
                        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                          
                          {/* Admin Approval Button for Pending Price Overrides */}
{effectiveRentalStatus === 'scheduled' && rental.approval_status === 'pending' && rental.pending_total_request && user?.role === 'owner' && (
  <div className="flex gap-1 w-full">
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`${tr('Approve manual price of', 'Approuver le prix manuel de')} ${rental.pending_total_request} MAD ${tr('for this rental?', 'pour cette location ?')}`)) {
          try {
            const newPrice = parseFloat(rental.pending_total_request);
            
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
                total_amount: newPrice,
                remaining_amount: Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0)),
                approval_status: 'approved',
                pending_total_request: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (updateError) throw updateError;
            
            alert(`✅ ${tr('Price override approved! New total:', 'Modification de prix approuvée ! Nouveau total :')} ${newPrice} MAD`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error approving price:', err);
            alert(`${tr('Failed to approve price:', "Échec de l'approbation du prix :")} ${err.message}`);
          }
        }
      }}
      className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
      title={tr('Approve pending price override', 'Approuver la modification de prix en attente')}
    >
      ✓ {rental.pending_total_request} MAD
    </button>
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`${tr('Decline price override of', 'Refuser la modification de prix de')} ${rental.pending_total_request} MAD ?`)) {
          try {
            const autoCalculatedPrice = await recalculateAutoRentalPrice(rental);

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
            
            alert(`❌ ${tr('Price override declined.', 'Modification de prix refusée.')}`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error declining price:', err);
            alert(`${tr('Failed to decline price:', 'Échec du refus du prix :')} ${err.message}`);
          }
        }
      }}
      className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
      title={tr('Decline pending price override', 'Refuser la modification de prix en attente')}
    >
      ✗ {tr('Decline', 'Refuser')}
    </button>
  </div>
)}

{/* Show approved/declined badges for non-pending rentals */}
{effectiveRentalStatus === 'scheduled' && rental.approval_status === 'approved' && (
  <div className="flex w-full items-center justify-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
    <CheckCircle className="w-3 h-3" />
    <span>{tr('Approved', 'Approuvée')}</span>
  </div>
)}

{effectiveRentalStatus === 'scheduled' && rental.approval_status === 'declined' && (
  <div className="flex w-full items-center justify-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
    <XCircle className="w-3 h-3" />
    <span>{tr('Declined', 'Refusée')}</span>
  </div>
)}

{/* Regular Start Button for non-pending rentals */}
{effectiveRentalStatus === 'scheduled' && !rental.pending_total_request && !rental.approval_status && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      if (canStartFromList(rental)) {
        handleStartRentalFromList(rental);
      } else {
        handleViewRental(rental);
      }
    }}
    className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
      canStartFromList(rental)
        ? 'text-green-600 hover:text-white hover:bg-green-600 border-green-600'
        : 'text-gray-400 border-gray-300 cursor-not-allowed'
    }`}
    title={
      canStartFromList(rental)
        ? tr('Click to start rental', 'Cliquer pour démarrer la location')
        : tr('Complete all requirements first', "Complétez d'abord toutes les exigences")
    }
  >
    {tr('Start', 'Démarrer')}
  </button>
)}
{showLateArrivalRecovery && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleCustomerArrived(rental);
    }}
    className="w-full rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100"
    title={tr('Customer arrived and should continue through normal start flow', 'Le client est arrivé et doit reprendre le démarrage normal')}
  >
    {tr('Customer arrived', 'Client arrivé')}
  </button>
)}
{showLateArrivalRecovery && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleCancelAsNoShow(rental);
    }}
    className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
    title={tr('Cancel this missed booking as a no-show', 'Annuler cette réservation manquée comme absence')}
  >
    {tr('Cancel as no-show', 'Annuler comme absence')}
  </button>
)}
<button
  onClick={(e) => handleContactCustomerWhatsApp(rental, e)}
  className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
    canUseWhatsAppTools
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
  }`}
  title={canUseWhatsAppTools
    ? tr('Contact customer on WhatsApp', 'Contacter le client sur WhatsApp')
    : tr('WhatsApp tools are available on Growth and Pro', 'Les outils WhatsApp sont disponibles sur Growth et Pro')}
>
  {canUseWhatsAppTools ? <MessageCircle className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
  <span>{tr('WhatsApp', 'WhatsApp')}</span>
</button>
                          
                          {effectiveRentalStatus === 'active' && (
                    <button
                                onClick={(e) => handleOpenRentalFromAction(e, rental)}
                                className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-600 rounded-md transition-colors"
                                title={tr('Go to rental details to close', 'Aller aux détails de la location pour clôturer')}
                              >
                                {tr('Close', 'Clôturer')}
                              </button>
                  )}

                          <button
                            onClick={(e) => handleOpenRentalFromAction(e, rental)}
                            className="px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 border border-violet-200 rounded-lg transition-colors"
                            title={tr('Open quick actions and rental details', 'Ouvrir les actions rapides et les détails')}
                          >
                            {tr('Open', 'Ouvrir')}
                          </button>
                          
                          {canDelete() && !isImmutable && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRental(rental.id);
                              }}
                              className="flex-1 px-2 py-1 text-[10px] font-medium border rounded transition-colors text-red-600 hover:text-white hover:bg-red-600 border-red-600"
                            >
                              {tr('Delete', 'Supprimer')}
                            </button>
                          )}
                        </div>
                        )}

                        {isCompactMobileCard && (
                          <div className="mt-auto pt-2.5">
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {effectiveRentalStatus === 'active'
                                  ? tr('Action', 'Action')
                                  : tr('Open', 'Ouvrir')}
                              </span>
                              <span className={`text-[11px] font-semibold ${
                                effectiveRentalStatus === 'active'
                                  ? 'text-orange-600'
                                  : effectiveRentalStatus === 'scheduled'
                                    ? 'text-blue-600'
                                    : 'text-violet-600'
                              }`}>
                                {effectiveRentalStatus === 'active'
                                  ? tr('Close', 'Clôturer')
                                  : effectiveRentalStatus === 'scheduled'
                                    ? tr('View / Start', 'Voir / Démarrer')
                                    : tr('View Details', 'Voir détails')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pagination Controls */}
        {!isDateFocusScoped && totalCount > 0 && (
          <div className="mt-8 rounded-[1.75rem] border border-violet-100/80 bg-white p-4 shadow-[0_18px_40px_rgba(76,29,149,0.08)] sm:p-5">
            {/* Results info */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                {isFrench ? 'Affichage de ' : 'Showing '}<span className="font-semibold text-slate-900">{((currentPage - 1) * itemsPerPage) + 1}</span>{isFrench ? ' à ' : ' to '}{' '}
                <span className="font-semibold text-slate-900">
                  {Math.min(currentPage * itemsPerPage, totalCount)}
                </span>{' '}
                {isFrench ? 'sur ' : 'of '}<span className="font-semibold text-slate-900">{totalCount}</span>{isFrench ? ' résultats' : ' results'}
              </div>

              {/* Page navigation */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                    currentPage === 1
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  {isFrench ? 'Précédent' : 'Previous'}
                </button>

                <div className="flex items-center gap-1 rounded-2xl border border-violet-100 bg-violet-50/70 p-1">
                  {getPageNumbers().map((pageNum, index) => (
                    pageNum === '...' ? (
                      <span key={`dots-${index}`} className="px-2 text-sm font-semibold text-slate-400">...</span>
                    ) : (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`h-10 w-10 rounded-xl text-sm font-semibold transition-all ${
                          pageNum === currentPage
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-violet-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  ))}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                    currentPage === totalPages
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  {isFrench ? 'Suivant' : 'Next'}
                </button>

                <select
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  className="rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                >
                  <option value={10}>{isFrench ? '10 par page' : '10 per page'}</option>
                  <option value={25}>{isFrench ? '25 par page' : '25 per page'}</option>
                  <option value={50}>{isFrench ? '50 par page' : '50 per page'}</option>
                  <option value={100}>{isFrench ? '100 par page' : '100 per page'}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-100/80 bg-white px-3 py-3 shadow-[0_12px_28px_rgba(76,29,149,0.06)]">
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            {tr('Contracts', 'Contrats')}: {footerSummaryRentalCount}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {tr('Active', 'Actives')}: {footerSummaryRentals.filter(r => getEffectiveRentalStatus(r) === 'active').length}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            {tr('Scheduled', 'Planifiées')}: {footerSummaryRentals.filter(r => getEffectiveRentalStatus(r) === 'scheduled').length}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {tr('Completed', 'Terminées')}: {footerSummaryRentals.filter(r => getEffectiveRentalStatus(r) === 'completed').length}
          </span>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            {tr('Expired', 'Expirées')}: {footerSummaryRentals.filter(r => getEffectiveRentalStatus(r) === 'expired').length}
          </span>
          <span className="ml-auto rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            {tr('Collected', 'Encaissé')}: {footerSummaryCollected.toFixed(0)} MAD
          </span>
        </div>
      </div>

      {whatsAppSheetRental && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 backdrop-blur-[2px] sm:items-center" onClick={closeWhatsAppSheet}>
          <div
            className="w-full max-w-xl rounded-t-[2rem] border border-violet-100 bg-white p-5 shadow-[0_-18px_40px_rgba(76,29,149,0.18)] sm:rounded-[2rem] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  {tr('Choose message', 'Choisir un message')}
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">
                  {tr('WhatsApp customer', 'WhatsApp client')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {whatsAppSheetRental.customer_name} • {whatsAppSheetRental.rental_id}
                </p>
              </div>
              <button
                type="button"
                onClick={closeWhatsAppSheet}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={tr('Close message picker', 'Fermer le sélecteur de messages')}
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {canUseWhatsAppTools ? (
              <>
                <div className="mt-5 space-y-3">
                  {whatsAppTemplateOptions.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSendWhatsAppTemplate(whatsAppSheetRental, option.message)}
                      className={`w-full rounded-[1.4rem] border px-4 py-4 text-left transition ${
                        index === 0
                          ? 'border-violet-300 bg-violet-50 shadow-[0_10px_30px_rgba(124,58,237,0.12)]'
                          : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {option.label}
                            {index === 0 ? (
                              <span className="ml-2 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                                {tr('Suggested', 'Suggéré')}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">{option.preview}</p>
                          <p className="mt-2 line-clamp-2 text-xs text-slate-400">{option.message}</p>
                        </div>
                        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{tr('Custom message', 'Message personnalisé')}</p>
                  <textarea
                    value={whatsAppCustomMessage}
                    onChange={(event) => setWhatsAppCustomMessage(event.target.value)}
                    rows={3}
                    placeholder={tr('Write your own WhatsApp message…', 'Écrivez votre propre message WhatsApp…')}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppTemplate(whatsAppSheetRental, whatsAppCustomMessage.trim())}
                      disabled={!whatsAppCustomMessage.trim()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {tr('Send custom message', 'Envoyer le message personnalisé')}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-[1.6rem] border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-white/80 p-2 text-amber-700">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      {tr('WhatsApp tools are locked on this plan', 'Les outils WhatsApp sont verrouillés sur ce plan')}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      {tr(
                        'Upgrade this workspace to Growth or Pro to send customer WhatsApp messages directly from Rentals.',
                        'Passez ce workspace à Growth ou Pro pour envoyer des messages WhatsApp aux clients directement depuis les locations.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {videoContractModal.isOpen && (
        <VideoContractModal
          rental={videoContractModal.rental}
          type={videoContractModal.type}
          onClose={() => setVideoContractModal({ isOpen: false, rental: null, type: null })}
          onSuccess={handleVideoContractSuccess}
        />
      )}

      <ViewCustomerDetailsDrawer
        isOpen={customerDetailsDrawer.isOpen}
        onClose={() => setCustomerDetailsDrawer({ isOpen: false, customerId: null, rental: null, secondDrivers: [], viewMode: 'customer' })}
        customerId={customerDetailsDrawer.customerId}
        rental={customerDetailsDrawer.rental}
        secondDrivers={customerDetailsDrawer.secondDrivers}
        viewMode={customerDetailsDrawer.viewMode}
      />
    </div>
  );
};

export default Rentals;
