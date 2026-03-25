import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { supabase } from '../../utils/supabaseClient';

const UserAccessToggle = ({ user, onAccessChange, disabled = false }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const { user: currentUser, userRole } = useSelector(state => state.auth);

  const canManageAccess = userRole === 'owner' || userRole === 'admin';

  const handleToggle = async () => {
    if (!canManageAccess || disabled || isUpdating) return;

    setIsUpdating(true);
    setError('');

    try {
      const newAccessStatus = !user.access_enabled;
      const APP_ID = 'b30c02e74da644baad4668e3587d86b1';

      // Update user access status
      const { error: updateError } = await supabase
        .from(`app_${APP_ID}_users`)
        .update({
          access_enabled: newAccessStatus,
          access_disabled_at: newAccessStatus ? null : new Date().toISOString(),
          disabled_by: newAccessStatus ? null : currentUser?.email
        })
        .eq('email', user.email);

      if (updateError) throw updateError;

      // Log the access change
      const { error: logError } = await supabase
        .from(`app_${APP_ID}_user_access_log`)
        .insert({
          user_email: user.email,
          action: newAccessStatus ? 'ENABLED' : 'DISABLED',
          changed_by: currentUser?.email || 'system',
          reason: `Access ${newAccessStatus ? 'enabled' : 'disabled'} by ${currentUser?.email}`
        });

      if (logError) console.warn('Failed to log access change:', logError);

      // Notify parent component
      if (onAccessChange) {
        onAccessChange(user.email, newAccessStatus);
      }

      // Show success message
      const message = `User access ${newAccessStatus ? 'enabled' : 'disabled'} successfully`;
      if (window.showToast) {
        window.showToast(message, 'success');
      } else {
        alert(message);
      }

    } catch (error) {
      console.error('Error updating user access:', error);
      setError(error.message || 'Failed to update user access');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center">
        <button
          onClick={handleToggle}
          disabled={!canManageAccess || disabled || isUpdating}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            user.access_enabled
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-red-600 hover:bg-red-700'
          } ${
            !canManageAccess || disabled || isUpdating
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              user.access_enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        
        {isUpdating && (
          <div className="ml-2">
            <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <span className={`text-sm font-medium ${
          user.access_enabled ? 'text-green-700' : 'text-red-700'
        }`}>
          {user.access_enabled ? 'Access Enabled' : 'Access Denied'}
        </span>
        
        {!user.access_enabled && user.access_disabled_at && (
          <span className="text-xs text-gray-500">
            Disabled {new Date(user.access_disabled_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {!canManageAccess && (
        <div className="text-xs text-gray-500">
          (View only)
        </div>
      )}
    </div>
  );
};

export default UserAccessToggle;