import React, { useState, useEffect } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, Calendar, User, ChevronDown, ChevronUp } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import { Link } from 'react-router-dom';

const RentalPLTableV2 = ({ filters, refreshTrigger, exportEnabled = true }) => {
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
  const [selectedRentalId, setSelectedRentalId] = useState(null);
  const [expandedRentalId, setExpandedRentalId] = useState(null);

  useEffect(() => {
    loadRentalData();
  }, [filters, refreshTrigger, currentPage, searchTerm, sortBy, sortOrder]);

  useEffect(() => {
    if (!selectedRentalId) return;
    if (!rentalData.some((row) => row.id === selectedRentalId)) {
      setSelectedRentalId(null);
    }
  }, [rentalData, selectedRentalId]);

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

  const buildCsvContent = (rows) => {
    const headers = [
      'Rental ID',
      'Customer',
      'Vehicle',
      'Model',
      'Revenue (MAD)',
      'Base Rental Revenue (MAD)',
      'Transport Revenue (MAD)',
      'Extra KM Revenue (MAD)',
      'Extension Revenue (MAD)',
      'Fuel Charge Revenue (MAD)',
      'Fuel Surplus Revenue (MAD)',
      'Late Fee Revenue (MAD)',
      'Impound Revenue (MAD)',
      'Maintenance Recovery Revenue (MAD)',
      'Discounts / Waivers (MAD)',
      'Maintenance Reference',
      'Fuel Variance Liters',
      'Maintenance (MAD)',
      'Fuel (MAD)',
      'Other (MAD)',
      'Total Costs (MAD)',
      'Taxes (MAD)',
      'Gross Profit (MAD)',
      'Profit %',
      'Status',
      'Closed Date'
    ];

    return [
      headers.join(','),
      ...rows.map(row => [
        row.rentalId,
        `"${row.customer}"`,
        row.vehicleDisplay,
        `"${row.vehicleModel}"`,
        row.revenue,
        row.baseRevenue,
        row.transportRevenue,
        row.overageRevenue,
        row.extensionRevenue,
        row.fuelChargeRevenue,
        row.fuelSurplusRevenue,
        row.lateFeeRevenue,
        row.impoundRevenue,
        row.maintenanceRevenue,
        row.discountAmount,
        row.maintenanceReference || '',
        row.fuelVarianceLiters,
        row.maintenanceCosts,
        row.fuelCosts,
        row.otherCosts,
        row.totalCosts,
        row.taxes,
        row.grossProfit,
        row.profitPercent,
        row.status,
        new Date(row.closedAt).toLocaleDateString()
      ].join(','))
    ].join('\n');
  };

  const downloadCsv = (csvContent, filename) => {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      console.log('📊 Exporting rental P&L data...');

      const allData = await financeApiV2.getRentalPLData(
        filters,
        1,
        1000,
        sortBy,
        sortOrder,
        searchTerm
      );

      downloadCsv(
        buildCsvContent(allData.data || []),
        `rental_pl_${new Date().toISOString().split('T')[0]}.csv`
      );

      console.log('✅ Export completed');
    } catch (error) {
      console.error('❌ Export failed:', error);
    }
  };

  const handleExportSelected = () => {
    const selectedRental = rentalData.find((row) => row.id === selectedRentalId);
    if (!selectedRental) return;

    downloadCsv(
      buildCsvContent([selectedRental]),
      `rental_pl_${selectedRental.rentalId || 'single'}_${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getRevenueBreakdownLines = (rental) => {
    const lines = [];
    if (rental.baseRevenue > 0) lines.push(`Base ${formatCurrency(rental.baseRevenue)}`);
    if (rental.transportRevenue > 0) lines.push(`Transport +${formatCurrency(rental.transportRevenue)}`);
    if (rental.overageRevenue > 0) lines.push(`Extra km +${formatCurrency(rental.overageRevenue)}`);
    if (rental.extensionRevenue > 0) lines.push(`Extension +${formatCurrency(rental.extensionRevenue)}`);
    if (rental.fuelChargeRevenue > 0) lines.push(`Fuel +${formatCurrency(rental.fuelChargeRevenue)}`);
    if (rental.fuelSurplusRevenue > 0) lines.push(`Fuel surplus +${formatCurrency(rental.fuelSurplusRevenue)}`);
    if (rental.lateFeeRevenue > 0) lines.push(`Late fee +${formatCurrency(rental.lateFeeRevenue)}`);
    if (rental.impoundRevenue > 0) lines.push(`Impound +${formatCurrency(rental.impoundRevenue)}`);
    if (rental.maintenanceRevenue > 0) lines.push(`Maintenance +${formatCurrency(rental.maintenanceRevenue)}`);
    return lines;
  };

  const toggleExpanded = (rentalId) => {
    setExpandedRentalId((prev) => (prev === rentalId ? null : rentalId));
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-slate-700" />
      : <ArrowDown className="w-4 h-4 text-slate-700" />;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
      active: { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Active' },
      scheduled: { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Scheduled' },
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
    return profitPercent >= 0 ? 'text-emerald-700' : 'text-rose-700';
  };

  const selectedRental = rentalData.find((row) => row.id === selectedRentalId) || null;

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Data Scope Clarification */}
        <div className="rounded-[1.25rem] border border-slate-200 bg-white p-6 shadow-sm">
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
      <div className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <DollarSign className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Rental Profit & Loss</h3>
              <p className="text-sm text-gray-600">
                Revenue, costs, and net profit for rentals in the selected period.
              </p>
            </div>
          </div>
          
          {exportEnabled ? (
            <div className="flex items-center space-x-3">
              <button
                onClick={handleExportSelected}
                disabled={!selectedRental}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors duration-200 ${
                  selectedRental
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4 mr-2" />
                Export selected CSV
              </button>
              <button
                onClick={handleExport}
                className="flex items-center px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors duration-200"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
            </div>
          ) : null}
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
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-transparent w-full sm:w-80"
            />
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Total: {totalRecords} rentals</span>
            <span>•</span>
            <span>Page {currentPage} of {totalPages}</span>
            {selectedRental && (
              <>
                <span>•</span>
                <span>Selected: {selectedRental.rentalId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Select
                </th>
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
                  onClick={() => handleSort('totalCosts')}
                  title="Maintenance plus fuel and other rental costs"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Costs</span>
                    {getSortIcon('totalCosts')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('grossProfit')}
                  title="Revenue minus all related costs"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Net Profit</span>
                    {getSortIcon('grossProfit')}
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
                <React.Fragment key={rental.id}>
                <tr className={`transition-colors duration-150 hover:bg-gray-50 ${selectedRentalId === rental.id ? 'bg-slate-50' : ''}`}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(rental.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
                      aria-label={`Toggle details for ${rental.rentalId}`}
                    >
                      {expandedRentalId === rental.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedRentalId((prev) => prev === rental.id ? null : rental.id)}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                        selectedRentalId === rental.id
                          ? 'border-slate-900 bg-slate-900'
                          : 'border-gray-300 bg-white hover:border-slate-400'
                      }`}
                      aria-label={`Select ${rental.rentalId}`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${selectedRentalId === rental.id ? 'bg-white' : 'bg-transparent'}`} />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="p-2 bg-slate-100 rounded-lg mr-3">
                        <Calendar className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <Link
                          to={`/admin/rentals/${rental.id}`}
                          className="text-sm font-semibold text-slate-900 transition-colors hover:text-emerald-700 hover:underline"
                        >
                          {rental.rentalId}
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="p-2 bg-slate-100 rounded-lg mr-3">
                        <User className="w-4 h-4 text-slate-600" />
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
                    <div className="text-sm font-bold text-emerald-700">{formatCurrency(rental.revenue)} MAD</div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      {getRevenueBreakdownLines(rental).slice(0, 2).map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-bold text-rose-700">{formatCurrency(rental.totalCosts)} MAD</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Fuel {formatCurrency(rental.fuelCosts)} • Maint. {formatCurrency(rental.maintenanceCosts)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm font-bold ${getProfitColor(rental.profitPercent)}`}>
                      {formatCurrency(rental.grossProfit)} MAD
                    </div>
                    <div className="text-xs text-gray-500">{rental.profitPercent}% margin</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(rental.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(rental.closedAt).toLocaleDateString()}
                  </td>
                </tr>
                {expandedRentalId === rental.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={11} className="px-6 py-4">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue Breakdown</p>
                          <div className="mt-3 space-y-1 text-sm text-slate-700">
                            <div className="flex justify-between"><span>Base rental</span><span>{formatCurrency(rental.baseRevenue)} MAD</span></div>
                            {rental.transportRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Transport</span><span>+{formatCurrency(rental.transportRevenue)} MAD</span></div>}
                            {rental.overageRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Extra km</span><span>+{formatCurrency(rental.overageRevenue)} MAD</span></div>}
                            {rental.extensionRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Extension</span><span>+{formatCurrency(rental.extensionRevenue)} MAD</span></div>}
                            {rental.fuelChargeRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Fuel charge</span><span>+{formatCurrency(rental.fuelChargeRevenue)} MAD</span></div>}
                            {rental.fuelSurplusRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Fuel surplus</span><span>+{formatCurrency(rental.fuelSurplusRevenue)} MAD</span></div>}
                            {rental.lateFeeRevenue > 0 && <div className="flex justify-between text-rose-700"><span>Late fee</span><span>+{formatCurrency(rental.lateFeeRevenue)} MAD</span></div>}
                            {rental.impoundRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Impound</span><span>+{formatCurrency(rental.impoundRevenue)} MAD</span></div>}
                            {rental.maintenanceRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Maintenance recovery</span><span>+{formatCurrency(rental.maintenanceRevenue)} MAD</span></div>}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fuel</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <div className="flex justify-between"><span>Variance</span><span className={rental.fuelVarianceLiters >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{rental.fuelVarianceLiters > 0 ? '+' : ''}{rental.fuelVarianceLiters} L</span></div>
                            <div className="flex justify-between"><span>Outgoing cost</span><span>{formatCurrency(rental.fuelCosts)} MAD</span></div>
                            {rental.fuelSurplusRevenue > 0 && <div className="flex justify-between text-emerald-700"><span>Incoming surplus value</span><span>+{formatCurrency(rental.fuelSurplusRevenue)} MAD</span></div>}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adjustments</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <div className="flex justify-between"><span>Discounts / waivers</span><span>{rental.discountAmount > 0 ? `-${formatCurrency(rental.discountAmount)}` : '0'} MAD</span></div>
                            <div className="flex justify-between"><span>Outstanding</span><span>{formatCurrency(rental.remainingAmount)} MAD</span></div>
                            <div className="flex justify-between"><span>Taxes</span><span>{formatCurrency(rental.taxes)} MAD</span></div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Links</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <div className="flex justify-between"><span>Maintenance ref</span><span>{rental.maintenanceReference || 'None'}</span></div>
                            <div className="flex justify-between"><span>Rental status</span><span>{rental.status}</span></div>
                            <div className="flex justify-between"><span>Payment</span><span>{rental.payment_status}</span></div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
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
                            ? 'bg-slate-900 text-white'
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
