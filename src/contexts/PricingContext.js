import React, { createContext, useContext } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getEmergencyPrices, getSafePricing } from '../components/common/EmergencyPriceProvider';

// Create context
const PricingContext = createContext();

// Provider component
export const PricingProvider = ({ children }) => {
  // Use the improved settings hook
  const { 
    settings: originalSettings, 
    loading, 
    error, 
    source, 
    online,
    loadSettings
  } = useSettings();
  
  // Create a settings object that will never have zero values
  // This ensures we always have valid pricing even if the database returns zeros
  const [settings, setSettings] = React.useState(() => {
    const emergencyPrices = getEmergencyPrices();
    return emergencyPrices; // Start with emergency prices as default
  });
  
  // When originalSettings change, update our safe settings
  React.useEffect(() => {
    if (!originalSettings) {
      console.log('🔧 No original settings, keeping emergency prices');
      return;
    }
    
    console.log('🔧 Processing original settings:', originalSettings);
    
    // Use the safe pricing utility to validate and fallback
    const safeSettings = getSafePricing(originalSettings);
    
    // Update our safe settings
    setSettings(safeSettings);
    
    // Log what's happening
    if (JSON.stringify(originalSettings) !== JSON.stringify(safeSettings)) {
      console.log('⚠️ Applied pricing fallbacks', { 
        original: originalSettings,
        corrected: safeSettings 
      });
    } else {
      console.log('✅ Original settings are valid, using as-is');
    }
  }, [originalSettings]);
  
  // Feature flag for pricing functionality
  const [pricingEnabled, setPricingEnabled] = React.useState(true);
  
  // Toggle feature flag
  const togglePricingEnabled = () => {
    setPricingEnabled(prev => !prev);
  };
  
  // Reload settings
  const reloadSettings = async () => {
    try {
      await loadSettings();
    } catch (error) {
      console.error('Error reloading settings:', error);
      // Keep current safe settings on error
    }
  };
  
  // Get current pricing with guaranteed values
  const getCurrentPricing = () => {
    return {
      ...settings,
      // Ensure all values are numbers and positive
      defaultRate1h: Math.max(0.01, parseFloat(settings.defaultRate1h) || 49.99),
      defaultRate2h: Math.max(0.01, parseFloat(settings.defaultRate2h) || 89.99),
      vipRate1h: Math.max(0.01, parseFloat(settings.vipRate1h) || 74.99),
      vipRate2h: Math.max(0.01, parseFloat(settings.vipRate2h) || 139.99),
      extraPassengerFee: Math.max(0, parseFloat(settings.extraPassengerFee) || 14.99),
      depositPercentage: Math.max(0, Math.min(100, parseFloat(settings.depositPercentage) || 25))
    };
  };
  
  const value = {
    settings: getCurrentPricing(),
    originalSettings,
    loading,
    error,
    source,
    online,
    pricingEnabled,
    togglePricingEnabled,
    reloadSettings,
    getCurrentPricing
  };
  
  return (
    <PricingContext.Provider value={value}>
      {children}
    </PricingContext.Provider>
  );
};

// Hook for using the pricing context
export const usePricing = () => {
  const context = useContext(PricingContext);
  if (!context) {
    throw new Error('usePricing must be used within a PricingProvider');
  }
  return context;
};

export default PricingContext;