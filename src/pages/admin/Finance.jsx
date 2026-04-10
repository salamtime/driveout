import React from 'react';
import { BarChart3, FileText, RefreshCw } from 'lucide-react';
import FinanceDashboardV2 from '../../components/finance/FinanceDashboardV2';
import { Toaster } from 'react-hot-toast';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import i18n from '../../i18n';

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
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  console.log('🏦 Finance: Page component rendering');

  const handleNavigateToFleet = (vehicleId = null) => {
    // Navigate to fleet management with optional vehicle focus
    const url = vehicleId ? `/admin/fleet/vehicles/${vehicleId}` : '/admin/fleet';
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<BarChart3 className="h-8 w-8 text-white" />}
        eyebrow={tr('Finance', 'Finance')}
        title={tr('Finance Management', 'Gestion financière')}
        description={tr('Track revenue, profitability, customer performance, and exports from one shared finance workspace.', 'Suivez les revenus, la rentabilité, la performance client et les exports depuis un espace financier partagé.')}
        className="w-full"
        actions={
          <>
            <a
              href="#finance-tabs"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
              {tr('Open Overview', "Ouvrir l'aperçu")}
            </a>
            <a
              href="#finance-reports"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <FileText className="h-4 w-4" />
              {tr('Reports', 'Rapports')}
            </a>
          </>
        }
      />

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
