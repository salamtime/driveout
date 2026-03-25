import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Custom debounce function to avoid external dependency
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

const RentalFilters = ({ onFiltersChange, vehicleTypes = [] }) => {
  const { t } = useTranslation();
  
  const [filters, setFilters] = useState({
    customerName: '',
    startDate: '',
    endDate: '',
    vehicleType: '',
    status: '',
    paymentStatus: '', // Added paymentStatus
    minAmount: '',
    maxAmount: ''
  });

  // Debounced filter change handler to prevent excessive API calls
  const debouncedFiltersChange = useCallback(
    debounce((newFilters) => {
      onFiltersChange(newFilters);
    }, 300),
    [onFiltersChange]
  );

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    debouncedFiltersChange(newFilters);
  };

  // Clear all filters
  const clearFilters = () => {
    const emptyFilters = {
      customerName: '',
      startDate: '',
      endDate: '',
      vehicleType: '',
      status: '',
      paymentStatus: '', // Reset paymentStatus
      minAmount: '',
      maxAmount: ''
    };
    setFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {t('admin.rentals.filters', 'Filters')}
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {t('admin.rentals.clearFilters', 'Clear All Filters')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Customer Name Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.customerName', 'Customer Name')}
          </label>
          <input
            type="text"
            value={filters.customerName}
            onChange={(e) => handleFilterChange('customerName', e.target.value)}
            placeholder={t('admin.rentals.searchCustomer', 'Search by customer name...')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Start Date Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.startDate', 'Start Date')}
          </label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* End Date Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.endDate', 'End Date')}
          </label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Vehicle Type Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.vehicleType', 'Vehicle Type')}
          </label>
          <select
            value={filters.vehicleType}
            onChange={(e) => handleFilterChange('vehicleType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t('admin.rentals.allTypes', 'All Types')}</option>
            <option value="ATV">{t('admin.rentals.atv', 'ATV')}</option>
            <option value="Quad">{t('admin.rentals.quad', 'Quad')}</option>
            <option value="Side-by-side">{t('admin.rentals.sideBySide', 'Side-by-side')}</option>
            <option value="Motorcycle">{t('admin.rentals.motorcycle', 'Motorcycle')}</option>
            <option value="UTV">{t('admin.rentals.utv', 'UTV')}</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.status', 'Status')}
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t('admin.rentals.allStatuses', 'All Statuses')}</option>
            <option value="active">{t('admin.rentals.active', 'Active')}</option>
            <option value="scheduled">{t('admin.rentals.scheduled', 'Scheduled')}</option>
            <option value="completed">{t('admin.rentals.completed', 'Completed')}</option>
            <option value="cancelled">{t('admin.rentals.cancelled', 'Cancelled')}</option>
          </select>
        </div>

        {/* Payment Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Status
          </label>
          <select
            value={filters.paymentStatus}
            onChange={(e) => handleFilterChange('paymentStatus', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        {/* Min Amount Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.minAmount', 'Min Amount')}
          </label>
          <input
            type="number"
            step="0.01"
            value={filters.minAmount}
            onChange={(e) => handleFilterChange('minAmount', e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Max Amount Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('admin.rentals.maxAmount', 'Max Amount')}
          </label>
          <input
            type="number"
            step="0.01"
            value={filters.maxAmount}
            onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
            placeholder="999999.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters).map(([key, value]) => {
              if (!value) return null;
              
              const filterLabels = {
                customerName: t('admin.rentals.customer', 'Customer'),
                startDate: t('admin.rentals.startDate', 'Start Date'),
                endDate: t('admin.rentals.endDate', 'End Date'),
                vehicleType: t('admin.rentals.vehicleType', 'Vehicle Type'),
                status: t('admin.rentals.status', 'Status'),
                paymentStatus: 'Payment Status',
                minAmount: t('admin.rentals.minAmount', 'Min Amount'),
                maxAmount: t('admin.rentals.maxAmount', 'Max Amount')
              };

              return (
                <span
                  key={key}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {filterLabels[key]}: {value}
                  <button
                    onClick={() => handleFilterChange(key, '')}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalFilters;