import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Car, Users, Wrench, DollarSign, TrendingUp, Clock, Plus, AlertTriangle, Bell, ChevronRight, Smartphone, MessageSquare, Calendar, Zap, Map as MapIcon, Droplets, Settings, Compass, ShieldAlert, ArrowRight, ArrowDownToLine, Activity, Fuel, WalletCards, ChevronDown, ClipboardList, RefreshCw, Download, FileText, Banknote, Landmark, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import AdminMobileStatsRow from '../../components/admin/AdminMobileStatsRow';
import AdminWorkspaceLoadingShell from '../../components/admin/AdminWorkspaceLoadingShell';
import { TABLE_NAMES } from '../../config/tableNames';
import { shortenUrl } from '../../services/UrlShortenerService';
import { getStaffDirectory } from '../../services/UserService';
import { getTaskStats } from '../../services/TaskService';
import { buildTourTrackingUrl } from '../../services/tourTrackingService';
import { uploadFile } from '../../utils/storageUpload';
import { normalizeAdminRecipients } from '../../utils/receiveFundsUi';
import { buildExpenseNote, loadExpenseLabelPresets, saveExpenseLabelPresets, uniqueLabels } from '../../utils/expenseLabels';
import PhotoCapture from '../../components/video/PhotoCapture';
import i18n from '../../i18n';
import { isBusinessOwnerAccountType, isPlatformAdminEmail, isPlatformOwnerEmail } from '../../utils/accountType';
import { canAccessOwnerBankMethods, canRecordReceiveFunds, canUseBankDepositMethod } from '../../utils/permissionHelpers';
import { receiveFundsService } from '../../services/receiveFundsService';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';

const TOUR_BOOKING_MARKER = '[tour_booking]';
const DASHBOARD_CACHE_TTL_MS = 15000;
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 700 });
  }

  return window.setTimeout(callback, 0);
};

const extractTourBookingMeta = (value) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(TOUR_BOOKING_MARKER);
  if (markerIndex === -1) return null;
  try {
    return JSON.parse(text.slice(markerIndex + TOUR_BOOKING_MARKER.length).trim());
  } catch {
    return null;
  }
};

const VEHICLE_TABLE_CANDIDATES = [
  'saharax_0u4w4d_vehicles',
  'vehicles',
];

let resolvedVehicleTableName = null;
let dashboardCoreCache = null;
let dashboardCoreCacheAt = 0;
let dashboardCorePromise = null;

const getVehicleTableName = async () => {
  if (resolvedVehicleTableName) {
    return resolvedVehicleTableName;
  }

  let bestMatch = null;

  for (const tableName of VEHICLE_TABLE_CANDIDATES) {
    const { count, error } = await supabase.from(tableName).select('id', { head: true, count: 'exact' }).limit(1);
    if (!error) {
      const rowCount = Number(count || 0);

      if (!bestMatch || rowCount > bestMatch.count) {
        bestMatch = { tableName, count: rowCount };
      }

      if (rowCount > 0 && tableName === 'saharax_0u4w4d_vehicles') {
        resolvedVehicleTableName = tableName;
        console.log('✅ Dashboard resolved populated live vehicle table:', tableName, rowCount);
        return tableName;
      }
    }
  }

  if (bestMatch) {
    resolvedVehicleTableName = bestMatch.tableName;
    console.log('✅ Dashboard resolved best vehicle table:', bestMatch.tableName, bestMatch.count);
    return bestMatch.tableName;
  }

  throw new Error(`Could not resolve a vehicle table from: ${VEHICLE_TABLE_CANDIDATES.join(', ')}`);
};

