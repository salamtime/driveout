import { useState, useEffect, useCallback } from 'react';
import { 
  fetchTaxSettings, 
  updateTaxSettings, 
  initializeTaxSettings,
  getDefaultTaxSettings,
  calculateTax
} from '../services/taxSettingsService';
import toast from 'react-hot-toast';

/**
 * Custom hook for managing tax settings
 * Provides state management and operations for tax configuration
 */
export const useTaxSettings = () => {
  const [taxSettings, setTaxSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('default');
  const [online, setOnline] = useState(navigator.onLine);

  // Load tax settings
  const loadTaxSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError, source: dataSource, online: isOnline } = await fetchTaxSettings();
      
      if (fetchError) {
        setError(fetchError);
        console.error('Error loading tax settings:', fetchError);
      }

      if (data) {
        setTaxSettings(data);
      }

      setSource(dataSource);
      setOnline(isOnline);
    } catch (err) {
      console.error('Exception loading tax settings:', err);
      setError(err);
      // Use default settings on error
      const defaultSettings = getDefaultTaxSettings();
      setTaxSettings(defaultSettings);
      setSource('default');
    } finally {
      setLoading(false);
    }
  }, []);

  // Save tax settings
  const saveTaxSettings = useCallback(async (settings, userId) => {
    setSaving(true);
    setError(null);

    try {
      const { data, error: saveError, source: dataSource } = await updateTaxSettings(settings, userId);
      
      if (saveError) {
        setError(saveError);
        toast.error(`Failed to save tax settings: ${saveError.message}`);
        return { success: false, error: saveError };
      } else {
        setTaxSettings(data);
        setSource(dataSource);
        toast.success('Tax settings saved successfully');
        return { success: true, data };
      }
    } catch (err) {
      console.error('Exception saving tax settings:', err);
      setError(err);
      toast.error('Failed to save tax settings');
      return { success: false, error: err };
    } finally {
      setSaving(false);
    }
  }, []);

  // Initialize tax settings
  const initializeTax = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: initError, source: dataSource } = await initializeTaxSettings();
      
      if (initError) {
        setError(initError);
        console.error('Error initializing tax settings:', initError);
      }

      if (data) {
        setTaxSettings(data);
      }

      setSource(dataSource);
      return { success: !initError, data, error: initError };
    } catch (err) {
      console.error('Exception initializing tax settings:', err);
      setError(err);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset to defaults
  const resetToDefaults = useCallback(async (userId) => {
    const defaultSettings = getDefaultTaxSettings();
    return await saveTaxSettings(defaultSettings, userId);
  }, [saveTaxSettings]);

  // Calculate tax for an amount
  const calculateTaxForAmount = useCallback(async (subtotal, type = 'rental') => {
    try {
      return await calculateTax(subtotal, type, taxSettings);
    } catch (error) {
      console.error('Error calculating tax:', error);
      return {
        taxAmount: 0,
        total: subtotal,
        taxApplied: false,
        taxPercentage: 0
      };
    }
  }, [taxSettings]);

  // Load settings on mount
  useEffect(() => {
    loadTaxSettings();
  }, [loadTaxSettings]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    // State
    taxSettings,
    loading,
    saving,
    error,
    source,
    online,
    
    // Actions
    loadTaxSettings,
    saveTaxSettings,
    initializeTax,
    resetToDefaults,
    calculateTaxForAmount,
    
    // Computed values
    isTaxEnabled: taxSettings?.tax_enabled || false,
    taxPercentage: taxSettings?.tax_percentage || 0,
    applyToRentals: taxSettings?.apply_to_rentals || false,
    applyToTours: taxSettings?.apply_to_tours || false
  };
};

export default useTaxSettings;