import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ChangePasswordModal = ({ isOpen, onClose, onPasswordChange }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

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

  const validatePassword = (password) => {
    const errors = [];
    
    if (password.length < 8) {
      errors.push(t('profile.password.minLength'));
    }
    
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push(t('profile.password.lowercase'));
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push(t('profile.password.uppercase'));
    }
    
    if (!/(?=.*\d)/.test(password)) {
      errors.push(t('profile.password.number'));
    }
    
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push(t('profile.password.special'));
    }
    
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // Validate form
    const newErrors = {};
    
    if (!formData.newPassword) {
      newErrors.newPassword = t('profile.password.required');
    } else {
      const passwordErrors = validatePassword(formData.newPassword);
      if (passwordErrors.length > 0) {
        newErrors.newPassword = passwordErrors[0];
      }
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('profile.password.confirmRequired');
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = t('profile.password.mismatch');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      await onPasswordChange(formData.newPassword);
      
      // Reset form and close modal
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setErrors({});
      onClose();
    } catch (error) {
      setErrors({ general: error.message });
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: '', color: '' };
    
    let score = 0;
    const checks = [
      password.length >= 8,
      /(?=.*[a-z])/.test(password),
      /(?=.*[A-Z])/.test(password),
      /(?=.*\d)/.test(password),
      /(?=.*[@$!%*?&])/.test(password)
    ];
    
    score = checks.filter(Boolean).length;
    
    const strengthMap = {
      0: { label: t('profile.password.strength.veryWeak'), color: 'bg-red-500' },
      1: { label: t('profile.password.strength.weak'), color: 'bg-red-400' },
      2: { label: t('profile.password.strength.fair'), color: 'bg-yellow-400' },
      3: { label: t('profile.password.strength.good'), color: 'bg-yellow-500' },
      4: { label: t('profile.password.strength.strong'), color: 'bg-green-400' },
      5: { label: t('profile.password.strength.veryStrong'), color: 'bg-green-500' }
    };
    
    return { strength: score, ...strengthMap[score] };
  };

  const passwordStrength = getPasswordStrength(formData.newPassword);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              {t('profile.changePassword')}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Display */}
          {errors.general && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
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
            {/* New Password */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('profile.password.new')}
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.newPassword ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder={t('profile.password.newPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('new')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPasswords.new ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {formData.newPassword && (
                <div className="mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-600">{passwordStrength.label}</span>
                  </div>
                </div>
              )}
              
              {errors.newPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.newPassword}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('profile.password.confirm')}
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.confirmPassword ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder={t('profile.password.confirmPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('confirm')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPasswords.confirm ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Password Requirements */}
            <div className="mb-6 p-3 bg-gray-50 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                {t('profile.password.requirements')}
              </h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li className="flex items-center">
                  <span className={`mr-2 ${formData.newPassword.length >= 8 ? 'text-green-500' : 'text-gray-400'}`}>
                    {formData.newPassword.length >= 8 ? '✓' : '○'}
                  </span>
                  {t('profile.password.minLength')}
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 ${/(?=.*[a-z])/.test(formData.newPassword) ? 'text-green-500' : 'text-gray-400'}`}>
                    {/(?=.*[a-z])/.test(formData.newPassword) ? '✓' : '○'}
                  </span>
                  {t('profile.password.lowercase')}
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 ${/(?=.*[A-Z])/.test(formData.newPassword) ? 'text-green-500' : 'text-gray-400'}`}>
                    {/(?=.*[A-Z])/.test(formData.newPassword) ? '✓' : '○'}
                  </span>
                  {t('profile.password.uppercase')}
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 ${/(?=.*\d)/.test(formData.newPassword) ? 'text-green-500' : 'text-gray-400'}`}>
                    {/(?=.*\d)/.test(formData.newPassword) ? '✓' : '○'}
                  </span>
                  {t('profile.password.number')}
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 ${/(?=.*[@$!%*?&])/.test(formData.newPassword) ? 'text-green-500' : 'text-gray-400'}`}>
                    {/(?=.*[@$!%*?&])/.test(formData.newPassword) ? '✓' : '○'}
                  </span>
                  {t('profile.password.special')}
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading || passwordStrength.strength < 3}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  t('profile.changePassword')
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordModal;