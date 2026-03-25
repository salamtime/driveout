import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import InventoryService from '../../services/InventoryService';
import VehicleReportService from '../../services/VehicleReportService';
import { supabase } from '../../lib/supabase';
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
  ToggleLeftIcon,
  ToggleRightIcon,
  InfoIcon,
  Clock3,
  PlayCircle,
  CheckCircle2
} from 'lucide-react';

// Import maintenance-inventory mapping
import {
  getSuggestedCategories,
  getMaintenanceTypeDescription,
  isItemTypicalForMaintenance,
  filterItemsByMaintenanceType,
  getNonTypicalParts,
  removeNonTypicalParts
} from '../../config/maintenanceInventoryMapping';

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
  const [previousMaintenanceType, setPreviousMaintenanceType] = useState('');
  const [showMaintenanceTypeChangePrompt, setShowMaintenanceTypeChangePrompt] = useState(false);
  const [nonTypicalPartsToHandle, setNonTypicalPartsToHandle] = useState([]);
  const [reportContextApplied, setReportContextApplied] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  
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

  const addSuggestedInventoryPart = (item) => {
    if (!item?.id) return;

    setFormData((prev) => {
      const existingIndex = prev.parts_used.findIndex((part) => (
        (part.source_type || 'inventory') === 'inventory' && String(part.item_id) === String(item.id)
      ));

      if (existingIndex >= 0) {
        const nextParts = [...prev.parts_used];
        const currentQty = parseInt(nextParts[existingIndex].quantity || 0, 10) || 0;
        nextParts[existingIndex] = {
          ...nextParts[existingIndex],
          quantity: currentQty + 1,
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
            quantity: 1,
            notes: '',
          }
        ]
      };
    });
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

  // 🚨🚨🚨 CRITICAL DEBUG: Log when component mounts and receives editingRecord
  useEffect(() => {
    console.log('🚨🚨🚨 CRITICAL DEBUG: AddMaintenanceForm MOUNTED');
    console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord received:', editingRecord);
    
    if (editingRecord) {
      console.log('🚨🚨🚨 CRITICAL DEBUG: COMPLETE EDITINGRECORD OBJECT:', JSON.stringify(editingRecord, null, 2));
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord keys:', Object.keys(editingRecord));
      
      // 🚨🚨🚨 CRITICAL FIX: Check ALL possible cost field variations (removed external cost)
      console.log('🚨🚨🚨 CRITICAL DEBUG: Cost field analysis:');
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.cost:', editingRecord.cost);
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.total_cost:', editingRecord.total_cost);
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.total_cost_mad:', editingRecord.total_cost_mad);
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.labor_rate_mad:', editingRecord.labor_rate_mad);
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.labor_cost_mad:', editingRecord.labor_cost_mad);
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.parts_cost_mad:', editingRecord.parts_cost_mad);
      console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord.tax_mad:', editingRecord.tax_mad);
      
      // 🚨🚨🚨 CRITICAL FIX: Set form data IMMEDIATELY with enhanced cost mapping (removed external cost)
      console.log('🚨🚨🚨 CRITICAL FIX: Setting form data IMMEDIATELY with enhanced cost mapping (no external cost)');
      
      // FIXED: Only use existing database values, no auto-calculation
      const laborCost = editingRecord.labor_rate_mad || editingRecord.labor_cost_mad || '';
      const partsCost = editingRecord.parts_cost_mad || '';
      const taxCost = editingRecord.tax_mad || 0;
      
      console.log('🚨🚨🚨 CRITICAL DEBUG: Calculated costs (no external):');
      console.log('🚨🚨🚨 CRITICAL DEBUG: laborCost:', laborCost);
      console.log('🚨🚨🚨 CRITICAL DEBUG: partsCost:', partsCost);
      console.log('🚨🚨🚨 CRITICAL DEBUG: taxCost:', taxCost);
      
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
        labor_rate_mad: laborCost?.toString() || '',
        parts_cost_mad: partsCost?.toString() || '',
        tax_mad: taxCost?.toString() || '',
        parts_used: [] // Will be set after inventory loads
      };
      
      console.log('🚨🚨🚨 CRITICAL FIX: MAPPED DATA WITH COSTS (no external):', JSON.stringify(mappedData, null, 2));
      console.log('🚨🚨🚨 CRITICAL FIX: Setting formData now...');
      
      setFormData(mappedData);
      setPreviousMaintenanceType(mappedData.maintenance_type);
      
      console.log('🚨🚨🚨 CRITICAL FIX: Form data set IMMEDIATELY with costs (no external)');
      
      // 🚨🚨🚨 CRITICAL DEBUG: Verify form data was set correctly after a short delay
      setTimeout(() => {
        console.log('🚨🚨🚨 CRITICAL DEBUG: VERIFYING FORM DATA AFTER SET:');
        console.log('🚨🚨🚨 CRITICAL DEBUG: Current formData state after set:', formData);
      }, 100);
    } else {
      console.log('🚨🚨🚨 CRITICAL DEBUG: NO EDITING RECORD - NEW MAINTENANCE MODE');
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
      // Search within current scope (suggested or all items)
      const baseItems = getFilteredItemsForDisplay();
      const searchFiltered = baseItems.filter(item =>
        item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(itemSearchTerm.toLowerCase()))
      );
      setFilteredItems(searchFiltered);
    }
  }, [itemSearchTerm, inventoryItems, primaryMaintenanceType, showAllItems]);

  useEffect(() => {
    // Auto-prefill from pricing catalog when maintenance type changes
    if (primaryMaintenanceType && pricingCatalog.length > 0) {
      const pricing = pricingCatalog.find(p => p.maintenance_type === primaryMaintenanceType);
      if (pricing && !editingRecord) {
        setFormData(prev => ({
          ...prev,
          labor_rate_mad: pricing.default_labor_rate_mad?.toString() || '',
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

  // 🚨🚨🚨 CRITICAL FIX: Handle parts data AFTER inventory loads
  useEffect(() => {
    console.log('🚨🚨🚨 CRITICAL DEBUG: Parts useEffect triggered');
    console.log('🚨🚨🚨 CRITICAL DEBUG: editingRecord exists?', !!editingRecord);
    console.log('🚨🚨🚨 CRITICAL DEBUG: inventoryItems length:', inventoryItems.length);
    
    if (editingRecord && inventoryItems.length > 0) {
      console.log('🚨🚨🚨 CRITICAL DEBUG: PROCESSING PARTS DATA');
      
      // Check multiple possible field names for parts data
      const partsData = editingRecord.parts_used || 
                       editingRecord.parts || 
                       editingRecord.maintenance_parts ||
                       editingRecord.items_used ||
                       editingRecord.inventory_parts ||
                       [];
      
      console.log('🚨🚨🚨 CRITICAL DEBUG: Found parts data:', partsData);
      
      if (Array.isArray(partsData) && partsData.length > 0) {
        const mappedParts = partsData.map(part => {
          console.log('🚨🚨🚨 CRITICAL DEBUG: Processing part:', part);
          return {
            source_type: part.source_type || (part.item_id ? 'inventory' : 'manual'),
            item_id: part.item_id?.toString() || part.id?.toString() || part.inventory_item_id?.toString() || '',
            quantity: part.quantity || part.qty || 1,
            notes: stripFinanceSnapshot(part.notes || part.description || ''),
            unit_cost_mad: part.unit_cost_mad || part.unit_cost || part.cost_per_unit || 0,
            unit_price_mad: part.unit_price_mad || part.unit_sell_mad || part.sell_price_mad || part.unit_cost_mad || part.unit_cost || part.cost_per_unit || 0,
            total_cost_mad: part.total_cost_mad || part.total_cost || part.cost || 0,
            total_sell_mad: part.total_sell_mad || part.line_sell_total_mad || 0,
            item_name: part.item_name || part.name || part.inventory_item_name || '',
            part_name: part.part_name || part.item_name || part.name || '',
            part_number: part.part_number || part.sku || ''
          };
        });
        
        console.log('🚨🚨🚨 CRITICAL DEBUG: Mapped parts:', mappedParts);
        
        setFormData(prev => ({
          ...prev,
          parts_used: mappedParts,
          parts_cost_mad: Math.max(
            0,
            (parseFloat(prev.parts_cost_mad || 0) || 0) -
              mappedParts.reduce((sum, part) => (
                sum + ((parseFloat(part.quantity || 0) || 0) * (parseFloat(part.unit_cost_mad || 0) || 0))
              ), 0)
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
      
      console.log('🚨🚨🚨 CRITICAL DEBUG: Loading initial data...');
      
      // Load vehicles, pricing catalog, and inventory items
      const [vehiclesData, pricingData, itemsData] = await Promise.all([
        supabase.from('saharax_0u4w4d_vehicles').select('id, name, model, plate_number, current_odometer').order('name'),
        MaintenanceTrackingService.getMaintenancePricingCatalog(),
        InventoryService.getItems({ active: true })
      ]);

      if (vehiclesData.error) throw vehiclesData.error;
      
      // CRITICAL: Always ensure arrays
      const safeVehicles = Array.isArray(vehiclesData.data) ? vehiclesData.data : [];
      const safePricing = Array.isArray(pricingData) ? pricingData : [];
      const safeItems = Array.isArray(itemsData) ? itemsData : [];
      
      console.log('🚨🚨🚨 CRITICAL DEBUG: Loaded vehicles:', safeVehicles.length);
      console.log('🚨🚨🚨 CRITICAL DEBUG: Loaded pricing:', safePricing.length);
      console.log('🚨🚨🚨 CRITICAL DEBUG: Loaded inventory items:', safeItems.length);
      
      setVehicles(safeVehicles);
      setPricingCatalog(safePricing);
      
      // Include ALL active items for selection (not just those with stock > 0)
      // This allows editing existing records that may reference items now out of stock
      const activeItems = safeItems.filter(item => item.active);
      setInventoryItems(activeItems);
      
      console.log('🚨🚨🚨 CRITICAL DEBUG: Active inventory items set:', activeItems.length);
      
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
    const sortedItems = [...inventoryItems].sort((a, b) => {
      const aSuggested = suggestedCategories.includes(a.category);
      const bSuggested = suggestedCategories.includes(b.category);

      if (aSuggested !== bSuggested) {
        return aSuggested ? -1 : 1;
      }

      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (showAllItems || suggestedCategories.length === 0) {
      return sortedItems;
    }

    return sortedItems;
  };

  // NEW: Get smart suggestions info
  const getSmartSuggestionsInfo = () => {
    const activeTypes = selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes : [primaryMaintenanceType];
    const suggestedCategories = [...new Set(activeTypes.flatMap((type) => getSuggestedCategories(type)))];
    const description = activeTypes.map((type) => getMaintenanceTypeDescription(type)).filter(Boolean).join(' • ');
    const suggested = suggestedCategories.length === 0
      ? inventoryItems
      : inventoryItems.filter((item) => suggestedCategories.includes(item.category));
    const all = inventoryItems;
    const hasNonTypical = all.some((item) => !suggestedCategories.includes(item.category));
    
    return {
      suggestedCategories,
      description,
      suggestedCount: suggested.length,
      totalCount: all.length,
      hasNonTypical,
      hasSuggestions: suggestedCategories.length > 0
    };
  };

  const getQuickAddSuggestions = () => {
    const activeTypes = selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes : [primaryMaintenanceType];
    const suggestedCategories = [...new Set(activeTypes.flatMap((type) => getSuggestedCategories(type)))];
    const inventorySuggestions = inventoryItems
      .filter((item) => suggestedCategories.includes(item.category) && Number(item.stock_on_hand || 0) > 0)
      .slice(0, 6);

    const manualSuggestions = [...new Set(
      activeTypes.flatMap((type) => MAINTENANCE_MANUAL_SUGGESTIONS[type] || [])
    )].slice(0, 5);

    return {
      inventorySuggestions,
      manualSuggestions,
      activeTypes,
    };
  };

  const formatInventoryOptionLabel = (item) => {
    if (!item) return 'Select inventory item';
    const stock = Number(item.stock_on_hand || 0);
    const unit = item.unit || 'units';
    const stockLabel = stock <= 0 ? `Out of stock (${stock} ${unit})` : `${stock} ${unit} in stock`;

    return [
      item.name,
      item.category || null,
      item.sku ? `SKU ${item.sku}` : null,
      stockLabel,
    ].filter(Boolean).join(' • ');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    console.log('🚨🚨🚨 CRITICAL DEBUG: Form field changed:', name, '=', value);
    setFormData(prev => ({
      ...prev,
      [name]: value
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
    newPartsUsed[index] = { ...newPartsUsed[index], [field]: value };
    setFormData(prev => ({ ...prev, parts_used: newPartsUsed }));
  };

  const getItemDetails = (itemId) => {
    const item = inventoryItems.find(item => item.id === parseInt(itemId));
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
    
    const available = item.stock_on_hand || 0;
    const requested = parseInt(requestedQuantity) || 0;
    
    if (requested <= 0) {
      return { valid: false, error: 'Quantity must be greater than 0' };
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
    return item ? (item.stock_on_hand || 0) : 0;
  };

  // NEW: Check parts availability
  const checkPartsAvailability = async (partsUsed) => {
    const checks = [];
    
    for (const part of partsUsed) {
      try {
        const item = await InventoryService.getItemById(part.item_id);
        if (item) {
          const required = parseInt(part.quantity);
          const available = item.stock_on_hand || 0;
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

  // 🚨🚨🚨 CRITICAL FIX: Enhanced total cost calculation with debug logging (removed external cost)
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
    
    console.log('🚨🚨🚨 CRITICAL DEBUG: Cost calculation (no external):');
    console.log('🚨🚨🚨 CRITICAL DEBUG: laborCost:', laborCost);
    console.log('🚨🚨🚨 CRITICAL DEBUG: additionalPartsCost:', additionalPartsCost);
    console.log('🚨🚨🚨 CRITICAL DEBUG: tax:', tax);
    console.log('🚨🚨🚨 CRITICAL DEBUG: inventoryPartsCost:', inventoryPartsCost);
    console.log('🚨🚨🚨 CRITICAL DEBUG: manualPartsCost:', manualPartsCost);
    console.log('🚨🚨🚨 CRITICAL DEBUG: totalCost:', totalCost);
    
    return {
      laborCost,
      inventoryPartsCost,
      manualPartsCost,
      additionalPartsCost,
      totalCost
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      console.log('🚀 Form submission started');
      console.log('🚀 Current form data:', formData);

      // Validate required fields
      if (!formData.vehicle_id) {
        throw new Error('Please select a vehicle');
      }

      const selectedMaintenanceTypes = Array.isArray(formData.maintenance_types) && formData.maintenance_types.length > 0
        ? formData.maintenance_types
        : parseMaintenanceTypes(formData.maintenance_type);

      if (selectedMaintenanceTypes.length === 0) {
        throw new Error('Please select at least one maintenance type');
      }

      if (!formData.scheduled_date) {
        throw new Error('Please enter a scheduled date');
      }

      // ENHANCED: Validate parts used with stock validation
      const partsErrors = [];
      const stockValidationErrors = [];
      
      formData.parts_used.forEach((part, index) => {
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
        throw new Error(`Parts validation errors: ${partsErrors.join(', ')}`);
      }
      
      if (stockValidationErrors.length > 0) {
        throw new Error(`Stock validation errors: ${stockValidationErrors.join('; ')}`);
      }

      // Check stock availability for parts (only for new records or increased quantities)
      if (formData.parts_used.length > 0 && !editingRecord) {
        const stockChecks = await checkPartsAvailability(
          formData.parts_used.filter((part) => (part.source_type || 'inventory') !== 'manual')
        );
        const warnings = stockChecks.filter(check => !check.sufficient);
        setStockWarnings(warnings);
        
        if (warnings.length > 0) {
          const shortageDetails = warnings.map(warning => 
            `${warning.item_name}: need ${warning.required}, have ${warning.available}`
          ).join('; ');
          throw new Error(`Insufficient inventory: ${shortageDetails}`);
        }
      }

      // CRITICAL FIX: Convert vehicle_id to integer BEFORE sending to service
      const vehicleIdAsInteger = parseInt(formData.vehicle_id);
      if (!vehicleIdAsInteger || isNaN(vehicleIdAsInteger)) {
        throw new Error('Invalid vehicle selection');
      }

      // Enrich parts_used with inventory data for proper cost calculation
      const enrichedPartsUsed = await Promise.all(
        formData.parts_used.map(async (part) => {
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
            const unitPrice = explicitUnitPrice || (item ? (item.price_mad || item.cost_mad || 0) : (part.unit_cost_mad || 0));
            const quantity = parseInt(part.quantity);
            return {
              ...part,
              source_type: 'inventory',
              quantity,
              item_name: item ? item.name : (part.item_name || 'Unknown Item'),
              part_name: item ? item.name : (part.part_name || part.item_name || 'Unknown Item'),
              part_number: item ? item.sku : (part.part_number || null),
              unit_cost_mad: unitCost,
              unit_price_mad: unitPrice,
              total_cost_mad: item ? (unitCost * quantity) : (part.total_cost_mad || 0),
              total_sell_mad: unitPrice * quantity,
              unit: item ? item.unit : 'units'
            };
          } catch (error) {
            console.error(`Error enriching part ${part.item_id}:`, error);
            const quantity = parseInt(part.quantity);
            const unitCost = part.unit_cost_mad || 0;
            const unitPrice = part.unit_price_mad || part.unit_cost_mad || 0;
            return {
              ...part,
              source_type: 'inventory',
              quantity,
              item_name: part.item_name || 'Unknown Item',
              part_name: part.part_name || part.item_name || 'Unknown Item',
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
        status: formData.status,
        scheduled_date: formData.scheduled_date,
        completed_date: formData.status === 'completed' ? (formData.completed_date || formData.scheduled_date) : null,
        odometer_reading: formData.odometer_reading ? parseInt(formData.odometer_reading) : null,
        labor_rate_mad: parseFloat(formData.labor_rate_mad) || 0, // Now fixed price
        parts_cost_mad: parseFloat(formData.parts_cost_mad) || 0,
        tax_mad: parseFloat(formData.tax_mad) || 0,
        notes: formData.notes.trim(),
        technician_name: formData.technician_name.trim(),
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

  const { laborCost, inventoryPartsCost, manualPartsCost, additionalPartsCost, totalCost } = calculateTotalCost();
  const smartInfo = getSmartSuggestionsInfo();
  const quickSuggestions = getQuickAddSuggestions();
  const inventoryPartCount = formData.parts_used.filter((part) => (part.source_type || 'inventory') !== 'manual').length;
  const manualPartCount = formData.parts_used.filter((part) => (part.source_type || 'inventory') === 'manual').length;
  const saveDisabled = loading || stockWarnings.length > 0;
  const saveHelperText = stockWarnings.length > 0
    ? 'Resolve stock warnings before saving this maintenance record.'
    : formData.status === 'completed'
      ? 'Saving as completed will deduct inventory-backed parts from stock.'
      : 'Save this record now and complete it later when the work is finished.';

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
  const maintenanceStatusOptions = [
    {
      value: 'scheduled',
      label: 'Scheduled',
      icon: Clock3,
      className: 'text-amber-800 hover:bg-amber-50',
      activeClassName: 'bg-amber-500 text-white shadow-sm',
    },
    {
      value: 'in_progress',
      label: 'In Progress',
      icon: PlayCircle,
      className: 'text-blue-800 hover:bg-blue-50',
      activeClassName: 'bg-blue-600 text-white shadow-sm',
    },
    {
      value: 'completed',
      label: 'Completed',
      icon: CheckCircle2,
      className: 'text-green-800 hover:bg-green-50',
      activeClassName: 'bg-green-600 text-white shadow-sm',
    },
  ];
  const maintenanceSteps = [
    { id: 1, label: 'Vehicle & Job', shortLabel: 'Job' },
    { id: 2, label: 'Status & Cost', shortLabel: 'Cost' },
    { id: 3, label: 'Parts Used', shortLabel: 'Parts' },
    { id: 4, label: 'Notes & Review', shortLabel: 'Review' },
  ];
  const currentStepMeta = maintenanceSteps.find((step) => step.id === activeStep) || maintenanceSteps[0];
  const isFinalStep = activeStep === maintenanceSteps.length;
  const selectedStatusLabel = maintenanceStatusOptions.find((option) => option.value === formData.status)?.label || 'Scheduled';
  const selectedStatusTone = maintenanceStatusOptions.find((option) => option.value === formData.status)?.activeClassName || 'bg-amber-500 text-white';
  const goToNextStep = () => setActiveStep((prev) => Math.min(prev + 1, maintenanceSteps.length));
  const goToPreviousStep = () => setActiveStep((prev) => Math.max(prev - 1, 1));
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

  // 🚨🚨🚨 CRITICAL DEBUG: Log current form state continuously (removed external cost)
  console.log('🚨🚨🚨 CRITICAL DEBUG: Current form state (render, no external):', {
    editingRecord: !!editingRecord,
    formDataVehicleId: formData.vehicle_id,
    formDataMaintenanceType: formData.maintenance_type,
    formDataStatus: formData.status,
    formDataScheduledDate: formData.scheduled_date,
    formDataNotes: formData.notes,
    formDataLaborCost: formData.labor_rate_mad,
    formDataPartsCost: formData.parts_cost_mad,
    formDataTax: formData.tax_mad,
    formDataPartsUsedCount: formData.parts_used.length,
    calculatedTotalCost: totalCost,
    vehiclesLoaded: safeVehicles.length,
    inventoryItemsLoaded: inventoryItems.length
  });

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            {editingRecord ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
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

        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">Maintenance workflow</p>
          <p className="mt-1 text-sm text-blue-800">
            Set the job, confirm costs, add parts, then review before saving.
          </p>
        </div>

        {initialContext?.report && !editingRecord && (
          <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-900">Linked rental report</p>
            <p className="mt-1 text-sm text-orange-800">
              This maintenance record was opened from a rental inspection report for vehicle <strong>{initialContext.vehicleId}</strong>.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-orange-800">
              <div>
                <span className="font-medium">Rental:</span> {formatRentalReference(initialContext.rentalId)}
              </div>
              <div>
                <span className="font-medium">Type:</span> {initialContext.report.report_type}
              </div>
              <div>
                <span className="font-medium">Severity:</span> {initialContext.report.severity}
              </div>
              <div>
                <span className="font-medium">Photos linked:</span> {initialContext.report.photos?.length || 0}
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
                <p className="text-yellow-800 font-medium">Insufficient Inventory</p>
                <ul className="text-yellow-700 text-sm mt-1">
                  {stockWarnings.map((warning, index) => (
                    <li key={index}>
                      {warning.item_name}: need {warning.required}, have {warning.available} 
                      (short {warning.shortage})
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
                <p className="text-blue-800 font-medium">Maintenance Type Changed</p>
                <p className="text-blue-700 text-sm mt-1">
                  You have {nonTypicalPartsToHandle.length} part(s) that are not typical for "{primaryMaintenanceType}". 
                  What would you like to do?
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleKeepNonTypicalParts}
                    className="text-blue-700 border-blue-300 hover:bg-blue-100"
                  >
                    Keep All Parts
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleRemoveNonTypicalParts}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Remove Non-Typical
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">Maintenance editor</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">{currentStepMeta.label}</h3>
                    <p className="mt-1 text-sm text-slate-500">Step {activeStep} of {maintenanceSteps.length}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

              <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vehicle</p>
                  <p className="mt-2 text-base font-bold text-slate-900">
                    {selectedVehicle ? `${selectedVehicle.plate_number || 'No Plate'} • ${selectedVehicle.name}` : 'Choose vehicle'}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estimated Total</p>
                  <p className="mt-2 text-base font-bold text-blue-700">MAD {totalCost.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formData.parts_used.length} part line{formData.parts_used.length === 1 ? '' : 's'}</p>
                </div>
              </div>

              {activeStep === 1 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Vehicle & Job</h3>
              <p className="mt-1 text-sm text-gray-500">Choose the vehicle and maintenance categories for this record.</p>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Car className="w-4 h-4 inline mr-1" />
                Vehicle *
              </label>
                  <div className="rounded-xl border border-slate-200 p-2 shadow-sm">
                <div className="relative mb-2">
                  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={vehicleSearchTerm}
                    onChange={(e) => setVehicleSearchTerm(e.target.value)}
                    className="w-full rounded-md border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Search vehicle or plate..."
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
                          {vehicle.plate_number || 'No Plate'} - {vehicle.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {vehicle.model || 'Unknown model'}
                        </div>
                      </button>
                    );
                  })}
                  {filteredVehicles.length === 0 && (
                    <div className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
                      No vehicles match this search.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Wrench className="w-4 h-4 inline mr-1" />
                Maintenance Types *
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
                The first selected type drives inventory suggestions. The full set is saved on the maintenance record.
              </p>
            </div>
          </div>

          {selectedVehicle && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 shadow-sm">
              <p className="text-sm font-medium text-blue-900">
                {selectedVehicle.plate_number || 'No Plate'} • {selectedVehicle.name}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {selectedVehicle.model || 'Unknown model'}
                {selectedVehicle.current_odometer ? ` • Current odometer: ${selectedVehicle.current_odometer} km` : ''}
              </p>
            </div>
          )}

          {/* Status and Dates */}
          <div className="grid grid-cols-1 gap-4 mt-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="lg:col-span-2 xl:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status *
              </label>
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 2xl:grid-cols-3">
                {maintenanceStatusOptions.map((option) => {
                  const selected = formData.status === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => !loading && setFormData((prev) => ({ ...prev, status: option.value }))}
                      disabled={loading}
                      className={`flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-semibold leading-tight transition-all ${
                        selected ? `${option.activeClassName} ring-2 ring-white shadow-sm` : `bg-white ${option.className}`
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="break-words">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">Completed records deduct inventory-backed parts from stock.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Scheduled Date *
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
                  Completed Date
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
                Odometer Reading (km)
              </label>
              <input
                type="number"
                name="odometer_reading"
                value={formData.odometer_reading}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
                disabled={loading}
                placeholder="Current odometer reading"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Technician Name
              </label>
              <input
                type="text"
                name="technician_name"
                value={formData.technician_name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
                placeholder="Name of technician"
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
                  Cost Breakdown
                </h3>
                {editingRecord && (
                  <span className="self-start text-xs text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">
                    Original Cost: {editingRecord.cost || 'N/A'} MAD
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">Set labor, extra charges, tax, and confirm the final bill.</p>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-5">
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Labor</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{laborCost.toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Inventory Parts</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{inventoryPartsCost.toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Manual Parts</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{manualPartsCost.toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Extra Charges + Tax</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{(additionalPartsCost + (parseFloat(formData.tax_mad || 0) || 0)).toFixed(2)} <span className="text-xs font-medium text-gray-500">MAD</span></p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-600 px-4 py-4 shadow-sm sm:col-span-2 2xl:col-span-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-blue-100">Estimated Total</p>
                <p className="mt-1 text-xl font-bold text-white">{totalCost.toFixed(2)} <span className="text-xs font-semibold text-blue-100">MAD</span></p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* FIXED: Labor Rate is now a fixed price field */}
              <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Labor Cost (MAD)
                </label>
                <input
                  type="number"
                  name="labor_rate_mad"
                  value={formData.labor_rate_mad}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  step="0.01"
                  disabled={loading}
                  placeholder="Fixed labor cost"
                />
                <p className="text-xs text-gray-500 mt-1">Fixed price for labor work</p>
              </div>

              <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Parts Price (MAD)
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
                <p className="text-xs text-gray-500 mt-1">Use this for shop supplies or extra charges not listed as line items.</p>
              </div>

              {/* REMOVED: External Cost field completely */}

              <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tax (MAD)
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
                <p className="text-xs text-gray-500 mt-1">Tax is added on top of labor and parts totals.</p>
              </div>
            </div>

            {/* 🚨🚨🚨 CRITICAL FIX: Enhanced Cost Summary with Debug Info (REMOVED EXTERNAL COST) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-3">Billing Summary</p>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Labor Cost:</span>
                <span className="font-medium">MAD {laborCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Additional Parts Price:</span>
                <span className="font-medium">MAD {additionalPartsCost.toFixed(2)}</span>
              </div>
              {/* REMOVED: External Cost display */}
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Tax:</span>
                <span className="font-medium">MAD {parseFloat(formData.tax_mad || 0).toFixed(2)}</span>
              </div>
              {inventoryPartsCost > 0 && (
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Inventory Parts Price:</span>
                  <span className="font-medium">MAD {inventoryPartsCost.toFixed(2)}</span>
                </div>
              )}
              {manualPartsCost > 0 && (
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Manual Parts Price:</span>
                  <span className="font-medium">MAD {manualPartsCost.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-lg font-bold text-blue-900 pt-3 border-t">
                <span>Total Price:</span>
                <span>MAD {totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
              )}

          {/* ENHANCED: Smart Parts Used Section with Stock Validation */}
              {activeStep === 3 && (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 shadow-sm">
            <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                  <PackageIcon className="h-5 w-5 mr-2" />
                  Parts Used {formData.parts_used.length > 0 && (
                    <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                      {formData.parts_used.length}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-sm text-gray-600">Use stocked inventory parts or add one-off manual lines.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 border border-blue-200">
                    {inventoryPartCount} inventory part{inventoryPartCount === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 border border-amber-200">
                    {manualPartCount} manual part{manualPartCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={addInventoryPart}
                  className="inline-flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Inventory Part
                </button>
                <button
                  type="button"
                  onClick={addManualPart}
                  className="inline-flex items-center justify-center px-3 py-2 bg-white text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Manual Part
                </button>
              </div>
            </div>

            {formData.status === 'completed' && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">Completing this record will deduct inventory-backed parts from stock.</p>
                <p className="mt-1 text-xs text-amber-800">Manual parts are cost-only and do not affect inventory levels.</p>
              </div>
            )}

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4">
                {smartInfo.hasSuggestions && (
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          Smart Suggestions for {primaryMaintenanceType}
                        </p>
                        <p className="text-xs text-gray-600 mb-2">{smartInfo.description}</p>
                        <p className="text-xs text-blue-600">
                          Showing {showAllItems ? smartInfo.totalCount : smartInfo.suggestedCount} of {smartInfo.totalCount} items
                          {smartInfo.suggestedCategories.length > 0 && !showAllItems && (
                            <span className="ml-1">
                              ({smartInfo.suggestedCategories.join(', ')})
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAllItems(!showAllItems)}
                        className="flex items-center text-xs text-blue-600 hover:text-blue-800 ml-3"
                      >
                        {showAllItems ? (
                          <>
                            <ToggleRightIcon className="h-4 w-4 mr-1" />
                            Show Suggested
                          </>
                        ) : (
                          <>
                            <ToggleLeftIcon className="h-4 w-4 mr-1" />
                            Show All Items
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {(quickSuggestions.inventorySuggestions.length > 0 || quickSuggestions.manualSuggestions.length > 0) && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Quick Add Suggestions</p>
                        <p className="mt-1 text-xs text-gray-600">
                          Based on {quickSuggestions.activeTypes.join(', ')}.
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                        Smart from maintenance type
                      </span>
                    </div>

                    {quickSuggestions.inventorySuggestions.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested inventory items</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {quickSuggestions.inventorySuggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => addSuggestedInventoryPart(item)}
                              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              <span>{getInventoryCategoryVisual(item.category).emoji}</span>
                              <span>{item.name}</span>
                              <span className="text-[10px] text-blue-600">
                                {item.stock_on_hand} {item.unit || 'units'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {quickSuggestions.manualSuggestions.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Common manual lines</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {quickSuggestions.manualSuggestions.map((partName) => (
                            <button
                              key={partName}
                              type="button"
                              onClick={() => addSuggestedManualPart(partName)}
                              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
                            >
                              <PlusIcon className="h-3.5 w-3.5" />
                              {partName}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {loadingItems && (
                  <div className="rounded-xl border border-blue-100 bg-white px-4 py-6 text-center">
                    <p className="text-gray-600">Loading inventory items...</p>
                  </div>
                )}

                {!loadingItems && inventoryItems.length === 0 && (
                  <div className="rounded-xl border border-blue-100 bg-white px-4 py-6 text-center">
                    <p className="text-gray-600">No active items found. Activate items in Inventory.</p>
                  </div>
                )}

                {inventoryItems.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-gray-900">Search inventory</p>
                    <div className="relative mt-3">
                      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={`Search items by name or SKU... (${showAllItems ? 'all items' : 'suggested items'})`}
                        value={itemSearchTerm}
                        onChange={(e) => setItemSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Current part lines</p>
                      <p className="mt-1 text-xs text-gray-500">Review, edit, and remove the parts that will be billed on this record.</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parts total</p>
                      <p className="mt-1 text-lg font-bold text-blue-700">MAD {(inventoryPartsCost + manualPartsCost).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

            {/* Parts List */}
            {formData.parts_used.length === 0 ? (
              <div className="rounded-xl border border-dashed border-blue-200 bg-white/70 px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-800">No parts added yet</p>
                <p className="mt-1 text-xs text-gray-500">Add an inventory or manual part to continue.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.parts_used.map((part, index) => {
                  const isManualPart = (part.source_type || 'inventory') === 'manual';
                  const maxQuantity = isManualPart ? 0 : getMaxQuantityForItem(part.item_id);
                  const stockValidation = !isManualPart && part.item_id ? validateStockForPart(part.item_id, part.quantity) : null;
                  
                  return (
                    <div key={index} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                            Line {index + 1}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          isManualPart ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          <span className="inline-flex min-h-[44px] items-center justify-center rounded-2xl px-3 text-center leading-tight">
                            {isManualPart ? 'Manual Part' : 'Inventory Part'}
                          </span>
                          </span>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 sm:min-w-[170px] sm:text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Line Price</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">
                              MAD {isManualPart
                                ? (((parseFloat(part.quantity || 0) || 0) * (parseFloat(part.unit_price_mad || part.unit_cost_mad || 0) || 0)).toFixed(2))
                                : (((parseFloat(part.quantity || 0) || 0) * getInventorySellPrice(getItemDetails(part.item_id), part.unit_price_mad)).toFixed(2))}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePartsUsed(index)}
                            className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors sm:min-w-[132px]"
                          >
                            <TrashIcon className="h-4 w-4 mr-1.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                        <div className="xl:col-span-6">
                          {isManualPart ? (
                            <>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Manual Part Name *
                              </label>
                              <input
                                type="text"
                                value={part.part_name || ''}
                                onChange={(e) => updatePartsUsed(index, 'part_name', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter part name"
                              />
                              <div className="mt-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Part Number
                                </label>
                                <input
                                  type="text"
                                  value={part.part_number || ''}
                                  onChange={(e) => updatePartsUsed(index, 'part_number', e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Optional part number"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Inventory Item *
                              </label>
                              <select
                                value={part.item_id}
                                onChange={(e) => updatePartsUsed(index, 'item_id', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                <option value="">Select inventory item</option>
                                {filteredItems.map(item => (
                                  <option 
                                    key={item.id} 
                                    value={item.id}
                                    disabled={item.stock_on_hand <= 0 && !editingRecord}
                                  >
                                    {formatInventoryOptionLabel(item)}
                                  </option>
                                ))}
                                {part.item_name && !filteredItems.find(item => item.id === parseInt(part.item_id)) && (
                                  <option value={part.item_id} disabled>
                                    {part.item_name} (No longer available)
                                  </option>
                                )}
                              </select>
                              {part.item_id && (
                                <div className="mt-1 text-xs text-gray-500">
                                  {(() => {
                                    const item = getItemDetails(part.item_id);
                                    if (item) {
                                      const isNonTypical = isItemNonTypical(part.item_id);
                                      const stock = Number(item.stock_on_hand || 0);
                                      return (
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                          <span className="flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getInventoryCategoryVisual(item.category).classes}`}>
                                              <span>{getInventoryCategoryVisual(item.category).emoji}</span>
                                              <span>{item.category || 'Inventory'}</span>
                                            </span>
                                            <span>{item.sku || 'No SKU'} • Price: {getInventorySellPrice(item).toFixed(2)} MAD/{item.unit}</span>
                                          </span>
                                          <span className={`${stock <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {stock <= 0 ? 'Out of stock' : `${stock} ${item.unit} in stock`}
                                          </span>
                                          {isNonTypical && (
                                            <span className="text-orange-600 text-xs bg-orange-50 px-2 py-0.5 rounded">
                                              Non-typical for {primaryMaintenanceType}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    } else if (part.item_name) {
                                        return `${part.item_name} • Price: ${(parseFloat(part.unit_price_mad || part.unit_cost_mad || 0) || 0).toFixed(2)} MAD`;
                                    }
                                    return '';
                                  })()}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="xl:col-span-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity *
                            {!isManualPart && maxQuantity > 0 && (
                              <span className="text-xs text-blue-600 ml-1">(max: {maxQuantity})</span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={!isManualPart && maxQuantity > 0 ? maxQuantity : undefined}
                            value={part.quantity}
                            onChange={(e) => updatePartsUsed(index, 'quantity', e.target.value)}
                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:border-transparent ${
                              stockValidation && !stockValidation.valid 
                                ? 'border-red-300 focus:ring-red-500' 
                                : 'border-gray-300 focus:ring-blue-500'
                            }`}
                            placeholder="1"
                          />
                          {isManualPart && (
                            <div className="mt-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Unit Price (MAD)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={part.unit_cost_mad || ''}
                                onChange={(e) => updatePartsUsed(index, 'unit_cost_mad', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="0.00"
                              />
                            </div>
                          )}
                          {stockValidation && (
                            <div className="mt-1 text-xs">
                              {stockValidation.valid ? (
                                <span className="text-green-600">
                                  ✅ Available: {stockValidation.available}, Remaining: {stockValidation.remaining}
                                </span>
                              ) : (
                                <span className="text-red-600">
                                  ❌ {stockValidation.error}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 xl:col-span-3">
                          <p className="text-xs text-gray-500">
                            {isManualPart ? 'Manual line item billed directly.' : 'Inventory-backed line item tied to customer price.'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <input
                          type="text"
                          value={part.notes}
                          onChange={(e) => updatePartsUsed(index, 'notes', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Optional notes about this part usage..."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            </div>
          </div>
              )}

          {/* Notes */}
              {activeStep === 4 && (
                <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Notes & Context</h3>
              <p className="mt-1 text-sm text-gray-500">Add anything the team or finance should know later.</p>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              disabled={loading}
              placeholder="Describe the work done, issues found, and any finance-relevant context."
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Review before saving</h3>
              <p className="mt-1 text-sm text-slate-500">Check the key details before saving.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vehicle</p>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {selectedVehicle ? `${selectedVehicle.plate_number || 'No Plate'} • ${selectedVehicle.name}` : 'No vehicle selected'}
                </p>
                <p className="mt-1 text-sm text-slate-500">{selectedVehicle?.model || '—'}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                <p className="mt-2 text-base font-bold text-slate-900">{selectedStatusLabel}</p>
                <p className="mt-1 text-sm text-slate-500">{selectedMaintenanceTypes.length} maintenance type{selectedMaintenanceTypes.length === 1 ? '' : 's'}</p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parts</p>
                <p className="mt-2 text-base font-bold text-slate-900">{formData.parts_used.length} line{formData.parts_used.length === 1 ? '' : 's'}</p>
                <p className="mt-1 text-sm text-slate-500">{inventoryPartCount} inventory • {manualPartCount} manual</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-600 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Estimated Total</p>
                <p className="mt-2 text-2xl font-black text-white">MAD {totalCost.toFixed(2)}</p>
              </div>
            </div>
          </div>
                </>
              )}
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-6 space-y-4">
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Live Summary</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vehicle</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {selectedVehicle ? `${selectedVehicle.plate_number || 'No Plate'} • ${selectedVehicle.name}` : 'Choose vehicle'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{selectedVehicle?.model || 'No model selected yet'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                      <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedStatusTone}`}>
                        {selectedStatusLabel}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Maintenance Types</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedMaintenanceTypes.length > 0 ? selectedMaintenanceTypes.map((type) => (
                          <span key={type} className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700">
                            {type}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-500">No types selected yet</span>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estimated Total</p>
                        <p className="mt-2 text-2xl font-black text-blue-700">MAD {totalCost.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parts Lines</p>
                        <p className="mt-2 text-2xl font-black text-slate-900">{formData.parts_used.length}</p>
                        <p className="mt-1 text-xs text-slate-500">{inventoryPartCount} inventory • {manualPartCount} manual</p>
                      </div>
                    </div>
                    {stockWarnings.length > 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Needs attention</p>
                        <p className="mt-2 text-sm font-medium text-amber-900">{stockWarnings.length} stock warning{stockWarnings.length === 1 ? '' : 's'} to resolve before saving</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Action Buttons */}
          <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-6 mt-2 border-t border-gray-200 bg-white/95 px-4 sm:px-6 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {editingRecord ? 'Ready to update this record?' : 'Ready to save this record?'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {saveHelperText}
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                {activeStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToPreviousStep}
                    disabled={loading}
                    className="w-full sm:w-auto"
                  >
                    Back
                  </Button>
                )}
                {!isFinalStep ? (
                  <Button
                    type="button"
                    onClick={goToNextStep}
                    disabled={loading}
                    className="w-full sm:min-w-[220px] flex items-center justify-center gap-2 py-3 text-sm font-semibold shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Continue to {maintenanceSteps[activeStep]?.label || 'Next Step'}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={saveDisabled}
                    className={`w-full sm:min-w-[260px] flex items-center justify-center gap-2 py-3 text-sm font-semibold shadow-lg ${
                      saveDisabled
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {editingRecord ? 'Updating Record...' : 'Saving Record...'}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {formData.status === 'completed'
                          ? (editingRecord ? 'Update and Complete Maintenance' : 'Save and Complete Maintenance')
                          : (editingRecord ? 'Update Maintenance Record' : 'Save Maintenance Record')}
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
