import React, { useState, useEffect } from 'react';
import { XIcon, CalendarIcon, UserIcon, WrenchIcon, DollarSignIcon, PackageIcon, PlusIcon, TrashIcon } from 'lucide-react';
import InventoryService from '../../../services/InventoryService';
import MaintenanceService from '../../../services/MaintenanceService';
import i18n from '../../../i18n';

const MaintenanceDetailsModal = ({ isOpen, onClose, maintenance, onSave }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  // CRITICAL: Add Parts Used state and functionality
  const [partsToAdd, setPartsToAdd] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadInventoryItems();
    }
  }, [isOpen]);

  const loadInventoryItems = async () => {
    try {
      console.log('📦 Loading inventory items for parts selection...');
      const items = await InventoryService.getAllItems();
      const activeItems = items.filter(item => item.active === true);
      setInventoryItems(activeItems);
      console.log(`✅ Loaded ${activeItems.length} active inventory items`);
    } catch (error) {
      console.error('❌ Error loading inventory items:', error);
      setInventoryItems([]);
    }
  };

  // CRITICAL: Parts Used management functions
  const addPartToAdd = () => {
    console.log('➕ Adding new part to maintenance');
    setPartsToAdd(prev => [...prev, { item_id: '', quantity: 1, notes: '' }]);
  };

  const updatePartToAdd = (index, field, value) => {
    console.log(`✏️ Updating part ${index}: ${field} = ${value}`);
    setPartsToAdd(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removePartToAdd = (index) => {
    console.log(`🗑️ Removing part ${index}`);
    setPartsToAdd(prev => prev.filter((_, i) => i !== index));
  };

  const getItemDetails = (itemId) => {
    const item = inventoryItems.find(item => item.id === parseInt(itemId));
    return item || null;
  };

  const getItemSellPrice = (item) => {
    return parseFloat(item?.price_mad || 0) || parseFloat(item?.cost_mad || 0) || 0;
  };

  // CRITICAL: Complete maintenance with automatic inventory deduction
  const handleCompleteMaintenance = async () => {
    setLoading(true);
    try {
      console.log('🔧 Completing maintenance with automatic inventory deduction:', partsToAdd);
      
      if (partsToAdd.length === 0) {
        alert(tr('Please add at least one part to complete maintenance with inventory integration.', "Veuillez ajouter au moins une pièce pour terminer la maintenance avec l'intégration d'inventaire."));
        setLoading(false);
        return;
      }
      
      // Validate parts selection
      const invalidParts = partsToAdd.filter(part => !part.item_id || !part.quantity || part.quantity <= 0);
      if (invalidParts.length > 0) {
        alert(tr('Please select inventory items and enter valid quantities for all parts.', "Veuillez sélectionner des articles d'inventaire et saisir des quantités valides pour toutes les pièces."));
        setLoading(false);
        return;
      }
      
      // Complete maintenance with automatic inventory deduction
      const result = await MaintenanceService.completeMaintenance(
        maintenance.id, 
        partsToAdd,
        { ...maintenance, status: 'completed' }
      );
      
      console.log('✅ Maintenance completed with inventory integration:', result);
      
      // Show success message with details
      const partsSummary = partsToAdd.map(part => {
        const item = inventoryItems.find(i => i.id == part.item_id);
        return `${item?.name || tr('Unknown', 'Inconnu')}: ${part.quantity} ${item?.unit || tr('units', 'unités')}`;
      }).join(', ');
      
      alert(
        isFrench
          ? `Maintenance terminée avec succès !\n\nPièces consommées : ${partsSummary}\n\nL'inventaire a été mis à jour automatiquement.`
          : `Maintenance completed successfully!\n\nParts consumed: ${partsSummary}\n\nInventory has been automatically updated.`
      );
      
      if (onSave) {
        onSave(result.maintenance);
      }
      onClose();
    } catch (error) {
      console.error('❌ Error completing maintenance:', error);
      alert(`Erreur lors de la finalisation de la maintenance : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !maintenance) return null;

  const formatDate = (dateString) => {
    if (!dateString) return tr('Not set', 'Non défini');
    return new Date(dateString).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat(isFrench ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'text-yellow-600 bg-yellow-100';
      case 'in_progress':
        return 'text-blue-600 bg-blue-100';
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'cancelled':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  // Calculate parts cost from selected parts
  const calculatePartsCost = () => {
    if (!partsToAdd || partsToAdd.length === 0) return 0;
    return partsToAdd.reduce((total, part) => {
      const item = getItemDetails(part.item_id);
      if (item && part.quantity) {
        return total + (getItemSellPrice(item) * (part.quantity || 0));
      }
      return total;
    }, 0);
  };

  const partsCost = calculatePartsCost();
  const laborCost = parseFloat(maintenance.labor_cost_mad || 0);
  const externalCost = parseFloat(maintenance.external_cost_mad || 0);
  const tax = parseFloat(maintenance.tax_mad || 0);
  const totalCost = laborCost + externalCost + tax + partsCost;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">{tr('Maintenance Record Details', 'Détails de la fiche de maintenance')}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Vehicle Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Vehicle</h3>
              <p className="text-gray-900 font-medium">
                {maintenance.vehicle?.license_plate || 'N/A'} {maintenance.vehicle?.model ? `(${maintenance.vehicle.model})` : ''}
              </p>
              {maintenance.vehicle?.mileage && (
                <p className="text-sm text-gray-600 mt-1">
                  Kilométrage : {maintenance.vehicle.mileage.toLocaleString()} km
                </p>
              )}
            </div>

            {/* Maintenance Type */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Type de maintenance</h3>
              <p className="text-gray-900 font-medium capitalize">
                {maintenance.maintenance_type?.replace('_', ' ') || maintenance.description || "Vidange d'huile"}
              </p>
            </div>

            {/* Status */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Statut</h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(maintenance.status)}`}>
                <CalendarIcon className="h-3 w-3 mr-1" />
                {maintenance.status || 'scheduled'}
              </span>
            </div>

            {/* Service Date */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Date d'intervention</h3>
              <p className="text-gray-900 font-medium">
                {formatDate(maintenance.scheduled_date)}
              </p>
            </div>
          </div>

          {/* Cost Information */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Coût</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                {laborCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Coût main-d'œuvre :</span>
                    <span className="font-medium">{formatCurrency(laborCost)}</span>
                  </div>
                )}
                {partsCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Prix des pièces :</span>
                    <span className="font-medium">{formatCurrency(partsCost)}</span>
                  </div>
                )}
                {externalCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Coût externe :</span>
                    <span className="font-medium">{formatCurrency(externalCost)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Taxe :</span>
                    <span className="font-medium">{formatCurrency(tax)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between text-lg font-bold text-blue-900">
                  <span>Prix total :</span>
                  <span>{formatCurrency(totalCost)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CRITICAL: Parts Used Section - NOW ALWAYS VISIBLE */}
          <div className="space-y-4 mt-6 border-t pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <PackageIcon className="h-5 w-5 mr-2" />
                Pièces utilisées
              </h3>
              {maintenance.status === 'scheduled' && (
                <button
                  onClick={addPartToAdd}
                  className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Ajouter une pièce
                </button>
              )}
            </div>

            {/* Show existing parts if any */}
            {maintenance.parts_used && maintenance.parts_used.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">Pièces utilisées terminées :</h4>
                {maintenance.parts_used.map((part, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="font-medium">{part.item_name || 'Article inconnu'}</span>
                    <span className="text-gray-600">{part.quantity} {part.unit || 'unités'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-gray-50 rounded-lg">
                <PackageIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">Aucune pièce utilisée pour cette maintenance</p>
              </div>
            )}

            {/* Add Parts Interface for Scheduled Maintenance */}
            {maintenance.status === 'scheduled' && (
              <div className="space-y-3 mt-4">
                {partsToAdd.length > 0 && (
                  <>
                    <h4 className="font-medium text-gray-900">Ajouter des pièces pour terminer la maintenance :</h4>
                    <div className="space-y-3">
                      {partsToAdd.map((part, index) => (
                        <div key={index} className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Article d'inventaire *
                              </label>
                              <select
                                value={part.item_id || ''}
                                onChange={(e) => updatePartToAdd(index, 'item_id', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                <option value="">Sélectionner un article</option>
                                {inventoryItems.map(item => (
                                  <option 
                                    key={item.id} 
                                    value={item.id}
                                    disabled={item.stock_on_hand <= 0}
                                  >
                                    {item.name} {item.sku ? `(${item.sku})` : ''} - {item.stock_on_hand} {item.unit} disponible
                                    {item.stock_on_hand <= 0 ? ' - Rupture de stock' : ''}
                                  </option>
                                ))}
                              </select>
                              {part.item_id && (
                                <div className="mt-1 text-xs text-gray-500">
                                  {(() => {
                                    const item = getItemDetails(part.item_id);
                                    return item ? `${item.category} • Prix : ${getItemSellPrice(item)} MAD/${item.unit}` : '';
                                  })()}
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Quantité *
                              </label>
                              <input
                                type="number"
                                min="0.1"
                                step="0.1"
                                value={part.quantity || ''}
                                onChange={(e) => updatePartToAdd(index, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="0"
                              />
                            </div>

                            <div className="flex items-end">
                              <button
                                onClick={() => removePartToAdd(index)}
                                className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <TrashIcon className="h-4 w-4 mx-auto" />
                              </button>
                            </div>

                            <div className="md:col-span-4 mt-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Notes
                              </label>
                              <input
                                type="text"
                                value={part.notes || ''}
                                onChange={(e) => updatePartToAdd(index, 'notes', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Notes facultatives sur l'utilisation de cette pièce..."
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {partsToAdd.length === 0 && (
                  <div className="text-center py-6 bg-blue-50 rounded-lg border-2 border-dashed border-blue-300">
                    <PackageIcon className="h-12 w-12 text-blue-400 mx-auto mb-2" />
                    <p className="text-blue-600">Cliquez sur "Ajouter une pièce" pour sélectionner des articles d'inventaire pour cette maintenance</p>
                  </div>
                )}

                {/* Complete Maintenance Button */}
                {partsToAdd.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button 
                      onClick={handleCompleteMaintenance}
                      disabled={loading}
                      className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-400"
                    >
                      {loading ? 'Finalisation de la maintenance...' : 'Terminer la maintenance avec pièces'}
                    </button>
                    <p className="text-sm text-gray-600 mt-2 text-center">
                      Cela mettra automatiquement à jour les niveaux de stock et marquera la maintenance comme terminée
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description and Notes */}
          {(maintenance.description || maintenance.notes) && (
            <div className="mt-6 pt-6 border-t">
              {maintenance.description && (
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-700">{maintenance.description}</p>
                </div>
              )}
              
              {maintenance.notes && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Notes</h3>
                  <p className="text-gray-700">{maintenance.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Technician Information */}
          {maintenance.technician_name && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Technicien</h3>
              <div className="flex items-center">
                <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                <span className="text-gray-700">{maintenance.technician_name}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceDetailsModal;
