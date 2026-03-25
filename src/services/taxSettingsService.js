import { supabase } from '../lib/supabase.js';
import { logRentalAction } from './auditLogService.js';

/**
 * Tax Settings Service for managing tax configuration
 * Handles CRUD operations for the tax_settings table
 */

// The tax settings table name
const TAX_SETTINGS_TABLE = 'tax_settings';

// Local storage key for caching tax settings
const TAX_SETTINGS_CACHE_KEY = 'quadventure_tax_settings';

/**
 * Save tax settings to local storage for offline use
 * @param {Object} settings - Tax settings object to cache
 */
const saveToLocalStorage = (settings) => {
  try {
    const settingsWithTimestamp = {
      ...settings,
      cachedAt: new Date().toISOString()
    };
    localStorage.setItem(TAX_SETTINGS_CACHE_KEY, JSON.stringify(settingsWithTimestamp));
    console.log('Tax settings cached to localStorage:', settingsWithTimestamp);
    return true;
  } catch (err) {
    console.warn('Failed to cache tax settings in localStorage:', err);
    return false;
  }
};

/**
 * Get tax settings from local storage
 * @returns {Object|null} Cached tax settings or null if not available
 */
const getFromLocalStorage = () => {
  try {
    const cachedSettings = localStorage.getItem(TAX_SETTINGS_CACHE_KEY);
    if (!cachedSettings) return null;
    
    const parsed = JSON.parse(cachedSettings);
    console.log('Retrieved tax settings from localStorage:', parsed);
    return parsed;
  } catch (err) {
    console.warn('Failed to retrieve tax settings from localStorage:', err);
    return null;
  }
};

/**
 * Get default tax settings structure
 * @returns {Object} Default tax settings object
 */
