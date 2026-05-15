import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import InventoryService from '../../services/InventoryService';
import VehicleReportService from '../../services/VehicleReportService';
import VehicleService from '../../services/VehicleService';
import { formatRentalReference } from '../../utils/rentalReference';
import { formatMaintenanceReference } from '../../utils/maintenanceReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import { getInventoryCategoryVisual } from '../../utils/inventoryVisuals';
import { 
  X, 
  Save, 
  Calculator, 
  Car, 
  Wrench, 
  Calendar, 
  DollarSign,
  FileText,
  PackageIcon,
  PlusIcon,
  TrashIcon,
  SearchIcon,
  AlertTriangleIcon,
  InfoIcon,
  Clock3,
  PlayCircle,
  CheckCircle2
} from 'lucide-react';

// Import maintenance-inventory mapping
import {
  getSuggestedCategories,
  getSuggestedLabelsForTypes,
  itemMatchesInventoryLabels,
  normalizeInventoryLabels,
  formatInventoryLabel,
  getRecommendedInventoryItems,
  getMaintenanceTypeDescription,
  isItemTypicalForMaintenance,
  filterItemsByMaintenanceType,
  getNonTypicalParts,
  removeNonTypicalParts
} from '../../config/maintenanceInventoryMapping';
import i18n from '../../i18n';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';

const MAINTENANCE_MANUAL_SUGGESTIONS = {
  'Oil Change': ['Engine Oil', 'Oil Filter', 'Drain Washer'],
  'Brake Service': ['Brake Fluid', 'Brake Cleaner'],
  'Tire Service': ['Valve Stem', 'Balancing Service'],
  'Filter Replacement': ['Air Filter', 'Fuel Filter'],
  'Engine Service': ['Coolant', 'Spark Plug', 'Gasket Set'],
  'Transmission Service': ['Transmission Fluid', 'Seal Kit'],
  'Electrical Service': ['Bulb', 'Fuse', 'Wiring Repair'],
  'Body Work': ['Paint Material', 'Body Filler', 'Fasteners'],
  'General Inspection': ['Cleaning Material', 'Inspection Consumables'],
  'Other': ['Workshop Consumable'],
};

const QUICK_COMPLETE_TYPES = new Set(['Oil Change', 'Filter Replacement', 'General Inspection']);

const stripFinanceSnapshot = (value = '') => {
  return String(value || '')
    .replace(/\[finance_snapshot\]\s*\{.*\}\s*$/i, '')
    .trim();
};

/**
 * AddMaintenanceForm - Mobile-friendly form for adding maintenance records
 * 
 * Features auto-prefill from pricing catalog and comprehensive cost tracking
 * ENHANCED: Smart Parts Used picker with context-aware filtering and stock validation
 * UPDATED: Removed external cost field completely
 */
