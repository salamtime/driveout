import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Wrench, Fuel, Package, MoreHorizontal, Target, PieChart } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

/**
 * Enhanced KPI Cards v2 with Modern Color-Coded Design and Data Context Indicators
 * 
 * Features:
 * - Color-coded cards: Revenue=green, Expenses=red, Taxes=orange, Profit=blue
 * - Large bold numbers with smaller descriptive labels
 * - Percentage change indicators with animations
 * - Gradient backgrounds and modern styling
 * - Hover effects and smooth transitions
 * - Enhanced visual hierarchy
 * - NEW: Data source indicators and tooltips
 */
const KPICardsV2 = ({ filters, refreshTrigger, onOpenBreakdown }) => {
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadKPIData();
  }, [filters, refreshTrigger]);

  const loadKPIData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📊 ENHANCED KPI CARDS: Loading with modern styling...');
      const data = await financeApiV2.getKPIData(filters);
      
      console.log('✅ Enhanced KPI data loaded:', {
        totalRevenue: data.totalRevenue,
        totalExpenses: data.totalExpenses,
        maintenanceCosts: data.maintenanceCosts,
        fuelCosts: data.fuelCosts,
        inventoryCosts: data.inventoryCosts,
        otherCosts: data.otherCosts,
        taxes: data.taxes,
        grossProfit: data.grossProfit,
        currency: data.currency
      });
      
      setKpiData(data);
      
    } catch (err) {
      console.error('❌ Enhanced KPI loading failed:', err);
      setError(err.message || 'Failed to load KPI data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatCompact = (amount) => {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    }
    if (amount >= 1000) {
      return (amount / 1000).toFixed(0) + 'K';
    }
    return amount.toString();
  };

  const revenueBase = Math.max(kpiData?.totalRevenue || 0, 1);
  const expenseBase = Math.max(kpiData?.totalExpenses || 0, 0);
  const profitMarginPercent = ((kpiData?.grossProfit || 0) / revenueBase) * 100;
  const expenseRatioPercent = ((kpiData?.totalExpenses || 0) / revenueBase) * 100;
  const opExRatioPercent = kpiData?.maintenanceCosts && kpiData?.fuelCosts
    ? (((kpiData.maintenanceCosts || 0) + (kpiData.fuelCosts || 0)) / revenueBase) * 100
    : (((kpiData?.totalExpenses || 0) * 0.7) / revenueBase) * 100;
  const roiPercent = expenseBase > 0
    ? ((kpiData?.grossProfit || 0) / expenseBase) * 100
    : 0;

  const getTrendIcon = (change) => {
    if (change > 0) {
      return <TrendingUp className="w-4 h-4" />;
    }
    return <TrendingDown className="w-4 h-4" />;
  };

  const getTrendColor = (change) => {
    return change > 0 ? 'text-green-600' : 'text-red-600';
  };

  const getTrendBgColor = (change) => {
    return change > 0 ? 'bg-green-50' : 'bg-red-50';
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
              </div>
              <div className="h-8 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <BarChart3 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">Error Loading KPI Data</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!kpiData) {
    return null;
  }

  const getBreakdownCardProps = (type) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpenBreakdown?.(type),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpenBreakdown?.(type);
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Revenue - Green Theme */}
        <div className="group relative bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden" title="Actual income from recorded rentals">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
          <div className="relative p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-green-100 text-sm font-medium uppercase tracking-wide">Total Revenue</p>
                <p className="text-3xl font-bold mt-1">{formatCompact(kpiData.totalRevenue)}</p>
                <p className="text-xs text-green-100 mt-1">MAD (real data from rentals)</p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getTrendBgColor(kpiData.revenueChange)} bg-white/20`}>
              <div className="text-white">
                {getTrendIcon(kpiData.revenueChange)}
              </div>
              <span className="text-white text-sm font-semibold">
                {Math.abs(kpiData.revenueChange)}% vs last period
              </span>
            </div>
          </div>
        </div>

        {/* Total Expenses - Red Theme */}
        <div className="group relative bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden" title="Costs related to vehicle maintenance, fuel, and operations">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
          <div className="relative p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-red-100 text-sm font-medium uppercase tracking-wide">Total Expenses</p>
                <p className="text-3xl font-bold mt-1">{formatCompact(kpiData.totalExpenses)}</p>
                <p className="text-xs text-red-100 mt-1">MAD (computed from cost logs)</p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getTrendBgColor(kpiData.expensesChange)} bg-white/20`}>
              <div className="text-white">
                {getTrendIcon(kpiData.expensesChange)}
              </div>
              <span className="text-white text-sm font-semibold">
                {Math.abs(kpiData.expensesChange)}% vs last period
              </span>
            </div>
          </div>
        </div>

        {/* Taxes - Orange Theme */}
        <div className="group relative bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden" title="Tax obligations calculated from revenue">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
          <div className="relative p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-orange-100 text-sm font-medium uppercase tracking-wide">Taxes</p>
                <p className="text-3xl font-bold mt-1">{formatCompact(kpiData.taxes)}</p>
                <p className="text-xs text-orange-100 mt-1">MAD (calculated automatically)</p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Target className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getTrendBgColor(kpiData.taxesChange)} bg-white/20`}>
              <div className="text-white">
                {getTrendIcon(kpiData.taxesChange)}
              </div>
              <span className="text-white text-sm font-semibold">
                {Math.abs(kpiData.taxesChange)}% vs last period
              </span>
            </div>
          </div>
        </div>

        {/* Gross Profit - Blue Theme */}
        <div className="group relative bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden" title="Revenue minus all operational expenses">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
          <div className="relative p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-blue-100 text-sm font-medium uppercase tracking-wide">Gross Profit</p>
                <p className="text-3xl font-bold mt-1">{formatCompact(kpiData.grossProfit)}</p>
                <p className="text-xs text-blue-100 mt-1">MAD (calculated automatically)</p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getTrendBgColor(kpiData.profitChange)} bg-white/20`}>
              <div className="text-white">
                {getTrendIcon(kpiData.profitChange)}
              </div>
              <span className="text-white text-sm font-semibold">
                {Math.abs(kpiData.profitChange)}% vs last period
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary OpEx Breakdown Cards */}
      {kpiData.maintenanceCosts !== undefined && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          {/* Maintenance Costs */}
          <div {...getBreakdownCardProps('maintenance')} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 hover:border-orange-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-200" title="Costs related to vehicle maintenance during this period">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Maintenance Costs</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCompact(kpiData.maintenanceCosts)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {((kpiData.maintenanceCosts / Math.max(kpiData.totalRevenue, 1)) * 100).toFixed(1)}% of revenue
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <Wrench className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          {/* Fuel Costs */}
          <div {...getBreakdownCardProps('fuel')} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 hover:border-purple-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-200" title="Fuel expenses from live fuel logs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Fuel Costs</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCompact(kpiData.fuelCosts)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {((kpiData.fuelCosts / Math.max(kpiData.totalRevenue, 1)) * 100).toFixed(1)}% of revenue
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-xl">
                <Fuel className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          {/* Inventory Costs */}
          <div {...getBreakdownCardProps('inventory')} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 hover:border-indigo-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200" title="Parts and consumables used during operations">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Inventory Costs</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCompact(kpiData.inventoryCosts)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {((kpiData.inventoryCosts / Math.max(kpiData.totalRevenue, 1)) * 100).toFixed(1)}% of revenue
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Package className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>

          {/* Other Costs */}
          <div {...getBreakdownCardProps('other_costs')} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 hover:border-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300" title="Miscellaneous operational expenses">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Other Costs</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCompact(kpiData.otherCosts)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {((kpiData.otherCosts / Math.max(kpiData.totalRevenue, 1)) * 100).toFixed(1)}% of revenue
                </p>
              </div>
              <div className="p-3 bg-gray-100 rounded-xl">
                <MoreHorizontal className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>

          <div {...getBreakdownCardProps('damage_recovery')} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 hover:border-emerald-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-200" title="Revenue recovered from customer-billable damage and maintenance">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Damage Recovery</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCompact(kpiData.damageRecoveryRevenue || 0)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {(((kpiData.damageRecoveryRevenue || 0) / Math.max(kpiData.totalRevenue, 1)) * 100).toFixed(1)}% of revenue
                </p>
              </div>
              <div className="p-3 bg-emerald-100 rounded-xl">
                <DollarSign className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div {...getBreakdownCardProps('parts_margin')} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200 hover:border-cyan-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-200" title="Margin earned on parts billed to customers">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Parts Margin</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCompact(kpiData.partsMarginRevenue || 0)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {(((kpiData.partsMarginRevenue || 0) / Math.max(kpiData.totalRevenue, 1)) * 100).toFixed(1)}% of revenue
                </p>
              </div>
              <div className="p-3 bg-cyan-100 rounded-xl">
                <Package className="w-6 h-6 text-cyan-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Financial Performance Summary */}
      <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <PieChart className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Financial Performance Summary</h3>
            <p className="text-sm text-gray-600">Key financial ratios and performance indicators</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-white rounded-lg border border-gray-100" title="Revenue efficiency indicator">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {profitMarginPercent.toFixed(1)}%
            </div>
            <div className="text-sm font-medium text-gray-600">Profit Margin</div>
            <div className="text-xs text-gray-500 mt-1">Revenue efficiency</div>
          </div>
          
          <div className="text-center p-4 bg-white rounded-lg border border-gray-100" title="Cost management indicator">
            <div className="text-3xl font-bold text-red-600 mb-1">
              {expenseRatioPercent.toFixed(1)}%
            </div>
            <div className="text-sm font-medium text-gray-600">Expense Ratio</div>
            <div className="text-xs text-gray-500 mt-1">Cost management</div>
          </div>
          
          <div className="text-center p-4 bg-white rounded-lg border border-gray-100" title="Operational efficiency indicator">
            <div className="text-3xl font-bold text-orange-600 mb-1">
              {opExRatioPercent.toFixed(1)}%
            </div>
            <div className="text-sm font-medium text-gray-600">OpEx Ratio</div>
            <div className="text-xs text-gray-500 mt-1">Operational efficiency</div>
          </div>
          
          <div className="text-center p-4 bg-white rounded-lg border border-gray-100" title="Return on investment">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {roiPercent.toFixed(1)}%
            </div>
            <div className="text-sm font-medium text-gray-600">ROI</div>
            <div className="text-xs text-gray-500 mt-1">Return on investment</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPICardsV2;
