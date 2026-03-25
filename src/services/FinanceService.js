import { supabase } from '../lib/supabase';

export class FinanceService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // ============================================================================
  // CORE FINANCIAL DATA METHODS - FIXED SCHEMA
  // ============================================================================

  async getFinancialSummary(startDate, endDate, orgId = 'current') {
    try {
      console.log('💰 Fetching financial summary...');
      
      const [revenue, expenses, vehicleStats] = await Promise.all([
        this.getTotalRevenue(startDate, endDate),
        this.getTotalExpenses(startDate, endDate),
        this.getVehicleFinancialStats(startDate, endDate)
      ]);

      const grossProfit = revenue - expenses;
      const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      return {
        totalRevenue: revenue,
        totalExpenses: expenses,
        grossProfit,
        profitMargin,
        vehicleStats,
        period: `${startDate} to ${endDate}`
      };
    } catch (error) {
      console.error('❌ Error fetching financial summary:', error);
      return {
        totalRevenue: 0,
        totalExpenses: 0,
        grossProfit: 0,
        profitMargin: 0,
        vehicleStats: [],
        period: `${startDate} to ${endDate}`
      };
    }
  }

  async getTotalRevenue(startDate, endDate) {
    try {
      const { data: rentals, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('total_amount')
        .gte('rental_start_date', startDate)
        .lte('rental_end_date', endDate)
        .in('status', ['completed', 'active']);

      if (error) {
        console.error('❌ Error fetching revenue:', error);
        return 0;
      }

      const totalRevenue = rentals?.reduce((sum, rental) => {
        return sum + (Number(rental.total_amount) || 0);
      }, 0) || 0;

      console.log(`✅ Total revenue: ${totalRevenue} MAD`);
      return totalRevenue;
    } catch (error) {
      console.error('❌ Error calculating total revenue:', error);
      return 0;
    }
  }

  async getTotalExpenses(startDate, endDate) {
    try {
      // For now, estimate expenses as 40% of revenue
      const revenue = await this.getTotalRevenue(startDate, endDate);
      const estimatedExpenses = revenue * 0.4;
      
      console.log(`✅ Estimated expenses: ${estimatedExpenses} MAD`);
      return estimatedExpenses;
    } catch (error) {
      console.error('❌ Error calculating expenses:', error);
      return 0;
    }
  }

  async getVehicleFinancialStats(startDate, endDate) {
    try {
      const { data: rentals, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          vehicle_id,
          total_amount,
          saharax_0u4w4d_vehicles!inner(
            id, name, model, vehicle_type, plate_number, status
          )
        `)
        .gte('rental_start_date', startDate)
        .lte('rental_end_date', endDate)
        .in('status', ['completed', 'active']);

      if (error) {
        console.error('❌ Error fetching vehicle stats:', error);
        return [];
      }

      // Group by vehicle and calculate stats
      const vehicleStats = {};
      
      rentals?.forEach(rental => {
        const vehicleId = rental.vehicle_id;
        const amount = Number(rental.total_amount) || 0;
        
        if (!vehicleStats[vehicleId]) {
          vehicleStats[vehicleId] = {
            vehicle: rental.saharax_0u4w4d_vehicles,
            totalRevenue: 0,
            rentalCount: 0
          };
        }
        
        vehicleStats[vehicleId].totalRevenue += amount;
        vehicleStats[vehicleId].rentalCount += 1;
      });

      // Convert to array and sort by revenue
      const statsArray = Object.values(vehicleStats)
        .map(stat => ({
          ...stat,
          averageRevenue: stat.rentalCount > 0 ? stat.totalRevenue / stat.rentalCount : 0
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      console.log(`✅ Vehicle stats calculated for ${statsArray.length} vehicles`);
      return statsArray;
    } catch (error) {
      console.error('❌ Error calculating vehicle stats:', error);
      return [];
    }
  }

  // ============================================================================
  // RENTAL PROFIT & LOSS ANALYSIS
  // ============================================================================

  async getRentalProfitLoss(startDate, endDate, page = 1, pageSize = 50) {
    try {
      console.log('📊 Fetching rental P&L data...');
      
      const offset = (page - 1) * pageSize;
      
      const { data: rentals, error, count } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          saharax_0u4w4d_vehicles!inner(
            id, name, model, vehicle_type, plate_number, status
          )
        `, { count: 'exact' })
        .gte('rental_start_date', startDate)
        .lte('rental_end_date', endDate)
        .order('rental_start_date', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('❌ Error fetching rental P&L:', error);
        return { data: [], total: 0, pages: 0 };
      }

      const processedData = rentals?.map(rental => {
        const revenue = Number(rental.total_amount) || 0;
        const estimatedCosts = revenue * 0.35; // 35% cost estimate
        const grossProfit = revenue - estimatedCosts;
        const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        return {
          id: rental.id,
          rentalId: rental.rental_id || `RNT-${rental.id}`,
          customer: rental.customer_name || 'Unknown Customer',
          vehicle: rental.saharax_0u4w4d_vehicles,
          revenue,
          estimatedCosts,
          grossProfit,
          profitMargin: Math.round(profitMargin * 10) / 10,
          startDate: rental.rental_start_date,
          endDate: rental.rental_end_date,
          status: rental.status
        };
      }) || [];

      const totalPages = Math.ceil((count || 0) / pageSize);

      console.log(`✅ Rental P&L data loaded: ${processedData.length} records`);
      return {
        data: processedData,
        total: count || 0,
        pages: totalPages
      };
    } catch (error) {
      console.error('❌ Error in getRentalProfitLoss:', error);
      return { data: [], total: 0, pages: 0 };
    }
  }

  // ============================================================================
  // VEHICLE PERFORMANCE ANALYSIS
  // ============================================================================

  async getTopPerformingVehicles(startDate, endDate, limit = 10) {
    try {
      console.log('🏆 Fetching top performing vehicles...');
      
      const { data: rentals, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          vehicle_id,
          total_amount,
          saharax_0u4w4d_vehicles!inner(
            id, name, model, vehicle_type, plate_number, status
          )
        `)
        .gte('rental_start_date', startDate)
        .lte('rental_end_date', endDate)
        .in('status', ['completed', 'active']);

      if (error) {
        console.error('❌ Error fetching vehicle performance:', error);
        return [];
      }

      // Group by vehicle and calculate performance metrics
      const vehiclePerformance = {};
      
      rentals?.forEach(rental => {
        const vehicleId = rental.vehicle_id;
        const amount = Number(rental.total_amount) || 0;
        
        if (!vehiclePerformance[vehicleId]) {
          vehiclePerformance[vehicleId] = {
            vehicle: rental.saharax_0u4w4d_vehicles,
            totalRevenue: 0,
            rentalCount: 0,
            averageRevenue: 0
          };
        }
        
        vehiclePerformance[vehicleId].totalRevenue += amount;
        vehiclePerformance[vehicleId].rentalCount += 1;
      });

      // Calculate averages and sort
      const performanceArray = Object.values(vehiclePerformance)
        .map(perf => ({
          ...perf,
          averageRevenue: perf.rentalCount > 0 ? perf.totalRevenue / perf.rentalCount : 0
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, limit);

      console.log(`✅ Top ${performanceArray.length} performing vehicles loaded`);
      return performanceArray;
    } catch (error) {
      console.error('❌ Error getting top performing vehicles:', error);
      return [];
    }
  }

  // ============================================================================
  // FINANCIAL REPORTS & EXPORTS
  // ============================================================================

  async generateFinancialReport(startDate, endDate, reportType = 'summary') {
    try {
      console.log(`📋 Generating ${reportType} financial report...`);
      
      const [summary, vehicleStats, topVehicles] = await Promise.all([
        this.getFinancialSummary(startDate, endDate),
        this.getVehicleFinancialStats(startDate, endDate),
        this.getTopPerformingVehicles(startDate, endDate, 5)
      ]);

      const report = {
        reportType,
        period: { startDate, endDate },
        summary,
        vehicleStats: vehicleStats.slice(0, 10), // Top 10
        topPerformers: topVehicles,
        generatedAt: new Date().toISOString()
      };

      console.log('✅ Financial report generated successfully');
      return report;
    } catch (error) {
      console.error('❌ Error generating financial report:', error);
      throw error;
    }
  }

  async exportToCSV(data, filename) {
    try {
      if (!data || data.length === 0) {
        throw new Error('No data to export');
      }

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => {
          const value = row[header];
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value;
        }).join(','))
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`✅ Data exported to ${filename}.csv`);
      return true;
    } catch (error) {
      console.error('❌ Error exporting to CSV:', error);
      throw error;
    }
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  getCacheKey(method, params) {
    return `${method}_${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
    console.log('✅ Finance service cache cleared');
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  formatCurrency(amount, currency = 'MAD') {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ` ${currency}`;
  }

  calculatePercentageChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  getDaysInPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

export const financeService = new FinanceService();
export default financeService;