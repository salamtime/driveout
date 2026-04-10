/**
 * Maintenance Type to Inventory Category Mapping
 * 
 * Maps maintenance types to relevant inventory categories for smart filtering
 * in the Parts Used picker. This provides context-aware suggestions while
 * maintaining full flexibility for users.
 */

export const INVENTORY_LABELS = [
  'oil',
  'engine_oil',
  'gear_oil',
  'brake_fluid',
  'coolant',
  'grease',
  'fuel',
  'oil_filter',
  'air_filter',
  'fuel_filter',
  'cabin_filter',
  'engine',
  'spark_plug',
  'belt',
  'cvt_belt',
  'battery',
  'starter',
  'alternator',
  'brake',
  'brake_pad',
  'brake_disc',
  'transmission',
  'cvt',
  'gearbox',
  'clutch',
  'tire',
  'wheel',
  'rim',
  'body',
  'plastic',
  'fairing',
  'light',
  'mirror',
  'accessory'
];

export const formatInventoryLabel = (label = '') => String(label || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

export const normalizeInventoryLabel = (label = '') => String(label || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_')
  .replace(/[^a-z0-9_]/g, '');

export const normalizeInventoryLabels = (labels = []) => {
  const values = Array.isArray(labels)
    ? labels
    : String(labels || '').split(',');

  return [...new Set(values.map(normalizeInventoryLabel).filter(Boolean))];
};

// Maintenance Type to Category/Label Mapping
export const MAINTENANCE_INVENTORY_MAPPING = {
  'Oil Change': {
    categories: ['fluid', 'engine', 'filter'],
    labels: ['oil', 'engine_oil', 'oil_filter'],
    description: 'Engine oil, oil filters, and related fluids'
  },
  'Brake Service': {
    categories: ['brake', 'fluid', 'safety'],
    labels: ['brake', 'brake_pad', 'brake_disc', 'brake_fluid'],
    description: 'Brake pads, brake fluid, and brake components'
  },
  'Tire Service': {
    categories: ['tire', 'accessory'],
    labels: ['tire', 'wheel'],
    description: 'Tires, valve stems, and tire service tools'
  },
  'Filter Replacement': {
    categories: ['filter', 'engine', 'fluid'],
    labels: ['oil_filter', 'air_filter', 'fuel_filter', 'cabin_filter'],
    description: 'Air filters, oil filters, fuel filters'
  },
  'Engine Service': {
    categories: ['engine', 'fluid', 'filter'],
    labels: ['engine', 'spark_plug', 'belt', 'battery', 'starter', 'alternator'],
    description: 'Engine components, fluids, and service parts'
  },
  'Transmission Service': {
    categories: ['transmission', 'fluid', 'filter'],
    labels: ['transmission', 'cvt', 'gear_oil'],
    description: 'Transmission fluid, filters, and components'
  },
  'Electrical Service': {
    categories: ['electrical', 'light', 'accessory'],
    labels: ['battery', 'starter', 'alternator', 'light'],
    description: 'Electrical components, bulbs, and wiring'
  },
  'Body Work': {
    categories: ['body', 'accessory'],
    labels: ['body', 'plastic', 'fairing', 'light', 'mirror', 'accessory'],
    description: 'Body panels, paint, and repair materials'
  },
  'General Inspection': {
    categories: ['light', 'suspension', 'engine', 'accessory', 'safety'],
    labels: ['light', 'mirror', 'brake', 'tire', 'oil', 'battery'],
    description: 'General inspection and maintenance items'
  },
  'Other': {
    categories: [], // Show all categories for "Other"
    labels: [],
    description: 'All inventory categories available'
  }
};

/**
 * Get suggested categories for a maintenance type
 * @param {string} maintenanceType - The maintenance type
 * @returns {string[]} Array of suggested category names
 */
export const getSuggestedCategories = (maintenanceType) => {
  const mapping = MAINTENANCE_INVENTORY_MAPPING[maintenanceType];
  return mapping ? mapping.categories : [];
};

export const getSuggestedLabels = (maintenanceType) => {
  const mapping = MAINTENANCE_INVENTORY_MAPPING[maintenanceType];
  return mapping ? mapping.labels || [] : [];
};

export const getSuggestedLabelsForTypes = (maintenanceTypes = []) => {
  const types = Array.isArray(maintenanceTypes) ? maintenanceTypes : [maintenanceTypes].filter(Boolean);
  return [...new Set(types.flatMap((type) => getSuggestedLabels(type)).map(normalizeInventoryLabel).filter(Boolean))];
};

export const itemMatchesInventoryLabels = (item, labels = []) => {
  const suggestedLabels = normalizeInventoryLabels(labels);
  if (!suggestedLabels.length) return true;

  const itemLabels = normalizeInventoryLabels(item?.labels || []);
  if (itemLabels.some((label) => suggestedLabels.includes(label))) return true;

  // Backward-compatible fallback for inventory rows that do not have labels yet.
  const category = normalizeInventoryLabel(item?.category || '');
  return category ? suggestedLabels.includes(category) : false;
};

const normalizeVehicleType = (value = '') => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '');

export const VEHICLE_TYPE_MAINTENANCE_DEFAULTS = [
  {
    vehicle_type: 'AT6',
    maintenance_type: 'Oil Change',
    default_labels: ['oil', 'engine_oil', 'oil_filter'],
    default_items: ['MOTUL_7100_10W_40_4T', 'MOTUL_7100'],
    default_quantities: {
      MOTUL_7100_10W_40_4T: 2,
      MOTUL_7100: 2,
      engine_oil: 2,
      oil: 2,
      oil_filter: 1
    }
  },
  {
    vehicle_type: 'AT5',
    maintenance_type: 'Oil Change',
    default_labels: ['oil', 'engine_oil', 'oil_filter'],
    default_items: ['MOTUL_7100_10W_40_4T', 'MOTUL_7100'],
    default_quantities: {
      MOTUL_7100_10W_40_4T: 2,
      MOTUL_7100: 2,
      engine_oil: 2,
      oil: 2,
      oil_filter: 1
    }
  }
];

export const getVehicleMaintenanceDefaults = (vehicleType, maintenanceType) => {
  const normalizedVehicleType = normalizeVehicleType(vehicleType);
  return VEHICLE_TYPE_MAINTENANCE_DEFAULTS.find((entry) => (
    normalizeVehicleType(entry.vehicle_type) === normalizedVehicleType &&
    entry.maintenance_type === maintenanceType
  )) || null;
};

export const getRecommendedInventoryItems = (items = [], vehicleType, maintenanceType) => {
  const defaults = getVehicleMaintenanceDefaults(vehicleType, maintenanceType);
  if (!defaults || !Array.isArray(items)) return [];

  const labels = normalizeInventoryLabels(defaults.default_labels || []);
  const itemKeys = (defaults.default_items || []).map((value) => String(value).toLowerCase());

  return items
    .filter((item) => {
      const sku = String(item?.sku || '').toLowerCase();
      const id = String(item?.id || '').toLowerCase();
      return itemKeys.includes(sku) || itemKeys.includes(id) || itemMatchesInventoryLabels(item, labels);
    })
    .map((item) => {
      const itemLabels = normalizeInventoryLabels(item.labels || []);
      const sku = String(item.sku || '');
      const id = String(item.id || '');
      const labelQuantity = itemLabels.find((label) => defaults.default_quantities?.[label] !== undefined);
      const quantity = defaults.default_quantities?.[sku] ??
        defaults.default_quantities?.[id] ??
        (labelQuantity ? defaults.default_quantities[labelQuantity] : 1);

      return {
        item,
        quantity: Number(quantity) || 1
      };
    });
};

/**
 * Get description for a maintenance type's suggested categories
 * @param {string} maintenanceType - The maintenance type
 * @returns {string} Description of suggested categories
 */
export const getMaintenanceTypeDescription = (maintenanceType) => {
  const mapping = MAINTENANCE_INVENTORY_MAPPING[maintenanceType];
  return mapping ? mapping.description : 'All inventory categories available';
};

/**
 * Check if an inventory item is typical for a maintenance type
 * @param {Object} item - Inventory item object
 * @param {string} maintenanceType - The maintenance type
 * @returns {boolean} True if item is typical for the maintenance type
 */
export const isItemTypicalForMaintenance = (item, maintenanceType) => {
  if (!item || !item.category || !maintenanceType) return true;
  
  const suggestedCategories = getSuggestedCategories(maintenanceType);
  
  // If no suggested categories (like "Other"), all items are typical
  if (suggestedCategories.length === 0) return true;
  
  // Check if item's category is in suggested categories
  return suggestedCategories.includes(item.category);
};

/**
 * Filter inventory items based on maintenance type
 * @param {Array} items - Array of inventory items
 * @param {string} maintenanceType - The maintenance type
 * @param {boolean} showAll - Whether to show all items or just suggested ones
 * @returns {Object} Object with suggested and all items arrays
 */
export const filterItemsByMaintenanceType = (items, maintenanceType, showAll = false) => {
  if (!Array.isArray(items)) return { suggested: [], all: [], hasNonTypical: false };
  
  const suggestedCategories = getSuggestedCategories(maintenanceType);
  
  // If no suggested categories or showAll is true, return all items
  if (suggestedCategories.length === 0 || showAll) {
    return {
      suggested: items,
      all: items,
      hasNonTypical: false
    };
  }
  
  // Filter items by suggested categories
  const suggested = items.filter(item => 
    suggestedCategories.includes(item.category)
  );
  
  // Get non-suggested items
  const nonSuggested = items.filter(item => 
    !suggestedCategories.includes(item.category)
  );
  
  return {
    suggested,
    all: items,
    nonSuggested,
    hasNonTypical: nonSuggested.length > 0
  };
};

/**
 * Get non-typical parts from a parts array for a maintenance type
 * @param {Array} partsUsed - Array of parts used
 * @param {Array} inventoryItems - Array of inventory items
 * @param {string} maintenanceType - The maintenance type
 * @returns {Array} Array of non-typical parts
 */
export const getNonTypicalParts = (partsUsed, inventoryItems, maintenanceType) => {
  if (!Array.isArray(partsUsed) || !Array.isArray(inventoryItems)) return [];
  
  return partsUsed.filter(part => {
    const item = inventoryItems.find(item => item.id === parseInt(part.item_id));
    return item && !isItemTypicalForMaintenance(item, maintenanceType);
  });
};

/**
 * Remove non-typical parts from parts array
 * @param {Array} partsUsed - Array of parts used
 * @param {Array} inventoryItems - Array of inventory items
 * @param {string} maintenanceType - The maintenance type
 * @returns {Array} Array with non-typical parts removed
 */
export const removeNonTypicalParts = (partsUsed, inventoryItems, maintenanceType) => {
  if (!Array.isArray(partsUsed) || !Array.isArray(inventoryItems)) return partsUsed;
  
  return partsUsed.filter(part => {
    const item = inventoryItems.find(item => item.id === parseInt(part.item_id));
    return !item || isItemTypicalForMaintenance(item, maintenanceType);
  });
};

export default MAINTENANCE_INVENTORY_MAPPING;
