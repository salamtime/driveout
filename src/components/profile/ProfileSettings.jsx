import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import UserProfileService from '../../services/UserProfileService';

const ProfileSettings = ({ profile, userRole, onProfileUpdate }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    date_of_birth: '',
    emergency_contact: '',
    emergency_phone: '',
    preferences: {}
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  const allowedFields = UserProfileService.getAllowedProfileFields(userRole);

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        date_of_birth: profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
        emergency_contact: profile.emergency_contact || '',
        emergency_phone: profile.emergency_phone || '',
        preferences: profile.preferences || {}
      });
    }
  }, [profile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setSuccessMessage('');

    // Validate form data
    const validation = UserProfileService.validateProfileData(formData);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      setLoading(false);
      return;
    }

    try {
      const success = await onProfileUpdate(formData);
      
      if (success) {
        setSuccessMessage(t('profile.updateSuccess'));
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      setErrors({ general: error.message });
    } finally {
      setLoading(false);
    }
  };

  const renderField = (fieldName, fieldConfig) => {
    if (!allowedFields.includes(fieldName)) {
      return null;
    }

    const { type = 'text', label, placeholder, required = false } = fieldConfig;
    const value = formData[fieldName] || '';
    const error = errors[fieldName];

    return (
      <div key={fieldName} className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        
        {type === 'textarea' ? (
          <textarea
            name={fieldName}
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            rows={3}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
            }`}
          />
        ) : (
          <input
            type={type}
            name={fieldName}
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
            }`}
          />
        )}
        
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  };

  const fields = {
    first_name: {
      label: t('profile.fields.firstName'),
      placeholder: t('profile.placeholders.firstName'),
      required: true
    },
    last_name: {
      label: t('profile.fields.lastName'),
      placeholder: t('profile.placeholders.lastName'),
      required: true
    },
    phone: {
      type: 'tel',
      label: t('profile.fields.phone'),
      placeholder: t('profile.placeholders.phone')
    },
    address: {
      type: 'textarea',
      label: t('profile.fields.address'),
      placeholder: t('profile.placeholders.address')
    },
    date_of_birth: {
      type: 'date',
      label: t('profile.fields.dateOfBirth'),
    },
    emergency_contact: {
      label: t('profile.fields.emergencyContact'),
      placeholder: t('profile.placeholders.emergencyContact')
    },
    emergency_phone: {
      type: 'tel',
      label: t('profile.fields.emergencyPhone'),
      placeholder: t('profile.placeholders.emergencyPhone')
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">
          {t('profile.personalInformation')}
        </h3>
        <div className="text-sm text-gray-500">
          {t('profile.roleBasedAccess')}: <span className="font-medium">{userRole?.toUpperCase()}</span>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {errors.general && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{errors.general}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(fields).map(([fieldName, fieldConfig]) => 
            renderField(fieldName, fieldConfig)
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {t('profile.lastUpdated')}: {profile?.updated_at ? 
              new Date(profile.updated_at).toLocaleString() : 
              t('common.never')
            }
          </div>
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => {
                // Reset form to original values
                if (profile) {
                  setFormData({
                    first_name: profile.first_name || '',
                    last_name: profile.last_name || '',
                    phone: profile.phone || '',
                    address: profile.address || '',
                    date_of_birth: profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
                    emergency_contact: profile.emergency_contact || '',
                    emergency_phone: profile.emergency_phone || '',
                    preferences: profile.preferences || {}
                  });
                }
                setErrors({});
                setSuccessMessage('');
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {t('common.reset')}
            </button>
            
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Role-based field information */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">
          {t('profile.rolePermissions')}
        </h4>
        <div className="text-sm text-blue-800">
          <p className="mb-2">
            {t('profile.yourRole')}: <span className="font-medium">{userRole?.toUpperCase()}</span>
          </p>
          <p>
            {t('profile.availableFields')}: {allowedFields.length} {t('profile.fieldsCount')}
          </p>
          {(userRole === 'owner' || userRole === 'admin') && (
            <p className="mt-1 text-xs">
              {t('profile.adminNote')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;