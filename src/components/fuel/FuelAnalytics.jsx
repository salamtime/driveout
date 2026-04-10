import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  Calendar,
  Car,
  DollarSign,
  BarChart3,
  Activity,
  Filter,
  Download
} from 'lucide-react';
import { formatVehicleLabel } from '../../utils/vehicleLabels';
import FuelTransactionService from '../../services/FuelTransactionService';

const FuelAnalytics = ({ vehicles = [] }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30'); // days
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [chartType, setChartType] = useState('monthly'); // monthly, weekly, daily

  // Load analytics data
  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - parseInt(dateRange));

      const filters = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      if (selectedVehicle) {
        filters.vehicleId = selectedVehicle;
      }

      const result = await FuelTransactionService.getAnalytics(filters);

      if (result.success) {
        setAnalytics(result.analytics);
      } else {
        setError(result.error || "Impossible de charger les analyses");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [dateRange, selectedVehicle]);

  // Format currency
  const formatMAD = (amount) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD'
    }).format(amount);
  };

  // Prepare chart data
  const prepareMonthlyData = () => {
    if (!analytics?.monthlyTrends) return [];

    return Object.entries(analytics.monthlyTrends)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('fr-FR', { 
          month: 'short', 
          year: 'numeric' 
        }),
        amount: data.amount,
        cost: data.cost,
        transactions: data.count
      }))
      .sort((a, b) => new Date(a.month) - new Date(b.month));
  };

  const prepareFuelTypeData = () => {
    if (!analytics?.fuelByType) return [];

    return Object.entries(analytics.fuelByType).map(([type, data]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: data.amount,
      cost: data.cost,
      count: data.count
    }));
  };

  const prepareVehicleData = () => {
    if (!analytics?.fuelByVehicle || !vehicles.length) return [];

    return Object.entries(analytics.fuelByVehicle)
      .map(([vehicleId, data]) => {
        const vehicle = vehicles.find(v => v.id.toString() === vehicleId);
        return {
          name: vehicle ? formatVehicleLabel(vehicle) : `Véhicule ${vehicleId}`,
          amount: data.amount,
          cost: data.cost,
          transactions: data.count
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10 vehicles
  };

  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-200 h-24 rounded-lg"></div>
            ))}
          </div>
          <div className="bg-gray-200 h-64 rounded-lg"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-200 h-64 rounded-lg"></div>
            <div className="bg-gray-200 h-64 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-600 mb-2">Impossible de charger les analyses</div>
          <div className="text-red-500 text-sm mb-4">{error}</div>
          <button
            onClick={loadAnalytics}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const monthlyData = prepareMonthlyData();
  const fuelTypeData = prepareFuelTypeData();
  const vehicleData = prepareVehicleData();

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analyses carburant</h2>
          <p className="text-gray-600">Analyse complète de la consommation et des coûts de carburant</p>
        </div>

        <div className="flex gap-3">
          {/* Vehicle Filter */}
          <select
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Tous les véhicules</option>
            {vehicles.map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name} ({vehicle.plate_number})
              </option>
            ))}
          </select>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">3 derniers mois</option>
            <option value="180">6 derniers mois</option>
            <option value="365">Dernière année</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Transactions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Transactions totales</p>
              <p className="text-2xl font-bold text-gray-900">{analytics?.totalTransactions || 0}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm">
            <span className="text-green-600 font-medium">
              {analytics?.totalRefills || 0} remplissages
            </span>
            <span className="text-gray-500 mx-2">•</span>
            <span className="text-blue-600 font-medium">
              {analytics?.totalWithdrawals || 0} retraits
            </span>
          </div>
        </div>

        {/* Total Fuel Amount */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Carburant total</p>
              <p className="text-2xl font-bold text-gray-900">
                {(analytics?.totalFuelAmount || 0).toFixed(1)}L
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Fuel className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-600">
            <TrendingUp className="w-4 h-4 mr-1" />
            Suivi de la consommation de carburant
          </div>
        </div>

        {/* Total Cost */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Coût total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatMAD(analytics?.totalCost || 0)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <DollarSign className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-600">
            <span>Dépenses carburant</span>
          </div>
        </div>

        {/* Average Cost per Liter */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Coût moyen/litre</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatMAD(analytics?.avgCostPerLiter || 0)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-600">
            <span>Efficacité du prix</span>
          </div>
        </div>
      </div>

      {/* Monthly Trends Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Tendances mensuelles</h3>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Consommation et coûts du carburant dans le temps</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip 
              formatter={(value, name) => [
                name === 'amount' ? `${value}L` : formatMAD(value),
                name === 'amount' ? 'Quantité de carburant' : 'Coût'
              ]}
            />
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="amount"
              stackId="1"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.6}
              name="Quantité de carburant (L)"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="cost"
              stackId="2"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
              name="Coût (MAD)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fuel by Type */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Fuel className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Carburant par type</h3>
          </div>

          {fuelTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={fuelTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value.toFixed(1)}L`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {fuelTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value.toFixed(1)}L`, 'Quantité']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Aucune donnée disponible par type de carburant
            </div>
          )}
        </div>

        {/* Top Vehicles */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Car className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Top véhicules par consommation</h3>
          </div>

          {vehicleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={vehicleData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'amount' ? `${value.toFixed(1)}L` : formatMAD(value),
                    name === 'amount' ? 'Quantité de carburant' : 'Coût'
                  ]}
                />
                <Bar dataKey="amount" fill="#10b981" name="amount" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Aucune donnée véhicule disponible
            </div>
          )}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Répartition détaillée</h3>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Fuel Types */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Par type de carburant</h4>
              <div className="space-y-2">
                {fuelTypeData.map((item, index) => (
                  <div key={item.name} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{item.value.toFixed(1)}L</div>
                      <div className="text-xs text-gray-500">{formatMAD(item.cost)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Summary */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Résumé mensuel</h4>
              <div className="space-y-2">
                {monthlyData.slice(-3).map((month) => (
                  <div key={month.month} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-sm font-medium">{month.month}</span>
                    <div className="text-right">
                      <div className="text-sm font-medium">{month.amount.toFixed(1)}L</div>
                      <div className="text-xs text-gray-500">{formatMAD(month.cost)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Metrics */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Indicateurs clés</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm font-medium">Moyenne par transaction</span>
                  <span className="text-sm">
                    {analytics?.totalTransactions > 0 
                      ? (analytics.totalFuelAmount / analytics.totalTransactions).toFixed(1)
                      : '0'
                    }L
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm font-medium">Ratio de remplissage</span>
                  <span className="text-sm">
                    {analytics?.totalTransactions > 0 
                      ? ((analytics.totalRefills / analytics.totalTransactions) * 100).toFixed(1)
                      : '0'
                    }%
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm font-medium">Véhicules actifs</span>
                  <span className="text-sm">{Object.keys(analytics?.fuelByVehicle || {}).length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FuelAnalytics;
