import { supabase } from '../lib/supabase';
import FuelTransactionService from './FuelTransactionService';
import sharedQueryCacheService from './SharedQueryCacheService';
import VehicleReportService from './VehicleReportService';
import { deriveEffectiveRentalStatus, normalizeRentalLifecycle } from '../utils/rentalLifecycle';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';

const buildRentalListQuery = ({ statusFilter = 'all', paymentStatusFilter = 'all', from = 0, to = 9 }) => {
  const shouldFilterClientSide = statusFilter && statusFilter !== 'all';
  let query = supabase
    .from(RENTALS_TABLE)
    .select(`
      id,
      rental_id,
      customer_id,
      customer_name,
      customer_email,
      customer_phone,
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
      payment_status,
      approval_status,
      pending_total_request,
      total_amount,
      deposit_amount,
      fuel_charge,
      end_fuel_level,
      unit_price,
      quantity_days,
      quantity_hours,
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
      status,
      vehicle:${VEHICLES_TABLE}!app_4c3a7a6153_rentals_vehicle_id_fkey(
        id,
        name,
        model,
        plate_number,
        status,
        vehicle_type
      ),
      extensions:rental_extensions!rental_extensions_rental_id_fkey(
        id,
        extension_hours,
        extension_price,
        status,
        created_at
      )
    `, { count: 'planned' })
    .order('created_at', { ascending: false });

  if (!shouldFilterClientSide) {
    query = query.range(from, to);
  }

  if (paymentStatusFilter && paymentStatusFilter !== 'all') {
    query = query.eq('payment_status', paymentStatusFilter);
  }

  return query;
};

const buildDateCountQuery = (fromDate, toDate, statusFilter = 'all', paymentStatusFilter = 'all') => {
  let query = supabase
    .from(RENTALS_TABLE)
    .select('id', { count: 'exact', head: true })
    .gte('rental_start_date', fromDate.toISOString())
    .lt('rental_start_date', toDate.toISOString());

  if (paymentStatusFilter && paymentStatusFilter !== 'all') {
    query = query.eq('payment_status', paymentStatusFilter);
  }

  return query;
};

class RentalSummaryService {
  async getListSummary({
    statusFilter = 'all',
    paymentStatusFilter = 'all',
    page = 1,
    limit = 10,
  } = {}) {
    return sharedQueryCacheService.fetchQuery(
      'rentals-summary',
      { statusFilter, paymentStatusFilter, page, limit },
      async () => {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);

        const dayOfWeek = startOfToday.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const [
          { data: rentals, error: rentalsError, count },
          { data: vehicles, error: vehiclesError },
          { data: rentalOverviewRows, error: rentalOverviewError },
          { count: dayCount, error: dayError },
          { count: weekCount, error: weekError },
          vehicleStates,
        ] = await Promise.all([
          buildRentalListQuery({ statusFilter, paymentStatusFilter, from, to }),
          supabase.from(VEHICLES_TABLE).select('id,status').order('id', { ascending: true }),
          supabase
            .from(RENTALS_TABLE)
            .select('vehicle_id, rental_status, status, started_at, completed_at, is_impounded, impounded_at, released_from_impound_at, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(status)')
            .in('rental_status', ['active', 'scheduled', 'confirmed', 'completed', 'impounded']),
          buildDateCountQuery(startOfToday, endOfToday, statusFilter, paymentStatusFilter),
          buildDateCountQuery(startOfWeek, endOfWeek, statusFilter, paymentStatusFilter),
          FuelTransactionService.getVehicleFuelStatesFast(),
        ]);

        if (rentalsError) throw rentalsError;
        if (vehiclesError) throw vehiclesError;
        if (rentalOverviewError) throw rentalOverviewError;
        if (dayError) throw dayError;
        if (weekError) throw weekError;

        const normalizedRentals = (rentals || []).map(normalizeRentalLifecycle);
        const filteredRentals = statusFilter === 'all'
          ? normalizedRentals
          : normalizedRentals.filter((rental) => deriveEffectiveRentalStatus(rental) === statusFilter);
        const paginatedFilteredRentals = statusFilter === 'all'
          ? filteredRentals
          : filteredRentals.slice(from, to + 1);

        const rentalIds = paginatedFilteredRentals.map((rental) => rental.id).filter(Boolean);
        const rentalReportMap = rentalIds.length
          ? await VehicleReportService.getLatestReportsForRentals(rentalIds).catch(() => ({}))
          : {};

        const activeVehicleIds = new Set();
        const scheduledVehicleIds = new Set();
        (rentalOverviewRows || []).forEach((row) => {
          const vehicleId = row?.vehicle_id ? String(row.vehicle_id) : '';
          const status = deriveEffectiveRentalStatus(row);
          if (!vehicleId) return;
          if (status === 'active') {
            activeVehicleIds.add(vehicleId);
          } else if (status === 'scheduled' || status === 'confirmed') {
            scheduledVehicleIds.add(vehicleId);
          }
        });

        const vehicleFuelStateMap = {};
        (vehicleStates || []).forEach((state) => {
          const stateKey = String(state?.vehicle_id || state?.id || '');
          if (stateKey) {
            vehicleFuelStateMap[stateKey] = state;
          }
        });

        const normalizedDateCount = async (fromDate, toDate) => {
          const { data, error } = await supabase
            .from(RENTALS_TABLE)
            .select('id, rental_status, status, started_at, completed_at, is_impounded, impounded_at, released_from_impound_at, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(status)')
            .gte('rental_start_date', fromDate.toISOString())
            .lt('rental_start_date', toDate.toISOString());

          if (error) throw error;

          const rows = (data || []).map(normalizeRentalLifecycle);
          return statusFilter === 'all'
            ? rows.length
            : rows.filter((row) => deriveEffectiveRentalStatus(row) === statusFilter).length;
        };

        const normalizedDayCount = await normalizedDateCount(startOfToday, endOfToday);
        const normalizedWeekCount = await normalizedDateCount(startOfWeek, endOfWeek);

        return {
          rentals: paginatedFilteredRentals,
          rentalReportMap,
          totalCount: statusFilter === 'all' ? (count || 0) : filteredRentals.length,
          totalPages: Math.ceil(((statusFilter === 'all' ? (count || 0) : filteredRentals.length) || 0) / limit),
          currentPage: page,
          itemsPerPage: limit,
          statusFilter,
          paymentStatusFilter,
          dateFocusCounts: {
            day: normalizedDayCount || 0,
            week: normalizedWeekCount || 0,
          },
          vehicles: vehicles || [],
          vehicleFuelStateMap,
          rentalOverviewSnapshot: {
            activeVehicleIds: [...activeVehicleIds],
            scheduledVehicleIds: [...scheduledVehicleIds].filter((vehicleId) => !activeVehicleIds.has(vehicleId)),
          },
        };
      },
      {
        ttlMs: 45 * 1000,
        staleWhileRevalidate: true,
        maxStaleMs: 3 * 60 * 1000,
      }
    );
  }
}

const rentalSummaryService = new RentalSummaryService();
export default rentalSummaryService;
