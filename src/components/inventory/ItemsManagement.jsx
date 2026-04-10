import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import InventoryService from '../../services/InventoryService';
import ItemDetailsModal from './ItemDetailsModal';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';
import {
  INVENTORY_LABELS,
  formatInventoryLabel,
  normalizeInventoryLabels
} from '../../config/maintenanceInventoryMapping';
import {
  Package, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  AlertTriangle,
  Download,
  Upload,
  RefreshCw,
  Image as ImageIcon,
  X
} from 'lucide-react';

const INVENTORY_CATEGORY_OPTIONS = [
  'consumable',
  'part',
  'equipment',
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
  if (normalized.includes('consumable')) return 'consumable';
  if (normalized.includes('equipment')) return 'equipment';
  if (normalized === 'part' || normalized.includes('parts')) return 'part';
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

const getAvailableStockForItem = (item) => (
  item?.available_stock !== undefined && item?.available_stock !== null
    ? item.available_stock
    : (item?.stock_on_hand || 0)
);

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
  const { i18n } = useTranslation();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const primaryActionButtonClass = 'rounded-2xl bg-violet-600 text-white shadow-sm hover:bg-violet-700';
  const softActionButtonClass = 'rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900';
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
    labels: [],
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
      const operationalItems = await InventoryService.enrichItemsWithOperationalStock(itemsData);
      setItems(operationalItems);
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
        normalizeInventoryCategory(item.category).includes(term) ||
        normalizeInventoryLabels(item.labels || []).some((label) => formatInventoryLabel(label).toLowerCase().includes(term) || label.includes(term))
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(item => normalizeInventoryCategory(item.category) === selectedCategory);
    }

    if (stockFilter === 'low_stock') {
      filtered = filtered.filter(item => 
        getAvailableStockForItem(item) <= (item.reorder_level || 0) && getAvailableStockForItem(item) > 0
      );
    } else if (stockFilter === 'out_of_stock') {
      filtered = filtered.filter(item => getAvailableStockForItem(item) === 0);
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
      labels: [],
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

  const toggleFormLabel = (label) => {
    const normalizedLabel = normalizeInventoryLabels([label])[0];
    if (!normalizedLabel) return;

    setFormData((prev) => {
      const labels = normalizeInventoryLabels(prev.labels || []);
      const nextLabels = labels.includes(normalizedLabel)
        ? labels.filter((item) => item !== normalizedLabel)
        : [...labels, normalizedLabel];

      return {
        ...prev,
        labels: nextLabels
      };
    });
  };

  const handleCustomLabelsChange = (event) => {
    setFormData((prev) => ({
      ...prev,
      labels: normalizeInventoryLabels(event.target.value)
    }));
  };

  // Handle image file selection
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(tr('Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.', "Type de fichier invalide. Seuls JPG, PNG, GIF et WebP sont autorisés."));
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(tr('File size exceeds 5MB limit.', 'La taille du fichier dépasse la limite de 5 Mo.'));
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

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(tr(`Are you sure you want to delete "${item.name}"? This will also delete its image.`, `Voulez-vous vraiment supprimer "${item.name}" ? Son image sera également supprimée.`))) {
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

      await InventoryService.createItem(sanitizedData);

      await loadItems();
      await loadCategories();
      setShowAddModal(false);
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
    const stock = getAvailableStockForItem(item);
    const reorderLevel = item.reorder_level || 0;
    
    if (stock === 0) {
      return { status: tr('Out of Stock', 'Rupture de stock'), color: 'text-red-600 bg-red-50', icon: AlertTriangle };
    } else if (stock <= reorderLevel) {
      return { status: tr('Low Stock', 'Stock faible'), color: 'text-yellow-600 bg-yellow-50', icon: AlertTriangle };
    } else {
      return { status: tr('In Stock', 'En stock'), color: 'text-green-600 bg-green-50', icon: Package };
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatQuantity = (value) => {
    const number = parseFloat(value || 0) || 0;
    return Number.isInteger(number) ? number.toString() : number.toFixed(2).replace(/\.?0+$/, '');
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{tr('Items Management', 'Gestion des articles')}</h1>
          <p className="text-gray-600 mt-1">{tr('Manage your inventory items and stock levels', "Gérez vos articles d'inventaire et vos niveaux de stock")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => loadItems()}
            variant="outline"
            size="sm"
            disabled={loading}
            className={`flex items-center gap-2 ${softActionButtonClass}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {tr('Refresh', 'Actualiser')}
          </Button>
          <Button
            onClick={handleAddItem}
            className={`flex items-center gap-2 ${primaryActionButtonClass}`}
          >
            <Plus className="w-4 h-4" />
            {tr('Add Item', 'Ajouter un article')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={tr('Search items...', 'Rechercher des articles...')}
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
              <option value="">{tr('All Categories', 'Toutes les catégories')}</option>
              {allCategoryOptions.map(category => (
                <option key={category} value={category}>{formatInventoryCategoryLabel(category)}</option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{tr('All Stock Levels', 'Tous les niveaux de stock')}</option>
              <option value="low_stock">{tr('Low Stock', 'Stock faible')}</option>
              <option value="out_of_stock">{tr('Out of Stock', 'Rupture de stock')}</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{tr('All Items', 'Tous les articles')}</option>
              <option value="active">{tr('Active Only', 'Actifs uniquement')}</option>
              <option value="inactive">{tr('Inactive Only', 'Inactifs uniquement')}</option>
            </select>

            <Button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('');
                setStockFilter('all');
                setActiveFilter('all');
              }}
              variant="outline"
              className={`flex items-center gap-2 ${softActionButtonClass}`}
            >
              <Filter className="w-4 h-4" />
              {tr('Clear', 'Effacer')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Items List */}
      <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
        <CardHeader className="rounded-t-[2rem] border-b border-slate-100 bg-slate-50/70">
          <CardTitle className="flex items-center justify-between">
            <span>{tr('Items', 'Articles')} ({filteredItems.length})</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className={`flex items-center gap-2 ${softActionButtonClass}`}>
                <Download className="w-4 h-4" />
                {tr('Export', 'Exporter')}
              </Button>
              <Button variant="outline" size="sm" className={`flex items-center gap-2 ${softActionButtonClass}`}>
                <Upload className="w-4 h-4" />
                {tr('Import', 'Importer')}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">{tr('Loading items...', 'Chargement des articles...')}</span>
            </div>
          )}

          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{tr('No items found', 'Aucun article trouvé')}</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || selectedCategory || stockFilter !== 'all' || activeFilter !== 'all'
                  ? tr('Try adjusting your filters or search terms.', 'Essayez de modifier vos filtres ou vos termes de recherche.')
                  : tr('Get started by adding your first inventory item.', "Commencez par ajouter votre premier article d'inventaire.")
                }
              </p>
              {!searchTerm && !selectedCategory && stockFilter === 'all' && activeFilter === 'all' && (
                <Button onClick={handleAddItem} className={`flex items-center gap-2 ${primaryActionButtonClass}`}>
                  <Plus className="w-4 h-4" />
                  {tr('Add First Item', 'Ajouter le premier article')}
                </Button>
              )}
            </div>
          )}

          {!loading && filteredItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map(item => {
                const stockStatus = getStockStatus(item);
                const categoryVisual = getInventoryCategoryVisual(item.category);
                const currentStock = item.current_stock ?? item.stock_on_hand ?? 0;
                const reservedQuantity = item.reserved_quantity || 0;
                const availableStock = getAvailableStockForItem(item);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleViewDetails(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleViewDetails(item);
                      }
                    }}
                    className="cursor-pointer rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-200"
                  >
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
                        <span className="text-gray-600">{tr('Available:', 'Disponible :')}</span>
                        <span className="font-semibold text-emerald-700">{formatQuantity(availableStock)} {item.unit}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tr('Current Stock:', 'Stock actuel :')}</span>
                        <span className="font-medium">{formatQuantity(currentStock)} {item.unit}</span>
                      </div>
                      {reservedQuantity > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tr('Allocated:', 'Alloué :')}</span>
                        <span className="font-medium text-amber-700">{formatQuantity(reservedQuantity)} {item.unit}</span>
                      </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tr('Reorder Threshold:', 'Seuil de réapprovisionnement :')}</span>
                        <span className="font-medium">{item.reorder_level || 0} {item.unit}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-medium">{formatCurrency(item.price_mad)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tr('Cost per Unit:', 'Coût par unité :')}</span>
                        <span className="font-medium">{formatCurrency(item.cost_mad)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                      <span className="text-xs font-medium text-slate-500">
                        {tr('Tap card to view or edit', 'Touchez la carte pour voir ou modifier')}
                      </span>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteItem(item);
                        }}
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
        onItemSaved={async (updatedItem) => {
          const [enrichedItem] = await InventoryService.enrichItemsWithOperationalStock([updatedItem]);
          setSelectedItem(enrichedItem || updatedItem);
          await loadItems();
          await loadCategories();
        }}
      />

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold">
                {tr('Add New Item', 'Ajouter un nouvel article')}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddModal(false);
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
                        {tr('Upload Image', "Téléverser l'image")}
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
                      {tr('JPG, PNG, GIF, WebP up to 5MB', "JPG, PNG, GIF, WebP jusqu'à 5 Mo")}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tr('Item Name *', "Nom de l'article *")}
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
                    {tr('Item Type / Category *', "Type d'article / catégorie *")}
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">{tr('Select item type', "Sélectionnez le type d'article")}</option>
                    {allCategoryOptions.map(category => (
                      <option key={category} value={category}>{formatInventoryCategoryLabel(category)}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {tr('Smart Labels', 'Etiquettes intelligentes')}
                  </label>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {INVENTORY_LABELS.map((label) => {
                      const selected = normalizeInventoryLabels(formData.labels || []).includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleFormLabel(label)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {formatInventoryLabel(label)}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={normalizeInventoryLabels(formData.labels || []).join(', ')}
                    onChange={handleCustomLabelsChange}
                    placeholder={tr('Optional custom labels, separated by commas', 'Etiquettes personnalisees optionnelles, separees par des virgules')}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tr('Unit *', 'Unité *')}
                  </label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="piece">{tr('Piece', 'Pièce')}</option>
                    <option value="liter">{tr('Liter', 'Litre')}</option>
                    <option value="box">{tr('Box', 'Boîte')}</option>
                    <option value="pack">{tr('Pack', 'Paquet')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tr('Current Stock', 'Stock actuel')}
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
                    {tr('Reorder Threshold', 'Seuil de réapprovisionnement')}
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
                    {tr('Max Capacity', 'Capacité maximale')}
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
                    {tr('Selling Price (MAD)', 'Prix de vente (MAD)')}
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
                    {tr('Cost per Unit (MAD)', 'Coût par unité (MAD)')}
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
                  {tr('Description', 'Description')}
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
                  {tr('Active', 'Actif')}
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {uploadingImage && <span>{tr('Uploading...', 'Téléversement...')}</span>}
                  {!uploadingImage && tr('Create Item', "Créer l'article")}
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
