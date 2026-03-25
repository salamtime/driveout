import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchLowStockItems,
  fetchItems,
  clearError 
} from '../../store/slices/inventorySlice';
import { 
  AlertTriangleIcon,
  PackageIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  EditIcon,
  ShoppingCartIcon
} from 'lucide-react';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';

const LowStockAlert = () => {
  const dispatch = useDispatch();
  const { lowStockItems, loading, error } = useSelector(state => state.inventory);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchLowStockItems());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      console.error('Low stock alert error:', error);
      setTimeout(() => dispatch(clearError()), 5000);
    }
  }, [error, dispatch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchLowStockItems());
    setTimeout(() => setRefreshing(false), 500);
  };

  const LowStockCard = ({ item }) => {
    const categoryVisual = getInventoryCategoryVisual(item.category);
    const stockPercentage = item.reorder_level > 0 
      ? Math.max(0, (item.stock_on_hand / item.reorder_level) * 100)
      : 0;

    const getUrgencyLevel = () => {
      if (item.stock_on_hand <= 0) return 'critical';
      if (stockPercentage <= 50) return 'high';
      return 'medium';
    };

    const urgency = getUrgencyLevel();
    const urgencyColors = {
      critical: 'bg-red-50 border-red-200 text-red-900',
      high: 'bg-orange-50 border-orange-200 text-orange-900',
      medium: 'bg-yellow-50 border-yellow-200 text-yellow-900'
    };

    const urgencyBadgeColors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800'
    };

    return (
      <div className={`rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow ${urgencyColors[urgency]}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyBadgeColors[urgency]}`}>
                {urgency === 'critical' ? 'Out of Stock' : 
                 urgency === 'high' ? 'Critical Low' : 'Low Stock'}
              </span>
            </div>
            <span className={`mb-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryVisual.classes}`}>
              <span>{categoryVisual.emoji}</span>
              <span>{item.category || categoryVisual.label}</span>
            </span>
            {item.sku && <p className="text-xs opacity-60">SKU: {item.sku}</p>}
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-1 mb-1">
              <AlertTriangleIcon className="h-4 w-4" />
              <span className="text-lg font-bold">
                {item.stock_on_hand}
              </span>
            </div>
            <p className="text-xs opacity-75">{item.unit}</p>
          </div>
        </div>

        {/* Stock Level Indicator */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>Stock Level</span>
            <span>Reorder at {item.reorder_level} {item.unit}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                urgency === 'critical' ? 'bg-red-500' :
                urgency === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${Math.min(100, stockPercentage)}%` }}
            ></div>
          </div>
        </div>

        {/* Pricing Info */}
        <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-current border-opacity-20">
          <div>
            <p className="text-sm opacity-75">Selling Price</p>
            <p className="font-medium">{item.price_mad} MAD</p>
          </div>
          <div>
            <p className="text-sm opacity-75">Cost Price</p>
            <p className="font-medium">{item.cost_mad} MAD</p>
          </div>
        </div>

        {/* Suggested Actions */}
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center px-3 py-1 bg-white bg-opacity-50 rounded-lg hover:bg-opacity-75 transition-colors text-sm">
            <ShoppingCartIcon className="h-3 w-3 mr-1" />
            Reorder Now
          </button>
          <button className="inline-flex items-center px-3 py-1 bg-white bg-opacity-50 rounded-lg hover:bg-opacity-75 transition-colors text-sm">
            <EditIcon className="h-3 w-3 mr-1" />
            Adjust Level
          </button>
        </div>
      </div>
    );
  };

  if (loading.dashboard && lowStockItems.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Low Stock Alert</h1>
          <p className="text-gray-600 mt-1">Items that need immediate attention</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center">
            <div className="p-3 bg-red-100 rounded-lg mr-4">
              <AlertTriangleIcon className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-600">Critical Items</p>
              <p className="text-2xl font-bold text-red-900">
                {lowStockItems.filter(item => item.stock_on_hand <= 0).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-lg mr-4">
              <TrendingUpIcon className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-orange-900">
                {lowStockItems.filter(item => item.stock_on_hand > 0).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg mr-4">
              <PackageIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600">Total Items</p>
              <p className="text-2xl font-bold text-blue-900">
                {lowStockItems.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock Items */}
      {lowStockItems.length > 0 ? (
        <div className="space-y-4">
          {/* Critical Items First */}
          {lowStockItems.filter(item => item.stock_on_hand <= 0).length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center">
                <AlertTriangleIcon className="h-5 w-5 mr-2" />
                Critical - Out of Stock
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {lowStockItems
                  .filter(item => item.stock_on_hand <= 0)
                  .map((item) => (
                    <LowStockCard key={item.id} item={item} />
                  ))}
              </div>
            </div>
          )}

          {/* Low Stock Items */}
          {lowStockItems.filter(item => item.stock_on_hand > 0).length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-orange-900 mb-4 flex items-center">
                <TrendingUpIcon className="h-5 w-5 mr-2" />
                Low Stock - Needs Attention
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lowStockItems
                  .filter(item => item.stock_on_hand > 0)
                  .sort((a, b) => {
                    const aPercentage = a.reorder_level > 0 ? (a.stock_on_hand / a.reorder_level) * 100 : 0;
                    const bPercentage = b.reorder_level > 0 ? (b.stock_on_hand / b.reorder_level) * 100 : 0;
                    return aPercentage - bPercentage;
                  })
                  .map((item) => (
                    <LowStockCard key={item.id} item={item} />
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">All Stock Levels Good!</h3>
          <p className="text-gray-600 mb-6">
            No items are currently below their reorder levels.
          </p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Check Again
          </button>
        </div>
      )}
    </div>
  );
};

export default LowStockAlert;
