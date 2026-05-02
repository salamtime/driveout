import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Calendar,
  MapPin,
  Fuel,
  Car
} from 'lucide-react';
import { getQuickDateRanges, formatDateOnly } from '../../utils/formatters';
import { validateDateRange, validateSearchQuery } from '../../utils/validation';
import { formatVehicleLabel } from '../../utils/vehicleLabels';
import i18n from '../../i18n';

const FuelFiltersPanel = ({ 
  filters, 
  onFiltersChange, 
  vehicles = [], 
  onClearFilters,
  className = '' 
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);
  const [dateErrors, setDateErrors] = useState({});

  const quickDateRanges = getQuickDateRanges();

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    
    // Validate date range when dates change
    if (key === 'startDate' || key === 'endDate') {
      const validation = validateDateRange(
        key === 'startDate' ? value : newFilters.startDate,
        key === 'endDate' ? value : newFilters.endDate
      );
      setDateErrors(validation.errors);
    }

    // Validate search query
    if (key === 'search') {
      const validation = validateSearchQuery(value);
      newFilters[key] = validation.sanitized;
    }

    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleQuickDateRange = (range) => {
    const newFilters = {
      ...localFilters,
      startDate: range.startDate.toISOString().split('T')[0],
      endDate: range.endDate.toISOString().split('T')[0]
    };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
    setDateErrors({});
  };

  const clearAllFilters = () => {
    const clearedFilters = {
      search: '',
      vehicleId: '',
      transactionType: '',
      fuelType: '',
      startDate: '',
      endDate: '',
      fuelStation: '',
      location: ''
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setDateErrors({});
    if (onClearFilters) onClearFilters();
  };

  const getActiveFiltersCount = () => {
    return Object.values(localFilters).filter(value => 
      value !== '' && value !== null && value !== undefined
    ).length;
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl shadow-sm ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-50 transition-colors rounded-t-xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-200 rounded-lg">
            <Filter className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900">{tr('Advanced Filters', 'Filtres avancés')}</h3>
            <p className="text-sm text-blue-600">
              {activeFiltersCount > 0 
                ? tr(
                    `${activeFiltersCount} active filter${activeFiltersCount > 1 ? 's' : ''}`,
                    `${activeFiltersCount} filtre${activeFiltersCount > 1 ? 's' : ''} actif${activeFiltersCount > 1 ? 's' : ''}`
                  )
                : tr('Click to expand filters', 'Cliquez pour développer les filtres')
              }
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {activeFiltersCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearAllFilters();
              }}
              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-full hover:bg-red-200 transition-colors flex items-center space-x-1"
            >
              <X className="h-3 w-3" />
              <span>{tr('Clear all', 'Tout effacer')}</span>
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-blue-600" />
          ) : (
            <ChevronDown className="h-5 w-5 text-blue-600" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-4 border-t border-blue-200">
          {/* Search and Vehicle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-2">
                {tr('Search', 'Rechercher')}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={tr('Search notes, station, location...', 'Rechercher des notes, station, lieu...')}
                  value={localFilters.search || ''}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-800 mb-2">
                {tr('Vehicle', 'Véhicule')}
              </label>
              <div className="relative">
                <Car className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={localFilters.vehicleId || ''}
                  onChange={(e) => handleFilterChange('vehicleId', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                >
                  <option value="">{tr('All vehicles', 'Tous les véhicules')}</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {formatVehicleLabel(vehicle)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Transaction Type and Fuel Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-2">
                {tr('Transaction type', 'Type de transaction')}
              </label>
              <select
                value={localFilters.transactionType || ''}
                onChange={(e) => handleFilterChange('transactionType', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">{tr('All types', 'Tous les types')}</option>
                <option value="tank_refill">{tr('⛽ Add to Tank', '⛽ Ajouter au réservoir')}</option>
                <option value="tank_out">{tr('🛢️ Remove from Tank', '🛢️ Retirer du réservoir')}</option>
                <option value="vehicle_refill">{tr('🚗 Direct Fill', '🚗 Remplissage direct')}</option>
                <option value="withdrawal">{tr('🔄 Tank Transfer', '🔄 Transfert réservoir')}</option>
                <option value="staff_fuel_use">{tr('👤 Staff Fuel Use', '👤 Utilisation carburant équipe')}</option>
                <option value="rental_opening_level">{tr('Rental Opening Fuel', 'Carburant départ location')}</option>
                <option value="rental_closing_level">{tr('Rental Return Fuel', 'Carburant retour location')}</option>
                <option value="manual_adjustment">{tr('Manual Adjustment', 'Ajustement manuel')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-800 mb-2">
                {tr('Fuel type', 'Type de carburant')}
              </label>
              <div className="relative">
                <Fuel className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={localFilters.fuelType || ''}
                  onChange={(e) => handleFilterChange('fuelType', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                >
                  <option value="">{tr('All fuel types', 'Tous les types de carburant')}</option>
                  <option value="gasoline">{tr('Gasoline', 'Essence')}</option>
                  <option value="diesel">Diesel</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-blue-800 mb-2">
              {tr('Period', 'Période')}
            </label>
            <div className="space-y-3">
              {/* Quick Date Buttons */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(quickDateRanges).map(([key, range]) => (
                  <button
                    key={key}
                    onClick={() => handleQuickDateRange(range)}
                    className="px-3 py-1 text-sm bg-white border border-blue-300 text-blue-700 rounded-full hover:bg-blue-50 transition-colors"
                  >
                    {range.label}
                  </button>
                ))}
              </div>

              {/* Date Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      placeholder={tr('Start date', 'Date de début')}
                      value={localFilters.startDate || ''}
                      onChange={(e) => handleFilterChange('startDate', e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        dateErrors.startDate ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {dateErrors.startDate && (
                    <p className="mt-1 text-xs text-red-600">{dateErrors.startDate}</p>
                  )}
                </div>
                <div>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      placeholder={tr('End date', 'Date de fin')}
                      value={localFilters.endDate || ''}
                      onChange={(e) => handleFilterChange('endDate', e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        dateErrors.endDate ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {dateErrors.endDate && (
                    <p className="mt-1 text-xs text-red-600">{dateErrors.endDate}</p>
                  )}
                </div>
              </div>
              {dateErrors.dateRange && (
                <p className="text-xs text-red-600">{dateErrors.dateRange}</p>
              )}
            </div>
          </div>

          {/* Location Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-2">
                {tr('Station name', 'Nom de la station')}
              </label>
              <div className="relative">
                <Fuel className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={tr('Enter fuel station name...', 'Saisir le nom de la station-service...')}
                  value={localFilters.fuelStation || ''}
                  onChange={(e) => handleFilterChange('fuelStation', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-800 mb-2">
                {tr('Area / location', 'Zone / lieu')}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={tr('Enter location...', 'Saisir le lieu...')}
                  value={localFilters.location || ''}
                  onChange={(e) => handleFilterChange('location', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelFiltersPanel;
