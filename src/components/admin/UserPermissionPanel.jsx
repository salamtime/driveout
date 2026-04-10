import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { 
  Shield, 
  Users, 
  Settings, 
  Save, 
  RotateCcw, 
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import {
  getUserCustomPermissions,
  setUserCustomPermissions,
  resetUserToRoleDefaults,
  getRoleDefaultPermissions,
  hasPermissionOverrides,
  validatePermissionStructure
} from '../../utils/customPermissions';
import { ROLES, getRoleInfo } from '../../utils/permissions';
import i18n from '../../i18n';

const UserPermissionPanel = ({ user, onClose, onSave }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { userRoles } = useSelector(state => state.auth);
  const currentUserRole = userRoles?.[0];
  
  const [permissions, setPermissions] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const userRole = user.role || 'customer';
  const roleInfo = getRoleInfo(userRole);

  // Initialize permissions when component mounts (must be before early returns)
  useEffect(() => {
    if (user && user.id && currentUserRole === 'owner') {
      loadUserPermissions();
    }
  }, [user.id, currentUserRole]);

  // Only allow Owner to access this panel
  if (currentUserRole !== 'owner') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <div className="flex items-center text-red-600 mb-4">
            <AlertTriangle className="h-6 w-6 mr-2" />
            <h3 className="text-lg font-semibold">{tr('Access Denied', 'Accès refusé')}</h3>
          </div>
          <p className="text-gray-600 mb-4">
            {tr('Only the system Owner can manage user permissions.', 'Seul le propriétaire du système peut gérer les autorisations utilisateur.')}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            {tr('Close', 'Fermer')}
          </button>
        </div>
      </div>
    );
  }

  // Available modules and their display names
  const modules = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'calendar', name: 'Calendar' },
    { key: 'tours', name: tr('Tours Management', 'Gestion des tours') },
    { key: 'teamTasks', name: tr('Team Tasks', 'Tâches équipe') },
    { key: 'rentals', name: tr('Rental Management', 'Gestion des locations') },
    { key: 'fleet', name: tr('Fleet Management', 'Gestion de flotte') },
    { key: 'fuel', name: tr('Fuel Records', 'Journaux carburant') },
    { key: 'maintenance', name: tr('Maintenance', 'Maintenance') },
    { key: 'inventory', name: tr('Inventory', 'Inventaire') },
    { key: 'finance', name: tr('Finance Management', 'Gestion financière') },
    { key: 'users', name: tr('User Accounts', 'Comptes utilisateurs') },
    { key: 'marketplace', name: tr('Marketplace Review', 'Revue marketplace') },
    { key: 'alerts', name: tr('System Alerts', 'Alertes système') },
    { key: 'liveMap', name: tr('Live Tour Map', 'Carte des tours en direct') },
    { key: 'tourHistory', name: tr('Tour History', 'Historique des tours') },
    { key: 'systemPrefs', name: tr('System Preferences', 'Préférences système') },
    { key: 'settings', name: tr('Settings', 'Paramètres') }
  ];

  const actions = [
    { key: 'view', name: tr('View', 'Voir'), color: 'blue' },
    { key: 'create', name: tr('Create', 'Créer'), color: 'green' },
    { key: 'edit', name: tr('Edit', 'Modifier'), color: 'yellow' },
    { key: 'delete', name: tr('Delete', 'Supprimer'), color: 'red' },
    { key: 'report', name: tr('Report', 'Rapport'), color: 'purple' }
  ];



  const loadUserPermissions = () => {
    const customPermissions = getUserCustomPermissions();
    const userCustom = customPermissions[user.id] || {};
    
    // Initialize with role defaults or custom permissions
    const initialPermissions = {};
    modules.forEach(module => {
      const defaultPerms = getRoleDefaultPermissions(userRole, module.key);
      initialPermissions[module.key] = userCustom[module.key] || [...defaultPerms];
    });
    
    setPermissions(initialPermissions);
    setHasChanges(false);
  };

  const handlePermissionChange = (moduleKey, action, checked) => {
    setPermissions(prev => {
      const modulePermissions = [...(prev[moduleKey] || [])];
      
      if (checked) {
        if (!modulePermissions.includes(action)) {
          modulePermissions.push(action);
        }
      } else {
        const index = modulePermissions.indexOf(action);
        if (index > -1) {
          modulePermissions.splice(index, 1);
        }
      }
      
      return {
        ...prev,
        [moduleKey]: modulePermissions
      };
    });
    
    setHasChanges(true);
    setError(null);
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      // Validate permission structure
      const validation = validatePermissionStructure(permissions);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      // Save custom permissions
      const success = setUserCustomPermissions(user.id, permissions);
      if (!success) {
        throw new Error(tr('Failed to save permissions', "Impossible d'enregistrer les autorisations"));
      }
      
      setHasChanges(false);
      setSuccess(true);
      onSave && onSave(permissions);
      
      // Auto-close success message after 2 seconds
      setTimeout(() => setSuccess(false), 2000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm(tr('Reset all permissions to role defaults? This will remove all custom overrides for this user.', "Réinitialiser toutes les autorisations aux valeurs par défaut du rôle ? Cela supprimera toutes les personnalisations de cet utilisateur."))) {
      resetUserToRoleDefaults(user.id);
      loadUserPermissions();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    }
  };

  const isPermissionChecked = (moduleKey, action) => {
    return permissions[moduleKey]?.includes(action) || false;
  };

  const isDefaultPermission = (moduleKey, action) => {
    const defaultPerms = getRoleDefaultPermissions(userRole, moduleKey);
    return defaultPerms.includes(action);
  };

  const hasUserOverrides = hasPermissionOverrides(user.id, userRole);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="h-6 w-6 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {tr('User Permission Management', 'Gestion des autorisations utilisateur')}
              </h2>
              <div className="flex items-center mt-1">
                <span className="text-gray-600">
                  {user.name || user.email} - 
                </span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold bg-${roleInfo.color}-100 text-${roleInfo.color}-800`}>
                  {roleInfo.icon} {roleInfo.label}
                </span>
                {hasUserOverrides && (
                  <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                    {tr('Custom Overrides', 'Personnalisations')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded flex items-center">
              <Check className="h-5 w-5 mr-2" />
              {tr('Permissions saved successfully!', 'Autorisations enregistrées avec succès !')}
            </div>
          )}

          {/* Permission Matrix */}
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">
                    {tr('Module', 'Module')}
                  </th>
                  {actions.map(action => (
                    <th key={action.key} className="px-3 py-3 text-center font-semibold text-gray-900 border-b border-l">
                      <div className="flex flex-col items-center">
                        <span className="text-sm">{action.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((module, index) => (
                  <tr key={module.key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-900 border-b">
                      {module.name}
                    </td>
                    {actions.map(action => {
                      const isChecked = isPermissionChecked(module.key, action.key);
                      const isDefault = isDefaultPermission(module.key, action.key);
                      
                      return (
                        <td key={action.key} className="px-3 py-3 text-center border-b border-l">
                          <div className="flex flex-col items-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handlePermissionChange(module.key, action.key, e.target.checked)}
                              className={`h-4 w-4 rounded border-gray-300 text-${action.color}-600 focus:ring-${action.color}-500`}
                            />
                            {isDefault && (
                              <span className="text-xs text-gray-500 mt-1">{tr('Default', 'Par défaut')}</span>
                            )}
                            {!isDefault && isChecked && (
                              <span className="text-xs text-blue-600 mt-1">{tr('Custom', 'Personnalisé')}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-2">{tr('Legend:', 'Légende :')}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center">
                <span className="w-3 h-3 bg-gray-300 rounded mr-2"></span>
                <span>{tr('Default (from role)', 'Par défaut (depuis le rôle)')}</span>
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded mr-2"></span>
                <span>{tr('Custom override', 'Personnalisation')}</span>
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-orange-500 rounded mr-2"></span>
                <span>{tr('Modified from default', 'Modifié depuis la valeur par défaut')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleResetToDefaults}
              className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {tr('Reset to Role Defaults', 'Réinitialiser aux valeurs du rôle')}
            </button>
            {hasChanges && (
              <span className="text-sm text-orange-600 font-medium">
                {tr('Unsaved changes', 'Modifications non enregistrées')}
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              disabled={saving}
            >
              {tr('Cancel', 'Annuler')}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {tr('Saving...', 'Enregistrement...')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {tr('Save Custom Permissions', 'Enregistrer les autorisations personnalisées')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserPermissionPanel;
