import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import { TrendingUp, BarChart3, PieChart as PieChartIcon, Activity } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

/**
 * Enhanced Overview Charts v2 with Modern Animated Charts
 * 
 * Features:
 * - Animated Revenue vs Expenses line chart
 * - Cost Breakdown pie chart with tooltips
 * - Top 5 Vehicles by Profitability horizontal bar chart
 * - Smooth animations and modern styling
 * - Interactive tooltips and legends
 * - Responsive design with gradient colors
 */
const OverviewChartsV2 = ({ filters, refreshTrigger }) => {
  const [trendData, setTrendData] = useState([]);
  const [vehicleProfitData, setVehicleProfitData] = useState([]);
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadChartData();
  }, [filters, refreshTrigger]);

  const loadChartData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📈 ENHANCED CHARTS: Loading data with animations...');
      
      const [trends, vehicles, kpis] = await Promise.all([
        financeApiV2.getTrendData(filters),
        financeApiV2.getTopVehiclesByProfit(filters, 5),
        financeApiV2.getKPIData(filters)
      ]);
      
      setTrendData(trends);
      setVehicleProfitData(vehicles);
      setKpiData(kpis);
      
      console.log('✅ Enhanced chart data loaded:', {
        trendPoints: trends.length,
        topVehicles: vehicles.length,
        kpiMetrics: Object.keys(kpis).length
      });
      
    } catch (err) {
      console.error('❌ Enhanced chart loading failed:', err);
      setError(err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatCompact = (value) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(0) + 'K';
    }
    return value.toString();
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)} MAD
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Pie chart colors
  const pieColors = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6'];

  // Cost breakdown data for pie chart
  const costBreakdownData = kpiData ? [
    { name: 'Maintenance', value: kpiData.maintenanceCosts || (kpiData.totalExpenses * 0.35), color: '#F59E0B' },
    { name: 'Fuel', value: kpiData.fuelCosts || (kpiData.totalExpenses * 0.40), color: '#8B5CF6' },
    { name: 'Inventory', value: kpiData.inventoryCosts || (kpiData.totalExpenses * 0.15), color: '#3B82F6' },
    { name: 'Other', value: kpiData.otherCosts || (kpiData.totalExpenses * 0.10), color: '#6B7280' }
  ] : [];

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-64 bg-gray-100 rounded"></div>
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
            <h3 className="font-semibold text-red-900">Error Loading Charts</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue vs Expenses Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <TrendingUp className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Revenue vs Expenses Trend</h3>
            <p className="text-sm text-gray-600">Daily financial performance over the selected period</p>
          </div>
        </div>
        
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="date" 
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis 
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={formatCompact}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10B981"
                strokeWidth={3}
                fill="url(#revenueGradient)"
                name="Revenue"
                animationDuration={1500}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#EF4444"
                strokeWidth={3}
                fill="url(#expenseGradient)"
                name="Expenses"
                animationDuration={1500}
                animationDelay={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-orange-100 rounded-lg">
              <PieChartIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cost Breakdown</h3>
              <p className="text-sm text-gray-600">Operational expense distribution</p>
            </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdownData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={40}
                  paddingAngle={5}
                  dataKey="value"
                  animationDuration={1500}
                >
                  {costBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => [formatCurrency(value) + ' MAD', 'Amount']}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value, entry) => (
                    <span style={{ color: entry.color, fontWeight: '500' }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Vehicles by Profitability */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Top 5 Vehicles by Profitability</h3>
              <p className="text-sm text-gray-600">Most profitable vehicles in your fleet</p>
            </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={vehicleProfitData}
                layout="horizontal"
                margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  type="number" 
                  stroke="#6B7280"
                  fontSize={12}
                  tickFormatter={formatCompact}
                />
                <YAxis 
                  type="category" 
                  dataKey="plateNumber" 
                  stroke="#6B7280"
                  fontSize={12}
                  width={60}
                />
                <Tooltip 
                  formatter={(value, name) => [formatCurrency(value) + ' MAD', name]}
                  labelFormatter={(label) => `Vehicle: ${label}`}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="profit" 
                  name="Profit"
                  radius={[0, 4, 4, 0]}
                  animationDuration={1500}
                  animationDelay={(dataIndex) => dataIndex * 200}
                >
                  {vehicleProfitData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={`hsl(${120 + index * 30}, 70%, 50%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Financial Performance Metrics */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Activity className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Performance Insights</h3>
            <p className="text-sm text-gray-600">Key financial insights and recommendations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Revenue Growth</p>
                <p className="text-lg font-bold text-green-600">
                  +{kpiData?.revenueChange || 0}%
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Strong revenue performance compared to previous period
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Profit Margin</p>
                <p className="text-lg font-bold text-blue-600">
                  {kpiData ? ((kpiData.grossProfit / kpiData.totalRevenue) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Healthy profit margins indicate efficient operations
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <PieChartIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Top Vehicle ROI</p>
                <p className="text-lg font-bold text-purple-600">
                  {vehicleProfitData[0]?.profitMargin?.toFixed(1) || 0}%
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Best performing vehicle: {vehicleProfitData[0]?.plateNumber || 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewChartsV2;