import React, { createContext, useContext } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getEmergencyPrices } from '../components/common/EmergencyPriceProvider';

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
    if (!originalSettings) return;
    
    // Make a copy of the original settings
    const safeSettings = { ...originalSettings };
    
    // Get emergency fallback prices
    const emergencyPrices = getEmergencyPrices();
    
    // Ensure all critical price values are non-zero by using emergency values as fallbacks
    safeSettings.defaultRate1h = (originalSettings.defaultRate1h && originalSettings.defaultRate1h > 0) 
      ? originalSettings.defaultRate1h 
      : emergencyPrices.defaultRate1h;
      
    safeSettings.defaultRate2h = (originalSettings.defaultRate2h && originalSettings.defaultRate2h > 0) 
      ? originalSettings.defaultRate2h 
      : emergencyPrices.defaultRate2h;
      
    safeSettings.vipRate1h = (originalSettings.vipRate1h && originalSettings.vipRate1h > 0) 
      ? originalSettings.vipRate1h 
      : emergencyPrices.vipRate1h;
      
    safeSettings.vipRate2h = (originalSettings.vipRate2h && originalSettings.vipRate2h > 0) 
      ? originalSettings.vipRate2h 
      : emergencyPrices.vipRate2h;
      
    safeSettings.extraPassengerFee = (originalSettings.extraPassengerFee && originalSettings.extraPassengerFee > 0) 
      ? originalSettings.extraPassengerFee 
      : emergencyPrices.extraPassengerFee;
      
    safeSettings.depositPercentage = (originalSettings.depositPercentage && originalSettings.depositPercentage > 0) 
      ? originalSettings.depositPercentage 
      : emergencyPrices.depositPercentage;
    
    // Update our safe settings
    setSettings(safeSettings);
    
    // Log what's happening
    if (JSON.stringify(originalSettings) !== JSON.stringify(safeSettings)) {
      console.log('⚠️ Using fallback pricing for some values', { 
        original: originalSettings,
        corrected: safeSettings 
      });
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
    await loadSettings();
  };
  
  const value = {
    settings,
    loading,
    error,
    source,
    online,
    pricingEnabled,
    togglePricingEnabled,
    reloadSettings
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