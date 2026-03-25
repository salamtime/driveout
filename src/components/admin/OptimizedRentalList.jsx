import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Eye, 
  Edit, 
  Trash2, 
  Calendar, 
  User, 
  Car, 
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { getVehicleField } from '../../config/tables';
import optimizedRentalService from '../../services/OptimizedRentalService';

const OptimizedRentalList = ({ 
  onEdit, 
  onView, 
  onDelete,
  onStartContract,
  onCloseContract
}) => {
  const { t } = useTranslation();

  // =================== STATE MANAGEMENT ===================
  
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  
  // Filter state
  const [filters, setFilters] = useState({
    status: 'all',
    searchTerm: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });
  
  // UI state
  const [refreshing, setRefreshing] = useState(false);

  // =================== MEMOIZED VALUES ===================
  
  const statusOptions = useMemo(() => [
    { value: 'all', label: 'All Statuses' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ], []);

  const sortOptions = useMemo(() => [
    { value: 'created_at', label: 'Created Date' },
    { value: 'rental_start_date', label: 'Start Date' },
    { value: 'customer_name', label: 'Customer Name' },
    { value: 'total_amount', label: 'Amount' }
  ], []);

  // =================== DATA LOADING ===================
  
  const loadRentals = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setError('');

      const result = await optimizedRentalService.getRentals({
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters
      });

      if (result.success) {
        setRentals(result.rentals);
        console.log('Data received in OptimizedRentalList:', result.rentals);
        setPagination(result.pagination);
      } else {
        setError(result.error || 'Failed to load rentals');
        setRentals([]);
      }
    } catch (error) {
      setError('Failed to load rentals');
      setRentals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, pagination.page, pagination.pageSize]);

  const loadStats = useCallback(async () => {
    try {
      const result = await optimizedRentalService.getRentalStats();
      if (result.success) {
        setStats(result);
      }
    } catch (error) {
    }
  }, []);

  // =================== EFFECTS ===================
  
  // Initial load
  useEffect(() => {
    loadRentals();
    loadStats();
  }, []);

  // Real-time subscription for rental updates from RentalDetails
  useEffect(() => {
    const channel = supabase
      .channel('rental-updates-list')
      .on('broadcast', { event: 'payment_updated' }, (payload) => {
        console.log('🔄 Payment update received:', payload);
        loadRentals(false);
        loadStats();
      })
      .on('broadcast', { event: 'status_updated' }, (payload) => {
        console.log('🔄 Status update received:', payload);
        loadRentals(false);
        loadStats();
      })
      .subscribe();

    // Also subscribe to postgres_changes for direct DB updates
    const dbChannel = supabase
      .channel('rental-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_4c3a7a6153_rentals' },
        () => {
          console.log('🔄 DB rental updated, refreshing...');
          loadRentals(false);
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(dbChannel);
    };
  }, [loadRentals, loadStats]);

  // Refresh data when window regains focus (e.g., navigating back from RentalDetails)
  useEffect(() => {
    const handleFocus = () => {
      loadRentals(false);
      loadStats();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadRentals, loadStats]);

  // Reload when filters or pagination change
  useEffect(() => {
    if (!loading) {
      loadRentals(false);
    }
  }, [filters, pagination.page]);

  // =================== EVENT HANDLERS ===================
  
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const handlePageChange = useCallback((newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    optimizedRentalService.clearCache();
    loadRentals();
    loadStats();
  }, [loadRentals, loadStats]);

  const handleSearch = useCallback((searchTerm) => {
    handleFilterChange('searchTerm', searchTerm);
  }, [handleFilterChange]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (filters.searchTerm !== '') {
        loadRentals(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filters.searchTerm]);

  // =================== UTILITY FUNCTIONS ===================
  
  // ✅ FIXED: Get display status - prioritize payment_status, fallback to rental_status
  const getDisplayStatus = (rental) => {
    // Priority 1: Use payment_status if it exists and is meaningful
    if (rental.payment_status && rental.payment_status !== 'unknown') {
      return rental.payment_status;
    }
    
    // Priority 2: Use rental_status if it exists
    if (rental.rental_status) {
      return rental.rental_status;
    }
    
    // Priority 3: Default to 'pending' only if both are null/empty
    return 'pending';
  };
  
  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'unpaid':
        return 'bg-red-100 text-red-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    if (!amount) return '0 MAD';
    return `${parseFloat(amount).toFixed(0)} MAD`;
  };

  // =================== RENDER METHODS ===================
  // Calculate time remaining for active rentals
  const calculateTimeRemaining = (rental) => {
    if (rental.rental_status !== 'active') {
      return null;
    }
    
    const now = new Date();
    const endDate = new Date(rental.rental_end_date);
    
    // For hourly rentals, include time
    if (rental.rental_type === 'hourly' && rental.rental_end_time) {
      const [hours, minutes] = rental.rental_end_time.split(':');
      endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      // For daily rentals, set to end of day
      endDate.setHours(23, 59, 59, 999);
    }
    
    const diffMs = endDate - now;
    
    if (diffMs <= 0) {
      return { text: 'Overdue', color: 'text-red-600', bgColor: 'bg-red-50' };
    }
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      const text = diffDays === 1 ? '1 day' : `${diffDays} days`;
      return { 
        text: remainingHours > 0 ? `${text} ${remainingHours}h` : text, 
        color: diffDays <= 1 ? 'text-orange-600' : 'text-green-600',
        bgColor: diffDays <= 1 ? 'bg-orange-50' : 'bg-green-50'
      };
    } else {
      return { 
        text: `${diffHours}h left`, 
        color: diffHours <= 3 ? 'text-red-600' : 'text-orange-600',
        bgColor: diffHours <= 3 ? 'bg-red-50' : 'bg-orange-50'
      };
    }
  };


  
  const renderStatsCards = () => {
    if (!stats) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Rentals</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Car className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Rentals</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
            <Calendar className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">This Month</p>
              <p className="text-2xl font-bold text-purple-600">{stats.thisMonth}</p>
            </div>
            <Calendar className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalRevenue)}</p>
            </div>
            <Car className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>
    );
  };

  const renderFilters = () => (
    <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer name or email..."
              value={filters.searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status Filter */}
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={filters.sortBy}
          onChange={(e) => handleFilterChange('sortBy', e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sortOptions.map(option => (
            <option key={option.value} value={option.value}>
              Sort by {option.label}
            </option>
          ))}
        </select>

        {/* Sort Order */}
        <select
          value={filters.sortOrder}
          onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );

  const renderPagination = () => (
    <div className="flex items-center justify-between mt-6 bg-white p-4 rounded-lg shadow-sm border">
      <div className="text-sm text-gray-600">
        Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
        {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
        {pagination.total} rentals
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => handlePageChange(pagination.page - 1)}
          disabled={!pagination.hasPrev}
          className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        
        <span className="text-sm text-gray-600 px-4">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        
        <button
          onClick={() => handlePageChange(pagination.page + 1)}
          disabled={!pagination.hasNext}
          className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // =================== MAIN RENDER ===================

  if (loading) {
    return (
      <div className="space-y-6">
        {renderStatsCards()}
        {renderFilters()}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">Loading rentals...</p>
              <p className="text-sm text-gray-500 mt-1">Optimized loading in progress</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {renderStatsCards()}
        {renderFilters()}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="text-center">
            <div className="text-4xl mb-4">❌</div>
            <p className="text-red-600 mb-4">Error: {error}</p>
            <button 
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {renderStatsCards()}

      {/* Filters */}
      {renderFilters()}

      {/* Rentals Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {rentals.length === 0 ? (
          <div className="text-center py-12">
            <Car className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rentals Found</h3>
            <p className="text-gray-600">
              {filters.searchTerm || filters.status !== 'all'
                ? 'No rentals match your current filters.'
                : 'No rentals have been created yet.'
              }
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vehicle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rental Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rentals.map((rental) => {
                    const displayStatus = getDisplayStatus(rental);
                    return (
                      <tr key={rental.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                <User className="h-5 w-5 text-blue-600" />
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {rental.customer_name || 'Unknown Customer'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {rental.customer_email || 'No email'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {rental.vehicle?.name || 'Unknown Vehicle'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {rental.vehicle?.plate_number || 'No plate'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatDate(rental.rental_start_date)}
                          </div>
                          <div className="text-sm text-gray-500">
                            to {formatDate(rental.rental_end_date)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(displayStatus)}`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(rental.total_amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => onView && onView(rental)}
                              className="text-blue-600 hover:text-blue-900 p-1"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => onEdit && onEdit(rental)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            {rental.rental_status === 'scheduled' && onStartContract && (
                              <button
                                onClick={() => onStartContract(rental)}
                                className="text-green-600 hover:text-green-900 p-1"
                                title="Start Contract"
                              >
                                Start
                              </button>
                            )}
                            {rental.rental_status === 'active' && onCloseContract && (
                              <button
                                onClick={() => onCloseContract(rental)}
                                className="text-orange-600 hover:text-orange-900 p-1"
                                title="Close Contract"
                              >
                                Close
                              </button>
                            )}
                            <button
                              onClick={() => onDelete && onDelete(rental)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="block lg:hidden space-y-4 p-4">
              {rentals.map((rental) => {
                const displayStatus = getDisplayStatus(rental);
                return (
                  <div key={`mobile-${rental.id}`} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            {rental.customer_name || 'Unknown Customer'}
                          </h3>
                          <p className="text-xs text-gray-500">
                            {rental.customer_email || 'No email'}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(displayStatus)}`}>
                        {displayStatus}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center">
                        <Car className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-gray-600">
                          {rental.vehicle?.name || 'Unknown Vehicle'} - {rental.vehicle?.plate_number || 'No plate'}
                        </span>
                      </div>
                      
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-gray-600">
                          {formatDate(rental.rental_start_date)} - {formatDate(rental.rental_end_date)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 mr-2">Payment:</span>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            rental.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                            rental.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                            rental.payment_status === 'overdue' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {rental.payment_status || 'unpaid'}
                          </span>
                        </div>
                        {(() => {
                          const timeRemaining = calculateTimeRemaining(rental);
                          return timeRemaining ? (
                            <div className={`flex items-center ${timeRemaining.bgColor} px-2 py-1 rounded-md`}>
                              <Clock className={`h-3 w-3 ${timeRemaining.color} mr-1`} />
                              <span className={`text-xs font-medium ${timeRemaining.color}`}>
                                {timeRemaining.text}
                              </span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          {formatCurrency(rental.total_amount)}
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onView && onView(rental)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onEdit && onEdit(rental)}
                            className="text-green-600 hover:text-green-900 p-1"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDelete && onDelete(rental)}
                            className="text-red-600 hover:text-red-900 p-1"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {rentals.length > 0 && renderPagination()}
    </div>
  );
};

export default OptimizedRentalList;