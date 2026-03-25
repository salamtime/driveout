/**
 * Utility for managing localStorage data in the application
 */

/**
 * Gets information about the current storage usage
 * @returns {Object} Storage statistics including total keys, app keys, and estimated size
 */
export const getStorageInfo = () => {
  try {
    // Get all localStorage keys
    const allKeys = Object.keys(localStorage);
    
    // Identify app-specific keys (prefixed with saharax_ or app_)
    const appKeys = allKeys.filter(key => 
      key.startsWith('saharax_') || 
      key.startsWith('app_') ||
      key.includes('vehicles') ||
      key.includes('bookings') ||
      key.includes('tours') ||
      key.includes('rentals')
    );
    
    // Calculate estimated size
    let totalSize = 0;
    allKeys.forEach(key => {
      const value = localStorage.getItem(key);
      totalSize += (key.length + value.length) * 2; // UTF-16 encoding uses 2 bytes per character
    });
    
    // Format size for display
    const sizeInKB = totalSize / 1024;
    let estimatedSizeFormatted = '';
    if (sizeInKB < 1024) {
      estimatedSizeFormatted = `${sizeInKB.toFixed(2)} KB`;
    } else {
      const sizeInMB = sizeInKB / 1024;
      estimatedSizeFormatted = `${sizeInMB.toFixed(2)} MB`;
    }
    
    return {
      totalKeys: allKeys.length,
      appKeys,
      estimatedSize: totalSize,
      estimatedSizeFormatted,
      maxSize: '5 MB', // Most browsers limit to ~5MB
      percentUsed: ((totalSize / (5 * 1024 * 1024)) * 100).toFixed(2) + '%'
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    return {
      totalKeys: 0,
      appKeys: [],
      estimatedSize: 0,
      estimatedSizeFormatted: '0 KB',
      maxSize: '5 MB',
      percentUsed: '0%',
      error: error.message
    };
  }
};

/**
 * Clears a specific category of data from localStorage
 * @param {string} category - Category of data to clear ('vehicles', 'bookings', 'user', 'cache', 'forms')
 * @returns {Object} Result of the operation
 */
export const clearCategory = (category) => {
  try {
    const allKeys = Object.keys(localStorage);
    let keysRemoved = 0;
    
    switch (category) {
      case 'vehicles':
        allKeys.forEach(key => {
          if (
            key.includes('vehicle') || 
            key.includes('fleet') || 
            key.includes('quads') ||
            key.includes('inventory')
          ) {
            localStorage.removeItem(key);
            keysRemoved++;
          }
        });
        break;
        
      case 'bookings':
        allKeys.forEach(key => {
          if (
            key.includes('booking') || 
            key.includes('tour') || 
            key.includes('rental') ||
            key.includes('reservation') ||
            key.includes('schedule')
          ) {
            localStorage.removeItem(key);
            keysRemoved++;
          }
        });
        break;
        
      case 'user':
        allKeys.forEach(key => {
          if (
            key.includes('user') || 
            key.includes('profile') || 
            key.includes('auth') ||
            key.includes('session') ||
            key.includes('login') ||
            key.includes('token')
          ) {
            localStorage.removeItem(key);
            keysRemoved++;
          }
        });
        break;
        
      case 'cache':
        allKeys.forEach(key => {
          if (
            key.includes('cache') || 
            key.includes('temp') || 
            key.includes('tmp') ||
            key.includes('timestamp')
          ) {
            localStorage.removeItem(key);
            keysRemoved++;
          }
        });
        break;
        
      case 'forms':
        allKeys.forEach(key => {
          if (
            key.includes('form') || 
            key.includes('input') || 
            key.includes('cart') ||
            key.includes('draft')
          ) {
            localStorage.removeItem(key);
            keysRemoved++;
          }
        });
        break;
        
      default:
        return {
          success: false,
          message: `Unknown category: ${category}`
        };
    }
    
    return {
      success: true,
      message: `Cleared ${keysRemoved} items from ${category} category`,
      keysRemoved
    };
  } catch (error) {
    console.error(`Error clearing ${category} category:`, error);
    return {
      success: false,
      message: `Failed to clear ${category} category: ${error.message}`,
      error: error.message
    };
  }
};

/**
 * Clears all application data from localStorage
 * @returns {Object} Result of the operation
 */
export const clearAllAppData = () => {
  try {
    const allKeys = Object.keys(localStorage);
    let keysRemoved = 0;
    
    // Only remove app-related keys
    allKeys.forEach(key => {
      if (
        key.startsWith('saharax_') || 
        key.startsWith('app_') ||
        key.includes('vehicle') ||
        key.includes('booking') ||
        key.includes('tour') ||
        key.includes('rental') ||
        key.includes('user') ||
        key.includes('auth') ||
        key.includes('cache') ||
        key.includes('form')
      ) {
        localStorage.removeItem(key);
        keysRemoved++;
      }
    });
    
    return {
      success: true,
      message: `Cleared all app data (${keysRemoved} items)`,
      keysRemoved
    };
  } catch (error) {
    console.error('Error clearing all app data:', error);
    return {
      success: false,
      message: `Failed to clear app data: ${error.message}`,
      error: error.message
    };
  }
};

/**
 * Resets the application to its initial state
 * @returns {Object} Result of the operation
 */
export const resetAppToInitialState = () => {
  try {
    // First clear all app data
    clearAllAppData();
    
    // Set any initial default values
    localStorage.setItem('app_initialized', 'true');
    localStorage.setItem('app_initialization_date', new Date().toISOString());
    
    return {
      success: true,
      message: 'App reset to initial state'
    };
  } catch (error) {
    console.error('Error resetting app:', error);
    return {
      success: false,
      message: `Failed to reset app: ${error.message}`,
      error: error.message
    };
  }
};

/**
 * Emergency clear of ALL localStorage data
 * @returns {Object} Result of the operation
 */
export const emergencyClear = () => {
  try {
    const keyCount = localStorage.length;
    localStorage.clear();
    
    return {
      success: true,
      message: `Emergency clear completed. Removed ${keyCount} items.`,
      keysRemoved: keyCount
    };
  } catch (error) {
    console.error('Error during emergency clear:', error);
    return {
      success: false,
      message: `Emergency clear failed: ${error.message}`,
      error: error.message
    };
  }
};

const StorageUtils = {
  getStorageInfo,
  clearCategory,
  clearAllAppData,
  resetAppToInitialState,
  emergencyClear
};

export default StorageUtils;