import React, { useEffect, useState } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, Calendar, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { financeApiV2 } from '../../services/financeApiV2';

const TourPLTableV2 = ({ filters, refreshTrigger }) => {
  const [tourData, setTourData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('closedAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTourId, setSelectedTourId] = useState(null);
  const [expandedTourId, setExpandedTourId] = useState(null);

  useEffect(() => {
    loadTourData();
  }, [filters, refreshTrigger, currentPage, searchTerm, sortBy, sortOrder]);

  useEffect(() => {
    if (!selectedTourId) return;
    if (!tourData.some((row) => row.id === selectedTourId)) {
      setSelectedTourId(null);
    }
  }, [tourData, selectedTourId]);

  const loadTourData = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await financeApiV2.getTourPLData(
        filters,
        currentPage,
        pageSize,
        sortBy,
        sortOrder,
        searchTerm
      );

      setTourData(result.data || []);
      setTotalPages(result.pages || 0);
      setTotalRecords(result.total || 0);
    } catch (err) {
      console.error('❌ Tour P&L loading failed:', err);
      setError(err.message || 'Failed to load tour data');
      setTourData([]);
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

  const handleExport = async () => {
    try {
      const allData = await financeApiV2.getTourPLData(
        filters,
        1,
        1000,
        sortBy,
        sortOrder,
        searchTerm
      );

      downloadCsv(
        buildCsvContent(allData.data || []),
        `tour_pl_${new Date().toISOString().split('T')[0]}.csv`
      );
    } catch (exportError) {
      console.error('❌ Tour P&L export failed:', exportError);
    }
  };

  const handleExportSelected = () => {
    const selectedTour = tourData.find((row) => row.id === selectedTourId);
    if (!selectedTour) return;

    downloadCsv(
      buildCsvContent([selectedTour]),
      `tour_pl_${selectedTour.tourId || 'single'}_${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  const buildCsvContent = (rows) => {
    const headers = [
      'Tour ID',
      'Customer',
      'Guide',
      'Package',
      'Route',
      'Vehicles',
      'Model',
      'Revenue (MAD)',
      'Base Revenue (MAD)',
      'Fuel Surplus Revenue (MAD)',
      'Fuel Costs (MAD)',
      'Fuel Variance (L)',
      'Fuel Consumed (L)',
      'Fuel Surplus (L)',
      'Fuel Unit Cost (MAD)',
      'Maintenance Costs (MAD)',
      'Other Costs (MAD)',
      'Total Costs (MAD)',
      'Gross Profit (MAD)',
      'Profit %',
      'Status',
      'Payment Status',
      'Closed Date'
    ];

    return [
      headers.join(','),
      ...rows.map((row) => [
        row.tourId,
        `"${row.customer}"`,
        `"${row.guideName || ''}"`,
        `"${row.packageName || ''}"`,
        `"${row.routeType || ''}"`,
        `"${row.vehicleDisplay || ''}"`,
        `"${row.vehicleModel || ''}"`,
        row.revenue,
        row.baseRevenue,
        row.fuelSurplusRevenue,
        row.fuelCosts,
        row.fuelVarianceLiters,
        row.fuelConsumedLiters,
        row.fuelSurplusLiters,
        row.fuelUnitCost,
        row.maintenanceCosts,
        row.otherCosts,
        row.totalCosts,
        row.grossProfit,
        row.profitPercent,
        row.status,
        row.payment_status,
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

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);

  const getSortIcon = (column) => {
    if (sortBy !== column) return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-10 rounded bg-gray-100" />
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-16 rounded bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const selectedTour = tourData.find((row) => row.id === selectedTourId) || null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Tours Profit & Loss Analysis</h3>
              <p className="text-sm text-gray-600">Detailed tour profitability with operational cost tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportSelected}
              disabled={!selectedTour}
              className={`flex items-center rounded-lg px-4 py-2 transition-colors ${
                selectedTour ? 'bg-violet-600 text-white hover:bg-violet-700' : 'cursor-not-allowed bg-gray-100 text-gray-400'
              }`}
            >
              <Download className="mr-2 h-4 w-4" />
              Export selected CSV
            </button>
            <button
              onClick={handleExport}
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tours, guests, guides, or vehicles..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:w-80"
            />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>Total: {totalRecords} tours</span>
            <span>•</span>
            <span>Page {currentPage} of {totalPages}</span>
            {selectedTour && (
              <>
                <span>•</span>
                <span>Selected: {selectedTour.tourId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Details</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Select</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('tourId')}>
                  <div className="flex items-center gap-1"><span>Tour ID</span>{getSortIcon('tourId')}</div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('customer')}>
                  <div className="flex items-center gap-1"><span>Customer</span>{getSortIcon('customer')}</div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('vehicleDisplay')}>
                  <div className="flex items-center gap-1"><span>Vehicle</span>{getSortIcon('vehicleDisplay')}</div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('vehicleModel')}>
                  <div className="flex items-center gap-1"><span>Model</span>{getSortIcon('vehicleModel')}</div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('revenue')}>
                  <div className="flex items-center justify-end gap-1"><span>Revenue</span>{getSortIcon('revenue')}</div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('fuelCosts')}>
                  <div className="flex items-center justify-end gap-1"><span>Fuel</span>{getSortIcon('fuelCosts')}</div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('grossProfit')}>
                  <div className="flex items-center justify-end gap-1"><span>Gross Profit</span>{getSortIcon('grossProfit')}</div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('profitPercent')}>
                  <div className="flex items-center justify-end gap-1"><span>Margin %</span>{getSortIcon('profitPercent')}</div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer" onClick={() => handleSort('closedAt')}>
                  <div className="flex items-center gap-1"><span>Closed</span>{getSortIcon('closedAt')}</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tourData.map((tour) => (
                <React.Fragment key={tour.id}>
                  <tr className={`transition-colors hover:bg-gray-50 ${selectedTourId === tour.id ? 'bg-violet-50' : ''}`}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setExpandedTourId((prev) => (prev === tour.id ? null : tour.id))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      >
                        {expandedTourId === tour.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedTourId((prev) => (prev === tour.id ? null : tour.id))}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                          selectedTourId === tour.id ? 'border-violet-600 bg-violet-600' : 'border-gray-300 bg-white'
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${selectedTourId === tour.id ? 'bg-white' : 'bg-transparent'}`} />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="mr-3 rounded-lg bg-blue-100 p-2">
                          <Calendar className="h-4 w-4 text-blue-600" />
                        </div>
                        <Link to="/admin/tours" className="text-sm font-medium text-violet-700 hover:text-violet-800 hover:underline">
                          {tour.tourId}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="mr-3 rounded-lg bg-green-100 p-2">
                          <User className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="text-sm font-medium text-gray-900">{tour.customer}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tour.vehicleDisplay}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{tour.vehicleModel}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-green-600">{formatCurrency(tour.revenue)} MAD</div>
                      <div className="text-xs text-gray-500">Base {formatCurrency(tour.baseRevenue)} MAD</div>
                      {tour.fuelSurplusRevenue > 0 && (
                        <div className="text-xs font-medium text-emerald-600">Fuel surplus +{formatCurrency(tour.fuelSurplusRevenue)} MAD</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-medium ${tour.fuelCosts > 0 ? 'text-rose-600' : 'text-gray-500'}`}>
                        {tour.fuelCosts > 0 ? '-' : ''}{formatCurrency(tour.fuelCosts)} MAD
                      </div>
                      <div className={`text-xs ${tour.fuelVarianceLiters < 0 ? 'text-rose-600' : tour.fuelVarianceLiters > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {tour.fuelVarianceLiters < 0
                          ? `${Math.abs(tour.fuelVarianceLiters)}L consumed`
                          : tour.fuelVarianceLiters > 0
                            ? `${tour.fuelVarianceLiters}L surplus`
                            : 'no variance'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-bold ${getProfitColor(tour.profitPercent)}`}>{formatCurrency(tour.grossProfit)} MAD</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-bold ${getProfitColor(tour.profitPercent)}`}>{tour.profitPercent}%</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(tour.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(tour.closedAt).toLocaleDateString()}</td>
                  </tr>
                  {expandedTourId === tour.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={12} className="px-6 py-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tour Summary</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-700">
                              <div className="flex justify-between"><span>Package</span><span>{tour.packageName}</span></div>
                              <div className="flex justify-between"><span>Guide</span><span>{tour.guideName || 'Unassigned'}</span></div>
                              <div className="flex justify-between"><span>Route</span><span className="capitalize">{tour.routeType}</span></div>
                              <div className="flex justify-between"><span>Quads</span><span>{tour.quadCount}</span></div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue & Costs</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-700">
                              <div className="flex justify-between"><span>Revenue</span><span>{formatCurrency(tour.revenue)} MAD</span></div>
                              <div className="flex justify-between"><span>Base revenue</span><span>{formatCurrency(tour.baseRevenue)} MAD</span></div>
                              <div className="flex justify-between"><span>Fuel surplus revenue</span><span>{formatCurrency(tour.fuelSurplusRevenue)} MAD</span></div>
                              <div className="flex justify-between"><span>Fuel</span><span>{formatCurrency(tour.fuelCosts)} MAD</span></div>
                              <div className="flex justify-between"><span>Total costs</span><span>{formatCurrency(tour.totalCosts)} MAD</span></div>
                              <div className="flex justify-between font-semibold"><span>Gross profit</span><span>{formatCurrency(tour.grossProfit)} MAD</span></div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Collection</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-700">
                              <div className="flex justify-between"><span>Payment status</span><span>{tour.payment_status}</span></div>
                              <div className="flex justify-between"><span>Outstanding</span><span>{formatCurrency(tour.remainingAmount)} MAD</span></div>
                              <div className="flex justify-between"><span>Status</span><span>{tour.status}</span></div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicles</p>
                            <div className="mt-3 text-sm text-slate-700">
                              <div>{tour.vehicleDisplay || 'No vehicles'}</div>
                              <div className="mt-3 space-y-2">
                                <div className="flex justify-between"><span>Fuel consumed</span><span>{tour.fuelConsumedLiters || 0} L</span></div>
                                <div className="flex justify-between"><span>Fuel surplus</span><span>{tour.fuelSurplusLiters || 0} L</span></div>
                                <div className="flex justify-between"><span>Net variance</span><span>{tour.fuelVarianceLiters || 0} L</span></div>
                                <div className="flex justify-between"><span>Fuel unit cost</span><span>{formatCurrency(tour.fuelUnitCost || 0)} MAD/L</span></div>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2 xl:col-span-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fuel by vehicle</p>
                            {tour.fuelVehicleBreakdown?.length > 0 ? (
                              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {tour.fuelVehicleBreakdown.map((vehicleFuel) => (
                                  <div key={`${tour.id}-${vehicleFuel.vehicleId}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">{vehicleFuel.vehicleDisplay}</p>
                                        <p className="text-xs text-slate-500">{vehicleFuel.vehicleModel}</p>
                                      </div>
                                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        vehicleFuel.fuelVarianceLiters < 0
                                          ? 'bg-rose-100 text-rose-700'
                                          : vehicleFuel.fuelVarianceLiters > 0
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {vehicleFuel.fuelVarianceLiters < 0
                                          ? `${Math.abs(vehicleFuel.fuelVarianceLiters)}L used`
                                          : vehicleFuel.fuelVarianceLiters > 0
                                            ? `${vehicleFuel.fuelVarianceLiters}L surplus`
                                            : 'no change'}
                                      </span>
                                    </div>
                                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                                      <div className="flex justify-between">
                                        <span>Fuel</span>
                                        <span>{vehicleFuel.startFuelLevel ?? '-'} / 8 {'->'} {vehicleFuel.endFuelLevel ?? '-'} / 8</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Unit cost</span>
                                        <span>{formatCurrency(vehicleFuel.unitCost || 0)} MAD/L</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Cost</span>
                                        <span className="font-semibold text-rose-600">{formatCurrency(vehicleFuel.fuelCost || 0)} MAD</span>
                                      </div>
                                      {vehicleFuel.fuelSurplusValue > 0 && (
                                        <div className="flex justify-between">
                                          <span>Surplus value</span>
                                          <span className="font-semibold text-emerald-600">+{formatCurrency(vehicleFuel.fuelSurplusValue)} MAD</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-500">No per-vehicle fuel snapshot recorded yet.</p>
                            )}
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

        {totalPages > 1 && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((prev) => prev - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => prev + 1)}
                  disabled={currentPage === totalPages}
                  className="flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TourPLTableV2;
