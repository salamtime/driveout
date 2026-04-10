import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
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
  const { i18n } = useTranslation();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const primaryActionButtonClass = 'rounded-2xl bg-violet-600 text-white shadow-sm hover:bg-violet-700';
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
      <div className={`rounded-[1.5rem] border p-6 shadow-sm transition-shadow hover:shadow-md ${urgencyColors[urgency]}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyBadgeColors[urgency]}`}>
                {urgency === 'critical' ? tr('Out of Stock', 'Rupture de stock') : 
                 urgency === 'high' ? tr('Critical Low', 'Très faible') : tr('Low Stock', 'Stock faible')}
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
            <span>{tr('Stock Level', 'Niveau de stock')}</span>
            <span>{tr('Reorder at', 'Réapprovisionner à')} {item.reorder_level} {item.unit}</span>
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
            <p className="text-sm opacity-75">{tr('Selling Price', 'Prix de vente')}</p>
            <p className="font-medium">{item.price_mad} MAD</p>
          </div>
          <div>
            <p className="text-sm opacity-75">{tr('Cost Price', 'Prix de revient')}</p>
            <p className="font-medium">{item.cost_mad} MAD</p>
          </div>
        </div>

        {/* Suggested Actions */}
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center rounded-2xl border border-white/60 bg-white/70 px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-white">
            <ShoppingCartIcon className="h-3 w-3 mr-1" />
            {tr('Reorder Now', 'Réapprovisionner')}
          </button>
          <button className="inline-flex items-center rounded-2xl border border-white/60 bg-white/70 px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-white">
            <EditIcon className="h-3 w-3 mr-1" />
            {tr('Adjust Level', 'Ajuster le niveau')}
          </button>
        </div>
      </div>
    );
  };

  if (loading.dashboard && lowStockItems.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h2 className="text-xl font-semibold text-slate-900">
              {tr('Loading low stock alerts...', 'Chargement des alertes de stock faible...')}
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
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{tr('Low Stock Alert', 'Alerte stock faible')}</h1>
          <p className="text-gray-600 mt-1">{tr('Items that need immediate attention', 'Articles nécessitant une attention immédiate')}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={`inline-flex items-center px-4 py-2 disabled:opacity-50 ${primaryActionButtonClass}`}
        >
          <RefreshCwIcon className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? tr('Refreshing...', 'Actualisation...') : tr('Refresh', 'Actualiser')}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center">
            <AlertTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="flex items-center">
            <div className="mr-4 rounded-2xl bg-red-100 p-3">
              <AlertTriangleIcon className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-600">{tr('Critical Items', 'Articles critiques')}</p>
              <p className="text-2xl font-bold text-red-900">
                {lowStockItems.filter(item => item.stock_on_hand <= 0).length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <div className="flex items-center">
            <div className="mr-4 rounded-2xl bg-orange-100 p-3">
              <TrendingUpIcon className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-600">{tr('Low Stock Items', 'Articles à stock faible')}</p>
              <p className="text-2xl font-bold text-orange-900">
                {lowStockItems.filter(item => item.stock_on_hand > 0).length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <div className="flex items-center">
            <div className="mr-4 rounded-2xl bg-blue-100 p-3">
              <PackageIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600">{tr('Total Items', 'Total des articles')}</p>
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
                {tr('Critical - Out of Stock', 'Critique - Rupture de stock')}
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
                {tr('Low Stock - Needs Attention', 'Stock faible - Attention requise')}
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
        <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="text-6xl mb-4">✅</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">{tr('All Stock Levels Good!', 'Tous les niveaux de stock sont bons !')}</h3>
          <p className="text-gray-600 mb-6">
            {tr('No items are currently below their reorder levels.', "Aucun article n'est actuellement sous son seuil de réapprovisionnement.")}
          </p>
          <button
            onClick={handleRefresh}
            className={`inline-flex items-center px-4 py-2 ${primaryActionButtonClass}`}
          >
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            {tr('Check Again', 'Vérifier à nouveau')}
          </button>
        </div>
      )}
    </div>
  );
};

export default LowStockAlert;
