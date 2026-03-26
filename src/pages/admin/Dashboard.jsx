import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Car, Users, Wrench, DollarSign, TrendingUp, Clock, Plus, AlertTriangle, Bell, ChevronRight, Smartphone, MessageSquare, Calendar, Zap, Map as MapIcon, Droplets, Settings, Compass, ShieldAlert, ArrowRight, Activity, Fuel, WalletCards, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import { TABLE_NAMES } from '../../config/tableNames';
import { shortenUrl } from '../../services/UrlShortenerService';

const TOUR_BOOKING_MARKER = '[tour_booking]';

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
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString('en-US', {
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

const calculateDashboardRentalTimer = (rental, currentTime = Date.now()) => {
  if (rental?.rental_status !== 'active') {
    return {
      text: 'N/A',
      label: 'Inactive',
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
      label: 'Timer unavailable',
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
        text: 'Expired',
        label: 'Expired',
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
        label: 'Ending now',
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
        label: 'Ending soon',
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
        label: 'On time',
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
    const text = diffDays === 1 ? '1 day' : `${diffDays} days`;
    const fullText = remainingHours > 0 ? `${text} ${remainingHours}h` : text;
    const endingSoon = diffDays <= 1;
    return {
      text: fullText,
      label: endingSoon ? 'Ending soon' : 'On time',
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
    text: `${diffHours}h left`,
    label: danger ? 'Ending now' : 'Ending soon',
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
    timeStr += `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    if (diffMinutes > 0) {
      timeStr += ` and ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    }
  } else {
    timeStr += `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  }

  let message = '';

  if (isOverdue) {
    message = `Hello *${rental.customer_name}*,\n\n`;
    message += `*URGENT: Your rental is OVERDUE!*\n\n`;
    message += `Vehicle: ${rental.vehicle?.model || rental.vehicle?.name || 'N/A'}\n`;
    message += `Plate: ${rental.vehicle?.plate_number || 'N/A'}\n`;
    message += `Overdue by: *${timeStr}*\n\n`;

    if (hasBalanceDue) {
      message += `*Payment Status:* Balance due of *${balanceDue.toFixed(2)} MAD*\n\n`;
    }

    message += `Please return the vehicle immediately. Late fees may apply.\n`;
    message += `Thank you for choosing our service!`;
  } else {
    message = `Hello *${rental.customer_name}*,\n\n`;
    message += `*REMINDER: Your rental is expiring soon!*\n\n`;
    message += `Vehicle: ${rental.vehicle?.model || rental.vehicle?.name || 'N/A'}\n`;
    message += `Plate: ${rental.vehicle?.plate_number || 'N/A'}\n`;
    message += `Time remaining: *${timeStr}*\n\n`;

    if (hasBalanceDue) {
      message += `*Payment Status:* Balance due of *${balanceDue.toFixed(2)} MAD*\n`;
      message += `Please settle payment to avoid late fees.\n\n`;
    }

    message += `Thank you for choosing our service!`;
  }

  return message;
};

/**
 * Send WhatsApp reminder to customer
 * @param {Object} rental - The rental object
 */
const sendWhatsAppReminder = async (rental) => {
  if (!rental.customer_phone) {
    alert('❌ Customer phone number not available');
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

    alert(`✅ WhatsApp reminder opened for ${rental.customer_name}`);
    return true;

  } catch (error) {
    console.error('❌ Error sending WhatsApp reminder:', error);
    alert('Failed to open WhatsApp. Please try again.');
    return false;
  }
};

const sendGuideLocateMessage = async (tour) => {
  const cleanPhone = String(tour?.guidePhone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    alert('Guide phone number is not available.');
    return false;
  }

  try {
    const trackingUrl = tour?.trackingUrl || `${window.location.origin}/track/tour/${tour.groupId}`;
    const shortTrackingUrl = await shortenUrl(trackingUrl, null, 'tour_tracking');
    const message = `Open and share location now: ${shortTrackingUrl}`;
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    return true;
  } catch (error) {
    console.error('❌ Error opening guide WhatsApp:', error);
    alert('Failed to open WhatsApp. Please try again.');
    return false;
  }
};

// Overview Statistics Component
const OverviewStats = ({ stats, loading, urgentStats }) => {
  const statItems = [
    {
      icon: <Car className="w-6 h-6 text-blue-500" />,
      label: 'Total Vehicles',
      value: stats.vehicles,
      color: 'blue',
      link: '/admin/fleet',
      change: null
    },
    {
      icon: <Users className="w-6 h-6 text-green-500" />,
      label: 'Active Rentals',
      value: stats.rentals,
      color: 'green',
      link: '/admin/rentals',
      change: urgentStats ? `${urgentStats.overdue + urgentStats.expiringSoon} urgent` : null,
      changeColor: urgentStats && (urgentStats.overdue + urgentStats.expiringSoon) > 0 ? 'red' : 'gray'
    },
    {
      icon: <Wrench className="w-6 h-6 text-yellow-500" />,
      label: 'Maintenance',
      value: stats.maintenance,
      color: 'yellow',
      link: '/admin/maintenance',
      change: null
    },
    {
      icon: <DollarSign className="w-6 h-6 text-purple-500" />,
      label: 'Total Revenue',
      value: `${formatNumber(stats.revenue)} MAD`,
      color: 'purple',
      link: '/admin/finance',
      change: '+12% from last month',
      changeColor: 'green'
    },
    {
      icon: <Calendar className="w-6 h-6 text-indigo-500" />,
      label: 'Upcoming Tours',
      value: stats.tours,
      color: 'indigo',
      link: '/admin/tours',
      change: stats.toursToday ? `${stats.toursToday} today` : 'No tours today',
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
          <h3 className="text-lg font-semibold text-gray-700">Urgent Rentals</h3>
          <span className="text-sm text-green-600 font-medium">All good</span>
        </div>
        <div className="text-center py-8">
          <Bell className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500">No urgent rentals at the moment</p>
        </div>
      </div>
    );
  }

  // Mobile Booking Card Component
  const MobileBookingCard = ({ booking }) => {
    const timerState = calculateDashboardRentalTimer(booking, currentTime);
    const isOverdue = timerState.isExpired;

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

          {/* Payment Status - Show if balance due */}
          {hasBalanceDue && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs text-red-700 font-medium">Balance Due:</span>
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
                <span className="text-xs text-gray-500 font-medium truncate">End Time</span>
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
                <span className="text-xs text-gray-500 font-medium truncate">Amount</span>
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
              title={`Send WhatsApp reminder to ${booking.customer_phone || 'N/A'}`}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Remind</span>
            </button>
            <button
              onClick={handleExtend}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 flex items-center justify-center gap-2 font-semibold shadow-sm hover:shadow active:scale-[0.98]"
              title="Request extension for this rental"
            >
              <Zap className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Extend</span>
            </button>
            <button
              onClick={handleView}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all duration-200 font-semibold shadow-sm hover:shadow active:scale-[0.98] truncate"
              title="View rental details"
            >
              View
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
            <h3 className="text-lg font-bold text-gray-800">Urgent Rentals</h3>
            <p className="text-sm text-gray-500">Need immediate attention</p>
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
              <div className="text-xs text-gray-500">Expired</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {urgentRentals.filter((r) => {
                  const timer = calculateDashboardRentalTimer(r, currentTime);
                  return !timer.isExpired && (timer.color === 'orange' || timer.color === 'red');
                }).length}
              </div>
              <div className="text-xs text-gray-500">Expiring Soon</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DASHBOARD_UPCOMING_LIMIT = 4;

const UpcomingTours = ({ tours, loading }) => {
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
        <h3 className="text-lg font-semibold text-slate-700">Tours & Departures</h3>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/live-map"
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Smartphone className="w-4 h-4" />
            Open Live Map
          </Link>
          <span className="text-sm text-blue-600 font-medium">{tours.length} in queue</span>
        </div>
      </div>
      <div className="space-y-3">
        {visibleTours.map((tour) => {
          const expiredTour = isDashboardTourExpired(tour);
          const destination = tour.status === 'active' ? '/admin/live-map' : '/admin/tours?tab=bookings';

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
                      {expiredTour ? 'Expired' : tour.status === 'active' ? 'Out now' : tour.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{tour.customerName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {tour.guideName} • {tour.quadCount} quads
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
                  <p className="mt-1 text-xs text-slate-500">
                    {expiredTour ? 'Need location now' : tour.status === 'active' ? 'Tap to track live route' : 'Tap to continue booking'}
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
                    Locate Guide
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
            +{hiddenToursCount} more tours
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
        <h3 className="text-lg font-semibold text-slate-700">Upcoming Rentals</h3>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/rentals"
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Car className="w-4 h-4" />
            Open Rentals
          </Link>
          <span className="text-sm text-blue-600 font-medium">{rentals.length} upcoming</span>
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
                    Scheduled
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
                <p className="mt-1 text-xs text-slate-500">Tap to open rental</p>
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
            +{hiddenRentalsCount} more rentals
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
        <h3 className="text-lg font-semibold text-slate-700">Revenue Trend (Last 7 Days)</h3>
        <div className="flex items-center text-sm text-green-600 font-medium">
          <TrendingUp className="w-4 h-4 mr-1" />
          +8% from last week
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
              formatter={(value) => [`${Number(value).toLocaleString()} MAD`, 'Revenue']}
              labelFormatter={(label) => `Date: ${label}`}
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
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
          className="group rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)]"
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Urgent Actions</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">Need attention now</h2>
        </div>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-8 text-center">
          <Bell className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-lg font-semibold text-emerald-700">Everything is under control</p>
          <p className="mt-1 text-sm text-emerald-600">No urgent actions are waiting right now.</p>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl border border-violet-100 bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      {cards.map((card) => (
        <Link
          to={card.href}
          key={card.title}
          className="rounded-xl border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200"
        >
          <div className="flex items-center justify-between">
            <div className={`rounded-2xl p-3 ${card.iconTone}`}>{card.icon}</div>
            {card.stat ? <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">{card.stat}</span> : null}
          </div>
          <h3 className="mt-4 text-xl font-bold text-slate-900">{card.title}</h3>
          <p className="mt-2 text-sm text-slate-600">{card.description}</p>
          <p className="mt-4 text-sm font-medium text-slate-500">{card.meta}</p>
        </Link>
      ))}
    </div>
  );
};

const AdminDashboard = () => {
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
  const [recentBookingsCollapsed, setRecentBookingsCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const hasUpcomingRentals = upcomingRentals.length > 0;
  const hasUpcomingTours = upcomingTours.length > 0;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
            trackingUrl: meta.trackingUrl || `${window.location.origin}/track/tour/${groupId}`,
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
        const { data: guideRows, error: guideError } = await supabase
          .from(TABLE_NAMES.USERS)
          .select('id, phone_number')
          .in('id', guideIds);

        if (guideError) {
          console.warn('Unable to load dashboard guide phones:', guideError);
        } else {
          guidePhoneMap = new Map((guideRows || []).map((guide) => [String(guide.id), guide.phone_number || '']));
        }
      }

      const toursWithGuidePhones = allTours.map((tour) => ({
        ...tour,
        guidePhone: guidePhoneMap.get(String(tour.guideId || '')) || '',
      }));
      const activeTours = toursWithGuidePhones.filter((tour) => tour.status === 'active');
      const scheduledTours = toursWithGuidePhones.filter((tour) => tour.status === 'scheduled');
      const scheduledUpcomingTours = scheduledTours.filter((tour) => {
        const timestamp = new Date(tour.scheduledStartAt || '').getTime();
        return Number.isFinite(timestamp) ? timestamp >= Date.now() : false;
      });
      const activeTodayTours = activeTours.filter((tour) => {
        const reference = tour.startedAt || tour.scheduledStartAt;
        return getLocalDateKey(reference) === todayString;
      });
      const scheduledTodayTours = scheduledUpcomingTours.filter((tour) => getLocalDateKey(tour.scheduledStartAt) === todayString);
      const dashboardTours = [...activeTours, ...scheduledUpcomingTours]
        .sort((a, b) => {
          const aDate = new Date((a.status === 'active' && a.startedAt) || a.scheduledStartAt).getTime();
          const bDate = new Date((b.status === 'active' && b.startedAt) || b.scheduledStartAt).getTime();
          return aDate - bDate;
        });
      const todayTours = [...activeTodayTours, ...scheduledTodayTours];

      setUpcomingTours(dashboardTours.slice(0, 5));
      setTourSnapshot({
        active: activeTours.length,
        scheduled: scheduledUpcomingTours.length,
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const vehicleTable = await getVehicleTableName();

      // --- Fetch overview stats ---
      const [vehiclesResult, rentalsResult, maintenanceResult, revenueResult] = await Promise.all([
        supabase.from(vehicleTable).select('id, vehicle_type, status'),
        supabase.from('app_4c3a7a6153_rentals').select('*', { count: 'exact', head: true }).eq('rental_status', 'active'),
        supabase.from('app_687f658e98_maintenance').select('vehicle_id, status, cost, service_date, created_at'),
        supabase.from('app_4c3a7a6153_rentals').select('total_amount').eq('payment_status', 'paid')
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

      setFleetSnapshot({
        available: allVehicles.filter((vehicle) => vehicle.status === 'available').length,
        rented: allVehicles.filter((vehicle) => vehicle.status === 'rented').length,
        tour: allVehicles.filter((vehicle) => vehicle.status === 'tour').length,
        maintenance: allVehicles.filter((vehicle) => vehicle.status === 'maintenance').length,
        outOfService: allVehicles.filter((vehicle) => vehicle.status === 'out_of_service').length,
        total: totalVehicles,
      });

      setMaintenanceSnapshot({
        open: openMaintenanceRows.length,
        completed: maintenanceRows.filter((row) => String(row.status || '').toLowerCase() === 'completed').length,
        weeklyCost: maintenanceRows
          .filter((row) => {
            const serviceDate = row.service_date || row.created_at;
            return serviceDate && new Date(serviceDate) >= startOfWeek;
          })
          .reduce((sum, row) => sum + Number(row.cost || 0), 0),
      });

      setStats((prev) => ({
        ...prev,
        vehicles: totalVehicles,
        rentals: rentalsResult.count || 0,
        maintenance: maintenanceCount || 0,
        revenue: totalRevenue,
      }));

      // --- Fetch recent bookings with vehicle type ---
      const { data: bookingsRaw, error: bError } = await supabase
        .from("app_4c3a7a6153_rentals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (bError) console.error('❌ Error fetching recent bookings', bError);
      const bookingVehicleMap = await fetchVehiclesByIds((bookingsRaw || []).map((booking) => booking.vehicle_id));
      const bookings = (bookingsRaw || []).map((booking) => ({
        ...booking,
        vehicle: bookingVehicleMap.get(booking.vehicle_id) || null,
      }));
      setRecentBookings(bookings);

      const { data: rentalScheduleRaw, error: rentalScheduleError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, customer_name, rental_start_date, rental_end_date, rental_status, rental_type, pickup_location, vehicle_id, vehicle_plate_number')
        .order('rental_start_date', { ascending: true })
        .limit(25);

      if (rentalScheduleError) {
        console.error('❌ Error fetching upcoming rentals', rentalScheduleError);
        setUpcomingRentals([]);
      } else {
        const upcomingRentalRows = (rentalScheduleRaw || []).filter((rental) => {
          const status = String(rental.rental_status || '').toLowerCase();
          const startTime = new Date(rental.rental_start_date || '').getTime();
          return Number.isFinite(startTime) && startTime >= Date.now() && !['active', 'completed', 'cancelled'].includes(status);
        });
        const rentalVehicleMap = await fetchVehiclesByIds(upcomingRentalRows.map((rental) => rental.vehicle_id));
        const normalizedUpcomingRentals = upcomingRentalRows
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
        setUpcomingRentals(normalizedUpcomingRentals);
      }

      // --- Fetch and process data for Revenue Trend Chart ---
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: revenueTrendRaw, error: revenueTrendError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('created_at, total_amount')
        .eq('payment_status', 'paid')
        .gte('created_at', sevenDaysAgo.toISOString());

      if (revenueTrendError) console.error('❌ Error fetching revenue trend', revenueTrendError);

      const dailyRevenue = {};
      if (revenueTrendRaw) {
        revenueTrendRaw.forEach(rental => {
          const date = new Date(rental.created_at).toISOString().split('T')[0];
          if (!dailyRevenue[date]) dailyRevenue[date] = 0;
          dailyRevenue[date] += rental.total_amount;
        });
      }

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

      // --- Fetch and process data for Vehicle Utilization Chart ---
      const [allRentalsResult, allVehiclesResult] = await Promise.all([
        supabase.from('app_4c3a7a6153_rentals').select('vehicle_id'),
        supabase.from(vehicleTable).select("id, vehicle_type")
      ]);

      const utilization = {};
      if (allRentalsResult.data && allVehiclesResult.data) {
        const vehicleTypeMap = new Map(allVehiclesResult.data.map(v => [v.id, v.vehicle_type]));
        allRentalsResult.data.forEach(rental => {
          const vehicleType = vehicleTypeMap.get(rental.vehicle_id);
          if (vehicleType) {
            if (!utilization[vehicleType]) utilization[vehicleType] = 0;
            utilization[vehicleType]++;
          }
        });
      }
      const utilizationChartData = Object.keys(utilization).map(type => ({ name: type, rentals: utilization[type] }));
      setUtilizationData(utilizationChartData);

      // Fetch urgent rentals
      await fetchUrgentRentals();

    } catch (error) {
      console.error('❌ Error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  };

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

    fetchData();
    loadToursDashboard();

    // Refresh urgent rentals every minute
    const intervalId = setInterval(fetchUrgentRentals, 60000);
    const toursIntervalId = setInterval(loadToursDashboard, 30000);

    return () => {
      clearInterval(intervalId);
      clearInterval(toursIntervalId);
    };
  }, [fetchUrgentRentals, loadToursDashboard, session?.access_token]);

  const handleCreateRental = () => {
    navigate('/admin/rentals', { state: { openForm: true } });
  };

  const operationsCards = [
    {
      label: 'Active Rentals',
      value: stats.rentals,
      caption: urgentStats.overdue > 0 ? `${urgentStats.overdue} overdue right now` : `${urgentStats.expiringSoon} ending soon`,
      href: '/admin/rentals',
      icon: <Users className="h-5 w-5 text-blue-700" />,
      iconTone: 'bg-blue-50',
      badge: urgentStats.overdue > 0 ? 'Urgent' : null,
      badgeTone: 'bg-rose-50 text-rose-600',
    },
    {
      label: 'Active Tours',
      value: tourSnapshot.active,
      caption: `${tourSnapshot.scheduled} more queued after live departures`,
      href: '/admin/tours',
      icon: <Compass className="h-5 w-5 text-violet-700" />,
      iconTone: 'bg-violet-50',
      badge: tourSnapshot.active > 0 ? 'Live' : null,
      badgeTone: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'In Maintenance',
      value: fleetSnapshot.maintenance,
      caption: `${maintenanceSnapshot.open} open records in workshop flow`,
      href: '/admin/maintenance',
      icon: <Wrench className="h-5 w-5 text-amber-700" />,
      iconTone: 'bg-amber-50',
    },
    {
      label: 'Out of Service',
      value: fleetSnapshot.outOfService,
      caption: 'Units blocked from booking and tours',
      href: '/admin/fleet',
      icon: <ShieldAlert className="h-5 w-5 text-rose-700" />,
      iconTone: 'bg-rose-50',
    },
    {
      label: 'Tours Today',
      value: stats.toursToday,
      caption: 'Today’s tour departures and returns',
      href: '/admin/tours',
      icon: <Calendar className="h-5 w-5 text-indigo-700" />,
      iconTone: 'bg-indigo-50',
    },
    {
      label: 'Revenue',
      value: formatCurrency(stats.revenue),
      caption: 'Paid rental revenue in the current dataset',
      href: '/admin/finance',
      icon: <DollarSign className="h-5 w-5 text-emerald-700" />,
      iconTone: 'bg-emerald-50',
    },
  ];

  const urgentActionItems = [
    ...urgentRentals.slice(0, 3).map((rental) => {
      const timerState = calculateDashboardRentalTimer(rental, currentTime);
      return {
      id: `rental-${rental.id}`,
      kind: timerState.isExpired ? 'Expired Rental' : timerState.color === 'red' ? 'Rental Ending' : timerState.color === 'orange' ? 'Ending Soon' : 'Active Rental',
      tone: timerState.isExpired
        ? 'bg-rose-50 text-rose-600'
        : timerState.color === 'red'
          ? 'bg-red-50 text-red-700'
          : timerState.color === 'orange'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700',
      title: rental.customer_name,
      description: `${rental.vehicle?.model || rental.vehicle?.name || 'Vehicle'}${rental.vehicle?.plate_number ? ` • ${rental.vehicle.plate_number}` : ''}`,
      module: 'Rental Management',
      meta: timerState.text,
      metaTone: timerState.badgeClass,
      primaryAction: { href: `/admin/rentals/${rental.id}`, label: 'Open rental' },
      secondaryAction: rental.customer_phone ? { label: 'WhatsApp', onClick: () => sendWhatsAppReminder(rental) } : null,
      };
    }),
    ...(tourSnapshot.active > 0 || tourSnapshot.scheduled > 0 ? [{
      id: 'tour-operations',
      kind: 'Tours Queue',
      tone: 'bg-violet-50 text-violet-700',
      title: `${tourSnapshot.active} live tours and ${tourSnapshot.scheduled} scheduled`,
      description: '',
      module: 'Tours & Booking',
      meta: `${stats.toursToday} departures today`,
      primaryAction: { href: '/admin/tours', label: 'Open tours' },
      secondaryAction: tourSnapshot.active > 0 ? { href: '/admin/live-map', label: 'Live map' } : null,
    }] : []),
    ...((fleetSnapshot.outOfService > 0 || fleetSnapshot.maintenance > 0) ? [{
      id: 'fleet-attention',
      kind: 'Fleet Attention',
      tone: 'bg-blue-50 text-blue-700',
      title: `${fleetSnapshot.outOfService} out of service • ${fleetSnapshot.maintenance} in maintenance`,
      description: '',
      module: 'Fleet Management',
      meta: `${fleetSnapshot.available} available now`,
      primaryAction: { href: '/admin/fleet', label: 'Open fleet' },
      secondaryAction: { href: '/admin/maintenance', label: 'Maintenance' },
    }] : []),
  ];

  const liveOperationsCards = [
    {
      kicker: 'Live Operations',
      title: 'Tours',
      description: 'Track departures and route activity without leaving the dashboard.',
      href: '/admin/tours',
      icon: <MapIcon className="h-5 w-5 text-violet-700" />,
      iconTone: 'bg-violet-50',
      lines: [
        { label: 'Active tours', value: tourSnapshot.active },
        { label: 'Scheduled next', value: tourSnapshot.scheduled },
        { label: 'Today', value: stats.toursToday },
      ],
    },
    {
      kicker: 'Fleet Live',
      title: 'Fleet',
      description: 'See the real vehicle mix available for rentals, tours, and workshop flow.',
      href: '/admin/fleet',
      icon: <Car className="h-5 w-5 text-indigo-700" />,
      iconTone: 'bg-indigo-50',
      lines: [
        { label: 'Available', value: fleetSnapshot.available },
        { label: 'Rented / Tour', value: fleetSnapshot.rented + fleetSnapshot.tour },
        { label: 'Out of service', value: fleetSnapshot.outOfService },
      ],
    },
    {
      kicker: 'Workshop + Fuel',
      title: 'Maintenance',
      description: 'Keep workshop workload and operating costs visible from one place.',
      href: '/admin/maintenance',
      icon: <Settings className="h-5 w-5 text-amber-700" />,
      iconTone: 'bg-amber-50',
      lines: [
        { label: 'Open records', value: maintenanceSnapshot.open },
        { label: 'Completed records', value: maintenanceSnapshot.completed },
        { label: '7-day cost', value: formatCurrency(maintenanceSnapshot.weeklyCost) },
      ],
    },
  ];

  const moduleCards = [
    { title: 'Tours & Booking', href: '/admin/tours', description: 'Departures, live tours, and guest bookings.', meta: `${tourSnapshot.active} live • ${tourSnapshot.scheduled} queued`, stat: `${stats.toursToday} today`, icon: <Compass className="h-5 w-5 text-violet-700" />, iconTone: 'bg-violet-50' },
    { title: 'Pricing Management', href: '/admin/pricing', description: 'Rental, tour, fuel, and extension pricing controls.', meta: 'Rates, tiers, deposits, and packages', icon: <WalletCards className="h-5 w-5 text-indigo-700" />, iconTone: 'bg-indigo-50' },
    { title: 'Fleet Management', href: '/admin/fleet', description: 'Fleet status, models, and out-of-service tracking.', meta: `${fleetSnapshot.available} available • ${fleetSnapshot.outOfService} blocked`, stat: `${fleetSnapshot.total} units`, icon: <Car className="h-5 w-5 text-blue-700" />, iconTone: 'bg-blue-50' },
    { title: 'Quad Maintenance', href: '/admin/maintenance', description: 'Workshop records, parts, and vehicle repair flow.', meta: `${maintenanceSnapshot.open} open • ${maintenanceSnapshot.completed} completed`, icon: <Wrench className="h-5 w-5 text-amber-700" />, iconTone: 'bg-amber-50' },
    { title: 'Fuel Management', href: '/admin/fuel', description: 'Tank activity, vehicle fuel flow, and refills.', meta: 'Fuel board and transfer logs', icon: <Fuel className="h-5 w-5 text-cyan-700" />, iconTone: 'bg-cyan-50' },
    { title: 'Finance', href: '/admin/finance', description: 'Revenue, vehicle financial performance, and reports.', meta: formatCurrency(stats.revenue), icon: <DollarSign className="h-5 w-5 text-emerald-700" />, iconTone: 'bg-emerald-50' },
    { title: 'Alerts', href: '/admin/alerts', description: 'Unified alert inbox for fleet, fuel, maintenance, and rentals.', meta: `${urgentActionItems.length} high-priority action items`, icon: <Bell className="h-5 w-5 text-rose-700" />, iconTone: 'bg-rose-50' },
    { title: 'User Management', href: '/admin/users', description: 'Roles, permissions, and operational access control.', meta: 'Owner-managed access across all modules', icon: <Users className="h-5 w-5 text-slate-700" />, iconTone: 'bg-slate-100' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Smartphone className="h-8 w-8 text-white" />}
        eyebrow="Dashboard"
        title="Operations Dashboard"
        description={`Welcome back${user?.email ? `, ${user.email}` : ''}.`}
        actions={
          <>
            <Link
              to="/admin/tours"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <Compass className="h-4 w-4" />
              Open Tours
            </Link>
            <Link
              to="/admin/fleet"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <Car className="h-4 w-4" />
              Open Fleet
            </Link>
            <Link
              to="/admin/alerts"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <Bell className="h-4 w-4" />
              Alerts
            </Link>
            <Link
              to="/admin/live-map"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <MapIcon className="h-4 w-4" />
              Open Live Map
            </Link>
            <button
              onClick={handleCreateRental}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <Plus className="h-4 w-4" />
              Create Rental
            </button>
          </>
        }
      />

      {/* Mobile Floating Action Button */}
      <button
        onClick={handleCreateRental}
        className="sm:hidden fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_18px_36px_rgba(79,70,229,0.35)] transition-all hover:scale-[1.02]"
        aria-label="Create New Rental"
      >
        <Plus className="w-6 h-6" />
      </button>

      <div className="space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 lg:px-8">
        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Today&apos;s Operations</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Operational overview</h2>
          </div>
          <OperationsOverview cards={operationsCards} loading={loading} />
        </section>

        {(loading || hasUpcomingRentals || hasUpcomingTours) ? (
          <section className={`grid grid-cols-1 gap-5 sm:gap-6 ${hasUpcomingRentals && hasUpcomingTours ? 'xl:grid-cols-2' : ''}`}>
            {hasUpcomingRentals || loading ? <UpcomingRentals rentals={upcomingRentals} loading={loading} /> : null}
            {hasUpcomingTours || loading ? <UpcomingTours tours={upcomingTours} loading={loading} /> : null}
          </section>
        ) : null}

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Attention Needed</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Urgent rentals and follow-up actions</h2>
          </div>
          <UrgentActionsBoard items={urgentActionItems} loading={loading} />
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Live Operations</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Tours, fleet, and workshop at a glance</h2>
          </div>
          <LiveOperationsGrid cards={liveOperationsCards} loading={loading} />
        </section>

        <section className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Business Health</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Performance and booking flow</h2>
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Module Shortcuts</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Jump straight into the right workspace</h2>
          </div>
          <ModuleShortcutGrid cards={moduleCards} loading={loading} />
        </section>

        <div className="sm:hidden rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          <div className="flex justify-between items-center">
            <div className="text-center">
              <div className="text-xs text-slate-500">Utilization</div>
              <div className="text-lg font-bold text-slate-800">
                {utilizationData.length > 0
                  ? `${Math.round((utilizationData.reduce((a, b) => a + b.rentals, 0) / Math.max(stats.vehicles, 1)) * 100)}%`
                  : '0%'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">Avg. Rental</div>
              <div className="text-lg font-bold text-slate-800">
                {stats.rentals > 0 ? Math.round(stats.revenue / stats.rentals) : 0} MAD
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">Today</div>
              <div className="text-lg font-bold text-slate-800">
                {recentBookings.filter(b =>
                  new Date(b.created_at).toDateString() === new Date().toDateString()
                ).length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
