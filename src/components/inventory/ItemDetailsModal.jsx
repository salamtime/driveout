import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, Package, DollarSign, TrendingUp, Calendar, AlertTriangle, Image as ImageIcon, Upload, Eye, Download, FileText, ChevronDown, Wrench, ExternalLink } from 'lucide-react';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';
import InventoryService from '../../services/InventoryService';
import {
  INVENTORY_LABELS,
  formatInventoryLabel,
  normalizeInventoryLabels
} from '../../config/maintenanceInventoryMapping';
import { formatMaintenanceReference } from '../../utils/maintenanceReference';

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

const formatCategoryLabel = (value = '') => {
  const normalized = String(value || '').trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
};

const ItemDetailsModal = ({ item, isOpen, onClose, formatCurrency, onItemSaved }) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const fileInputRef = useRef(null);
  const itemImageInputRef = useRef(null);
  const [stockSnapshot, setStockSnapshot] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentType, setDocumentType] = useState('invoice');
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadOperationalData = async () => {
      if (!isOpen || !item?.id) return;
      const [snapshot, itemDocuments] = await Promise.all([
        InventoryService.getItemOperationalStock(item.id),
        InventoryService.getItemDocuments(item.id)
      ]);
      if (!cancelled) {
        setStockSnapshot(snapshot);
        setDocuments(itemDocuments);
      }
    };

    loadOperationalData();
    return () => {
      cancelled = true;
    };
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (!item) return;
    setIsEditing(false);
    setEditImageFile(null);
    setEditImagePreview(item.image_url || '');
    setEditForm({
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || '',
      description: item.description || '',
      unit: item.unit || 'piece',
      stock_on_hand: item.stock_on_hand?.toString() || '',
      reorder_level: item.reorder_level?.toString() || '',
      max_stock_level: item.max_stock_level?.toString() || '',
      price_mad: item.price_mad?.toString() || '',
      cost_mad: item.cost_mad?.toString() || '',
      labels: normalizeInventoryLabels(item.labels || []),
      active: item.active !== false
    });
  }, [item?.id]);

  if (!isOpen || !item) return null;

  const sellingPrice = item.price_mad || 0;
  const costPrice = item.cost_mad || 0;
  const unitLabel = item.unit || tr('piece', 'pièce');
  const currentStock = stockSnapshot?.currentStock ?? (parseFloat(item.stock_on_hand || 0) || 0);
  const reservedQuantity = stockSnapshot?.reservedQuantity || 0;
  const consumedQuantity = stockSnapshot?.consumedQuantity || 0;
  const availableStock = stockSnapshot?.availableStock ?? Math.max(0, currentStock - reservedQuantity);
  
  const profitMargin = sellingPrice && costPrice 
    ? (((sellingPrice - costPrice) / sellingPrice) * 100).toFixed(1)
    : tr('N/A', 'N/D');

  const stockStatus = () => {
    const stock = availableStock;
    const reorderLevel = item.reorder_level || 0;
    
    if (stock === 0) {
      return { status: tr('Out of Stock', 'Rupture de stock'), color: 'text-red-600 bg-red-50', icon: AlertTriangle };
    } else if (stock <= reorderLevel && reorderLevel > 0) {
      return { status: tr('Low Stock', 'Stock faible'), color: 'text-yellow-600 bg-yellow-50', icon: AlertTriangle };
    } else {
      return { status: tr('In Stock', 'En stock'), color: 'text-green-600 bg-green-50', icon: Package };
    }
  };

  const status = stockStatus();
  const StatusIcon = status.icon;
  const categoryVisual = getInventoryCategoryVisual(item.category);
  const formatQuantity = (value) => {
    const number = parseFloat(value || 0) || 0;
    return Number.isInteger(number) ? number.toString() : number.toFixed(2).replace(/\.?0+$/, '');
  };
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${sizes[index]}`;
  };
  const isImageDocument = (doc) => String(doc?.type || '').startsWith('image/');
  const invoiceDocuments = documents.filter((doc) => doc.typeKey === 'invoice');
  const imageDocuments = documents.filter(isImageDocument);
  const otherDocuments = documents.filter((doc) => doc.typeKey !== 'invoice' && !isImageDocument(doc));
  const allocatedUsageLines = stockSnapshot?.reservedLines || [];
  const consumedUsageLines = stockSnapshot?.consumedLines || [];
  const hasUsageHistory = allocatedUsageLines.length > 0 || consumedUsageLines.length > 0;
  const formatUsageDate = (line) => {
    const dateValue = line?.maintenance?.completed_date || line?.maintenance?.service_date || line?.maintenance?.scheduled_date;
    if (!dateValue) return '';
    return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const openMaintenanceRecord = (maintenanceId) => {
    if (!maintenanceId) return;
    onClose?.();
    navigate(`/admin/maintenance/${maintenanceId}`);
  };
  const openVehicleProfile = (vehicleId) => {
    if (!vehicleId) return;
    onClose?.();
    navigate(`/admin/fleet/${vehicleId}`);
  };

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingDocument(true);
      const nextDocuments = await InventoryService.uploadItemDocument(file, item.id, documentType);
      setDocuments(nextDocuments);
      setDocumentsOpen(true);
    } catch (error) {
      console.error('Failed to upload inventory document:', error);
      alert(`${tr('Failed to upload document', 'Impossible de téléverser le document')}: ${error.message}`);
    } finally {
      setUploadingDocument(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderDocumentRow = (doc) => (
    <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{doc.name}</p>
        <p className="text-xs text-slate-500">
          {doc.typeKey === 'invoice' ? tr('Invoice', 'Facture') : isImageDocument(doc) ? tr('Image', 'Image') : tr('Document', 'Document')}
          {doc.size ? ` • ${formatFileSize(doc.size)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => setPreviewDocument(doc)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-violet-600" title={tr('View', 'Voir')}>
          <Eye className="h-4 w-4" />
        </button>
        <a href={doc.url} download={doc.name} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-emerald-600" title={tr('Download', 'Télécharger')}>
          <Download className="h-4 w-4" />
        </a>
      </div>
    </div>
  );

  const renderUsageLine = (line, mode = 'used') => {
    const maintenance = line?.maintenance || {};
    const vehicle = maintenance.vehicle || {};
    const maintenanceId = line?.maintenance_id || maintenance.id;
    const dateLabel = formatUsageDate(line);
    const statusLabel = String(maintenance.status || mode).replace(/_/g, ' ');
    const isAllocated = mode === 'allocated';

    return (
      <div key={`${mode}-${line.id || maintenanceId}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isAllocated ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {isAllocated ? tr('Allocated', 'Alloué') : tr('Used', 'Utilisé')} {formatQuantity(line.quantity)} {unitLabel}
              </span>
              <button
                type="button"
                onClick={() => openMaintenanceRecord(maintenanceId)}
                className="inline-flex items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:border-violet-300 hover:bg-violet-100"
              >
                {formatMaintenanceReference(maintenanceId)}
                <ExternalLink className="h-3 w-3" />
              </button>
              {vehicle.id && (
                <button
                  type="button"
                  onClick={() => openVehicleProfile(vehicle.id)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {vehicle.plate_number || vehicle.name || tr('Vehicle', 'Véhicule')}
                </button>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {[maintenance.maintenance_type || tr('Maintenance', 'Maintenance'), dateLabel, statusLabel].filter(Boolean).join(' • ')}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const handleEditInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const toggleEditLabel = (label) => {
    const normalizedLabel = normalizeInventoryLabels([label])[0];
    if (!normalizedLabel) return;

    setEditForm((prev) => {
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

  const handleEditLabelsInputChange = (event) => {
    setEditForm((prev) => ({
      ...prev,
      labels: normalizeInventoryLabels(event.target.value)
    }));
  };

  const handleEditImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setEditImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setEditImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const sanitizeEditForm = () => {
    const sanitized = { ...editForm };
    ['stock_on_hand', 'reorder_level', 'max_stock_level', 'price_mad', 'cost_mad'].forEach((field) => {
      if (sanitized[field] === '' || sanitized[field] === null || sanitized[field] === undefined) {
        sanitized[field] = null;
      } else {
        const parsedValue = parseFloat(sanitized[field]);
        sanitized[field] = Number.isNaN(parsedValue) ? null : parsedValue;
      }
    });
    sanitized.labels = normalizeInventoryLabels(sanitized.labels || []);
    if (editImageFile) sanitized.imageFile = editImageFile;
    return sanitized;
  };

  const handleSaveItem = async () => {
    try {
      setSavingItem(true);
      const updatedItem = await InventoryService.updateItem(item.id, sanitizeEditForm());
      setIsEditing(false);
      setEditImageFile(null);
      setEditImagePreview(updatedItem.image_url || '');
      const snapshot = await InventoryService.getItemOperationalStock(item.id);
      setStockSnapshot(snapshot);
      onItemSaved?.(updatedItem);
    } catch (error) {
      console.error('Failed to update inventory item:', error);
      alert(`${tr('Failed to save item', "Impossible d'enregistrer l'article")}: ${error.message}`);
    } finally {
      setSavingItem(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditImageFile(null);
    setEditImagePreview(item.image_url || '');
    setEditForm({
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || '',
      description: item.description || '',
      unit: item.unit || 'piece',
      stock_on_hand: item.stock_on_hand?.toString() || '',
      reorder_level: item.reorder_level?.toString() || '',
      max_stock_level: item.max_stock_level?.toString() || '',
      price_mad: item.price_mad?.toString() || '',
      cost_mad: item.cost_mad?.toString() || '',
      active: item.active !== false
    });
  };

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{isEditing ? editForm.name || item.name : item.name}</h2>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryVisual.classes}`}>
              <span>{categoryVisual.emoji}</span>
              <span>{isEditing ? editForm.category || categoryVisual.label : item.category || categoryVisual.label}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                {tr('Edit', 'Modifier')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isEditing && (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{tr('Edit item', "Modifier l'article")}</h3>
                  <p className="text-xs text-slate-500">{tr('Documents stay below in the same modal.', 'Les documents restent plus bas dans le même panneau.')}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">{tr('Edit mode', 'Mode édition')}</span>
              </div>

              <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {editImagePreview ? (
                    <img src={editImagePreview} alt={editForm.name || item.name} className="h-24 w-28 rounded-xl object-contain bg-slate-100" />
                  ) : (
                    <div className="flex h-24 w-28 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{tr('Item image', "Image de l'article")}</p>
                    <p className="text-xs text-slate-500">{tr('Optional image for faster recognition.', 'Image optionnelle pour reconnaissance rapide.')}</p>
                    <button
                      type="button"
                      onClick={() => itemImageInputRef.current?.click()}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {tr('Change image', "Changer l'image")}
                    </button>
                    <input
                      ref={itemImageInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleEditImageChange}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  {tr('Item Name', "Nom de l'article")}
                  <input name="name" value={editForm.name || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  SKU
                  <input name="sku" value={editForm.sku || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Item Type / Category', "Type d'article / catégorie")}
                  <select name="category" value={editForm.category || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="">{tr('Select item type', "Sélectionnez le type d'article")}</option>
                    {INVENTORY_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{formatCategoryLabel(category)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Unit', 'Unité')}
                  <select name="unit" value={editForm.unit || 'piece'} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="piece">{tr('Piece', 'Pièce')}</option>
                    <option value="liter">{tr('Liter', 'Litre')}</option>
                    <option value="box">{tr('Box', 'Boîte')}</option>
                    <option value="pack">{tr('Pack', 'Paquet')}</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  {tr('Smart Labels', 'Etiquettes intelligentes')}
                  <div className="mt-2 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                    {INVENTORY_LABELS.map((label) => {
                      const selected = normalizeInventoryLabels(editForm.labels || []).includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleEditLabel(label)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? 'border-violet-500 bg-violet-600 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {formatInventoryLabel(label)}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={normalizeInventoryLabels(editForm.labels || []).join(', ')}
                    onChange={handleEditLabelsInputChange}
                    placeholder={tr('Optional custom labels, separated by commas', 'Etiquettes personnalisees optionnelles, separees par des virgules')}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Current Stock', 'Stock actuel')}
                  <input type="number" step="0.01" min="0" name="stock_on_hand" value={editForm.stock_on_hand || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Reorder Threshold', 'Seuil de réapprovisionnement')}
                  <input type="number" step="0.01" min="0" name="reorder_level" value={editForm.reorder_level || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Max Capacity', 'Capacité maximale')}
                  <input type="number" step="0.01" min="0" name="max_stock_level" value={editForm.max_stock_level || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Cost per Unit (MAD)', 'Coût par unité (MAD)')}
                  <input type="number" step="0.01" min="0" name="cost_mad" value={editForm.cost_mad || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {tr('Selling Price (MAD)', 'Prix de vente (MAD)')}
                  <input type="number" step="0.01" min="0" name="price_mad" value={editForm.price_mad || ''} onChange={handleEditInputChange} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" name="active" checked={editForm.active !== false} onChange={handleEditInputChange} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
                  {tr('Active', 'Actif')}
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  {tr('Description', 'Description')}
                  <textarea name="description" value={editForm.description || ''} onChange={handleEditInputChange} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={handleCancelEdit} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {tr('Cancel', 'Annuler')}
                </button>
                <button type="button" onClick={handleSaveItem} disabled={savingItem} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {savingItem ? tr('Saving...', 'Enregistrement...') : tr('Save Changes', 'Enregistrer les modifications')}
                </button>
              </div>
            </div>
          )}

          {/* Item Image */}
          {!isEditing && item.image_url && (
            <div className="w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <ImageIcon className="w-5 h-5 mr-2" />
                {tr('Item Image', "Image de l'article")}
              </h3>
              <div className="rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center h-64">
                <img 
                  src={item.image_url} 
                  alt={item.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    e.target.parentElement.innerHTML = `<div class="flex items-center justify-center h-64 text-gray-400"><span class="ml-2">${tr('Image not available', 'Image indisponible')}</span></div>`;
                  }}
                />
              </div>
              {item.image_uploaded_at && (
                <p className="text-xs text-gray-500 mt-2">
                  {tr('Uploaded:', 'Téléversé :')} {new Date(item.image_uploaded_at).toLocaleDateString('en-US', {
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{tr('Description', 'Description')}</h3>
              <p className="text-gray-700">{item.description}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  {tr('Basic Information', 'Informations de base')}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">SKU:</span>
                    <span className="font-medium">{item.sku || tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Unit:', 'Unité :')}</span>
                    <span className="font-medium">{unitLabel}</span>
                  </div>
                  {normalizeInventoryLabels(item.labels || []).length > 0 && (
                    <div>
                      <span className="text-gray-600">{tr('Smart labels:', 'Etiquettes intelligentes :')}</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {normalizeInventoryLabels(item.labels || []).map((label) => (
                          <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            {formatInventoryLabel(label)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Status:', 'Statut :')}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color} flex items-center`}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {status.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Active:', 'Actif :')}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.active 
                        ? 'text-green-600 bg-green-50' 
                        : 'text-red-600 bg-red-50'
                    }`}>
                      {item.active ? tr('Yes', 'Oui') : tr('No', 'Non')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  {tr('Stock Information', 'Informations de stock')}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Current Stock:', 'Stock actuel :')}</span>
                    <span className="font-medium">{formatQuantity(currentStock)} {unitLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Allocated:', 'Alloué :')}</span>
                    <span className="font-medium text-amber-700">{formatQuantity(reservedQuantity)} {unitLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Available:', 'Disponible :')}</span>
                    <span className="font-medium text-emerald-700">{formatQuantity(availableStock)} {unitLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Used:', 'Utilisé :')}</span>
                    <span className="font-medium">{formatQuantity(consumedQuantity)} {unitLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Reorder Threshold:', 'Seuil de réapprovisionnement :')}</span>
                    <span className="font-medium">{item.reorder_level || 0} {unitLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Usage History */}
          {hasUsageHistory && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2 text-violet-600 shadow-sm">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {tr('Usage history', "Historique d'utilisation")}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {tr('Maintenance records linked to this inventory item.', "Fiches de maintenance liées à cet article.")}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {allocatedUsageLines.length + consumedUsageLines.length}
                </span>
              </div>
              <div className="space-y-3 border-t border-slate-200 px-4 py-4">
                {allocatedUsageLines.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">{tr('Allocated to maintenance', 'Alloué à la maintenance')}</p>
                      <span className="text-xs font-semibold text-amber-700">{formatQuantity(reservedQuantity)} {unitLabel}</span>
                    </div>
                    <div className="space-y-2">{allocatedUsageLines.map((line) => renderUsageLine(line, 'allocated'))}</div>
                  </div>
                )}
                {consumedUsageLines.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{tr('Consumed', 'Consommé')}</p>
                      <span className="text-xs font-semibold text-emerald-700">{formatQuantity(consumedQuantity)} {unitLabel}</span>
                    </div>
                    <div className="space-y-2">{consumedUsageLines.map((line) => renderUsageLine(line, 'used'))}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              {tr('Pricing Information', 'Informations tarifaires')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 mb-1">{tr('Selling Price', 'Prix de vente')}</div>
                <div className="text-xl font-bold text-blue-800">
                  {formatCurrency(sellingPrice)}
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-orange-600 mb-1">{tr('Cost per Unit', 'Coût par unité')}</div>
                <div className="text-xl font-bold text-orange-800">
                  {formatCurrency(costPrice)}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600 mb-1">{tr('Profit Margin', 'Marge')}</div>
                <div className="text-xl font-bold text-green-800">
                  {profitMargin !== tr('N/A', 'N/D') ? `${profitMargin}%` : tr('N/A', 'N/D')}
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Value */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              {tr('Inventory Value', "Valeur d'inventaire")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600 mb-1">{tr('Total Cost Value', 'Valeur totale au coût')}</div>
                <div className="text-xl font-bold text-purple-800">
                  {formatCurrency(currentStock * costPrice)}
                </div>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg">
                <div className="text-sm text-indigo-600 mb-1">{tr('Inventory value at selling price', 'Valeur inventaire au prix de vente')}</div>
                <div className="text-xl font-bold text-indigo-800">
                  {formatCurrency(currentStock * sellingPrice)}
                </div>
              </div>
            </div>
          </div>

          {/* Documents & Media */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setDocumentsOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white p-2 text-violet-600 shadow-sm">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{tr('Documents & Media', 'Documents et médias')}</h3>
                  <p className="text-xs text-slate-500">
                    {documents.length} {documents.length === 1 ? tr('file', 'fichier') : tr('files', 'fichiers')}
                  </p>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${documentsOpen ? 'rotate-180' : ''}`} />
            </button>

            {documentsOpen && (
              <div className="space-y-4 border-t border-slate-200 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <select
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="invoice">{tr('Invoice', 'Facture')}</option>
                    <option value="image">{tr('Image', 'Image')}</option>
                    <option value="document">{tr('Document', 'Document')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                    disabled={uploadingDocument}
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingDocument ? tr('Uploading...', 'Téléversement...') : tr('Upload Document', 'Téléverser document')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
                    onChange={handleDocumentUpload}
                  />
                </div>

                {imageDocuments.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Images', 'Images')}</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {imageDocuments.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setPreviewDocument(doc)}
                          className="h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
                        >
                          <img src={doc.url} alt={doc.name} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {invoiceDocuments.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Invoices', 'Factures')}</p>
                    <div className="max-h-44 space-y-2 overflow-y-auto">{invoiceDocuments.map(renderDocumentRow)}</div>
                  </div>
                )}

                {otherDocuments.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Other documents', 'Autres documents')}</p>
                    <div className="max-h-44 space-y-2 overflow-y-auto">{otherDocuments.map(renderDocumentRow)}</div>
                  </div>
                )}

                {documents.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    {tr('No documents linked to this inventory item yet.', "Aucun document lié à cet article d'inventaire.")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              {tr('Timestamps', 'Horodatages')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{tr('Created:', 'Créé :')}</span>
                  <span className="font-medium">
                    {item.created_at 
                      ? new Date(item.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : tr('N/A', 'N/D')
                    }
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{tr('Last Updated:', 'Dernière mise à jour :')}</span>
                  <span className="font-medium">
                    {item.updated_at 
                      ? new Date(item.updated_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : tr('N/A', 'N/D')
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stock Alert */}
          {status.status === tr('Low Stock', 'Stock faible') || status.status === tr('Out of Stock', 'Rupture de stock') ? (
            <div className={`p-4 rounded-lg border-l-4 ${
              status.status === tr('Out of Stock', 'Rupture de stock')
                ? 'bg-red-50 border-red-400' 
                : 'bg-yellow-50 border-yellow-400'
            }`}>
              <div className="flex items-center">
                <AlertTriangle className={`w-5 h-5 mr-2 ${
                  status.status === tr('Out of Stock', 'Rupture de stock') ? 'text-red-600' : 'text-yellow-600'
                }`} />
                <div>
                  <h4 className={`font-medium ${
                    status.status === tr('Out of Stock', 'Rupture de stock') ? 'text-red-800' : 'text-yellow-800'
                  }`}>
                    {status.status === tr('Out of Stock', 'Rupture de stock') ? tr('Item Out of Stock', 'Article en rupture de stock') : tr('Low Stock Alert', 'Alerte stock faible')}
                  </h4>
                  <p className={`text-sm ${
                    status.status === tr('Out of Stock', 'Rupture de stock') ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {status.status === tr('Out of Stock', 'Rupture de stock') 
                      ? tr('This item is currently out of stock. Consider restocking immediately.', "Cet article est actuellement en rupture de stock. Pensez à le réapprovisionner immédiatement.")
                      : `${tr('Stock level is below the reorder point of', 'Le niveau de stock est inférieur au seuil de réapprovisionnement de')} ${item.reorder_level || 0} ${item.unit || tr('piece', 'pièce')}. ${tr('Consider restocking soon.', 'Pensez à réapprovisionner bientôt.')}`
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
            {tr('Close', 'Fermer')}
          </button>
        </div>
      </div>
    </div>
    {previewDocument && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewDocument(null)}>
        <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{previewDocument.name}</p>
              <p className="text-xs text-slate-500">{previewDocument.typeKey === 'invoice' ? tr('Invoice', 'Facture') : isImageDocument(previewDocument) ? tr('Image', 'Image') : tr('Document', 'Document')}</p>
            </div>
            <button type="button" onClick={() => setPreviewDocument(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[78vh] overflow-auto bg-slate-50 p-4">
            {isImageDocument(previewDocument) ? (
              <img src={previewDocument.url} alt={previewDocument.name} className="mx-auto max-h-[72vh] rounded-2xl object-contain" />
            ) : previewDocument.type === 'application/pdf' || previewDocument.name?.toLowerCase?.().endsWith('.pdf') ? (
              <iframe title={previewDocument.name} src={previewDocument.url} className="h-[72vh] w-full rounded-2xl border border-slate-200 bg-white" />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                <FileText className="mx-auto h-10 w-10 text-slate-400" />
                <p className="mt-3 text-sm text-slate-600">{tr('Preview is not available for this file type.', "L'aperçu n'est pas disponible pour ce type de fichier.")}</p>
                <a href={previewDocument.url} download={previewDocument.name} className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                  {tr('Download file', 'Télécharger le fichier')}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ItemDetailsModal;
