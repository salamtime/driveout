import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { registerGuest } from '../../store/slices/authSlice';

const UserInfoStep = ({ bookingData, updateBookingData, onNext, onPrevious, isAuthenticated }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { user, error: authError, isLoading: authLoading } = useSelector(state => state.auth);
  
  const [isGuest, setIsGuest] = useState(!isAuthenticated);
  const [errors, setErrors] = useState({});
  
  const [localData, setLocalData] = useState({
    userInfo: {
      fullName: bookingData.userInfo?.fullName || '',
      email: bookingData.userInfo?.email || '',
      phone: bookingData.userInfo?.phone || '',
      idDocument: bookingData.userInfo?.idDocument || null
    },
    acceptedTerms: bookingData.acceptedTerms || false
  });
  
  // Update form with user data if they log in
  useEffect(() => {
    if (user) {
      setLocalData(prev => ({
        ...prev,
        userInfo: {
          ...prev.userInfo,
          fullName: user.user_metadata?.full_name || prev.userInfo.fullName,
          email: user.email || prev.userInfo.email,
          phone: user.user_metadata?.phone || prev.userInfo.phone
        }
      }));
      setIsGuest(false);
    }
  }, [user]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLocalData(prev => ({
      ...prev,
      userInfo: {
        ...prev.userInfo,
        [name]: value
      }
    }));
    
    // Clear any error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };
  
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLocalData(prev => ({
        ...prev,
        userInfo: {
          ...prev.userInfo,
          idDocument: file
        }
      }));
      
      // Clear any error for this field
      if (errors.idDocument) {
        setErrors(prev => ({ ...prev, idDocument: null }));
      }
    }
  };
  
  const handleTermsChange = (e) => {
    setLocalData(prev => ({
      ...prev,
      acceptedTerms: e.target.checked
    }));
    
    // Clear any error for terms
    if (errors.terms) {
      setErrors(prev => ({ ...prev, terms: null }));
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    // Validation rules
    if (!localData.userInfo.fullName.trim()) {
      newErrors.fullName = t('common.required');
    }
    
    if (!localData.userInfo.email.trim()) {
      newErrors.email = t('common.required');
    } else if (!/\S+@\S+\.\S+/.test(localData.userInfo.email)) {
      newErrors.email = t('common.invalidEmail');
    }
    
    if (!localData.userInfo.phone.trim()) {
      newErrors.phone = t('common.required');
    }
    
    if (isGuest && !localData.userInfo.idDocument) {
      newErrors.idDocument = t('common.required');
    }
    
    if (!localData.acceptedTerms) {
      newErrors.terms = 'You must accept the terms and conditions';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }
    
    try {
      // If guest booking, create a guest account
      if (isGuest) {
        const { fullName, email, phone } = localData.userInfo;
        const idDocument = localData.userInfo.idDocument;
        
        // Register the guest user
        await dispatch(registerGuest({
          fullName,
          email,
          phone,
          idDocument
        }));
      }
      
      // Update booking data with user info
      updateBookingData({
        userInfo: localData.userInfo,
        acceptedTerms: localData.acceptedTerms
      });
      
      // Proceed to next step
      onNext();
      
    } catch (error) {
      setErrors({ submit: error.message });
    }
  };
  
  return (
    <div className="user-info-step">
      <h2 className="text-2xl font-semibold mb-6">{t('rental.steps.information')}</h2>
      
      {!isAuthenticated && (
        <div className="mb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div
              className={`
                flex-1 p-4 border rounded-lg cursor-pointer transition-all
                ${isGuest ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300'}
              `}
              onClick={() => setIsGuest(true)}
            >
              <div className="font-medium">{t('rental.userInfo.guest')}</div>
              <p className="text-sm mt-1">
                Continue as a guest without creating an account
              </p>
            </div>
            
            <div
              className={`
                flex-1 p-4 border rounded-lg cursor-pointer transition-all
                ${!isGuest ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300'}
              `}
              onClick={() => setIsGuest(false)}
            >
              <div className="font-medium">{t('rental.userInfo.member')}</div>
              <p className="text-sm mt-1">
                Login to your existing account
              </p>
            </div>
          </div>
          
          {!isGuest && (
            <div className="text-center mt-4">
              <Link 
                to="/auth/login" 
                className="text-blue-500 hover:text-blue-600 font-medium"
              >
                Go to login page
              </Link>
            </div>
          )}
        </div>
      )}
      
      {/* Error Display */}
      {(errors.submit || authError) && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {errors.submit || authError}
        </div>
      )}
      
      <form>
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="fullName">
            {t('rental.userInfo.name')}
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            value={localData.userInfo.fullName}
            onChange={handleInputChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.fullName ? 'border-red-500' : ''}`}
            disabled={authLoading}
          />
          {errors.fullName && <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="email">
            {t('rental.userInfo.email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={localData.userInfo.email}
            onChange={handleInputChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-500' : ''}`}
            disabled={isAuthenticated || authLoading}
          />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="phone">
            {t('rental.userInfo.phone')}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={localData.userInfo.phone}
            onChange={handleInputChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.phone ? 'border-red-500' : ''}`}
            disabled={authLoading}
          />
          {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
        </div>
        
        {isGuest && (
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-2" htmlFor="idDocument">
              {t('rental.userInfo.uploadID')}
            </label>
            <input
              id="idDocument"
              name="idDocument"
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.idDocument ? 'border-red-500' : ''}`}
              disabled={authLoading}
            />
            <p className="text-sm text-gray-500 mt-1">Please upload a valid ID document (passport, ID card, driver's license)</p>
            {errors.idDocument && <p className="text-red-500 text-sm mt-1">{errors.idDocument}</p>}
          </div>
        )}
        
        <div className="mb-6">
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                checked={localData.acceptedTerms}
                onChange={handleTermsChange}
                className={`w-4 h-4 border rounded focus:ring-2 focus:ring-blue-500 ${errors.terms ? 'border-red-500' : ''}`}
                disabled={authLoading}
              />
            </div>
            <label className="ml-2 text-sm text-gray-700" htmlFor="terms">
              {t('rental.userInfo.acceptTerms')}
            </label>
          </div>
          {errors.terms && <p className="text-red-500 text-sm mt-1">{errors.terms}</p>}
        </div>
      </form>
      
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={onPrevious}
          className="px-6 py-3 bg-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-400 transition-colors"
          disabled={authLoading}
        >
          {t('rental.buttons.back')}
        </button>
        
        <button
          type="button"
          onClick={handleSubmit}
          className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
          disabled={authLoading}
        >
          {authLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t('common.loading')}
            </span>
          ) : (
            t('rental.buttons.next')
          )}
        </button>
      </div>
    </div>
  );
};

export default UserInfoStep;