import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import UserProfileService from '../../services/UserProfileService';
import ProfileSettings from './ProfileSettings';
import ChangePasswordModal from './ChangePasswordModal';
import ProfilePictureUpload from './ProfilePictureUpload';
import LoadingSpinner from '../common/LoadingSpinner';

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user, getUserRole } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [activityLog, setActivityLog] = useState([]);

  const userRole = getUserRole();

  useEffect(() => {
    if (user?.id) {
      loadUserProfile();
      loadActivityLog();
    }
  }, [user]);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await UserProfileService.getUserProfile(user.id);
      
      if (error) {
        setError(error.message);
      } else {
        setProfile(data);
      }
    } catch (err) {
      setError('Failed to load profile');
      console.error('Profile loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLog = async () => {
    if (userRole === 'owner' || userRole === 'admin') {
      try {
        const { data } = await UserProfileService.getUserActivityLog(user.id, 20);
        setActivityLog(data);
      } catch (err) {
        console.error('Activity log loading error:', err);
      }
    }
  };

  const handleProfileUpdate = async (updatedData) => {
    try {
      const { data, error } = await UserProfileService.updateUserProfile(user.id, updatedData);
      
      if (error) {
        setError(error.message);
        return false;
      }
      
      setProfile(data);
      setError(null);
      return true;
    } catch (err) {
      setError('Failed to update profile');
      console.error('Profile update error:', err);
      return false;
    }
  };

  const handlePasswordChange = async (newPassword) => {
    try {
      const { error } = await UserProfileService.changePassword(newPassword);
      
      if (error) {
        throw new Error(error.message);
      }
      
      toast.success(t('profile.changePassword'), {
        description: 'Password updated successfully.',
      });
      setError(null);
      setShowPasswordModal(false);
      return true;
    } catch (err) {
      console.error('Password change error:', err);
      toast.error('Password update failed', {
        description: err.message || 'Please try again.',
      });
      throw err;
    }
  };

  const handleProfilePictureUpdate = (newPictureUrl) => {
    setProfile(prev => ({
      ...prev,
      profile_picture_url: newPictureUrl
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {t('profile.notAuthenticated')}
          </h2>
          <p className="text-gray-600">
            {t('profile.pleaseLogin')}
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: t('profile.tabs.profile'), icon: '👤' },
    { id: 'security', label: t('profile.tabs.security'), icon: '🔒' },
    { id: 'preferences', label: t('profile.tabs.preferences'), icon: '⚙️' },
  ];

  // Add activity tab for admin/owner roles
  if (userRole === 'owner' || userRole === 'admin') {
    tabs.push({ id: 'activity', label: t('profile.tabs.activity'), icon: '📊' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <ProfilePictureUpload
                    userId={user.id}
                    currentPictureUrl={profile?.profile_picture_url}
                    onPictureUpdate={handleProfilePictureUpdate}
                    size="large"
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {profile?.first_name && profile?.last_name 
                      ? `${profile.first_name} ${profile.last_name}`
                      : user.email
                    }
                  </h1>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      userRole === 'owner' ? 'bg-green-100 text-green-800' :
                      userRole === 'admin' ? 'bg-blue-100 text-blue-800' :
                      userRole === 'employee' ? 'bg-orange-100 text-orange-800' :
                      userRole === 'guide' ? 'bg-purple-100 text-purple-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {userRole?.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500">{user.email}</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  🔒 {t('profile.changePassword')}
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError(null)}
                  className="inline-flex text-red-400 hover:text-red-600"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="bg-white shadow rounded-lg">
          {activeTab === 'profile' && (
            <ProfileSettings
              profile={profile}
              userRole={userRole}
              onProfileUpdate={handleProfileUpdate}
            />
          )}

          {activeTab === 'security' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {t('profile.security.title')}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {t('profile.security.password')}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {t('profile.security.passwordDescription')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {t('profile.changePassword')}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {t('profile.security.twoFactor')}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {t('profile.security.twoFactorDescription')}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {t('common.comingSoon')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {t('profile.preferences.title')}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {t('profile.preferences.notifications')}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {t('profile.preferences.notificationsDescription')}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {t('common.comingSoon')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (userRole === 'owner' || userRole === 'admin') && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {t('profile.activity.title')}
              </h3>
              {activityLog.length > 0 ? (
                <div className="space-y-3">
                  {activityLog.map((activity, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-sm">📋</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{activity.action}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(activity.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  {t('profile.activity.noActivity')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onPasswordChange={handlePasswordChange}
        />
      )}
    </div>
  );
};

export default ProfilePage;
