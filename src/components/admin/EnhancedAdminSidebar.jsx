import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  MapPin, 
  Calendar, 
  Car, 
  Wrench, 
  Fuel, 
  Package, 
  DollarSign, 
  Bell, 
  Users, 
  Settings,
  Lock,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PermissionGate } from '../ProtectedRoute';
import ConnectionStatus from '../common/ConnectionStatus';

const EnhancedAdminSidebar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, userProfile, loading } = useAuth();

  // UPDATED MODULE NAMES TO MATCH DATABASE
  const sidebarItems = [
    {
      name: 'Dashboard',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      moduleName: 'Dashboard',
      description: 'Overview and analytics'
    },
    {
      name: 'Tours & Bookings',
      href: '/admin/tours',
      icon: MapPin,
      moduleName: 'Tours & Bookings',
      description: 'Manage tours and packages'
    },
    {
      name: 'Rental Management',
      href: '/admin/bookings',
      icon: Calendar,
      moduleName: 'Rental Management',
      description: 'Customer bookings'
    },
    {
      name: 'Fleet Management',
      href: '/admin/fleet',
      icon: Car,
      moduleName: 'Fleet Management',
      description: 'Vehicle fleet overview'
    },
    {
      name: 'Quad Maintenance',
      href: '/admin/maintenance',
      icon: Wrench,
      moduleName: 'Quad Maintenance',
      description: 'Maintenance tracking'
    },
    {
      name: 'Fuel Logs',
      href: '/admin/fuel',
      icon: Fuel,
      moduleName: 'Fuel Logs',
      description: 'Fuel consumption logs'
    },
    {
      name: 'Inventory',
      href: '/admin/inventory',
      icon: Package,
      moduleName: 'Inventory',
      description: 'Parts and supplies'
    },
    {
      name: 'Finance Management',
      href: '/admin/finance',
      icon: DollarSign,
      moduleName: 'Finance Management',
      description: 'Financial reports'
    },
    {
      name: 'Alerts',
      href: '/admin/alerts',
      icon: Bell,
      moduleName: 'Alerts',
      description: 'System notifications'
    },
    {
      name: 'User & Role Management',
      href: '/admin/users',
      icon: Users,
      moduleName: 'User & Role Management',
      description: 'Manage users and permissions'
    },
    {
      name: 'System Settings',
      href: '/admin/settings',
      icon: Settings,
      moduleName: 'System Settings',
      description: 'Application configuration'
    }
  ];

  if (loading) {
    return (
      <div className="w-64 bg-white shadow-sm border-r border-gray-200 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const visibleSidebarItems = sidebarItems;

  return (
    <div className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SX</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Admin Panel</h2>
            <p className="text-xs text-gray-500">SaharaX Management</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-xs">
              {userProfile?.full_name?.charAt(0)?.toUpperCase() || userProfile?.email?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userProfile?.full_name || 'User'}
            </p>
            <p className="text-xs text-gray-500 capitalize">
              {userProfile?.role || 'No Role'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {sidebarItems.map((item) => (
            <PermissionGate key={item.name} moduleName={item.moduleName}>
              <NavLink
                to={item.href}
                className={({ isActive: navIsActive }) => {
                  const isActive = navIsActive || location.pathname.startsWith(item.href + '/');
                  return `group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`;
                }}
              >
                <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  location.pathname.startsWith(item.href) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.name}</div>
                  {location.pathname.startsWith(item.href) && (
                    <div className="text-xs text-blue-600 mt-0.5 truncate">
                      {item.description}
                    </div>
                  )}
                </div>
                {location.pathname.startsWith(item.href) && (
                  <ChevronRight className="h-4 w-4 text-blue-600" />
                )}
              </NavLink>
            </PermissionGate>
          ))}
        </div>
      </nav>

      {/* Module Access Summary */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Module Access</span>
          <span>{visibleSidebarItems.length}/{sidebarItems.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
          <div 
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
            style={{ width: `${(visibleSidebarItems.length / sidebarItems.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Restricted Access Notice */}
      {visibleSidebarItems.length < sidebarItems.length && (
        <div className="p-3 bg-orange-50 border-t border-orange-200">
          <div className="flex items-center space-x-2">
            <Lock className="h-4 w-4 text-orange-600" />
            <span className="text-xs text-orange-700">
              Some modules are restricted
            </span>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <ConnectionStatus />
    </div>
  );
};

export default EnhancedAdminSidebar;