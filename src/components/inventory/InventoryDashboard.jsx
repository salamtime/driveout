import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchDashboardData, 
  fetchLowStockItems,
  clearError 
} from '../../store/slices/inventorySlice';
import { 
  PackageIcon, 
  AlertTriangleIcon, 
  ShoppingCartIcon, 
  TrendingUpIcon,
  TrendingDownIcon,
  EyeIcon,
  PlusIcon,
  FilterIcon
} from 'lucide-react';
import InventoryService from '../../services/InventoryService';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';

const InventoryDashboard = ({ onNavigate }) => {
  const dispatch = useDispatch();
  const { dashboardData, lowStockItems, loading, error } = useSelector(state => state.inventory);
  const [filter, setFilter] = useState('all');
  const [realTimeStats, setRealTimeStats] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [dispatch]);

  const loadDashboardData = async () => {
    try {
      // Get unified dashboard stats
      const stats = await InventoryService.getDashboardStats({ active: true });
      setRealTimeStats(stats);
      
      // Also dispatch Redux actions for compatibility
      dispatch(fetchDashboardData());
      dispatch(fetchLowStockItems());
    } catch (error) {
      console.error('Dashboard data error:', error);
    }
  };

  useEffect(() => {
    if (error) {
      console.error('Inventory dashboard error:', error);
      setTimeout(() => dispatch(clearError()), 5000);
    }
  }, [error, dispatch]);

  // Use real-time stats if available, fallback to Redux state
  const stats = realTimeStats || dashboardData || {};
  const movements = stats.recentMovements || [];
  const purchases = stats.recentPurchases || [];
  const lowStock = stats.lowStockItems || lowStockItems || [];

  const filteredMovements = movements.filter(movement => {
    if (filter === 'all') return true;
    return movement.movement_type.toLowerCase() === filter.toLowerCase();
  });

  const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue', onClick }) => (
    <div 
      className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold text-${color}-600`}>{value || 0}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 bg-${color}-100 rounded-lg`}>
          <Icon className={`h-6 w-6 text-${color}-600`} />
        </div>
      </div>
    </div>
  );

  const QuickActionButton = ({ icon: Icon, title, description, onClick, color = 'blue' }) => (
    <button
      onClick={onClick}
      className={`w-full p-4 bg-white rounded-xl shadow-sm border hover:shadow-md transition-all hover:border-${color}-200 text-left group`}
    >
      <div className="flex items-start space-x-3">
        <div className={`p-2 bg-${color}-100 rounded-lg group-hover:bg-${color}-200 transition-colors`}>
          <Icon className={`h-5 w-5 text-${color}-600`} />
        </div>
        <div>
          <h3 className="font-medium text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
      </div>
    </button>
  );

  const formatCurrency = (amount) => {
    return `${(amount || 0).toFixed(2)} MAD`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading.dashboard && !realTimeStats) {
    return (
      <div className="p-4 lg:p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
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
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage parts, supplies, and equipment inventory</p>
        </div>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={PackageIcon}
          title="Total Items"
          value={stats.totalItems}
          subtitle="Active inventory items"
          color="blue"
          onClick={() => onNavigate('items')}
        />
        <StatCard
          icon={AlertTriangleIcon}
          title="Low Stock"
          value={stats.lowStockCount}
          subtitle="Items below reorder level"
          color="red"
          onClick={() => onNavigate('low-stock')}
        />
        <StatCard
          icon={ShoppingCartIcon}
          title="Recent Purchases"
          value={purchases.length}
          subtitle="Last 30 days"
          color="green"
          onClick={() => onNavigate('purchases')}
        />
        <StatCard
          icon={TrendingUpIcon}
          title="Stock Movements"
          value={movements.length}
          subtitle="Last 30 days"
          color="purple"
          onClick={() => onNavigate('movements')}
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickActionButton
            icon={PlusIcon}
            title="Add New Item"
            description="Create a new inventory item"
            onClick={() => onNavigate('items', { action: 'create' })}
            color="blue"
          />
          <QuickActionButton
            icon={ShoppingCartIcon}
            title="Record Purchase"
            description="Add a new purchase with invoice"
            onClick={() => onNavigate('purchases', { action: 'create' })}
            color="green"
          />
          <QuickActionButton
            icon={TrendingDownIcon}
            title="Issue Items"
            description="Record items issued to vehicles"
            onClick={() => onNavigate('movements', { action: 'create', type: 'OUT' })}
            color="orange"
          />
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <AlertTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-red-900">Low Stock Alert</h2>
            </div>
            <button
              onClick={() => onNavigate('low-stock')}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              View All ({stats.lowStockCount})
            </button>
          </div>
          <div className="space-y-2">
            {lowStock.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  {(() => {
                    const categoryVisual = getInventoryCategoryVisual(item.category);
                    return (
                      <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryVisual.classes}`}>
                        <span>{categoryVisual.emoji}</span>
                        <span>{item.category || categoryVisual.label}</span>
                      </span>
                    );
                  })()}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-red-600">
                    {item.stock_on_hand} {item.unit}
                  </p>
                  <p className="text-xs text-gray-500">
                    Reorder at {item.reorder_level}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchases */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Purchases</h2>
            <button
              onClick={() => onNavigate('purchases')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All
            </button>
          </div>
          <div className="space-y-3">
            {purchases.slice(0, 5).map((purchase) => (
              <div key={purchase.id} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{purchase.supplier}</p>
                  <p className="text-sm text-gray-600">
                    Invoice #{purchase.invoice_number || purchase.purchase_number || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(purchase.purchase_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">
                    {formatCurrency(purchase.total_amount_mad)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {purchase.purchase_lines?.length || 0} items
                  </p>
                </div>
              </div>
            ))}
            {purchases.length === 0 && (
              <p className="text-gray-500 text-center py-4">No recent purchases</p>
            )}
          </div>
        </div>

        {/* Recent Stock Movements */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Movements</h2>
            <div className="flex items-center space-x-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">All</option>
                <option value="in">IN</option>
                <option value="out">OUT</option>
              </select>
              <button
                onClick={() => onNavigate('movements')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View All
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {filteredMovements.slice(0, 5).map((movement) => (
              <div key={movement.id} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {movement.inventory_items?.name}
                  </p>
                  <p className="text-sm text-gray-600 truncate">
                    {movement.notes}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(movement.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end">
                    {movement.movement_type === 'in' ? (
                      <TrendingUpIcon className="h-4 w-4 text-green-600 mr-1" />
                    ) : (
                      <TrendingDownIcon className="h-4 w-4 text-red-600 mr-1" />
                    )}
                    <span className={`font-medium ${
                      movement.movement_type === 'in' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {movement.movement_type === 'in' ? '+' : '−'}{Math.abs(movement.quantity)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {movement.inventory_items?.unit}
                  </p>
                </div>
              </div>
            ))}
            {filteredMovements.length === 0 && (
              <p className="text-gray-500 text-center py-4">No recent movements</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard;
