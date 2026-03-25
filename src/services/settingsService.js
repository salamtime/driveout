import { supabase } from '../utils/supabaseClient';
import { TBL } from '../config/tables';

/**
 * Settings Service
 * Manages application settings with fallback to defaults
 */
class SettingsService {
  constructor() {
    this.cache = null;
    this.cacheExpiry = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get default settings as fallback
   */
  getDefaultSettings() {
    return {
      // Company Information
      companyName: 'QuadVenture',
      companyEmail: 'info@quadventure.com',
      companyPhone: '+212 123 456 789',
      companyAddress: 'Marrakech, Morocco',
      companyWebsite: 'https://quadventure.com',
      
      // Business Settings
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      language: 'en',
      
      // Rental Settings
      defaultRentalDuration: 4,
      minRentalDuration: 1,
      maxRentalDuration: 24,
      depositPercentage: 25,
      
      // Pricing Settings
      baseHourlyRate: 50,
      dailyRate: 300,
      weeklyRate: 1800,
      
      // Tour Pricing
      defaultRate1h: 50,
      defaultRate2h: 90,
      vipRate1h: 75,
      vipRate2h: 140,
      extraPassengerFee: 15,
      
      // Operational Settings
      operatingHours: {
        start: '08:00',
        end: '18:00'
      },
      operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      
      // Feature Flags
      maintenanceMode: false,
      onlineBooking: true,
      realTimeTracking: true,
      
      // Tax Settings
      taxEnabled: true,
      taxPercentage: 20,
      taxType: 'VAT',
      
      // System Settings
      maxFileSize: 10485760, // 10MB
      allowedFileTypes: ['jpg', 'jpeg', 'png', 'pdf'],
      
      // Notification Settings
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      
      // Updated timestamp
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    return this.cache && this.cacheExpiry && Date.now() < this.cacheExpiry;
  }

  /**
   * Get settings from database with fallback to defaults
   */
  async getSettings() {
    try {
      // Return cached settings if valid
      if (this.isCacheValid()) {
        console.log('✅ Returning cached settings');
        return this.cache;
      }

      console.log(`🔧 Fetching settings from table: ${TBL.SETTINGS}`);
      
      // Try to fetch from database
      const { data, error } = await supabase
        .from(TBL.SETTINGS)
        .select('*')
        .single();

      if (error) {
        console.warn(`⚠️ Could not fetch settings from ${TBL.SETTINGS}:`, error.message);
        
        // If table doesn't exist, try to create it with default settings
        if (error.code === '42P01') { // Table doesn't exist
          console.log('📝 Settings table does not exist, creating with defaults...');
          return await this.initializeSettings();
        }
        
        // For other errors, return defaults
        console.log('📝 Using default settings due to database error');
        const defaults = this.getDefaultSettings();
        this.cache = defaults;
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        return defaults;
      }

      // Parse settings data
      let settings = data || {};
      
      // Merge with defaults to ensure all required fields exist
      const defaults = this.getDefaultSettings();
      settings = { ...defaults, ...settings };

      // Cache the settings
      this.cache = settings;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;

      console.log('✅ Successfully fetched settings from database');
      return settings;
      
    } catch (error) {
      console.error('❌ Exception in getSettings:', error);
      
      // Return defaults on any exception
      const defaults = this.getDefaultSettings();
      this.cache = defaults;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      return defaults;
    }
  }

  /**
   * Initialize settings table with default values
   */
  async initializeSettings() {
    try {
      console.log(`🔧 Initializing settings table: ${TBL.SETTINGS}`);
      
      const defaultSettings = this.getDefaultSettings();
      
      const { data, error } = await supabase
        .from(TBL.SETTINGS)
        .insert([defaultSettings])
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to initialize settings in ${TBL.SETTINGS}:`, error);
        // Return defaults even if we can't save them
        return defaultSettings;
      }

      console.log(`✅ Successfully initialized settings in ${TBL.SETTINGS}`);
      
      // Cache the initialized settings
      this.cache = data;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      
      return data;
      
    } catch (error) {
      console.error('❌ Exception initializing settings:', error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Update settings in database
   */
  async updateSettings(newSettings) {
    try {
      console.log(`🔧 Updating settings in table: ${TBL.SETTINGS}`);
      
      // Add timestamp
      const settingsWithTimestamp = {
        ...newSettings,
        updatedAt: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(TBL.SETTINGS)
        .upsert([settingsWithTimestamp])
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to update settings in ${TBL.SETTINGS}:`, error);
        throw error;
      }

      console.log(`✅ Successfully updated settings in ${TBL.SETTINGS}`);
      
      // Update cache
      this.cache = data;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      
      return data;
      
    } catch (error) {
      console.error('❌ Exception updating settings:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache = null;
    this.cacheExpiry = null;
    console.log('🗑️ Settings cache cleared');
  }

  /**
   * Get specific setting by key
   */
  async getSetting(key) {
    const settings = await this.getSettings();
    return settings[key];
  }

  /**
   * Update specific setting
   */
  async updateSetting(key, value) {
    const currentSettings = await this.getSettings();
    const updatedSettings = {
      ...currentSettings,
      [key]: value
    };
    return await this.updateSettings(updatedSettings);
  }
}

// Create singleton instance
const settingsService = new SettingsService();

// Export both the service and individual methods
export default settingsService;
export const getSettings = () => settingsService.getSettings();
export const updateSettings = (settings) => settingsService.updateSettings(settings);
export const initializeSettings = () => settingsService.initializeSettings();
export const getDefaultSettings = () => settingsService.getDefaultSettings();
export const getSetting = (key) => settingsService.getSetting(key);
export const updateSetting = (key, value) => settingsService.updateSetting(key, value);
export const clearSettingsCache = () => settingsService.clearCache();

// Legacy exports for backward compatibility
export const fetchSettings = getSettings;