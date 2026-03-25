import React, { useState, useEffect } from 'react';
import { Calendar, Filter, Car, User, X } from 'lucide-react';
import financeService from '../../services/FinanceService';

const FilterBarV2 = ({ onChange, initialFilters = {} }) => {
  const [filters, setFilters] = useState({
    startDate: initialFilters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: initialFilters.endDate || new Date().toISOString().split('T')[0], // today
    vehicleIds: initialFilters.vehicleIds || [],
    customerIds: initialFilters.customerIds || []
  });

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    // Emit filter changes
    onChange?.(filters);
  }, [filters, onChange]);

  const loadVehicles = async () => {
    try {
      const result = await financeService.getVehicles();
      if (result.success) {
        setVehicles(result.data);
      }
    } catch (error) {
      console.error('Error loading vehicles:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleVehicleToggle = (vehicleId) => {
    const currentIds = filters.vehicleIds;
    const newIds = currentIds.includes(vehicleId)
      ? currentIds.filter(id => id !== vehicleId)
      : [...currentIds, vehicleId];
    
    handleFilterChange('vehicleIds', newIds);
  };

  const clearFilters = () => {
    setFilters({
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      vehicleIds: [],
      customerIds: []
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.vehicleIds.length > 0) count++;
    if (filters.customerIds.length > 0) count++;
    return count;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500 text-sm">to</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            min={filters.startDate}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm transition-colors ${
            showFilters || getActiveFilterCount() > 0
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {getActiveFilterCount() > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
              {getActiveFilterCount()}
            </span>
          )}
        </button>

        {/* Clear Filters */}
        {getActiveFilterCount() > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vehicle Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicles
              </label>
              <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md">
                {vehicles.length === 0 ? (
                  <div className="p-2 text-sm text-gray-500">No vehicles available</div>
                ) : (
                  vehicles.map(vehicle => (
                    <label key={vehicle.id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.vehicleIds.includes(vehicle.id)}
                        onChange={() => handleVehicleToggle(vehicle.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {vehicle.name} ({vehicle.plate_number})
                      </span>
                    </label>
                  ))
                )}
              </div>
              {filters.vehicleIds.length > 0 && (
                <div className="mt-1 text-xs text-gray-600">
                  {filters.vehicleIds.length} vehicle{filters.vehicleIds.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            {/* Customer Filter - Placeholder for future implementation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                Customers
              </label>
              <div className="p-3 border border-gray-300 rounded-md bg-gray-50">
                <div className="text-sm text-gray-500">Customer filtering coming soon</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterBarV2;