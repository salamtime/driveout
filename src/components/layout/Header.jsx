import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import LanguageSwitcher from '../common/LanguageSwitcher';
import NotificationsMenu from '../notifications/NotificationsMenu';
import { logout } from '../../store/slices/authSlice';
import { toggleMenu, setMenuOpen } from '../../store/slices/uiSlice';

const Header = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, isGuest, userRoles } = useSelector(state => state.auth);
  const { menuOpen } = useSelector(state => state.ui);
  const [scrolled, setScrolled] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);

  // Track scroll position to add background when scrolled
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Close menu when location changes
  useEffect(() => {
    dispatch(setMenuOpen(false));
    setUserDropdownOpen(false);
  }, [location, dispatch]);

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = useCallback(async () => {
    await dispatch(logout());
    navigate('/');
  }, [dispatch, navigate]);

  const handleMenuToggle = useCallback(() => {
    dispatch(toggleMenu());
  }, [dispatch]);

  const navLinks = useMemo(() => [
    { name: t('navigation.home'), path: '/' },
    { name: t('navigation.atv'), path: '/rentals' },
    { name: t('navigation.tours'), path: '/tours' },
    { name: t('navigation.about'), path: '/about' },
    { name: t('navigation.contact'), path: '/contact' },
  ], [t]);

  const isActive = useCallback((path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }, [location.pathname]);

  return (
    <header 
      className={`fixed w-full top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white shadow-md py-2' : 'bg-transparent py-4'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img 
              src="/assets/images/logo.png" 
              alt={t('common.appName')}
              className="h-10"
              onError={(e) => {
                e.target.src = '/assets/images/logo.png';
              }}
            />
            {/* Remove the text next to logo */}
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {navLinks.map(link => (
              <Link 
                key={link.path} 
                to={link.path}
                className={`
                  transition-colors hover:text-blue-600 
                  ${isActive(link.path) ? 'text-blue-600 font-medium' : 'text-gray-700'}
                `}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Right side - Auth & Language */}
          <div className="flex items-center space-x-4">
            <LanguageSwitcher />

            {isAuthenticated && <NotificationsMenu />}

            {isAuthenticated ? (
              <div className="relative" ref={userDropdownRef}>
                <button 
                  className="flex items-center text-gray-700 hover:text-blue-500 focus:outline-none" 
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                >
                  <span className="mr-2">{user?.user_metadata?.full_name || user?.email}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className={`absolute right-0 w-48 py-2 mt-2 bg-white rounded-md shadow-lg z-50 ${userDropdownOpen ? 'block' : 'hidden'}`}>
                  {/* Profile */}
                  <Link 
                    to="/profile" 
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    {t('common.profile')}
                  </Link>
                  
                  {/* My Bookings */}
                  <Link 
                    to="/my-bookings" 
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    {t('common.myBookings')}
                  </Link>
                  
                  {/* Dashboard - Route based on user role */}
                  <Link 
                    to={userRoles && userRoles.some(role => ['owner', 'admin', 'guide', 'employee'].includes(role)) ? "/admin/dashboard" : "/dashboard"}
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    {t('common.dashboard')}
                  </Link>
                  
                  {/* Logout */}
                  <button 
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
                  >
                    {t('common.logout')}
                  </button>
                </div>
              </div>
            ) : (
              <Link 
                to="/auth/login"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                {t('common.login')}
              </Link>
            )}

            {/* Mobile menu button */}
            <button 
              className="md:hidden focus:outline-none"
              onClick={handleMenuToggle}
              aria-label="Toggle menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div 
        className={`md:hidden absolute top-full left-0 w-full bg-white shadow-md transition-all duration-300 overflow-hidden ${
          menuOpen ? 'max-h-screen' : 'max-h-0'
        }`}
      >
        <nav className="container mx-auto px-4 py-3">
          <ul className="space-y-2">
            {navLinks.map(link => (
              <li key={link.path}>
                <Link 
                  to={link.path}
                  className={`
                    block py-2 transition-colors
                    ${isActive(link.path) ? 'text-blue-600 font-medium' : 'text-gray-700'}
                  `}
                  onClick={() => dispatch(setMenuOpen(false))}
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;