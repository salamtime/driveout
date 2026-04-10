import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Package, 
  TrendingUp, 
  Clock, 
  DollarSign,
  Filter,
  RefreshCw,
  ShoppingCart,
  Edit3
} from 'lucide-react';
import AlertsService from '../../services/AlertsService';

const InventoryAlerts = () => {
  const { i18n } = useTranslation();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const [alerts, setAlerts] = useState({
    lowStock: [],
    outOfStock: [],
    overstock: [],
    inactive: [],
    highValue: [],
    summary: { total: 0, critical: 0, warning: 0, info: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const alertsData = await AlertsService.getInventoryAlerts();
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAllAlerts = () => {
    return [
      ...alerts.outOfStock,
      ...alerts.lowStock,
      ...alerts.overstock,
      ...alerts.inactive,
      ...alerts.highValue
    ];
  };

  const getFilteredAlerts = () => {
    let filteredAlerts = getAllAlerts();

    // Filter by type
    if (selectedFilter !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => alert.type === selectedFilter);
    }

    // Filter by priority
    if (selectedPriority !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => alert.priority === selectedPriority);
    }

    // Sort by priority (critical first, then warning, then info)
    return filteredAlerts.sort((a, b) => {
      const priorityOrder = { critical: 0, warning: 1, info: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'out_of_stock':
        return <Package className="w-5 h-5 text-red-500" />;
      case 'low_stock':
        return <TrendingUp className="w-5 h-5 text-yellow-500" />;
      case 'overstock':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'inactive':
        return <Clock className="w-5 h-5 text-gray-500" />;
      case 'high_value':
        return <DollarSign className="w-5 h-5 text-green-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority) => {
    return AlertsService.getPriorityColor(priority);
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'out_of_stock':
        return tr('Out of Stock', 'Rupture de stock');
      case 'low_stock':
        return tr('Low Stock', 'Stock faible');
      case 'overstock':
        return tr('Overstock', 'Surstock');
      case 'inactive':
        return tr('Inactive', 'Inactif');
      case 'high_value':
        return tr('High Value', 'Valeur élevée');
      default:
        return tr('Unknown', 'Inconnu');
    }
  };

  const handleQuickAction = (alert, action) => {
    console.log(`Quick action: ${action} for item ${alert.itemName}`);
    // TODO: Implement quick actions
    switch (action) {
      case 'purchase':
        // Navigate to purchase order creation
        break;
      case 'adjust':
        // Open stock adjustment modal
        break;
      case 'edit':
        // Navigate to item edit
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">{tr('Loading alerts...', 'Chargement des alertes...')}</span>
      </div>
    );
  }

  const filteredAlerts = getFilteredAlerts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{tr('Inventory Alerts', "Alertes d'inventaire")}</h2>
          <p className="text-gray-600 mt-1">
            {tr('Monitor and manage inventory issues across your stock', "Surveillez et gérez les problèmes d'inventaire dans votre stock")}
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {tr('Refresh', 'Actualiser')}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{tr('Total Alerts', 'Total des alertes')}</p>
              <p className="text-2xl font-bold text-gray-900">{alerts.summary.total}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600">{tr('Critical', 'Critique')}</p>
              <p className="text-2xl font-bold text-red-600">{alerts.summary.critical}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600">{tr('Warning', 'Avertissement')}</p>
              <p className="text-2xl font-bold text-yellow-600">{alerts.summary.warning}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600">{tr('Info', 'Info')}</p>
              <p className="text-2xl font-bold text-blue-600">{alerts.summary.info}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Info className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex items-center space-x-4">
          <Filter className="w-5 h-5 text-gray-500" />
          
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">{tr('Type:', 'Type :')}</label>
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{tr('All Types', 'Tous les types')}</option>
              <option value="out_of_stock">{tr('Out of Stock', 'Rupture de stock')}</option>
              <option value="low_stock">{tr('Low Stock', 'Stock faible')}</option>
              <option value="overstock">{tr('Overstock', 'Surstock')}</option>
              <option value="inactive">{tr('Inactive', 'Inactif')}</option>
              <option value="high_value">{tr('High Value', 'Valeur élevée')}</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">{tr('Priority:', 'Priorité :')}</label>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{tr('All Priorities', 'Toutes les priorités')}</option>
              <option value="critical">{tr('Critical', 'Critique')}</option>
              <option value="warning">{tr('Warning', 'Avertissement')}</option>
              <option value="info">{tr('Info', 'Info')}</option>
            </select>
          </div>

          <div className="text-sm text-gray-500">
            {tr('Showing', 'Affichage de')} {filteredAlerts.length} {tr('of', 'sur')} {alerts.summary.total} {tr('alerts', 'alertes')}
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow border border-gray-200 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{tr('No Alerts Found', 'Aucune alerte trouvée')}</h3>
            <p className="text-gray-600">
              {selectedFilter !== 'all' || selectedPriority !== 'all' 
                ? tr('No alerts match your current filters.', 'Aucune alerte ne correspond à vos filtres actuels.') 
                : tr('Great! Your inventory is in good shape with no alerts.', 'Parfait ! Votre inventaire est en bon état, sans alerte.')}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white p-6 rounded-lg shadow border-l-4 ${getPriorityColor(alert.priority)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-2">
                    {getPriorityIcon(alert.priority)}
                    {getTypeIcon(alert.type)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{alert.itemName}</h3>
                      <span className="text-sm text-gray-500">({alert.sku})</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(alert.priority)}`}>
                        {getTypeLabel(alert.type)}
                      </span>
                    </div>
                    
                    <p className="text-gray-600 mb-2">{alert.message}</p>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{tr('Category:', 'Catégorie :')} {alert.category}</span>
                      {alert.stock !== undefined && <span>{tr('Stock:', 'Stock :')} {alert.stock}</span>}
                      {alert.reorderLevel && <span>{tr('Reorder Level:', 'Seuil de réapprovisionnement :')} {alert.reorderLevel}</span>}
                      {alert.value && <span>{tr('Value:', 'Valeur :')} {AlertsService.formatCurrency(alert.value)}</span>}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center space-x-2">
                  {alert.type === 'out_of_stock' || alert.type === 'low_stock' ? (
                    <button
                      onClick={() => handleQuickAction(alert, 'purchase')}
                      className="flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      {tr('Order', 'Commander')}
                    </button>
                  ) : null}
                  
                  <button
                    onClick={() => handleQuickAction(alert, 'adjust')}
                    className="flex items-center px-3 py-1 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    {tr('Adjust', 'Ajuster')}
                  </button>
                </div>
              </div>

              {/* Action Suggestion */}
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-700">
                  <strong>{tr('Suggested Action:', 'Action suggérée :')}</strong> {alert.action}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default InventoryAlerts;
