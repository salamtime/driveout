import VehicleService from './VehicleService';
import RentalService from './RentalService';
import MaintenanceService from './MaintenanceService';
import { deriveEffectiveRentalStatus } from '../utils/rentalLifecycle';

const formatVehicleName = (vehicle = {}) =>
  vehicle?.model || vehicle?.name || 'Vehicle';

const mapUpcomingRentals = (rentals = []) =>
  (rentals || [])
    .filter((rental) => {
      const status = String(rental?.rental_status || '').toLowerCase();
      const startTime = new Date(rental?.rental_start_date || '').getTime();
      return Number.isFinite(startTime) && startTime >= Date.now() && !['active', 'completed', 'cancelled'].includes(status);
    })
    .map((rental) => ({
      id: rental.id,
      customerName: rental.customer_name || 'Guest',
      startAt: rental.rental_start_date,
      endAt: rental.rental_end_date,
      vehicleName: formatVehicleName(rental.vehicle),
      plateNumber: rental.vehicle_plate_number || rental.vehicle?.plate_number || '',
      rentalTypeLabel: rental.rental_type
        ? `${String(rental.rental_type).charAt(0).toUpperCase()}${String(rental.rental_type).slice(1)}`
        : 'Rental',
      pickupLocation: rental.pickup_location || '',
    }))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);

class DashboardWorkspaceService {
  async getCoreSnapshot() {
    const [
      vehicleStatsResult,
      allVehicles,
      maintenanceRows,
      totalRevenue,
      recentBookings,
      allRentalsDetailed,
    ] = await Promise.all([
      VehicleService.getVehicleStats(),
      VehicleService.getAllVehicles(),
      MaintenanceService.getAllMaintenanceRecords(),
      RentalService.getTotalRevenue(),
      RentalService.getRecentBookings(5),
      RentalService.getAllRentalsDetailed(),
    ]);

    const vehicles = Array.isArray(allVehicles) ? allVehicles : [];
    const maintenanceRecords = Array.isArray(maintenanceRows) ? maintenanceRows : [];
    const detailedRentals = Array.isArray(allRentalsDetailed) ? allRentalsDetailed : [];
    const activeRentalsCount = detailedRentals.filter((rental) =>
      String(deriveEffectiveRentalStatus(rental) || rental?.rental_status || rental?.status || '').toLowerCase() === 'active'
    ).length;
    const openMaintenanceRows = maintenanceRecords.filter((row) =>
      ['scheduled', 'in_progress', 'pending'].includes(String(row?.status || '').toLowerCase())
    );
    const maintenanceCount = new Set(openMaintenanceRows.map((row) => row.vehicle_id)).size;
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    const fleetStats = vehicleStatsResult?.success
      ? vehicleStatsResult
      : {
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
      upcomingRentals: mapUpcomingRentals(detailedRentals),
    };
  }

  async getSecondarySnapshot() {
    const [revenueTrendRows, allRentalsDetailed, allVehicles] = await Promise.all([
      RentalService.getRevenueTrend(7),
      RentalService.getAllRentalsDetailed(),
      VehicleService.getAllVehicles(),
    ]);

    const dailyRevenue = {};
    (revenueTrendRows || []).forEach((rental) => {
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