export const getDefaultTaxSettings = () => {
  return {
    id: null,
    tax_enabled: false,
    tax_percentage: 10.0,
    apply_to_rentals: true,
    apply_to_tours: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

/**
 * Fetch the current tax settings with improved fallback handling
 * @returns {Promise<{data: Object|null, error: Error|null, source: string}>}
 */
export const fetchTaxSettings = async () => {
  try {
    console.log(`Attempting to fetch tax settings from ${TAX_SETTINGS_TABLE}...`);
    
    // Check connection availability
    const isOnline = window.navigator.onLine;
    const hasValidCredentials = supabase && 
      import.meta.env.VITE_SUPABASE_URL && 
      import.meta.env.VITE_SUPABASE_ANON_KEY;
      
    if (!isOnline || !hasValidCredentials) {
      console.warn('Connection unavailable, falling back to local storage');
      const cachedSettings = getFromLocalStorage();
      
      if (cachedSettings) {
        return { 
          data: cachedSettings, 
          error: null, 
          source: 'cache',
          online: false
        };
      }
      
      // No cached settings, return default settings
      console.warn('No cached tax settings found, using defaults');
      return { 
        data: getDefaultTaxSettings(), 
        error: new Error('Offline mode - using default tax settings'), 
        source: 'default',
        online: false
      };
    }
    
    // Try to fetch from database
    try {
      const { data, error } = await supabase
        .from(TAX_SETTINGS_TABLE)
        .select('*')
        .limit(1)
        .single(); // Should only be one row

      if (error) {
        console.error(`Error fetching tax settings from ${TAX_SETTINGS_TABLE}:`, error);
        
        // Try to get from local storage as fallback
        const cachedSettings = getFromLocalStorage();
        if (cachedSettings) {
          return { 
            data: cachedSettings, 
            error: error, 
            source: 'cache',
            online: true
          };
        }
        
        // No cache, return defaults
        return { 
          data: getDefaultTaxSettings(), 
          error: error, 
          source: 'default',
          online: true
        };
      }

      console.log('Tax settings fetched successfully:', data);
      
      // Cache the successful response
      saveToLocalStorage(data);
      
      return { 
        data: data, 
        error: null, 
        source: 'database',
        online: true
      };
    } catch (dbError) {
      console.error('Database error in fetchTaxSettings:', dbError);
      
      // Try to get from local storage as fallback
      const cachedSettings = getFromLocalStorage();
      if (cachedSettings) {
        return { 
          data: cachedSettings, 
          error: dbError, 
          source: 'cache',
          online: true
        };
      }
      
      // No cache, return defaults
      return { 
        data: getDefaultTaxSettings(), 
        error: dbError, 
        source: 'default',
        online: true
      };
    }
  } catch (err) {
    console.error('Unexpected exception in fetchTaxSettings:', err);
    
    // Final fallback - default settings
    return { 
      data: getDefaultTaxSettings(), 
      error: err, 
      source: 'default',
      online: window.navigator.onLine
    };
  }
};

/**
 * Update tax settings with validation and audit logging
 * @param {Object} settings - Tax settings object
 * @param {boolean} settings.tax_enabled - Whether tax is enabled
 * @param {number} settings.tax_percentage - Tax percentage (0-100)
 * @param {boolean} settings.apply_to_rentals - Whether to apply to rentals
 * @param {boolean} settings.apply_to_tours - Whether to apply to tours
 * @param {string} userId - ID of the user making the change
 * @returns {Promise<{data: Object|null, error: Error|null, source: string}>}
 */
export const updateTaxSettings = async (settings, userId) => {
  try {
    // Validation
    const validationError = validateTaxSettings(settings);
    if (validationError) {
      return { data: null, error: new Error(validationError), source: null };
    }

    // Get current settings for audit trail
    const { data: currentSettings } = await fetchTaxSettings();
    
    // Always update local storage first for resilience
    saveToLocalStorage(settings);
    
    // Check connection availability
    const isOnline = window.navigator.onLine;
    const hasValidCredentials = supabase && 
      import.meta.env.VITE_SUPABASE_URL && 
      import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!isOnline || !hasValidCredentials) {
      console.warn('Connection unavailable, tax settings saved only to local storage');
      return { 
        data: settings, 
        error: new Error('Offline mode - tax settings saved locally only'), 
        source: 'cache',
        online: false 
      };
    }

    try {
      // Create or update settings
      let result;
      
      if (!currentSettings || !currentSettings.id) {
        // Create new settings
        console.log('No existing tax settings found, creating new settings...');
        result = await supabase
          .from(TAX_SETTINGS_TABLE)
          .insert({
            ...settings,
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
      } else {
        // Update existing settings
        console.log(`Updating tax settings with ID: ${currentSettings.id}`);
        result = await supabase
          .from(TAX_SETTINGS_TABLE)
          .update({
            ...settings,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSettings.id)
          .select()
          .single();
      }
      
      const { data: dbData, error } = result;

      if (error) {
        console.error('Error updating tax settings in database:', error);
        return { 
          data: settings, // Return the settings we saved to localStorage
          error: error, 
          source: 'cache',
          online: true
        };
      }

      console.log('Tax settings updated successfully in database:', dbData);
      
      // Log the change in audit trail
      if (userId && currentSettings) {
        await logTaxSettingsChange(userId, currentSettings, dbData);
      }
      
      return { 
        data: dbData, 
        error: null, 
        source: 'database',
        online: true
      };
    } catch (dbError) {
      console.error('Database error in updateTaxSettings:', dbError);
      return { 
        data: settings, // Return the settings we saved to localStorage
        error: dbError, 
        source: 'cache',
        online: true
      };
    }
  } catch (err) {
    console.error('Unexpected exception in updateTaxSettings:', err);
    return { 
      data: null, 
      error: err, 
      source: null,
      online: window.navigator.onLine
    };
  }
};

/**
 * Initialize tax settings if they don't exist
 * @returns {Promise<{data: Object|null, error: Error|null, source: string}>}
 */
export const initializeTaxSettings = async () => {
  try {
    // Check if settings exist
    const { data: existingSettings, error: fetchError, source: fetchSource } = await fetchTaxSettings();
    
    if (existingSettings && (fetchSource === 'database' || fetchSource === 'cache')) {
      console.log('Tax settings already exist, skipping initialization');
      return { data: existingSettings, error: null, source: fetchSource };
    }

    console.log('No tax settings found, initializing with defaults');
    
    // Create default settings
    const defaultSettings = getDefaultTaxSettings();
    
    // Save to local storage regardless
    saveToLocalStorage(defaultSettings);
    
    // Check connection availability before database operations
    const isOnline = window.navigator.onLine;
    const hasValidCredentials = supabase && 
      import.meta.env.VITE_SUPABASE_URL && 
      import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!isOnline || !hasValidCredentials) {
      console.warn('Connection unavailable, default tax settings saved only to local storage');
      return { 
        data: defaultSettings, 
        error: new Error('Offline mode - default tax settings saved locally only'), 
        source: 'cache',
        online: false
      };
    }
    
    try {
      const { data: dbData, error } = await supabase
        .from(TAX_SETTINGS_TABLE)
        .insert(defaultSettings)
        .select()
        .single();

      if (error) {
        console.error('Error initializing tax settings in database:', error);
        return { 
          data: defaultSettings, 
          error: error, 
          source: 'cache',
          online: true
        };
      }

      console.log('Tax settings initialized successfully in database:', dbData);
      return { 
        data: dbData, 
        error: null, 
        source: 'database',
        online: true
      };
    } catch (dbError) {
      console.error('Database error in initializeTaxSettings:', dbError);
      return { 
        data: defaultSettings, 
        error: dbError, 
        source: 'cache',
        online: true
      };
    }
  } catch (err) {
    console.error('Exception in initializeTaxSettings:', err);
    const defaultSettings = getDefaultTaxSettings();
    saveToLocalStorage(defaultSettings);
    return { 
      data: defaultSettings, 
      error: err, 
      source: 'default',
      online: window.navigator.onLine
    };
  }
};

/**
 * Validate tax settings object
 * @param {Object} settings - Tax settings to validate
 * @returns {string|null} - Error message or null if valid
 */
export const validateTaxSettings = (settings) => {
  if (!settings || typeof settings !== 'object') {
    return 'Tax settings object is required';
  }

  const {
    tax_enabled,
    tax_percentage,
    apply_to_rentals,
    apply_to_tours
  } = settings;

  // Check tax_enabled is boolean
  if (typeof tax_enabled !== 'boolean') {
    return 'Tax enabled must be a boolean value';
  }

  // Check tax_percentage is a valid number
  if (typeof tax_percentage !== 'number' || isNaN(tax_percentage)) {
    return 'Tax percentage must be a valid number';
  }

  // Check tax percentage is between 0 and 100
  if (tax_percentage < 0 || tax_percentage > 100) {
    return 'Tax percentage must be between 0 and 100';
  }

  // Check apply_to_rentals is boolean
  if (typeof apply_to_rentals !== 'boolean') {
    return 'Apply to rentals must be a boolean value';
  }

  // Check apply_to_tours is boolean
  if (typeof apply_to_tours !== 'boolean') {
    return 'Apply to tours must be a boolean value';
  }

  return null; // Valid
};

/**
 * Log tax settings change in audit trail
 * @param {string} userId - ID of the user making the change
 * @param {Object} oldSettings - Previous tax settings
 * @param {Object} newSettings - New tax settings
 */
const logTaxSettingsChange = async (userId, oldSettings, newSettings) => {
  try {
    await logRentalAction({
      rentalId: 'SYSTEM',
      action: 'update_tax_settings',
      userId,
      oldData: {
        tax_enabled: oldSettings.tax_enabled,
        tax_percentage: oldSettings.tax_percentage,
        apply_to_rentals: oldSettings.apply_to_rentals,
        apply_to_tours: oldSettings.apply_to_tours
      },
      newData: {
        tax_enabled: newSettings.tax_enabled,
        tax_percentage: newSettings.tax_percentage,
        apply_to_rentals: newSettings.apply_to_rentals,
        apply_to_tours: newSettings.apply_to_tours
      },
      metadata: {
        action_type: 'system_configuration',
        module: 'tax_settings',
        changes: {
          tax_enabled: oldSettings.tax_enabled !== newSettings.tax_enabled,
          tax_percentage: oldSettings.tax_percentage !== newSettings.tax_percentage,
          apply_to_rentals: oldSettings.apply_to_rentals !== newSettings.apply_to_rentals,
          apply_to_tours: oldSettings.apply_to_tours !== newSettings.apply_to_tours
        }
      }
    });
  } catch (error) {
    console.error('Error logging tax settings change:', error);
  }
};

/**
 * Calculate tax for a given amount based on current settings
 * @param {number} subtotal - The subtotal amount
 * @param {string} type - Type of transaction ('rental' or 'tour')
 * @param {Object} taxSettings - Tax settings (optional, will fetch if not provided)
 * @returns {Promise<{taxAmount: number, total: number, taxApplied: boolean, taxPercentage: number}>}
 */
export const calculateTax = async (subtotal, type = 'rental', taxSettings = null) => {
  try {
    // Get tax settings if not provided
    let settings = taxSettings;
    if (!settings) {
      const { data } = await fetchTaxSettings();
      settings = data;
    }

    // Default response for no tax
    const noTaxResponse = {
      taxAmount: 0,
      total: subtotal,
      taxApplied: false,
      taxPercentage: 0
    };

    // Check if tax is enabled
    if (!settings || !settings.tax_enabled) {
      return noTaxResponse;
    }

    // Check if tax applies to this type
    const shouldApplyTax = (type === 'rental' && settings.apply_to_rentals) ||
                          (type === 'tour' && settings.apply_to_tours);

    if (!shouldApplyTax) {
      return noTaxResponse;
    }

    // Calculate tax
    const taxAmount = subtotal * (settings.tax_percentage / 100);
    const total = subtotal + taxAmount;

    return {
      taxAmount,
      total,
      taxApplied: true,
      taxPercentage: settings.tax_percentage
    };

  } catch (error) {
    console.error('Error calculating tax:', error);
    // Return no tax on error
    return {
      taxAmount: 0,
      total: subtotal,
      taxApplied: false,
      taxPercentage: 0
    };
  }
};

export default {
  fetchTaxSettings,
  updateTaxSettings,
  initializeTaxSettings,
  validateTaxSettings,
  getDefaultTaxSettings,
  calculateTax
};