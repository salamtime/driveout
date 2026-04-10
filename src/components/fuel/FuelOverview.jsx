import React, { useState, useEffect } from 'react';
import {
  Fuel,
  Plus,
  TrendingUp,
  TrendingDown,
  Car,
  DollarSign,
  Activity,
  ArrowRight,
  Calendar,
  MapPin,
  Receipt,
  AlertCircle
} from 'lucide-react';
import FuelTransactionService from '../../services/FuelTransactionService';
import { formatVehicleNameWithModel, formatVehicleLabel } from '../../utils/vehicleLabels';

const FuelOverview = ({ vehicles = [], onAddTransaction, onViewTransactions }) => {
  const [metrics, setMetrics] = useState({
    totalTransactions: 0,
    totalFuelConsumed: 0,
    totalCost: 0,
    activeVehicles: 0,
    avgCostPerLiter: 0
  });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [vehicleFuelStatus, setVehicleFuelStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load overview data
  const loadOverviewData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get analytics for last 30 days
      const analyticsResult = await FuelTransactionService.getAnalytics({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      });

      if (analyticsResult.success) {
        const analytics = analyticsResult.analytics;
        setMetrics({
          totalTransactions: analytics.totalTransactions || 0,
          totalFuelConsumed: analytics.totalFuelAmount || 0,
          totalCost: analytics.totalCost || 0,
          activeVehicles: Object.keys(analytics.fuelByVehicle || {}).length,
          avgCostPerLiter: analytics.avgCostPerLiter || 0
        });
      }

      // Get recent transactions
      const transactionsResult = await FuelTransactionService.getAllTransactions({
        limit: 5,
        offset: 0
      });

      if (transactionsResult.success) {
        setRecentTransactions(transactionsResult.transactions);
      }

      // Generate mock vehicle fuel status (in real app, this would come from vehicle sensors)
      const mockFuelStatus = vehicles.slice(0, 6).map(vehicle => ({
        id: vehicle.id,
        name: vehicle.name,
        plateNumber: vehicle.plate_number,
        fuelLevel: Math.floor(Math.random() * 100) + 1, // Random fuel level 1-100%
        lastRefill: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: vehicle.status
      }));
      setVehicleFuelStatus(mockFuelStatus);

    } catch (err) {
      console.error('Error loading overview data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewData();
  }, [vehicles]);

  // Format currency
  const formatMAD = (amount) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD'
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get vehicle name
  const getVehicleName = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? formatVehicleLabel(vehicle) : 'Véhicule inconnu';
  };

  // Get fuel level color
  const getFuelLevelColor = (level) => {
    if (level >= 70) return 'bg-green-500';
    if (level >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          {/* Metrics Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-200 h-24 rounded-lg"></div>
            ))}
          </div>
          
          {/* Content Skeleton */}
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 mb-2">Impossible de charger la vue d'ensemble</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadOverviewData}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Transactions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Transactions totales</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.totalTransactions}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm text-green-600">
            <TrendingUp className="w-4 h-4 mr-1" />
            30 derniers jours
          </div>
        </div>

        {/* Total Fuel Consumed */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Carburant consommé</p>
              <p className="text-2xl font-bold text-gray-900">
                {metrics.totalFuelConsumed.toFixed(1)}L
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Fuel className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-600">
            <span>Sur tous les véhicules</span>
          </div>
        </div>

        {/* Total Cost */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Coût total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatMAD(metrics.totalCost)}
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

        {/* Active Vehicles */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Véhicules actifs</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.activeVehicles}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Car className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center text-sm text-gray-600">
            <span>Avec activité carburant</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Transactions récentes</h3>
              <button
                onClick={onViewTransactions}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
              >
                Tout voir
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8">
                <Fuel className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">Aucune transaction récente</p>
                <button
                  onClick={() => onAddTransaction('refill')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter la première transaction
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        transaction.transaction_type === 'refill' 
                          ? 'bg-green-100 text-green-600' 
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        <Fuel className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {getVehicleName(transaction.vehicle_id)}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <Calendar className="w-3 h-3" />
                          {formatDate(transaction.transaction_date)}
                          {transaction.location && (
                            <>
                              <MapPin className="w-3 h-3" />
                              {transaction.location}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {transaction.amount}L
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatMAD(transaction.cost)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vehicle Fuel Status */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">État carburant des véhicules</h3>
            <p className="text-sm text-gray-600 mt-1">Niveaux de carburant actuels (estimés)</p>
          </div>
          
          <div className="p-6">
            {vehicleFuelStatus.length === 0 ? (
              <div className="text-center py-8">
                <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Aucun véhicule disponible</p>
              </div>
            ) : (
              <div className="space-y-4">
                {vehicleFuelStatus.map((vehicle) => (
                  <div key={vehicle.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatVehicleNameWithModel(vehicle)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {vehicle.plateNumber} • Dernier remplissage : {formatDate(vehicle.lastRefill)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {vehicle.fuelLevel}%
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          vehicle.status === 'available' ? 'bg-green-100 text-green-800' :
                          vehicle.status === 'rented' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {vehicle.status}
                        </div>
                      </div>
                    </div>
                    
                    {/* Fuel Level Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getFuelLevelColor(vehicle.fuelLevel)}`}
                        style={{ width: `${vehicle.fuelLevel}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => onAddTransaction('refill')}
            className="flex items-center gap-3 p-4 border-2 border-dashed border-green-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors"
          >
            <div className="p-2 bg-green-100 rounded-lg">
              <Plus className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-left">
              <div className="font-medium text-gray-900">Ajouter un remplissage carburant</div>
              <div className="text-sm text-gray-600">Enregistrer le carburant ajouté au véhicule</div>
            </div>
          </button>
          
          <button
            onClick={() => onAddTransaction('withdrawal')}
            className="flex items-center gap-3 p-4 border-2 border-dashed border-orange-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors"
          >
            <div className="p-2 bg-orange-100 rounded-lg">
              <TrendingDown className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-left">
              <div className="font-medium text-gray-900">Ajouter un retrait carburant</div>
              <div className="text-sm text-gray-600">Enregistrer le carburant consommé par le véhicule</div>
            </div>
          </button>
          
          <button
            onClick={onViewTransactions}
            className="flex items-center gap-3 p-4 border-2 border-dashed border-blue-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-medium text-gray-900">Voir toutes les transactions</div>
              <div className="text-sm text-gray-600">Parcourir l'historique complet du carburant</div>
            </div>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {metrics.avgCostPerLiter > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {formatMAD(metrics.avgCostPerLiter)}
              </div>
              <div className="text-sm text-gray-600">Coût moyen par litre</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {metrics.totalTransactions > 0 ? (metrics.totalFuelConsumed / metrics.totalTransactions).toFixed(1) : '0'}L
              </div>
              <div className="text-sm text-gray-600">Moyenne par transaction</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {vehicles.length}
              </div>
              <div className="text-sm text-gray-600">Total Fleet Vehicles</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelOverview;
