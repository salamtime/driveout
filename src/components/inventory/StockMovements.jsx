import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Filter, Calendar, Package, TrendingUp, TrendingDown } from 'lucide-react';
import inventoryService from '../../services/InventoryService';

const StockMovements = ({ initialParams, action, type }) => {
  const { i18n } = useTranslation();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const primaryActionButtonClass = 'rounded-2xl bg-violet-600 text-white shadow-sm hover:bg-violet-700';
  const softActionButtonClass = 'rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900';
  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({
    itemId: '',
    movementType: '',
    dateFrom: '',
    dateTo: '',
    searchTerm: ''
  });
  const [formData, setFormData] = useState({
    item_id: '',
    movement_type: 'in',
    quantity: '',
    reference: '',
    notes: '',
    movement_date: new Date().toISOString().split('T')[0]
  });

  const formatUnitLabel = (unitValue) => {
    const normalized = String(unitValue || '').toLowerCase();
    const labels = {
      liter: tr('L', 'L'),
      piece: tr('piece', 'pièce'),
      box: tr('box', 'boîte'),
      pack: tr('pack', 'paquet')
    };
    return labels[normalized] || unitValue || tr('unit', 'unité');
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  useEffect(() => {
    const requestedAction = action || initialParams?.action;
    const requestedType = (type || initialParams?.type || '').toString().toLowerCase();

    if (requestedAction === 'create') {
      setFormData(prev => ({
        ...prev,
        movement_type: requestedType === 'out' ? 'out' : prev.movement_type
      }));
      setShowModal(true);
    }
  }, [action, type, initialParams]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [movementsData, itemsData] = await Promise.all([
        inventoryService.getStockMovements ? inventoryService.getStockMovements(filters) : [],
        inventoryService.getItems()
      ]);
      setMovements(movementsData);
      setItems(itemsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await inventoryService.createStockMovement({
        ...formData,
        quantity: parseFloat(formData.quantity),
        item_id: parseInt(formData.item_id)
      });
      setShowModal(false);
      setFormData({
        item_id: '',
        movement_type: 'in',
        quantity: '',
        reference: '',
        notes: '',
        movement_date: new Date().toISOString().split('T')[0]
      });
      fetchData();
    } catch (error) {
      console.error('Error creating movement:', error);
      alert(tr('Failed to create stock movement', 'Impossible de créer le mouvement de stock'));
    }
  };

  const getMovementIcon = (type) => {
    switch (type) {
      case 'in':
      case 'adjustment_in':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'out':
      case 'adjustment_out':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Package className="w-4 h-4 text-gray-600" />;
    }
  };

  const getMovementColor = (type) => {
    switch (type) {
      case 'in':
      case 'adjustment_in':
        return 'text-green-600 bg-green-50';
      case 'out':
      case 'adjustment_out':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatMovementNote = (movement) => {
    const rawNote = String(movement?.notes || '').trim();
    if (!rawNote) return '';

    const stripMaintenanceId = (value) => value
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .trim();

    if (rawNote.startsWith('Used in maintenance')) {
      const suffix = stripMaintenanceId(rawNote.replace('Used in maintenance', '').trim());
      return suffix
        ? `${tr('Used in maintenance', 'Utilisé en maintenance')} ${suffix}`
        : tr('Used in maintenance', 'Utilisé en maintenance');
    }

    if (rawNote.startsWith('Restored from maintenance')) {
      const suffix = stripMaintenanceId(rawNote.replace('Restored from maintenance', '').trim());
      return suffix
        ? `${tr('Restored from maintenance', 'Restauré depuis la maintenance')} ${suffix}`
        : tr('Restored from maintenance', 'Restauré depuis la maintenance');
    }

    return rawNote;
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h2 className="text-xl font-semibold text-slate-900">
              {tr('Loading stock movements...', 'Chargement des mouvements de stock...')}
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{tr('Stock Movements', 'Mouvements de stock')}</h1>
        <p className="text-gray-600 mt-1">{tr('Track and manage inventory stock movements', "Suivez et gérez les mouvements de stock de l'inventaire")}</p>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{tr('Filters', 'Filtres')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Item', 'Article')}</label>
              <select
                value={filters.itemId}
                onChange={(e) => setFilters({...filters, itemId: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{tr('All Items', 'Tous les articles')}</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Movement Type', 'Type de mouvement')}</label>
              <select
                value={filters.movementType}
                onChange={(e) => setFilters({...filters, movementType: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{tr('All Types', 'Tous les types')}</option>
                <option value="in">{tr('Stock In', 'Entrée de stock')}</option>
                <option value="out">{tr('Stock Out', 'Sortie de stock')}</option>
                <option value="adjustment_in">{tr('Adjustment In', "Ajustement d'entrée")}</option>
                <option value="adjustment_out">{tr('Adjustment Out', 'Ajustement de sortie')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tr('From Date', 'Date de début')}</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tr('To Date', 'Date de fin')}</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={tr('Search movements...', 'Rechercher des mouvements...')}
            value={filters.searchTerm}
            onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className={`flex items-center gap-2 px-4 py-2 ${primaryActionButtonClass}`}
        >
          <Plus className="w-4 h-4" />
          {tr('Add Movement', 'Ajouter un mouvement')}
        </button>
      </div>

      {/* Movements List */}
      <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{tr('Recent Movements', 'Mouvements récents')}</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {movements.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">{tr('No stock movements found', 'Aucun mouvement de stock trouvé')}</p>
            </div>
          ) : (
            movements.map((movement) => (
              <div key={movement.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${getMovementColor(movement.movement_type)}`}>
                      {getMovementIcon(movement.movement_type)}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {movement.item?.name || tr('Unknown Item', 'Article inconnu')}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {tr(
                          movement.movement_type.replace('_', ' ').toUpperCase(),
                          ({
                            in: 'ENTRÉE DE STOCK',
                            out: 'SORTIE DE STOCK',
                            adjustment_in: "AJUSTEMENT D'ENTRÉE",
                            adjustment_out: 'AJUSTEMENT DE SORTIE'
                          }[movement.movement_type] || movement.movement_type.replace('_', ' ').toUpperCase())
                        )} • {movement.quantity} {formatUnitLabel(movement.item?.unit)}
                      </p>
                      {movement.reference && (
                        <p className="text-xs text-gray-400">{tr('Ref:', 'Réf. :')} {movement.reference}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(movement.movement_date || movement.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(movement.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                {movement.notes && (
                  <div className="mt-3 pl-12">
                    <p className="text-sm text-gray-600">{formatMovementNote(movement)}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-[2rem] bg-white shadow-xl">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {formData.movement_type === 'out' ? tr('Issue Items', 'Sortir des articles') : tr('Add Stock Movement', 'Ajouter un mouvement de stock')}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Item', 'Article')} *</label>
                <select
                  value={formData.item_id}
                  onChange={(e) => setFormData({...formData, item_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">{tr('Select Item', "Sélectionner l'article")}</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>{item.name} • {item.stock_on_hand} {formatUnitLabel(item.unit)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Movement Type', 'Type de mouvement')} *</label>
                <select
                  value={formData.movement_type}
                  onChange={(e) => setFormData({...formData, movement_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="in">{tr('Stock In', 'Entrée de stock')}</option>
                  <option value="out">{tr('Stock Out', 'Sortie de stock')}</option>
                  <option value="adjustment_in">{tr('Adjustment In', "Ajustement d'entrée")}</option>
                  <option value="adjustment_out">{tr('Adjustment Out', 'Ajustement de sortie')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Quantity', 'Quantité')} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Movement Date', 'Date du mouvement')} *</label>
                <input
                  type="date"
                  value={formData.movement_date}
                  onChange={(e) => setFormData({...formData, movement_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Reference', 'Référence')}</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({...formData, reference: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={tr('Purchase order, maintenance ticket, etc.', "Bon de commande, ticket de maintenance, etc.")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Notes', 'Notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={tr('Additional notes about this movement...', 'Notes supplémentaires sur ce mouvement...')}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 ${softActionButtonClass}`}
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 ${primaryActionButtonClass}`}
                >
                  {formData.movement_type === 'out'
                    ? tr('Issue Items', 'Sortir des articles')
                    : tr('Add Movement', 'Ajouter un mouvement')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockMovements;
