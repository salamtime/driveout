import { supabase } from '../utils/supabaseClient';

/**
 * Dashboard Service - Fixed schema mismatches
 * Corrected column names and table references based on actual database schema
 */
class DashboardService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 2 * 60 * 1000; // 2 minutes
  }

  // =================== CACHE MANAGEMENT ===================

  getCacheKey(operation, params = {}) {
    const paramStr = Object.keys(params).length ? JSON.stringify(params) : '';
    return `dashboard:${operation}:${paramStr}`;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  clearCache() {
    this.cache.clear();
  }

  // =================== KPI DATA METHODS ===================

  /**
   * Get all KPI data for dashboard
   */
  async getKPIData() {
    const cacheKey = this.getCacheKey('kpi');
    const cached = this.getCache(cacheKey);
    if (cached) return { success: true, ...cached };

    try {
      console.log('📊 Loading KPI data...');

      const [
        vehicleStats,
        rentalStats,
        revenueData,
        customerData
      ] = await Promise.all([
        this.getVehicleStats(),
        this.getRentalStats(),
        this.getRentalRevenue(),
        this.getCustomerStats()
      ]);

      const kpiData = {
        vehicles: vehicleStats,
        rentals: rentalStats,
        revenue: revenueData,
        customers: customerData,
        lastUpdated: new Date().toISOString()
      };

      this.setCache(cacheKey, kpiData);
      return { success: true, ...kpiData };
    } catch (error) {
      console.error('❌ Error loading KPI data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get vehicle statistics - FIXED: Removed non-existent 'brand' column
   */
  async getVehicleStats() {
    try {
      console.log('🚗 Loading vehicle stats...');

      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, status, vehicle_type');

      if (error) throw error;

      return {
        total: vehicles.length,
        available: vehicles.filter(v => v.status === 'available').length,
        rented: vehicles.filter(v => v.status === 'rented').length,
        maintenance: vehicles.filter(v => v.status === 'maintenance').length,
        inactive: vehicles.filter(v => v.status === 'inactive').length,
        byType: this.groupBy(vehicles, 'vehicle_type')
      };
    } catch (error) {
      console.error('❌ Error loading vehicle stats:', error);
      return {
        total: 0,
        available: 0,
        rented: 0,
        maintenance: 0,
        inactive: 0,
        byType: {}
      };
    }
  }

  /**
   * Get rental statistics - FIXED: Use correct table and columns
   */
  async getRentalStats() {
    try {
      console.log('📋 Loading rental stats...');

      const { data: rentals, error } = await supabase
        .from('saharax_0u4w4d_rentals')
        .select('id, rental_status, rental_start_date, created_at');

      if (error) throw error;

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      return {
        total: rentals.length,
        active: rentals.filter(r => r.rental_status === 'active').length,
        scheduled: rentals.filter(r => r.rental_status === 'scheduled').length,
        completed: rentals.filter(r => r.rental_status === 'completed').length,
        cancelled: rentals.filter(r => r.rental_status === 'cancelled').length,
        thisMonth: rentals.filter(r => new Date(r.created_at) >= thisMonth).length,
        thisWeek: rentals.filter(r => new Date(r.created_at) >= thisWeek).length,
        byStatus: this.groupBy(rentals, 'rental_status')
      };
    } catch (error) {
      console.error('❌ Error loading rental stats:', error);
      return {
        total: 0,
        active: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0,
        thisMonth: 0,
        thisWeek: 0,
        byStatus: {}
      };
    }
  }

  /**
   * Get rental revenue data - FIXED: Use correct column names
   */
  async getRentalRevenue() {
    try {
      console.log('💰 Loading rental revenue...');

      const { data: rentals, error } = await supabase
        .from('saharax_0u4w4d_rentals')
        .select('total_amount, rental_start_date, rental_status, created_at')
        .not('total_amount', 'is', null);

      if (error) {
        console.log('❌ Revenue query failed, using fallback');
        return {
          total: 0,
          thisMonth: 0,
          thisWeek: 0,
          average: 0,
          byMonth: {},
          trend: []
        };
      }

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const totalRevenue = rentals.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
      const thisMonthRevenue = rentals
        .filter(r => new Date(r.created_at) >= thisMonth)
        .reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
      const thisWeekRevenue = rentals
        .filter(r => new Date(r.created_at) >= thisWeek)
        .reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);

      return {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        thisWeek: thisWeekRevenue,
        average: rentals.length > 0 ? totalRevenue / rentals.length : 0,
        byMonth: this.groupRevenueByMonth(rentals),
        trend: this.calculateRevenueTrend(rentals)
      };
    } catch (error) {
      console.error('❌ Revenue query failed, using fallback');
      return {
        total: 0,
        thisMonth: 0,
        thisWeek: 0,
        average: 0,
        byMonth: {},
        trend: []
      };
    }
  }

  /**
   * Get customer statistics - FIXED: Use correct column names
   */
  async getCustomerStats() {
    try {
      console.log('👥 Loading customer stats...');

      const { data: customers, error } = await supabase
        .from('saharax_0u4w4d_rentals')
        .select('customer_name, customer_email, created_at')
        .not('customer_email', 'is', null);

      if (error) {
        console.log('❌ Customer query failed');
        return {
          total: 0,
          unique: 0,
          thisMonth: 0,
          returning: 0
        };
      }

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const uniqueEmails = new Set(customers.map(c => c.customer_email.toLowerCase()));
      const emailCounts = {};
      
      customers.forEach(c => {
        const email = c.customer_email.toLowerCase();
        emailCounts[email] = (emailCounts[email] || 0) + 1;
      });

      const returningCustomers = Object.values(emailCounts).filter(count => count > 1).length;

      return {
        total: customers.length,
        unique: uniqueEmails.size,
        thisMonth: customers.filter(c => new Date(c.created_at) >= thisMonth).length,
        returning: returningCustomers
      };
    } catch (error) {
      console.error('❌ Customer query failed');
      return {
        total: 0,
        unique: 0,
        thisMonth: 0,
        returning: 0
      };
    }
  }

  // =================== UTILITY METHODS ===================

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {});
  }

  groupRevenueByMonth(rentals) {
    return rentals.reduce((groups, rental) => {
      const date = new Date(rental.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      groups[monthKey] = (groups[monthKey] || 0) + (parseFloat(rental.total_amount) || 0);
      return groups;
    }, {});
  }

  calculateRevenueTrend(rentals) {
    const last6Months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthRevenue = rentals
        .filter(r => {
          const rentalDate = new Date(r.created_at);
          return rentalDate.getFullYear() === date.getFullYear() && 
                 rentalDate.getMonth() === date.getMonth();
        })
        .reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
      
      last6Months.push({
        month: monthKey,
        revenue: monthRevenue,
        label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      });
    }
    
    return last6Months;
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 10) {
    try {
      console.log('📈 Loading recent activity...');

      const { data: recentRentals, error } = await supabase
        .from('saharax_0u4w4d_rentals')
        .select(`
          id,
          customer_name,
          rental_status,
          total_amount,
          created_at,
          vehicle_id
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return {
        success: true,
        activities: (recentRentals || []).map(rental => ({
          id: rental.id,
          type: 'rental',
          description: `New rental by ${rental.customer_name}`,
          amount: rental.total_amount,
          status: rental.rental_status,
          timestamp: rental.created_at,
          vehicle_id: rental.vehicle_id
        }))
      };
    } catch (error) {
      console.error('❌ Error loading recent activity:', error);
      return { success: false, error: error.message, activities: [] };
    }
  }
}

// Export singleton instance
const dashboardService = new DashboardService();
export default dashboardService;