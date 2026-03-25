import { useState, useEffect } from 'react';
// FIXED: Import correct exports from settingsService
import { getSettings, updateSettings, initializeSettings, getDefaultSettings } from '../services/settingsService.js';
import toast from 'react-hot-toast';

export const useSettings = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use getSettings instead of fetchSettings
        const data = await getSettings();
        setSettings(data);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError(err.message);
        
        // Fallback to default settings
        const defaults = getDefaultSettings();
        setSettings(defaults);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Update settings function
  const saveSettings = async (newSettings) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedSettings = await updateSettings(newSettings);
      setSettings(updatedSettings);
      
      toast.success('Settings saved successfully');
      return updatedSettings;
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(err.message);
      toast.error('Failed to save settings');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Initialize settings if needed
  const initSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const initializedSettings = await initializeSettings();
      setSettings(initializedSettings);
      
      return initializedSettings;
    } catch (err) {
      console.error('Failed to initialize settings:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    loading,
    error,
    saveSettings,
    initSettings,
    refetch: () => {
      const loadSettings = async () => {
        try {
          setLoading(true);
          const data = await getSettings();
          setSettings(data);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      loadSettings();
    }
  };
};

export default useSettings;