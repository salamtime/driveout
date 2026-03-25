import React, { useState, useEffect } from 'react';
import StorageUtils from '../../utils/StorageUtils';
import PricingSettings from './PricingSettings';
import FinanceTaxSettings from './FinanceTaxSettings';
import toast from 'react-hot-toast';

const AdminSettings = ({ currentUser }) => {
  const [storageInfo, setStorageInfo] = useState(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(null);
  const [activeTab, setActiveTab] = useState('pricing');

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = () => {
    const info = StorageUtils.getStorageInfo();
    setStorageInfo(info);
  };

  const handleClearCategory = async (category) => {
    setIsClearing(true);
    try {
      const result = StorageUtils.clearCategory(category);
      if (result.success) {
        toast.success(result.message);
        loadStorageInfo(); // Refresh storage info
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to clear data');
    } finally {
      setIsClearing(false);
    }
  };

  const handleClearAllAppData = async () => {
    setIsClearing(true);
    try {
      const result = StorageUtils.clearAllAppData();
      if (result.success) {
        toast.success(result.message);
        loadStorageInfo();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to clear all data');
    } finally {
      setIsClearing(false);
      setShowConfirmDialog(null);
    }
  };

  const handleResetApp = async () => {
    setIsClearing(true);
    try {
      const result = StorageUtils.resetAppToInitialState();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to reset app');
    } finally {
      setIsClearing(false);
      setShowConfirmDialog(null);
    }
  };

  const handleEmergencyClear = async () => {
    setIsClearing(true);
    try {
      const result = StorageUtils.emergencyClear();
      if (result.success) {
        toast.success(result.message);
        // Reload page after emergency clear
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Emergency clear failed');
    } finally {
      setIsClearing(false);
      setShowConfirmDialog(null);
    }
  };

  const ConfirmDialog = ({ type, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {type === 'reset' && 'Reset Application'}
          {type === 'clear' && 'Clear All Data'}
          {type === 'emergency' && 'Emergency Clear'}
        </h3>
        <p className="text-gray-600 mb-6">
          {type === 'reset' && 'This will clear all application data and reload the page. All unsaved changes will be lost.'}
          {type === 'clear' && 'This will remove all SaharaX application data from localStorage. This action cannot be undone.'}
          {type === 'emergency' && 'This will clear ALL localStorage data including data from other websites. Use only if absolutely necessary.'}
        </p>
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-md text-white ${
              type === 'emergency' 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {type === 'emergency' ? 'Emergency Clear' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('pricing')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pricing'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pricing Settings
            </button>
            <button
              onClick={() => setActiveTab('tax')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tax'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Finance & Tax Settings
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'system'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              System Settings
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'pricing' && <PricingSettings />}
      
      {activeTab === 'tax' && <FinanceTaxSettings currentUser={currentUser} />}
      
      {activeTab === 'system' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-6">System Settings</h2>
          
          {/* Storage Information */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">Storage Information</h3>
            {storageInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{storageInfo.totalKeys}</div>
                  <div className="text-sm text-gray-600">Total localStorage Keys</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{storageInfo.appKeys.length}</div>
                  <div className="text-sm text-gray-600">App-specific Keys</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{storageInfo.estimatedSizeFormatted}</div>
                  <div className="text-sm text-gray-600">Estimated Size</div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500">Loading storage information...</div>
            )}
          </div>

          {/* Data Management Actions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Data Management</h3>
            
            {/* Category-specific clearing */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => handleClearCategory('vehicles')}
                disabled={isClearing}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <div className="font-medium">Clear Vehicle Data</div>
                <div className="text-sm text-gray-600">Remove fleet and vehicle information</div>
              </button>
              
              <button
                onClick={() => handleClearCategory('bookings')}
                disabled={isClearing}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <div className="font-medium">Clear Booking Data</div>
                <div className="text-sm text-gray-600">Remove tour and rental bookings</div>
              </button>
              
              <button
                onClick={() => handleClearCategory('user')}
                disabled={isClearing}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <div className="font-medium">Clear User Data</div>
                <div className="text-sm text-gray-600">Remove preferences and session data</div>
              </button>
              
              <button
                onClick={() => handleClearCategory('cache')}
                disabled={isClearing}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <div className="font-medium">Clear Cache</div>
                <div className="text-sm text-gray-600">Remove cached responses and temp data</div>
              </button>
              
              <button
                onClick={() => handleClearCategory('forms')}
                disabled={isClearing}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <div className="font-medium">Clear Form Data</div>
                <div className="text-sm text-gray-600">Remove saved form and cart data</div>
              </button>
            </div>

            {/* Major actions */}
            <div className="border-t pt-6 space-y-4">
              <h4 className="font-medium">Advanced Actions</h4>
              
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => setShowConfirmDialog('clear')}
                  disabled={isClearing}
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  Clear All App Data
                </button>
                
                <button
                  onClick={() => setShowConfirmDialog('reset')}
                  disabled={isClearing}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Reset Application
                </button>
                
                <button
                  onClick={() => setShowConfirmDialog('emergency')}
                  disabled={isClearing}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Emergency Clear All
                </button>
              </div>
            </div>
          </div>

          {/* Browser Cache Instructions */}
          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Browser Cache Clearing Instructions</h3>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium">Chrome/Edge:</h4>
                <p>Press <kbd className="bg-gray-200 px-2 py-1 rounded">Ctrl+Shift+Delete</kbd> (Windows) or <kbd className="bg-gray-200 px-2 py-1 rounded">Cmd+Shift+Delete</kbd> (Mac)</p>
                <p>Or go to Settings → Privacy and Security → Clear browsing data</p>
              </div>
              <div>
                <h4 className="font-medium">Firefox:</h4>
                <p>Press <kbd className="bg-gray-200 px-2 py-1 rounded">Ctrl+Shift+Delete</kbd> (Windows) or <kbd className="bg-gray-200 px-2 py-1 rounded">Cmd+Shift+Delete</kbd> (Mac)</p>
                <p>Or go to Settings → Privacy & Security → Clear Data</p>
              </div>
              <div>
                <h4 className="font-medium">Safari:</h4>
                <p>Go to Safari → Preferences → Privacy → Manage Website Data → Remove All</p>
                <p>Or press <kbd className="bg-gray-200 px-2 py-1 rounded">Cmd+Option+E</kbd> to empty caches</p>
              </div>
              <div>
                <h4 className="font-medium">Hard Refresh:</h4>
                <p>Press <kbd className="bg-gray-200 px-2 py-1 rounded">Ctrl+F5</kbd> (Windows) or <kbd className="bg-gray-200 px-2 py-1 rounded">Cmd+Shift+R</kbd> (Mac)</p>
              </div>
            </div>
          </div>

          {/* Refresh Storage Info Button */}
          <div className="mt-6">
            <button
              onClick={loadStorageInfo}
              disabled={isClearing}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh Storage Info
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      {showConfirmDialog === 'clear' && (
        <ConfirmDialog
          type="clear"
          onConfirm={handleClearAllAppData}
          onCancel={() => setShowConfirmDialog(null)}
        />
      )}
      
      {showConfirmDialog === 'reset' && (
        <ConfirmDialog
          type="reset"
          onConfirm={handleResetApp}
          onCancel={() => setShowConfirmDialog(null)}
        />
      )}
      
      {showConfirmDialog === 'emergency' && (
        <ConfirmDialog
          type="emergency"
          onConfirm={handleEmergencyClear}
          onCancel={() => setShowConfirmDialog(null)}
        />
      )}
    </div>
  );
};

export default AdminSettings;