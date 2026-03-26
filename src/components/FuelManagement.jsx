import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
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
  const [showVehicleActionModal, setShowVehicleActionModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editTransaction, setEditTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState('refill');
  const [prefilledVehicleId, setPrefilledVehicleId] = useState('');
  const [selectedVehicleActionTarget, setSelectedVehicleActionTarget] = useState(null);
  const [isEditingTankCapacity, setIsEditingTankCapacity] = useState(false);
  const [tankCapacityInput, setTankCapacityInput] = useState('500');
  const [showRecentRefills, setShowRecentRefills] = useState(false);
  const [showRecentWithdrawals, setShowRecentWithdrawals] = useState(false);

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
        .select('id, name, plate_number, model, vehicle_type, current_odometer')
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
      setTankCapacityInput(String(unifiedData?.tank?.capacity || 500));
      
    } catch (error) {
      console.error('Error loading fuel data:', error);
      // Set default data on error
      setFuelData({
        tank: {
          id: 'default',
          name: 'Main Tank',
          capacity: 500,
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
    const liveVolume = Number(fuelData?.tank?.current_volume_liters);
    if (Number.isFinite(liveVolume)) {
      return Math.max(0, liveVolume);
    }

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

  const renderTankManagementPanel = () => (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Fuel Tank</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Main Tank Status</h3>
            <p className="mt-1 text-sm text-slate-600">Manage capacity and tank-only movements from one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAddTransaction('tank_refill')}
              className="rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              title="Add fuel into the main tank"
            >
              ⛽ Tank In
            </button>
            <button
              onClick={() => handleAddTransaction('tank_out')}
              className="rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
              title="Remove fuel from the main tank"
            >
              🛢️ Tank Out
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-600">Current Volume</p>
                <p className={`mt-2 text-3xl font-bold ${getTankColor()}`}>
                  {getCurrentVolume()}L
                </p>
                <p className="mt-1 text-sm text-slate-500">{getTankPercentage().toFixed(1)}% full</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Capacity</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{fuelData.tank?.capacity || 500}L</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="h-5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor()}`}
                  style={{ width: `${Math.min(getTankPercentage(), 100)}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-slate-500">Available</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{getCurrentVolume()}L</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-slate-500">Remaining</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {Math.max((fuelData.tank?.capacity || 500) - getCurrentVolume(), 0)}L
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-slate-500">Fill Level</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{getTankPercentage().toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {getTankPercentage() <= 15 && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Low fuel alert. Tank refill recommended.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Tank Capacity</p>
                {!isEditingTankCapacity ? (
                  <p className="mt-2 text-2xl font-bold text-slate-900">{fuelData.tank?.capacity || 500}L</p>
                ) : null}
              </div>
              {!isEditingTankCapacity && (
                <button
                  type="button"
                  onClick={() => setIsEditingTankCapacity(true)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Edit Capacity
                </button>
              )}
            </div>

            {isEditingTankCapacity ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Capacity (L)</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={tankCapacityInput}
                      onChange={(e) => setTankCapacityInput(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                    <span className="text-sm font-semibold text-slate-500">L</span>
                  </div>
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSaveTankCapacity}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTankCapacityInput(String(fuelData.tank?.capacity || 500));
                      setIsEditingTankCapacity(false);
                    }}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-600">Use Fuel Tank when the main reservoir capacity changes.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

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
    setShowVehicleActionModal(false);
    setSelectedTransaction(null);
    setEditTransaction(null);
    setPrefilledVehicleId('');
    setSelectedVehicleActionTarget(null);
  };

  const handleOpenVehicleActions = (vehicle) => {
    setSelectedVehicleActionTarget(vehicle);
    setShowVehicleActionModal(true);
  };

  const handleVehicleActionChoice = (type) => {
    const vehicleId = selectedVehicleActionTarget?.id || '';
    setShowVehicleActionModal(false);
    setSelectedVehicleActionTarget(null);
    handleAddTransaction(type, null, vehicleId);
  };

  const handleTransactionSuccess = (savedTransaction) => {
    console.log('✅ Transaction saved successfully:', savedTransaction);
    loadFuelData(); // Refresh data after successful transaction
    handleCloseModal();
  };

  const handleSaveTankCapacity = async () => {
    const capacity = Math.max(1, Number(tankCapacityInput || 0));
    if (!capacity) return;

    const result = await FuelTransactionService.updateTankSettings({
      capacity_liters: capacity,
    });

    if (!result.success) {
      console.error('Failed to update tank capacity:', result.error);
      toast.error(result.error || 'Failed to save tank capacity');
      return;
    }

    setFuelData((prev) => ({
      ...prev,
      tank: {
        ...(prev.tank || {}),
        ...(result.tank || {}),
        capacity: Number(result.tank?.capacity_liters || result.tank?.capacity || capacity),
      },
    }));
    setTankCapacityInput(String(capacity));
    setIsEditingTankCapacity(false);
    toast.success('Tank capacity updated');
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

  const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-US', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
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

      <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="inline-flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-slate-50 p-2 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-white text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              All Fuel Transactions
            </button>
            <button
              onClick={() => setActiveTab('fuel-tank')}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'fuel-tank'
                  ? 'bg-white text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              Fuel Tank
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

            {/* Recent Activity Tables */}
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
                <button
                  onClick={() => handleAddTransaction('tank_refill')}
                  className="rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                  title="Add fuel into the main tank"
                >
                  ⛽ Tank In
                </button>
                <button
                  onClick={() => handleAddTransaction('vehicle_refill')}
                  className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  title="Refill a vehicle directly without using the main tank"
                >
                  🚗 Direct Fill
                </button>
                <button
                  onClick={() => handleAddTransaction('withdrawal')}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  title="Transfer fuel from the main tank to a vehicle"
                >
                  🔄 Transfer
                </button>
              </div>

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
                        onClick={() => handleOpenVehicleActions(vehicle)}
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
                          Tap for vehicle fuel actions
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Refills */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRecentRefills((current) => !current)}
                  className="flex w-full items-center justify-between border-b border-gray-200 p-4 text-left transition hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Plus className="w-5 h-5 text-green-600" />
                      Recent Refills
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{safeRefills.length + safeVehicleRefills.length} entries</p>
                  </div>
                  {showRecentRefills ? <Minus className="h-5 w-5 text-slate-400" /> : <Plus className="h-5 w-5 text-slate-400" />}
                </button>
                {showRecentRefills && (
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
                            <div>
                              <p>{formatDate(refill.refill_date)}</p>
                              <p className="text-xs text-gray-500">{formatTime(refill.refill_date)}</p>
                            </div>
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
                            <div>
                              <p>{formatDate(refill.refill_date)}</p>
                              <p className="text-xs text-gray-500">{formatTime(refill.refill_date)}</p>
                            </div>
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
                )}
              </div>

              {/* Recent Withdrawals */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRecentWithdrawals((current) => !current)}
                  className="flex w-full items-center justify-between border-b border-gray-200 p-4 text-left transition hover:bg-gray-50"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Car className="w-5 h-5 text-blue-600" />
                      Recent Withdrawals
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{safeWithdrawals.length} entries</p>
                  </div>
                  {showRecentWithdrawals ? <Minus className="h-5 w-5 text-slate-400" /> : <Plus className="h-5 w-5 text-slate-400" />}
                </button>
                {showRecentWithdrawals && (
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
                            <div>
                              <p>
                                <span className="mr-2">{visual.emoji}</span>
                                {formatDate(withdrawal.withdrawal_date)}
                              </p>
                              <p className="text-xs text-gray-500">{formatTime(withdrawal.withdrawal_date)}</p>
                            </div>
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
                )}
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

        {activeTab === 'fuel-tank' && renderTankManagementPanel()}
      </div>

      {/* Enhanced Transaction Modals */}
      {showAddModal && (
        <AddFuelTransactionModal
          isOpen={showAddModal}
          onClose={handleCloseModal}
          editTransaction={editTransaction}
          vehicles={vehicles}
          vehicleStates={vehicleStates}
          tankSummary={fuelData.tank}
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

      {showVehicleActionModal && selectedVehicleActionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Vehicle Fuel Action</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  {formatVehicleNameWithModel(selectedVehicleActionTarget)}
                </h3>
                <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-blue-700">
                  {selectedVehicleActionTarget.plate_number || 'No Plate'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVehicleActionModal(false);
                  setSelectedVehicleActionTarget(null);
                }}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close vehicle fuel actions"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => handleVehicleActionChoice('vehicle_refill')}
                className="rounded-2xl bg-indigo-600 px-4 py-4 text-left text-white transition-colors hover:bg-indigo-700"
              >
                <div className="text-base font-semibold">🚗 Direct Fill</div>
                <div className="mt-1 text-sm text-indigo-100">Refill this vehicle directly</div>
              </button>
              <button
                type="button"
                onClick={() => handleVehicleActionChoice('withdrawal')}
                className="rounded-2xl bg-blue-600 px-4 py-4 text-left text-white transition-colors hover:bg-blue-700"
              >
                <div className="text-base font-semibold">🔄 Transfer</div>
                <div className="mt-1 text-sm text-blue-100">Move fuel from main tank to this vehicle</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelManagement;
