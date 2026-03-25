import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Filter, 
  Download, 
  Search,
  Calendar,
  Car,
  Fuel,
  DollarSign,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import FuelTransactionsList from '../../components/fuel/FuelTransactionsList';
import FuelFiltersPanel from '../../components/fuel/FuelFiltersPanel';
import AddFuelTransactionModal from '../../components/fuel/AddFuelTransactionModal';
import TransactionDetailsModal from '../../components/fuel/TransactionDetailsModal';
import FuelTransactionService from '../../services/FuelTransactionService';

const FuelTransactions = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editTransaction, setEditTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState('refill');
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
  const [tablesExist, setTablesExist] = useState(false);

  useEffect(() => {
    loadVehicles();
    checkDatabaseSetup();
  }, []);

  const checkDatabaseSetup = async () => {
    try {
      const tablesCheck = await FuelTransactionService.checkTablesExist();
      setTablesExist(Boolean(tablesCheck.transactionsExists));
    } catch (error) {
      console.error('Error checking database setup:', error);
      setTablesExist(false);
    }
  };

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, plate_number')
        .eq('status', 'active')
        .order('name');

      if (error) {
        console.error('Error loading vehicles:', error);
        // Use mock data if tables don't exist
        setVehicles(FuelTransactionService.getMockVehicles());
      } else {
        setVehicles(data || []);
      }
    } catch (err) {
      console.error('Unexpected error loading vehicles:', err);
      // Use mock data if there's an error
      setVehicles(FuelTransactionService.getMockVehicles());
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = (type = 'tank_refill', transaction = null) => {
    setTransactionType(type === 'refill' ? 'tank_refill' : type);
    setEditTransaction(transaction);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setShowDetailsModal(false);
    setSelectedTransaction(null);
    setEditTransaction(null);
  };

  const handleTransactionSuccess = () => {
    // Refresh data if needed
    console.log('Transaction saved successfully');
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Fuel className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Fuel Transactions</h1>
              <p className="text-gray-600">Manage and track all fuel-related transactions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Database Status Warning */}
        {!tablesExist && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <h4 className="font-medium text-yellow-800">Database Setup Required</h4>
                <p className="text-sm text-yellow-700">
                  Enhanced transaction features require database setup. Please run the SQL migration from 
                  <code className="mx-1 px-1 bg-yellow-100 rounded">src/database/fuel_management_schema.sql</code>
                  in your Supabase dashboard. Currently showing mock data.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">All Fuel Transactions</h2>
            <p className="text-gray-600">Complete transaction history with advanced filtering</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => handleAddTransaction('withdrawal')}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Car className="w-4 h-4" />
              Tank to Vehicle
            </button>
            
            <button
              onClick={() => handleAddTransaction('tank_refill')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Refill Tank
            </button>

            <button
              onClick={() => handleAddTransaction('vehicle_refill')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Fuel className="w-4 h-4" />
              Direct Vehicle Refill
            </button>
          </div>
        </div>

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

      {/* Modals */}
      {showAddModal && (
        <AddFuelTransactionModal
          isOpen={showAddModal}
          onClose={handleCloseModal}
          transactionType={transactionType}
          editTransaction={editTransaction}
          vehicles={vehicles}
          onSuccess={handleTransactionSuccess}
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

export default FuelTransactions;
