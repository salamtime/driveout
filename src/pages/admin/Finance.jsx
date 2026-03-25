import React from 'react';
import FinanceDashboardV2 from '../../components/finance/FinanceDashboardV2';
import { Toaster } from 'react-hot-toast';

/**
 * Finance Page - Admin finance management and analytics
 * 
 * Features:
 * - Comprehensive Finance Dashboard v2 with enhanced UX
 * - Real vehicle data integration from saharax_0u4w4d_vehicles
 * - Multi-domain financial tracking (Rental, Fleet, Maintenance, Fuel, Inventory)
 * - Advanced KPIs with currency formatting and trend indicators
 * - Interactive charts and reporting capabilities
 * - Export functionality and shareable links
 */
const Finance = () => {
  console.log('🏦 Finance: Page component rendering');

  const handleNavigateToFleet = (vehicleId = null) => {
    // Navigate to fleet management with optional vehicle focus
    const url = vehicleId ? `/admin/fleet/vehicles/${vehicleId}` : '/admin/fleet';
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast notifications for Finance Dashboard v2 */}
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            theme: {
              primary: 'green',
              secondary: 'black',
            },
          },
          error: {
            duration: 5000,
          },
        }}
      />
      
      {/* Finance Dashboard v2 - Enhanced with real vehicle data integration */}
      <FinanceDashboardV2 onNavigateToFleet={handleNavigateToFleet} />
    </div>
  );
};

console.log('📦 Finance: Page module loaded successfully');
export default Finance;