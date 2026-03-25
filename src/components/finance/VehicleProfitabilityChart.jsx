import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

/**
 * VehicleProfitabilityChart - Interactive chart showing income vs expenses per vehicle
 * 
 * Features:
 * - Bar chart with revenue and cost comparison
 * - Color-coded profit margins (green for profitable, red for loss-making)
 * - Interactive tooltips with detailed breakdowns
 * - Responsive design for all screen sizes
 * - Click-to-drill-down functionality
 */
const VehicleProfitabilityChart = ({ 
  data = [], 
  loading = false, 
  onVehicleClick = null,
  showProfit = true,
  height = 400 
}) => {
  // Format currency for display
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format percentage for display
  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const vehicleData = data.find(v => v.vehicle_name === label);
      
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-green-600">Revenue: </span>
              <span className="font-medium">{formatCurrency(vehicleData?.annual_revenue || 0)}</span>
            </p>
            <p className="text-sm">
              <span className="text-red-600">Costs: </span>
              <span className="font-medium">{formatCurrency(vehicleData?.annual_operating_cost || 0)}</span>
            </p>
            <p className="text-sm">
              <span className="text-blue-600">Profit: </span>
              <span className="font-medium">{formatCurrency(vehicleData?.annual_profit || 0)}</span>
            </p>
            <p className="text-sm">
              <span className="text-purple-600">Margin: </span>
              <span className="font-medium">{formatPercentage(vehicleData?.profit_margin_pct || 0)}</span>
            </p>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-600">
                {vehicleData?.rental_count || 0} rentals • {vehicleData?.total_rental_hours || 0} hours
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Prepare chart data
  const chartData = data.map(vehicle => ({
    name: vehicle.vehicle_name,
    revenue: vehicle.annual_revenue,
    costs: vehicle.annual_operating_cost,
    profit: vehicle.annual_profit,
    margin: vehicle.profit_margin_pct,
    vehicle_id: vehicle.vehicle_id
  }));

  // Get profit color based on value
  const getProfitColor = (profit) => {
    if (profit > 0) return '#10B981'; // Green
    if (profit < 0) return '#EF4444'; // Red
    return '#6B7280'; // Gray
  };

  // Handle bar click for drill-down
  const handleBarClick = (data, index) => {
    if (onVehicleClick && data.vehicle_id) {
      onVehicleClick(data.vehicle_id, data.name);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Profitability</CardTitle>
          <CardDescription>Loading vehicle financial performance...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Profitability</CardTitle>
          <CardDescription>No vehicle financial data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <DollarSign className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No Data Available</p>
            <p className="text-sm">Vehicle profitability data will appear here once rentals are completed.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Vehicle Profitability Analysis
        </CardTitle>
        <CardDescription>
          Revenue vs operating costs for each vehicle. Click on bars to view detailed breakdown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full" style={{ height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 60,
              }}
              onClick={handleBarClick}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
                interval={0}
              />
              <YAxis 
                tickFormatter={formatCurrency}
                fontSize={12}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              <Bar 
                dataKey="revenue" 
                name="Revenue" 
                fill="#10B981"
                radius={[2, 2, 0, 0]}
                cursor="pointer"
              />
              <Bar 
                dataKey="costs" 
                name="Operating Costs" 
                fill="#EF4444"
                radius={[2, 2, 0, 0]}
                cursor="pointer"
              />
              
              {showProfit && (
                <Bar 
                  dataKey="profit" 
                  name="Net Profit" 
                  radius={[2, 2, 0, 0]}
                  cursor="pointer"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getProfitColor(entry.profit)} />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Statistics */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center">
              <TrendingUp className="h-5 w-5 text-green-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-green-900">Top Performer</p>
                <p className="text-lg font-bold text-green-700">
                  {chartData.length > 0 ? chartData.reduce((max, v) => v.profit > max.profit ? v : max).name : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center">
              <DollarSign className="h-5 w-5 text-blue-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-900">Total Revenue</p>
                <p className="text-lg font-bold text-blue-700">
                  {formatCurrency(chartData.reduce((sum, v) => sum + v.revenue, 0))}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg">
            <div className="flex items-center">
              <TrendingDown className="h-5 w-5 text-red-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-red-900">Total Costs</p>
                <p className="text-lg font-bold text-red-700">
                  {formatCurrency(chartData.reduce((sum, v) => sum + v.costs, 0))}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center">
              <TrendingUp className="h-5 w-5 text-purple-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-purple-900">Fleet Profit</p>
                <p className="text-lg font-bold text-purple-700">
                  {formatCurrency(chartData.reduce((sum, v) => sum + v.profit, 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VehicleProfitabilityChart;