import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import UserProfileService from '../../services/UserProfileService';

const ProfilePictureUpload = ({ 
  userId, 
  currentPictureUrl, 
  onPictureUpdate, 
  size = 'medium',
  editable = true 
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-20 h-20',
    large: 'w-32 h-32',
    xlarge: 'w-48 h-48'
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file) => {
    // Validate file
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      setError(t('profile.picture.invalidType'));
      return;
    }

    if (file.size > maxSize) {
      setError(t('profile.picture.tooLarge'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: uploadError } = await UserProfileService.uploadProfilePicture(userId, file);
      
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      if (onPictureUpdate && data?.url) {
        onPictureUpdate(data.url);
      }
    } catch (err) {
      console.error('Profile picture upload error:', err);
      setError(err.message || t('profile.picture.uploadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePicture = async () => {
    if (!currentPictureUrl) return;

    setLoading(true);
    setError('');

    try {
      const { error: deleteError } = await UserProfileService.deleteProfilePicture(userId, currentPictureUrl);
      
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (onPictureUpdate) {
        onPictureUpdate(null);
      }
    } catch (err) {
      console.error('Profile picture delete error:', err);
      setError(err.message || t('profile.picture.deleteError'));
    } finally {
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    if (editable && !loading) {
      fileInputRef.current?.click();
    }
  };

  const getInitials = () => {
    // Try to get initials from user data or email
    const email = userId || 'User';
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className="relative inline-block">
      {/* Profile Picture Container */}
      <div 
        className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-300 transition-colors relative`}
        onClick={triggerFileInput}
      >
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
            <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}

        {currentPictureUrl ? (
          <img
            src={currentPictureUrl}
            alt={t('profile.picture.alt')}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            <span className="text-white font-semibold text-lg">
              {getInitials()}
            </span>
          </div>
        )}

        {/* Upload Overlay */}
        {editable && !loading && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center transition-all duration-200 opacity-0 hover:opacity-100">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        )}
      </div>

      {/* Edit/Delete Actions */}
      {editable && !loading && (size === 'large' || size === 'xlarge') && (
        <div className="absolute -bottom-2 -right-2 flex space-x-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              triggerFileInput();
            }}
            className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 shadow-lg transition-colors"
            title={t('profile.picture.change')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          {currentPictureUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePicture();
              }}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors"
              title={t('profile.picture.delete')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error Display */}
      {error && (
        <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs text-red-600 text-center">{error}</p>
        </div>
      )}

      {/* Upload Instructions */}
      {editable && (size === 'large' || size === 'xlarge') && (
        <div className="absolute top-full left-0 right-0 mt-2">
          <p className="text-xs text-gray-500 text-center">
            {t('profile.picture.instructions')}
          </p>
          <p className="text-xs text-gray-400 text-center mt-1">
            {t('profile.picture.formats')}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProfilePictureUpload;