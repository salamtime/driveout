import { supabase } from '../lib/supabase';

// ============================================================================
// TypeScript Interfaces for Finance Data Models
// ============================================================================

export interface MonetaryAmount {
  value: number;
  currency: string;
  formatted: string;
}

export interface Percentage {
  value: number;
  formatted: string;
}

export interface DateRange {
  start_date: string;
  end_date: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
}

// Revenue Analytics Interfaces
export interface RevenueAnalytics {
  overview: {
    total_revenue: MonetaryAmount;
    recognized_revenue: MonetaryAmount;
    deferred_revenue: MonetaryAmount;
    revenue_growth: Percentage;
  };
  segmentation: {
    by_vehicle_type: Array<{
      vehicle_type: string;
      revenue: MonetaryAmount;
      percentage: Percentage;
      growth: Percentage;
    }>;
    by_customer_segment: Array<{
      segment: CustomerSegment;
      revenue: MonetaryAmount;
      customer_count: number;
      avg_value: MonetaryAmount;
    }>;
  };
  trends: {
    monthly: Array<MonthlyRevenue>;
  };
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  bookings: number;
  avg_booking_value: number;
}

export type CustomerSegment = 'VIP' | 'Premium' | 'Regular' | 'New';
export type ExpenseCategory = 'maintenance' | 'fuel' | 'insurance' | 'registration' | 'depreciation';

// Vehicle Finance Interfaces
export interface VehicleProfitability {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_model: string;
  vehicle_type: string;
  annual_revenue: number;
  annual_operating_cost: number;
  annual_profit: number;
  profit_margin_pct: number;
  rental_count: number;
  total_rental_hours: number;
  revenue_per_hour: number;
  cost_per_hour: number;
  maintenance_cost: number;
  fuel_cost: number;
  insurance_cost: number;
  registration_cost: number;
  currency: string;
  period_start: string;
  period_end: string;
}

export interface VehicleAcquisition {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_model: string;
  vehicle_type: string;
  acquisition_cost: number;
  purchase_date: string;
  useful_life_years: number;
  residual_value: number;
  accumulated_depreciation: number;
  current_book_value: number;
  vehicle_status: string;
  annual_insurance_cost: number;
  annual_registration_cost: number;
  currency: string;
}

export interface VehicleROIAnalysis {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_model: string;
  acquisition_cost: number;
  total_revenue: number;
  total_costs: number;
  net_profit: number;
  roi_percentage: number;
  payback_period_months: number;
  current_book_value: number;
  depreciation_rate: number;
  utilization_rate: number;
  profit_per_month: number;
  currency: string;
  analysis_period_months: number;
}

// Dashboard Data Interfaces
export interface DashboardData {
  kpis: {
    revenue: { value: number; change: number; trend: string; currency: string };
    expenses: { value: number; change: number; trend: string; currency: string };
    taxes: { value: number; change: number; trend: string; currency: string };
    grossProfit: { value: number; change: number; trend: string; currency: string };
  };
  trends: Array<{
    month: string;
    revenue: number;
    expenses: number;
  }>;
  tables: {
    rentalPL: Array<any>;
    vehicleProfitability: Array<VehicleProfitability>;
    vehicleAcquisition: Array<VehicleAcquisition>;
  };
}

// API Parameters
export interface DashboardParams {
  startDate?: string;
  endDate?: string;
  vehicleId?: string;
  customerId?: string;
  orgId?: string;
}

export interface VehicleFinanceParams {
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
  orgId?: string;
}

// ============================================================================
// Finance API Service Class
// ============================================================================

