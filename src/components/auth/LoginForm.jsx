import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { login, clearAuthError } from '../../store/slices/authSlice';

const LoginForm = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { error, isLoading } = useSelector(state => state.auth);
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) {
      dispatch(clearAuthError());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const result = await dispatch(login(formData));
    
    if (!result.error) {
      // Redirect to the page the user was trying to access or to the home page
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  };

  const handleDemoLogin = (role) => {
    const demoCredentials = {
      owner: {
        email: 'owner_demo@saharax.com',
        password: 'DemoOwner2025'
      },
      admin: {
        email: 'admin@saharax.com',
        password: 'AdminUser123!'
      },
      employee: {
        email: 'employee_demo@saharax.com',
        password: 'DemoEmployee2025'
      },
      guide: {
        email: 'guide_demo@saharax.com',
        password: 'DemoGuide2025'
      },
      customer: {
        email: 'test@saharax.com',
        password: 'TestUser123!'
      }
    };

    const credentials = demoCredentials[role];
    setFormData({
      email: credentials.email,
      password: credentials.password
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-6">{t('auth.login.title')}</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="email">
            {t('common.email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <label className="block text-gray-700 font-medium" htmlFor="password">
              {t('common.password')}
            </label>
            <Link 
              to="/auth/forgot-password" 
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              {t('auth.login.forgotPassword')}
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
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
            t('auth.login.loginButton')
          )}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-gray-600">
          {t('auth.login.noAccount')} <Link to="/auth/signup" className="text-blue-500 hover:text-blue-600 font-medium">{t('common.register')}</Link>
        </p>
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
            <span className="mr-2">🧪</span>
            Complete Role-Based Access Demo Credentials
          </h3>
          
          <div className="space-y-2">
            {/* Owner Demo */}
            <div className="bg-white rounded-md p-2 border border-blue-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  🟢 OWNER
                </span>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('owner')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Use Credentials
                </button>
              </div>
              <div className="text-xs text-gray-600">
                <div><strong>Email:</strong> owner_demo@saharax.com</div>
                <div><strong>Password:</strong> DemoOwner2025</div>
              </div>
            </div>

            {/* Admin Demo */}
            <div className="bg-white rounded-md p-2 border border-blue-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                  🔵 ADMIN
                </span>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('admin')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Use Credentials
                </button>
              </div>
              <div className="text-xs text-gray-600">
                <div><strong>Email:</strong> admin@saharax.com</div>
                <div><strong>Password:</strong> AdminUser123!</div>
              </div>
            </div>

            {/* Employee Demo */}
            <div className="bg-white rounded-md p-2 border border-blue-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-1 rounded-full">
                  🟠 EMPLOYEE
                </span>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('employee')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Use Credentials
                </button>
              </div>
              <div className="text-xs text-gray-600">
                <div><strong>Email:</strong> employee_demo@saharax.com</div>
                <div><strong>Password:</strong> DemoEmployee2025</div>
              </div>
            </div>

            {/* Guide Demo */}
            <div className="bg-white rounded-md p-2 border border-blue-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">
                  🟣 GUIDE
                </span>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('guide')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Use Credentials
                </button>
              </div>
              <div className="text-xs text-gray-600">
                <div><strong>Email:</strong> guide_demo@saharax.com</div>
                <div><strong>Password:</strong> DemoGuide2025</div>
              </div>
            </div>

            {/* Customer Demo */}
            <div className="bg-white rounded-md p-2 border border-blue-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
                  🟡 CUSTOMER
                </span>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('customer')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Use Credentials
                </button>
              </div>
              <div className="text-xs text-gray-600">
                <div><strong>Email:</strong> test@saharax.com</div>
                <div><strong>Password:</strong> TestUser123!</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;