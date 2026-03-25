import React from 'react';
import { X, Package, Tag, DollarSign, TrendingUp, Calendar, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';

const ItemDetailsModal = ({ item, isOpen, onClose, formatCurrency }) => {
  if (!isOpen || !item) return null;

  const sellingPrice = item.price_mad || 0;
  const costPrice = item.cost_mad || 0;
  
  const profitMargin = sellingPrice && costPrice 
    ? (((sellingPrice - costPrice) / sellingPrice) * 100).toFixed(1)
    : 'N/A';

  const stockStatus = () => {
    const stock = item.stock_on_hand || 0;
    const reorderLevel = item.reorder_level || 0;
    
    if (stock === 0) {
      return { status: 'Out of Stock', color: 'text-red-600 bg-red-50', icon: AlertTriangle };
    } else if (stock <= reorderLevel && reorderLevel > 0) {
      return { status: 'Low Stock', color: 'text-yellow-600 bg-yellow-50', icon: AlertTriangle };
    } else {
      return { status: 'In Stock', color: 'text-green-600 bg-green-50', icon: Package };
    }
  };

  const status = stockStatus();
  const StatusIcon = status.icon;
  const categoryVisual = getInventoryCategoryVisual(item.category);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{item.name}</h2>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryVisual.classes}`}>
              <span>{categoryVisual.emoji}</span>
              <span>{item.category || categoryVisual.label}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Item Image */}
          {item.image_url && (
            <div className="w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <ImageIcon className="w-5 h-5 mr-2" />
                Item Image
              </h3>
              <div className="rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center h-64">
                <img 
                  src={item.image_url} 
                  alt={item.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    e.target.parentElement.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400"><ImageIcon class="w-12 h-12" /><span class="ml-2">Image not available</span></div>';
                  }}
                />
              </div>
              {item.image_uploaded_at && (
                <p className="text-xs text-gray-500 mt-2">
                  Uploaded: {new Date(item.image_uploaded_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700">{item.description}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Basic Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">SKU:</span>
                    <span className="font-medium">{item.sku || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Unit:</span>
                    <span className="font-medium">{item.unit || 'piece'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color} flex items-center`}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {status.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.active 
                        ? 'text-green-600 bg-green-50' 
                        : 'text-red-600 bg-red-50'
                    }`}>
                      {item.active ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Stock Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock on Hand:</span>
                    <span className="font-medium">{item.stock_on_hand || 0} {item.unit || 'piece'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Reorder Level:</span>
                    <span className="font-medium">{item.reorder_level || 0} {item.unit || 'piece'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Max Stock Level:</span>
                    <span className="font-medium">{item.max_stock_level || 'N/A'} {item.unit || 'piece'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              Pricing Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 mb-1">Selling Price</div>
                <div className="text-xl font-bold text-blue-800">
                  {formatCurrency(sellingPrice)}
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-orange-600 mb-1">Cost Price</div>
                <div className="text-xl font-bold text-orange-800">
                  {formatCurrency(costPrice)}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600 mb-1">Profit Margin</div>
                <div className="text-xl font-bold text-green-800">
                  {profitMargin !== 'N/A' ? `${profitMargin}%` : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Value */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Inventory Value
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600 mb-1">Total Cost Value</div>
                <div className="text-xl font-bold text-purple-800">
                  {formatCurrency((item.stock_on_hand || 0) * costPrice)}
                </div>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg">
                <div className="text-sm text-indigo-600 mb-1">Total Selling Value</div>
                <div className="text-xl font-bold text-indigo-800">
                  {formatCurrency((item.stock_on_hand || 0) * sellingPrice)}
                </div>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              Timestamps
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="font-medium">
                    {item.created_at 
                      ? new Date(item.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'N/A'
                    }
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Updated:</span>
                  <span className="font-medium">
                    {item.updated_at 
                      ? new Date(item.updated_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'N/A'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stock Alert */}
          {status.status === 'Low Stock' || status.status === 'Out of Stock' ? (
            <div className={`p-4 rounded-lg border-l-4 ${
              status.status === 'Out of Stock' 
                ? 'bg-red-50 border-red-400' 
                : 'bg-yellow-50 border-yellow-400'
            }`}>
              <div className="flex items-center">
                <AlertTriangle className={`w-5 h-5 mr-2 ${
                  status.status === 'Out of Stock' ? 'text-red-600' : 'text-yellow-600'
                }`} />
                <div>
                  <h4 className={`font-medium ${
                    status.status === 'Out of Stock' ? 'text-red-800' : 'text-yellow-800'
                  }`}>
                    {status.status === 'Out of Stock' ? 'Item Out of Stock' : 'Low Stock Alert'}
                  </h4>
                  <p className={`text-sm ${
                    status.status === 'Out of Stock' ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {status.status === 'Out of Stock' 
                      ? 'This item is currently out of stock. Consider restocking immediately.'
                      : `Stock level is below the reorder point of ${item.reorder_level || 0} ${item.unit || 'piece'}. Consider restocking soon.`
                    }
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailsModal;
