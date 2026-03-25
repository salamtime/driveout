import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Fuel, 
  Plus, 
  Minus, 
  Droplets, 
  Gauge, 
  TrendingUp, 
  Car, 
  AlertTriangle,
  Calendar,
  DollarSign,
  MapPin,
  User
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import FuelFiltersPanel from './fuel/FuelFiltersPanel';
import FuelTransactionsList from './fuel/FuelTransactionsList';
import AddFuelTransactionModal from './fuel/AddFuelTransactionModal';
import TransactionDetailsModal from './fuel/TransactionDetailsModal';
import FuelTransactionService from '../services/FuelTransactionService';
import { roundTo } from '../utils/fuelMath';
import { formatVehicleLabel, formatVehicleNameWithModel } from '../utils/vehicleLabels';
import { getFuelTransactionVisual } from '../utils/fuelVisuals';
import { useAuth } from '../contexts/AuthContext';
import AdminModuleHero from './admin/AdminModuleHero';

const FuelManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [fuelData, setFuelData] = useState({
    tank: null,
    refills: [],
    withdrawals: []
  });
  const [vehicles, setVehicles] = useState([]);
  const [vehicleStates, setVehicleStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState(true); // Default to true, will be checked

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editTransaction, setEditTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState('refill');
  const [prefilledVehicleId, setPrefilledVehicleId] = useState('');

  // Filter states for transactions tab
  const [filters, setFilters] = useState({
    search: '',
    vehicleId: '',
    transactionType: '',
    fuelType: '',
    startDate: '',
    endDate: '',
    fuelStation: '',
    location: ''
  });

  useEffect(() => {
    loadFuelData();
    loadVehicles();
    checkDatabaseSetup();
  }, []);

  useEffect(() => {
    const requestedTab = location.state?.activeTab;
    const requestedFilters = location.state?.fuelFilters;

    if (requestedTab) {
      setActiveTab(requestedTab);
    }

    if (requestedFilters) {
      setFilters((current) => ({
        ...current,
        ...requestedFilters,
      }));
    }
  }, [location.state]);

  const checkDatabaseSetup = async () => {
    try {
      console.log('Checking database setup...');
      const tablesCheck = await FuelTransactionService.checkTablesExist();
      console.log('Database check result:', tablesCheck);
      setTablesExist(tablesCheck.allTablesExist);
    } catch (error) {
      console.error('Error checking database setup:', error);
      setTablesExist(false);
    }
  };

  const loadVehicles = async () => {
    try {
      console.log('🚗 Loading vehicles from database...');
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, plate_number, model, vehicle_type')
        .order('name');

      if (error) {
        console.error('❌ Error loading vehicles:', error);
        setVehicles([]);
        return;
      }

      console.log('✅ Loaded vehicles:', data);
      setVehicles(data || []);
    } catch (error) {
      console.error('❌ Error loading vehicles:', error);
      setVehicles([]);
    }
  };

  const loadFuelData = async () => {
    setLoading(true);
    try {
      console.log('Loading fuel data...');
      const unifiedData = await FuelTransactionService.getUnifiedFuelData();
      console.log('Loaded unified data:', unifiedData);
      setFuelData(unifiedData);
      setVehicleStates(unifiedData.vehicleStates || []);
      
    } catch (error) {
      console.error('Error loading fuel data:', error);
      // Set default data on error
      setFuelData({
        tank: {
          id: 'default',
          name: 'Main Tank',
          capacity: 1000,
          initial_volume: 0,
          location: 'Main Depot',
          fuel_type: 'gasoline'
        },
        refills: [],
        withdrawals: []
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate current tank volume using unified logic
  const getCurrentVolume = () => {
    return FuelTransactionService.calculateCurrentVolume(
      fuelData.tank, 
      fuelData.refills, 
      fuelData.withdrawals
    );
  };

  const getTankPercentage = () => {
    if (!fuelData.tank || !fuelData.tank.capacity) return 0;
    const currentVolume = getCurrentVolume();
    return Math.min((currentVolume / fuelData.tank.capacity) * 100, 100);
  };

  const getTankColor = () => {
    const percentage = getTankPercentage();
    if (percentage <= 15) return 'text-red-600';
    if (percentage <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressBarColor = () => {
    const percentage = getTankPercentage();
    if (percentage <= 15) return 'bg-red-500';
    if (percentage <= 30) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Get recent transactions using unified data
  const getRecentRefills = () => {
    return fuelData.refills
      .filter(refill => !refill.vehicle_id) // Tank refills only
      .slice(0, 5);
  };

  const getRecentVehicleRefills = () => {
    return fuelData.refills
      .filter(refill => refill.vehicle_id) // Vehicle refills only
      .slice(0, 3);
  };

  const getRecentWithdrawals = () => {
    return fuelData.withdrawals.slice(0, 5);
  };

  // Modal handlers
  const handleAddTransaction = (type = 'refill', transaction = null, vehicleId = '') => {
    console.log('🎯 handleAddTransaction called:', { type, transaction, vehicleId });
    
    setTransactionType(type === 'refill' ? 'tank_refill' : type);
    setEditTransaction(transaction);
    setPrefilledVehicleId(vehicleId || transaction?.vehicle_id || '');
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setShowDetailsModal(false);
    setSelectedTransaction(null);
    setEditTransaction(null);
    setPrefilledVehicleId('');
  };

  const handleTransactionSuccess = (savedTransaction) => {
    console.log('✅ Transaction saved successfully:', savedTransaction);
    loadFuelData(); // Refresh data after successful transaction
    handleCloseModal();
  };

  const handleViewDetails = (transaction) => {
    setSelectedTransaction(transaction);
    setShowDetailsModal(true);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      vehicleId: '',
      transactionType: '',
      fuelType: '',
      startDate: '',
      endDate: '',
      fuelStation: '',
      location: ''
    });
  };

  const openWithdrawalTransactions = () => {
    setActiveTab('transactions');
    setFilters((current) => ({
      ...current,
      transactionType: 'withdrawal',
    }));
  };

  const openRefillTransactions = () => {
    setActiveTab('transactions');
    setFilters((current) => ({
      ...current,
      transactionType: '',
    }));
  };

  // Determine modal type based on transaction
  const getModalType = (transaction) => {
    if (!transaction) return 'vehicle';
    
    // Check transaction_type field
    if (transaction.transaction_type === 'tank_refill') {
      return 'tank';
    } else if (transaction.transaction_type === 'vehicle_refill') {
      return 'vehicle';
    }
    
    // Fallback: check if vehicle_id exists
    return transaction.vehicle_id ? 'vehicle' : 'tank';
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '0.00 MAD';
    return `${parseFloat(amount).toFixed(2)} MAD`;
  };

  // Format date for Africa/Casablanca timezone
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const isPrivilegedFuelViewer = ['owner', 'admin'].includes(userProfile?.role);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading fuel management data...</p>
        </div>
      </div>
    );
  }

  const safeRefills = getRecentRefills();
  const safeVehicleRefills = getRecentVehicleRefills();
  const safeWithdrawals = getRecentWithdrawals();

  console.log('🔍 RENDER: vehicles count:', vehicles.length);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminModuleHero
        icon={<Fuel className="h-8 w-8 text-white" />}
        eyebrow="Fuel Management"
        title="Fuel Management"
        description="Monitor tank levels, track refills, and manage fuel withdrawals from one workspace."
      />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'overview'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'transactions'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Fuel Transactions
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Database Status Warning - Only show if tables don't exist */}
            {!tablesExist && isPrivilegedFuelViewer && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Database Setup Required</h4>
                    <p className="text-sm text-yellow-700">
                      Fuel management tables not found. Please run the SQL schema to set up fuel_tank, fuel_refills, and fuel_withdrawals tables.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tank Status */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-blue-600" />
                    Main Tank Status
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleAddTransaction('tank_refill')}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 flex items-center gap-2"
                      title="Add fuel into the main tank"
                    >
                      <Plus className="w-4 h-4" />
                      ⛽ Tank In
                    </button>
                    <button
                      onClick={() => handleAddTransaction('vehicle_refill')}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 flex items-center gap-2"
                      title="Refill a vehicle directly without using the main tank"
                    >
                      <Fuel className="w-4 h-4" />
                      🚗 Direct Fill
                    </button>
                    <button
                      onClick={() => handleAddTransaction('withdrawal')}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 flex items-center gap-2"
                      title="Transfer fuel from the main tank to a vehicle"
                    >
                      <Minus className="w-4 h-4" />
                      🔄 Transfer
                    </button>
                  </div>
                </div>

                {/* Tank Visual */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Current Volume</span>
                    <span className={`text-2xl font-bold ${getTankColor()}`}>
                      {getCurrentVolume()}L ({getTankPercentage().toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden">
                    <div 
                      className={`h-6 rounded-full transition-all duration-500 ${getProgressBarColor()}`}
                      style={{ width: `${Math.min(getTankPercentage(), 100)}%` }}
                    ></div>
                    {getTankPercentage() <= 15 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  {getTankPercentage() <= 15 && (
                    <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Low fuel alert - Refill recommended
                    </p>
                  )}
                </div>

                {/* Tank Statistics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <Droplets className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{getCurrentVolume()}L</p>
                    <p className="text-sm text-gray-600">Available</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <Gauge className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{fuelData.tank?.capacity || 0}L</p>
                    <p className="text-sm text-gray-600">Capacity</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-gray-900">{getTankPercentage().toFixed(1)}%</p>
                    <p className="text-sm text-gray-600">Fill Level</p>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Plus className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Recent Refills</h3>
                        <p className="text-sm text-gray-600">{safeRefills.length + safeVehicleRefills.length} this period</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openRefillTransactions}
                      className="text-sm font-medium text-green-700 hover:text-green-800"
                    >
                      Open all
                    </button>
                  </div>
                  {[...safeRefills.slice(0, 2), ...safeVehicleRefills.slice(0, 1)].map((refill, index) => {
                    const visual = getFuelTransactionVisual(refill.transaction_type || (refill.vehicle_id ? 'vehicle_refill' : 'tank_refill'));
                    return (
                      <button
                        key={`${refill.id}-${index}`}
                        type="button"
                        onClick={() => handleViewDetails(refill)}
                        className="flex w-full items-center justify-between border-b border-gray-100 py-2 text-left transition hover:bg-gray-50 last:border-b-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            <span className="mr-2">{visual.emoji}</span>
                            {refill.liters_added || refill.liters}L
                            <span className="ml-2 text-xs font-medium text-gray-500">{visual.shortLabel}</span>
                            {refill.saharax_0u4w4d_vehicles && (
                              <span className="ml-2 text-xs text-blue-700">
                                {formatVehicleLabel(refill.saharax_0u4w4d_vehicles)}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(refill.refill_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {formatCurrency(refill.total_cost)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatCurrency(refill.unit_price || refill.price_per_liter)}/L
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Car className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Recent Withdrawals</h3>
                        <p className="text-sm text-gray-600">{safeWithdrawals.length} this period</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openWithdrawalTransactions}
                      className="text-sm font-medium text-blue-700 hover:text-blue-800"
                    >
                      Open all
                    </button>
                  </div>
                  {safeWithdrawals.slice(0, 3).map((withdrawal) => {
                    const visual = getFuelTransactionVisual('withdrawal');
                    return (
                    <button
                      key={withdrawal.id}
                      type="button"
                      onClick={() => handleViewDetails(withdrawal)}
                      className="flex w-full items-center justify-between border-b border-gray-100 py-2 text-left transition hover:bg-gray-50 last:border-b-0"
                    >
                      <div>
                        {withdrawal.vehicle?.id ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/admin/fleet/${withdrawal.vehicle.id}`);
                            }}
                            className="text-left transition hover:text-blue-700"
                          >
                            <p className="text-sm font-medium text-gray-900 underline decoration-blue-200 underline-offset-4">
                              {formatVehicleNameWithModel(withdrawal.vehicle)}
                              {withdrawal.vehicle?.plate_number && (
                                <span className="ml-2 font-mono text-[11px] font-semibold tracking-wide text-blue-700">
                                  {withdrawal.vehicle.plate_number}
                                </span>
                              )}
                            </p>
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-gray-900">
                            {withdrawal.vehicle ? formatVehicleNameWithModel(withdrawal.vehicle) : `Vehicle ${withdrawal.vehicle_id}`}
                            {withdrawal.vehicle?.plate_number && (
                              <span className="ml-2 font-mono text-[11px] font-semibold tracking-wide text-blue-700">
                                {withdrawal.vehicle.plate_number}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          <span className="mr-1">{visual.emoji}</span>
                          {formatDate(withdrawal.withdrawal_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{withdrawal.liters_taken}L</p>
                        {withdrawal.odometer_reading && (
                          <p className="text-xs text-gray-500">{withdrawal.odometer_reading}km</p>
                        )}
                      </div>
                    </button>
                  )})}
                </div>
              </div>
            </div>

            {/* Recent Activity Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Vehicle Fuel Board</h3>
                    <p className="text-sm text-gray-500">Live 8-line view of all vehicle fuel levels</p>
                  </div>
                  <button
                    onClick={() => handleAddTransaction('withdrawal')}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Transfer Fuel →
                  </button>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {vehicleStates.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-gray-500">
                      No vehicle fuel state available yet
                    </div>
                  ) : (
                    vehicleStates.map((vehicle) => (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => handleAddTransaction('withdrawal', null, vehicle.id)}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-lg font-bold tracking-wide text-blue-900">
                              {vehicle.plate_number || 'No Plate'}
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">{formatVehicleNameWithModel(vehicle)}</p>
                          </div>
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            vehicle.fuel_status_color === 'green' ? 'bg-green-100 text-green-700' :
                            vehicle.fuel_status_color === 'blue' ? 'bg-blue-100 text-blue-700' :
                            vehicle.fuel_status_color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {vehicle.fuel_status}
                          </span>
                        </div>

                        <div className="mt-3 flex items-end gap-1">
                          {Array.from({ length: 8 }, (_, index) => index + 1).map((segment) => (
                            <div
                              key={segment}
                              className={`h-7 w-4 rounded-sm ${
                                segment <= (vehicle.current_fuel_lines || 0) ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            />
                          ))}
                        </div>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-900">{vehicle.current_fuel_lines || 0}/8 lines</span>
                          <span className="text-gray-600">{roundTo(vehicle.current_fuel_liters || 0, 2)}L</span>
                        </div>

                        <p className="mt-2 text-xs text-gray-500">
                          Last source: {vehicle.last_fuel_source || 'unknown'}
                        </p>
                        <p className="mt-3 text-xs font-medium text-blue-700">
                          Tap to open Tank Transfer for this vehicle
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Refills */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Plus className="w-5 h-5 text-green-600" />
                      Recent Refills
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAddTransaction('tank_refill')}
                        className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                        title="Add fuel into the main tank"
                      >
                        ⛽ Tank In
                      </button>
                      <button
                        onClick={() => handleAddTransaction('vehicle_refill')}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                        title="Refill a vehicle directly without using the main tank"
                      >
                        🚗 Direct Fill
                      </button>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Liters</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {safeRefills.slice(0, 3).map((refill) => {
                        const visual = getFuelTransactionVisual('tank_refill');
                        return (
                        <tr
                          key={`tank-${refill.id}`}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleViewDetails(refill)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatDate(refill.refill_date)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${visual.badgeClass}`}>
                              <span className="mr-1">{visual.emoji}</span>
                              {visual.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{refill.liters_added}L</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p className="font-medium">{formatCurrency(refill.total_cost)}</p>
                              <p className="text-xs text-gray-500">{formatCurrency(refill.unit_price)}/L</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">—</td>
                        </tr>
                      )})}
                      
                      {safeVehicleRefills.slice(0, 2).map((refill) => {
                        const visual = getFuelTransactionVisual('vehicle_refill');
                        return (
                        <tr
                          key={`vehicle-${refill.id}`}
                          className="cursor-pointer bg-blue-50 hover:bg-blue-100"
                          onClick={() => handleViewDetails(refill)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatDate(refill.refill_date)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${visual.badgeClass}`}>
                              <span className="mr-1">{visual.emoji}</span>
                              {visual.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{refill.liters_added || refill.liters}L</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p className="font-medium">{formatCurrency(refill.total_cost)}</p>
                              <p className="text-xs text-gray-500">{formatCurrency(refill.unit_price || refill.price_per_liter)}/L</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p className="font-medium text-blue-700">
                                {formatVehicleNameWithModel(refill.saharax_0u4w4d_vehicles)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {refill.saharax_0u4w4d_vehicles?.plate_number}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {safeRefills.length === 0 && safeVehicleRefills.length === 0 && (
                    <div className="text-center py-8">
                      <Fuel className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">No refills recorded yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Withdrawals */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={openWithdrawalTransactions}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openWithdrawalTransactions();
                    }
                  }}
                  className="cursor-pointer border-b border-gray-200 p-4 transition hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Car className="w-5 h-5 text-blue-600" />
                      Recent Withdrawals
                    </h3>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAddTransaction('withdrawal');
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                      title="Transfer fuel from the main tank to a vehicle"
                    >
                      🔄 Transfer
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Liters</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Odometer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {safeWithdrawals.slice(0, 5).map((withdrawal) => {
                        const visual = getFuelTransactionVisual('withdrawal');
                        return (
                        <tr
                          key={withdrawal.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleViewDetails(withdrawal)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <span className="mr-2">{visual.emoji}</span>
                            {formatDate(withdrawal.withdrawal_date)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              {withdrawal.vehicle?.id ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/admin/fleet/${withdrawal.vehicle.id}`);
                                  }}
                                  className="text-left transition hover:text-blue-700"
                                >
                                  <p className="font-medium underline decoration-blue-200 underline-offset-4">
                                    {formatVehicleNameWithModel(withdrawal.vehicle)}
                                    {withdrawal.vehicle?.plate_number && (
                                      <span className="ml-2 font-mono text-xs font-semibold tracking-wide text-blue-700">
                                        {withdrawal.vehicle.plate_number}
                                      </span>
                                    )}
                                  </p>
                                </button>
                              ) : (
                                <p className="font-medium">
                                  {withdrawal.vehicle ? formatVehicleNameWithModel(withdrawal.vehicle) : `Vehicle ${withdrawal.vehicle_id}`}
                                  {withdrawal.vehicle?.plate_number && (
                                    <span className="ml-2 font-mono text-xs font-semibold tracking-wide text-blue-700">
                                      {withdrawal.vehicle.plate_number}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{withdrawal.liters_taken}L</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {withdrawal.odometer_reading ? `${withdrawal.odometer_reading}km` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{withdrawal.filled_by}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {safeWithdrawals.length === 0 && (
                    <div className="text-center py-8">
                      <Car className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">No withdrawals recorded yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="p-6 space-y-6">
            {/* Enhanced Transaction Management */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">All Fuel Transactions</h2>
                <p className="text-gray-600">Complete transaction history with advanced filtering and management</p>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleAddTransaction('tank_refill')}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                >
                  <Plus className="w-4 h-4" />
                  ⛽ Tank In
                </button>

                <button
                  onClick={() => handleAddTransaction('withdrawal')}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  <Minus className="w-4 h-4" />
                  🔄 Transfer
                </button>

                <button
                  onClick={() => handleAddTransaction('vehicle_refill')}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
                >
                  <Fuel className="w-4 h-4" />
                  🚗 Direct Fill
                </button>
              </div>
            </div>

            {/* Database Status Warning - Only show if tables don't exist */}
            {!tablesExist && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Database Setup Required</h4>
                    <p className="text-sm text-yellow-700">
                      Fuel management tables not found. Please run the SQL schema to set up fuel_tank, fuel_refills, and fuel_withdrawals tables.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Filters Panel */}
            <FuelFiltersPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
              vehicles={vehicles}
            />

            {/* Transactions List */}
            <FuelTransactionsList
              filters={filters}
              vehicles={vehicles}
              onAddTransaction={handleAddTransaction}
              onViewDetails={handleViewDetails}
            />
          </div>
        )}
      </div>

      {/* Enhanced Transaction Modals */}
      {showAddModal && (
        <AddFuelTransactionModal
          isOpen={showAddModal}
          onClose={handleCloseModal}
          editTransaction={editTransaction}
          vehicles={vehicles}
          transactionType={transactionType}
          initialVehicleId={prefilledVehicleId}
          onSave={handleTransactionSuccess}
        />
      )}

      {showDetailsModal && selectedTransaction && (
        <TransactionDetailsModal
          isOpen={showDetailsModal}
          onClose={handleCloseModal}
          transaction={selectedTransaction}
          modalType={getModalType(selectedTransaction)}
          onEdit={(transaction) => {
            setShowDetailsModal(false);
            handleAddTransaction(transaction.transaction_type, transaction);
          }}
        />
      )}
    </div>
  );
};

export default FuelManagement;