const fetchVehiclesByIds = async (vehicleIds = []) => {
  const uniqueIds = [...new Set(vehicleIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const vehicleTable = await getVehicleTableName();
  const { data, error } = await supabase
    .from(vehicleTable)
    .select('id, name, model, vehicle_type, plate_number')
    .in('id', uniqueIds);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((vehicle) => [vehicle.id, vehicle]));
};

const fetchDashboardTourRows = async (accessToken) => {
  if (!accessToken) {
    return [];
  }

  try {
    const response = await fetch('/api/tour-bookings', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : null;

    if (response.ok && Array.isArray(payload?.rows)) {
      return payload.rows;
    }

    console.warn('Dashboard direct API tour fetch returned unexpected response:', {
      status: response.status,
      payload,
    });
  } catch (error) {
    console.warn('Dashboard direct API tour fetch failed, falling back to direct table query:', error);
  }

  const { data, error } = await supabase
    .from('app_687f658e98_tour_bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (!error && Array.isArray(data)) {
    return data;
  }

  return [];
};

// Helper to format numbers (e.g., 1000 -> 1k)
const formatNumber = (num) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num;
};

const formatCurrency = (num = 0) => `${Number(num || 0).toLocaleString()} MAD`;
const todayInputKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getLocalDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDashboardDateTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return tr('Not scheduled', 'Non planifié');
  return date.toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getTourEndTimestamp = (tour) => {
  const start = new Date((tour?.status === 'active' && tour?.startedAt) || tour?.scheduledStartAt || '');
  if (Number.isNaN(start.getTime())) return Number.NaN;
  return start.getTime() + Number(tour?.durationHours || 1) * 60 * 60 * 1000;
};

const isDashboardTourExpired = (tour) => {
  if (String(tour?.status || '').toLowerCase() !== 'active') return false;
  const endTimestamp = getTourEndTimestamp(tour);
  if (Number.isNaN(endTimestamp)) return false;
  return Date.now() > endTimestamp;
};

const formatDashboardDuration = (durationMs) => {
  const safeMs = Math.max(0, Number(durationMs) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getDashboardTourElapsedTone = (tour, currentTime = Date.now()) => {
  const startedAtTime = new Date(tour?.startedAt || tour?.scheduledStartAt || '').getTime();
  const durationMs = Number(tour?.durationHours || 1) * 60 * 60 * 1000;

  if (!Number.isFinite(startedAtTime) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return {
      badgeClass: 'border border-slate-200 bg-slate-50 text-slate-700',
      labelClass: 'text-slate-500',
      expired: false,
    };
  }

  const elapsedMs = Math.max(0, currentTime - startedAtTime);
  const progress = elapsedMs / durationMs;

  if (progress >= 1) {
    return {
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: true,
    };
  }

  if (progress >= 0.75) {
    return {
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: false,
    };
  }

  if (progress >= 0.45) {
    return {
      badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
      labelClass: 'text-amber-500',
      expired: false,
    };
  }

  return {
    badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    labelClass: 'text-emerald-500',
    expired: false,
  };
};

const getDashboardRentalElapsedTone = (rental, currentTime = Date.now()) => {
  const startedAtTime = new Date(rental?.started_at || rental?.rental_start_date || '').getTime();
  const endAtTime = new Date(rental?.actual_end_time || rental?.actual_end_date || rental?.rental_end_date || '').getTime();
  const durationMs = endAtTime - startedAtTime;

  if (!Number.isFinite(startedAtTime) || !Number.isFinite(endAtTime) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return {
      badgeClass: 'border border-slate-200 bg-slate-50 text-slate-700',
      labelClass: 'text-slate-500',
      expired: false,
    };
  }

  const elapsedMs = Math.max(0, currentTime - startedAtTime);
  const progress = elapsedMs / durationMs;

  if (progress >= 1) {
    return {
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: true,
    };
  }

  if (progress >= 0.75) {
    return {
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: false,
    };
  }

  if (progress >= 0.45) {
    return {
      badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
      labelClass: 'text-amber-500',
      expired: false,
    };
  }

  return {
    badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    labelClass: 'text-emerald-500',
    expired: false,
  };
};

const calculateDashboardRentalTimer = (rental, currentTime = Date.now()) => {
  if (rental?.rental_status !== 'active') {
    return {
      text: 'N/A',
      label: tr('Inactive', 'Inactive'),
      color: 'slate',
      bgClass: 'bg-slate-50',
      textClass: 'text-slate-600',
      badgeClass: 'bg-slate-100 text-slate-800',
      isExpired: false,
      isDigital: false,
    };
  }

  const now = currentTime;
  const endDate = rental.actual_end_time ? new Date(rental.actual_end_time) : null;
  if (!endDate || Number.isNaN(endDate.getTime())) {
    return {
      text: 'N/A',
      label: tr('Timer unavailable', 'Minuteur indisponible'),
      color: 'slate',
      bgClass: 'bg-slate-50',
      textClass: 'text-slate-600',
      badgeClass: 'bg-slate-100 text-slate-800',
      isExpired: false,
      isDigital: false,
    };
  }

  const diffMs = endDate.getTime() - now;
  const isHourly = rental.rental_type === 'hourly';

  if (diffMs <= 0) {
      return {
        text: tr('Expired', 'Expiré'),
        label: tr('Expired', 'Expiré'),
        color: 'red',
        bgClass: 'bg-red-50',
        textClass: 'text-red-600',
        badgeClass: 'border border-red-200 bg-red-50 text-red-700',
        isExpired: true,
        isDigital: isHourly,
      };
  }

  if (isHourly) {
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (hours === 0 && minutes <= 30) {
      return {
        text: timeStr,
        label: tr('Ending now', 'Se termine maintenant'),
        color: 'red',
        bgClass: 'bg-red-50',
        textClass: 'text-red-600',
        badgeClass: 'border border-red-200 bg-red-50 text-red-700',
        isExpired: false,
        isDigital: true,
      };
    }

    if (hours <= 2) {
      return {
        text: timeStr,
        label: tr('Ending soon', 'Se termine bientôt'),
        color: 'orange',
        bgClass: 'bg-orange-50',
        textClass: 'text-orange-600',
        badgeClass: 'border border-orange-200 bg-orange-50 text-orange-700',
        isExpired: false,
        isDigital: true,
      };
    }

      return {
        text: timeStr,
        label: tr('On time', 'Dans les temps'),
        color: 'green',
        bgClass: 'bg-green-50',
        textClass: 'text-green-600',
        badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
        isExpired: false,
        isDigital: true,
      };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  if (diffDays > 0) {
    const text = diffDays === 1 ? tr('1 day', '1 jour') : tr(`${diffDays} days`, `${diffDays} jours`);
    const fullText = remainingHours > 0 ? `${text} ${remainingHours}h` : text;
    const endingSoon = diffDays <= 1;
    return {
      text: fullText,
      label: endingSoon ? tr('Ending soon', 'Se termine bientôt') : tr('On time', 'Dans les temps'),
      color: endingSoon ? 'orange' : 'green',
      bgClass: endingSoon ? 'bg-orange-50' : 'bg-green-50',
      textClass: endingSoon ? 'text-orange-600' : 'text-green-600',
      badgeClass: endingSoon ? 'border border-orange-200 bg-orange-50 text-orange-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      isExpired: false,
      isDigital: false,
    };
  }

  const danger = diffHours <= 3;
  return {
    text: tr(`${diffHours}h left`, `${diffHours}h restantes`),
    label: danger ? tr('Ending now', 'Se termine maintenant') : tr('Ending soon', 'Se termine bientôt'),
    color: danger ? 'red' : 'orange',
    bgClass: danger ? 'bg-red-50' : 'bg-orange-50',
    textClass: danger ? 'text-red-600' : 'text-orange-600',
    badgeClass: danger ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-orange-200 bg-orange-50 text-orange-700',
    isExpired: false,
    isDigital: false,
  };
};

const buildWhatsAppReminderMessage = (rental) => {
  const now = new Date();
  const actualEndTime = rental.actual_end_time ? new Date(rental.actual_end_time) : new Date(rental.rental_end_date);
  const isOverdue = actualEndTime < now;

  const diffMs = Math.abs(now - actualEndTime);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const totalAmount = rental.total_amount || 0;
  const depositPaid = rental.deposit_amount || 0;
  const balanceDue = totalAmount - depositPaid;
  const hasBalanceDue = balanceDue > 0;

  let timeStr = '';
  if (diffHours > 0) {
    timeStr += diffHours > 1
      ? tr(`${diffHours} hours`, `${diffHours} heures`)
      : tr(`${diffHours} hour`, `${diffHours} heure`);
    if (diffMinutes > 0) {
      timeStr += diffMinutes > 1
        ? tr(` and ${diffMinutes} minutes`, ` et ${diffMinutes} minutes`)
        : tr(` and ${diffMinutes} minute`, ` et ${diffMinutes} minute`);
    }
  } else {
    timeStr += diffMinutes > 1
      ? tr(`${diffMinutes} minutes`, `${diffMinutes} minutes`)
      : tr(`${diffMinutes} minute`, `${diffMinutes} minute`);
  }

  let message = '';

  if (isOverdue) {
    message = `${tr('Hello', 'Bonjour')} *${rental.customer_name}*,\n\n`;
    message += `*${tr('URGENT: Your rental is OVERDUE!', 'URGENT : votre location est en retard !')}*\n\n`;
    message += `${tr('Vehicle', 'Véhicule')} : ${rental.vehicle?.model || rental.vehicle?.name || 'N/A'}\n`;
    message += `${tr('Plate', 'Plaque')} : ${rental.vehicle?.plate_number || 'N/A'}\n`;
    message += `${tr('Overdue by', 'Retard de')} : *${timeStr}*\n\n`;

    if (hasBalanceDue) {
      message += `*${tr('Payment Status', 'Statut de paiement')} :* ${tr('Balance due of', 'Solde dû de')} *${balanceDue.toFixed(2)} MAD*\n\n`;
    }

    message += `${tr('Please return the vehicle immediately. Late fees may apply.', 'Veuillez retourner le véhicule immédiatement. Des frais de retard peuvent s’appliquer.')}\n`;
    message += tr('Thank you for choosing our service!', 'Merci d’avoir choisi notre service !');
  } else {
    message = `${tr('Hello', 'Bonjour')} *${rental.customer_name}*,\n\n`;
    message += `*${tr('REMINDER: Your rental is expiring soon!', 'RAPPEL : votre location expire bientôt !')}*\n\n`;
    message += `${tr('Vehicle', 'Véhicule')} : ${rental.vehicle?.model || rental.vehicle?.name || 'N/A'}\n`;
    message += `${tr('Plate', 'Plaque')} : ${rental.vehicle?.plate_number || 'N/A'}\n`;
    message += `${tr('Time remaining', 'Temps restant')} : *${timeStr}*\n\n`;

    if (hasBalanceDue) {
      message += `*${tr('Payment Status', 'Statut de paiement')} :* ${tr('Balance due of', 'Solde dû de')} *${balanceDue.toFixed(2)} MAD*\n`;
      message += `${tr('Please settle payment to avoid late fees.', 'Veuillez régler le paiement pour éviter des frais de retard.')}\n\n`;
    }

    message += tr('Thank you for choosing our service!', 'Merci d’avoir choisi notre service !');
  }

  return message;
};

/**
 * Send WhatsApp reminder to customer
 * @param {Object} rental - The rental object
 */
const sendWhatsAppReminder = async (rental) => {
  if (!rental.customer_phone) {
    alert(tr('❌ Customer phone number not available', '❌ Numéro de téléphone du client indisponible'));
    return false;
  }

  try {
    const message = buildWhatsAppReminderMessage(rental);

    // Encode message for WhatsApp URL
    const encodedMessage = encodeURIComponent(message);
    const phoneNumber = rental.customer_phone.replace(/[^0-9]/g, '');

    // Clean phone number (remove any non-digit characters except +)
    const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // WhatsApp URL - use wa.me for better compatibility
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

    console.log('📱 Opening WhatsApp with URL:', whatsappUrl);

    // Open WhatsApp in new tab
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    alert(tr(`✅ WhatsApp reminder opened for ${rental.customer_name}`, `✅ Rappel WhatsApp ouvert pour ${rental.customer_name}`));
    return true;

  } catch (error) {
    console.error('❌ Error sending WhatsApp reminder:', error);
    alert(tr('Failed to open WhatsApp. Please try again.', 'Impossible d’ouvrir WhatsApp. Veuillez réessayer.'));
    return false;
  }
};

const sendGuideLocateMessage = async (tour) => {
  const cleanPhone = String(tour?.guidePhone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    alert(tr('Guide phone number is not available.', 'Le numéro du guide n’est pas disponible.'));
    return false;
  }

  try {
    const trackingUrl = tour?.trackingUrl || buildTourTrackingUrl(tour.groupId);
    const shortTrackingUrl = await shortenUrl(trackingUrl, null, 'tour_tracking');
    const message = tr(`Open and share location now: ${shortTrackingUrl}`, `Ouvrez et partagez votre position maintenant : ${shortTrackingUrl}`);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    return true;
  } catch (error) {
    console.error('❌ Error opening guide WhatsApp:', error);
    alert(tr('Failed to open WhatsApp. Please try again.', 'Impossible d’ouvrir WhatsApp. Veuillez réessayer.'));
    return false;
  }
};

// Overview Statistics Component
const OverviewStats = ({ stats, loading, urgentStats, showRevenueTotals = true, todayRevenue = 0 }) => {
  const statItems = [
    {
      icon: <Car className="w-6 h-6 text-blue-500" />,
      label: tr('Total Vehicles', 'Total véhicules'),
      value: stats.vehicles,
      color: 'blue',
      link: '/admin/fleet',
      change: null
    },
    {
      icon: <Users className="w-6 h-6 text-green-500" />,
      label: tr('Active Rentals', 'Locations actives'),
      value: stats.rentals,
      color: 'green',
      link: '/admin/rentals',
      change: urgentStats ? tr(`${urgentStats.overdue + urgentStats.expiringSoon} urgent`, `${urgentStats.overdue + urgentStats.expiringSoon} urgents`) : null,
      changeColor: urgentStats && (urgentStats.overdue + urgentStats.expiringSoon) > 0 ? 'red' : 'gray'
    },
    {
      icon: <Wrench className="w-6 h-6 text-yellow-500" />,
      label: tr('Maintenance', 'Maintenance'),
      value: stats.maintenance,
      color: 'yellow',
      link: '/admin/maintenance',
      change: null
    },
    {
      icon: <DollarSign className="w-6 h-6 text-purple-500" />,
      label: showRevenueTotals ? tr('Total Revenue', 'Revenu total') : tr("Today's Revenue", "Revenu du jour"),
      value: `${formatNumber(showRevenueTotals ? stats.revenue : todayRevenue)} MAD`,
      color: 'purple',
      link: '/admin/finance',
      change: showRevenueTotals
        ? tr('+12% from last month', '+12% par rapport au mois dernier')
        : tr('Paid revenue recorded today', 'Revenu payé enregistré aujourd’hui'),
      changeColor: showRevenueTotals ? 'green' : 'gray'
    },
    {
      icon: <Calendar className="w-6 h-6 text-indigo-500" />,
      label: tr('Upcoming Tours', 'Tours à venir'),
      value: stats.tours,
      color: 'indigo',
      link: '/admin/tours',
      change: stats.toursToday ? tr(`${stats.toursToday} today`, `${stats.toursToday} aujourd’hui`) : tr('No tours today', 'Aucun tour aujourd’hui'),
      changeColor: stats.toursToday ? 'blue' : 'gray'
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="bg-white p-4 sm:p-6 rounded-lg shadow-md animate-pulse">
            <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-8 sm:h-12 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6">
      {statItems.map(item => (
        <Link to={item.link} key={item.label} className="block hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className={`bg-white p-4 sm:p-6 rounded-lg shadow-md border-l-4 border-${item.color}-500 h-full relative`}>
            {item.label === 'Active Rentals' && urgentStats && (urgentStats.overdue > 0 || urgentStats.expiringSoon > 0) && (
              <div className="absolute -top-2 -right-2">
                <span className={`px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 flex items-center gap-1`}>
                  <AlertTriangle className="w-3 h-3" />
                  {urgentStats.overdue + urgentStats.expiringSoon}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 mb-1">{item.label}</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-800">{item.value}</p>
                {item.change && (
                  <p className={`text-xs mt-2 font-medium text-${item.changeColor}-600`}>
                    {item.change}
                  </p>
                )}
              </div>
              <div className={`p-2 sm:p-3 bg-${item.color}-100 rounded-full ml-4`}>
                {item.icon}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};

// Urgent Rentals Component
const UrgentRentals = ({ urgentRentals, loading }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded w-16"></div>
        </div>
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!urgentRentals || urgentRentals.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-700">{tr('Urgent Rentals', 'Locations urgentes')}</h3>
          <span className="text-sm text-green-600 font-medium">{tr('All good', 'Tout va bien')}</span>
        </div>
        <div className="text-center py-8">
          <Bell className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500">{tr('No urgent rentals at the moment', 'Aucune location urgente pour le moment')}</p>
        </div>
      </div>
    );
  }

  // Mobile Booking Card Component
  const MobileBookingCard = ({ booking }) => {
    const timerState = calculateDashboardRentalTimer(booking, currentTime);
    const isOverdue = timerState.isExpired;
    const rentalStartedAt = new Date(booking?.started_at || '').getTime();
    const hasElapsedTimer = booking?.rental_status === 'active' && Number.isFinite(rentalStartedAt);
    const elapsedText = hasElapsedTimer ? formatDashboardDuration(currentTime - rentalStartedAt) : null;
    const elapsedTone = hasElapsedTimer ? getDashboardRentalElapsedTone(booking, currentTime) : null;

    // Calculate payment status
    const totalAmount = booking.total_amount || 0;
    const depositPaid = booking.deposit_amount || 0;
    const balanceDue = totalAmount - depositPaid;
    const hasBalanceDue = balanceDue > 0;

    // Handle remind button click
    const handleRemind = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📱 Remind button clicked for:', booking.customer_name);
      sendWhatsAppReminder(booking);
    };

    // Handle extend button click
    const handleExtend = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('⏰ Extend button clicked for:', booking.customer_name);

      // Navigate to rental details with extension modal flag
      const extendUrl = `/admin/rentals/${booking.id}?openExtension=true`;
      console.log('🔗 Navigating to:', extendUrl);
      window.location.href = extendUrl;
    };

    // Handle view button click
    const handleView = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('👁️ View button clicked for:', booking.customer_name);
      window.location.href = `/admin/rentals/${booking.id}`;
    };

    return (
      <div className={`bg-white rounded-xl border-l-4 ${
        timerState.color === 'red'
          ? 'border-red-500'
          : timerState.color === 'orange'
            ? 'border-orange-500'
            : 'border-green-500'
      } shadow-sm hover:shadow-md transition-shadow duration-200`}>
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {isOverdue ? (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5 text-orange-600" />
                  </div>
                )}
                <span className={`text-xs font-semibold uppercase tracking-wide truncate ${
                  timerState.color === 'red'
                    ? 'text-red-700'
                    : timerState.color === 'orange'
                      ? 'text-orange-700'
                      : 'text-green-700'
                }`}>
                  {timerState.label}
                </span>
              </div>

              <div className="mb-3">
                <h4 className="font-bold text-gray-900 text-base truncate">{booking.customer_name}</h4>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                    <Car className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate">
                      {booking.vehicle?.model || booking.vehicle?.name || 'N/A'}
                    </span>
                  </div>
                  {booking.vehicle?.plate_number && (
                    <span className="text-xs font-mono font-semibold px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-gray-700 truncate">
                      {booking.vehicle.plate_number}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Time Badge - Desktop */}
            <div className="hidden sm:block flex-shrink-0 ml-2">
              <span className={`px-4 py-2 text-base font-bold rounded-full whitespace-nowrap ${timerState.badgeClass}`}>
                {timerState.text}
              </span>
            </div>
          </div>

          {/* Time Badge - Mobile */}
          <div className="sm:hidden mb-4">
            <span className={`px-4 py-2 text-base font-bold rounded-full w-full text-center block ${timerState.badgeClass}`}>
              {timerState.text}
            </span>
          </div>

          {hasElapsedTimer ? (
            <div className="mb-4 flex flex-col items-start gap-1">
              <span className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-bold ${elapsedTone.badgeClass}`}>
                {elapsedText}
              </span>
              {elapsedTone.expired ? (
                <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${elapsedTone.labelClass}`}>
                  {tr('Expired', 'Expiré')}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Payment Status - Show if balance due */}
          {hasBalanceDue && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs text-red-700 font-medium">{tr('Balance Due:', 'Solde dû :')}</span>
                <span className="text-sm font-bold text-red-600">{balanceDue.toFixed(2)} MAD</span>
              </div>
            </div>
          )}

          {/* Customer Phone - Show if available */}
          {booking.customer_phone && (
            <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-xs text-blue-700 font-medium truncate">
                  {booking.customer_phone}
                </span>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-500 font-medium truncate">{tr('End Time', 'Heure de fin')}</span>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">
                {booking.actual_end_time?.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}
              </p>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-500 font-medium truncate">{tr('Amount', 'Montant')}</span>
              </div>
              <p className="text-sm font-bold text-green-600 truncate">
                {totalAmount.toFixed(2)} MAD
              </p>
            </div>
          </div>

          {/* Action Buttons - FIXED with working handlers */}
          <div className="flex gap-2">
            <button
              onClick={handleRemind}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center justify-center gap-2 font-semibold shadow-sm hover:shadow active:scale-[0.98]"
              title={tr(`Send WhatsApp reminder to ${booking.customer_phone || 'N/A'}`, `Envoyer un rappel WhatsApp à ${booking.customer_phone || 'N/A'}`)}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{tr('Remind', 'Rappeler')}</span>
            </button>
            <button
              onClick={handleExtend}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 flex items-center justify-center gap-2 font-semibold shadow-sm hover:shadow active:scale-[0.98]"
              title={tr('Request extension for this rental', 'Demander une prolongation pour cette location')}
            >
              <Zap className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{tr('Extend', 'Prolonger')}</span>
            </button>
            <button
              onClick={handleView}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all duration-200 font-semibold shadow-sm hover:shadow active:scale-[0.98] truncate"
              title={tr('View rental details', 'Voir les détails de la location')}
            >
              {tr('View', 'Voir')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
      {/* Header with icon */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">{tr('Urgent Rentals', 'Locations urgentes')}</h3>
            <p className="text-sm text-gray-500">{tr('Need immediate attention', 'Attention immédiate requise')}</p>
          </div>
        </div>
        <span className="px-3 py-1.5 text-sm font-bold rounded-full bg-red-100 text-red-800">
          {urgentRentals.length}
        </span>
      </div>

      {/* Rentals list */}
      <div className="space-y-4">
        {urgentRentals.map((rental) => (
          <MobileBookingCard key={rental.id} booking={rental} />
        ))}
      </div>

      {/* Stats summary */}
      {urgentRentals.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {urgentRentals.filter((r) => calculateDashboardRentalTimer(r, currentTime).isExpired).length}
              </div>
              <div className="text-xs text-gray-500">{tr('Expired', 'Expiré')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {urgentRentals.filter((r) => {
                  const timer = calculateDashboardRentalTimer(r, currentTime);
                  return !timer.isExpired && (timer.color === 'orange' || timer.color === 'red');
                }).length}
              </div>
              <div className="text-xs text-gray-500">{tr('Expiring Soon', 'Expiration imminente')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DASHBOARD_UPCOMING_LIMIT = 4;

const UpcomingTours = ({ tours, loading }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!tours || tours.length === 0) {
    return null;
  }

  const visibleTours = tours.slice(0, DASHBOARD_UPCOMING_LIMIT);
  const hiddenToursCount = Math.max(0, tours.length - visibleTours.length);

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-700">{tr('Tours & Departures', 'Tours et départs')}</h3>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/live-map"
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Smartphone className="w-4 h-4" />
            {tr('Open Live Map', 'Ouvrir la carte en direct')}
          </Link>
          <span className="text-sm text-blue-600 font-medium">{tr(`${tours.length} in queue`, `${tours.length} en file`)}</span>
        </div>
      </div>
      <div className="space-y-3">
        {visibleTours.map((tour) => {
          const expiredTour = isDashboardTourExpired(tour);
          const destination = '/admin/tours?tab=schedule';
          const activeStartedAt = new Date(tour.startedAt || '').getTime();
          const hasActiveTimer = tour.status === 'active' && Number.isFinite(activeStartedAt);
          const elapsedText = hasActiveTimer ? formatDashboardDuration(currentTime - activeStartedAt) : null;
          const elapsedTone = hasActiveTimer ? getDashboardTourElapsedTone(tour, currentTime) : null;

          return (
            <div
              key={tour.groupId}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
            >
              <div className="flex items-start justify-between gap-3">
                <Link to={destination} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{tour.packageName}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${
                      expiredTour
                        ? 'bg-yellow-100 text-yellow-800'
                        : tour.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-orange-100 text-orange-700'
                    }`}>
                      {expiredTour
                        ? tr('Expired', 'Expiré')
                        : tour.status === 'active'
                          ? tr('Out now', 'En cours')
                          : tour.status === 'scheduled'
                            ? tr('Scheduled', 'Planifié')
                            : tour.status === 'completed'
                              ? tr('Completed', 'Terminé')
                              : tour.status === 'cancelled'
                                ? tr('Cancelled', 'Annulé')
                                : tour.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{tour.customerName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {tour.guideName} • {tr(`${tour.quadCount} quads`, `${tour.quadCount} quads`)}
                  </p>
                </Link>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {new Date((tour.status === 'active' && tour.startedAt) || tour.scheduledStartAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </p>
                  {hasActiveTimer ? (
                    <div className="mt-1 flex flex-col items-end">
                      <p className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold ${elapsedTone.badgeClass}`}>
                        {elapsedText}
                      </p>
                      {elapsedTone.expired ? (
                        <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${elapsedTone.labelClass}`}>
                          {tr('Expired', 'Expiré')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {expiredTour
                      ? tr('Need location now', 'Position requise maintenant')
                      : tour.status === 'active'
                        ? tr('Tap to open tour schedule', 'Touchez pour ouvrir le planning du tour')
                        : tr('Tap to continue booking', 'Touchez pour continuer la réservation')}
                  </p>
                </div>
              </div>
              {expiredTour && tour.guidePhone ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => sendGuideLocateMessage(tour)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {tr('Locate Guide', 'Localiser le guide')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {hiddenToursCount > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Link
            to="/admin/tours"
            className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 transition-colors hover:text-violet-900"
          >
            {tr(`+${hiddenToursCount} more tours`, `+${hiddenToursCount} autres tours`)}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
};

const UpcomingRentals = ({ rentals, loading }) => {
  if (loading) {
    return (
      <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)] animate-pulse">
        <div className="h-6 w-1/3 rounded bg-gray-200 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!rentals || rentals.length === 0) {
    return null;
  }

  const visibleRentals = rentals.slice(0, DASHBOARD_UPCOMING_LIMIT);
  const hiddenRentalsCount = Math.max(0, rentals.length - visibleRentals.length);

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-700">{tr('Upcoming Rentals', 'Locations à venir')}</h3>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/rentals"
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Car className="w-4 h-4" />
            {tr('Open Rentals', 'Ouvrir les locations')}
          </Link>
          <span className="text-sm text-blue-600 font-medium">{tr(`${rentals.length} upcoming`, `${rentals.length} à venir`)}</span>
        </div>
      </div>
      <div className="space-y-3">
        {visibleRentals.map((rental) => (
          <Link
            key={rental.id}
            to={`/admin/rentals/${rental.id}`}
            className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900">{rental.customerName}</p>
                  <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
                    {tr('Scheduled', 'Planifié')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {rental.vehicleName} {rental.plateNumber ? `• ${rental.plateNumber}` : ''}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {rental.rentalTypeLabel} {rental.pickupLocation ? `• ${rental.pickupLocation}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-slate-900">{formatDashboardDateTime(rental.startAt)}</p>
                <p className="mt-1 text-xs text-slate-500">{tr('Tap to open rental', 'Touchez pour ouvrir la location')}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {hiddenRentalsCount > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Link
            to="/admin/rentals"
            className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 transition-colors hover:text-violet-900"
          >
            {tr(`+${hiddenRentalsCount} more rentals`, `+${hiddenRentalsCount} autres locations`)}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
};

const RevenueChart = ({ data, loading }) => {
  if (loading) return <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md h-64 sm:h-80 animate-pulse"></div>;

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-700">{tr('Revenue Trend (Last 7 Days)', 'Tendance du revenu (7 derniers jours)')}</h3>
        <div className="flex items-center text-sm text-green-600 font-medium">
          <TrendingUp className="w-4 h-4 mr-1" />
          {tr('+8% from last week', '+8% depuis la semaine dernière')}
        </div>
      </div>
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              padding={{ left: 20, right: 20 }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `${formatNumber(value)} MAD`}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toLocaleString()} MAD`, tr('Revenue', 'Revenu')]}
              labelFormatter={(label) => tr(`Date: ${label}`, `Date : ${label}`)}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#8884d8"
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: '#8884d8', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Vehicle Utilization Chart
const VehicleUtilizationChart = ({ data, loading }) => {
  if (loading) return <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md h-64 sm:h-80 animate-pulse"></div>;

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-700">Vehicle Utilization</h3>
        <span className="text-sm font-medium text-gray-600">
          Total: {data.reduce((sum, item) => sum + item.rentals, 0)} rentals
        </span>
      </div>
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12 }}
              width={70}
            />
            <Tooltip
              formatter={(value) => [value, 'Rentals']}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
            />
            <Bar
              dataKey="rentals"
              fill="#82ca9d"
              radius={[0, 4, 4, 0]}
              name="Number of Rentals"
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Recent Bookings Component (Mobile Cards & Desktop Table) - UPDATED with clickable links
const RecentBookings = ({ bookings, loading, collapsed, onToggle }) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          {Array(5).fill(0).map((_, i) => <div key={i} className="h-10 bg-gray-200 rounded"></div>)}
        </div>
      </div>
    );
  }

  // Handle booking click - navigate to rental details
  const handleBookingClick = (bookingId) => {
    navigate(`/admin/rentals/${bookingId}`);
  };

  // Mobile Card View - Now clickable
  const MobileBookingCard = ({ booking }) => (
    <div
      onClick={() => handleBookingClick(booking.id)}
      className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-3 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-gray-900">{booking.customer_name}</p>
          <p className="text-sm text-gray-500">{booking.vehicle?.vehicle_type || 'N/A'}</p>
        </div>
        <span className={`px-2 py-1 text-xs font-semibold rounded-full bg-${booking.payment_status === 'paid' ? 'green' : 'yellow'}-100 text-${booking.payment_status === 'paid' ? 'green' : 'yellow'}-800`}>
          {booking.payment_status}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">{booking.total_amount} MAD</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(booking.created_at).toLocaleDateString()}
          </span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 text-left"
        >
          <h3 className="text-lg font-semibold text-slate-700">Recent Bookings</h3>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
            {bookings.length}
          </span>
          <Link to="/admin/rentals" className="flex items-center gap-1 text-sm font-medium text-violet-600 hover:underline">
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {collapsed ? null : (
        <>
      {/* Mobile View */}
      <div className="sm:hidden space-y-3">
        {bookings.slice(0, 5).map(booking => (
          <MobileBookingCard key={booking.id} booking={booking} />
        ))}
      </div>

      {/* Desktop View - Now clickable rows */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tr('Customer', 'Client')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tr('Vehicle', 'Véhicule')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tr('Amount', 'Montant')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tr('Status', 'Statut')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tr('Date', 'Date')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {bookings.map(booking => (
              <tr
                key={booking.id}
                onClick={() => handleBookingClick(booking.id)}
                className="hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{booking.customer_name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    {booking.vehicle?.vehicle_type || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {booking.total_amount} MAD
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-${booking.payment_status === 'paid' ? 'green' : 'yellow'}-100 text-${booking.payment_status === 'paid' ? 'green' : 'yellow'}-800`}>
                    {booking.payment_status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(booking.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
};

const DASHBOARD_RECEIVE_METHODS = [
  {
    key: 'cash',
    title: tr('Cash', 'Espèces'),
    subtitle: tr('Collected in person', 'Collecté en main propre'),
    icon: Banknote,
    activeClass: 'border-emerald-300 bg-emerald-50 shadow-[0_16px_34px_rgba(16,185,129,0.14)] text-emerald-700',
  },
  {
    key: 'bank_deposit',
    title: tr('Bank Deposit', 'Dépôt bancaire'),
    subtitle: tr('Received to bank account', 'Reçu sur compte bancaire'),
    icon: Landmark,
    activeClass: 'border-violet-300 bg-violet-50 shadow-[0_16px_34px_rgba(124,58,237,0.14)] text-violet-700',
  },
  {
    key: 'wire_transfer',
    title: tr('Bank Transfer', 'Virement bancaire'),
    subtitle: tr('Transferred between accounts', 'Transféré entre comptes'),
    icon: ArrowDownToLine,
    activeClass: 'border-sky-300 bg-sky-50 shadow-[0_16px_34px_rgba(14,165,233,0.14)] text-sky-700',
  },
];

const DashboardReceiveFundsDrawer = ({
  open,
  onClose,
  onRecorded,
  userProfile,
}) => {
  const [saving, setSaving] = useState(false);
  const [composerMode, setComposerMode] = useState('funds');
  const [expenseModeReady, setExpenseModeReady] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);
  const [adminRecipients, setAdminRecipients] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [showReceiptCapture, setShowReceiptCapture] = useState(false);
  const [expenseLabelPresets, setExpenseLabelPresets] = useState([]);
  const [selectedExpenseLabels, setSelectedExpenseLabels] = useState([]);
  const [newExpenseLabel, setNewExpenseLabel] = useState('');
  const [showExpenseNote, setShowExpenseNote] = useState(false);
  const [expenseSaveFeedback, setExpenseSaveFeedback] = useState(null);
  const receiptCaptureRef = useRef(null);
  const receiptImportInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const canUseOwnerBankMethods = canAccessOwnerBankMethods(userProfile);
  const canUseBankDeposit = canUseBankDepositMethod(userProfile);
  const [form, setForm] = useState({
    method: 'cash',
    amount: '',
    receivedDate: todayInputKey(),
    receivedByAdminUserId: '',
    receivedByAdminDisplayName: '',
    note: '',
  });
  const isExpenseMode = composerMode === 'expense';
  const expenseLabelsScopeId = String(
    userProfile?.organization_id ||
    userProfile?.organizationId ||
    userProfile?.workspace_id ||
    userProfile?.workspaceId ||
    'shared'
  ).trim() || 'shared';
  const selectedReceiveMethod = DASHBOARD_RECEIVE_METHODS.find((method) => method.key === form.method) || DASHBOARD_RECEIVE_METHODS[0];

  const resetDrawerForm = (mode = composerMode, recipients = adminRecipients) => {
    setForm({
      method: 'cash',
      amount: '',
      receivedDate: todayInputKey(),
      receivedByAdminUserId: mode === 'funds' ? (recipients[0]?.id || '') : '',
      receivedByAdminDisplayName: mode === 'funds' ? (recipients[0]?.label || '') : '',
      note: '',
    });
    setReceiptFile(null);
    setShowDateInput(false);
    setShowReceiptCapture(false);
    setSelectedExpenseLabels([]);
    setNewExpenseLabel('');
    setShowExpenseNote(false);
    setExpenseSaveFeedback(null);
  };

  const handleReceiptImport = (event) => {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) return;
    setReceiptFile(nextFile);
    setShowReceiptCapture(false);
    event.target.value = '';
  };

  useEffect(() => {
    setExpenseLabelPresets(loadExpenseLabelPresets(expenseLabelsScopeId));
  }, [expenseLabelsScopeId]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setComposerMode('funds');
      resetDrawerForm('funds', adminRecipients);
    }
  }, [adminRecipients, open]);

  useEffect(() => {
    let isActive = true;

    const loadExpenseModeReady = async () => {
      try {
        const ready = await receiveFundsService.checkExpensesTableExists();
        if (isActive) {
          setExpenseModeReady(Boolean(ready));
        }
      } catch (_error) {
        if (isActive) {
          setExpenseModeReady(false);
        }
      }
    };

    void loadExpenseModeReady();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!showReceiptCapture) return undefined;

    const scrollToCapture = () => {
      receiptCaptureRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    };

    scrollToCapture();
    const timeoutId = window.setTimeout(scrollToCapture, 0);
    return () => window.clearTimeout(timeoutId);
  }, [showReceiptCapture]);

  useEffect(() => {
    if (!canUseBankDeposit && form.method === 'bank_deposit') {
      setForm((current) => ({ ...current, method: 'cash' }));
      return;
    }

    if (!canUseOwnerBankMethods && form.method === 'wire_transfer') {
      setForm((current) => ({ ...current, method: 'cash' }));
    }
  }, [canUseBankDeposit, canUseOwnerBankMethods, form.method]);

  useEffect(() => {
    let isActive = true;

    const loadAdmins = async () => {
      try {
        setAdminsLoading(true);
        const users = await getStaffDirectory();
        if (!isActive) return;
        const nextAdmins = normalizeAdminRecipients(users);
        setAdminRecipients(nextAdmins);
        setForm((current) => {
          if (current.receivedByAdminUserId || nextAdmins.length === 0) {
            return current;
          }
          return {
            ...current,
            receivedByAdminUserId: nextAdmins[0].id,
            receivedByAdminDisplayName: nextAdmins[0].label,
          };
        });
      } catch (error) {
        console.error('Failed to load admin recipients:', error);
        if (isActive) {
          setAdminRecipients([]);
        }
      } finally {
        if (isActive) {
          setAdminsLoading(false);
        }
      }
    };

    if (open) {
      void loadAdmins();
    }

    return () => {
      isActive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [receiptFile]);

  useEffect(() => {
    if (!open || !isExpenseMode) return;
    const timeoutId = window.setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select?.();
    }, 40);
    return () => window.clearTimeout(timeoutId);
  }, [open, isExpenseMode]);

  if (!open) return null;

  const compactExpenseDateLabel = (() => {
    const baseLabel = new Date(`${form.receivedDate}T12:00:00`).toLocaleDateString(
      isFrenchLocale() ? 'fr-FR' : 'en-US',
      { month: 'short', day: 'numeric' }
    );
    if (form.receivedDate === todayInputKey()) {
      return tr(`Today • ${baseLabel}`, `Aujourd'hui • ${baseLabel}`);
    }
    return new Date(`${form.receivedDate}T12:00:00`).toLocaleDateString(
      isFrenchLocale() ? 'fr-FR' : 'en-US',
      { weekday: 'short', month: 'short', day: 'numeric' }
    );
  })();

  const handleSave = async () => {
    try {
      if (!isExpenseMode && adminRecipients.length > 0 && !form.receivedByAdminUserId) {
        toast.error(tr('Choose which admin received the funds.', "Choisissez l'admin qui a reçu les fonds."));
        return;
      }

      setSaving(true);
      let receiptUpload = null;
      if (receiptFile) {
        const scopeId = String(
          userProfile?.organization_id ||
            userProfile?.organizationId ||
            userProfile?.workspace_id ||
            userProfile?.workspaceId ||
            'shared'
        ).trim();
        receiptUpload = await uploadFile(receiptFile, {
          bucket: 'rental-documents',
          pathPrefix: `receive-funds/${scopeId}`,
          optimizationProfile: 'document',
        });
        if (!receiptUpload?.success) {
          throw new Error(receiptUpload?.error || tr('Receipt upload failed.', "L'envoi du reçu a échoué."));
        }
      }
      if (isExpenseMode) {
        await receiveFundsService.recordExpense(
          {
            amount: form.amount,
            receivedDate: form.receivedDate,
            note: form.note,
            labels: selectedExpenseLabels,
            receiptImageUrl: receiptUpload?.url || '',
          },
          userProfile
        );
        setExpenseSaveFeedback({
          label: selectedExpenseLabels[0] || tr('Expense', 'Dépense'),
          amount: Number(form.amount || 0),
        });
        resetDrawerForm('expense');
        setComposerMode('expense');
      } else {
        await receiveFundsService.recordEntry(
          {
            amount: form.amount,
            method: form.method,
            receivedDate: form.receivedDate,
            receivedByAdminUserId: form.receivedByAdminUserId,
            receivedByAdminDisplayName: form.receivedByAdminDisplayName,
            note: form.note,
            receiptImageUrl: receiptUpload?.url || '',
            receiptImagePath: receiptUpload?.path || '',
          },
          userProfile
        );
        toast.success(tr('Funds recorded successfully.', 'Fonds enregistrés avec succès.'));
        onClose?.();
      }
      onRecorded?.();
    } catch (error) {
      toast.error(
        error?.message ||
          (isExpenseMode
            ? tr('Could not record expense.', "Impossible d'enregistrer la dépense.")
            : tr('Could not record funds.', "Impossible d'enregistrer les fonds."))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddExpenseLabel = () => {
    const normalized = uniqueLabels([newExpenseLabel])[0];
    if (!normalized) return;
    const nextPresets = uniqueLabels([...expenseLabelPresets, normalized]);
    setExpenseLabelPresets(nextPresets);
    saveExpenseLabelPresets(expenseLabelsScopeId, nextPresets);
    setSelectedExpenseLabels([normalized]);
    setNewExpenseLabel('');
    setExpenseSaveFeedback(null);
  };

  const handleToggleExpenseLabel = (label) => {
    setSelectedExpenseLabels((current) =>
      current.some((item) => item.toLowerCase() === String(label).toLowerCase()) ? [] : [label]
    );
    setExpenseSaveFeedback(null);
  };

  const handleRemoveExpenseLabelPreset = (label) => {
    const nextPresets = expenseLabelPresets.filter((item) => item.toLowerCase() !== String(label).toLowerCase());
    setExpenseLabelPresets(nextPresets);
    saveExpenseLabelPresets(expenseLabelsScopeId, nextPresets);
    setSelectedExpenseLabels((current) => current.filter((item) => item.toLowerCase() !== String(label).toLowerCase()));
    setExpenseSaveFeedback(null);
  };

  const openExpenseMode = async () => {
    const ready = await receiveFundsService.refreshExpensesTableExists();
    setExpenseModeReady(Boolean(ready));

    if (!ready) {
      toast.error(
        tr(
          'Add Expense needs the finance_expenses table. Run the finance expenses migration first.',
          "Ajouter une dépense nécessite la table finance_expenses. Exécutez d'abord la migration des dépenses finance."
        )
      );
      return;
    }

    setComposerMode('expense');
    resetDrawerForm('expense');
  };

  const expenseNotePreview = buildExpenseNote(form.note, selectedExpenseLabels);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        aria-label={tr('Close Record Funds', 'Fermer Enregistrer des fonds')}
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-violet-100 bg-[linear-gradient(180deg,#f3edff_0%,#f8f5ff_52%,#ffffff_100%)] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:p-5">
        <div className="rounded-[30px] border border-white/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">
                {isExpenseMode ? tr('Add Expense', 'Ajouter une dépense') : tr('Record Funds', 'Enregistrer des fonds')}
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950">
                {isExpenseMode ? tr('Purchase Expense', "Dépense d'achat") : selectedReceiveMethod.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setComposerMode('funds');
                  resetDrawerForm('funds');
                }}
                className={`rounded-[18px] px-4 py-3 text-left transition ${
                  !isExpenseMode ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <p className="text-sm font-semibold">{tr('Record Funds', 'Enregistrer des fonds')}</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void openExpenseMode();
                }}
                className={`rounded-[18px] px-4 py-3 text-left transition ${
                  isExpenseMode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <p className="text-sm font-semibold">{tr('Add Expense', 'Ajouter une dépense')}</p>
              </button>
            </div>
          </div>

          {!isExpenseMode ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {DASHBOARD_RECEIVE_METHODS.filter((method) => {
              if (method.key === 'cash') return true;
              if (method.key === 'bank_deposit') return canUseBankDeposit;
              if (method.key === 'wire_transfer') return canUseOwnerBankMethods;
              return false;
            }).map((method) => {
              const Icon = method.icon;
              const isActive = form.method === method.key;
              return (
                <button
                  key={method.key}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, method: method.key }))}
                  className={`rounded-[24px] border px-5 py-5 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:translate-y-0 active:scale-[0.985] ${
                    isActive
                      ? method.activeClass
                      : 'border-slate-200 bg-white text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.04)] hover:border-violet-200 hover:bg-violet-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{method.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{method.subtitle}</p>
                    </div>
                    <div className="rounded-2xl border border-current/10 bg-white/80 p-3">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          ) : null}

          <div className="mt-6 rounded-[28px] border border-violet-100 bg-[#faf7ff] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Amount', 'Montant')}
            </label>
            <div className="mt-3 flex items-end justify-between gap-4 rounded-[24px] border border-white bg-white px-5 py-4 shadow-[0_16px_36px_rgba(79,70,229,0.08)]">
              <input
                ref={amountInputRef}
                type={isExpenseMode ? 'text' : 'number'}
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => {
                  const nextValue = isExpenseMode
                    ? event.target.value.replace(/[^0-9.,]/g, '')
                    : event.target.value;
                  setForm((current) => ({ ...current, amount: nextValue }));
                  setExpenseSaveFeedback(null);
                }}
                placeholder="0"
                autoFocus={isExpenseMode}
                className="w-full appearance-none border-0 bg-transparent p-0 text-4xl font-bold tracking-[-0.04em] text-slate-950 outline-none placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pb-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">MAD</span>
            </div>
          </div>

          {isExpenseMode ? (
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
              <label className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                {tr('Labels', 'Labels')}
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {expenseLabelPresets.map((label) => {
                  const isSelected = selectedExpenseLabels.some((item) => item.toLowerCase() === label.toLowerCase());
                  return (
                    <div key={label} className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleExpenseLabel(label)}
                        className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                          isSelected
                            ? 'border-violet-300 bg-violet-50 text-violet-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-white'
                        }`}
                      >
                        {label}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExpenseLabelPreset(label)}
                        className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 transition hover:text-rose-600"
                        aria-label={`${tr('Remove', 'Retirer')} ${label}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={newExpenseLabel}
                  onChange={(event) => setNewExpenseLabel(event.target.value)}
                  placeholder={tr('Add label', 'Ajouter un label')}
                  className="flex-1 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddExpenseLabel}
                  className="inline-flex items-center justify-center rounded-[20px] border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                >
                  + {tr('Add', 'Ajouter')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                {isExpenseMode ? tr('Expense Date', 'Date de dépense') : tr('Deposit Date', 'Date du dépôt')}
              </p>
              <button
                type="button"
                onClick={() => setShowDateInput((value) => !value)}
                className="mt-3 inline-flex w-full items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-white"
              >
                <span>{isExpenseMode ? compactExpenseDateLabel : new Date(`${form.receivedDate}T12:00:00`).toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <Calendar className="h-4 w-4 text-violet-500" />
              </button>
              {showDateInput ? (
                <input
                  type="date"
                  value={form.receivedDate}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, receivedDate: event.target.value }));
                    setExpenseSaveFeedback(null);
                  }}
                  className="mt-3 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-violet-300"
                />
              ) : null}
            </div>

            {!isExpenseMode ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                  {tr('Sent to admin', 'Envoyé à un admin')}
                </label>
                {adminsLoading ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {adminRecipients.map((admin) => {
                  const isActive = form.receivedByAdminUserId === admin.id;
                  return (
                    <button
                      key={admin.id}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          receivedByAdminUserId: admin.id,
                          receivedByAdminDisplayName: admin.label,
                        }))
                      }
                      className={`rounded-full border px-3 py-2 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:translate-y-0 active:scale-[0.97] ${
                        isActive
                          ? 'border-violet-300 bg-violet-50 text-violet-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-white'
                      }`}
                    >
                      {admin.label}
                    </button>
                  );
                })}
                {!adminsLoading && adminRecipients.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {tr('No admin recipients found.', "Aucun admin trouvé.")}
                  </p>
                ) : null}
              </div>
            </div>
            ) : null}

          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <input
              ref={receiptImportInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleReceiptImport}
            />
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                {tr('Receipt image', 'Image du reçu')}
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptCapture((current) => !current);
                    setExpenseSaveFeedback(null);
                  }}
                  className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                    showReceiptCapture
                      ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.12)]'
                      : 'border-violet-200 bg-white text-violet-700 hover:border-violet-300 hover:bg-violet-50'
                  }`}
                >
                  {showReceiptCapture ? tr('Close photo', 'Fermer la photo') : tr('Add photo', 'Ajouter une photo')}
                </button>
                <button
                  type="button"
                  onClick={() => receiptImportInputRef.current?.click()}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {tr('Import', 'Importer')}
                </button>
                {receiptFile ? (
                  <button
                    type="button"
                    onClick={() => setReceiptFile(null)}
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-rose-600"
                  >
                    {tr('Remove', 'Retirer')}
                  </button>
                ) : null}
              </div>
            </div>
            {receiptPreviewUrl ? (
              <div className="mt-3 flex items-center gap-3 rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                <img src={receiptPreviewUrl} alt={tr('Receipt preview', 'Aperçu du reçu')} className="h-14 w-14 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {receiptFile ? receiptFile.name : tr('Receipt image ready', 'Image du reçu prête')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isExpenseMode
                      ? tr('One receipt photo will be saved with this expense.', 'Une photo du reçu sera enregistrée avec cette dépense.')
                      : tr('One photo will be saved with this funds record.', 'Une photo sera enregistrée avec ce fonds reçu.')}
                  </p>
                </div>
              </div>
            ) : null}
            {showReceiptCapture ? (
              <div ref={receiptCaptureRef} className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <PhotoCapture
                  sessionToken="receipt-capture"
                  requirements={{ minPhotos: 1, maxPhotos: 1 }}
                  hideHeader
                  hideInstructions
                  squarePreview
                  captureLabel={tr('Take Photo', 'Prendre une photo')}
                  submitLabel={tr('Use this photo', 'Utiliser cette photo')}
                  retakeLabel={tr('Retake photo', 'Reprendre la photo')}
                  loadingLabel={tr('Initializing camera…', 'Initialisation de la caméra…')}
                  importLabel={tr('Import', 'Importer')}
                  onImportClick={() => receiptImportInputRef.current?.click()}
                  onPhotosCapture={(files) => {
                    const nextFile = files?.[files.length - 1] || null;
                    setReceiptFile(nextFile);
                    setShowReceiptCapture(false);
                  }}
                  onError={(message) => {
                    toast.error(message || tr('Camera access failed.', "L'accès à la caméra a échoué."));
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            {isExpenseMode && !showExpenseNote && !form.note ? (
              <button
                type="button"
                onClick={() => setShowExpenseNote(true)}
                className="flex w-full items-center justify-between rounded-[20px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 px-4 py-4 text-left shadow-[0_16px_34px_rgba(124,58,237,0.10)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_22px_42px_rgba(124,58,237,0.14)]"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-violet-700">
                    {tr('Expense note', 'Note de dépense')}
                  </span>
                  <span className="mt-2 block text-base font-semibold text-slate-900">
                    {tr('Add a note for this purchase', 'Ajouter une note pour cet achat')}
                  </span>
                  <span className="mt-1 block text-sm text-violet-700/75">
                    {tr('Reason, context, or what was bought', 'Raison, contexte, ou ce qui a été acheté')}
                  </span>
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_14px_28px_rgba(124,58,237,0.28)]">
                  <Plus className="h-5 w-5" />
                </span>
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">
                    {isExpenseMode ? tr('Expense note', 'Note de dépense') : tr('Optional note', 'Note facultative')}
                  </label>
                  {isExpenseMode ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
                        +
                      </span>
                      {tr('Add detail', 'Ajouter un détail')}
                    </span>
                  ) : null}
                  {isExpenseMode && showExpenseNote ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!form.note) setShowExpenseNote(false);
                      }}
                      className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-violet-700"
                    >
                      {tr('Hide', 'Masquer')}
                    </button>
                  ) : null}
                </div>
                <textarea
                  rows={isExpenseMode ? 3 : 4}
                  value={form.note}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, note: event.target.value }));
                    setExpenseSaveFeedback(null);
                  }}
                  onFocus={() => setShowExpenseNote(true)}
                  placeholder={
                    isExpenseMode
                      ? tr('Add a short note for this purchase', 'Ajoutez une courte note pour cet achat')
                      : tr('Add a quick note if needed', 'Ajoutez une note rapide si nécessaire')
                  }
                  className={`mt-3 w-full resize-none rounded-[20px] px-4 py-3 text-sm text-slate-700 outline-none transition ${isExpenseMode ? 'border border-violet-200 bg-violet-50/40 focus:border-violet-400 focus:bg-white' : 'border border-slate-200 bg-slate-50 focus:border-violet-300 focus:bg-white'}`}
                />
              </>
            )}
          </div>

          {isExpenseMode && expenseSaveFeedback ? (
            <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {tr('Saved', 'Enregistré')} • {expenseSaveFeedback.label} • {Number(expenseSaveFeedback.amount || 0).toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US')} MAD
            </div>
          ) : null}

          <div className="sticky bottom-0 mt-6 flex flex-col gap-3 border-t border-violet-100 bg-white/92 px-1 pt-4 backdrop-blur-xl sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isExpenseMode ? tr('Save expense', 'Enregistrer la dépense') : tr('Save received funds', 'Enregistrer les fonds reçus')}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

const OperationsOverview = ({ cards, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 sm:h-32 animate-pulse rounded-xl border border-violet-100 bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Link
          to={card.href}
          key={card.label}
          className="group min-h-[150px] rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className={`rounded-xl p-2.5 ${card.iconTone}`}>
              {card.icon}
            </div>
            {card.badge ? (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${card.badgeTone}`}>
                {card.badge}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 sm:text-3xl">{card.value}</p>
        </Link>
      ))}
    </div>
  );
};

const UrgentActionsBoard = ({ items, loading }) => {
  if (loading) {
    return (
      <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
        <div className="mb-5 h-7 w-48 animate-pulse rounded bg-violet-100" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Urgent Actions', 'Actions urgentes')}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">{tr('Need attention now', 'Attention immédiate requise')}</h2>
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-8 text-center">
          <Bell className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-lg font-semibold text-emerald-700">{tr('Everything is under control', 'Tout est sous contrôle')}</p>
          <p className="mt-1 text-sm text-emerald-600">{tr('No urgent actions are waiting right now.', "Aucune action urgente n'est en attente pour le moment.")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${item.tone}`}>
                      {item.kind}
                    </span>
                    <p className="text-lg font-semibold text-slate-900">{item.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">{item.module}</span>
                    {item.meta ? (
                      <span className={`rounded-full px-3 py-1 font-semibold ${item.metaTone || 'bg-white text-slate-500'}`}>
                        {item.meta}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.secondaryAction ? (
                    item.secondaryAction.onClick ? (
                      <button
                        type="button"
                        onClick={item.secondaryAction.onClick}
                        className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        {item.secondaryAction.label}
                      </button>
                    ) : (
                      <Link
                        to={item.secondaryAction.href}
                        className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-4 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
                      >
                        {item.secondaryAction.label}
                      </Link>
                    )
                  ) : null}
                  <Link
                    to={item.primaryAction.href}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01]"
                  >
                    {item.primaryAction.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LiveOperationsGrid = ({ cards, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-xl border border-violet-100 bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {cards.map((card) => (
        <Link
          to={card.href}
          key={card.title}
          className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{card.kicker}</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
            </div>
            <div className={`rounded-2xl p-3 ${card.iconTone}`}>{card.icon}</div>
          </div>
          <div className="mt-5 space-y-3">
            {card.lines.map((line) => (
              <div key={line.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-600">{line.label}</span>
                <span className="text-sm font-semibold text-slate-900">{line.value}</span>
              </div>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
};

const ModuleShortcutGrid = ({ cards, loading }) => {
  if (loading) {
    return (
      <AdminMobileStatsRow
        contentClassName="flex gap-3 sm:grid sm:grid-cols-2 2xl:grid-cols-4"
        itemClassName="min-w-[260px] flex-none sm:min-w-0 sm:flex-auto"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl border border-violet-100 bg-white shadow-sm" />
        ))}
      </AdminMobileStatsRow>
    );
  }

  return (
    <AdminMobileStatsRow
      contentClassName="flex gap-3 sm:grid sm:grid-cols-2 2xl:grid-cols-4"
      itemClassName="min-w-[260px] flex-none sm:min-w-0 sm:flex-auto"
    >
      {cards.map((card) => {
        const className = 'block h-full w-full overflow-hidden rounded-[1.6rem] border border-violet-100 bg-white p-5 text-left shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200';
        const content = (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className={`rounded-2xl p-3 ${card.iconTone}`}>{card.icon}</div>
              {card.stat ? <span className="shrink-0 rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">{card.stat}</span> : null}
            </div>
            <h3 className="mt-4 text-[1.85rem] font-bold tracking-[-0.03em] text-slate-950 sm:text-[1.9rem] lg:text-[2rem]">{card.title}</h3>
            <p className="mt-2 line-clamp-2 text-base leading-8 text-slate-600">{card.description}</p>
            <p className="mt-5 text-base font-medium text-slate-500">{card.meta}</p>
          </div>
        );

        if (typeof card.onClick === 'function') {
          return (
            <button
              type="button"
              key={card.title}
              onClick={card.onClick}
              className={className}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            to={card.href}
            key={card.title}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </AdminMobileStatsRow>
  );
};

const AdminDashboard = () => {
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [stats, setStats] = useState({ vehicles: 0, rentals: 0, maintenance: 0, revenue: 0, tours: 0, toursToday: 0 });
  const [revenueData, setRevenueData] = useState([]);
  const [utilizationData, setUtilizationData] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [upcomingTours, setUpcomingTours] = useState([]);
  const [upcomingRentals, setUpcomingRentals] = useState([]);
  const [urgentRentals, setUrgentRentals] = useState([]);
  const [urgentStats, setUrgentStats] = useState({ overdue: 0, expiringSoon: 0 });
  const [fleetSnapshot, setFleetSnapshot] = useState({ available: 0, rented: 0, tour: 0, maintenance: 0, outOfService: 0, total: 0 });
  const [maintenanceSnapshot, setMaintenanceSnapshot] = useState({ open: 0, completed: 0, weeklyCost: 0 });
  const [tourSnapshot, setTourSnapshot] = useState({ active: 0, scheduled: 0, today: 0 });
  const [taskStats, setTaskStats] = useState({ active: 0, my: 0, open: 0, done: 0 });
  const [recentBookingsCollapsed, setRecentBookingsCollapsed] = useState(true);
  const [showReceiveFundsDrawer, setShowReceiveFundsDrawer] = useState(false);
  const [recordFundsRefreshing, setRecordFundsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const { user, session, userProfile } = useAuth();
  const navigate = useNavigate();
  const hasUpcomingRentals = upcomingRentals.length > 0;
  const hasUpcomingTours = upcomingTours.length > 0;
  const normalizedRole = String(userProfile?.role || '').toLowerCase();
  const normalizedEmail = String(userProfile?.email || '').toLowerCase();
  const normalizedAccountType = String(userProfile?.accountType || userProfile?.account_type || '').toLowerCase();
  const normalizedOrganizationRole = String(userProfile?.organizationRole || userProfile?.organization_role || '').toLowerCase();
  const canSeeRevenueTotals = (
    normalizedRole === 'owner' ||
    normalizedRole === 'admin' ||
    normalizedRole === 'business_owner' ||
    normalizedRole.includes('admin') ||
    normalizedOrganizationRole === 'org_owner' ||
    normalizedOrganizationRole === 'owner' ||
    isBusinessOwnerAccountType(normalizedAccountType) ||
    isPlatformOwnerEmail(normalizedEmail) ||
    isPlatformAdminEmail(normalizedEmail)
  );
  const todayRevenue = revenueData.length > 0
    ? Number(revenueData[revenueData.length - 1]?.revenue || 0)
    : 0;
  const canOpenRecordFunds = canRecordReceiveFunds(userProfile);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading && !hasLoadedOnce,
  });

  const handleOpenRecordFunds = useCallback(() => {
    if (!canOpenRecordFunds) {
      toast.error(tr('You do not have access to record funds.', "Vous n'avez pas accès à l'enregistrement des fonds."));
      return;
    }
    setShowReceiveFundsDrawer(true);
  }, [canOpenRecordFunds]);

  const handleRecordFundsSaved = useCallback(async () => {
    setRecordFundsRefreshing(true);
    try {
      await Promise.all([
        fetchData(),
        fetchRevenueData(),
      ]);
    } finally {
      setRecordFundsRefreshing(false);
    }
  }, []);

  const applyDashboardCoreData = useCallback((coreData) => {
    if (!coreData) return;
    setFleetSnapshot(coreData.fleetSnapshot);
    setMaintenanceSnapshot(coreData.maintenanceSnapshot);
    setStats((prev) => ({
      ...prev,
      ...coreData.stats,
    }));
    setRecentBookings(coreData.recentBookings);
    setUpcomingRentals(coreData.upcomingRentals);
    setHasLoadedOnce(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    getTaskStats(user?.id)
      .then((nextStats) => {
        if (isMounted) setTaskStats(nextStats);
      })
      .catch((error) => {
        console.warn('Dashboard task stats unavailable:', error.message || error);
      });
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const fetchUrgentRentals = useCallback(async () => {
    try {
      const now = new Date();

      // Fetch rentals with extensions and proper date fields - INCLUDING CUSTOMER PHONE
      const { data: urgentRentalsData, error } = await supabase
        .from("app_4c3a7a6153_rentals")
        .select(`
          id,
          customer_name,
          customer_phone,
          vehicle_id,
          is_impounded,
          impounded_at,
          rental_start_date,
          rental_start_time,
          rental_end_date,
          rental_end_time,
          rental_type,
          total_amount,
          deposit_amount,
          rental_status,
          payment_status,
          extensions:rental_extensions!rental_extensions_rental_id_fkey(
            id,
            extension_hours,
            status,
            created_at
          )
        `)
        .eq('rental_status', 'active')
        .order('rental_end_date', { ascending: true });

      if (error) {
        console.error('❌ Error fetching urgent rentals:', error);
        return;
      }

      console.log('📊 Fetched urgent rentals:', urgentRentalsData?.length || 0);

      const vehicleMap = await fetchVehiclesByIds((urgentRentalsData || []).map((rental) => rental.vehicle_id));
      const rentalsWithVehicles = (urgentRentalsData || []).map((rental) => ({
        ...rental,
        vehicle: vehicleMap.get(rental.vehicle_id) || null,
      }));

      // Calculate actual end time with extensions
      const calculateActualEndTime = (rental) => {
        if (!rental.rental_end_date) return null;

        let endDate = new Date(rental.rental_end_date);

        // Add end time if exists
        if (rental.rental_end_time) {
          const [hours, minutes, seconds] = rental.rental_end_time.split(':').map(Number);
          endDate.setHours(hours, minutes, seconds || 0);
        }

        // Add extension hours
        if (rental.extensions && rental.extensions.length > 0) {
          const approvedExtensions = rental.extensions.filter(ext => ext.status === "approved");
          const totalExtensionHours = approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);
          endDate.setHours(endDate.getHours() + totalExtensionHours);
        }

        return endDate;
      };

      // Filter rentals where actual end time is within 4 hours
      const urgentRentals = rentalsWithVehicles
        .map(rental => ({
          ...rental,
          actual_end_time: calculateActualEndTime(rental)
        }))
        .filter(rental => {
          if (!rental.actual_end_time) return false;

          const timeDiff = (rental.actual_end_time - now) / (1000 * 60 * 60); // hours

          // Show rentals that are overdue or expiring within 4 hours
          return timeDiff < 4;
        })
        .sort((a, b) => a.actual_end_time - b.actual_end_time);

      const nowTime = now.getTime();
      const overdue = urgentRentals.filter(r => r.actual_end_time.getTime() < nowTime);
      const expiringSoon = urgentRentals.filter(r => r.actual_end_time.getTime() >= nowTime);

      console.log('⚠️ Urgent rentals found:', {
        total: urgentRentals.length,
        overdue: overdue.length,
        expiringSoon: expiringSoon.length
      });

      setUrgentRentals(urgentRentals || []);
      setUrgentStats({
        overdue: overdue.length,
        expiringSoon: expiringSoon.length
      });

    } catch (error) {
      console.error('❌ Error in fetchUrgentRentals:', error);
    }
  }, []);

  const loadToursDashboard = useCallback(async () => {
    if (!session?.access_token) {
      return;
    }

    try {
      const fetchedTourRows = await fetchDashboardTourRows(session.access_token);
      const groupedTours = new Map();
      const nowIso = new Date().toISOString();
      const todayString = localToday();

      (Array.isArray(fetchedTourRows) ? fetchedTourRows : []).forEach((row) => {
        const meta = extractTourBookingMeta(row.notes) || {};
        const groupId =
          meta.groupId ||
          row.group_id ||
          row.package_id ||
          row.scheduled_for ||
          row.rental_start_date ||
          row.id;
        if (!groupId) return;
        const current = groupedTours.get(groupId) || [];
        current.push({ ...row, dashboardMeta: meta });
        groupedTours.set(groupId, current);
      });

      const allTours = Array.from(groupedTours.entries())
        .map(([groupId, rows]) => {
          const sortedRows = [...rows].sort(
            (a, b) => new Date(a.rental_start_date || a.scheduled_for || a.created_at).getTime() - new Date(b.rental_start_date || b.scheduled_for || b.created_at).getTime()
          );
          const first = sortedRows[0];
          const meta = first.dashboardMeta || {};
          const statuses = sortedRows.map((row) =>
            String(
              row.rental_status ||
              row.status ||
              row.booking_payload?.rental_status ||
              'scheduled'
            ).toLowerCase()
          );
          const status = statuses.includes('active')
            ? 'active'
            : statuses.every((value) => value === 'completed')
              ? 'completed'
              : statuses.every((value) => value === 'cancelled')
                ? 'cancelled'
                : 'scheduled';

          return {
            groupId,
            packageName: meta.packageName || first.package_name || 'Tour package',
            customerName: first.customer_name || meta.customerName || 'Guest',
            guideName: meta.guideName || first.guide_name || 'Unassigned',
            guideId: meta.guideId || first.guide_id || '',
            quadCount: Number(meta.quadCount || first.quad_count || sortedRows.length || 1),
            durationHours: Number(meta.durationHours || first.duration_hours || 1),
            scheduledStartAt: meta.scheduledStartAt || first.scheduled_for || first.rental_start_date,
            startedAt: meta.startedAt || first.started_at || '',
            trackingUrl: buildTourTrackingUrl(groupId),
            status,
            totalAmount: sortedRows.reduce(
              (sum, row) => sum + Number(row.total_amount ?? row.total_amount_mad ?? row.booking_payload?.total_amount ?? 0),
              0
            ),
          };
        })
        .sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime());

      const guideIds = [...new Set(allTours.map((tour) => String(tour.guideId || '')).filter(Boolean))];
      let guidePhoneMap = new Map();

      if (guideIds.length > 0) {
        try {
          const allUsers = await getUsers();
          guidePhoneMap = new Map(
            (allUsers || [])
              .filter((user) => guideIds.includes(String(user.id)))
              .map((user) => [String(user.id), user.phone_number || ''])
          );
        } catch (guideError) {
          console.warn('Unable to load dashboard guide phones:', guideError);
        }
      }

      const toursWithGuidePhones = allTours.map((tour) => ({
        ...tour,
        guidePhone: guidePhoneMap.get(String(tour.guideId || '')) || '',
      }));
      const activeTours = toursWithGuidePhones.filter((tour) => tour.status === 'active');
      const scheduledTours = toursWithGuidePhones.filter((tour) => tour.status === 'scheduled');
      const activeTodayTours = activeTours.filter((tour) => {
        const reference = tour.startedAt || tour.scheduledStartAt;
        return getLocalDateKey(reference) === todayString;
      });
      const scheduledTodayTours = scheduledTours.filter((tour) => getLocalDateKey(tour.scheduledStartAt) === todayString);
      const dashboardTours = [...activeTours, ...scheduledTours]
        .sort((a, b) => {
          const aDate = new Date((a.status === 'active' && a.startedAt) || a.scheduledStartAt).getTime();
          const bDate = new Date((b.status === 'active' && b.startedAt) || b.scheduledStartAt).getTime();
          return aDate - bDate;
        });
      const todayTours = [...activeTodayTours, ...scheduledTodayTours];

      setUpcomingTours(dashboardTours.slice(0, 5));
      setTourSnapshot({
        active: activeTours.length,
        scheduled: scheduledTours.length,
        today: todayTours.length,
      });
      setStats((prev) => ({
        ...prev,
        tours: dashboardTours.length,
        toursToday: todayTours.length,
      }));
    } catch (tourError) {
      console.error('❌ Dashboard tour loader failed:', tourError);
    }
  }, [session?.access_token]);

  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce) {
      setLoading(true);
    }
    try {
      const now = Date.now();
      if (dashboardCoreCache && now - dashboardCoreCacheAt < DASHBOARD_CACHE_TTL_MS) {
        applyDashboardCoreData(dashboardCoreCache);
      } else {
        if (!dashboardCorePromise) {
          dashboardCorePromise = (async () => {
            const vehicleTable = await getVehicleTableName();

            const [
              vehiclesResult,
              rentalsResult,
              maintenanceResult,
              revenueResult,
              bookingsResult,
              rentalScheduleResult,
            ] = await Promise.all([
              supabase.from(vehicleTable).select('id, vehicle_type, status'),
              supabase.from('app_4c3a7a6153_rentals').select('id', { count: 'planned', head: true }).eq('rental_status', 'active'),
              supabase.from('app_687f658e98_maintenance').select('vehicle_id, status, cost, service_date, created_at'),
              supabase.from('app_4c3a7a6153_rentals').select('total_amount').eq('payment_status', 'paid'),
              supabase
                .from("app_4c3a7a6153_rentals")
                .select('id, customer_name, vehicle_id, payment_status, total_amount, created_at')
                .order("created_at", { ascending: false })
                .limit(5),
              supabase
                .from('app_4c3a7a6153_rentals')
                .select('id, customer_name, rental_start_date, rental_end_date, rental_status, rental_type, pickup_location, vehicle_id, vehicle_plate_number')
                .order('rental_start_date', { ascending: true })
                .limit(25),
            ]);

            const maintenanceRows = Array.isArray(maintenanceResult.data) ? maintenanceResult.data : [];
            const openMaintenanceRows = maintenanceRows.filter((row) => ['scheduled', 'in_progress', 'pending'].includes(String(row.status || '').toLowerCase()));
            const maintenanceCount = new Set(openMaintenanceRows.map(r => r.vehicle_id)).size;
            const totalRevenue = revenueResult.data ? revenueResult.data.reduce((acc, item) => acc + item.total_amount, 0) : 0;
            const allVehicles = Array.isArray(vehiclesResult.data) ? vehiclesResult.data : [];
            const totalVehicles = allVehicles.length;
            const startOfWeek = new Date();
            startOfWeek.setDate(startOfWeek.getDate() - 6);
            startOfWeek.setHours(0, 0, 0, 0);

            const fleetSnapshotData = {
              available: allVehicles.filter((vehicle) => vehicle.status === 'available').length,
              rented: allVehicles.filter((vehicle) => vehicle.status === 'rented').length,
              tour: allVehicles.filter((vehicle) => vehicle.status === 'tour').length,
              maintenance: allVehicles.filter((vehicle) => vehicle.status === 'maintenance').length,
              outOfService: allVehicles.filter((vehicle) => vehicle.status === 'out_of_service').length,
              total: totalVehicles,
            };

            const maintenanceSnapshotData = {
              open: openMaintenanceRows.length,
              completed: maintenanceRows.filter((row) => String(row.status || '').toLowerCase() === 'completed').length,
              weeklyCost: maintenanceRows
                .filter((row) => {
                  const serviceDate = row.service_date || row.created_at;
                  return serviceDate && new Date(serviceDate) >= startOfWeek;
                })
                .reduce((sum, row) => sum + Number(row.cost || 0), 0),
            };

            const statsData = {
              vehicles: totalVehicles,
              rentals: rentalsResult.count || 0,
              maintenance: maintenanceCount || 0,
              revenue: totalRevenue,
            };

            const { data: bookingsRaw, error: bError } = bookingsResult;
            if (bError) console.error('❌ Error fetching recent bookings', bError);
            const bookingVehicleMap = await fetchVehiclesByIds((bookingsRaw || []).map((booking) => booking.vehicle_id));
            const bookings = (bookingsRaw || []).map((booking) => ({
              ...booking,
              vehicle: bookingVehicleMap.get(booking.vehicle_id) || null,
            }));

            let normalizedUpcomingRentals = [];
            const { data: rentalScheduleRaw, error: rentalScheduleError } = rentalScheduleResult;
            if (rentalScheduleError) {
              console.error('❌ Error fetching upcoming rentals', rentalScheduleError);
            } else {
              const upcomingRentalRows = (rentalScheduleRaw || []).filter((rental) => {
                const status = String(rental.rental_status || '').toLowerCase();
                const startTime = new Date(rental.rental_start_date || '').getTime();
                return Number.isFinite(startTime) && startTime >= Date.now() && !['active', 'completed', 'cancelled'].includes(status);
              });
              const rentalVehicleMap = await fetchVehiclesByIds(upcomingRentalRows.map((rental) => rental.vehicle_id));
              normalizedUpcomingRentals = upcomingRentalRows
                .map((rental) => {
                  const vehicle = rentalVehicleMap.get(rental.vehicle_id) || null;
                  return {
                    id: rental.id,
                    customerName: rental.customer_name || 'Guest',
                    startAt: rental.rental_start_date,
                    endAt: rental.rental_end_date,
                    vehicleName: vehicle?.model || vehicle?.name || 'Vehicle',
                    plateNumber: rental.vehicle_plate_number || vehicle?.plate_number || '',
                    rentalTypeLabel: rental.rental_type ? `${String(rental.rental_type).charAt(0).toUpperCase()}${String(rental.rental_type).slice(1)}` : 'Rental',
                    pickupLocation: rental.pickup_location || '',
                  };
                })
                .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                .slice(0, 5);
            }

            return {
              stats: statsData,
              fleetSnapshot: fleetSnapshotData,
              maintenanceSnapshot: maintenanceSnapshotData,
              recentBookings: bookings,
              upcomingRentals: normalizedUpcomingRentals,
            };
          })();
        }

        const coreData = await dashboardCorePromise;
        dashboardCoreCache = coreData;
        dashboardCoreCacheAt = Date.now();
        applyDashboardCoreData(coreData);
      }

      scheduleBackgroundTask(async () => {
        try {
          const vehicleTable = await getVehicleTableName();
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const [
            revenueTrendResult,
            allRentalsResult,
            allVehiclesResult,
          ] = await Promise.all([
            supabase
              .from('app_4c3a7a6153_rentals')
              .select('created_at, total_amount')
              .eq('payment_status', 'paid')
              .gte('created_at', sevenDaysAgo.toISOString()),
            supabase.from('app_4c3a7a6153_rentals').select('vehicle_id'),
            supabase.from(vehicleTable).select("id, vehicle_type")
          ]);

          if (revenueTrendResult.error) {
            console.error('❌ Error fetching revenue trend', revenueTrendResult.error);
          } else {
            const dailyRevenue = {};
            (revenueTrendResult.data || []).forEach((rental) => {
              const date = new Date(rental.created_at).toISOString().split('T')[0];
              if (!dailyRevenue[date]) dailyRevenue[date] = 0;
              dailyRevenue[date] += rental.total_amount;
            });

            const last7DaysData = Array(7).fill(0).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().split('T')[0];
              return {
                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                revenue: dailyRevenue[dateStr] || 0,
              };
            }).reverse();
            setRevenueData(last7DaysData);
          }

          const utilization = {};
          if (allRentalsResult.data && allVehiclesResult.data) {
            const vehicleTypeMap = new Map(allVehiclesResult.data.map(v => [v.id, v.vehicle_type]));
            allRentalsResult.data.forEach((rental) => {
              const vehicleType = vehicleTypeMap.get(rental.vehicle_id);
              if (vehicleType) {
                if (!utilization[vehicleType]) utilization[vehicleType] = 0;
                utilization[vehicleType]++;
              }
            });
          }

          setUtilizationData(Object.keys(utilization).map((type) => ({ name: type, rentals: utilization[type] })));
          void fetchUrgentRentals();
        } catch (backgroundError) {
          console.error('❌ Error hydrating dashboard secondary data:', backgroundError);
        }
      });

    } catch (error) {
      console.error('❌ Error in fetchData:', error);
    } finally {
      dashboardCorePromise = null;
      setLoading(false);
    }
  }, [applyDashboardCoreData, fetchUrgentRentals, hasLoadedOnce]);

  // Real-time updates for urgent rentals
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-urgent-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_4c3a7a6153_rentals'
        },
        () => {
          console.log('Rental updated, refreshing urgent list...');
          fetchUrgentRentals();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rental_extensions'
        },
        () => {
          console.log('Extension updated, refreshing...');
          fetchUrgentRentals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUrgentRentals]);

  useEffect(() => {
    if (!session?.access_token) {
      return undefined;
    }

    if (dashboardCoreCache && Date.now() - dashboardCoreCacheAt < DASHBOARD_CACHE_TTL_MS) {
      applyDashboardCoreData(dashboardCoreCache);
    }

    fetchData();
    loadToursDashboard();

    // Refresh urgent rentals every minute
    const intervalId = setInterval(fetchUrgentRentals, 60000);
    const toursIntervalId = setInterval(loadToursDashboard, 30000);

    return () => {
      clearInterval(intervalId);
      clearInterval(toursIntervalId);
    };
  }, [applyDashboardCoreData, fetchData, fetchUrgentRentals, loadToursDashboard, session?.access_token]);

  const handleCreateRental = () => {
    navigate('/admin/rentals', { state: { openForm: true } });
  };

  const handleCreateLightRental = () => {
    navigate('/admin/rentals', {
      state: {
        openForm: true,
        wizardUiVariant: 'light',
        wizardReturnTo: '/admin/dashboard',
      },
    });
  };

  const operationsCards = [
    {
      label: tr('Active Rentals', 'Locations actives'),
      value: stats.rentals,
      caption: urgentStats.overdue > 0
        ? tr(`${urgentStats.overdue} overdue right now`, `${urgentStats.overdue} en retard maintenant`)
        : tr(`${urgentStats.expiringSoon} ending soon`, `${urgentStats.expiringSoon} se terminent bientôt`),
      href: '/admin/rentals',
      icon: <Users className="h-5 w-5 text-blue-700" />,
      iconTone: 'bg-blue-50',
      badge: urgentStats.overdue > 0 ? tr('Urgent', 'Urgent') : null,
      badgeTone: 'bg-rose-50 text-rose-600',
    },
    {
      label: tr('Active Tours', 'Tours actifs'),
      value: tourSnapshot.active,
      caption: tr(`${tourSnapshot.scheduled} more queued after live departures`, `${tourSnapshot.scheduled} autres en file après les départs en direct`),
      href: '/admin/tours',
      icon: <Compass className="h-5 w-5 text-violet-700" />,
      iconTone: 'bg-violet-50',
      badge: tourSnapshot.active > 0 ? tr('Live', 'En direct') : null,
      badgeTone: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: tr('In Maintenance', 'En maintenance'),
      value: fleetSnapshot.maintenance,
      caption: tr(`${maintenanceSnapshot.open} open records in workshop flow`, `${maintenanceSnapshot.open} dossiers ouverts à l’atelier`),
      href: '/admin/maintenance',
      icon: <Wrench className="h-5 w-5 text-amber-700" />,
      iconTone: 'bg-amber-50',
    },
    {
      label: tr('Out of Service', 'Hors service'),
      value: fleetSnapshot.outOfService,
      caption: tr('Units blocked from booking and tours', 'Unités bloquées pour les réservations et les tours'),
      href: '/admin/fleet',
      icon: <ShieldAlert className="h-5 w-5 text-rose-700" />,
      iconTone: 'bg-rose-50',
    },
    {
      label: tr('Tours Today', 'Tours aujourd’hui'),
      value: stats.toursToday,
      caption: tr('Today’s tour departures and returns', 'Départs et retours de tours aujourd’hui'),
      href: '/admin/tours',
      icon: <Calendar className="h-5 w-5 text-indigo-700" />,
      iconTone: 'bg-indigo-50',
    },
    {
      label: canSeeRevenueTotals ? tr('Revenue', 'Revenu') : tr("Today's Revenue", "Revenu du jour"),
      value: formatCurrency(canSeeRevenueTotals ? stats.revenue : todayRevenue),
      caption: canSeeRevenueTotals
        ? tr('Paid rental revenue in the current dataset', 'Revenu des locations payées dans les données actuelles')
        : tr("Only today's paid rental revenue", "Seulement le revenu payé d’aujourd’hui"),
      href: '/admin/finance',
      icon: <DollarSign className="h-5 w-5 text-emerald-700" />,
      iconTone: 'bg-emerald-50',
    },
  ];

  const urgentActionItems = [
    ...urgentRentals.slice(0, 3).map((rental) => {
      const timerState = calculateDashboardRentalTimer(rental, currentTime);
      const isImpounded = Boolean(rental.is_impounded);
      return {
      id: `rental-${rental.id}`,
      kind: isImpounded
        ? tr('🚨 Impounded', '🚨 Mis en fourrière')
        : timerState.isExpired
          ? tr('Expired Rental', 'Location expirée')
          : timerState.color === 'red'
            ? tr('Rental Ending', 'Location en fin')
            : timerState.color === 'orange'
              ? tr('Ending Soon', 'Fin imminente')
              : tr('Active Rental', 'Location active'),
      tone: isImpounded
        ? 'bg-amber-50 text-amber-800'
        : timerState.isExpired
          ? 'bg-rose-50 text-rose-600'
        : timerState.color === 'red'
          ? 'bg-red-50 text-red-700'
          : timerState.color === 'orange'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700',
      title: rental.customer_name,
      description: `${rental.vehicle?.model || rental.vehicle?.name || tr('Vehicle', 'Véhicule')}${rental.vehicle?.plate_number ? ` • ${rental.vehicle.plate_number}` : ''}`,
      module: tr('Rental Management', 'Gestion des locations'),
      meta: isImpounded ? `${tr('Held since', 'En fourrière depuis')} ${formatDashboardDateTime(rental.impounded_at)}` : timerState.text,
      metaTone: isImpounded ? 'border border-amber-200 bg-amber-50 text-amber-800' : timerState.badgeClass,
      primaryAction: { href: `/admin/rentals/${rental.id}`, label: tr('Open rental', 'Ouvrir la location') },
      secondaryAction: rental.customer_phone ? { label: tr('WhatsApp', 'WhatsApp'), onClick: () => sendWhatsAppReminder(rental) } : null,
      };
    }),
    ...(tourSnapshot.active > 0 || tourSnapshot.scheduled > 0 ? [{
      id: 'tour-operations',
      kind: tr('Tours Queue', 'File des tours'),
      tone: 'bg-violet-50 text-violet-700',
      title: `${tourSnapshot.active} ${tr('live tours', 'tours en direct')} ${tr('and', 'et')} ${tourSnapshot.scheduled} ${tr('scheduled', 'programmés')}`,
      description: '',
      module: tr('Tours & Booking', 'Tours et réservations'),
      meta: `${stats.toursToday} ${tr('departures today', "départs aujourd'hui")}`,
      primaryAction: { href: '/admin/tours', label: tr('Open tours', 'Ouvrir les tours') },
      secondaryAction: tourSnapshot.active > 0 ? { href: '/admin/live-map', label: tr('Live map', 'Carte en direct') } : null,
    }] : []),
    ...((fleetSnapshot.outOfService > 0 || fleetSnapshot.maintenance > 0) ? [{
      id: 'fleet-attention',
      kind: tr('Fleet Attention', 'Alerte flotte'),
      tone: 'bg-blue-50 text-blue-700',
      title: `${fleetSnapshot.outOfService} ${tr('out of service', 'hors service')} • ${fleetSnapshot.maintenance} ${tr('in maintenance', 'en maintenance')}`,
      description: '',
      module: tr('Fleet Management', 'Gestion de flotte'),
      meta: `${fleetSnapshot.available} ${tr('available now', 'disponibles maintenant')}`,
      primaryAction: { href: '/admin/fleet', label: tr('Open fleet', 'Ouvrir la flotte') },
      secondaryAction: { href: '/admin/maintenance', label: tr('Maintenance', 'Maintenance') },
    }] : []),
  ];

  const liveOperationsCards = [
    {
      kicker: tr('Live Operations', 'Opérations en direct'),
      title: tr('Tours', 'Tours'),
      description: tr('Track departures and route activity without leaving the dashboard.', 'Suivez les départs et l’activité des itinéraires sans quitter le tableau de bord.'),
      href: '/admin/tours',
      icon: <MapIcon className="h-5 w-5 text-violet-700" />,
      iconTone: 'bg-violet-50',
      lines: [
        { label: tr('Active tours', 'Tours actifs'), value: tourSnapshot.active },
        { label: tr('Scheduled next', 'Prochains programmés'), value: tourSnapshot.scheduled },
        { label: tr('Today', "Aujourd'hui"), value: stats.toursToday },
      ],
    },
    {
      kicker: tr('Fleet Live', 'Flotte en direct'),
      title: tr('Fleet', 'Flotte'),
      description: tr('See the real vehicle mix available for rentals, tours, and workshop flow.', 'Visualisez la répartition réelle des véhicules disponibles pour les locations, les tours et le flux atelier.'),
      href: '/admin/fleet',
      icon: <Car className="h-5 w-5 text-indigo-700" />,
      iconTone: 'bg-indigo-50',
      lines: [
        { label: tr('Available', 'Disponibles'), value: fleetSnapshot.available },
        { label: tr('Rented / Tour', 'Location / Tour'), value: fleetSnapshot.rented + fleetSnapshot.tour },
        { label: tr('Out of service', 'Hors service'), value: fleetSnapshot.outOfService },
      ],
    },
    {
      kicker: tr('Workshop + Fuel', 'Atelier + carburant'),
      title: tr('Maintenance', 'Maintenance'),
      description: tr('Keep workshop workload and operating costs visible from one place.', 'Gardez la charge atelier et les coûts d’exploitation visibles depuis un seul endroit.'),
      href: '/admin/maintenance',
      icon: <Settings className="h-5 w-5 text-amber-700" />,
      iconTone: 'bg-amber-50',
      lines: [
        { label: tr('Open records', 'Fiches ouvertes'), value: maintenanceSnapshot.open },
        { label: tr('Completed records', 'Fiches terminées'), value: maintenanceSnapshot.completed },
        { label: tr('7-day cost', 'Coût sur 7 jours'), value: formatCurrency(maintenanceSnapshot.weeklyCost) },
      ],
    },
  ];

  const moduleCards = [
    ...(canOpenRecordFunds ? [{
      title: tr('Cashflow', 'Cashflow'),
      href: '#',
      description: tr('Log cash, deposits, or transfers fast.', "Enregistrez espèces, dépôts ou virements rapidement."),
      meta: tr('Daily shortcut', 'Raccourci quotidien'),
      icon: <DollarSign className="h-5 w-5 text-emerald-700" />,
      iconTone: 'bg-emerald-50',
      onClick: () => {
        handleOpenRecordFunds();
      },
    }] : []),
    { title: tr('Tours & Booking', 'Tours et réservations'), href: '/admin/tours', description: tr('Live tours and guest bookings.', 'Tours en direct et réservations clients.'), meta: `${tourSnapshot.active} ${tr('live', 'en direct')} • ${tourSnapshot.scheduled} ${tr('queued', 'en attente')}`, stat: `${stats.toursToday} ${tr('today', "aujourd'hui")}`, icon: <Compass className="h-5 w-5 text-violet-700" />, iconTone: 'bg-violet-50' },
    { title: tr('Team Tasks', 'Taches equipe'), href: '/admin/tasks', description: tr('Shared operations tasks.', 'Tâches opérationnelles partagées.'), meta: `${taskStats.my} ${tr('mine', 'a moi')} • ${taskStats.open} ${tr('open', 'ouvertes')}`, stat: `${taskStats.active} ${tr('active', 'actives')}`, icon: <ClipboardList className="h-5 w-5 text-violet-700" />, iconTone: 'bg-violet-50' },
    { title: tr('Pricing Management', 'Gestion tarifaire'), href: '/admin/pricing', description: tr('Rates, deposits, and packages.', 'Tarifs, cautions et forfaits.'), meta: tr('Rental, tour, fuel, and extensions', 'Location, tours, carburant et extensions'), icon: <WalletCards className="h-5 w-5 text-indigo-700" />, iconTone: 'bg-indigo-50' },
    { title: tr('Fleet Management', 'Gestion de flotte'), href: '/admin/fleet', description: tr('Fleet status and availability.', 'Statut et disponibilité de la flotte.'), meta: `${fleetSnapshot.available} ${tr('available', 'disponibles')} • ${fleetSnapshot.outOfService} ${tr('blocked', 'bloqués')}`, stat: `${fleetSnapshot.total} ${tr('units', 'unités')}`, icon: <Car className="h-5 w-5 text-blue-700" />, iconTone: 'bg-blue-50' },
    { title: tr('Quad Maintenance', 'Maintenance des quads'), href: '/admin/maintenance', description: tr('Workshop records and repairs.', 'Fiches atelier et réparations.'), meta: `${maintenanceSnapshot.open} ${tr('open', 'ouvertes')} • ${maintenanceSnapshot.completed} ${tr('completed', 'terminées')}`, icon: <Wrench className="h-5 w-5 text-amber-700" />, iconTone: 'bg-amber-50' },
    { title: tr('Fuel Management', 'Gestion carburant'), href: '/admin/fuel', description: tr('Tank activity and refills.', 'Activité du réservoir et ravitaillements.'), meta: tr('Fuel board and transfer logs', 'Tableau carburant et journaux de transfert'), icon: <Fuel className="h-5 w-5 text-cyan-700" />, iconTone: 'bg-cyan-50' },
    { title: tr('Finance', 'Finance'), href: '/admin/finance', description: tr('Revenue and reports.', 'Revenus et rapports.'), meta: canSeeRevenueTotals ? formatCurrency(stats.revenue) : formatCurrency(todayRevenue), icon: <DollarSign className="h-5 w-5 text-emerald-700" />, iconTone: 'bg-emerald-50' },
    { title: tr('Alerts', 'Alertes'), href: '/admin/alerts', description: tr('Priority items that need action.', 'Actions prioritaires à traiter.'), meta: `${urgentActionItems.length} ${tr('high-priority items', 'éléments prioritaires')}`, icon: <Bell className="h-5 w-5 text-rose-700" />, iconTone: 'bg-rose-50' },
    { title: tr('User Management', 'Gestion des utilisateurs'), href: '/admin/users', description: tr('Roles and access control.', 'Rôles et contrôle d’accès.'), meta: tr('Permissions across all modules', 'Permissions sur tous les modules'), icon: <Users className="h-5 w-5 text-slate-700" />, iconTone: 'bg-slate-100' },
  ];

  if (loading && !hasLoadedOnce && !suppressBlockingLoader) {
    return <AdminWorkspaceLoadingShell eyebrow={tr('Dashboard', 'Tableau de bord')} title={tr('Dashboard', 'Tableau de bord')} description={tr('Preparing live operations, revenue, fleet, and rental summaries.', 'Préparation des opérations en direct, revenus, flotte et résumés de location.')} cardRows={2} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile Floating Action Button */}
      <button
        onClick={handleCreateRental}
        className="app-floating-primary sm:hidden fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_18px_36px_rgba(79,70,229,0.35)] transition-all hover:scale-[1.02]"
        aria-label={tr('Create New Rental', 'Créer une location')}
      >
        <Plus className="w-6 h-6" />
      </button>

      <div className="space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 lg:px-8">
        <section className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)]">
                  <Smartphone className="h-6 w-6 text-violet-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Dashboard', 'Tableau de bord')}</p>
                  <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.03em] text-slate-950 sm:text-[2.5rem]">
                    {tr('Dashboard', 'Tableau de bord')}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {canOpenRecordFunds ? (
                  <button
                    type="button"
                    onClick={handleOpenRecordFunds}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(16,185,129,0.22)] transition-all hover:scale-[1.01]"
                  >
                    <DollarSign className="h-4 w-4" />
                    {recordFundsRefreshing ? tr('Refreshing…', 'Actualisation…') : tr('Cashflow', 'Cashflow')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleCreateRental}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.25)] transition-all hover:scale-[1.01]"
                >
                  <Plus className="h-4 w-4" />
                  {tr('Create Rental', 'Créer une location')}
                </button>
                <button
                  type="button"
                  onClick={handleCreateLightRental}
                  className="inline-flex items-center gap-2 rounded-2xl border border-violet-200/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-[0_10px_22px_rgba(76,29,149,0.08)] transition-all hover:border-violet-300 hover:bg-violet-50"
                >
                  <Plus className="h-4 w-4" />
                  {tr('Light Version', 'Version légère')}
                </button>
                <Link
                  to="/admin/tours"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-200 hover:text-violet-700"
                >
                  <Compass className="h-4 w-4" />
                  {tr('Tours', 'Tours')}
                </Link>
                <Link
                  to="/admin/live-map"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-200 hover:text-violet-700"
                >
                  <MapIcon className="h-4 w-4" />
                  {tr('Live Map', 'Carte en direct')}
                </Link>
                <Link
                  to="/admin/alerts"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-200 hover:text-violet-700"
                >
                  <Bell className="h-4 w-4" />
                  {tr('Alerts', 'Alertes')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr("Today's Operations", 'Opérations du jour')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{tr('Operational overview', 'Vue d’ensemble opérationnelle')}</h2>
          </div>
          <OperationsOverview cards={operationsCards} loading={loading} />
        </section>

        <section className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2">
          <UpcomingRentals rentals={upcomingRentals} loading={loading} />
          <UpcomingTours tours={upcomingTours} loading={loading} />
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Attention Needed', 'Attention requise')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{tr('Urgent rentals and follow-up actions', 'Locations urgentes et actions de suivi')}</h2>
          </div>
          <UrgentActionsBoard items={urgentActionItems} loading={loading} />
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Live Operations', 'Opérations en direct')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{tr('Tours, fleet, and workshop at a glance', 'Tours, flotte et atelier en un coup d’œil')}</h2>
          </div>
          <LiveOperationsGrid cards={liveOperationsCards} loading={loading} />
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Business Health', 'Santé de l’activité')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{tr('Performance and booking flow', 'Performance et flux de réservation')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <RevenueChart data={revenueData} loading={loading} />
            <VehicleUtilizationChart data={utilizationData} loading={loading} />
          </div>
          <RecentBookings
            bookings={recentBookings}
            loading={loading}
            collapsed={recentBookingsCollapsed}
            onToggle={() => setRecentBookingsCollapsed((value) => !value)}
          />
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Module Shortcuts', 'Raccourcis des modules')}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{tr('Open the module you need', 'Ouvrez directement le bon module')}</h2>
          </div>
          <ModuleShortcutGrid cards={moduleCards} loading={loading} />
        </section>

        <div className="sm:hidden rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          <div className="flex justify-between items-center">
            <div className="text-center">
              <div className="text-xs text-slate-500">{tr('Utilization', 'Utilisation')}</div>
              <div className="text-lg font-bold text-slate-800">
                {utilizationData.length > 0
                  ? `${Math.round((utilizationData.reduce((a, b) => a + b.rentals, 0) / Math.max(stats.vehicles, 1)) * 100)}%`
                  : '0%'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">{tr('Avg. Rental', 'Location moyenne')}</div>
              <div className="text-lg font-bold text-slate-800">
                {stats.rentals > 0 ? Math.round(stats.revenue / stats.rentals) : 0} MAD
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">{tr('Today', 'Aujourd’hui')}</div>
              <div className="text-lg font-bold text-slate-800">
                {recentBookings.filter(b =>
                  new Date(b.created_at).toDateString() === new Date().toDateString()
                ).length}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DashboardReceiveFundsDrawer
        open={showReceiveFundsDrawer}
        onClose={() => setShowReceiveFundsDrawer(false)}
        onRecorded={handleRecordFundsSaved}
        userProfile={userProfile}
      />
    </div>
  );
};

export default AdminDashboard;
