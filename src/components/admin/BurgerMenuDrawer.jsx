import React, { useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { 
  HomeIcon, UsersIcon, CalendarIcon, MapIcon, 
  TruckIcon, DropletIcon, SettingsIcon, LogOutIcon,
  XIcon, CompassIcon, Loader2, DollarSignIcon
} from 'lucide-react';
import AlertNotificationBadge from './AlertNotificationBadge';

const BurgerMenuDrawer = ({ 
  isOpen, 
  onClose, 
  navigation,
  isNavigating, 
  handleReturnToWebsite, 
  handleSignOut 
}) => {
  const location = useLocation();
  const { t } = useTranslation();
  const savedScrollYRef = useRef(0);
  const restoreFocusRef = useRef(null);

  const isActive = (path) => {
    return location.pathname === path;
  };

  // Smart background scroll lock
  const lockBackgroundScroll = useCallback(() => {
    // Save current scroll position
    savedScrollYRef.current = window.scrollY;
    
    // Get scrolling element (handles different browsers)
    const scrollElement = document.scrollingElement || document.documentElement || document.body;
    
    // Apply lock styles
    scrollElement.style.position = 'fixed';
    scrollElement.style.top = `-${savedScrollYRef.current}px`;
    scrollElement.style.width = '100%';
    scrollElement.style.overflow = 'hidden';
    
    // Prevent scrollbar layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    
    // Add body class for additional CSS targeting
    document.body.classList.add('menu-drawer-open');
  }, []);

  // Unlock background scroll and restore position
  const unlockBackgroundScroll = useCallback(() => {
    const scrollElement = document.scrollingElement || document.documentElement || document.body;
    
    // Remove lock styles
    scrollElement.style.removeProperty('position');
    scrollElement.style.removeProperty('top');
    scrollElement.style.removeProperty('width');
    scrollElement.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    document.body.classList.remove('menu-drawer-open');
    
    // Restore exact scroll position
    window.scrollTo(0, savedScrollYRef.current);
    savedScrollYRef.current = 0;
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

    const menuDrawer = document.querySelector('[data-menu-drawer]');
    if (!menuDrawer) return;

    const focusableElements = menuDrawer.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Focus first element when opened
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

  // Store focus element to restore later
  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current = document.activeElement;
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [isOpen]);

  // Prevent background interaction
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOverlayTouchMove = (e) => {
    e.preventDefault();
  };

  const handleOverlayWheel = (e) => {
    e.preventDefault();
  };

  if (!isOpen) return null;

  const drawerContent = (
    <div 
      className="fixed inset-0 z-[9999]"
      onClick={handleOverlayClick}
      onTouchMove={handleOverlayTouchMove}
      onWheel={handleOverlayWheel}
      data-menu-drawer
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        aria-hidden="true"
      />
      
      {/* Smart Menu Panel */}
      <div 
        className="relative flex flex-col bg-white shadow-xl"
        style={{
          width: '320px',
          maxWidth: '85vw',
          height: '100dvh', // Modern viewport height
          minHeight: '100vh' // Fallback for older browsers
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Static */}
        <div className="flex-shrink-0 h-16 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
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

        {/* Scrollable List - ONLY scroll container */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            minHeight: 0, // Critical for flex scrolling
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)'
          }}
        >
          {/* Return to Website Button */}
          <div className="px-2 py-2 border-b border-gray-200 bg-white">
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
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md mb-1 transition-colors ${
                    isItemActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
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
              className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
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
  return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
};

export default BurgerMenuDrawer;