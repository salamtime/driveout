import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../utils/supabaseClient';
import { updateProfile } from '../store/slices/authSlice';

const UserProfile = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, userRoles, isAuthenticated } = useSelector((state) => state.auth);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Populate form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.user_metadata?.full_name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || ''
      });
    }
  }, [user]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth/login', { state: { from: '/profile' } });
    }
  }, [isAuthenticated, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: formData.fullName,
          phone: formData.phone
        }
      });

      if (updateError) throw new Error(updateError.message);
      
      setSuccessMessage(t('profile.updateSuccess'));
      setIsEditing(false);
      
      // Update user in Redux store
      dispatch(updateProfile({
        user: data.user
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Get badge color based on role
  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500';
      case 'employee':
        return 'bg-blue-500';
      case 'customer':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-500 px-6 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <h1 className="text-white text-2xl font-bold">{t('profile.title')}</h1>
            <div className="flex gap-2 mt-2 sm:mt-0">
              {userRoles && userRoles.map((role) => (
                <span key={role} className={`${getRoleBadgeColor(role)} text-white text-xs px-2 py-1 rounded-full uppercase font-medium`}>
                  {t(`roles.${role}`)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {successMessage}
            </div>
          )}

          {/* User Avatar */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                {formData.fullName ? (
                  <span className="text-3xl font-semibold text-gray-600">
                    {formData.fullName.split(' ').map(name => name[0]).join('').toUpperCase()}
                  </span>
                ) : (
                  <svg className="h-12 w-12 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Profile Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="email">
                {t('profile.email')}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={formData.email}
                readOnly
                disabled
              />
              <p className="mt-1 text-xs text-gray-500">{t('profile.emailCannotBeChanged')}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="fullName">
                {t('profile.fullName')}
              </label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                className={`mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${!isEditing && 'bg-gray-50'}`}
                value={formData.fullName}
                onChange={handleInputChange}
                readOnly={!isEditing}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="phone">
                {t('profile.phone')}
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                className={`mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${!isEditing && 'bg-gray-50'}`}
                value={formData.phone}
                onChange={handleInputChange}
                readOnly={!isEditing}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    // Reset form data to original values
                    if (user) {
                      setFormData({
                        fullName: user.user_metadata?.full_name || '',
                        email: user.email || '',
                        phone: user.user_metadata?.phone || ''
                      });
                    }
                    setError(null);
                  }}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {isLoading ? t('common.saving') : t('common.save')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setSuccessMessage(null);
                }}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t('profile.edit')}
              </button>
            )}
          </div>

          {/* Account Security Section */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">{t('profile.security')}</h2>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate('/auth/change-password')}
                className="text-blue-500 hover:text-blue-600 font-medium"
              >
                {t('profile.changePassword')} →
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;