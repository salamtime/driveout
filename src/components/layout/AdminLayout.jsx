import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * AdminLayout - Comprehensive responsive layout for admin dashboard
 * 
 * Features:
 * - Responsive sidebar navigation (desktop/tablet/mobile)
 * - 15 core business modules (including Customer Management)
 * - Role-based access control
 * - Mobile hamburger menu
 * - Breadcrumb navigation
 * FIXED: iPad responsive behavior - hamburger menu for tablets
 * FIXED: iOS scroll support with touch-action and webkit properties
 */
const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, hasPermission } = useAuth();

  // Navigation modules with permissions
  const navigationModules = [
    {
      id: 'dashboard',
      name: 'Dashboard Overview',
      icon: '📊',
      path: '/admin/dashboard',
      moduleName: 'dashboard'
    },
    {
      id: 'calendar',
      name: 'Calendar',
      icon: '📅',
      path: '/admin/calendar',
      moduleName: 'calendar'
    },
    {
      id: 'tours',
      name: 'Tours & Bookings',
      icon: '🗺️',
      path: '/admin/tours',
      moduleName: 'tours'
    },
    {
      id: 'rentals',
      name: 'Rental-Management',
      icon: '📋',
      path: '/admin/rentals',
      moduleName: 'rentals'
    },
    {
      id: 'customers',
      name: 'Customer Management',
      icon: '👥',
      path: '/admin/customers',
      moduleName: 'customers'
    },
    {
      id: 'fleet',
      name: 'Fleet Management',
      icon: '🚗',
      path: '/admin/fleet',
      moduleName: 'fleet'
    },
    {
      id: 'pricing',
      name: 'Pricing Management',
      icon: '💰',
      path: '/admin/pricing',
      moduleName: 'pricing'
    },
    {
      id: 'maintenance',
      name: 'Quad Maintenance',
      icon: '🔧',
      path: '/admin/maintenance',
      moduleName: 'maintenance'
    },
    {
      id: 'fuel',
      name: 'Fuel Logs',
      icon: '⛽',
      path: '/admin/fuel',
      moduleName: 'fuel'
    },
    {
      id: 'inventory',
      name: 'Inventory',
      icon: '📦',
      path: '/admin/inventory',
      moduleName: 'inventory'
    },
    {
      id: 'finance',
      name: 'Finance Management',
      icon: '💳',
      path: '/admin/finance',
      moduleName: 'finance'
    },
    {
      id: 'alerts',
      name: 'Alerts',
      icon: '🚨',
      path: '/admin/alerts',
      moduleName: 'alerts'
    },
    {
      id: 'users',
      name: 'User & Role Management',
      icon: '👤',
      path: '/admin/users',
      moduleName: 'users'
    },
    {
      id: 'settings',
      name: 'System Settings',
      icon: '⚙️',
      path: '/admin/settings',
      moduleName: 'settings'
    },
    {
      id: 'export',
      name: 'Project Export',
      icon: '📤',
      path: '/admin/export',
      moduleName: 'export'
    }
  ];

  const renderNavItem = (module) => {
    const hasAccess = hasPermission(module.moduleName);
    const isActive = location.pathname.startsWith(module.path);

    if (!hasAccess) {
      return null;
    }

    return (
      <button
        key={module.id}
        onClick={() => {
          navigate(module.path);
          if (shouldShowHamburger) setSidebarOpen(false);
        }}
        className={`
          w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150
          ${isActive
            ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          }
        `}
      >
        <span className="mr-3 text-lg">{module.icon}</span>
        <span className="truncate">{module.name}</span>
      </button>
    );
  };
  
  // FIXED: Handle responsive behavior with proper tablet breakpoints
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      const tablet = width >= 768 && width <= 1024; // iPad range
      const desktop = width > 1024;
      
      setIsMobile(mobile);
      setIsTablet(tablet);
      
      if (desktop) {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Get current module for breadcrumb
  const getCurrentModule = () => {
    return navigationModules.find(module => 
      location.pathname.startsWith(module.path)
    ) || navigationModules[0];
  };

  const currentModule = getCurrentModule();

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Return to website functionality
  const returnToWebsite = () => {
    window.location.href = '/';
  };

  const shouldShowHamburger = isMobile || isTablet;
  const shouldFixSidebar = !isMobile && !isTablet;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {shouldShowHamburger && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`
        ${shouldFixSidebar 
          ? 'static'
          : 'fixed'
        }
        inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        flex flex-col h-full
        ${shouldShowHamburger 
          ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
          : 'translate-x-0'
        }
      `}>
        <div className="flex-shrink-0 flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">RM</span>
            </div>
            <span className="font-semibold text-gray-900">Rental-Manager</span>
          </div>
          {shouldShowHamburger && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <nav 
          className="flex-1 px-2 py-4 space-y-1 overflow-y-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain'
          }}
        >
          {navigationModules.map((module) => renderNavItem(module))}
        </nav>

        <div className="border-t border-gray-200 p-4 space-y-2 bg-gray-50">
          <button
            onClick={returnToWebsite}
            className="w-full flex items-center px-4 py-3 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all duration-150 shadow-sm"
            title="Navigate back to main website"
          >
            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Return to Website</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 rounded-md hover:bg-red-50 transition-colors duration-150"
          >
            <span className="mr-3 text-lg">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${shouldFixSidebar ? 'ml-0' : ''}`}>
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center space-x-4">
            {shouldShowHamburger && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Open navigation menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-500">Admin</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-900 font-medium">{currentModule?.name}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {shouldFixSidebar && (
              <button
                onClick={returnToWebsite}
                className="hidden lg:flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors duration-150"
                title="Return to main website"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Return to Website</span>
              </button>
            )}

            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900">{user?.email}</p>
              <p className="text-xs text-gray-500">Administrator</p>
            </div>
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;