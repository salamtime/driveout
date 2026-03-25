import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import '../../components/admin/adminLayout.css';

const Preferences = () => {
  const { t } = useTranslation();
  const { userRoles } = useSelector((state) => state.auth);
  const isAdmin = userRoles?.includes('admin');
  
  // State for form values
  const [settings, setSettings] = useState({
    siteName: 'SaharaX Vehicle Rentals',
    companyEmail: 'info@saharax.com',
    supportPhone: '+971 50 123 4567',
    defaultLanguage: 'en',
    currencySymbol: 'AED',
    bookingNotifications: true,
    emailConfirmations: true,
    smsReminders: false,
    maintenanceReminder: 100, // km
    fuelTracking: true,
    automaticInvoicing: true,
    maxBookingDays: 14,
    depositPercentage: 20,
    minRenterAge: 21,
    allowGuests: true,
    tourGroupSize: 8,
    emergencyNumber: '+971 50 987 6543',
    workingHours: '8:00 AM - 8:00 PM',
    darkMode: false,
    mapProvider: 'google',
  });

  // State for loading status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    // Simulate loading system preferences
    const loadPreferences = () => {
      setTimeout(() => {
        // In a real app, would fetch from backend
        setLoading(false);
      }, 800);
    };

    loadPreferences();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    
    // Simulate saving to backend
    setTimeout(() => {
      setSaving(false);
      setSavedMessage(t('admin.preferences.saveSuccess', 'Settings saved successfully'));
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setSavedMessage('');
      }, 3000);
    }, 800);
  };

  return (
    <div className="w-full h-full max-w-full overflow-y-auto">
      <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('admin.menu.preferences', 'System Preferences')}</h1>
        <p className="text-gray-600 mt-1">
          {t('admin.preferences.subtitle', 'Configure system-wide settings and preferences')}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">{t('common.loading', 'Loading...')}</span>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'general' 
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('general')}
              >
                {t('admin.preferences.general', 'General')}
              </button>
              <button
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'booking' 
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('booking')}
              >
                {t('admin.preferences.booking', 'Booking & Rentals')}
              </button>
              <button
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'notifications' 
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('notifications')}
              >
                {t('admin.preferences.notifications', 'Notifications')}
              </button>
              <button
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'appearance' 
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('appearance')}
              >
                {t('admin.preferences.appearance', 'Appearance')}
              </button>
              <button
                className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'advanced' 
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('advanced')}
              >
                {t('admin.preferences.advanced', 'Advanced')}
              </button>
            </nav>
          </div>

          <form onSubmit={handleSave}>
            <div className="bg-white rounded-lg shadow">
              {/* General Settings */}
              {activeTab === 'general' && (
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">{t('admin.preferences.generalSettings', 'General Settings')}</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.siteName', 'Site Name')}
                      </label>
                      <input
                        type="text"
                        id="siteName"
                        name="siteName"
                        value={settings.siteName}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="companyEmail" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.companyEmail', 'Company Email')}
                      </label>
                      <input
                        type="email"
                        id="companyEmail"
                        name="companyEmail"
                        value={settings.companyEmail}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="supportPhone" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.supportPhone', 'Support Phone')}
                      </label>
                      <input
                        type="text"
                        id="supportPhone"
                        name="supportPhone"
                        value={settings.supportPhone}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="defaultLanguage" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.defaultLanguage', 'Default Language')}
                      </label>
                      <select
                        id="defaultLanguage"
                        name="defaultLanguage"
                        value={settings.defaultLanguage}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      >
                        <option value="en">English</option>
                        <option value="ar">Arabic</option>
                        <option value="fr">French</option>
                      </select>
                    </div>
                    
                    <div>
                      <label htmlFor="currencySymbol" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.currencySymbol', 'Currency Symbol')}
                      </label>
                      <select
                        id="currencySymbol"
                        name="currencySymbol"
                        value={settings.currencySymbol}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      >
                        <option value="AED">AED (United Arab Emirates Dirham)</option>
                        <option value="USD">USD (US Dollar)</option>
                        <option value="EUR">EUR (Euro)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="workingHours" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.workingHours', 'Working Hours')}
                      </label>
                      <input
                        type="text"
                        id="workingHours"
                        name="workingHours"
                        value={settings.workingHours}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Booking & Rentals Settings */}
              {activeTab === 'booking' && (
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">{t('admin.preferences.bookingSettings', 'Booking & Rental Settings')}</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label htmlFor="maxBookingDays" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.maxBookingDays', 'Maximum Booking Days')}
                      </label>
                      <input
                        type="number"
                        id="maxBookingDays"
                        name="maxBookingDays"
                        value={settings.maxBookingDays}
                        onChange={handleChange}
                        min="1"
                        max="30"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="depositPercentage" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.depositPercentage', 'Deposit Percentage')}
                      </label>
                      <div className="flex items-center">
                        <input
                          type="number"
                          id="depositPercentage"
                          name="depositPercentage"
                          value={settings.depositPercentage}
                          onChange={handleChange}
                          min="0"
                          max="100"
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          disabled={!isAdmin}
                        />
                        <span className="ml-2">%</span>
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="minRenterAge" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.minRenterAge', 'Minimum Renter Age')}
                      </label>
                      <input
                        type="number"
                        id="minRenterAge"
                        name="minRenterAge"
                        value={settings.minRenterAge}
                        onChange={handleChange}
                        min="18"
                        max="30"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="tourGroupSize" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.tourGroupSize', 'Default Tour Group Size')}
                      </label>
                      <input
                        type="number"
                        id="tourGroupSize"
                        name="tourGroupSize"
                        value={settings.tourGroupSize}
                        onChange={handleChange}
                        min="1"
                        max="20"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="automaticInvoicing"
                        name="automaticInvoicing"
                        checked={settings.automaticInvoicing}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="automaticInvoicing" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.automaticInvoicing', 'Enable Automatic Invoicing')}
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="allowGuests"
                        name="allowGuests"
                        checked={settings.allowGuests}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="allowGuests" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.allowGuests', 'Allow Guest Bookings')}
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Settings */}
              {activeTab === 'notifications' && (
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">{t('admin.preferences.notificationsSettings', 'Notification Settings')}</h2>
                  
                  <div className="space-y-4 mb-6">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="bookingNotifications"
                        name="bookingNotifications"
                        checked={settings.bookingNotifications}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="bookingNotifications" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.bookingNotifications', 'Booking Notifications')}
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="emailConfirmations"
                        name="emailConfirmations"
                        checked={settings.emailConfirmations}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="emailConfirmations" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.emailConfirmations', 'Email Confirmations')}
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="smsReminders"
                        name="smsReminders"
                        checked={settings.smsReminders}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="smsReminders" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.smsReminders', 'SMS Reminders')}
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-8">
                    <h3 className="text-md font-medium text-gray-800 mb-3">{t('admin.preferences.emergencyContact', 'Emergency Contact')}</h3>
                    <div className="w-full md:w-1/2">
                      <label htmlFor="emergencyNumber" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.emergencyNumber', 'Emergency Number')}
                      </label>
                      <input
                        type="text"
                        id="emergencyNumber"
                        name="emergencyNumber"
                        value={settings.emergencyNumber}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Appearance Settings */}
              {activeTab === 'appearance' && (
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">{t('admin.preferences.appearanceSettings', 'Appearance Settings')}</h2>
                  
                  <div className="space-y-6">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="darkMode"
                        name="darkMode"
                        checked={settings.darkMode}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="darkMode" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.darkMode', 'Dark Mode (Admin Panel)')}
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('admin.preferences.colorTheme', 'Color Theme')}
                      </label>
                      <div className="flex space-x-4">
                        <button 
                          type="button"
                          className="h-8 w-8 rounded-full bg-blue-600 ring-2 ring-offset-2 ring-blue-600 focus:outline-none"
                          disabled={!isAdmin}
                        ></button>
                        <button 
                          type="button"
                          className="h-8 w-8 rounded-full bg-green-600 ring-0 ring-offset-2 hover:ring-2 hover:ring-green-600 focus:outline-none"
                          disabled={!isAdmin}
                        ></button>
                        <button 
                          type="button"
                          className="h-8 w-8 rounded-full bg-purple-600 ring-0 ring-offset-2 hover:ring-2 hover:ring-purple-600 focus:outline-none"
                          disabled={!isAdmin}
                        ></button>
                        <button 
                          type="button"
                          className="h-8 w-8 rounded-full bg-red-600 ring-0 ring-offset-2 hover:ring-2 hover:ring-red-600 focus:outline-none"
                          disabled={!isAdmin}
                        ></button>
                      </div>
                      <p className="text-sm text-gray-500 mt-2">{t('admin.preferences.themeNote', 'Theme affects the admin panel only')}</p>
                    </div>
                    
                    <div>
                      <label htmlFor="mapProvider" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.mapProvider', 'Map Provider')}
                      </label>
                      <select
                        id="mapProvider"
                        name="mapProvider"
                        value={settings.mapProvider}
                        onChange={handleChange}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      >
                        <option value="google">Google Maps</option>
                        <option value="mapbox">Mapbox</option>
                        <option value="osm">OpenStreetMap</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Advanced Settings */}
              {activeTab === 'advanced' && (
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">{t('admin.preferences.advancedSettings', 'Advanced Settings')}</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label htmlFor="maintenanceReminder" className="block text-sm font-medium text-gray-700 mb-1">
                        {t('admin.preferences.maintenanceReminder', 'Maintenance Reminder (km)')}
                      </label>
                      <input
                        type="number"
                        id="maintenanceReminder"
                        name="maintenanceReminder"
                        value={settings.maintenanceReminder}
                        onChange={handleChange}
                        min="50"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <p className="text-sm text-gray-500 mt-1">{t('admin.preferences.maintenanceReminderHelp', 'Trigger a reminder when vehicles reach this many kilometers since last service')}</p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="fuelTracking"
                        name="fuelTracking"
                        checked={settings.fuelTracking}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={!isAdmin}
                      />
                      <label htmlFor="fuelTracking" className="text-sm font-medium text-gray-700">
                        {t('admin.preferences.fuelTracking', 'Enable Fuel Tracking')}
                      </label>
                    </div>
                    
                    <div className="pt-6 border-t border-gray-200">
                      <h3 className="text-md font-medium text-gray-800 mb-3">{t('admin.preferences.systemMaintenance', 'System Maintenance')}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          type="button"
                          className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          disabled={!isAdmin}
                        >
                          {t('admin.preferences.clearCache', 'Clear System Cache')}
                        </button>
                        <button
                          type="button"
                          className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          disabled={!isAdmin}
                        >
                          {t('admin.preferences.backupData', 'Backup System Data')}
                        </button>
                        <button
                          type="button"
                          className="py-2 px-4 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          disabled={!isAdmin}
                        >
                          {t('admin.preferences.systemLogs', 'View System Logs')}
                        </button>
                        <button
                          type="button"
                          className="py-2 px-4 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          disabled={!isAdmin}
                        >
                          {t('admin.preferences.maintenanceMode', 'Enter Maintenance Mode')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Buttons */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                {savedMessage && (
                  <div className="text-green-600 text-sm">
                    {savedMessage}
                  </div>
                )}
                <div className="flex space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {t('admin.common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${saving ? 'opacity-75 cursor-not-allowed' : ''}`}
                    disabled={saving || !isAdmin}
                  >
                    {saving ? t('admin.common.saving', 'Saving...') : t('admin.common.saveChanges', 'Save Changes')}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </>
      )}
      </div>
    </div>
  );
};

export default Preferences;