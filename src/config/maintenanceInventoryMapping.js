/**
 * Maintenance Type to Inventory Category Mapping
 * 
 * Maps maintenance types to relevant inventory categories for smart filtering
 * in the Parts Used picker. This provides context-aware suggestions while
 * maintaining full flexibility for users.
 */

// Maintenance Type to Category Mapping
export const MAINTENANCE_INVENTORY_MAPPING = {
  'Oil Change': {
    categories: ['Fluids', 'Engine Parts', 'Filters'],
    description: 'Engine oil, oil filters, and related fluids'
  },
  'Brake Service': {
    categories: ['Brake System', 'Fluids', 'Safety'],
    description: 'Brake pads, brake fluid, and brake components'
  },
  'Tire Service': {
    categories: ['Tires', 'Accessories', 'Tools'],
    description: 'Tires, valve stems, and tire service tools'
  },
  'Filter Replacement': {
    categories: ['Filters', 'Engine Parts', 'Fluids'],
    description: 'Air filters, oil filters, fuel filters'
  },
  'Engine Service': {
    categories: ['Engine Parts', 'Fluids', 'Filters', 'Tools'],
    description: 'Engine components, fluids, and service parts'
  },
  'Transmission Service': {
    categories: ['Transmission', 'Fluids', 'Filters'],
    description: 'Transmission fluid, filters, and components'
  },
  'Electrical Service': {
    categories: ['Electrical', 'Lighting', 'Accessories'],
    description: 'Electrical components, bulbs, and wiring'
  },
  'Body Work': {
    categories: ['Body Parts', 'Paint', 'Accessories', 'Tools'],
    description: 'Body panels, paint, and repair materials'
  },
  'General Inspection': {
    categories: ['Lighting', 'Suspension', 'Engine Parts', 'Accessories', 'Safety'],
    description: 'General inspection and maintenance items'
  },
  'Other': {
    categories: [], // Show all categories for "Other"
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