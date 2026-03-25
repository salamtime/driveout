import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Filter, X, Calendar, MapPin, DollarSign, Clock, Car } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { debounce } from 'lodash';
import PerformanceMonitor from '../../utils/PerformanceMonitor';
import CacheService from '../../services/CacheService';

const AdvancedSearch = ({ 
  onSearch, 
  onFilterChange, 
  searchType = 'rentals', // 'rentals', 'bookings', 'vehicles'
  initialFilters = {},
  className = ''
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const cache = useMemo(() => new CacheService(`search_${searchType}`), [searchType]);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (term, currentFilters) => {
      const startTime = performance.now();
      setIsLoading(true);
      
      try {
        // Check cache first
        const cacheKey = `search_${term}_${JSON.stringify(currentFilters)}`;
        const cachedResults = await cache.get(cacheKey);
        
        if (cachedResults) {
          onSearch(cachedResults);
          PerformanceMonitor.recordMetric('search_cache_hit', performance.now() - startTime);
        } else {
          // Perform search
          const results = await performSearch(term, currentFilters);
          
          // Cache results
          await cache.set(cacheKey, results, 5 * 60 * 1000); // 5 minutes
          
          onSearch(results);
          PerformanceMonitor.recordMetric('search_database_query', performance.now() - startTime);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [onSearch, cache]
  );

  // Debounced suggestions function
  const debouncedSuggestions = useCallback(
    debounce(async (term) => {
      if (term.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const cacheKey = `suggestions_${term}`;
        const cachedSuggestions = await cache.get(cacheKey);
        
        if (cachedSuggestions) {
          setSuggestions(cachedSuggestions);
        } else {
          const newSuggestions = await generateSuggestions(term);
          await cache.set(cacheKey, newSuggestions, 10 * 60 * 1000); // 10 minutes
          setSuggestions(newSuggestions);
        }
      } catch (error) {
        console.error('Suggestions error:', error);
      }
    }, 200),
    [cache]
  );

  useEffect(() => {
    debouncedSearch(searchTerm, filters);
  }, [searchTerm, filters, debouncedSearch]);

  useEffect(() => {
    debouncedSuggestions(searchTerm);
  }, [searchTerm, debouncedSuggestions]);

  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const performSearch = async (term, currentFilters) => {
    // This would integrate with your actual search service
    // For now, return mock data based on search type
    const mockResults = {
      rentals: [
        { id: 1, vehicle: 'ATV-001', customer: 'John Doe', status: 'active' },
        { id: 2, vehicle: 'ATV-002', customer: 'Jane Smith', status: 'scheduled' }
      ],
      bookings: [
        { id: 1, tour: 'Desert Adventure', customer: 'Mike Johnson', date: '2024-01-15' },
        { id: 2, tour: 'Mountain Trail', customer: 'Sarah Wilson', date: '2024-01-16' }
      ],
      vehicles: [
        { id: 1, name: 'ATV-001', model: 'Yamaha Raptor', status: 'available' },
        { id: 2, name: 'ATV-002', model: 'Honda TRX', status: 'maintenance' }
      ]
    };

    return mockResults[searchType] || [];
  };

  const generateSuggestions = async (term) => {
    // Generate contextual suggestions based on search type
    const baseSuggestions = {
      rentals: [
        'Active rentals',
        'Overdue rentals',
        'Today\'s rentals',
        'Weekend bookings'
      ],
      bookings: [
        'Upcoming tours',
        'Confirmed bookings',
        'Desert adventures',
        'Mountain trails'
      ],
      vehicles: [
        'Available vehicles',
        'Maintenance required',
        'Yamaha models',
        'Honda models'
      ]
    };

    return baseSuggestions[searchType]
      ?.filter(suggestion => 
        suggestion.toLowerCase().includes(term.toLowerCase())
      )
      .slice(0, 5) || [];
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilter = (key) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  };

  const clearAllFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchTerm(suggestion);
    setShowSuggestions(false);
  };

  const getFilterOptions = () => {
    switch (searchType) {
      case 'rentals':
        return {
          status: {
            label: t('search.status', 'Status'),
            options: [
              { value: 'scheduled', label: t('rentals.scheduled', 'Scheduled') },
              { value: 'active', label: t('rentals.active', 'Active') },
              { value: 'completed', label: t('rentals.completed', 'Completed') },
              { value: 'overdue', label: t('rentals.overdue', 'Overdue') },
              { value: 'cancelled', label: t('rentals.cancelled', 'Cancelled') }
            ]
          },
          dateRange: {
            label: t('search.dateRange', 'Date Range'),
            type: 'dateRange'
          },
          priceRange: {
            label: t('search.priceRange', 'Price Range'),
            type: 'priceRange'
          },
          vehicleType: {
            label: t('search.vehicleType', 'Vehicle Type'),
            options: [
              { value: 'atv', label: 'ATV' },
              { value: 'utv', label: 'UTV' },
              { value: 'motorcycle', label: 'Motorcycle' }
            ]
          }
        };
      
      case 'bookings':
        return {
          status: {
            label: t('search.status', 'Status'),
            options: [
              { value: 'pending', label: t('bookings.pending', 'Pending') },
              { value: 'confirmed', label: t('bookings.confirmed', 'Confirmed') },
              { value: 'in_progress', label: t('bookings.inProgress', 'In Progress') },
              { value: 'completed', label: t('bookings.completed', 'Completed') },
              { value: 'cancelled', label: t('bookings.cancelled', 'Cancelled') }
            ]
          },
          tourType: {
            label: t('search.tourType', 'Tour Type'),
            options: [
              { value: 'desert', label: t('tours.desert', 'Desert Adventure') },
              { value: 'mountain', label: t('tours.mountain', 'Mountain Trail') },
              { value: 'canyon', label: t('tours.canyon', 'Canyon Explorer') },
              { value: 'sunset', label: t('tours.sunset', 'Sunset Tour') }
            ]
          },
          dateRange: {
            label: t('search.dateRange', 'Date Range'),
            type: 'dateRange'
          },
          groupSize: {
            label: t('search.groupSize', 'Group Size'),
            type: 'numberRange'
          }
        };
      
      case 'vehicles':
        return {
          status: {
            label: t('search.status', 'Status'),
            options: [
              { value: 'available', label: t('vehicles.available', 'Available') },
              { value: 'rented', label: t('vehicles.rented', 'Rented') },
              { value: 'maintenance', label: t('vehicles.maintenance', 'Maintenance') },
              { value: 'out_of_service', label: t('vehicles.outOfService', 'Out of Service') }
            ]
          },
          model: {
            label: t('search.model', 'Model'),
            options: [
              { value: 'yamaha_raptor', label: 'Yamaha Raptor' },
              { value: 'honda_trx', label: 'Honda TRX' },
              { value: 'polaris_rzr', label: 'Polaris RZR' },
              { value: 'can_am_maverick', label: 'Can-Am Maverick' }
            ]
          },
          year: {
            label: t('search.year', 'Year'),
            type: 'numberRange'
          },
          location: {
            label: t('search.location', 'Location'),
            options: [
              { value: 'main_depot', label: t('locations.mainDepot', 'Main Depot') },
              { value: 'north_station', label: t('locations.northStation', 'North Station') },
              { value: 'south_station', label: t('locations.southStation', 'South Station') }
            ]
          }
        };
      
      default:
        return {};
    }
  };

  const filterOptions = getFilterOptions();
  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Main Search Bar */}
      <div className="p-4">
        <div className="relative">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder={t('search.placeholder', 'Search...')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`px-4 py-2 border border-gray-300 rounded-lg flex items-center space-x-2 transition-colors ${
                showAdvanced || activeFilterCount > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>{t('search.filters', 'Filters')}</span>
              {activeFilterCount > 0 && (
                <span className="bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Search Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="flex items-center space-x-2">
                    <Search className="h-3 w-3 text-gray-400" />
                    <span className="text-sm text-gray-700">{suggestion}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">
                {t('search.advancedFilters', 'Advanced Filters')}
              </h3>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  {t('search.clearAll', 'Clear All')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(filterOptions).map(([key, config]) => (
                <div key={key} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {config.label}
                  </label>
                  
                  {config.options ? (
                    <select
                      value={filters[key] || ''}
                      onChange={(e) => handleFilterChange(key, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="">{t('search.selectOption', 'Select...')}</option>
                      {config.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : config.type === 'dateRange' ? (
                    <div className="flex space-x-2">
                      <input
                        type="date"
                        value={filters[`${key}_start`] || ''}
                        onChange={(e) => handleFilterChange(`${key}_start`, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <input
                        type="date"
                        value={filters[`${key}_end`] || ''}
                        onChange={(e) => handleFilterChange(`${key}_end`, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  ) : config.type === 'priceRange' ? (
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters[`${key}_min`] || ''}
                        onChange={(e) => handleFilterChange(`${key}_min`, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters[`${key}_max`] || ''}
                        onChange={(e) => handleFilterChange(`${key}_max`, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  ) : config.type === 'numberRange' ? (
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters[`${key}_min`] || ''}
                        onChange={(e) => handleFilterChange(`${key}_min`, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters[`${key}_max`] || ''}
                        onChange={(e) => handleFilterChange(`${key}_max`, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={filters[key] || ''}
                      onChange={(e) => handleFilterChange(key, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Filters */}
      {activeFilterCount > 0 && (
        <div className="border-t border-gray-200 p-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters).map(([key, value]) => {
              if (!value) return null;
              
              return (
                <span
                  key={key}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {filterOptions[key]?.label || key}: {value}
                  <button
                    onClick={() => clearFilter(key)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    <X className="h-3 w-3" />
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

export default AdvancedSearch;