import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { fetchVehicles, selectVehicles } from '../../../store/slices/vehiclesSlice';
import { PlusIcon } from '@heroicons/react/24/outline';
import VehicleFormModal from '../VehicleFormModal';
import toast from 'react-hot-toast';

const QuadFuelingLog = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const vehicles = useSelector(selectVehicles) || [];
  
  const [fuelingLogs, setFuelingLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [fuelAmount, setFuelAmount] = useState('');
  const [fuelCost, setFuelCost] = useState('');
  const [fuelingDate, setFuelingDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [pendingVehicleSelection, setPendingVehicleSelection] = useState(null);

  // Load vehicles when component mounts
  useEffect(() => {
    dispatch(fetchVehicles());
  }, [dispatch]);

  const handleAddFuelingLog = () => {
    if (!selectedVehicle || !fuelAmount || !fuelCost) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newLog = {
      id: Date.now(),
      vehicleId: selectedVehicle,
      vehicleName: vehicles.find(v => v.id === parseInt(selectedVehicle))?.name || 'Unknown',
      fuelAmount: parseFloat(fuelAmount),
      fuelCost: parseFloat(fuelCost),
      fuelingDate: new Date(fuelingDate),
      notes,
      createdAt: new Date()
    };

    setFuelingLogs(prev => [newLog, ...prev]);
    
    // Reset form
    setSelectedVehicle('');
    setFuelAmount('');
    setFuelCost('');
    setFuelingDate(new Date().toISOString().slice(0, 16));
    setNotes('');
    
    toast.success('Fueling log added successfully');
  };

  const handleDeleteLog = (logId) => {
    setFuelingLogs(prev => prev.filter(log => log.id !== logId));
    toast.success('Fueling log deleted');
  };

  const handleAddVehicle = () => {
    setPendingVehicleSelection(null);
    setIsVehicleModalOpen(true);
  };

  const handleVehicleAdded = (newVehicle) => {
    // Refresh vehicles list
    dispatch(fetchVehicles());
    
    // If there was a pending selection, select the new vehicle
    if (pendingVehicleSelection) {
      setSelectedVehicle(newVehicle.id);
      setPendingVehicleSelection(null);
    }
    
    setIsVehicleModalOpen(false);
    toast.success('Vehicle added successfully');
  };

  const handleVehicleModalCancel = () => {
    setIsVehicleModalOpen(false);
    setPendingVehicleSelection(null);
  };

  const formatCurrency = (amount) => {
    return `${parseFloat(amount).toFixed(2)} MAD`;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTotalFuelCost = () => {
    return fuelingLogs.reduce((total, log) => total + log.fuelCost, 0);
  };

  const getTotalFuelAmount = () => {
    return fuelingLogs.reduce((total, log) => total + log.fuelAmount, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {t('admin.fuel.title', 'Quad Fueling Log')}
        </h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-blue-800">Total Fuel Cost</h3>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(getTotalFuelCost())}
          </p>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="text-sm font-medium text-green-800">Total Fuel Amount</h3>
          <p className="text-2xl font-bold text-green-900">
            {getTotalFuelAmount().toFixed(2)} L
          </p>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <h3 className="text-sm font-medium text-purple-800">Total Entries</h3>
          <p className="text-2xl font-bold text-purple-900">
            {fuelingLogs.length}
          </p>
        </div>
      </div>

      {/* Add New Fueling Log Form */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-semibold mb-4">Add New Fueling Log</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle *
            </label>
            <div className="flex space-x-2">
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Vehicle</option>
                {vehicles.map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} ({vehicle.plate_number || 'No Plate'})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddVehicle}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Add New Vehicle"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fuel Amount (Liters) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fuelAmount}
              onChange={(e) => setFuelAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fuel Cost (MAD) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fuelCost}
              onChange={(e) => setFuelCost(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fueling Date & Time *
            </label>
            <input
              type="datetime-local"
              value={fuelingDate}
              onChange={(e) => setFuelingDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes about this fueling..."
            />
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleAddFuelingLog}
            disabled={!selectedVehicle || !fuelAmount || !fuelCost}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add Fueling Log
          </button>
        </div>
      </div>

      {/* Fueling Logs Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Fueling History</h3>
        </div>
        
        {fuelingLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No fueling logs recorded yet.</p>
            <p className="text-sm mt-1">Add your first fueling log using the form above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fuel Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fuelingLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.vehicleName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {log.fuelAmount.toFixed(2)} L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(log.fuelCost)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(log.fuelingDate)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {log.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-red-600 hover:text-red-900 focus:outline-none"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vehicle Form Modal */}
      <VehicleFormModal
        isOpen={isVehicleModalOpen}
        onClose={handleVehicleModalCancel}
        onSave={handleVehicleAdded}
        vehicle={null}
      />
    </div>
  );
};

export default QuadFuelingLog;