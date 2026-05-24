import VehicleService from './VehicleService';
import RentalService from './RentalService';
import MaintenanceService from './MaintenanceService';
import { deriveEffectiveRentalStatus } from '../utils/rentalLifecycle';

const UPCOMING_RENTAL_STATUSES = new Set(['scheduled', 'reserved', 'confirmed']);
const DASHBOARD_QUERY_TIMEOUT_MS = 4500;

const formatVehicleName = (vehicle = {}) =>
  vehicle?.model || vehicle?.name || 'Vehicle';

const composeRentalDateTime = (dateValue, timeValue, fallbackTime = '00:00') => {
  if (!dateValue) return null;

  const source = String(dateValue);
  if (source.includes('T')) {
    const parsed = new Date(source);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const composed = new Date(`${source}T${timeValue || fallbackTime}:00`);
  return Number.isNaN(composed.getTime()) ? null : composed;
};

const withSoftTimeout = async (task, fallbackValue, label) => {
  let timeoutId = null;

  try {
    return await Promise.race([
      Promise.resolve().then(() => task()),
      new Promise((resolve) => {
        timeoutId = globalThis.setTimeout(() => {
          console.warn(`Dashboard workspace query timed out: ${label}`);
          resolve(fallbackValue);
        }, DASHBOARD_QUERY_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(`Dashboard workspace query failed: ${label}`, error);
    return fallbackValue;
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

const sumPaidRentalRevenue = (rentals = []) =>
  (rentals || []).reduce((sum, rental) => {
    if (String(rental?.payment_status || '').trim().toLowerCase() !== 'paid') {
      return sum;
    }

    return sum + (Number(rental?.total_amount || 0) || 0);
  }, 0);

const mapUpcomingRentals = (rentals = []) =>
  (rentals || [])
    .map((rental) => {
      const effectiveStatus = String(
        deriveEffectiveRentalStatus(rental) || rental?.rental_status || rental?.status || ''
      ).toLowerCase();
      const startAt = composeRentalDateTime(
        rental?.rental_start_date,
        rental?.rental_start_time,
        '00:00'
      );
      const endAt = composeRentalDateTime(
        rental?.rental_end_date,
        rental?.rental_end_time,
        '23:59'
      );

      return {
        id: rental.id,
        customerName: rental.customer_name || 'Guest',
        startAt: startAt?.toISOString() || rental?.rental_start_date || '',
        endAt: endAt?.toISOString() || rental?.rental_end_date || '',
        vehicleName: formatVehicleName(rental.vehicle),
        plateNumber: rental.vehicle_plate_number || rental.vehicle?.plate_number || '',
        rentalTypeLabel: rental.rental_type
          ? `${String(rental.rental_type).charAt(0).toUpperCase()}${String(rental.rental_type).slice(1)}`
          : 'Rental',
        pickupLocation: rental.pickup_location || '',
        effectiveStatus,
        sortStartTime: startAt?.getTime() ?? Number.POSITIVE_INFINITY,
        sortEndTime: endAt?.getTime() ?? Number.NaN,
      };
    })
    .filter((rental) => {
      if (!UPCOMING_RENTAL_STATUSES.has(rental.effectiveStatus)) {
        return false;
      }

      if (Number.isFinite(rental.sortEndTime)) {
        return rental.sortEndTime >= Date.now();
      }

      return Number.isFinite(rental.sortStartTime) && rental.sortStartTime >= Date.now();
    })
    .sort((a, b) => a.sortStartTime - b.sortStartTime)
    .map(({ effectiveStatus, sortStartTime, sortEndTime, ...rental }) => rental);

class DashboardWorkspaceService {
  async getCoreSnapshot() {
    const [
      allVehicles,
      maintenanceRows,
      allRentalsDetailed,
    ] = await Promise.all([
      withSoftTimeout(() => VehicleService.getAllVehicles(), [], 'core vehicles'),
      withSoftTimeout(() => MaintenanceService.getAllMaintenanceRecords(), [], 'core maintenance'),
      withSoftTimeout(() => RentalService.getAllRentalsDetailed(), [], 'core rentals'),
    ]);

    const vehicles = Array.isArray(allVehicles) ? allVehicles : [];
    const maintenanceRecords = Array.isArray(maintenanceRows) ? maintenanceRows : [];
    const detailedRentals = Array.isArray(allRentalsDetailed) ? allRentalsDetailed : [];
    const upcomingRentalEntries = mapUpcomingRentals(detailedRentals);
    const activeRentalsCount = detailedRentals.filter((rental) =>
      String(deriveEffectiveRentalStatus(rental) || rental?.rental_status || rental?.status || '').toLowerCase() === 'active'
    ).length;
    const openMaintenanceRows = maintenanceRecords.filter((row) =>
      ['scheduled', 'in_progress', 'pending'].includes(String(row?.status || '').toLowerCase())
    );
    const maintenanceCount = new Set(openMaintenanceRows.map((row) => row.vehicle_id)).size;
    const totalRevenue = sumPaidRentalRevenue(detailedRentals);
    const recentBookings = detailedRentals.slice(0, 5);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    const fleetStats = {
      total: vehicles.length,
      available: vehicles.filter((vehicle) => vehicle.status === 'available').length,
      rented: vehicles.filter((vehicle) => vehicle.status === 'rented').length,
      reserved: vehicles.filter((vehicle) => vehicle.status === 'reserved').length,
      maintenance: vehicles.filter((vehicle) => vehicle.status === 'maintenance').length,
      out_of_service: vehicles.filter((vehicle) => vehicle.status === 'out_of_service').length,
    };

    return {
      stats: {
        vehicles: vehicles.length,
        rentals: activeRentalsCount || 0,
        scheduledRentals: upcomingRentalEntries.length,
        maintenance: maintenanceCount || 0,
        revenue: totalRevenue || 0,
      },
      fleetSnapshot: {
        available: fleetStats.available || 0,
        rented: fleetStats.rented || 0,
        tour: vehicles.filter((vehicle) => vehicle.status === 'tour').length,
        maintenance: fleetStats.maintenance || 0,
        outOfService: fleetStats.out_of_service || 0,
        total: fleetStats.total || vehicles.length,
      },
      maintenanceSnapshot: {
        open: openMaintenanceRows.length,
        completed: maintenanceRecords.filter((row) => String(row?.status || '').toLowerCase() === 'completed').length,
        weeklyCost: maintenanceRecords
          .filter((row) => {
            const serviceDate = row?.service_date || row?.created_at;
            return serviceDate && new Date(serviceDate) >= startOfWeek;
          })
          .reduce((sum, row) => sum + Number(row?.cost || 0), 0),
      },
      recentBookings: Array.isArray(recentBookings) ? recentBookings : [],
      upcomingRentals: upcomingRentalEntries,
    };
  }

  async getSecondarySnapshot() {
    const [allRentalsDetailed, allVehicles] = await Promise.all([
      withSoftTimeout(() => RentalService.getAllRentalsDetailed(), [], 'secondary rentals'),
      withSoftTimeout(() => VehicleService.getAllVehicles(), [], 'secondary vehicles'),
    ]);

    const dailyRevenue = {};
    (allRentalsDetailed || []).forEach((rental) => {
      if (String(rental?.payment_status || '').trim().toLowerCase() !== 'paid') {
        return;
      }
      const date = new Date(rental.created_at).toISOString().split('T')[0];
      if (!dailyRevenue[date]) dailyRevenue[date] = 0;
      dailyRevenue[date] += Number(rental.total_amount || 0);
    });

    const revenueData = Array(7).fill(0).map((_, index) => {
      const d = new Date();
      d.setDate(d.getDate() - index);
      const dateStr = d.toISOString().split('T')[0];
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: dailyRevenue[dateStr] || 0,
      };
    }).reverse();

    const vehicleTypeMap = new Map((allVehicles || []).map((vehicle) => [vehicle.id, vehicle.vehicle_type]));
    const utilization = {};
    (allRentalsDetailed || []).forEach((rental) => {
      const vehicleType = vehicleTypeMap.get(rental.vehicle_id);
      if (!vehicleType) return;
      utilization[vehicleType] = (utilization[vehicleType] || 0) + 1;
    });

    return {
      revenueData,
      utilizationData: Object.keys(utilization).map((type) => ({
        name: type,
        rentals: utilization[type],
      })),
    };
  }
}

const dashboardWorkspaceService = new DashboardWorkspaceService();
export default dashboardWorkspaceService;
