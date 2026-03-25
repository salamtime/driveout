import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoginForm from '../components/auth/LoginForm';
import SignupForm from '../components/auth/SignupForm';
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm';

const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useSelector(state => state.auth);
  
  // Redirect if user is already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  return (
    <div className="bg-gray-100 min-h-screen py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            <div className="flex justify-center mb-8">
              <img src="/assets/images/logo.png" alt="SaharaX Logo" className="h-12" />
            </div>
            <Routes>
              <Route path="login" element={<LoginForm />} />
              <Route path="signup" element={<SignupForm />} />
              <Route path="forgot-password" element={<ForgotPasswordForm />} />
              <Route path="*" element={<Navigate to="login" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;