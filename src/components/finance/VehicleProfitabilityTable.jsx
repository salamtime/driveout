import React, { useState, useEffect } from 'react';
import { Car, TrendingUp, TrendingDown, Calendar, MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import financeService from '../../services/FinanceService';

const VehicleProfitabilityTable = ({ filters = {}, onView, onEdit, onDelete }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'profit', direction: 'desc' });

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log('🔄 Loading vehicle profitability data...', filters);
      
      const result = await financeService.getVehiclePnL({
        lifetime: true,
        vehicleIds: filters.vehicleIds
      });

      if (result.success) {
        setData(result.data);
        console.log('✅ Vehicle profitability data loaded:', result.data.length);
      } else {
        setError(result.error || 'Failed to load vehicle profitability data');
      }
    } catch (error) {
      console.error('❌ Error loading vehicle profitability:', error);
      setError('Failed to load vehicle profitability data');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedData = React.useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle nested vehicle properties
      if (sortConfig.key === 'vehicle_name') {
        aValue = a.vehicle?.name || 'Unknown';
        bValue = b.vehicle?.name || 'Unknown';
      }

      // Handle numeric values
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'desc' ? bValue - aValue : aValue - bValue;
      }

      // Handle string values
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (sortConfig.direction === 'desc') {
        return bStr.localeCompare(aStr);
      }
      return aStr.localeCompare(bStr);
    });
  }, [data, sortConfig]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0).replace('MAD', 'MAD');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getProfitColor = (profit) => {
    if (profit > 0) return 'text-green-600';
    if (profit < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getProfitIcon = (profit) => {
    if (profit > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (profit < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return null;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-8">
          <div className="text-red-600 mb-2">Error loading data</div>
          <div className="text-sm text-gray-600">{error}</div>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Car className="h-5 w-5 text-blue-600" />
          Vehicle Profitability
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Lifetime Performance (All Time) — Revenue: Real | Costs: Estimated | Calc: Computed
        </p>
      </div>

      {data.length === 0 ? (
        <div className="p-8 text-center">
          <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Vehicle Data</h3>
          <p className="text-gray-600">No vehicle profitability data available for the selected filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('vehicle_name')}
                >
                  <div className="flex items-center gap-1">
                    Vehicle
                    {sortConfig.key === 'vehicle_name' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('revenue')}
                >
                  <div className="flex items-center gap-1">
                    Revenue
                    {sortConfig.key === 'revenue' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('expense')}
                >
                  <div className="flex items-center gap-1">
                    Expense
                    {sortConfig.key === 'expense' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('profit')}
                >
                  <div className="flex items-center gap-1">
                    Profit
                    {sortConfig.key === 'profit' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('margin')}
                >
                  <div className="flex items-center gap-1">
                    Margin %
                    {sortConfig.key === 'margin' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('rental_count')}
                >
                  <div className="flex items-center gap-1">
                    Rentals
                    {sortConfig.key === 'rental_count' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('last_activity')}
                >
                  <div className="flex items-center gap-1">
                    Last Activity
                    {sortConfig.key === 'last_activity' && (
                      <span className="text-blue-600">
                        {sortConfig.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedData.map((vehicle) => (
                <tr key={vehicle.vehicle_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Car className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {vehicle.vehicle?.name || 'Unknown Vehicle'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {vehicle.vehicle?.plate_number || `ID: ${vehicle.vehicle_id}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(vehicle.revenue)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(vehicle.expense)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium flex items-center gap-1 ${getProfitColor(vehicle.profit)}`}>
                      {getProfitIcon(vehicle.profit)}
                      {formatCurrency(vehicle.profit)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${getProfitColor(vehicle.profit)}`}>
                      {vehicle.margin}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {vehicle.rental_count || 0}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      {formatDate(vehicle.last_activity)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      {onView && (
                        <button
                          onClick={() => onView(vehicle)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(vehicle)}
                          className="text-gray-600 hover:text-gray-800 transition-colors"
                          title="Edit Vehicle"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(vehicle)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Delete Vehicle"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VehicleProfitabilityTable;