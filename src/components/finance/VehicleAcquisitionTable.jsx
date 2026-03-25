import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Car, 
  Calendar, 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Eye,
  Download
} from 'lucide-react';
import { format } from 'date-fns';

/**
 * VehicleAcquisitionTable - Comprehensive table showing acquisition costs and current values
 * 
 * Features:
 * - Sortable columns for all financial metrics
 * - Search and filter functionality
 * - Acquisition cost vs current value analysis
 * - Depreciation tracking and visualization
 * - Export functionality for financial reports
 * - Drill-down to vehicle details
 */
const VehicleAcquisitionTable = ({ 
  data = [], 
  loading = false, 
  onVehicleClick = null,
  onExport = null,
  showDepreciation = true 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'acquisition_cost', direction: 'desc' });

  // Format currency for display
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Get status badge variant
  const getStatusVariant = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'success';
      case 'maintenance': return 'warning';
      case 'retired': return 'secondary';
      case 'sold': return 'destructive';
      default: return 'default';
    }
  };

  // Calculate depreciation percentage
  const getDepreciationPercentage = (acquisition, current) => {
    if (!acquisition || acquisition === 0) return 0;
    return ((acquisition - current) / acquisition) * 100;
  };

  // Get depreciation trend icon
  const getDepreciationIcon = (percentage) => {
    if (percentage > 50) return <TrendingDown className="h-4 w-4 text-red-500" />;
    if (percentage > 25) return <TrendingDown className="h-4 w-4 text-yellow-500" />;
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  };

  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = data.filter(vehicle => 
      vehicle.vehicle_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.vehicle_model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.vehicle_type?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle date sorting
        if (sortConfig.key === 'purchase_date') {
          aValue = new Date(aValue || 0).getTime();
          bValue = new Date(bValue || 0).getTime();
        }

        // Handle numeric sorting
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        // Handle string sorting
        aValue = String(aValue || '').toLowerCase();
        bValue = String(bValue || '').toLowerCase();
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [data, searchTerm, sortConfig]);

  // Handle column sorting
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-blue-600" />
      : <ArrowDown className="h-4 w-4 text-blue-600" />;
  };

  // Handle vehicle click
  const handleVehicleClick = (vehicle) => {
    if (onVehicleClick) {
      onVehicleClick(vehicle.vehicle_id, vehicle.vehicle_name);
    }
  };

  // Handle export
  const handleExport = () => {
    if (onExport) {
      onExport(processedData);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Acquisition Analysis</CardTitle>
          <CardDescription>Loading vehicle acquisition data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle Acquisition Analysis
            </CardTitle>
            <CardDescription>
              Track acquisition costs, current values, and depreciation for all fleet vehicles
            </CardDescription>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search vehicles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-64"
              />
            </div>
            
            {onExport && (
              <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {processedData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Car className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No Vehicle Data</p>
            <p className="text-sm">Vehicle acquisition data will appear here once vehicles are added to the fleet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-900">
                    <button
                      onClick={() => handleSort('vehicle_name')}
                      className="flex items-center gap-2 hover:text-blue-600"
                    >
                      Vehicle
                      {getSortIcon('vehicle_name')}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium text-gray-900">
                    <button
                      onClick={() => handleSort('vehicle_type')}
                      className="flex items-center gap-2 hover:text-blue-600"
                    >
                      Type
                      {getSortIcon('vehicle_type')}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium text-gray-900">
                    <button
                      onClick={() => handleSort('purchase_date')}
                      className="flex items-center gap-2 hover:text-blue-600"
                    >
                      Purchase Date
                      {getSortIcon('purchase_date')}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium text-gray-900">
                    <button
                      onClick={() => handleSort('acquisition_cost')}
                      className="flex items-center gap-2 hover:text-blue-600"
                    >
                      Acquisition Cost
                      {getSortIcon('acquisition_cost')}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium text-gray-900">
                    <button
                      onClick={() => handleSort('current_book_value')}
                      className="flex items-center gap-2 hover:text-blue-600"
                    >
                      Current Value
                      {getSortIcon('current_book_value')}
                    </button>
                  </th>
                  {showDepreciation && (
                    <th className="text-right p-3 font-medium text-gray-900">
                      <button
                        onClick={() => handleSort('accumulated_depreciation')}
                        className="flex items-center gap-2 hover:text-blue-600"
                      >
                        Depreciation
                        {getSortIcon('accumulated_depreciation')}
                      </button>
                    </th>
                  )}
                  <th className="text-center p-3 font-medium text-gray-900">Status</th>
                  <th className="text-center p-3 font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((vehicle, index) => {
                  const depreciationPercentage = getDepreciationPercentage(
                    vehicle.acquisition_cost, 
                    vehicle.current_book_value
                  );
                  
                  return (
                    <tr 
                      key={vehicle.vehicle_id || index} 
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3">
                        <div>
                          <p className="font-medium text-gray-900">{vehicle.vehicle_name}</p>
                          <p className="text-sm text-gray-600">{vehicle.vehicle_model}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {vehicle.vehicle_type || 'Unknown'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">{formatDate(vehicle.purchase_date)}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{formatCurrency(vehicle.acquisition_cost)}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium">{formatCurrency(vehicle.current_book_value)}</span>
                      </td>
                      {showDepreciation && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {getDepreciationIcon(depreciationPercentage)}
                            <div>
                              <p className="font-medium">{formatCurrency(vehicle.accumulated_depreciation)}</p>
                              <p className="text-xs text-gray-600">
                                {depreciationPercentage.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="p-3 text-center">
                        <Badge variant={getStatusVariant(vehicle.vehicle_status)}>
                          {vehicle.vehicle_status || 'Unknown'}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVehicleClick(vehicle)}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Statistics */}
        {processedData.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Car className="h-5 w-5 text-blue-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Total Vehicles</p>
                  <p className="text-lg font-bold text-blue-700">{processedData.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-green-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-green-900">Total Investment</p>
                  <p className="text-lg font-bold text-green-700">
                    {formatCurrency(processedData.reduce((sum, v) => sum + (v.acquisition_cost || 0), 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center">
                <TrendingUp className="h-5 w-5 text-purple-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-purple-900">Current Value</p>
                  <p className="text-lg font-bold text-purple-700">
                    {formatCurrency(processedData.reduce((sum, v) => sum + (v.current_book_value || 0), 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center">
                <TrendingDown className="h-5 w-5 text-red-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-red-900">Total Depreciation</p>
                  <p className="text-lg font-bold text-red-700">
                    {formatCurrency(processedData.reduce((sum, v) => sum + (v.accumulated_depreciation || 0), 0))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VehicleAcquisitionTable;