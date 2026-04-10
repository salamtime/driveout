import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  fetchPurchases,
  createPurchase,
  updatePurchase,
  deletePurchase,
  setError
} from '../../store/slices/inventorySlice';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2,
  Calendar,
  DollarSign,
  Package,
  FileText,
  Save,
  X,
  Minus,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import InventoryService from '../../services/InventoryService';

const PurchasesManagement = ({ initialParams, action }) => {
  const { i18n } = useTranslation();
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const primaryActionButtonClass = 'rounded-2xl bg-violet-600 text-white shadow-sm hover:bg-violet-700';
  const softActionButtonClass = 'rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900';
  const dangerActionButtonClass = 'rounded-2xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800';
  const dispatch = useDispatch();
  const { purchases, loading, error } = useSelector(state => state.inventory);

  // State for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  // State for modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);

  // State for available items
  const [availableItems, setAvailableItems] = useState([]);

  // State for form data
  const [formData, setFormData] = useState({
    supplier: '',
    invoice_number: '',
    purchase_date: '',
    total_amount_mad: 0,
    notes: '',
    lines: []
  });

  // Load purchases and items on component mount
  useEffect(() => {
    loadPurchases();
    loadAvailableItems();
  }, []);

  useEffect(() => {
    const requestedAction = action || initialParams?.action;
    if (requestedAction === 'create') {
      resetForm();
      setSelectedPurchase(null);
      setIsCreateModalOpen(true);
    }
  }, [action, initialParams]);

  const loadAvailableItems = async () => {
    try {
      const items = await InventoryService.getItems();
      setAvailableItems(items);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
  };

  const loadPurchases = async () => {
    try {
      await dispatch(fetchPurchases({
        supplier: supplierFilter,
        invoice_number: searchTerm,
        date_from: dateFromFilter,
        date_to: dateToFilter
      })).unwrap();
    } catch (error) {
      dispatch(setError(error.message));
      toast.error(tr('Failed to load purchases', "Impossible de charger les achats"));
    }
  };

  // Apply filters
  useEffect(() => {
    loadPurchases();
  }, [supplierFilter, dateFromFilter, dateToFilter]);

  const handleSearch = () => {
    loadPurchases();
  };

  const resetForm = () => {
    setFormData({
      supplier: '',
      invoice_number: '',
      purchase_date: '',
      total_amount_mad: 0,
      notes: '',
      lines: []
    });
  };

  const addLineItem = () => {
    const newLine = {
      id: Date.now(),
      item_id: '',
      item_name: '',
      quantity: 1,
      unit_cost_mad: 0,
      total_cost_mad: 0
    };
    setFormData({
      ...formData,
      lines: [...formData.lines, newLine]
    });
  };

  const removeLineItem = (lineId) => {
    const updatedLines = formData.lines.filter(line => line.id !== lineId);
    setFormData({
      ...formData,
      lines: updatedLines
    });
    calculateTotal(updatedLines);
  };

  const updateLineItem = (lineId, field, value) => {
    const updatedLines = formData.lines.map(line => {
      if (line.id === lineId) {
        const updatedLine = { ...line, [field]: value };
        
        // If item is selected, update item_name and unit_cost_mad
        if (field === 'item_id') {
          const selectedItem = availableItems.find(item => item.id === parseInt(value));
          if (selectedItem) {
            updatedLine.item_name = selectedItem.name;
            updatedLine.unit_cost_mad = selectedItem.cost_mad;
          } else {
            updatedLine.item_name = '';
            updatedLine.unit_cost_mad = 0;
          }
        }
        
        // Calculate line total
        if (field === 'quantity' || field === 'unit_cost_mad') {
          updatedLine.total_cost_mad = updatedLine.quantity * updatedLine.unit_cost_mad;
        }
        
        return updatedLine;
      }
      return line;
    });
    
    setFormData({
      ...formData,
      lines: updatedLines
    });
    calculateTotal(updatedLines);
  };

  const calculateTotal = (lines) => {
    const total = lines.reduce((sum, line) => sum + line.total_cost_mad, 0);
    setFormData(prev => ({
      ...prev,
      total_amount_mad: total
    }));
  };

  const validateForm = () => {
    if (!formData.supplier || !formData.invoice_number || !formData.purchase_date) {
      toast.error(tr('Please fill in all required fields', 'Veuillez remplir tous les champs obligatoires'));
      return false;
    }

    if (formData.lines.length === 0) {
      toast.error(tr('Please add at least one purchase item', "Veuillez ajouter au moins un article d'achat"));
      return false;
    }

    // Validate line items
    for (const line of formData.lines) {
        if (!line.item_id || line.quantity <= 0 || line.unit_cost_mad <= 0) {
        toast.error(tr('Please complete all line item details and ensure quantities/costs are greater than 0', "Veuillez compléter toutes les lignes et vérifier que les quantités/coûts sont supérieurs à 0"));
        return false;
      }
    }

    return true;
  };

  const handleCreatePurchase = async () => {
    try {
      if (!validateForm()) return;

      await dispatch(createPurchase(formData)).unwrap();
      toast.success(tr('Purchase created successfully! Stock levels have been updated.', "Achat créé avec succès ! Les niveaux de stock ont été mis à jour."));
      setIsCreateModalOpen(false);
      resetForm();
      loadPurchases();
      // Reload items to refresh stock levels
      loadAvailableItems();
    } catch (error) {
      toast.error(tr('Failed to create purchase', "Impossible de créer l'achat"));
    }
  };

  const handleEditPurchase = async () => {
    try {
      if (!validateForm()) return;

      await dispatch(updatePurchase({ 
        id: selectedPurchase.id, 
        purchaseData: formData 
      })).unwrap();
      toast.success(tr('Purchase updated successfully! Stock levels have been adjusted.', "Achat mis à jour avec succès ! Les niveaux de stock ont été ajustés."));
      setIsEditModalOpen(false);
      resetForm();
      setSelectedPurchase(null);
      loadPurchases();
      // Reload items to refresh stock levels
      loadAvailableItems();
    } catch (error) {
      toast.error(tr('Failed to update purchase', "Impossible de mettre à jour l'achat"));
    }
  };

  const handleDeletePurchase = async (purchaseId) => {
    if (window.confirm(tr('Are you sure you want to delete this purchase? This will also remove associated stock movements and adjust inventory levels.', "Voulez-vous vraiment supprimer cet achat ? Cela supprimera aussi les mouvements de stock associés et ajustera les niveaux d'inventaire."))) {
      try {
        await dispatch(deletePurchase(purchaseId)).unwrap();
        toast.success(tr('Purchase deleted successfully! Stock levels have been adjusted.', "Achat supprimé avec succès ! Les niveaux de stock ont été ajustés."));
        loadPurchases();
        // Reload items to refresh stock levels
        loadAvailableItems();
      } catch (error) {
        toast.error(tr('Failed to delete purchase', "Impossible de supprimer l'achat"));
      }
    }
  };

  const openEditModal = (purchase) => {
    setSelectedPurchase(purchase);
    
    // Properly populate form data including line items
    const populatedLines = purchase.purchase_lines ? purchase.purchase_lines.map(line => ({
      id: line.id || Date.now() + Math.random(),
      item_id: line.item_id || '',
      item_name: line.inventory_items?.name || '',
      quantity: line.quantity || 1,
      unit_cost_mad: line.unit_cost_mad || 0,
      total_cost_mad: line.total_cost_mad || (line.quantity * line.unit_cost_mad)
    })) : [];

    setFormData({
      supplier: purchase.supplier || '',
      invoice_number: purchase.invoice_number || purchase.purchase_number || '',
      purchase_date: purchase.purchase_date || '',
      total_amount_mad: purchase.total_amount_mad || 0,
      notes: purchase.notes || '',
      lines: populatedLines
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (purchase) => {
    setSelectedPurchase(purchase);
    setIsViewModalOpen(true);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount) => {
    return `${amount.toFixed(2)} MAD`;
  };

  const filteredPurchases = purchases.filter(purchase => {
    const purchaseNumber = purchase.invoice_number || purchase.purchase_number || '';
    const matchesSearch = purchase.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         purchaseNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Render line items form (shared between create and edit)
  const renderLineItemsForm = () => (
    <div className="border-t pt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">{tr('Purchase Items', "Articles d'achat")}</h3>
        <Button type="button" onClick={addLineItem} size="sm" className={primaryActionButtonClass}>
          <Plus className="h-4 w-4 mr-2" />
          {tr('Add Item', 'Ajouter un article')}
        </Button>
      </div>
      
      {formData.lines.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>{tr('No items added yet. Click "Add Item" to start.', 'Aucun article ajouté pour le moment. Cliquez sur "Ajouter un article" pour commencer.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {formData.lines.map((line, index) => {
            const selectedItem = availableItems.find(item => item.id === parseInt(line.item_id));
            const isLowStock = selectedItem && selectedItem.is_low_stock;
            
            return (
              <div key={line.id} className="grid grid-cols-12 gap-3 items-end rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="col-span-4">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{tr('Item', 'Article')} *</label>
                  <select
                    value={line.item_id}
                    onChange={(e) => updateLineItem(line.id, 'item_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    required
                  >
                    <option value="">{tr('Select item...', 'Sélectionnez un article...')}</option>
                    {availableItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku}) - {tr('Stock', 'Stock')} : {item.stock_on_hand}
                        {item.is_low_stock && ' ⚠️'}
                      </option>
                    ))}
                  </select>
                  {isLowStock && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      <span className="text-xs text-amber-600">{tr('Low stock item', 'Article en stock faible')}</span>
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{tr('Quantity', 'Quantité')} *</label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => updateLineItem(line.id, 'quantity', parseFloat(e.target.value) || 0)}
                    className="text-sm"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{tr('Unit Cost', 'Coût unitaire')} *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unit_cost_mad}
                    onChange={(e) => updateLineItem(line.id, 'unit_cost_mad', parseFloat(e.target.value) || 0)}
                    className="text-sm"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{tr('Total', 'Total')}</label>
                  <Input
                    type="text"
                    value={formatCurrency(line.total_cost_mad)}
                    readOnly
                    className="text-sm bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeLineItem(line.id)}
                    className={dangerActionButtonClass}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          
          {/* Total Summary */}
          <div className="flex justify-end pt-3 border-t">
            <div className="text-right">
              <p className="text-sm text-gray-600">{tr('Total Amount:', 'Montant total :')}</p>
              <p className="text-xl font-semibold text-green-600">
                {formatCurrency(formData.total_amount_mad)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (loading.purchases) {
    return (
      <div className="p-4 lg:p-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h2 className="text-xl font-semibold text-slate-900">{tr('Loading purchases...', 'Chargement des achats...')}</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{tr('Purchases Management', 'Gestion des achats')}</h1>
          <p className="text-gray-600 mt-1">{tr('Track purchases and supplier invoices - automatically updates inventory stock', "Suivez les achats et les factures fournisseurs - met automatiquement à jour le stock d'inventaire")}</p>
        </div>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className={primaryActionButtonClass}>
              <Plus className="h-4 w-4 mr-2" />
              {tr('Add Purchase', 'Ajouter un achat')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2rem] border-slate-200">
            <DialogHeader>
              <DialogTitle>{tr('Add New Purchase', 'Ajouter un nouvel achat')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{tr('Supplier', 'Fournisseur')} *</label>
                  <Input
                    value={formData.supplier}
                    onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                    placeholder={tr('Enter supplier name', 'Entrez le nom du fournisseur')}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{tr('Invoice Number', 'Numéro de facture')} *</label>
                  <Input
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                    placeholder={tr('Enter invoice number', 'Entrez le numéro de facture')}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{tr('Purchase Date', "Date d'achat")} *</label>
                  <Input
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{tr('Total Amount (MAD)', 'Montant total (MAD)')}</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.total_amount_mad}
                    readOnly
                    className="bg-gray-50"
                    placeholder={tr('Auto-calculated from items', 'Calculé automatiquement à partir des articles')}
                  />
                </div>
              </div>

              {/* Purchase Items Section */}
              {renderLineItemsForm()}

              {/* Notes */}
              <div>
                <label className="text-sm font-medium mb-2 block">{tr('Notes', 'Notes')}</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={tr('Enter any notes about this purchase', 'Entrez des notes sur cet achat')}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} className={softActionButtonClass}>
                <X className="h-4 w-4 mr-2" />
                {tr('Cancel', 'Annuler')}
              </Button>
              <Button onClick={handleCreatePurchase} className={primaryActionButtonClass}>
                <Save className="h-4 w-4 mr-2" />
                {tr('Create Purchase & Update Stock', "Créer l'achat et mettre à jour le stock")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder={tr('Search by supplier or invoice number...', 'Rechercher par fournisseur ou numéro de facture...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>
            <Button onClick={handleSearch} variant="outline" className={softActionButtonClass}>
              <Search className="h-4 w-4 mr-2" />
              {tr('Search', 'Rechercher')}
            </Button>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{tr('Filters', 'Filtres')}</span>
            </div>
            <Input
              placeholder={tr('Filter by supplier', 'Filtrer par fournisseur')}
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="max-w-xs"
            />
            <Input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              className="max-w-xs"
            />
            <Input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Purchases List */}
      <div className="grid gap-4">
        {filteredPurchases.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">{tr('No purchases found', 'Aucun achat trouvé')}</p>
            </CardContent>
          </Card>
        ) : (
          filteredPurchases.map((purchase) => (
            <Card key={purchase.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {purchase.supplier}
                      </h3>
                      <Badge variant="outline">
                        {tr('Invoice', 'Facture')} #{purchase.invoice_number || purchase.purchase_number || tr('N/A', 'N/D')}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {formatDate(purchase.purchase_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-green-600">
                          {formatCurrency(purchase.total_amount_mad)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {purchase.purchase_lines?.length || 0} {tr('items', 'articles')}
                        </span>
                      </div>
                    </div>

                    {/* Purchase Lines Preview */}
                    {purchase.purchase_lines && purchase.purchase_lines.length > 0 && (
                      <div className="mb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {purchase.purchase_lines.slice(0, 2).map((line, index) => (
                            <div key={index} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                              <span className="font-medium">{line.inventory_items?.name || tr('Item', 'Article')}</span>
                              <br />
                              <span>{line.quantity} × {formatCurrency(line.unit_cost_mad)}</span>
                            </div>
                          ))}
                        </div>
                        {purchase.purchase_lines.length > 2 && (
                          <p className="text-sm text-gray-500 mt-2">
                            +{purchase.purchase_lines.length - 2} {tr('more items', "articles de plus")}
                          </p>
                        )}
                      </div>
                    )}

                    {purchase.notes && (
                      <div className="flex items-start gap-2 mb-4">
                        <FileText className="h-4 w-4 text-gray-500 mt-0.5" />
                        <span className="text-sm text-gray-600">
                          {tr('Notes:', 'Notes :')} {purchase.notes}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(purchase)}
                    >
                      <Eye className="h-4 w-4" />
                      {tr('View Details', 'Voir les détails')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(purchase)}
                    >
                      <Edit className="h-4 w-4" />
                      {tr('Edit', 'Modifier')}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeletePurchase(purchase.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {tr('Delete', 'Supprimer')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Purchase Modal - Now matches Add Purchase modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('Edit Purchase', "Modifier l'achat")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{tr('Supplier *', 'Fournisseur *')}</label>
                <Input
                  value={formData.supplier}
                  onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                  placeholder={tr('Enter supplier name', 'Entrez le nom du fournisseur')}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{tr('Invoice Number *', 'Numéro de facture *')}</label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                  placeholder={tr('Enter invoice number', 'Entrez le numéro de facture')}
                  required
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{tr('Purchase Date *', "Date d'achat *")}</label>
                <Input
                  type="date"
                  value={formData.purchase_date}
                  onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{tr('Total Amount (MAD)', 'Montant total (MAD)')}</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.total_amount_mad}
                  readOnly
                  className="bg-gray-50"
                  placeholder={tr('Auto-calculated from items', 'Calculé automatiquement à partir des articles')}
                />
              </div>
            </div>

            {/* Purchase Items Section */}
            {renderLineItemsForm()}

            {/* Notes */}
            <div>
              <label className="text-sm font-medium mb-2 block">{tr('Notes', 'Notes')}</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder={tr('Enter any notes about this purchase', 'Entrez des notes sur cet achat')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              {tr('Cancel', 'Annuler')}
            </Button>
            <Button onClick={handleEditPurchase}>
              <Save className="h-4 w-4 mr-2" />
              {tr('Update Purchase & Adjust Stock', "Mettre à jour l'achat et ajuster le stock")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Purchase Details Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tr('Purchase Details', "Détails de l'achat")}</DialogTitle>
          </DialogHeader>
          {selectedPurchase && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">{tr('Supplier Information', 'Informations du fournisseur')}</h4>
                  <p className="text-lg font-semibold">{selectedPurchase.supplier}</p>
                  <p className="text-sm text-gray-600">{tr('Invoice:', 'Facture :')} {selectedPurchase.invoice_number || selectedPurchase.purchase_number || tr('N/A', 'N/D')}</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">{tr('Purchase Information', "Informations sur l'achat")}</h4>
                  <p className="text-sm text-gray-600">{tr('Date:', 'Date :')} {formatDate(selectedPurchase.purchase_date)}</p>
                  <p className="text-lg font-semibold text-green-600">
                    {tr('Total:', 'Total :')} {formatCurrency(selectedPurchase.total_amount_mad)}
                  </p>
                </div>
              </div>

              {selectedPurchase.purchase_lines && selectedPurchase.purchase_lines.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">{tr('Items Purchased', 'Articles achetés')}</h4>
                  <div className="space-y-2">
                    {selectedPurchase.purchase_lines.map((line, index) => (
                      <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium">{line.inventory_items?.name || tr('Item', 'Article')}</p>
                          <p className="text-sm text-gray-600">
                            {tr('Quantity:', 'Quantité :')} {line.quantity} × {formatCurrency(line.unit_cost_mad)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(line.total_cost_mad)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPurchase.notes && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">{tr('Notes', 'Notes')}</h4>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded">{selectedPurchase.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              {tr('Close', 'Fermer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
};

export default PurchasesManagement;
