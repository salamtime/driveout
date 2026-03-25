import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Calendar, Package, TrendingUp, TrendingDown } from 'lucide-react';
import inventoryService from '../../services/InventoryService';

const StockMovements = ({ initialParams, action, type }) => {
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
        quantity: parseInt(formData.quantity),
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
      alert('Failed to create stock movement');
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

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Stock Movements</h1>
        <p className="text-gray-600 mt-1">Track and manage inventory stock movements</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
              <select
                value={filters.itemId}
                onChange={(e) => setFilters({...filters, itemId: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Items</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Movement Type</label>
              <select
                value={filters.movementType}
                onChange={(e) => setFilters({...filters, movementType: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Types</option>
                <option value="in">Stock In</option>
                <option value="out">Stock Out</option>
                <option value="adjustment_in">Adjustment In</option>
                <option value="adjustment_out">Adjustment Out</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
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
            placeholder="Search movements..."
            value={filters.searchTerm}
            onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Movement
        </button>
      </div>

      {/* Movements List */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Movements</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {movements.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No stock movements found</p>
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
                        {movement.item?.name || 'Unknown Item'}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {movement.movement_type.replace('_', ' ').toUpperCase()} • {movement.quantity} units
                      </p>
                      {movement.reference && (
                        <p className="text-xs text-gray-400">Ref: {movement.reference}</p>
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
                    <p className="text-sm text-gray-600">{movement.notes}</p>
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {formData.movement_type === 'out' ? 'Issue Items' : 'Add Stock Movement'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                <select
                  value={formData.item_id}
                  onChange={(e) => setFormData({...formData, item_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Item</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Movement Type *</label>
                <select
                  value={formData.movement_type}
                  onChange={(e) => setFormData({...formData, movement_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="in">Stock In</option>
                  <option value="out">Stock Out</option>
                  <option value="adjustment_in">Adjustment In</option>
                  <option value="adjustment_out">Adjustment Out</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Movement Date *</label>
                <input
                  type="date"
                  value={formData.movement_date}
                  onChange={(e) => setFormData({...formData, movement_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({...formData, reference: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Purchase order, maintenance ticket, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Additional notes about this movement..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {formData.movement_type === 'out' ? 'Issue Items' : 'Add Movement'}
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
