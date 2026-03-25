import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Wrench, Fuel, Package, MoreHorizontal, Car, Calendar, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

/**
 * Enhanced Vehicle Finance Tab v2 with Data Context Indicators
 * 
 * Features:
 * - Vehicle selection dropdown with comprehensive debugging
 * - Lifetime financial metrics with OpEx breakdown
 * - Performance indicators and utilization stats
 * - Modern card-based layout with animations
 * - CRITICAL FIX: Proper vehicle data handling and display
 * - NEW: Data source indicators and lifetime scope clarification
 */
const VehicleFinanceTabV2 = ({ filters, vehicles = [], loading, refreshTrigger, onVehicleClick }) => {
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
  const [vehicleFinanceData, setVehicleFinanceData] = useState(null);
  const [vehicleProfitData, setVehicleProfitData] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);

  // CRITICAL DEBUG: Log vehicle prop data
  useEffect(() => {
    console.log('🚗 VEHICLE FINANCE TAB: Received vehicles prop:', {
      vehiclesType: typeof vehicles,
      vehiclesIsArray: Array.isArray(vehicles),
      vehiclesLength: vehicles?.length || 0,
      vehiclesData: vehicles,
      loading: loading,
      sampleVehicle: vehicles?.[0]
    });
  }, [vehicles, loading]);

  // Auto-select first vehicle when vehicles load
  useEffect(() => {
    if (vehicles && vehicles.length > 0 && selectedVehicleIds.length === 0) {
      const firstVehicleId = vehicles[0].id;
      setSelectedVehicleIds([firstVehicleId]);
      console.log('🚗 Auto-selecting first vehicle:', firstVehicleId, vehicles[0]);
    }
  }, [vehicles, selectedVehicleIds.length]);

  // Load vehicle finance data when selection changes
  useEffect(() => {
    if (selectedVehicleIds.length > 0) {
      loadVehicleFinanceData();
    }
  }, [selectedVehicleIds, filters, refreshTrigger]);

  const loadVehicleFinanceData = async () => {
    try {
      setDataLoading(true);
      setError(null);
      
      console.log('💰 VEHICLE FINANCE: Loading data for vehicles:', selectedVehicleIds);
      
      const [financeData, profitData] = await Promise.all([
        financeApiV2.getVehicleFinanceData(selectedVehicleIds, filters),
        financeApiV2.getTopVehiclesByProfit(filters, 10)
      ]);
      
      setVehicleFinanceData(financeData);
      setVehicleProfitData(profitData);
      
      console.log('✅ Vehicle finance data loaded:', {
        financeData,
        profitDataCount: profitData.length
      });
      
    } catch (err) {
      console.error('❌ Vehicle finance data loading failed:', err);
      setError(err.message || 'Failed to load vehicle finance data');
    } finally {
      setDataLoading(false);
    }
  };

  const handleVehicleSelection = (vehicleId) => {
    console.log('🚗 Vehicle selected:', vehicleId);
    setSelectedVehicleIds([vehicleId]);
    
    if (onVehicleClick) {
      onVehicleClick(vehicleId);
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

  // Get selected vehicle details
  const selectedVehicle = vehicles.find(v => selectedVehicleIds.includes(v.id));

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Data Scope Clarification */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Data shown reflects each vehicle's total lifetime financial performance.
          </p>
        </div>
        
        <div className="animate-pulse space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-10 bg-gray-200 rounded w-full"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // CRITICAL: Handle case when no vehicles are available
  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="space-y-6">
        {/* Data Scope Clarification */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Data shown reflects each vehicle's total lifetime financial performance.
          </p>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Car className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-yellow-900">No Vehicles Available</h3>
              <p className="text-sm text-yellow-700 mt-1">
                No vehicles found in your fleet. Please check your vehicle database or contact support.
              </p>
              <p className="text-xs text-yellow-600 mt-2">
                Note: Vehicle data is loaded from the saharax_0u4w4d_vehicles table.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Scope Clarification */}
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          Data shown reflects each vehicle's total lifetime financial performance.
        </p>
      </div>
      
      {/* Vehicle Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Car className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Vehicle Selection</h3>
            <p className="text-sm text-gray-600">Choose a vehicle to analyze its lifetime financial performance</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {vehicles.map((vehicle) => {
            const isSelected = selectedVehicleIds.includes(vehicle.id);
            const plateNumber = vehicle.plate_number || vehicle.plate || `Vehicle-${vehicle.id}`;
            const make = vehicle.make || 'SEGWAY';
            const model = vehicle.model || 'AT6';
            
            return (
              <button
                key={vehicle.id}
                onClick={() => handleVehicleSelection(vehicle.id)}
                className={`
                  p-4 rounded-lg border-2 transition-all duration-200 text-left
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }
                `}
                title={`Select ${plateNumber} - ${make} ${model}`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Car className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <p className={`font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                      {plateNumber}
                    </p>
                    <p className={`text-sm ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>
                      {make} {model}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        
        {selectedVehicle && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Car className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-blue-900">
                  Selected: {selectedVehicle.plate_number || selectedVehicle.plate || `Vehicle-${selectedVehicle.id}`}
                </p>
                <p className="text-sm text-blue-700">
                  {selectedVehicle.make || 'SEGWAY'} {selectedVehicle.model || 'AT6'} • Lifetime Performance Analysis
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vehicle Finance Metrics */}
      {selectedVehicleIds.length > 0 && (
        <>
          {dataLoading ? (
            <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-900">Error Loading Vehicle Data</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          ) : vehicleFinanceData ? (
            <div className="space-y-6">
              {/* Lifetime Financial Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Lifetime Revenue */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white" title="Total revenue generated by this vehicle since acquisition">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-green-100 text-sm font-medium uppercase tracking-wide">Lifetime Revenue</p>
                      <p className="text-3xl font-bold mt-1">{formatCompact(vehicleFinanceData.lifetimeRevenue)}</p>
                      <p className="text-xs text-green-100 mt-1">MAD (real data from rentals)</p>
                    </div>
                    <div className="p-3 bg-white/20 rounded-xl">
                      <DollarSign className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>

                {/* Lifetime Costs */}
                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white" title="Total operational costs for this vehicle since acquisition">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-red-100 text-sm font-medium uppercase tracking-wide">Lifetime Costs</p>
                      <p className="text-3xl font-bold mt-1">{formatCompact(vehicleFinanceData.lifetimeTotalCosts)}</p>
                      <p className="text-xs text-red-100 mt-1">MAD (live cost logs)</p>
                    </div>
                    <div className="p-3 bg-white/20 rounded-xl">
                      <BarChart3 className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>

                {/* Gross Profit */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white" title="Lifetime revenue minus all operational costs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-blue-100 text-sm font-medium uppercase tracking-wide">Gross Profit</p>
                      <p className="text-3xl font-bold mt-1">{formatCompact(vehicleFinanceData.grossProfit)}</p>
                      <p className="text-xs text-blue-100 mt-1">MAD (calculated automatically)</p>
                    </div>
                    <div className="p-3 bg-white/20 rounded-xl">
                      <TrendingUp className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>

                {/* Utilization */}
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white" title="Vehicle utilization rate based on rental days">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-purple-100 text-sm font-medium uppercase tracking-wide">Utilization</p>
                      <p className="text-3xl font-bold mt-1">{vehicleFinanceData.utilizationPercent}%</p>
                      <p className="text-xs text-purple-100 mt-1">Rate (calculated from usage)</p>
                    </div>
                    <div className="p-3 bg-white/20 rounded-xl">
                      <Calendar className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Cost Breakdown */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <BarChart3 className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Lifetime Cost Breakdown</h3>
                    <p className="text-sm text-gray-600">Detailed operational expense analysis for this vehicle</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Maintenance Costs */}
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200" title="Maintenance and repair costs over vehicle lifetime">
                    <div className="flex items-center space-x-3 mb-3">
                      <Wrench className="w-5 h-5 text-orange-600" />
                      <p className="font-semibold text-gray-900">Maintenance</p>
                    </div>
                    <p className="text-2xl font-bold text-orange-600">{formatCompact(vehicleFinanceData.lifetimeMaintenanceCosts)}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {((vehicleFinanceData.lifetimeMaintenanceCosts / Math.max(vehicleFinanceData.lifetimeRevenue, 1)) * 100).toFixed(1)}% of revenue
                    </p>
                  </div>

                  {/* Fuel Costs */}
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200" title="Fuel expenses over vehicle lifetime">
                    <div className="flex items-center space-x-3 mb-3">
                      <Fuel className="w-5 h-5 text-purple-600" />
                      <p className="font-semibold text-gray-900">Fuel</p>
                    </div>
                    <p className="text-2xl font-bold text-purple-600">{formatCompact(vehicleFinanceData.lifetimeFuelCosts)}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {((vehicleFinanceData.lifetimeFuelCosts / Math.max(vehicleFinanceData.lifetimeRevenue, 1)) * 100).toFixed(1)}% of revenue
                    </p>
                  </div>

                  {/* Inventory Costs */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200" title="Parts and consumables used over vehicle lifetime">
                    <div className="flex items-center space-x-3 mb-3">
                      <Package className="w-5 h-5 text-blue-600" />
                      <p className="font-semibold text-gray-900">Inventory</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{formatCompact(vehicleFinanceData.lifetimeInventoryCosts)}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {((vehicleFinanceData.lifetimeInventoryCosts / Math.max(vehicleFinanceData.lifetimeRevenue, 1)) * 100).toFixed(1)}% of revenue
                    </p>
                  </div>

                  {/* Other Costs */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200" title="Miscellaneous operational expenses over vehicle lifetime">
                    <div className="flex items-center space-x-3 mb-3">
                      <MoreHorizontal className="w-5 h-5 text-gray-600" />
                      <p className="font-semibold text-gray-900">Other</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-600">{formatCompact(vehicleFinanceData.lifetimeOtherCosts)}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {((vehicleFinanceData.lifetimeOtherCosts / Math.max(vehicleFinanceData.lifetimeRevenue, 1)) * 100).toFixed(1)}% of revenue
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Fleet Performance Comparison */}
      {vehicleProfitData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Fleet Performance Comparison</h3>
              <p className="text-sm text-gray-600">Lifetime profitability ranking across all vehicles</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {vehicleProfitData.slice(0, 5).map((vehicle, index) => (
              <div key={vehicle.vehicleId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-4">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white
                    ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-500' : 'bg-blue-500'}
                  `}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900" title="Vehicle plate number and model">
                      {vehicle.plateNumber} - {vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-sm text-gray-600">
                      Revenue: {formatCurrency(vehicle.revenue)} MAD • Profit: {formatCurrency(vehicle.profit)} MAD
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-2">
                    {vehicle.profitMargin >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`font-bold ${vehicle.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`} title="Lifetime profit margin percentage">
                      {vehicle.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Lifetime margin</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleFinanceTabV2;
