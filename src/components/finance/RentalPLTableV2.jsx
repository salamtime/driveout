import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, TrendingUp, Calendar, User } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

/**
 * Enhanced Rental P&L Table v2 with Data Context Indicators
 * 
 * Features:
 * - Comprehensive rental profitability analysis with OpEx breakdown
 * - Advanced filtering, sorting, and pagination
 * - Separate Vehicle (plate) and Model (make/model) columns
 * - Real-time data integration with enhanced error handling
 * - Export functionality with CSV download
 * - Mobile-responsive design with modern styling
 * - NEW: Data source tooltips and scope clarification
 */
const RentalPLTableV2 = ({ filters, refreshTrigger }) => {
  const [rentalData, setRentalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Table state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('closedAt');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    loadRentalData();
  }, [filters, refreshTrigger, currentPage, searchTerm, sortBy, sortOrder]);

  const loadRentalData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📊 RENTAL P&L: Loading enhanced data with OpEx breakdown...');
      
      const result = await financeApiV2.getRentalPLData(
        filters,
        currentPage,
        pageSize,
        sortBy,
        sortOrder,
        searchTerm
      );
      
      setRentalData(result.data || []);
      setTotalPages(result.pages || 0);
      setTotalRecords(result.total || 0);
      
      console.log('✅ Enhanced Rental P&L data loaded:', {
        recordCount: result.data?.length || 0,
        totalRecords: result.total || 0,
        pages: result.pages || 0,
        sampleRecord: result.data?.[0]
      });
      
    } catch (err) {
      console.error('❌ Rental P&L loading failed:', err);
      setError(err.message || 'Failed to load rental data');
      setRentalData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleExport = async () => {
    try {
      console.log('📊 Exporting rental P&L data...');
      
      // Get all data for export (no pagination)
      const allData = await financeApiV2.getRentalPLData(
        filters,
        1,
        1000, // Large page size to get all data
        sortBy,
        sortOrder,
        searchTerm
      );
      
      // Create CSV content
      const headers = [
        'Rental ID',
        'Customer',
        'Vehicle',
        'Model',
        'Revenue (MAD)',
        'Maintenance (MAD)',
        'Fuel (MAD)',
        'Inventory (MAD)',
        'Other (MAD)',
        'Total Costs (MAD)',
        'Taxes (MAD)',
        'Gross Profit (MAD)',
        'Profit %',
        'Status',
        'Closed Date'
      ];
      
      const csvContent = [
        headers.join(','),
        ...allData.data.map(row => [
          row.rentalId,
          `"${row.customer}"`,
          row.vehicleDisplay,
          `"${row.vehicleModel}"`,
          row.revenue,
          row.maintenanceCosts,
          row.fuelCosts,
          row.inventoryCosts,
          row.otherCosts,
          row.totalCosts,
          row.taxes,
          row.grossProfit,
          row.profitPercent,
          row.status,
          new Date(row.closedAt).toLocaleDateString()
        ].join(','))
      ].join('\n');
      
      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rental_pl_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      console.log('✅ Export completed');
    } catch (error) {
      console.error('❌ Export failed:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-blue-600" />
      : <ArrowDown className="w-4 h-4 text-blue-600" />;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
      active: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Active' },
      scheduled: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Scheduled' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' }
    };
    
    const config = statusConfig[status] || statusConfig.completed;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getProfitColor = (profitPercent) => {
    if (profitPercent >= 30) return 'text-green-600';
    if (profitPercent >= 15) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Data Scope Clarification */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Data shown reflects profit and loss details for rentals within the selected period.
          </p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              <div className="h-10 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded w-full"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {/* Data Scope Clarification */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            Data shown reflects profit and loss details for rentals within the selected period.
          </p>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-red-900">Error Loading Rental Data</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
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
          Data shown reflects profit and loss details for rentals within the selected period.
        </p>
      </div>
      
      {/* Enhanced Header with Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Rental Profit & Loss Analysis</h3>
              <p className="text-sm text-gray-600">
                Detailed profitability breakdown with operational expense tracking
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleExport}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>
        
        {/* Search and Summary */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search rentals, customers, or vehicles..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-80"
            />
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Total: {totalRecords} rentals</span>
            <span>•</span>
            <span>Page {currentPage} of {totalPages}</span>
          </div>
        </div>
      </div>

      {/* Enhanced Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('rentalId')}
                  title="Unique rental transaction identifier"
                >
                  <div className="flex items-center space-x-1">
                    <span>Rental ID</span>
                    {getSortIcon('rentalId')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('customer')}
                  title="Customer name from rental records"
                >
                  <div className="flex items-center space-x-1">
                    <span>Customer</span>
                    {getSortIcon('customer')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('vehicleDisplay')}
                  title="Vehicle plate number"
                >
                  <div className="flex items-center space-x-1">
                    <span>Vehicle</span>
                    {getSortIcon('vehicleDisplay')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('vehicleModel')}
                  title="Vehicle make and model"
                >
                  <div className="flex items-center space-x-1">
                    <span>Model</span>
                    {getSortIcon('vehicleModel')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('revenue')}
                  title="Actual income from recorded rentals"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Revenue</span>
                    {getSortIcon('revenue')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('maintenanceCosts')}
                  title="Costs related to vehicle maintenance during this period"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Maintenance</span>
                    {getSortIcon('maintenanceCosts')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('fuelCosts')}
                  title="Fuel expenses from logs or standard estimates"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Fuel</span>
                    {getSortIcon('fuelCosts')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('inventoryCosts')}
                  title="Parts and consumables used during operations"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Inventory</span>
                    {getSortIcon('inventoryCosts')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('grossProfit')}
                  title="Revenue minus all related costs"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Gross Profit</span>
                    {getSortIcon('grossProfit')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('profitPercent')}
                  title="Profit margin percentage"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Margin %</span>
                    {getSortIcon('profitPercent')}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('closedAt')}
                  title="Date when rental was completed"
                >
                  <div className="flex items-center space-x-1">
                    <span>Closed</span>
                    {getSortIcon('closedAt')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rentalData.map((rental) => (
                <tr key={rental.id} className="hover:bg-gray-50 transition-colors duration-150">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="p-2 bg-blue-100 rounded-lg mr-3">
                        <Calendar className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{rental.rentalId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="p-2 bg-green-100 rounded-lg mr-3">
                        <User className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{rental.customer}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{rental.vehicleDisplay}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{rental.vehicleModel}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-green-600">{formatCurrency(rental.revenue)} MAD</div>
                    <div className="text-xs text-gray-500">real data</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-orange-600">{formatCurrency(rental.maintenanceCosts)} MAD</div>
                    <div className="text-xs text-gray-500">estimated</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-purple-600">{formatCurrency(rental.fuelCosts)} MAD</div>
                    <div className="text-xs text-gray-500">estimated</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-blue-600">{formatCurrency(rental.inventoryCosts)} MAD</div>
                    <div className="text-xs text-gray-500">estimated</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm font-bold ${getProfitColor(rental.profitPercent)}`}>
                      {formatCurrency(rental.grossProfit)} MAD
                    </div>
                    <div className="text-xs text-gray-500">calculated</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm font-bold ${getProfitColor(rental.profitPercent)}`}>
                      {rental.profitPercent}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(rental.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(rental.closedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Enhanced Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} results
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    const isActive = page === currentPage;
                    
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`
                          px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200
                          ${isActive
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 bg-white border border-gray-300 hover:bg-gray-50'
                          }
                        `}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RentalPLTableV2;