import React, { useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { createPortal } from 'react-dom';
import { 
  HomeIcon, UsersIcon, CalendarIcon, MapIcon, 
  TruckIcon, DropletIcon, SettingsIcon, LogOutIcon,
  XIcon, CompassIcon, Loader2, DollarSignIcon
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabaseClient';
import AlertNotificationBadge from './AlertNotificationBadge';

const MenuDrawer = ({ 
  isOpen, 
  onClose, 
  userModulePermissions, 
  hasModuleAccess, 
  isNavigating, 
  handleReturnToWebsite, 
  handleSignOut 
}) => {
  const location = useLocation();
  const { t } = useTranslation();
  const { userRoles } = useSelector(state => state.auth);

  const isActive = (path) => {
    return location.pathname === path;
  };

  // Define navigation items with module IDs (exact same as original)
  const getAllNavigationItems = () => {
    return [
      { name: 'Dashboard Overview', href: '/admin/dashboard', icon: HomeIcon, moduleId: 'Dashboard' },
      { name: 'Calendar', href: '/admin/calendar', icon: CalendarIcon, moduleId: 'Dashboard' },
      { name: 'Tours & Bookings', href: '/admin/tours', icon: CompassIcon, moduleId: 'Tours & Booking' },
      { name: 'Rental-Management', href: '/admin/rentals', icon: TruckIcon, moduleId: 'Fleet Management' },
      { name: 'Fleet Management', href: '/admin/fleet', icon: TruckIcon, moduleId: 'Fleet Management' },
      { name: 'Pricing Management', href: '/admin/pricing', icon: DollarSignIcon, moduleId: 'Pricing Management' },
      { name: 'Quad Maintenance', href: '/admin/maintenance', icon: SettingsIcon, moduleId: 'Quad Maintenance' },
      { name: 'Fuel Logs', href: '/admin/fuel', icon: DropletIcon, moduleId: 'Fuel Records' },
      { name: 'Inventory', href: '/admin/inventory', icon: MapIcon, moduleId: 'Inventory' },
      { name: 'Finance Management', href: '/admin/finance', icon: UsersIcon, moduleId: 'Finance Management' },
      { 
        name: 'Alerts', 
        href: '/admin/alerts', 
        icon: ({ className }) => <AlertNotificationBadge className={className} />, 
        moduleId: 'Alerts' 
      },
      { name: 'User & Role Management', href: '/admin/users', icon: UsersIcon, moduleId: 'User & Role Management' },
      { name: 'System Settings', href: '/admin/settings', icon: SettingsIcon, moduleId: 'System Settings' },
      { name: 'Project Export', href: '/admin/export', icon: SettingsIcon, moduleId: 'Project Export' },
    ];
  };

  // Filter navigation based on permissions (exact same logic)
  const getFilteredNavigation = () => {
    const allItems = getAllNavigationItems();
    return allItems.filter(item => hasModuleAccess(item.moduleId));
  };

  const navigation = getFilteredNavigation();

  // Lock background scroll when menu opens
  const lockBackgroundScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    
    // Save scroll position
    body.style.setProperty('--scroll-y', scrollY.toString());
    
    // Lock background
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    
    // Prevent scrollbar layout shift
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }, []);

  // Unlock background scroll when menu closes
  const unlockBackgroundScroll = useCallback(() => {
    const body = document.body;
    const scrollY = parseInt(body.style.getPropertyValue('--scroll-y') || '0', 10);
    
    // Remove lock styles
    body.style.removeProperty('position');
    body.style.removeProperty('top');
    body.style.removeProperty('width');
    body.style.removeProperty('overflow');
    body.style.removeProperty('padding-right');
    body.style.removeProperty('--scroll-y');
    
    // Restore scroll position
    window.scrollTo(0, scrollY);
  }, []);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock/unlock background scroll
  useEffect(() => {
    if (isOpen) {
      lockBackgroundScroll();
    } else {
      unlockBackgroundScroll();
    }

    // Cleanup on unmount
    return () => {
      if (isOpen) {
        unlockBackgroundScroll();
      }
    };
  }, [isOpen, lockBackgroundScroll, unlockBackgroundScroll]);

  // Focus trap management
  useEffect(() => {
    if (!isOpen) return;

    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modal = document.querySelector('[data-menu-drawer]');
    if (!modal) return;

    const firstFocusable = modal.querySelector(focusableElements);
    const focusableContent = modal.querySelectorAll(focusableElements);
    const lastFocusable = focusableContent[focusableContent.length - 1];

    // Focus first element
    if (firstFocusable) {
      firstFocusable.focus();
    }

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          lastFocusable?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          firstFocusable?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  // Prevent background interaction
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const menuContent = (
    <div 
      className="fixed inset-0 z-[9999] flex"
      onClick={handleOverlayClick}
      data-menu-drawer
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        aria-hidden="true"
      />
      
      {/* Panel - iOS SCROLL FIX: Added touchAction */}
      <div 
        className="relative flex flex-col w-80 max-w-[85vw] bg-white shadow-xl"
        style={{
          height: '100dvh',
          minHeight: '100vh',
          touchAction: 'pan-y'
        }}
      >
        {/* Header - Static */}
        <div className="flex-shrink-0 h-16 border-b border-gray-200 flex items-center justify-between px-4">
          <Link to="/" className="text-blue-600 font-semibold text-lg">
            SaharaX Admin
          </Link>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Close navigation menu"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Scrollable Content Area - iOS SCROLL FIX */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)'
          }}
          onTouchStart={(e) => {
            // Allow touch events to propagate for scrolling
            e.stopPropagation();
          }}
        >
          {/* Return to Website Button */}
          <div className="px-2 py-2 border-b border-gray-200">
            <button
              onClick={() => {
                handleReturnToWebsite();
                onClose();
              }}
              disabled={isNavigating}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full transition-all duration-200 ${
                isNavigating 
                  ? 'bg-gray-100 text-gray-500 cursor-wait opacity-75' 
                  : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 group'
              }`}
            >
              {isNavigating ? (
                <Loader2 className="h-5 w-5 mr-3 animate-spin text-blue-600" />
              ) : (
                <HomeIcon className="h-5 w-5 mr-3 text-gray-500 group-hover:text-blue-600" />
              )}
              <span className="flex-1">
                {isNavigating ? t('common.loading') : t('common.returnToWebsite')}
              </span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="px-2 py-2 space-y-1">
            {navigation.map((item) => {
              const isItemActive = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={onClose}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md mb-1 ${isItemActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <Icon className={`h-5 w-5 mr-3 ${isItemActive ? 'text-blue-600' : 'text-gray-500'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            
            {/* Separator */}
            <div className="h-px bg-gray-200 my-2"></div>
            
            {/* Logout Button */}
            <button
              onClick={() => {
                handleSignOut();
                onClose();
              }}
              className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100"
            >
              <LogOutIcon className="h-5 w-5 mr-3 text-gray-500" />
              <span>{t('common.logout')}</span>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );

  // Render via Portal under document.body
  return typeof document !== 'undefined' ? createPortal(menuContent, document.body) : null;
};

export default MenuDrawer;
