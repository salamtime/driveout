import { supabase } from '../lib/supabase';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (row) =>
  String(row?.rental_status || row?.status || '').toLowerCase();

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

const isWebsiteCustomerBooking = (row = {}) =>
  WEBSITE_BOOKING_SOURCE_FIELDS.some((field) => {
    const value = row?.[field];
    if (value === null || value === undefined) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    return WEBSITE_BOOKING_SOURCE_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
  });

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLoyaltyTier = (points = 0) => {
  if (points >= 3000) return 'VIP';
  if (points >= 1500) return 'Gold';
  if (points >= 700) return 'Silver';
  return 'Standard';
};

class CustomerExperienceService {
  async getCustomerDashboardSnapshot(user) {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) {
      return this.getEmptySnapshot(user);
    }

    const customerId = await this.resolveCustomerId(email);
    const rentals = await this.loadCustomerRentals(email, customerId);
    return this.buildSnapshot(user, rentals);
  }

  async getCustomerAccountSnapshot(user) {
    const authUser = user?.id ? user : null;
    const userId = String(authUser?.id || '').trim();
    const email = String(authUser?.email || '').trim().toLowerCase();
    const authCustomerId = userId ? `cust_auth_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}` : '';

    const fallbackProfile = {
      fullName: authUser?.user_metadata?.full_name || authUser?.email || 'Customer',
      email,
      phone: authUser?.user_metadata?.phone || '',
      city: authUser?.user_metadata?.city || 'Tangier',
      country: authUser?.user_metadata?.country || 'Morocco',
      preferredLanguage: authUser?.user_metadata?.default_language || 'en',
      accountType: authUser?.user_metadata?.account_type || 'customer',
      profilePictureUrl: null,
    };

    if (!userId) {
      return {
        profile: fallbackProfile,
        wallet: this.getEmptyWallet(),
        walletTransactions: [],
      };
    }

    const [walletResult, customerByEmailResult, customerByIdResult] = await Promise.allSettled([
      supabase
        .from('app_wallet_accounts')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      email
        ? supabase
            .from('app_4c3a7a6153_customers')
            .select('id,email,phone,full_name,city,country,scan_metadata')
            .ilike('email', email)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      authCustomerId
        ? supabase
            .from('app_4c3a7a6153_customers')
            .select('id,email,phone,full_name,city,country,scan_metadata')
            .eq('id', authCustomerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const walletRow =
      walletResult.status === 'fulfilled' && !walletResult.value.error
        ? walletResult.value.data
        : null;
    const walletId = String(walletRow?.id || walletRow?.wallet_id || '').trim();
    const customerRow =
      customerByIdResult.status === 'fulfilled' && !customerByIdResult.value.error && customerByIdResult.value.data
        ? customerByIdResult.value.data
        : customerByEmailResult.status === 'fulfilled' && !customerByEmailResult.value.error
          ? customerByEmailResult.value.data?.[0] || null
          : null;

    const [walletTransactionsResult, rentalsSnapshot] = await Promise.allSettled([
      walletId
        ? supabase
            .from('app_wallet_transactions')
            .select('*')
            .or(`wallet_account_id.eq.${walletId},wallet_id.eq.${walletId}`)
            .order('created_at', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [], error: null }),
      this.getCustomerDashboardSnapshot(authUser),
    ]);

    const walletTransactions =
      walletTransactionsResult.status === 'fulfilled' && !walletTransactionsResult.value.error && Array.isArray(walletTransactionsResult.value.data)
        ? walletTransactionsResult.value.data
        : [];
    const dashboardSnapshot =
      rentalsSnapshot.status === 'fulfilled'
        ? rentalsSnapshot.value
        : this.getEmptySnapshot(authUser);

    const approvedTopups = walletTransactions
      .filter((row) => String(row?.status || row?.transaction_status || '').toLowerCase() === 'approved')
      .filter((row) => String(row?.type || row?.transaction_type || '').toLowerCase().includes('topup'))
      .reduce((sum, row) => sum + toNumber(row?.amount), 0);

    const pendingTopups = walletTransactions
      .filter((row) => ['pending', 'submitted', 'review'].includes(String(row?.status || row?.transaction_status || '').toLowerCase()))
      .filter((row) => String(row?.type || row?.transaction_type || '').toLowerCase().includes('topup'))
      .reduce((sum, row) => sum + toNumber(row?.amount), 0);

    return {
      profile: {
        fullName: customerRow?.full_name || fallbackProfile.fullName,
        email: customerRow?.email || fallbackProfile.email,
        phone: customerRow?.phone || fallbackProfile.phone,
        city: authUser?.user_metadata?.city || customerRow?.city || fallbackProfile.city,
        country: authUser?.user_metadata?.country || customerRow?.country || fallbackProfile.country,
        preferredLanguage: authUser?.user_metadata?.default_language || fallbackProfile.preferredLanguage,
        accountType: authUser?.user_metadata?.account_type || fallbackProfile.accountType,
        profilePictureUrl: fallbackProfile.profilePictureUrl,
      },
      wallet: {
        id: walletId || null,
        balance: Math.max(0, toNumber(walletRow?.current_balance ?? walletRow?.balance ?? walletRow?.wallet_balance)),
        currencyCode: String(walletRow?.currency_code || 'MAD'),
        verificationState: String(walletRow?.verification_status || walletRow?.wallet_status || 'not_active'),
        approvedTopups: Math.round(approvedTopups),
        pendingTopups: Math.round(pendingTopups),
      },
      walletTransactions: walletTransactions.map((row) => ({
        id: String(row?.id || row?.transaction_id || Math.random()),
        type: String(row?.type || row?.transaction_type || 'activity').replace(/_/g, ' '),
        amount: toNumber(row?.amount),
        status: String(row?.status || row?.transaction_status || 'pending'),
        createdAt: row?.created_at || row?.updated_at || null,
        note: row?.description || row?.notes || row?.reason || '',
      })),
      loyalty: dashboardSnapshot.loyalty,
      recent: dashboardSnapshot.recent,
      upcoming: dashboardSnapshot.upcoming,
    };
  }

  async resolveCustomerId(email) {
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('id,email')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();

      if (error) return null;
      return data?.id || null;
    } catch (error) {
      return null;
    }
  }

  async loadCustomerRentals(email, customerId) {
    const queries = [];

    if (customerId) {
      queries.push(
        supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_id,
            customer_id,
            customer_name,
            customer_email,
            booking_source,
            inventory_source,
            booking_mode,
            rental_status,
            payment_status,
            total_amount,
            deposit_amount,
            remaining_amount,
            rental_start_date,
            rental_end_date,
            actual_end_date,
            completed_at,
            created_at,
            vehicle_id,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              name,
              model,
              vehicle_type,
              plate_number,
              location,
              city,
              country
            )
          `)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
      );
    }

    if (email) {
      queries.push(
        supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_id,
            customer_id,
            customer_name,
            customer_email,
            booking_source,
            inventory_source,
            booking_mode,
            vehicle_id,
            rental_status,
            payment_status,
            total_amount,
            deposit_amount,
            remaining_amount,
            rental_start_date,
            rental_end_date,
            actual_end_date,
            completed_at,
            created_at
          `)
          .ilike('customer_email', email)
          .order('created_at', { ascending: false })
      );
    }

    if (queries.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(queries);
    const merged = new Map();

    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const { data, error } = result.value;
      if (error || !Array.isArray(data)) return;
      data.forEach((row) => {
        merged.set(String(row.id), row);
      });
    });

    const rows = Array.from(merged.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const vehicleIds = [...new Set(rows.map((row) => row?.vehicle_id).filter(Boolean))];
    let vehicleMap = new Map();

    if (vehicleIds.length > 0) {
      const { data: vehicleRows, error: vehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, vehicle_type, plate_number, location, city, country')
        .in('id', vehicleIds);

      if (!vehicleError && Array.isArray(vehicleRows)) {
        vehicleMap = new Map(vehicleRows.map((row) => [row.id, row]));
      }
    }

    return rows.map((row) => ({
      ...row,
      vehicle: row.vehicle || vehicleMap.get(row.vehicle_id) || null,
    }));
  }

  buildSnapshot(user, rentals) {
    const now = new Date();
    const safeRentals = Array.isArray(rentals) ? rentals : [];

    const normalizedRows = safeRentals.map((row) => {
      const vehicle = row.vehicle || {};
      const startDate = normalizeDate(row.rental_start_date || row.created_at);
      const endDate = normalizeDate(row.actual_end_date || row.rental_end_date || row.completed_at || row.created_at);
      const total = Math.max(0, toNumber(row.total_amount));
      const paid = Math.max(0, toNumber(row.deposit_amount));
      const status = normalizeStatus(row);
      const category = String(vehicle.vehicle_type || 'ATV');
      const modelName = [vehicle.name, vehicle.model].filter(Boolean).join(' ').trim() || 'Vehicle';

      return {
        id: String(row.id),
        rentalId: row.rental_id || `RNT-${row.id}`,
        status,
        bookingSource: row.booking_source || row.inventory_source || row.booking_mode || '',
        isWebsiteBooking: isWebsiteCustomerBooking(row),
        paymentStatus: String(row.payment_status || 'unpaid'),
        total,
        paid,
        outstanding: Math.max(0, toNumber(row.remaining_amount)),
        startDate,
        endDate,
        category,
        modelName,
        vehicleLabel: `${vehicle.plate_number || 'No plate'} • ${modelName}`,
        city: vehicle.city || 'Tangier',
        country: vehicle.country || 'Morocco',
        href: `/rent?category=${encodeURIComponent(String(category).toLowerCase())}&search=${encodeURIComponent(modelName)}`,
      };
    });

    const completed = normalizedRows.filter((row) => ['completed', 'closed'].includes(row.status));
    const active = normalizedRows.filter((row) => ['active', 'scheduled', 'confirmed', 'ready_to_finish'].includes(row.status));
    const upcoming = normalizedRows.filter((row) => row.startDate && row.startDate.getTime() >= now.getTime() && row.status !== 'completed');

    const totalSpend = Math.round(completed.reduce((sum, row) => sum + Math.max(row.paid, row.total), 0));
    const points = Math.round(completed.length * 100 + totalSpend / 20);
    const loyaltyTier = getLoyaltyTier(points);

    const categoryCount = new Map();
    const operatorCount = new Map();
    normalizedRows.forEach((row) => {
      categoryCount.set(row.category, (categoryCount.get(row.category) || 0) + 1);
      operatorCount.set(row.city, (operatorCount.get(row.city) || 0) + 1);
    });

    const favoriteCategory =
      Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'ATV';
    const favoriteRegion =
      Array.from(operatorCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || (user?.user_metadata?.city || 'Tangier');

    const rebookSuggestions = completed.slice(0, 3).map((row) => ({
      id: row.id,
      title: row.modelName,
      detail: `${row.category} • ${row.city}`,
      href: row.href,
    }));

    return {
      loyalty: {
        points,
        tier: loyaltyTier,
        totalSpend,
        completedBookings: completed.length,
        activeBookings: active.length,
      },
      profile: {
        preferredLanguage: user?.user_metadata?.default_language || 'en',
        country: user?.user_metadata?.country || 'Morocco',
        city: user?.user_metadata?.city || favoriteRegion || 'Tangier',
      },
      favorites: {
        category: favoriteCategory,
        region: favoriteRegion,
      },
      rebookSuggestions,
      upcoming: upcoming.slice(0, 4),
      recent: normalizedRows.slice(0, 6),
    };
  }

  getEmptySnapshot(user) {
    return {
      loyalty: {
        points: 0,
        tier: 'Standard',
        totalSpend: 0,
        completedBookings: 0,
        activeBookings: 0,
      },
      profile: {
        preferredLanguage: user?.user_metadata?.default_language || 'en',
        country: user?.user_metadata?.country || 'Morocco',
        city: user?.user_metadata?.city || 'Tangier',
      },
      favorites: {
        category: 'ATV',
        region: user?.user_metadata?.city || 'Tangier',
      },
      rebookSuggestions: [],
      upcoming: [],
      recent: [],
    };
  }

  getEmptyWallet() {
    return {
      id: null,
      balance: 0,
      currencyCode: 'MAD',
      verificationState: 'not_active',
      approvedTopups: 0,
      pendingTopups: 0,
    };
  }
}

const customerExperienceService = new CustomerExperienceService();

export default customerExperienceService;
