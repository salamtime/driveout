import React, { useState, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { 
  HomeIcon, UsersIcon, CalendarIcon, MapIcon, 
  TruckIcon, DropletIcon, SettingsIcon, LogOutIcon,
  MenuIcon, CompassIcon, Loader2, DollarSignIcon
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabaseClient';
import AlertNotificationBadge from './AlertNotificationBadge';
import MobileDrawer from '../navigation/MobileDrawer';
import '../../styles/mobile-drawer.css';

// STANDARDIZED MODULE NAMES - Source of Truth
const STANDARD_MODULES = [
  'Dashboard',
  'Calendar',
  'Tours & Bookings',
  'Live Map',
  'Rental-Management',
  'Customer Management',
  'Fleet Management',
  'Pricing Management',
  'Quad Maintenance',
  'Fuel Logs',
  'Inventory',
  'Finance Management',
  'Alerts',
  'User & Role Management',
  'System Settings',
  'Project Export'
];

const AdminSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});
  
  const isActive = (path) => {
    return location.pathname === path;
  };
  
  // Get user roles from auth state
  const { userRoles } = useSelector(state => state.auth);
  const { user } = useAuth();

  // Fetch user permissions using RPC function
  useEffect(() => {
    const fetchUserPermissions = async () => {
      if (!user?.id) {
        console.log('🔍 [AdminSidebar] No user ID available, skipping permission fetch');
        return;
      }
      
      try {
        console.log('=== 🔍 [AdminSidebar] Fetching user permissions via RPC ===');
        console.log('📋 User ID:', user.id);
        console.log('📋 User Email:', user.email);
        console.log('📋 User Role:', user.role);
        
        // OWNER MASTER KEY: If user is owner, grant all permissions automatically
        if (user.role === 'owner') {
          console.log('🔑 OWNER MASTER KEY ACTIVATED - Granting all permissions');
          const ownerPermissions = {};
          STANDARD_MODULES.forEach(module => {
            ownerPermissions[module] = true;
          });
          console.log('✅ Owner permissions set:', ownerPermissions);
          setUserPermissions(ownerPermissions);
          return;
        }
        
        // Check if user is authenticated
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.warn('⚠️ No valid session, skipping permission fetch');
          return;
        }
        
        console.log('📡 Calling RPC: get_user_effective_permissions');
        console.log('📡 RPC Parameter: v_user_id =', user.id);
        
        // Call the RPC function with correct parameter name
        const { data, error } = await supabase
          .rpc('get_user_effective_permissions', { v_user_id: user.id });

        console.log('📥 RPC Response - typeof data:', typeof data);
        console.log('📥 RPC Response - Array.isArray(data):', Array.isArray(data));
        console.log('📥 RPC Response - data length:', data?.length);
        console.log('📥 RPC Response - Raw Data (full):', JSON.stringify(data, null, 2));
        
        if (data && data.length > 0) {
          console.log('📥 First item structure:', JSON.stringify(data[0], null, 2));
          console.log('📥 First item keys:', Object.keys(data[0]));
        }
        
        console.log('📥 RPC Response - Error:', error);

        if (error) {
          console.error('❌ Error fetching user permissions via RPC:', error);
          // Don't throw, just return - let the component handle empty permissions
          return;
        }

        // Map the results: convert array to object { module_name: is_allowed }
        console.log('🔄 Starting to build permissions map...');
        const permissionsMap = {};
        
        data?.forEach((item, index) => {
          console.log(`  [${index}] Processing item:`, JSON.stringify(item, null, 2));
          console.log(`  [${index}] module_name: "${item.module_name}" (type: ${typeof item.module_name})`);
          console.log(`  [${index}] is_allowed: ${item.is_allowed} (type: ${typeof item.is_allowed})`);
          
          permissionsMap[item.module_name] = item.is_allowed;
          
          console.log(`  [${index}] Added to map: permissionsMap["${item.module_name}"] = ${item.is_allowed}`);
        });

        console.log('🗺️ Permissions Map (after building):', JSON.stringify(permissionsMap, null, 2));
        console.log('🗺️ Permissions Map keys:', Object.keys(permissionsMap));
        console.log('🗺️ Permissions Map values:', Object.values(permissionsMap));
        console.log('📊 Total modules in map:', Object.keys(permissionsMap).length);
        console.log('📊 Total modules with access (true):', Object.values(permissionsMap).filter(v => v === true).length);
        
        console.log('💾 Setting userPermissions state with:', permissionsMap);
        setUserPermissions(permissionsMap);
        
        console.log('=== ✅ [AdminSidebar] Permission fetch complete ===');
      } catch (error) {
        console.error('❌ Error in fetchUserPermissions:', error);
        console.error('❌ Error stack:', error.stack);
        // Don't throw, just log - let the component handle empty permissions
      }
    };

    fetchUserPermissions();
  }, [user?.id, user?.email, user?.role]);

  // Real-time Updates: Listen for permission changes
  useEffect(() => {
    if (!user?.id) return;
    
    // Skip real-time updates for owner - they always have full access
    if (user.role === 'owner') {
      console.log('👑 Owner user - skipping real-time permission updates');
      return;
    }

    console.log('🔔 Setting up real-time subscription for user:', user.id);
    
    const channel = supabase
      .channel('user_permissions_changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'app_b30c02e74da644baad4668e3587d86b1_users',
        filter: `id=eq.${user.id}`
      }, async (payload) => {
        console.log('🔔 Permissions updated in real-time');
        console.log('📦 Payload:', payload);
        
        // Check if user is still authenticated before re-fetching
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('⚠️ No valid session, skipping real-time permission update');
          return;
        }
        
        // Re-fetch permissions using RPC
        const { data, error } = await supabase
          .rpc('get_user_effective_permissions', { v_user_id: user.id });
        
        if (!error && data) {
          const permissionsMap = {};
          data.forEach(item => {
            permissionsMap[item.module_name] = item.is_allowed;
          });
          console.log('🔄 Updated permissions map:', permissionsMap);
          setUserPermissions(permissionsMap);
        }
      })
      .subscribe();

    return () => {
      console.log('🧹 Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.role]);
  
  // Check if user has access to a specific module with case-insensitive comparison
  const hasModuleAccess = useCallback((moduleName) => {
    console.log(`\n🔍 === hasModuleAccess called for: "${moduleName}" ===`);
    console.log('📊 Current userPermissions object:', JSON.stringify(userPermissions, null, 2));
    console.log('📊 userPermissions keys:', Object.keys(userPermissions));
    console.log('📊 Total keys in userPermissions:', Object.keys(userPermissions).length);
    
    // OWNER MASTER KEY: Owners always have access
    if (user?.role === 'owner') {
      console.log(`  ✅ Owner access granted for: "${moduleName}"`);
      return true;
    }
    
    // Normalize module name for comparison (trim and lowercase)
    const normalizedModuleName = moduleName.trim().toLowerCase();
    console.log(`  🔄 Normalized module name: "${normalizedModuleName}"`);
    
    // Check if any permission key matches (case-insensitive)
    console.log('  🔍 Checking all permission keys...');
    for (const [key, value] of Object.entries(userPermissions)) {
      const normalizedKey = key.trim().toLowerCase();
      console.log(`    Comparing: "${normalizedKey}" === "${normalizedModuleName}" ? ${normalizedKey === normalizedModuleName}`);
      console.log(`    Value: ${value} (type: ${typeof value})`);
      
      if (normalizedKey === normalizedModuleName) {
        if (value === true) {
          console.log(`  ✅ Access GRANTED for: "${moduleName}" (key: "${key}", value: ${value})`);
          return true;
        } else {
          console.log(`  ❌ Access DENIED for: "${moduleName}" (key: "${key}", value: ${value})`);
          return false;
        }
      }
    }
    
    console.log(`  ❌ Access DENIED for: "${moduleName}" (no matching key found)`);
    return false;
  }, [userPermissions, user?.role]);

  // Define navigation items with standardized module names
  const getAllNavigationItems = () => {
    return [
      { name: 'Dashboard Overview', href: '/admin/dashboard', icon: HomeIcon, moduleName: 'Dashboard' },
      { name: 'Calendar', href: '/admin/calendar', icon: CalendarIcon, moduleName: 'Calendar' },
      { name: 'Tours & Bookings', href: '/admin/tours', icon: CompassIcon, moduleName: 'Tours & Bookings' },
      { name: 'Live Map', href: '/admin/live-map', icon: MapIcon, moduleName: 'Tours & Bookings' },
      { name: 'Rental-Management', href: '/admin/rentals', icon: TruckIcon, moduleName: 'Rental-Management' },
      { name: 'Customer Management', href: '/admin/customers', icon: UsersIcon, moduleName: 'Customer Management' },
      { name: 'Fleet Management', href: '/admin/fleet', icon: TruckIcon, moduleName: 'Fleet Management' },
      { name: 'Pricing Management', href: '/admin/pricing', icon: DollarSignIcon, moduleName: 'Pricing Management' },
      { name: 'Quad Maintenance', href: '/admin/maintenance', icon: SettingsIcon, moduleName: 'Quad Maintenance' },
      { name: 'Fuel Logs', href: '/admin/fuel', icon: DropletIcon, moduleName: 'Fuel Logs' },
      { name: 'Inventory', href: '/admin/inventory', icon: MapIcon, moduleName: 'Inventory' },
      { name: 'Finance Management', href: '/admin/finance', icon: UsersIcon, moduleName: 'Finance Management' },
      { 
        name: 'Alerts', 
        href: '/admin/alerts', 
        icon: ({ className }) => <AlertNotificationBadge className={className} />, 
        moduleName: 'Alerts' 
      },
      { name: 'User & Role Management', href: '/admin/users', icon: UsersIcon, moduleName: 'User & Role Management' },
      { name: 'System Settings', href: '/admin/settings', icon: SettingsIcon, moduleName: 'System Settings' },
      { name: 'Project Export', href: '/admin/export', icon: SettingsIcon, moduleName: 'Project Export' },
    ];
  };

  // Filter navigation based on permissions
  const getFilteredNavigation = () => {
    console.log('\n🔍 === getFilteredNavigation called ===');
    console.log('🔍 PERMISSIONS MAP FINAL (at filter time):', JSON.stringify(userPermissions, null, 2));
    console.log('📊 userPermissions keys:', Object.keys(userPermissions));
    console.log('📊 Total keys:', Object.keys(userPermissions).length);
    
    const allItems = getAllNavigationItems();
    console.log('📋 Total navigation items to filter:', allItems.length);
    
    const filtered = allItems.filter((item, index) => {
      console.log(`\n[${index}] === Filtering item ===`);
      console.log(`[${index}] Display Name: "${item.name}"`);
      console.log(`[${index}] Module Name: "${item.moduleName}"`);
      console.log(`[${index}] Href: "${item.href}"`);
      
      const hasAccess = hasModuleAccess(item.moduleName);
      
      console.log(`[${index}] Result: ${hasAccess ? '✅ INCLUDED' : '❌ EXCLUDED'}`);
      return hasAccess;
    });
    
    console.log(`\n✅ Filtered navigation items: ${filtered.length} of ${allItems.length}`);
    console.log('📋 Visible modules:', filtered.map(item => item.moduleName));
    console.log('=== End getFilteredNavigation ===\n');
    
    return filtered;
  };

  const navigation = getFilteredNavigation();
  
  console.log('🎯 Final navigation array length:', navigation.length);
  console.log('🎯 Final navigation items:', navigation.map(item => item.name));

  // Convert navigation items to MobileDrawer format
  const getMobileNavItems = () => {
    const items = navigation.map(item => ({
      to: item.href,
      icon: getEmojiIcon(item.name),
      label: item.name
    }));
    
    // Add divider before footer actions
    items.push({ divider: true });
    
    return items;
  };

  // Map navigation items to emoji icons
  const getEmojiIcon = (name) => {
    const iconMap = {
      'Dashboard Overview': '📊',
      'Calendar': '📅',
      'Tours & Bookings': '🗺️',
      'Rental-Management': '📋',
      'Customer Management': '👥',
      'Fleet Management': '🚗',
      'Pricing Management': '💰',
      'Quad Maintenance': '🛠️',
      'Fuel Logs': '⛽',
      'Inventory': '📦',
      'Finance Management': '🧾',
      'Alerts': '🚨',
      'User & Role Management': '👥',
      'System Settings': '⚙️',
      'Project Export': '🧳'
    };
    return iconMap[name] || '📄';
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const handleReturnToWebsite = useCallback(async () => {
    setIsNavigating(true);
    try {
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Navigation error:', error);
    } finally {
      setTimeout(() => setIsNavigating(false), 100);
    }
  }, [navigate]);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 hidden md:block">
        <div className="h-16 border-b border-gray-200 flex items-center px-4">
          <Link to="/" className="text-blue-600 font-semibold text-lg">
            SaharaX Admin
          </Link>
        </div>
        
        {/* Return to Website Button */}
        <div className="px-2 py-2 border-b border-gray-200">
          <button
            onClick={handleReturnToWebsite}
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
        
        <div className="overflow-y-auto h-[calc(100vh-4rem)]">
          <nav className="px-2 py-2 space-y-1">
            {navigation.map((item) => {
              const isItemActive = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md mb-1 ${isItemActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <Icon className={`h-5 w-5 mr-3 ${isItemActive ? 'text-blue-600' : 'text-gray-500'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            
            <div className="h-px bg-gray-200 my-2"></div>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100"
            >
              <LogOutIcon className="h-5 w-5 mr-3 text-gray-500" />
              <span>{t('common.logout')}</span>
            </button>
          </nav>
        </div>
      </aside>
      
      {/* Mobile Burger Button */}
      <div className="md:hidden fixed top-0 left-0 z-30 m-4">
        <button
          className="p-2 sm:p-3 sm:min-w-[44px] sm:min-h-[44px] rounded-md bg-white shadow-md transition-colors flex items-center justify-center hover:bg-gray-50 active:bg-gray-100"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <MenuIcon className="h-6 w-6 text-gray-500" />
        </button>
      </div>
      
      {/* Drop-In MobileDrawer */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="SaharaX Admin"
        items={getMobileNavItems()}
        footer={
          <div style={{display:"grid", gap:8}}>
            <button 
              className="rm-item" 
              onClick={() => {
                handleReturnToWebsite();
                setMobileMenuOpen(false);
              }}
              disabled={isNavigating}
            >
              <span className="rm-icon">🔙</span>
              <span className="rm-label">
                {isNavigating ? 'Loading...' : 'Return to Website'}
              </span>
            </button>
            <button 
              className="rm-item" 
              onClick={() => {
                handleSignOut();
                setMobileMenuOpen(false);
              }}
            >
              <span className="rm-icon">🚪</span>
              <span className="rm-label" style={{color:"#dc2626"}}>Logout</span>
            </button>
          </div>
        }
      />
    </>
  );
};

export default AdminSidebar;
