import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import InventoryService from '../../services/InventoryService';
import ItemDetailsModal from './ItemDetailsModal';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';
import {
  Package, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  AlertTriangle,
  Eye,
  Download,
  Upload,
  RefreshCw,
  Image as ImageIcon,
  X
} from 'lucide-react';

const INVENTORY_CATEGORY_OPTIONS = [
  'engine',
  'transmission',
  'brake',
  'tire',
  'fluid',
  'filter',
  'suspension',
  'electrical',
  'accessory',
  'safety',
];

const normalizeInventoryCategory = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('transmission') || normalized.includes('cvt') || normalized.includes('clutch')) return 'transmission';
  if (normalized.includes('engine')) return 'engine';
  if (normalized.includes('brake')) return 'brake';
  if (normalized.includes('tire')) return 'tire';
  if (normalized.includes('fluid')) return 'fluid';
  if (normalized.includes('filter')) return 'filter';
  if (normalized.includes('suspension')) return 'suspension';
  if (normalized.includes('electrical')) return 'electrical';
  if (normalized.includes('accessor')) return 'accessory';
  if (normalized.includes('safety')) return 'safety';
  return normalized;
};

const formatInventoryCategoryLabel = (value = '') => {
  const normalized = normalizeInventoryCategory(value);
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

/**
 * ItemsManagement - Enhanced inventory items management with image upload
 * 
 * Features:
 * - Complete CRUD operations
 * - Image upload functionality
 * - Advanced filtering and search
 * - View item details with history and usage tracking
 * - Stock level indicators
 * - Bulk operations
 */
const ItemsManagement = ({ initialParams, action }) => {
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter and search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Image upload states
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    description: '',
    unit: 'piece',
    stock_on_hand: '',
    reorder_level: '',
    max_stock_level: '',
    price_mad: '',
    cost_mad: '',
    active: true
  });

  const allCategoryOptions = Array.from(new Set([
    ...INVENTORY_CATEGORY_OPTIONS,
    ...categories.map(normalizeInventoryCategory),
  ]))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));

  useEffect(() => {
    loadItems();
    loadCategories();
  }, []);

  useEffect(() => {
    const requestedAction = action || initialParams?.action;
    if (requestedAction === 'create') {
      handleAddItem();
    }
  }, [action, initialParams]);

  useEffect(() => {
    applyFilters();
  }, [items, searchTerm, selectedCategory, stockFilter, activeFilter]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const itemsData = await InventoryService.getItems();
      setItems(itemsData);
    } catch (err) {
      console.error('Error loading items:', err);
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const categoriesData = await InventoryService.getCategories();
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error loading categories:', err);
      setCategories([]);
    }
  };

  const applyFilters = () => {
    let filtered = [...items];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(term) ||
        (item.sku && item.sku.toLowerCase().includes(term)) ||
        (item.description && item.description.toLowerCase().includes(term)) ||
        normalizeInventoryCategory(item.category).includes(term)
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(item => normalizeInventoryCategory(item.category) === selectedCategory);
    }

    if (stockFilter === 'low_stock') {
      filtered = filtered.filter(item => 
        (item.stock_on_hand || 0) <= (item.reorder_level || 0) && (item.stock_on_hand || 0) > 0
      );
    } else if (stockFilter === 'out_of_stock') {
      filtered = filtered.filter(item => (item.stock_on_hand || 0) === 0);
    }

    if (activeFilter === 'active') {
      filtered = filtered.filter(item => item.active);
    } else if (activeFilter === 'inactive') {
      filtered = filtered.filter(item => !item.active);
    }

    setFilteredItems(filtered);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      category: '',
      description: '',
      unit: 'piece',
      stock_on_hand: '',
      reorder_level: '',
      max_stock_level: '',
      price_mad: '',
      cost_mad: '',
      active: true
    });
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : name === 'category' ? normalizeInventoryCategory(value) : value
    }));
  };

  // Handle image file selection
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size exceeds 5MB limit.');
      return;
    }

    setImageFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    setError(null);
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const sanitizeFormData = (data) => {
    const sanitized = { ...data };
    
    const numericFields = ['stock_on_hand', 'reorder_level', 'max_stock_level', 'price_mad', 'cost_mad'];
    
    numericFields.forEach(field => {
      if (sanitized[field] === '' || sanitized[field] === null || sanitized[field] === undefined) {
        sanitized[field] = null;
      } else {
        const numValue = parseFloat(sanitized[field]);
        if (isNaN(numValue)) {
          sanitized[field] = null;
        } else {
          sanitized[field] = numValue;
        }
      }
    });
    
    return sanitized;
  };

  const handleAddItem = () => {
    resetForm();
    setSelectedItem(null);
    setShowAddModal(true);
  };

  const handleEditItem = (item) => {
    setFormData({
      name: item.name || '',
      sku: item.sku || '',
      category: normalizeInventoryCategory(item.category) || '',
      description: item.description || '',
      unit: item.unit || 'piece',
      stock_on_hand: item.stock_on_hand?.toString() || '',
      reorder_level: item.reorder_level?.toString() || '',
      max_stock_level: item.max_stock_level?.toString() || '',
      price_mad: item.price_mad?.toString() || '',
      cost_mad: item.cost_mad?.toString() || '',
      active: item.active !== false
    });
    
    // Set existing image preview if available
    if (item.image_url) {
      setImagePreview(item.image_url);
    }
    
    setSelectedItem(item);
    setShowEditModal(true);
  };

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"? This will also delete its image.`)) {
      return;
    }

    try {
      setLoading(true);
      await InventoryService.deleteItem(item.id);
      await loadItems();
    } catch (err) {
      console.error('Error deleting item:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setUploadingImage(!!imageFile);
      setError(null);

      const sanitizedData = sanitizeFormData(formData);
      
      // Add image file to data if present
      if (imageFile) {
        sanitizedData.imageFile = imageFile;
      }

      console.log('Submitting item data:', sanitizedData);

      if (selectedItem) {
        await InventoryService.updateItem(selectedItem.id, sanitizedData);
      } else {
        await InventoryService.createItem(sanitizedData);
      }

      await loadItems();
      await loadCategories();
      setShowAddModal(false);
      setShowEditModal(false);
      resetForm();
    } catch (err) {
      console.error('Error saving item:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setUploadingImage(false);
    }
  };

  const getStockStatus = (item) => {
    const stock = item.stock_on_hand || 0;
    const reorderLevel = item.reorder_level || 0;
    
    if (stock === 0) {
      return { status: 'Out of Stock', color: 'text-red-600 bg-red-50', icon: AlertTriangle };
    } else if (stock <= reorderLevel) {
      return { status: 'Low Stock', color: 'text-yellow-600 bg-yellow-50', icon: AlertTriangle };
    } else {
      return { status: 'In Stock', color: 'text-green-600 bg-green-50', icon: Package };
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Items Management</h1>
          <p className="text-gray-600 mt-1">Manage your inventory items and stock levels</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => loadItems()}
            variant="outline"
            size="sm"
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleAddItem}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Categories</option>
              {allCategoryOptions.map(category => (
                <option key={category} value={category}>{formatInventoryCategoryLabel(category)}</option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Stock Levels</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Items</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <Button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('');
                setStockFilter('all');
                setActiveFilter('all');
              }}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Items List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Items ({filteredItems.length})</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Import
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading items...</span>
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || selectedCategory || stockFilter !== 'all' || activeFilter !== 'all'
                  ? 'Try adjusting your filters or search terms.'
                  : 'Get started by adding your first inventory item.'
                }
              </p>
              {!searchTerm && !selectedCategory && stockFilter === 'all' && activeFilter === 'all' && (
                <Button onClick={handleAddItem} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add First Item
                </Button>
              )}
            </div>
          )}

          {!loading && filteredItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map(item => {
                const stockStatus = getStockStatus(item);
                const categoryVisual = getInventoryCategoryVisual(item.category);
                return (
                  <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    {/* Item Image */}
                    {item.image_url && (
                      <div className="mb-3 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center h-32">
                        <img 
                          src={item.image_url} 
                          alt={item.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Item Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">{item.name}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryVisual.classes}`}>
                            <span>{categoryVisual.emoji}</span>
                            <span>{formatInventoryCategoryLabel(item.category) || categoryVisual.label}</span>
                          </span>
                        </div>
                        {item.sku && (
                          <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-1">
                        <stockStatus.icon className={`w-4 h-4 ${stockStatus.color.split(' ')[0]}`} />
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${stockStatus.color}`}>
                          {stockStatus.status}
                        </span>
                      </div>
                    </div>

                    {/* Stock Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Stock on Hand:</span>
                        <span className="font-medium">{item.stock_on_hand || 0} {item.unit}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Reorder Level:</span>
                        <span className="font-medium">{item.reorder_level || 0} {item.unit}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-medium">{formatCurrency(item.price_mad)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cost:</span>
                        <span className="font-medium">{formatCurrency(item.cost_mad)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => handleViewDetails(item)}
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Details
                        </Button>
                        <Button
                          onClick={() => handleEditItem(item)}
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" />
                          Edit
                        </Button>
                      </div>
                      <Button
                        onClick={() => handleDeleteItem(item)}
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>

                    {!item.active && (
                      <div className="mt-2 text-center">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                          Inactive
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Item Details Modal */}
      <ItemDetailsModal
        item={selectedItem}
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedItem(null);
        }}
        formatCurrency={formatCurrency}
      />

      {/* Add/Edit Item Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold">
                {selectedItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  resetForm();
                }}
              >
                ×
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Image Upload Section */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Image (Optional)
                </label>
                
                {imagePreview ? (
                  <div className="relative">
                    <div className="w-full h-48 bg-gray-100 rounded-md flex items-center justify-center overflow-hidden">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="mt-2">
                      <label
                        htmlFor="image-upload"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Image
                      </label>
                      <input
                        id="image-upload"
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      JPG, PNG, GIF, WebP up to 5MB
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category *
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select category</option>
                    {allCategoryOptions.map(category => (
                      <option key={category} value={category}>{formatInventoryCategoryLabel(category)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit *
                  </label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="piece">Piece</option>
                    <option value="liter">Liter</option>
                    <option value="kilogram">Kilogram</option>
                    <option value="meter">Meter</option>
                    <option value="set">Set</option>
                    <option value="box">Box</option>
                    <option value="pack">Pack</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock on Hand
                  </label>
                  <input
                    type="number"
                    name="stock_on_hand"
                    value={formData.stock_on_hand}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                    step="0.01"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reorder Level
                  </label>
                  <input
                    type="number"
                    name="reorder_level"
                    value={formData.reorder_level}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                    step="0.01"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Stock Level
                  </label>
                  <input
                    type="number"
                    name="max_stock_level"
                    value={formData.max_stock_level}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                    step="0.01"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selling Price (MAD)
                  </label>
                  <input
                    type="number"
                    name="price_mad"
                    value={formData.price_mad}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Price (MAD)
                  </label>
                  <input
                    type="number"
                    name="cost_mad"
                    value={formData.cost_mad}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Active
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {uploadingImage && <span>Uploading...</span>}
                  {!uploadingImage && (selectedItem ? 'Update Item' : 'Create Item')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemsManagement;