const AddMaintenanceForm = ({ onCancel, onSuccess, editingRecord = null, initialContext = null }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  useAdminModalFocus(true, 'maintenance-form');
  const safeMaintenanceTypes = Array.isArray(MaintenanceTrackingService.MAINTENANCE_TYPES) ? MaintenanceTrackingService.MAINTENANCE_TYPES : ['Oil Change', 'Filter Replacement', 'Brake Service', 'Tire Service', 'Engine Service', 'Transmission Service', 'Electrical Service', 'Body Work', 'General Inspection', 'Other'];
  const parseMaintenanceTypes = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value || typeof value !== 'string') return [];
    return value
      .split('+')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((type, index, arr) => arr.indexOf(type) === index);
  };

  const getInventorySellPrice = (item, fallback = 0) => {
    return parseFloat(item?.price_mad || 0) || parseFloat(fallback || 0) || parseFloat(item?.cost_mad || 0) || 0;
  };
  const normalizeWholeMadInput = (value) => {
    const rawValue = String(value ?? '');
    if (!rawValue) return '';

    const wholePart = rawValue.split(/[.,]/)[0] || '';
    return wholePart.replace(/\D/g, '');
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // CRITICAL: Always initialize as arrays
  const [vehicles, setVehicles] = useState([]);
  const [pricingCatalog, setPricingCatalog] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [stockWarnings, setStockWarnings] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // NEW: Smart filtering states
  const [showAllItems, setShowAllItems] = useState(false);
  const [selectedInventoryLabel, setSelectedInventoryLabel] = useState('');
  const [previousMaintenanceType, setPreviousMaintenanceType] = useState('');
  const [showMaintenanceTypeChangePrompt, setShowMaintenanceTypeChangePrompt] = useState(false);
  const [nonTypicalPartsToHandle, setNonTypicalPartsToHandle] = useState([]);
  const [reportContextApplied, setReportContextApplied] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [showCostInputs, setShowCostInputs] = useState(false);
  const [showPartsEditor, setShowPartsEditor] = useState(false);
  const [partsSourceTab, setPartsSourceTab] = useState('inventory');
  
  const [formData, setFormData] = useState({
    vehicle_id: '',
    maintenance_type: 'Oil Change',
    maintenance_types: ['Oil Change'],
    status: 'scheduled',
    scheduled_date: new Date().toISOString().split('T')[0],
    completed_date: '',
    odometer_reading: '',
    labor_rate_mad: '', // Fixed price, not hourly rate
    parts_cost_mad: '',
    tax_mad: '',
    notes: '',
    technician_name: '',
    parts_used: [] // NEW: Parts used array
  });
  const selectedMaintenanceTypes = Array.isArray(formData.maintenance_types) && formData.maintenance_types.length > 0
    ? formData.maintenance_types
    : parseMaintenanceTypes(formData.maintenance_type);
  const primaryMaintenanceType = selectedMaintenanceTypes[0] || 'Oil Change';

  const addInventoryPart = () => {
    setPartsSourceTab('inventory');
    setShowPartsEditor(true);
    setFormData(prev => ({
      ...prev,
      parts_used: [...prev.parts_used, {
        source_type: 'inventory',
        item_id: '',
        quantity: 1,
        notes: ''
      }]
    }));
  };

  const addManualPart = () => {
    setPartsSourceTab('manual');
    setShowPartsEditor(true);
    setFormData(prev => ({
      ...prev,
      parts_used: [...prev.parts_used, {
        source_type: 'manual',
        item_id: '',
        part_name: '',
        part_number: '',
        quantity: 1,
        unit_cost_mad: '',
        notes: ''
      }]
    }));
  };

  const addSuggestedInventoryPart = (item, quantityOverride = 1) => {
    if (!item?.id) return false;
    const availableStock = Number(item.available_stock ?? item.stock_on_hand ?? 0) || 0;
    if (availableStock <= 0 && !editingRecord) {
      setError(tr(
        `${item.name} is out of stock. Restock this inventory item before using it on a maintenance record.`,
        `${item.name} est en rupture de stock. Reapprovisionnez cet article avant de l utiliser sur une maintenance.`
      ));
      return false;
    }

    setError('');
    const nextQuantity = parseFloat(quantityOverride || 1) || 1;
    const unitCost = parseFloat(item.cost_mad || 0) || 0;
    const unitPrice = getInventorySellPrice(item);

    setFormData((prev) => {
      const existingIndex = prev.parts_used.findIndex((part) => (
        (part.source_type || 'inventory') === 'inventory' && String(part.item_id) === String(item.id)
      ));

      if (existingIndex >= 0) {
        const nextParts = [...prev.parts_used];
        nextParts[existingIndex] = {
          ...nextParts[existingIndex],
          item_name: item.name || nextParts[existingIndex].item_name || '',
          part_name: item.name || nextParts[existingIndex].part_name || '',
          part_number: item.sku || nextParts[existingIndex].part_number || '',
          unit: item.unit || nextParts[existingIndex].unit || 'units',
          unit_cost_mad: nextParts[existingIndex].unit_cost_mad || unitCost,
          unit_price_mad: nextParts[existingIndex].unit_price_mad || unitPrice,
        };
        return { ...prev, parts_used: nextParts };
      }

      return {
        ...prev,
        parts_used: [
          ...prev.parts_used,
          {
            source_type: 'inventory',
            item_id: String(item.id),
            item_name: item.name || '',
            part_name: item.name || '',
            part_number: item.sku || '',
            quantity: nextQuantity,
            unit: item.unit || 'units',
            unit_cost_mad: unitCost,
            unit_price_mad: unitPrice,
            total_cost_mad: nextQuantity * unitCost,
            total_sell_mad: nextQuantity * unitPrice,
            notes: '',
          }
        ]
      };
    });

    return true;
  };

  const selectInventorySearchItem = (item, quantityOverride = 1) => {
    const didSelect = addSuggestedInventoryPart(item, quantityOverride);
    if (!didSelect) return;

    setPartsSourceTab('inventory');
    setShowPartsEditor(true);
    setItemSearchTerm('');
    setSelectedInventoryLabel('');
  };

  const addSuggestedManualPart = (partName) => {
    if (!partName) return;

    setFormData((prev) => ({
      ...prev,
      parts_used: [
        ...prev.parts_used,
        {
          source_type: 'manual',
          item_id: '',
          part_name: partName,
          part_number: '',
          quantity: 1,
          unit_cost_mad: '',
          notes: '',
        }
      ]
    }));
  };

  useEffect(() => {
    if (editingRecord) {
      // FIXED: Only use existing database values, no auto-calculation
      const laborCost = editingRecord.labor_rate_mad || editingRecord.labor_cost_mad || '';
      const partsCost = editingRecord.parts_cost_mad || '';
      const taxCost = editingRecord.tax_mad || 0;

      const mappedData = {
        vehicle_id: editingRecord.vehicle_id?.toString() || '',
        maintenance_type: editingRecord.maintenance_type || editingRecord.type || 'Oil Change',
        maintenance_types: parseMaintenanceTypes(editingRecord.maintenance_type || editingRecord.type || 'Oil Change'),
        status: editingRecord.status || 'scheduled',
        scheduled_date: editingRecord.service_date || editingRecord.scheduled_date || editingRecord.date || new Date().toISOString().split('T')[0],
        completed_date: editingRecord.completed_date || '',
        odometer_reading: editingRecord.odometer_reading?.toString() || editingRecord.odometerReading?.toString() || '',
        notes: editingRecord.description || editingRecord.notes || editingRecord.details || '',
        technician_name: editingRecord.technician_name || editingRecord.technician || '',
        // 🚨🚨🚨 CRITICAL FIX: Enhanced cost mapping (removed external cost and auto-calculation)
        labor_rate_mad: normalizeWholeMadInput(Math.round(parseFloat(laborCost || 0) || 0)),
        parts_cost_mad: partsCost?.toString() || '',
        tax_mad: taxCost?.toString() || '',
        parts_used: [] // Will be set after inventory loads
      };

      setFormData(mappedData);
      setPreviousMaintenanceType(mappedData.maintenance_type);
    }

    loadInitialData();
  }, [editingRecord]); // Only depend on editingRecord

  // Enhanced filtering with smart suggestions
  useEffect(() => {
    if (!itemSearchTerm) {
      // Apply smart filtering based on maintenance type and showAllItems state
      const filtered = getFilteredItemsForDisplay();
      setFilteredItems(filtered);
    } else {
      // Searching should always scan the full active inventory list. Suggestions are
      // only a default view, not a hard filter that hides valid stocked parts.
      const normalizedSearch = itemSearchTerm.trim().toLowerCase();
      const searchFiltered = inventoryItems.filter(item => {
        const haystack = [
          item.name,
          item.sku,
          item.category,
          ...(Array.isArray(item.labels) ? item.labels : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      });
      setFilteredItems(searchFiltered);
    }
  }, [itemSearchTerm, inventoryItems, primaryMaintenanceType, selectedMaintenanceTypes, selectedInventoryLabel, showAllItems]);

  useEffect(() => {
    // Auto-prefill from pricing catalog when maintenance type changes
    if (primaryMaintenanceType && pricingCatalog.length > 0) {
      const pricing = pricingCatalog.find(p => p.maintenance_type === primaryMaintenanceType);
      if (pricing && !editingRecord) {
        setFormData(prev => ({
          ...prev,
          labor_rate_mad: normalizeWholeMadInput(Math.round(parseFloat(pricing.default_labor_rate_mad || 0) || 0)),
          parts_cost_mad: pricing.default_parts_cost_mad?.toString() || ''
        }));
      }
    }
  }, [primaryMaintenanceType, pricingCatalog, editingRecord]);

  // NEW: Handle maintenance type changes with non-typical parts check
  useEffect(() => {
    if (previousMaintenanceType && 
        primaryMaintenanceType !== previousMaintenanceType && 
        formData.parts_used.length > 0) {
      
      // Check for non-typical parts with the new maintenance type
      const nonTypicalParts = getNonTypicalParts(
        formData.parts_used, 
        inventoryItems, 
        primaryMaintenanceType
      );
      
      if (nonTypicalParts.length > 0) {
        setNonTypicalPartsToHandle(nonTypicalParts);
        setShowMaintenanceTypeChangePrompt(true);
      }
    }
    
    setPreviousMaintenanceType(primaryMaintenanceType);
  }, [primaryMaintenanceType, formData.parts_used, inventoryItems, previousMaintenanceType]);

  useEffect(() => {
    if (editingRecord && inventoryItems.length > 0) {
      // Check multiple possible field names for parts data
      const partsData = editingRecord.parts_used || 
                       editingRecord.parts || 
                       editingRecord.maintenance_parts ||
                       editingRecord.items_used ||
                       editingRecord.inventory_parts ||
                       [];

      if (Array.isArray(partsData) && partsData.length > 0) {
        const mappedParts = partsData.map(part => {
          const isInventoryPart = (part.source_type || (part.item_id ? 'inventory' : 'manual')) !== 'manual';
          const linkedInventoryItem = isInventoryPart
            ? inventoryItems.find(item => String(item.id) === String(part.item_id || part.id || part.inventory_item_id))
            : null;
          const quantity = parseFloat(part.quantity || part.qty || 1) || 0;
          const unitCost = linkedInventoryItem
            ? (parseFloat(linkedInventoryItem.cost_mad || 0) || 0)
            : (parseFloat(part.unit_cost_mad || part.unit_cost || part.cost_per_unit || 0) || 0);
          const unitPrice = linkedInventoryItem
            ? getInventorySellPrice(linkedInventoryItem, part.unit_price_mad || part.unit_sell_mad || part.sell_price_mad || part.unit_cost_mad || part.unit_cost || part.cost_per_unit || 0)
            : (parseFloat(part.unit_price_mad || part.unit_sell_mad || part.sell_price_mad || part.unit_cost_mad || part.unit_cost || part.cost_per_unit || 0) || 0);

          return {
            source_type: part.source_type || (part.item_id ? 'inventory' : 'manual'),
            item_id: part.item_id?.toString() || part.id?.toString() || part.inventory_item_id?.toString() || '',
            quantity,
            notes: stripFinanceSnapshot(part.notes || part.description || ''),
            unit_cost_mad: unitCost,
            unit_price_mad: unitPrice,
            total_cost_mad: (parseFloat(part.total_cost_mad || part.total_cost || part.cost || 0) || 0) || (unitCost * quantity),
            total_sell_mad: (parseFloat(part.total_sell_mad || part.line_sell_total_mad || 0) || 0) || (unitPrice * quantity),
            item_name: part.item_name || part.name || part.inventory_item_name || '',
            part_name: part.part_name || part.item_name || part.name || '',
            part_number: part.part_number || part.sku || ''
          };
        });

        setFormData(prev => ({
          ...prev,
          parts_used: mappedParts,
          parts_cost_mad: Math.max(
            0,
            (parseFloat(prev.parts_cost_mad || 0) || 0) -
              mappedParts.reduce((sum, part) => {
                const explicitLineTotal =
                  parseFloat(part.total_sell_mad || part.line_sell_total_mad || 0) || 0;
                if (explicitLineTotal > 0) {
                  return sum + explicitLineTotal;
                }

                return sum + ((parseFloat(part.quantity || 0) || 0) * (parseFloat(part.unit_price_mad || part.unit_cost_mad || 0) || 0));
              }, 0)
          ).toString()
        }));
      }
    }
  }, [editingRecord, inventoryItems]);

  useEffect(() => {
    if (editingRecord || reportContextApplied || !initialContext?.vehicleId) return;

    const report = initialContext.report;
    const maintenanceType = report
      ? (report.report_type === 'mechanical_issue' ? ['Engine Service'] : ['Body Work'])
      : (formData.maintenance_types?.length ? formData.maintenance_types : [formData.maintenance_type]);

    const normalizedMaintenanceTypes = Array.from(new Set(maintenanceType.filter(Boolean)));
    const combinedMaintenanceType = normalizedMaintenanceTypes.join(' + ');

    const linkedNotes = [
      report?.description ? `Rental report: ${report.description}` : null,
      report?.affected_areas?.length ? `Affected areas: ${report.affected_areas.join(', ')}` : null,
      initialContext.rentalId ? `Rental reference: ${initialContext.rentalId}` : null,
      report?.id ? `Vehicle report ID: ${report.id}` : null,
    ].filter(Boolean).join('\n');

    setFormData(prev => ({
      ...prev,
      vehicle_id: String(initialContext.vehicleId),
      maintenance_type: combinedMaintenanceType,
      maintenance_types: normalizedMaintenanceTypes,
      notes: linkedNotes || prev.notes,
    }));
    setPreviousMaintenanceType(normalizedMaintenanceTypes[0] || '');
    setReportContextApplied(true);
  }, [editingRecord, initialContext, reportContextApplied, formData.maintenance_type, formData.maintenance_types]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setLoadingItems(true);

      // Load vehicles, pricing catalog, and inventory items
      const [vehiclesData, pricingData, itemsData] = await Promise.all([
        VehicleService.getAllVehicles(),
        MaintenanceTrackingService.getMaintenancePricingCatalog(),
        InventoryService.getItems({ active: true })
      ]);
      
      // CRITICAL: Always ensure arrays
      const safeVehicles = Array.isArray(vehiclesData) ? vehiclesData : [];
      const safePricing = Array.isArray(pricingData) ? pricingData : [];
      const safeItems = Array.isArray(itemsData) ? itemsData : [];

      setVehicles(safeVehicles);
      setPricingCatalog(safePricing);
      
      // Include ALL active items for selection (not just those with stock > 0)
      // This allows editing existing records that may reference items now out of stock
      const activeItems = safeItems.filter(item => item.active);
      setInventoryItems(activeItems);

    } catch (err) {
      console.error('❌ Error loading initial data:', err);
      setError(`Failed to load data: ${err.message}`);
      // CRITICAL: Set empty arrays on error
      setVehicles([]);
      setPricingCatalog([]);
      setInventoryItems([]);
      setFilteredItems([]);
    } finally {
      setLoading(false);
      setLoadingItems(false);
    }
  };

  // NEW: Get filtered items for display based on maintenance type and toggle state
  const getFilteredItemsForDisplay = () => {
    if (!inventoryItems.length) return [];

    const activeTypes = selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes : [primaryMaintenanceType];
    const suggestedCategories = [...new Set(activeTypes.flatMap((type) => getSuggestedCategories(type)))];
    const suggestedLabels = getSuggestedLabelsForTypes(activeTypes);
    const activeLabels = selectedInventoryLabel ? [selectedInventoryLabel] : suggestedLabels;
    const sortedItems = [...inventoryItems].sort((a, b) => {
      const aSuggested = itemMatchesInventoryLabels(a, activeLabels) || suggestedCategories.includes(a.category);
      const bSuggested = itemMatchesInventoryLabels(b, activeLabels) || suggestedCategories.includes(b.category);

      if (aSuggested !== bSuggested) {
        return aSuggested ? -1 : 1;
      }

      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (showAllItems || activeLabels.length === 0) {
      return sortedItems;
    }

    return sortedItems.filter((item) => itemMatchesInventoryLabels(item, activeLabels) || suggestedCategories.includes(item.category));
  };

  // NEW: Get smart suggestions info
  const getSmartSuggestionsInfo = () => {
    const activeTypes = selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes : [primaryMaintenanceType];
    const suggestedCategories = [...new Set(activeTypes.flatMap((type) => getSuggestedCategories(type)))];
    const suggestedLabels = getSuggestedLabelsForTypes(activeTypes);
    const description = activeTypes.map((type) => getMaintenanceTypeDescription(type)).filter(Boolean).join(' • ');
    const suggested = suggestedLabels.length === 0
      ? inventoryItems
      : inventoryItems.filter((item) => itemMatchesInventoryLabels(item, suggestedLabels) || suggestedCategories.includes(item.category));
    const all = inventoryItems;
    const hasNonTypical = all.some((item) => !(itemMatchesInventoryLabels(item, suggestedLabels) || suggestedCategories.includes(item.category)));
    
    return {
      suggestedCategories,
      suggestedLabels,
      description,
      suggestedCount: suggested.length,
      totalCount: all.length,
      hasNonTypical,
      hasSuggestions: suggestedLabels.length > 0 || suggestedCategories.length > 0
    };
  };

  const getQuickAddSuggestions = () => {
    const activeTypes = selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes : [primaryMaintenanceType];
    const suggestedCategories = [...new Set(activeTypes.flatMap((type) => getSuggestedCategories(type)))];
    const suggestedLabels = getSuggestedLabelsForTypes(activeTypes);
    const activeLabels = selectedInventoryLabel ? [selectedInventoryLabel] : suggestedLabels;
    const inventorySuggestions = inventoryItems
      .filter((item) => (itemMatchesInventoryLabels(item, activeLabels) || suggestedCategories.includes(item.category)) && Number(item.available_stock ?? item.stock_on_hand ?? 0) > 0)
      .slice(0, 6);

    const manualSuggestions = [...new Set(
      activeTypes.flatMap((type) => MAINTENANCE_MANUAL_SUGGESTIONS[type] || [])
    )].slice(0, 5);

    return {
      inventorySuggestions,
      manualSuggestions,
      activeTypes,
      suggestedLabels,
    };
  };

  const formatInventoryOptionLabel = (item) => {
    if (!item) return 'Select inventory item';
    const stock = Number(item.available_stock ?? item.stock_on_hand ?? 0);
    const unit = item.unit || 'units';
    const stockLabel = stock <= 0 ? `Out of stock (${formatQuantity(stock)} ${unit})` : `${formatQuantity(stock)} ${unit} available`;

    return [
      item.name,
      normalizeInventoryLabels(item.labels || []).slice(0, 2).map(formatInventoryLabel).join(', ') || item.category || null,
      item.sku ? `SKU ${item.sku}` : null,
      stockLabel,
    ].filter(Boolean).join(' • ');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'labor_rate_mad' ? normalizeWholeMadInput(value) : value
    }));
  };

  const handleMaintenanceTypeToggle = (type) => {
    setFormData(prev => {
      const currentTypes = Array.isArray(prev.maintenance_types) && prev.maintenance_types.length > 0
        ? prev.maintenance_types
        : [prev.maintenance_type].filter(Boolean);

      const nextTypes = currentTypes.includes(type)
        ? currentTypes.filter((item) => item !== type)
        : [...currentTypes, type];

      if (nextTypes.length === 0) {
        return prev;
      }

      return {
        ...prev,
        maintenance_types: nextTypes,
        maintenance_type: nextTypes.join(' + '),
      };
    });
  };

  // NEW: Handle maintenance type change prompt responses
  const handleKeepNonTypicalParts = () => {
    setShowMaintenanceTypeChangePrompt(false);
    setNonTypicalPartsToHandle([]);
  };

  const handleRemoveNonTypicalParts = () => {
    const updatedPartsUsed = removeNonTypicalParts(
      formData.parts_used,
      inventoryItems,
      primaryMaintenanceType
    );
    
    setFormData(prev => ({
      ...prev,
      parts_used: updatedPartsUsed
    }));
    
    setShowMaintenanceTypeChangePrompt(false);
    setNonTypicalPartsToHandle([]);
  };

  // NEW: Parts Used Management Functions
  const addPartsUsed = () => {
    addInventoryPart();
  };

  const removePartsUsed = (index) => {
    console.log('➖ Removing part at index:', index);
    const newPartsUsed = formData.parts_used.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, parts_used: newPartsUsed }));
  };

  const updatePartsUsed = (index, field, value) => {
    console.log('🔄 Updating part at index:', index, 'field:', field, 'value:', value);
    const newPartsUsed = [...formData.parts_used];
    const nextPart = { ...newPartsUsed[index], [field]: value };

    if (field === 'item_id') {
      const selectedItem = getItemDetails(value);
      if (selectedItem) {
        const unitCost = parseFloat(selectedItem.cost_mad || 0) || 0;
        const unitPrice = getInventorySellPrice(selectedItem, nextPart.unit_price_mad);
        nextPart.item_name = selectedItem.name || nextPart.item_name || '';
        nextPart.part_name = selectedItem.name || nextPart.part_name || '';
        nextPart.part_number = selectedItem.sku || nextPart.part_number || '';
        nextPart.unit = selectedItem.unit || nextPart.unit || 'units';
        nextPart.unit_cost_mad = unitCost;
        nextPart.unit_price_mad = unitPrice;
        nextPart.total_cost_mad = (parseFloat(nextPart.quantity || 0) || 0) * unitCost;
        nextPart.total_sell_mad = (parseFloat(nextPart.quantity || 0) || 0) * unitPrice;
      }
    }

    if (field === 'quantity') {
      const selectedItem = (nextPart.source_type || 'inventory') === 'manual' ? null : getItemDetails(nextPart.item_id);
      const quantity = parseFloat(value || 0) || 0;
      const unitCost = (nextPart.source_type || 'inventory') === 'manual'
        ? (parseFloat(nextPart.unit_cost_mad || 0) || 0)
        : (parseFloat(selectedItem?.cost_mad || nextPart.unit_cost_mad || 0) || 0);
      const unitPrice = (nextPart.source_type || 'inventory') === 'manual'
        ? (parseFloat(nextPart.unit_price_mad || nextPart.unit_cost_mad || 0) || 0)
        : getInventorySellPrice(selectedItem, nextPart.unit_price_mad);
      nextPart.unit_cost_mad = unitCost;
      nextPart.unit_price_mad = unitPrice;
      nextPart.total_cost_mad = quantity * unitCost;
      nextPart.total_sell_mad = quantity * unitPrice;
    }

    newPartsUsed[index] = nextPart;
    setFormData(prev => ({ ...prev, parts_used: newPartsUsed }));
  };

  const getItemDetails = (itemId) => {
    const item = inventoryItems.find(item => String(item.id) === String(itemId));
    return item || null;
  };

  // NEW: Check if an item is non-typical for current maintenance type
  const isItemNonTypical = (itemId) => {
    const item = getItemDetails(itemId);
    return item && !isItemTypicalForMaintenance(item, primaryMaintenanceType);
  };

  // ENHANCED: Stock validation function with detailed checking
  const validateStockForPart = (itemId, requestedQuantity) => {
    const item = getItemDetails(itemId);
    if (!item) return { valid: false, error: 'Item not found' };
    
    const available = item.available_stock ?? item.stock_on_hand ?? 0;
    const requested = parseFloat(requestedQuantity) || 0;
    
    if (requested <= 0) {
      return { valid: false, error: tr('Quantity must be greater than 0', 'La quantité doit être supérieure à 0') };
    }
    
    if (requested > available) {
      return { 
        valid: false, 
        error: `Insufficient stock. Requested: ${requested}, Available: ${available}`,
        available,
        requested,
        shortage: requested - available
      };
    }
    
    return { 
      valid: true, 
      available, 
      requested,
      remaining: available - requested
    };
  };

  // ENHANCED: Get maximum allowed quantity for an item
  const getMaxQuantityForItem = (itemId) => {
    const item = getItemDetails(itemId);
    return item ? (item.available_stock ?? item.stock_on_hand ?? 0) : 0;
  };

  // NEW: Check parts availability
  const checkPartsAvailability = async (partsUsed) => {
    const checks = [];
    
    for (const part of partsUsed) {
      try {
        const item = getItemDetails(part.item_id) || await InventoryService.getItemById(part.item_id);
        if (item) {
          const required = parseFloat(part.quantity || 0) || 0;
          const available = item.available_stock ?? item.stock_on_hand ?? 0;
          const sufficient = available >= required;
          
          checks.push({
            item_id: part.item_id,
            item_name: item.name,
            required,
            available,
            sufficient,
            shortage: sufficient ? 0 : required - available
          });
        }
      } catch (error) {
        console.error(`Error checking availability for item ${part.item_id}:`, error);
      }
    }
    
    return checks;
  };

  const calculateTotalCost = () => {
    const laborCost = parseFloat(formData.labor_rate_mad) || 0;
    const additionalPartsCost = parseFloat(formData.parts_cost_mad) || 0;
    const tax = parseFloat(formData.tax_mad) || 0;
    
    let inventoryPartsCost = 0;
    let manualPartsCost = 0;
    formData.parts_used.forEach(part => {
      const quantity = parseFloat(part.quantity || 0) || 0;
      if ((part.source_type || 'inventory') === 'manual') {
        manualPartsCost += (parseFloat(part.unit_cost_mad || 0) || 0) * quantity;
      } else {
        const item = inventoryItems.find(item => item.id === parseInt(part.item_id));
        if (item && quantity) {
          inventoryPartsCost += getInventorySellPrice(item, part.unit_price_mad) * quantity;
        } else {
          inventoryPartsCost += (parseFloat(part.unit_price_mad || 0) || 0) * quantity;
        }
      }
    });
    
    const totalCost = laborCost + additionalPartsCost + tax + inventoryPartsCost + manualPartsCost;
    
    return {
      laborCost,
      inventoryPartsCost,
      manualPartsCost,
      additionalPartsCost,
      totalCost
    };
  };

  const saveMaintenanceRecord = async ({ formOverride = null, statusOverride = null } = {}) => {
    const sourceFormData = formOverride || formData;
    const statusToSave = statusOverride || sourceFormData.status;

    try {
      setLoading(true);
      setError(null);

      console.log('🚀 Form submission started');
      console.log('🚀 Current form data:', sourceFormData);

      // Validate required fields
      if (!sourceFormData.vehicle_id) {
        throw new Error(tr('Please select a vehicle', 'Veuillez sélectionner un véhicule'));
      }

      const selectedMaintenanceTypes = Array.isArray(sourceFormData.maintenance_types) && sourceFormData.maintenance_types.length > 0
        ? sourceFormData.maintenance_types
        : parseMaintenanceTypes(sourceFormData.maintenance_type);

      if (selectedMaintenanceTypes.length === 0) {
        throw new Error(tr('Please select at least one maintenance type', 'Veuillez sélectionner au moins un type de maintenance'));
      }

      if (!sourceFormData.scheduled_date) {
        throw new Error(tr('Please enter a scheduled date', 'Veuillez saisir une date planifiée'));
      }

      // ENHANCED: Validate parts used with stock validation
      const partsErrors = [];
      const stockValidationErrors = [];
      
      sourceFormData.parts_used.forEach((part, index) => {
        if ((part.source_type || 'inventory') === 'manual') {
          if (!part.part_name?.trim()) {
            partsErrors.push(`Part ${index + 1}: Manual part name is required`);
          }
          if (!part.unit_cost_mad || parseFloat(part.unit_cost_mad) < 0) {
            partsErrors.push(`Part ${index + 1}: Manual part unit cost is required`);
          }
        } else if (!part.item_id) {
          partsErrors.push(`Part ${index + 1}: Item is required`);
        }
        if (!part.quantity || part.quantity <= 0) {
          partsErrors.push(`Part ${index + 1}: Valid quantity is required`);
        }
        
        // ENHANCED: Stock validation for each part
        if ((part.source_type || 'inventory') !== 'manual' && part.item_id && part.quantity > 0) {
          const stockValidation = validateStockForPart(part.item_id, part.quantity);
          if (!stockValidation.valid) {
            const item = getItemDetails(part.item_id);
            const itemName = item ? item.name : `Item ${part.item_id}`;
            stockValidationErrors.push(`${itemName}: ${stockValidation.error}`);
          }
        }
      });
      
      if (partsErrors.length > 0) {
        throw new Error(`${tr('Parts validation errors:', 'Erreurs de validation des pièces :')} ${partsErrors.join(', ')}`);
      }
      
      if (stockValidationErrors.length > 0) {
        throw new Error(`${tr('Stock validation errors:', 'Erreurs de validation du stock :')} ${stockValidationErrors.join('; ')}`);
      }

      // Check stock availability for parts (only for new records or increased quantities)
      if (sourceFormData.parts_used.length > 0 && !editingRecord) {
        const stockChecks = await checkPartsAvailability(
          sourceFormData.parts_used.filter((part) => (part.source_type || 'inventory') !== 'manual')
        );
        const warnings = stockChecks.filter(check => !check.sufficient);
        setStockWarnings(warnings);
        
        if (warnings.length > 0) {
          const shortageDetails = warnings.map(warning => 
            `${warning.item_name}: need ${warning.required}, have ${warning.available}`
          ).join('; ');
          throw new Error(`${tr('Insufficient inventory:', 'Inventaire insuffisant :')} ${shortageDetails}`);
        }
      }

      // CRITICAL FIX: Convert vehicle_id to integer BEFORE sending to service
      const vehicleIdAsInteger = parseInt(sourceFormData.vehicle_id);
      if (!vehicleIdAsInteger || isNaN(vehicleIdAsInteger)) {
        throw new Error(tr('Invalid vehicle selection', 'Sélection de véhicule invalide'));
      }

      // Enrich parts_used with inventory data for proper cost calculation
      const enrichedPartsUsed = await Promise.all(
        sourceFormData.parts_used.map(async (part) => {
          if ((part.source_type || 'inventory') === 'manual') {
            const quantity = parseFloat(part.quantity || 0) || 0;
            const unitCost = parseFloat(part.unit_cost_mad || 0) || 0;
            const unitPrice = parseFloat(part.unit_price_mad || part.unit_sell_mad || part.unit_cost_mad || 0) || unitCost;
            return {
              ...part,
              source_type: 'manual',
              item_id: null,
              quantity,
              part_name: part.part_name?.trim() || 'Manual Part',
              part_number: part.part_number?.trim() || null,
              item_name: part.part_name?.trim() || 'Manual Part',
              unit_cost_mad: unitCost,
              unit_price_mad: unitPrice,
              total_cost_mad: unitCost * quantity,
              total_sell_mad: unitPrice * quantity,
              unit: part.unit || 'unit'
            };
          }

          try {
            const item = await InventoryService.getItemById(part.item_id);
            const unitCost = item ? (item.cost_mad || 0) : (part.unit_cost_mad || 0);
            const explicitUnitPrice =
              parseFloat(part.unit_price_mad || part.unit_sell_mad || part.sell_price_mad || 0) || 0;
            const unitPrice = item
              ? (parseFloat(item.price_mad || 0) || parseFloat(item.cost_mad || 0) || explicitUnitPrice || (part.unit_cost_mad || 0))
              : (explicitUnitPrice || (part.unit_cost_mad || 0));
            const quantity = parseFloat(part.quantity || 0) || 0;
            return {
              ...part,
              source_type: 'inventory',
              quantity,
              item_name: item ? item.name : (part.item_name || tr('Unknown Item', 'Article inconnu')),
              part_name: item ? item.name : (part.part_name || part.item_name || tr('Unknown Item', 'Article inconnu')),
              part_number: item ? item.sku : (part.part_number || null),
              unit_cost_mad: unitCost,
              unit_price_mad: unitPrice,
              total_cost_mad: item ? (unitCost * quantity) : (part.total_cost_mad || 0),
              total_sell_mad: unitPrice * quantity,
              unit: item ? item.unit : 'units'
            };
          } catch (error) {
            console.error(`Error enriching part ${part.item_id}:`, error);
            const quantity = parseFloat(part.quantity || 0) || 0;
            const unitCost = part.unit_cost_mad || 0;
            const unitPrice = part.unit_price_mad || part.unit_cost_mad || 0;
            return {
              ...part,
              source_type: 'inventory',
              quantity,
              item_name: part.item_name || tr('Unknown Item', 'Article inconnu'),
              part_name: part.part_name || part.item_name || tr('Unknown Item', 'Article inconnu'),
              part_number: part.part_number || null,
              unit_cost_mad: unitCost,
              unit_price_mad: unitPrice,
              total_cost_mad: part.total_cost_mad || (unitCost * quantity),
              total_sell_mad: part.total_sell_mad || (unitPrice * quantity),
              unit: 'units'
            };
          }
        })
      );

      const maintenanceData = {
        vehicle_id: vehicleIdAsInteger, // FIXED: Send as integer, not string
        maintenance_type: selectedMaintenanceTypes.join(' + '),
        status: statusToSave,
        scheduled_date: sourceFormData.scheduled_date,
        completed_date: statusToSave === 'completed' ? (sourceFormData.completed_date || sourceFormData.scheduled_date) : null,
        odometer_reading: sourceFormData.odometer_reading ? parseInt(sourceFormData.odometer_reading) : null,
        labor_rate_mad: parseInt(sourceFormData.labor_rate_mad, 10) || 0, // Fixed whole-MAD price
        parts_cost_mad: parseFloat(sourceFormData.parts_cost_mad) || 0,
        tax_mad: parseFloat(sourceFormData.tax_mad) || 0,
        notes: sourceFormData.notes.trim(),
        technician_name: sourceFormData.technician_name.trim(),
        parts_used: enrichedPartsUsed, // Use enriched parts data
        created_by: 'Admin' // TODO: Get from auth context
        // REMOVED: external_cost_mad field completely
      };

      console.log('🔍 Form submitting vehicle_id:', vehicleIdAsInteger, typeof vehicleIdAsInteger);
      console.log('📝 Complete maintenance data (no external cost):', maintenanceData);
      console.log('📦 Parts used:', enrichedPartsUsed);

      let savedMaintenance = null;

      if (editingRecord) {
        console.log('🔄 Updating existing record with ID:', editingRecord.id);
        savedMaintenance = await MaintenanceTrackingService.updateMaintenanceRecord(editingRecord.id, maintenanceData);
        console.log('✅ Record updated successfully');
      } else {
        console.log('➕ Creating new record');
        savedMaintenance = await MaintenanceTrackingService.createMaintenanceRecord(maintenanceData);
        console.log('✅ Record created successfully');
      }

      if (!editingRecord && initialContext?.report?.id && savedMaintenance?.id) {
        const nextStatus = maintenanceData.status === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress';
        await VehicleReportService.updateReport(initialContext.report.id, {
          maintenance_id: savedMaintenance.id,
          maintenance_cost_total: savedMaintenance.cost || maintenanceData.parts_cost_mad || 0,
          status: nextStatus,
        });
      }

      console.log('🎉 Form submission completed successfully');
      onSuccess();
      
    } catch (err) {
      console.error('❌ Error saving maintenance record:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveMaintenanceRecord();
  };

  const { laborCost, inventoryPartsCost, manualPartsCost, additionalPartsCost, totalCost } = calculateTotalCost();
  const formatQuantity = (value) => {
    const number = parseFloat(value || 0) || 0;
    return Number.isInteger(number) ? number.toString() : number.toFixed(2).replace(/\.?0+$/, '');
  };
  const smartInfo = getSmartSuggestionsInfo();
  const quickSuggestions = getQuickAddSuggestions();
  const searchedInventoryItems = itemSearchTerm.trim() ? filteredItems : [];
  const inventoryPartCount = formData.parts_used.filter((part) => (part.source_type || 'inventory') !== 'manual').length;
  const manualPartCount = formData.parts_used.filter((part) => (part.source_type || 'inventory') === 'manual').length;
  const partQuantityByUnit = formData.parts_used.reduce((summary, part) => {
    const quantity = parseFloat(part.quantity || 0) || 0;
    if (quantity <= 0) return summary;
    const item = (part.source_type || 'inventory') === 'manual' ? null : getItemDetails(part.item_id);
    const unit = part.unit || item?.unit || ((part.source_type || 'inventory') === 'manual' ? tr('unit', 'unite') : tr('unit', 'unite'));
    summary[unit] = (summary[unit] || 0) + quantity;
    return summary;
  }, {});
  const partsQuantitySummary = Object.entries(partQuantityByUnit)
    .map(([unit, quantity]) => `${Number.isInteger(quantity) ? quantity : quantity.toFixed(2).replace(/\.?0+$/, '')} ${unit}`)
    .join(' • ') || tr('No quantity yet', 'Aucune quantite');
  const inventoryInlineFocus = showPartsEditor && partsSourceTab === 'inventory';
  const manualInlineFocus = showPartsEditor && partsSourceTab === 'manual';
  const saveDisabled = loading || stockWarnings.length > 0;
  const missingFields = [
    !formData.vehicle_id ? tr('Vehicle', 'Vehicule') : null,
    selectedMaintenanceTypes.length === 0 ? tr('Maintenance type', 'Type de maintenance') : null,
    !formData.scheduled_date ? tr('Scheduled date', 'Date prevue') : null,
  ].filter(Boolean);
  const isReadyToSave = missingFields.length === 0 && stockWarnings.length === 0;
  const isQuickCompleteType = selectedMaintenanceTypes.some((type) => QUICK_COMPLETE_TYPES.has(type));
  const hasManualCost = laborCost > 0 || additionalPartsCost > 0 || (parseFloat(formData.tax_mad || 0) || 0) > 0;
  // CRITICAL: Safe array access
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const filteredVehicles = safeVehicles.filter((vehicle) => {
    const query = vehicleSearchTerm.trim().toLowerCase();
    if (!query) return true;
    return (
      (vehicle.name || '').toLowerCase().includes(query) ||
      (vehicle.plate_number || '').toLowerCase().includes(query) ||
      (vehicle.model || '').toLowerCase().includes(query)
    );
  });
  const selectedVehicle = safeVehicles.find(vehicle => String(vehicle.id) === String(formData.vehicle_id));
  const recommendedInventoryItems = getRecommendedInventoryItems(
    inventoryItems,
    selectedVehicle?.model,
    primaryMaintenanceType
  ).filter(({ item }) => Number(item?.available_stock ?? item?.stock_on_hand ?? 0) > 0);
  const handleAddAllRecommendedItems = () => {
    recommendedInventoryItems.forEach(({ item, quantity }) => {
      addSuggestedInventoryPart(item, quantity);
    });
  };
  const maintenanceStatusOptions = [
    {
      value: 'scheduled',
      label: 'Scheduled',
      shortLabel: 'Scheduled',
      icon: Clock3,
      className: 'text-amber-800 hover:bg-amber-50',
      activeClassName: 'bg-amber-500 text-white shadow-sm',
    },
    {
      value: 'in_progress',
      label: 'In Progress',
      shortLabel: 'Progress',
      icon: PlayCircle,
      className: 'text-blue-800 hover:bg-blue-50',
      activeClassName: 'bg-blue-600 text-white shadow-sm',
    },
    {
      value: 'completed',
      label: 'Completed',
      shortLabel: 'Done',
      icon: CheckCircle2,
      className: 'text-green-800 hover:bg-green-50',
      activeClassName: 'bg-green-600 text-white shadow-sm',
    },
  ];
  const maintenanceSteps = [
    { id: 1, label: 'Vehicle & Job', shortLabel: 'Job' },
    { id: 2, label: 'Cost & Parts', shortLabel: 'Cost + Parts' },
    { id: 3, label: 'Notes & Review', shortLabel: 'Review' },
  ];
  const currentStepMeta = maintenanceSteps.find((step) => step.id === activeStep) || maintenanceSteps[0];
  const isFinalStep = activeStep === maintenanceSteps.length;
  const selectedStatusLabel = maintenanceStatusOptions.find((option) => option.value === formData.status)?.label || 'Scheduled';
  const selectedStatusTone = maintenanceStatusOptions.find((option) => option.value === formData.status)?.activeClassName || 'bg-amber-500 text-white';
  const goToNextStep = () => setActiveStep((prev) => Math.min(prev + 1, maintenanceSteps.length));
  const goToPreviousStep = () => setActiveStep((prev) => Math.max(prev - 1, 1));
  const handleSaveDraft = async () => {
    const draftFormData = { ...formData, status: 'scheduled', completed_date: '' };
    await saveMaintenanceRecord({ formOverride: draftFormData, statusOverride: 'scheduled' });
  };
  const handleQuickComplete = async () => {
    const nextParts = formData.parts_used.length > 0
      ? formData.parts_used
      : [
          ...quickSuggestions.inventorySuggestions.slice(0, 2).map((item) => ({
            source_type: 'inventory',
            item_id: String(item.id),
            quantity: 1,
            notes: 'Quick complete',
          })),
          ...quickSuggestions.manualSuggestions.slice(0, quickSuggestions.inventorySuggestions.length > 0 ? 0 : 1).map((partName) => ({
            source_type: 'manual',
            item_id: '',
            part_name: partName,
            part_number: '',
            quantity: 1,
            unit_cost_mad: '0',
            notes: 'Quick complete',
          })),
        ];

    const quickFormData = {
      ...formData,
      status: 'completed',
      completed_date: formData.completed_date || formData.scheduled_date || new Date().toISOString().split('T')[0],
      parts_used: nextParts,
      notes: formData.notes || `Quick complete: ${selectedMaintenanceTypes.join(', ') || primaryMaintenanceType}`,
    };

    await saveMaintenanceRecord({ formOverride: quickFormData, statusOverride: 'completed' });
  };
  const handleCompleteWithoutParts = async () => {
    const completedFormData = {
      ...formData,
      status: 'completed',
      completed_date: formData.completed_date || formData.scheduled_date || new Date().toISOString().split('T')[0],
      parts_used: [],
    };

    await saveMaintenanceRecord({ formOverride: completedFormData, statusOverride: 'completed' });
  };
  useEffect(() => {
    if (!selectedVehicle) return;

    const vehicleOdometer = selectedVehicle.current_odometer;
    if (vehicleOdometer === null || vehicleOdometer === undefined || vehicleOdometer === '') return;

    setFormData(prev => {
      if (String(prev.odometer_reading || '') === String(vehicleOdometer)) {
        return prev;
      }

      if (prev.odometer_reading && prev.odometer_reading !== '') {
        return prev;
      }

      return {
        ...prev,
        odometer_reading: String(vehicleOdometer),
      };
    });
  }, [selectedVehicle]);

  useEffect(() => {
    if (!showCostInputs && (editingRecord || laborCost > 0 || additionalPartsCost > 0 || (parseFloat(formData.tax_mad || 0) || 0) > 0)) {
      setShowCostInputs(true);
    }

    if (!showPartsEditor && (editingRecord || formData.parts_used.length > 0)) {
      setShowPartsEditor(true);
    }
  }, [editingRecord, laborCost, additionalPartsCost, formData.tax_mad, formData.parts_used.length, showCostInputs, showPartsEditor]);

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            {editingRecord
              ? tr('Edit Maintenance Record', 'Modifier la fiche de maintenance')
              : tr('Add Maintenance Record', 'Ajouter une fiche de maintenance')}
            {editingRecord && (
              <span className="text-sm text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                Ref: {formatMaintenanceReference(editingRecord.id)}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="p-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isReadyToSave ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {isReadyToSave ? tr('Ready', 'Pret') : tr('Incomplete', 'Incomplet')}
          </span>
          <span className="text-xs font-medium text-slate-600">
            {isReadyToSave
              ? tr('Required fields are complete.', 'Les champs requis sont complets.')
              : `${tr('Missing', 'Manquant')}: ${missingFields.join(', ')}`}
          </span>
        </div>

        {initialContext?.report && !editingRecord && (
          <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-900">{tr('Linked rental report', 'Rapport de location lie')}</p>
            <p className="mt-1 text-sm text-orange-800">
              {tr('This maintenance record was opened from a rental inspection report for vehicle', 'Ce dossier de maintenance a ete ouvert depuis un rapport de controle de location pour le vehicule')} <strong>{initialContext.vehicleId}</strong>.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-orange-800">
              <div>
                <span className="font-medium">{tr('Rental', 'Location')}:</span> {formatRentalReference(initialContext.rentalId)}
              </div>
              <div>
                <span className="font-medium">{tr('Type', 'Type')}:</span> {initialContext.report.report_type}
              </div>
              <div>
                <span className="font-medium">{tr('Severity', 'Gravite')}:</span> {initialContext.report.severity}
              </div>
              <div>
                <span className="font-medium">{tr('Photos linked', 'Photos liees')}:</span> {initialContext.report.photos?.length || 0}
              </div>
            </div>
          </div>
        )}

        {/* Stock Warnings */}
        {stockWarnings.length > 0 && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangleIcon className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
              <div>
                <p className="text-yellow-800 font-medium">{tr('Insufficient Inventory', 'Stock insuffisant')}</p>
                <ul className="text-yellow-700 text-sm mt-1">
                  {stockWarnings.map((warning, index) => (
                    <li key={index}>
                      {warning.item_name}: {tr('need', 'besoin de')} {warning.required}, {tr('have', 'disponible')} {warning.available} 
                      ({tr('short', 'manque')} {warning.shortage})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Maintenance Type Change Prompt */}
        {showMaintenanceTypeChangePrompt && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <InfoIcon className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
              <div className="flex-1">
                <p className="text-blue-800 font-medium">{tr('Maintenance Type Changed', 'Type de maintenance modifie')}</p>
                <p className="text-blue-700 text-sm mt-1">
                  {tr('You have', 'Vous avez')} {nonTypicalPartsToHandle.length} {tr('part(s) that are not typical for', 'piece(s) qui ne sont pas typiques pour')} "{primaryMaintenanceType}".
                  {' '}{tr('What would you like to do?', 'Que souhaitez-vous faire ?')}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleKeepNonTypicalParts}
                    className="text-blue-700 border-blue-300 hover:bg-blue-100"
                  >
                    {tr('Keep All Parts', 'Garder toutes les pieces')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleRemoveNonTypicalParts}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {tr('Remove Non-Typical', 'Retirer les non typiques')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:pb-24">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
            <div className="min-w-0 space-y-4">
              <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">{tr('Maintenance editor', 'Editeur de maintenance')}</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">{currentStepMeta.label}</h3>
                    <p className="mt-1 text-sm text-slate-500">{tr('Step', 'Etape')} {activeStep} {tr('of', 'sur')} {maintenanceSteps.length}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {maintenanceSteps.map((step) => {
                      const isActive = step.id === activeStep;
                      const isCompleted = step.id < activeStep;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setActiveStep(step.id)}
                          className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                            isActive
                              ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : isCompleted
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{step.id}</p>
                          <p className="mt-1 text-sm font-semibold">{step.shortLabel}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="hidden">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Vehicle', 'Vehicule')}</p>
                  <p className="mt-2 text-base font-bold text-slate-900">
                    {selectedVehicle ? `${selectedVehicle.plate_number || tr('No Plate', 'Sans plaque')} • ${selectedVehicle.name}` : tr('Choose vehicle', 'Choisir un vehicule')}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Estimated Total', 'Total estime')}</p>
                  <p className="mt-2 text-base font-bold text-blue-700">MAD {totalCost.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formData.parts_used.length} {tr(formData.parts_used.length === 1 ? 'part line' : 'part lines', formData.parts_used.length === 1 ? 'ligne de piece' : 'lignes de pieces')}</p>
                </div>
              </div>

              {activeStep === 1 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{tr('Vehicle & Job', 'Vehicule et intervention')}</h3>
              <p className="mt-1 text-sm text-gray-500">{tr('Choose the vehicle and maintenance categories for this record.', 'Choisissez le vehicule et les categories de maintenance pour ce dossier.')}</p>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Car className="w-4 h-4 inline mr-1" />
                {tr('Vehicle *', 'Vehicule *')}
              </label>
                  <div className="rounded-xl border border-slate-200 p-2 shadow-sm">
                <div className="relative mb-2">
                  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={vehicleSearchTerm}
                    onChange={(e) => setVehicleSearchTerm(e.target.value)}
                    className="w-full rounded-md border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={tr('Search vehicle or plate...', 'Rechercher un vehicule ou une plaque...')}
                    disabled={loading}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {filteredVehicles.map((vehicle) => {
                    const selected = String(formData.vehicle_id) === String(vehicle.id);
                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, vehicle_id: String(vehicle.id) }))}
                        disabled={loading}
                        className={`rounded-md border px-3 py-2 text-left transition-colors ${
                          selected
                            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-medium">
                          {vehicle.plate_number || tr('No Plate', 'Sans plaque')} - {vehicle.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {vehicle.model || tr('Unknown model', 'Modele inconnu')}
                        </div>
                      </button>
                    );
                  })}
                  {filteredVehicles.length === 0 && (
                    <div className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
                      {tr('No vehicles match this search.', 'Aucun vehicule ne correspond a cette recherche.')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Wrench className="w-4 h-4 inline mr-1" />
                {tr('Maintenance Types *', 'Types de maintenance *')}
              </label>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2 max-h-48 overflow-y-auto shadow-sm">
                {safeMaintenanceTypes.map(type => {
                  const selected = selectedMaintenanceTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleMaintenanceTypeToggle(type)}
                      disabled={loading}
                      className={`rounded-md border px-3 py-2 text-xs font-medium text-left transition-colors ${
                        selected
                          ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedMaintenanceTypes.map((type) => {
                  const maintenanceVisual = getMaintenanceTypeVisual(type);
                  return (
                    <span key={type} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${maintenanceVisual.classes}`}>
                      <span>{maintenanceVisual.emoji}</span>
                      <span>{type}</span>
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {tr('The first selected type drives inventory suggestions. The full set is saved on the maintenance record.', 'Le premier type selectionne pilote les suggestions de stock. L ensemble complet est enregistre dans le dossier de maintenance.')}
              </p>
            </div>
          </div>

          {selectedVehicle && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 shadow-sm">
              <p className="text-sm font-medium text-blue-900">
                {selectedVehicle.plate_number || tr('No Plate', 'Sans plaque')} • {selectedVehicle.name}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {selectedVehicle.model || tr('Unknown model', 'Modele inconnu')}
                {selectedVehicle.current_odometer ? ` • ${tr('Current odometer', 'Compteur actuel')}: ${selectedVehicle.current_odometer} km` : ''}
              </p>
            </div>
          )}

          {/* Status and Dates */}
          <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tr('Status *', 'Statut *')}
              </label>
              <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                {maintenanceStatusOptions.map((option) => {
                  const selected = formData.status === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => !loading && setFormData((prev) => ({ ...prev, status: option.value }))}
                      disabled={loading}
                      className={`inline-flex min-h-[44px] flex-1 basis-[120px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-sm font-semibold leading-none transition-all ${
                        selected ? `${option.activeClassName} ring-2 ring-white shadow-sm` : `bg-white ${option.className}`
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">{option.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                {tr('Scheduled Date *', 'Date prevue *')}
              </label>
              <input
                type="date"
                name="scheduled_date"
                value={formData.scheduled_date}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={loading}
              />
            </div>

            {formData.status === 'completed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('Completed Date', 'Date de fin')}
                </label>
                <input
                  type="date"
                  name="completed_date"
                  value={formData.completed_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Odometer and Technician */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tr('Odometer Reading (km)', 'Releve compteur (km)')}
              </label>
              <input
                type="number"
                name="odometer_reading"
                value={formData.odometer_reading}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
                disabled={loading}
                placeholder={tr('Current odometer reading', 'Releve actuel du compteur')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tr('Technician Name', 'Nom du technicien')}
              </label>
              <input
                type="text"
                name="technician_name"
                value={formData.technician_name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
                placeholder={tr('Name of technician', 'Nom du technicien')}
              />
            </div>
          </div>
          </div>
              )}

          {/* 🚨🚨🚨 CRITICAL FIX: Enhanced Cost Breakdown with Debug Info (REMOVED EXTERNAL COST) */}
              {activeStep === 2 && (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  {tr('Cost Breakdown', 'Detail des couts')}
                </h3>
                {editingRecord && (
                  <span className="self-start text-xs text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">
                    {tr('Original Cost', 'Cout initial')}: {editingRecord.cost || tr('N/A', 'N/D')} MAD
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{tr('Set labor, extra charges, tax, and confirm the final bill.', 'Definissez la main-d oeuvre, les frais supplementaires, la taxe, puis confirmez le montant final.')}</p>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-5">
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{tr('Labor', 'Main-d oeuvre')}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{Math.round(laborCost)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{tr('Inventory Parts', 'Pieces inventaire')}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{inventoryPartsCost.toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{tr('Manual Parts', 'Pieces manuelles')}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{manualPartsCost.toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{tr('Extra Charges + Tax', 'Frais supplementaires + taxe')}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{(additionalPartsCost + (parseFloat(formData.tax_mad || 0) || 0)).toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-600 px-4 py-4 shadow-sm sm:col-span-2 2xl:col-span-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-blue-100">{tr('Estimated Total', 'Total estime')}</p>
                <p className="mt-1 text-xl font-bold text-white">{totalCost.toFixed(2)} <span className="text-xs font-semibold text-blue-100">MAD</span></p>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{tr('Manual costs', 'Couts manuels')}</p>
                <p className="text-xs text-slate-500">
                  {hasManualCost ? tr('Cost inputs are included in this job.', 'Les couts sont inclus dans cette intervention.') : tr('No manual cost needed for this job.', 'Aucun cout manuel necessaire pour cette intervention.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCostInputs((prev) => !prev)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showCostInputs ? tr('Hide cost inputs', 'Masquer les couts') : tr('Add cost inputs', 'Ajouter les couts')}
              </button>
            </div>

            {showCostInputs && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {/* FIXED: Labor Rate is now a fixed price field */}
              <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  {tr('Labor Cost (MAD)', 'Cout main-d oeuvre (MAD)')}
                </label>
                <input
                  type="number"
                  name="labor_rate_mad"
                  value={formData.labor_rate_mad}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={loading}
                  placeholder={tr('Fixed labor cost, no decimals', 'Cout fixe sans decimales')}
                />
                <p className="text-xs text-gray-500 mt-1">{tr('Enter a whole MAD amount only.', 'Saisissez uniquement un montant MAD entier.')}</p>
              </div>

              <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('Additional Parts Price (MAD)', 'Prix pieces supplementaires (MAD)')}
                </label>
                <input
                  type="number"
                  name="parts_cost_mad"
                  value={formData.parts_cost_mad}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">{tr('Use this for shop supplies or extra charges not listed as line items.', 'Utilisez ceci pour les consommables atelier ou frais supplementaires non listes en lignes.')}</p>
              </div>

              {/* REMOVED: External Cost field completely */}

              <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('Tax (MAD)', 'Taxe (MAD)')}
                </label>
                <input
                  type="number"
                  name="tax_mad"
                  value={formData.tax_mad}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">{tr('Tax is added on top of labor and parts totals.', 'La taxe est ajoutee au total main-d oeuvre + pieces.')}</p>
              </div>
            </div>
            )}

            {/* 🚨🚨🚨 CRITICAL FIX: Enhanced Cost Summary with Debug Info (REMOVED EXTERNAL COST) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-3">{tr('Billing Summary', 'Resume de facturation')}</p>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">{tr('Labor Cost:', 'Cout main-d oeuvre :')}</span>
                <span className="font-medium">MAD {Math.round(laborCost)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">{tr('Additional Parts Price:', 'Prix pieces supplementaires :')}</span>
                <span className="font-medium">MAD {additionalPartsCost.toFixed(2)}</span>
              </div>
              {/* REMOVED: External Cost display */}
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">{tr('Tax:', 'Taxe :')}</span>
                <span className="font-medium">MAD {parseFloat(formData.tax_mad || 0).toFixed(2)}</span>
              </div>
              {inventoryPartsCost > 0 && (
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">{tr('Inventory Parts Price:', 'Prix pieces inventaire :')}</span>
                  <span className="font-medium">MAD {inventoryPartsCost.toFixed(2)}</span>
                </div>
              )}
              {manualPartsCost > 0 && (
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">{tr('Manual Parts Price:', 'Prix pieces manuelles :')}</span>
                  <span className="font-medium">MAD {manualPartsCost.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-lg font-bold text-blue-900 pt-3 border-t">
                <span>{tr('Total Price:', 'Prix total :')}</span>
                <span>MAD {totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
              )}

          {/* ENHANCED: Smart Parts Used Section with Stock Validation */}
              {activeStep === 2 && (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 shadow-sm">
            <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                  <PackageIcon className="h-5 w-5 mr-2" />
                  {tr('Parts Used', 'Pieces utilisees')} {formData.parts_used.length > 0 && (
                    <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                      {formData.parts_used.length}
                    </span>
                  )}
                </h3>
                <div className="mt-3 flex w-fit rounded-full border border-slate-200 bg-white p-1">
                  {[
                    { id: 'inventory', label: tr('Inventory', 'Inventaire') },
                    { id: 'manual', label: tr('Manual', 'Manuel') },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setPartsSourceTab(tab.id);
                        setShowPartsEditor(true);
                        if (tab.id === 'manual') {
                          setItemSearchTerm('');
                          setSelectedInventoryLabel('');
                          setShowAllItems(false);
                        }
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        partsSourceTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 border border-blue-200">
                    {inventoryPartCount} {tr(inventoryPartCount === 1 ? 'inventory part' : 'inventory parts', inventoryPartCount === 1 ? 'piece inventaire' : 'pieces inventaire')}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 border border-amber-200">
                    {manualPartCount} {tr(manualPartCount === 1 ? 'manual part' : 'manual parts', manualPartCount === 1 ? 'piece manuelle' : 'pieces manuelles')}
                  </span>
                </div>
              </div>
              <div className="flex lg:pt-1">
                <button
                  type="button"
                  onClick={partsSourceTab === 'inventory' ? addInventoryPart : addManualPart}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <PlusIcon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">
                    {partsSourceTab === 'inventory' ? tr('Add Inventory Item', "Ajouter article d'inventaire") : tr('Add Manual Line', 'Ajouter ligne manuelle')}
                  </span>
                </button>
              </div>
            </div>

            {formData.status === 'completed' && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">{tr('Completing this record will deduct inventory-backed parts from stock.', 'La finalisation de ce dossier deduira du stock les pieces liees a l inventaire.')}</p>
                <p className="mt-1 text-xs text-amber-800">{tr('Manual parts are cost-only and do not affect inventory levels.', "Les pieces manuelles n'affectent pas les niveaux de stock.")}</p>
              </div>
            )}

            {!showPartsEditor && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{tr('No parts needed', 'Aucune piece necessaire')}</p>
                    <p className="text-xs text-slate-500">{tr('Skip parts for simple jobs, or add them only when needed.', 'Passez les pieces pour les interventions simples, ou ajoutez-les seulement si necessaire.')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPartsEditor(true)}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      {tr('Add parts', 'Ajouter pieces')}
                    </button>
                    {isReadyToSave && !formData.notes.trim() && (
                      <button
                        type="button"
                        onClick={handleCompleteWithoutParts}
                        className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                      >
                        {tr('Complete now', 'Terminer maintenant')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {showPartsEditor && (
            <div className="grid gap-5">
              <div className="space-y-4">
                {partsSourceTab === 'inventory' && loadingItems && (
                  <div className="rounded-xl border border-blue-100 bg-white px-4 py-6 text-center">
                    <p className="text-gray-600">{tr('Loading inventory items...', "Chargement des articles d'inventaire...")}</p>
                  </div>
                )}

                {partsSourceTab === 'inventory' && !loadingItems && inventoryItems.length === 0 && (
                  <div className="rounded-xl border border-blue-100 bg-white px-4 py-6 text-center">
                    <p className="text-gray-600">{tr('No active items found. Activate items in Inventory.', "Aucun article actif trouve. Activez des articles dans l'inventaire.")}</p>
                  </div>
                )}

                {partsSourceTab === 'inventory' && inventoryItems.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    {recommendedInventoryItems.length > 0 && (
                      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-emerald-950">
                              {tr('Recommended for', 'Recommande pour')} {selectedVehicle?.model || tr('this vehicle', 'ce vehicule')}
                            </p>
                            <p className="mt-1 text-xs text-emerald-700">
                              {primaryMaintenanceType} • {tr('optional defaults, still editable', 'valeurs par defaut optionnelles, toujours modifiables')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddAllRecommendedItems}
                            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
                            {tr('Add all', 'Tout ajouter')}
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {recommendedInventoryItems.map(({ item, quantity }) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => addSuggestedInventoryPart(item, quantity)}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                            >
                              <span>{getInventoryCategoryVisual(item.category).emoji}</span>
                              <span>{item.name}</span>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                                {formatQuantity(quantity)} {item.unit || tr('unit', 'unite')}
                              </span>
                              <PlusIcon className="h-3.5 w-3.5" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{tr('Find inventory item', "Trouver un article d'inventaire")}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {showAllItems
                            ? tr('Showing all active stock items.', 'Affichage de tous les articles actifs.')
                            : tr('Filtered by maintenance labels.', 'Filtre par etiquettes de maintenance.')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAllItems(!showAllItems);
                          setSelectedInventoryLabel('');
                        }}
                        className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        {showAllItems ? tr('Use suggestions', 'Utiliser suggestions') : tr('Show all', 'Tout afficher')}
                      </button>
                    </div>

                    {smartInfo.suggestedLabels.length > 0 && !showAllItems && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {smartInfo.suggestedLabels.map((label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setSelectedInventoryLabel(selectedInventoryLabel === label ? '' : label)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              selectedInventoryLabel === label
                                ? 'border-blue-500 bg-blue-600 text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {formatInventoryLabel(label)}
                          </button>
                        ))}
                        {selectedInventoryLabel && (
                          <button
                            type="button"
                            onClick={() => setSelectedInventoryLabel('')}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                          >
                            {tr('Clear', 'Effacer')}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="relative mt-3">
                      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={`${tr('Search items by name or SKU...', 'Rechercher des articles par nom ou SKU...')} (${showAllItems ? tr('all items', 'tous les articles') : tr('suggested items', 'articles suggeres')})`}
                        value={itemSearchTerm}
                        onChange={(e) => setItemSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>

                    {itemSearchTerm.trim() && (
                      <div className="mt-3 space-y-2">
                        {searchedInventoryItems.length > 0 ? (
                          searchedInventoryItems.slice(0, 8).map((item) => {
                            const stock = Number(item.available_stock ?? item.stock_on_hand ?? 0) || 0;
                            const unit = item.unit || tr('unit', 'unite');
                            const canUseItem = stock > 0 || editingRecord;

                            return (
                              <button
                                key={item.id}
                                type="button"
                              onClick={() => canUseItem && selectInventorySearchItem(item, 1)}
                              disabled={!canUseItem}
                              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                                  canUseItem
                                    ? 'border-blue-200 bg-blue-50/60 hover:bg-blue-100'
                                    : 'border-amber-200 bg-amber-50/70 opacity-90'
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-3">
                                  <span className="text-lg">{getInventoryCategoryVisual(item.category).emoji}</span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                                      {[item.sku ? `SKU ${item.sku}` : null, item.category || null].filter(Boolean).join(' • ')}
                                    </span>
                                  </span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end gap-1">
                                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                    MAD {getInventorySellPrice(item).toFixed(2)}
                                  </span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    canUseItem ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {stock > 0
                                      ? `${formatQuantity(stock)} ${unit}`
                                      : tr('Out of stock', 'Rupture de stock')}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                            {tr('No inventory items match this search.', 'Aucun article inventaire ne correspond a cette recherche.')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-100/70 p-3 shadow-inner">
            {/* Parts List */}
            {formData.parts_used.length === 0 ? (
              <div className="rounded-xl border border-dashed border-blue-200 bg-white/80 px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-800">{tr('No parts added yet', 'Aucune piece ajoutee pour le moment')}</p>
                <p className="mt-1 text-xs text-gray-500">{tr('Add an inventory or manual part to continue.', 'Ajoutez une piece inventaire ou manuelle pour continuer.')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.parts_used.map((part, index) => {
                  const isManualPart = (part.source_type || 'inventory') === 'manual';
                  const maxQuantity = isManualPart ? 0 : getMaxQuantityForItem(part.item_id);
                  const stockValidation = !isManualPart && part.item_id ? validateStockForPart(part.item_id, part.quantity) : null;
                  const selectedItemForPart = isManualPart ? null : getItemDetails(part.item_id);
                  const partUnit = part.unit || selectedItemForPart?.unit || (isManualPart ? tr('unit', 'unite') : tr('unit', 'unite'));
                  const compactUnit = partUnit === 'liter' ? 'L' : partUnit === 'piece' ? 'pcs' : partUnit;
                  const quantityLabel = `${tr('Qty', 'Qte')} (${compactUnit})`;
                  const quantity = parseFloat(part.quantity || 0) || 0;
                  const unitCostPreview = isManualPart
                    ? (parseFloat(part.unit_cost_mad || 0) || 0)
                    : getInventorySellPrice(selectedItemForPart, part.unit_price_mad);
                  const lineCostPreview = quantity * unitCostPreview;
                  
                  return (
                    <div key={index} className={`rounded-2xl p-4 shadow-sm ring-1 ${
                      isManualPart
                        ? 'border border-amber-200 bg-amber-50/80 ring-amber-100'
                        : 'border border-blue-100 bg-white ring-slate-200'
                    }`}>
                      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                            {tr('Line', 'Ligne')} {index + 1}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          isManualPart ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          <span className="inline-flex min-h-[44px] items-center justify-center rounded-2xl px-3 text-center leading-tight">
                            {isManualPart ? tr('Manual Part', 'Piece manuelle') : tr('Inventory Part', 'Piece inventaire')}
                          </span>
                          </span>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                          <button
                            type="button"
                            onClick={() => removePartsUsed(index)}
                            className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4 mr-1.5" />
                            {tr('Remove', 'Retirer')}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_150px]">
                          {isManualPart ? (
                            <>
                              <div className="min-w-0">
                                <label className="mb-1 block whitespace-nowrap text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                  {tr('Part', 'Piece')}
                                </label>
                                <input
                                  type="text"
                                  value={part.part_name || ''}
                                  onChange={(e) => updatePartsUsed(index, 'part_name', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                  placeholder={tr('Part name', 'Nom de la piece')}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="min-w-0">
                                <label className="mb-1 block whitespace-nowrap text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                  {tr('Item', 'Article')}
                                </label>
                                <select
                                  value={part.item_id}
                                  onChange={(e) => updatePartsUsed(index, 'item_id', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">{tr('Select inventory item', "Selectionner un article d'inventaire")}</option>
                                  {filteredItems.map(item => (
                                    <option 
                                      key={item.id} 
                                      value={item.id}
                                      disabled={(item.available_stock ?? item.stock_on_hand ?? 0) <= 0 && !editingRecord}
                                    >
                                      {formatInventoryOptionLabel(item)}
                                    </option>
                                  ))}
                                  {part.item_name && !filteredItems.find(item => item.id === parseInt(part.item_id)) && (
                                    <option value={part.item_id} disabled>
                                      {part.item_name} ({tr('No longer available', 'Plus disponible')})
                                    </option>
                                  )}
                                </select>
                              </div>
                            </>
                          )}

                          <div className="min-w-0">
                          <label className="mb-1 block whitespace-nowrap text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            {quantityLabel} *
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={!isManualPart && maxQuantity > 0 ? maxQuantity : undefined}
                            value={part.quantity}
                            onChange={(e) => updatePartsUsed(index, 'quantity', e.target.value)}
                            className={`w-full rounded-xl border px-3 py-2 text-sm focus:border-transparent focus:ring-2 ${
                              stockValidation && !stockValidation.valid 
                                ? 'border-red-300 focus:ring-red-500' 
                                : 'border-slate-200 focus:ring-blue-500'
                            }`}
                            placeholder="1"
                          />
                          {isManualPart && (
                            <div className="mt-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {tr('Unit Price (MAD)', 'Prix unitaire (MAD)')}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={part.unit_cost_mad || ''}
                                onChange={(e) => updatePartsUsed(index, 'unit_cost_mad', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                placeholder="0.00"
                              />
                            </div>
                          )}
                          </div>
                        </div>

                        <div className={`min-w-0 rounded-xl border px-4 py-3 ${
                          isManualPart ? 'border-amber-200 bg-white/80' : 'border-slate-200 bg-slate-50'
                        }`}>
                          {stockValidation && (
                            stockValidation.valid ? (
                              <p className="text-sm font-semibold text-emerald-700">
                                {tr('Available', 'Disponible')}: {formatQuantity(stockValidation.available)} {partUnit} → {formatQuantity(stockValidation.remaining)} {partUnit}
                              </p>
                            ) : (
                              <p className="text-sm font-semibold text-red-600">
                                {stockValidation.error}
                              </p>
                            )
                          )}
                          {!stockValidation && !isManualPart && (
                            <p className="text-sm font-medium text-slate-500">{tr('Available', 'Disponible')}: —</p>
                          )}
                          <p className="mt-2 text-sm font-bold text-slate-900">
                            {tr('Cost', 'Cout')}: MAD {lineCostPreview.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            </div>
            )}
          </div>
              )}

          {activeStep === 2 && formData.parts_used.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <Calculator className="h-5 w-5 text-slate-500" />
                    {tr('Cost Breakdown', 'Detail des couts')}
                  </h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {tr('Auto-calculated', 'Calcule automatiquement')}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Parts', 'Pieces')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{formData.parts_used.length}</p>
                  <p className="mt-1 text-xs text-slate-500">{partsQuantitySummary}</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">{tr('Inventory', 'Inventaire')}</p>
                  <p className="mt-2 text-lg font-bold text-blue-800">MAD {inventoryPartsCost.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">{tr('Manual', 'Manuel')}</p>
                  <p className="mt-2 text-lg font-bold text-amber-800">MAD {manualPartsCost.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">{tr('Estimated Total', 'Total estime')}</p>
                  <p className="mt-2 text-xl font-black text-white">MAD {totalCost.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
              {activeStep === 3 && (
                <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{tr('Notes & Context', 'Notes et contexte')}</h3>
              <p className="mt-1 text-sm text-gray-500">{tr('Add anything the team or finance should know later.', "Ajoutez tout element que l'equipe ou la finance doit connaitre plus tard.")}</p>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              {tr('Notes', 'Notes')}
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              disabled={loading}
              placeholder={tr('Describe the work done, issues found, and any finance-relevant context.', 'Decrivez le travail effectue, les problemes trouves et tout contexte utile a la finance.')}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{tr('Review before saving', "Verifier avant d'enregistrer")}</h3>
              <p className="mt-1 text-sm text-slate-500">{tr('Check the key details before saving.', 'Verifiez les informations principales avant enregistrement.')}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Vehicle', 'Vehicule')}</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {selectedVehicle ? `${selectedVehicle.plate_number || tr('No Plate', 'Sans plaque')} • ${selectedVehicle.name}` : tr('No vehicle selected', 'Aucun vehicule selectionne')}
                </p>
                <p className="mt-1 text-sm text-slate-500">{selectedVehicle?.model || '—'}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Status', 'Statut')}</p>
                <p className="mt-2 text-base font-bold text-slate-900">{selectedStatusLabel}</p>
                <p className="mt-1 text-sm text-slate-500">{selectedMaintenanceTypes.length} {tr(selectedMaintenanceTypes.length === 1 ? 'maintenance type' : 'maintenance types', selectedMaintenanceTypes.length === 1 ? 'type de maintenance' : 'types de maintenance')}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Parts', 'Pieces')}</p>
                <p className="mt-2 text-base font-bold text-slate-900">{formData.parts_used.length} {tr(formData.parts_used.length === 1 ? 'line' : 'lines', formData.parts_used.length === 1 ? 'ligne' : 'lignes')}</p>
                <p className="mt-1 text-sm text-slate-500">{inventoryPartCount} {tr('inventory', 'inventaire')} • {manualPartCount} {tr('manual', 'manuel')}</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-600 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">{tr('Estimated Total', 'Total estime')}</p>
                <p className="mt-2 text-2xl font-black text-white">MAD {totalCost.toFixed(2)}</p>
              </div>
            </div>
          </div>
                </>
              )}
            </div>

            <aside className="w-full max-w-full lg:min-w-[280px] lg:max-w-[320px]">
              <div className="space-y-4 lg:sticky lg:top-6">
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">{tr('Live Summary', 'Resume en direct')}</p>
                  <div className="mt-4 space-y-4">
                    <div className={`rounded-2xl border px-4 py-3 ${isReadyToSave ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isReadyToSave ? 'text-green-700' : 'text-amber-700'}`}>
                        {isReadyToSave ? tr('Ready', 'Pret') : tr('Incomplete', 'Incomplet')}
                      </p>
                      <p className={`mt-2 text-sm font-medium ${isReadyToSave ? 'text-green-900' : 'text-amber-900'}`}>
                        {isReadyToSave
                          ? tr('Ready to save or quick complete.', 'Pret a enregistrer ou terminer rapidement.')
                          : `${tr('Missing', 'Manquant')}: ${missingFields.join(', ')}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Vehicle', 'Vehicule')}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {selectedVehicle ? `${selectedVehicle.plate_number || tr('No Plate', 'Sans plaque')} • ${selectedVehicle.name}` : tr('Choose vehicle', 'Choisir un vehicule')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{selectedVehicle?.model || tr('No model selected yet', 'Aucun modele selectionne pour le moment')}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Status', 'Statut')}</p>
                      <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedStatusTone}`}>
                        {selectedStatusLabel}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Maintenance Types', 'Types de maintenance')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes.map((type) => (
                          <span key={type} className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700">
                            {type}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-500">{tr('No types selected yet', 'Aucun type selectionne pour le moment')}</span>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Estimated Total', 'Total estime')}</p>
                        <p className="mt-2 text-2xl font-black text-blue-700">MAD {totalCost.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Parts Lines', 'Lignes de pieces')}</p>
                        <p className="mt-2 text-2xl font-black text-slate-900">{formData.parts_used.length}</p>
                        <p className="mt-1 text-xs text-slate-500">{inventoryPartCount} {tr('inventory', 'inventaire')} • {manualPartCount} {tr('manual', 'manuel')}</p>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Total Quantity', 'Quantite totale')}</p>
                        <p className="mt-2 text-base font-black text-slate-900">{partsQuantitySummary}</p>
                      </div>
                    </div>
                    {stockWarnings.length > 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">{tr('Needs attention', 'Attention requise')}</p>
                        <p className="mt-2 text-sm font-medium text-amber-900">{stockWarnings.length} {tr(stockWarnings.length === 1 ? 'stock warning to resolve before saving' : 'stock warnings to resolve before saving', stockWarnings.length === 1 ? 'alerte stock a resoudre avant enregistrement' : 'alertes stock a resoudre avant enregistrement')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Action Buttons */}
          <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-6 mt-2 border-t border-gray-200 bg-white/95 px-4 sm:px-6 py-4 backdrop-blur">
            <div className="flex justify-end">
              <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saveDisabled}
                  className="w-full sm:w-auto"
                >
                  {tr('Save Draft', 'Enregistrer brouillon')}
                </Button>
                {activeStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToPreviousStep}
                    disabled={loading}
                    className="w-full sm:w-auto"
                  >
                    {tr('Back', 'Retour')}
                  </Button>
                )}
                {activeStep >= 2 && isQuickCompleteType && (
                  <Button
                    type="button"
                    onClick={handleQuickComplete}
                    disabled={!isReadyToSave || loading}
                    className="w-full sm:w-auto bg-green-600 text-white hover:bg-green-700"
                  >
                    {tr('Quick Complete', 'Terminer rapide')}
                  </Button>
                )}
                {!isFinalStep ? (
                  <Button
                    type="button"
                    onClick={goToNextStep}
                    disabled={loading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 text-sm font-semibold shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {tr('Continue to', 'Continuer vers')} {maintenanceSteps[activeStep]?.label || tr('Next Step', 'Étape suivante')}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={saveDisabled}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 py-3 text-sm font-semibold shadow-lg ${
                      saveDisabled
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {editingRecord ? tr('Updating record...', 'Mise à jour de la fiche...') : tr('Saving record...', 'Enregistrement de la fiche...')}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {formData.status === 'completed'
                          ? (editingRecord ? tr('Update & complete maintenance', 'Mettre à jour et terminer la maintenance') : tr('Save & complete maintenance', 'Enregistrer et terminer la maintenance'))
                          : (editingRecord ? tr('Update maintenance record', 'Mettre à jour la fiche de maintenance') : tr('Save maintenance record', 'Enregistrer la fiche de maintenance'))}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default AddMaintenanceForm;
