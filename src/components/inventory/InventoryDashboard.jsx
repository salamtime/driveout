import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
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
import AdminMobileStatsRow from '../admin/AdminMobileStatsRow';

const InventoryDashboard = ({ onNavigate }) => {
  const { i18n } = useTranslation();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
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

  const formatUnitLabel = (unitValue) => {
    const normalizedUnit = String(unitValue || '').trim().toLowerCase();
    if (!normalizedUnit) return tr('piece', 'pièce');

    switch (normalizedUnit) {
      case 'piece':
      case 'pieces':
      case 'pièce':
      case 'pièces':
        return tr('piece', 'pièce');
      case 'liter':
      case 'liters':
      case 'litre':
      case 'litres':
        return tr('liter', 'litre');
      case 'box':
      case 'boxes':
        return tr('box', 'boîte');
      case 'pack':
      case 'packs':
        return tr('pack', 'paquet');
      default:
        return unitValue;
    }
  };

  const formatMovementNote = (movement) => {
    const rawNote = String(movement?.notes || '').trim();
    if (!rawNote) return '—';

    const stripMaintenanceId = (value) => value
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .trim();

    const usedInMaintenancePrefix = 'Used in maintenance';
    if (rawNote.startsWith(usedInMaintenancePrefix)) {
      const suffix = stripMaintenanceId(rawNote.slice(usedInMaintenancePrefix.length).trim());
      return suffix
        ? `${tr('Used in maintenance', 'Utilisé en maintenance')} ${suffix}`
        : tr('Used in maintenance', 'Utilisé en maintenance');
    }

    const restoredFromMaintenancePrefix = 'Restored from maintenance';
    if (rawNote.startsWith(restoredFromMaintenancePrefix)) {
      const suffix = stripMaintenanceId(rawNote.slice(restoredFromMaintenancePrefix.length).trim());
      return suffix
        ? `${tr('Restored from maintenance', 'Restauré depuis la maintenance')} ${suffix}`
        : tr('Restored from maintenance', 'Restauré depuis la maintenance');
    }

    return rawNote;
  };

  if (loading.dashboard && !realTimeStats) {
    return (
      <div className="p-4 lg:p-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h2 className="text-xl font-semibold text-slate-900">
              {tr('Loading inventory workspace...', "Chargement de l'espace inventaire...")}
            </h2>
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
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{tr('Inventory Dashboard', "Tableau de bord d'inventaire")}</h1>
          <p className="text-gray-600 mt-1">{tr('Manage parts, supplies, and equipment inventory', "Gérez les pièces, fournitures et équipements d'inventaire")}</p>
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
      <AdminMobileStatsRow
        contentClassName="flex gap-3 md:grid md:grid-cols-2 lg:grid-cols-4"
        itemClassName="min-w-[220px] flex-none md:min-w-0 md:flex-auto"
      >
        <StatCard
          icon={PackageIcon}
          title={tr('Total Items', 'Total des articles')}
          value={stats.totalItems}
          subtitle={tr('Active inventory items', "Articles d'inventaire actifs")}
          color="blue"
          onClick={() => onNavigate('items')}
        />
        <StatCard
          icon={AlertTriangleIcon}
          title={tr('Low Stock', 'Stock faible')}
          value={stats.lowStockCount}
          subtitle={tr('Items below reorder level', 'Articles sous le seuil de réapprovisionnement')}
          color="red"
          onClick={() => onNavigate('low-stock')}
        />
        <StatCard
          icon={ShoppingCartIcon}
          title={tr('Recent Purchases', 'Achats récents')}
          value={purchases.length}
          subtitle={tr('Last 30 days', '30 derniers jours')}
          color="green"
          onClick={() => onNavigate('purchases')}
        />
        <StatCard
          icon={TrendingUpIcon}
          title={tr('Stock Movements', 'Mouvements de stock')}
          value={movements.length}
          subtitle={tr('Last 30 days', '30 derniers jours')}
          color="purple"
          onClick={() => onNavigate('movements')}
        />
      </AdminMobileStatsRow>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('Quick Actions', 'Actions rapides')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickActionButton
            icon={PlusIcon}
            title={tr('Add New Item', 'Ajouter un nouvel article')}
            description={tr('Create a new inventory item', "Créer un nouvel article d'inventaire")}
            onClick={() => onNavigate('items', { action: 'create' })}
            color="blue"
          />
          <QuickActionButton
            icon={ShoppingCartIcon}
            title={tr('Record Purchase', 'Enregistrer un achat')}
            description={tr('Add a new purchase with invoice', 'Ajouter un nouvel achat avec facture')}
            onClick={() => onNavigate('purchases', { action: 'create' })}
            color="green"
          />
          <QuickActionButton
            icon={TrendingDownIcon}
            title={tr('Issue Items', 'Sortir des articles')}
            description={tr('Record items issued to vehicles', 'Enregistrer les articles remis aux véhicules')}
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
              <h2 className="text-lg font-semibold text-red-900">{tr('Low Stock Alert', 'Alerte stock faible')}</h2>
            </div>
            <button
              onClick={() => onNavigate('low-stock')}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              {tr('View All', 'Voir tout')} ({stats.lowStockCount})
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
                    {item.stock_on_hand} {formatUnitLabel(item.unit)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {tr('Reorder at', 'Réapprovisionner à')} {item.reorder_level} {formatUnitLabel(item.unit)}
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
            <h2 className="text-lg font-semibold text-gray-900">{tr('Recent Purchases', 'Achats récents')}</h2>
            <button
              onClick={() => onNavigate('purchases')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              {tr('View All', 'Voir tout')}
            </button>
          </div>
          <div className="space-y-3">
            {purchases.slice(0, 5).map((purchase) => (
              <div key={purchase.id} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{purchase.supplier}</p>
                  <p className="text-sm text-gray-600">
                    {tr('Invoice', 'Facture')} #{purchase.invoice_number || purchase.purchase_number || tr('N/A', 'N/D')}
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
                    {purchase.purchase_lines?.length || 0} {tr('items', 'articles')}
                  </p>
                </div>
              </div>
            ))}
            {purchases.length === 0 && (
              <p className="text-gray-500 text-center py-4">{tr('No recent purchases', 'Aucun achat récent')}</p>
            )}
          </div>
        </div>

        {/* Recent Stock Movements */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{tr('Recent Movements', 'Mouvements récents')}</h2>
            <div className="flex items-center space-x-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">{tr('All', 'Tous')}</option>
                <option value="in">IN</option>
                <option value="out">OUT</option>
              </select>
              <button
                onClick={() => onNavigate('movements')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                {tr('View All', 'Voir tout')}
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
                    {formatMovementNote(movement)}
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
                    {formatUnitLabel(movement.item?.unit || movement.inventory_items?.unit)}
                  </p>
                </div>
              </div>
            ))}
            {filteredMovements.length === 0 && (
              <p className="text-gray-500 text-center py-4">{tr('No recent movements', 'Aucun mouvement récent')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboard;
