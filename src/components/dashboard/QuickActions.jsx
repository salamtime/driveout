import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

const QuickActions = () => {
  const { t } = useTranslation();
  const { userRoles } = useSelector(state => state.auth);
  
  // Determine which actions to show based on user roles
  const isAdmin = userRoles?.includes('admin');
  const isGuide = userRoles?.includes('guide');
  // Using optional chaining and added null check
  const isManager = userRoles && userRoles.some(role => ['admin', 'owner', 'manager'].includes(role));
  const isEmployee = userRoles?.includes('employee');
  
  // Define all possible quick actions
  const allQuickActions = [
    {
      id: 'create-booking',
      title: t('admin.dashboard.createBooking', 'Create Booking'),
      description: t('admin.dashboard.createBookingDesc', 'Add a new tour or rental booking'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      ),
      link: '/admin/bookings?action=create',
      roles: ['admin', 'employee']
    },
    {
      id: 'log-maintenance',
      title: t('admin.dashboard.logMaintenance', 'Log Maintenance'),
      description: t('admin.dashboard.logMaintenanceDesc', 'Record vehicle service or repairs'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      link: '/admin/maintenance?action=create',
      roles: ['admin', 'employee', 'guide']
    },
    {
      id: 'log-fuel',
      title: t('admin.dashboard.logFuel', 'Log Fuel'),
      description: t('admin.dashboard.logFuelDesc', 'Record fuel refills or quad fueling'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      link: '/admin/fuel',
      roles: ['admin', 'manager', 'owner', 'guide']
    },
    {
      id: 'manage-inventory',
      title: t('admin.dashboard.manageInventory', 'Manage Inventory'),
      description: t('admin.dashboard.manageInventoryDesc', 'Update stock levels and parts'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      ),
      link: '/admin/inventory',
      roles: ['admin', 'employee']
    },
    {
      id: 'start-tour',
      title: t('admin.dashboard.startTour', 'Start Tour'),
      description: t('admin.dashboard.startTourDesc', 'Begin a scheduled tour'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      link: '/admin/guide-dashboard',
      roles: ['guide']
    },
    {
      id: 'view-live-map',
      title: t('admin.dashboard.viewMap', 'View Live Map'),
      description: t('admin.dashboard.viewMapDesc', 'See all tours and guides in the field'),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      link: '/admin/live-map',
      roles: ['admin', 'guide', 'employee']
    }
  ];
  
  // Filter quick actions based on user role
  const filteredQuickActions = allQuickActions.filter(action => {
    if (!userRoles || userRoles.length === 0) {
      return false;
    }
    // Added defensive check for action.roles array
    return action.roles && Array.isArray(action.roles) && action.roles.some(role => userRoles && userRoles.includes(role));
  });
  
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="bg-blue-600 px-4 py-4 text-white">
        <h2 className="text-lg font-semibold">{t('admin.dashboard.quickActions', 'Quick Actions')}</h2>
        <p className="text-sm opacity-80">
          {t('admin.dashboard.quickActionsDescription', 'Frequently used operations and shortcuts')}
        </p>
      </div>
      
      <div className="p-4">
        <div className="grid gap-4">
          {filteredQuickActions.map((action) => (
            <Link 
              key={action.id}
              to={action.link}
              className="flex items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors"
            >
              <div className="flex-shrink-0 text-blue-600">
                {action.icon}
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">{action.title}</h3>
                <p className="text-xs text-gray-600 mt-1">{action.description}</p>
              </div>
              <div className="ml-auto text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
        
        {filteredQuickActions.length === 0 && (
          <div className="text-center p-4 text-gray-500">
            {t('admin.dashboard.noAvailableActions', 'No quick actions available for your role')}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickActions;
