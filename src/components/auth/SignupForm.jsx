import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { register, clearAuthError } from '../../store/slices/authSlice';

const SignupForm = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { error, isLoading } = useSelector(state => state.auth);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  
  const [formErrors, setFormErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when typing
    setFormErrors(prev => ({
      ...prev,
      [name]: ''
    }));
    
    if (error) {
      dispatch(clearAuthError());
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.fullName.trim()) {
      errors.fullName = t('common.required');
    }
    
    if (!formData.email.trim()) {
      errors.email = t('common.required');
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = t('common.invalidEmail');
    }
    
    if (!formData.phone.trim()) {
      errors.phone = t('common.required');
    }
    
    if (!formData.password) {
      errors.password = t('common.required');
    } else if (formData.password.length < 6) {
      errors.password = t('common.passwordLength');
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = t('common.passwordMatch');
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const { fullName, email, phone, password } = formData;
    const result = await dispatch(register({ email, password, fullName, phone }));
    
    if (!result.error) {
      // Show success message and redirect to login
      navigate('/auth/login', { 
        state: { 
          message: t('auth.verifyEmailMessage', 'Please check your email to verify your account.') 
        } 
      });
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-6">{t('auth.signup')}</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="fullName">
            {t('auth.name')}
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            value={formData.fullName}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.fullName ? 'border-red-500' : ''}`}
          />
          {formErrors.fullName && (
            <p className="text-red-500 text-sm mt-1">{formErrors.fullName}</p>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="email">
            {t('auth.email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.email ? 'border-red-500' : ''}`}
          />
          {formErrors.email && (
            <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="phone">
            {t('auth.phone')}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.phone ? 'border-red-500' : ''}`}
          />
          {formErrors.phone && (
            <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="password">
            {t('auth.password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.password ? 'border-red-500' : ''}`}
          />
          {formErrors.password && (
            <p className="text-red-500 text-sm mt-1">{formErrors.password}</p>
          )}
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="confirmPassword">
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors.confirmPassword ? 'border-red-500' : ''}`}
          />
          {formErrors.confirmPassword && (
            <p className="text-red-500 text-sm mt-1">{formErrors.confirmPassword}</p>
          )}
        </div>
        
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t('common.loading')}
            </span>
          ) : (
            t('auth.signup')
          )}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-gray-600">
          {t('auth.haveAccount')} <Link to="/auth/login" className="text-blue-500 hover:text-blue-600 font-medium">{t('auth.loginNow')}</Link>
        </p>
      </div>
    </div>
  );
};

export default SignupForm;