class FinanceApiService {
  private formatCurrency(amount: number, currency: string = 'MAD'): MonetaryAmount {
    return {
      value: amount,
      currency,
      formatted: new Intl.NumberFormat('fr-MA', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
      }).format(amount)
    };
  }

  private formatPercentage(value: number): Percentage {
    return {
      value,
      formatted: `${value.toFixed(1)}%`
    };
  }

  // ============================================================================
  // Dashboard Data Methods
  // ============================================================================

  async getDashboardData(params: DashboardParams = {}): Promise<DashboardData> {
    try {
      const { startDate, endDate, vehicleId, orgId } = params;

      // Build query with filters
      let query = supabase
        .from('finance_revenue_summary')
        .select('*');

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      if (startDate) {
        query = query.gte('revenue_month', startDate);
      }

      if (endDate) {
        query = query.lte('revenue_month', endDate);
      }

      const { data: revenueData, error: revenueError } = await query;

      if (revenueError) {
        console.error('Error fetching revenue data:', revenueError);
        throw revenueError;
      }

      // Get vehicle profitability data
      const vehicleProfitabilityData = await this.getVehicleProfitability(params);
      const vehicleAcquisitionData = await this.getVehicleAcquisition(params);

      // Calculate KPIs from the data
      const totalRevenue = revenueData?.reduce((sum, item) => sum + (item.recognized_revenue || 0), 0) || 0;
      const totalExpenses = vehicleProfitabilityData?.reduce((sum, item) => sum + item.annual_operating_cost, 0) || 0;
      const totalTaxes = revenueData?.reduce((sum, item) => sum + (item.total_taxes || 0), 0) || 0;
      const grossProfit = totalRevenue - totalExpenses;

      // Mock trend data (replace with actual calculation)
      const trendData = [
        { month: 'Jan', revenue: totalRevenue * 0.2, expenses: totalExpenses * 0.2 },
        { month: 'Feb', revenue: totalRevenue * 0.25, expenses: totalExpenses * 0.22 },
        { month: 'Mar', revenue: totalRevenue * 0.28, expenses: totalExpenses * 0.26 },
        { month: 'Apr', revenue: totalRevenue * 0.27, expenses: totalExpenses * 0.32 }
      ];

      return {
        kpis: {
          revenue: { value: totalRevenue, change: 12.5, trend: 'up', currency: 'MAD' },
          expenses: { value: totalExpenses, change: -5.2, trend: 'down', currency: 'MAD' },
          taxes: { value: totalTaxes, change: 8.1, trend: 'up', currency: 'MAD' },
          grossProfit: { value: grossProfit, change: 18.7, trend: 'up', currency: 'MAD' }
        },
        trends: trendData,
        tables: {
          rentalPL: [], // Implement rental P&L data
          vehicleProfitability: vehicleProfitabilityData || [],
          vehicleAcquisition: vehicleAcquisitionData || []
        }
      };

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to load dashboard data');
    }
  }

  // ============================================================================
  // Vehicle Finance Methods
  // ============================================================================

  async getVehicleProfitability(params: VehicleFinanceParams = {}): Promise<VehicleProfitability[]> {
    try {
      const { vehicleId, startDate, endDate, orgId } = params;

      let query = supabase
        .from('finance_vehicle_profitability')
        .select('*');

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }

      if (startDate) {
        query = query.gte('period_start', startDate);
      }

      if (endDate) {
        query = query.lte('period_end', endDate);
      }

      const { data, error } = await query.order('annual_profit', { ascending: false });

      if (error) {
        console.error('Error fetching vehicle profitability:', error);
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('Error in getVehicleProfitability:', error);
      throw new Error('Failed to load vehicle profitability data');
    }
  }

  async getVehicleAcquisition(params: VehicleFinanceParams = {}): Promise<VehicleAcquisition[]> {
    try {
      const { vehicleId, orgId } = params;

      let query = supabase
        .from('finance_vehicle_assets')
        .select('*');

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }

      const { data, error } = await query.order('purchase_date', { ascending: false });

      if (error) {
        console.error('Error fetching vehicle acquisition:', error);
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('Error in getVehicleAcquisition:', error);
      throw new Error('Failed to load vehicle acquisition data');
    }
  }

  async getVehicleROIAnalysis(params: VehicleFinanceParams = {}): Promise<VehicleROIAnalysis[]> {
    try {
      const { vehicleId, orgId } = params;

      let query = supabase
        .from('finance_vehicle_roi_analysis')
        .select('*');

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }

      const { data, error } = await query.order('roi_percentage', { ascending: false });

      if (error) {
        console.error('Error fetching vehicle ROI analysis:', error);
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('Error in getVehicleROIAnalysis:', error);
      throw new Error('Failed to load vehicle ROI analysis data');
    }
  }

  // ============================================================================
  // Vehicle Finance Summary Methods
  // ============================================================================

  async getVehicleFinanceSummary(vehicleId: string, orgId?: string): Promise<{
    profitability: VehicleProfitability | null;
    acquisition: VehicleAcquisition | null;
    roi: VehicleROIAnalysis | null;
  }> {
    try {
      const [profitabilityData, acquisitionData, roiData] = await Promise.all([
        this.getVehicleProfitability({ vehicleId, orgId }),
        this.getVehicleAcquisition({ vehicleId, orgId }),
        this.getVehicleROIAnalysis({ vehicleId, orgId })
      ]);

      return {
        profitability: profitabilityData[0] || null,
        acquisition: acquisitionData[0] || null,
        roi: roiData[0] || null
      };

    } catch (error) {
      console.error('Error fetching vehicle finance summary:', error);
      throw new Error('Failed to load vehicle finance summary');
    }
  }

  async getFleetFinanceSummary(orgId?: string): Promise<{
    totalVehicles: number;
    totalRevenue: number;
    totalCosts: number;
    totalProfit: number;
    avgROI: number;
    topPerformers: VehicleProfitability[];
    bottomPerformers: VehicleProfitability[];
  }> {
    try {
      const profitabilityData = await this.getVehicleProfitability({ orgId });

      const totalVehicles = profitabilityData.length;
      const totalRevenue = profitabilityData.reduce((sum, v) => sum + v.annual_revenue, 0);
      const totalCosts = profitabilityData.reduce((sum, v) => sum + v.annual_operating_cost, 0);
      const totalProfit = totalRevenue - totalCosts;

      const roiData = await this.getVehicleROIAnalysis({ orgId });
      const avgROI = roiData.length > 0 
        ? roiData.reduce((sum, v) => sum + v.roi_percentage, 0) / roiData.length 
        : 0;

      const sortedByProfit = [...profitabilityData].sort((a, b) => b.annual_profit - a.annual_profit);
      const topPerformers = sortedByProfit.slice(0, 5);
      const bottomPerformers = sortedByProfit.slice(-5).reverse();

      return {
        totalVehicles,
        totalRevenue,
        totalCosts,
        totalProfit,
        avgROI,
        topPerformers,
        bottomPerformers
      };

    } catch (error) {
      console.error('Error fetching fleet finance summary:', error);
      throw new Error('Failed to load fleet finance summary');
    }
  }

  // ============================================================================
  // Revenue Analytics Methods
  // ============================================================================

  async getRevenueAnalytics(params: DashboardParams = {}): Promise<RevenueAnalytics> {
    try {
      const { startDate, endDate, orgId } = params;

      // This would be implemented with actual revenue views
      // For now, return mock data structure
      return {
        overview: {
          total_revenue: this.formatCurrency(125000),
          recognized_revenue: this.formatCurrency(120000),
          deferred_revenue: this.formatCurrency(5000),
          revenue_growth: this.formatPercentage(12.5)
        },
        segmentation: {
          by_vehicle_type: [
            {
              vehicle_type: 'Sport ATV',
              revenue: this.formatCurrency(75000),
              percentage: this.formatPercentage(60),
              growth: this.formatPercentage(15.2)
            },
            {
              vehicle_type: 'Utility ATV',
              revenue: this.formatCurrency(50000),
              percentage: this.formatPercentage(40),
              growth: this.formatPercentage(8.7)
            }
          ],
          by_customer_segment: [
            {
              segment: 'VIP',
              revenue: this.formatCurrency(45000),
              customer_count: 25,
              avg_value: this.formatCurrency(1800)
            },
            {
              segment: 'Premium',
              revenue: this.formatCurrency(50000),
              customer_count: 45,
              avg_value: this.formatCurrency(1111)
            }
          ]
        },
        trends: {
          monthly: [
            { month: 'Jan', revenue: 95000, bookings: 85, avg_booking_value: 1118 },
            { month: 'Feb', revenue: 105000, bookings: 92, avg_booking_value: 1141 },
            { month: 'Mar', revenue: 115000, bookings: 98, avg_booking_value: 1173 },
            { month: 'Apr', revenue: 125000, bookings: 105, avg_booking_value: 1190 }
          ]
        }
      };

    } catch (error) {
      console.error('Error fetching revenue analytics:', error);
      throw new Error('Failed to load revenue analytics');
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async getVehicleList(orgId?: string): Promise<Array<{ id: string; name: string; model: string; type: string }>> {
    try {
      let query = supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, vehicle_models(vehicle_type)')
        .eq('status', 'active');

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching vehicle list:', error);
        throw error;
      }

      return (data || []).map(vehicle => ({
        id: vehicle.id,
        name: vehicle.name,
        model: vehicle.model,
        type: vehicle.vehicle_models?.vehicle_type || 'Unknown'
      }));

    } catch (error) {
      console.error('Error in getVehicleList:', error);
      return [];
    }
  }

  async getCustomerList(orgId?: string): Promise<Array<{ id: string; name: string; email: string; segment: string }>> {
    try {
      let query = supabase
        .from('finance_customer_analysis')
        .select('customer_email, customer_name, customer_segment');

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching customer list:', error);
        throw error;
      }

      return (data || []).map((customer, index) => ({
        id: `customer_${index}`,
        name: customer.customer_name || 'Unknown',
        email: customer.customer_email || '',
        segment: customer.customer_segment || 'New'
      }));

    } catch (error) {
      console.error('Error in getCustomerList:', error);
      return [];
    }
  }
}

// Export singleton instance
export const financeApi = new FinanceApiService();
export default financeApi;