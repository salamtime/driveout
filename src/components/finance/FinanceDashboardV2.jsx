import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Filter, Download, RefreshCw, TrendingUp, DollarSign, BarChart3, Users, FileText, RotateCcw, Receipt, ShieldAlert, Fuel, Wrench } from 'lucide-react';
import FilterBarV2 from './FilterBarV2';
import KPICardsV2 from './KPICardsV2';
import OverviewChartsV2 from './OverviewChartsV2';
import RentalPLTableV2 from './RentalPLTableV2';
import TourPLTableV2 from './TourPLTableV2';
import FuelPLTabV2 from './FuelPLTabV2';
import MaintenancePLTabV2 from './MaintenancePLTabV2';
import VehicleFinanceTabV2 from './VehicleFinanceTabV2';
import CustomerAnalysisTabV2 from './CustomerAnalysisTabV2';
import ReportsTabV2 from './ReportsTabV2';
import FinanceBreakdownDrawer from './FinanceBreakdownDrawer';
import FinanceCalendarTab from './FinanceCalendarTab';
import FinanceLedgerTabV2 from './FinanceLedgerTabV2';
import FinanceAlertsTabV2 from './FinanceAlertsTabV2';
import { financeApiV2 } from '../../services/financeApiV2';
import appWarmupService from '../../services/AppWarmupService';
import i18n from '../../i18n';
import AdminModuleHero from '../admin/AdminModuleHero';

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 700 });
  }

  return window.setTimeout(callback, 0);
};

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateInputValue = (value) => {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const startOfWeek = (date) => {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
};

const endOfWeek = (date) => {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  copy.setHours(12, 0, 0, 0);
  return copy;
};

const startOfMonth = (date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  return copy;
};

/**
 * Enhanced Finance Dashboard v2 with Modern UI and Data Context Indicators
 * 
 * Features:
 * - Modern gradient header with improved spacing
 * - Color-coded navigation tabs with icons
 * - Smooth animations and transitions
 * - CRITICAL FIX: Proper vehicle prop passing to VehicleFinanceTabV2
 * - Real-time data integration with saharax_0u4w4d_vehicles
 * - Mobile-responsive design with enhanced visual hierarchy
 * - NEW: Data context indicators and scope clarifications
 */
const FinanceDashboardV2 = () => {
  const isFrench = isFrenchLocale();
  const warmFinanceSnapshot = appWarmupService.getWarmFinanceSnapshot();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const focusVehicleId = searchParams.get('vehicleId') || '';
  const focusVehicleDetail = searchParams.get('detail') === '1';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filters, setFilters] = useState({
    startDate: warmFinanceSnapshot?.filters?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: warmFinanceSnapshot?.filters?.endDate || new Date().toISOString().split('T')[0],
    vehicleIds: warmFinanceSnapshot?.filters?.vehicleIds || [],
    customerIds: warmFinanceSnapshot?.filters?.customerIds || [],
    orgId: warmFinanceSnapshot?.filters?.orgId || 'current'
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // CRITICAL FIX: Enhanced data states with proper initialization
  const [kpiData, setKpiData] = useState(warmFinanceSnapshot?.kpiData || null);
  const [trendData, setTrendData] = useState(warmFinanceSnapshot?.trendData || []);
  const [pulseRows, setPulseRows] = useState(warmFinanceSnapshot?.pulseRows || []);
  const [vehicles, setVehicles] = useState(warmFinanceSnapshot?.vehicles || []); // CRITICAL: Ensure this is always an array
  const [customers, setCustomers] = useState(warmFinanceSnapshot?.customers || []);
  const [loading, setLoading] = useState(!warmFinanceSnapshot?.kpiData);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(warmFinanceSnapshot));
  const [trendLoading, setTrendLoading] = useState(!(warmFinanceSnapshot?.trendData?.length > 0));
  const [directoryLoading, setDirectoryLoading] = useState(
    !((warmFinanceSnapshot?.vehicles?.length || 0) > 0 || (warmFinanceSnapshot?.customers?.length || 0) > 0)
  );
  const [error, setError] = useState(null);
  const [breakdownType, setBreakdownType] = useState(null);

  const endDateObject = fromDateInputValue(filters.endDate);
  const weekStart = startOfWeek(endDateObject);
  const weekEnd = endOfWeek(endDateObject);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });

  // Tab configuration with enhanced styling and data scope descriptions
  const tabs = [
    { 
      id: 'overview', 
      label: tr('Overview', "Vue d'ensemble"), 
      icon: BarChart3, 
      color: 'from-blue-500 to-blue-600',
      description: '',
      dataScope: ''
    },
    { 
      id: 'rental-pl', 
      label: tr('Rental P&L', 'P&L locations'), 
      icon: DollarSign, 
      color: 'from-green-500 to-green-600',
      description: tr('Detailed rental profitability analysis', 'Analyse détaillée de rentabilité des locations'),
      dataScope: tr('Data shown reflects profit and loss details for rentals within the selected period.', 'Les données affichées reflètent les détails de profit et perte des locations sur la période sélectionnée.')
    },
    {
      id: 'tour-pl',
      label: tr('Tours P&L', 'P&L tours'),
      icon: DollarSign,
      color: 'from-emerald-500 to-teal-600',
      description: tr('Detailed tour profitability analysis', 'Analyse détaillée de rentabilité des tours'),
      dataScope: tr('Data shown reflects profit and loss details for tours within the selected period.', 'Les données affichées reflètent les détails de profit et perte des tours sur la période sélectionnée.')
    },
    {
      id: 'fuel-pl',
      label: tr('Fuel P&L', 'P&L carburant'),
      icon: Fuel,
      color: 'from-rose-500 to-orange-500',
      description: tr('Fuel in, fuel out, and where fuel is consumed most', 'Carburant entrant, sortant et où il est le plus consommé'),
      dataScope: tr('Data shown uses rental and tour fuel snapshots within the selected period.', 'Les données affichées utilisent les snapshots carburant des locations et tours sur la période sélectionnée.')
    },
    {
      id: 'maintenance-pl',
      label: tr('Maintenance P&L', 'P&L maintenance'),
      icon: Wrench,
      color: 'from-slate-500 to-slate-700',
      description: tr('Maintenance recovery, repair costs, and parts consumed', 'Récupération maintenance, coûts réparation et pièces consommées'),
      dataScope: tr('Parts consumed are shown inside maintenance cost to avoid double counting inventory.', 'Les pièces consommées sont affichées dans le coût maintenance pour éviter le double comptage inventaire.')
    },
    { 
      id: 'vehicle-finance', 
      label: tr('Vehicle Finance', 'Finance véhicule'), 
      icon: TrendingUp, 
      color: 'from-purple-500 to-purple-600',
      description: tr('Vehicle performance and lifetime value', 'Performance véhicule et valeur à vie'),
      dataScope: tr("Data shown reflects each vehicle's total lifetime financial performance.", 'Les données affichées reflètent la performance financière totale à vie de chaque véhicule.')
    },
    { 
      id: 'customer-analysis', 
      label: tr('Customer Analysis', 'Analyse client'), 
      icon: Users, 
      color: 'from-indigo-500 to-indigo-600',
      description: tr('Customer behavior and revenue analysis', 'Analyse du comportement client et des revenus'),
      dataScope: tr('Data shown includes all transactions linked to the selected customer(s).', 'Les données affichées incluent toutes les transactions liées aux clients sélectionnés.')
    },
    {
      id: 'calendar',
      label: tr('Calendar', 'Calendrier'),
      icon: Calendar,
      color: 'from-violet-500 to-purple-600',
      description: tr('Activity calendar — daily, weekly, monthly & yearly view', "Calendrier d'activité — vue journalière, hebdomadaire, mensuelle et annuelle"),
      dataScope: tr('Shows revenue and expenses per day. Click any day to see a breakdown.', 'Affiche les revenus et dépenses par jour. Cliquez sur un jour pour voir le détail.')
    },
    {
      id: 'ledger',
      label: tr('Ledger', 'Journal'),
      icon: Receipt,
      color: 'from-emerald-500 to-teal-600',
      description: tr('One unified financial timeline across all modules', 'Une timeline financière unifiée sur tous les modules'),
      dataScope: tr('Shows finance rows from rentals, tours, maintenance, fuel, inventory, purchases, sales, and taxes.', 'Affiche les lignes finance issues des locations, tours, maintenance, carburant, inventaire, achats, ventes et taxes.')
    },
    {
      id: 'alerts',
      label: tr('Controls', 'Contrôles'),
      icon: ShieldAlert,
      color: 'from-rose-500 to-orange-500',
      description: tr('Operating alerts for unpaid money, missing security, and unhealthy vehicles', 'Alertes opérationnelles pour argent impayé, garantie manquante et véhicules non sains'),
      dataScope: tr('Shows the items the team should act on next, based on current finance and rental state.', 'Affiche les éléments sur lesquels l’équipe doit agir ensuite selon l’état finance et location.')
    },
    {
      id: 'reports',
      label: tr('Reports', 'Rapports'),
      icon: FileText,
      color: 'from-gray-500 to-gray-600',
      description: tr('Export and reporting tools', "Outils d'export et de reporting"),
      dataScope: tr('Data shown includes export options for all available financial records.', "Les données affichées incluent les options d'export pour tous les enregistrements financiers disponibles.")
    }
  ];

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, [filters]);

  const loadDashboardData = async () => {
    try {
      if (!hasLoadedOnce && !kpiData) {
        setLoading(true);
      }
      setError(null);

      const overviewSummary = await financeApiV2.getOverviewSummaryData(filters);
      setKpiData(overviewSummary.kpiData);
      setTrendData(Array.isArray(overviewSummary.trendData) ? overviewSummary.trendData : []);
      setPulseRows(Array.isArray(overviewSummary.pulseRows) ? overviewSummary.pulseRows : []);
      setHasLoadedOnce(true);
      setLoading(false);
      setTrendLoading(false);

      scheduleBackgroundTask(async () => {
        setDirectoryLoading(true);
        try {
          const [vehiclesResult, customersResult] = await Promise.allSettled([
            financeApiV2.getVehicles(filters.orgId),
            financeApiV2.getCustomers(filters.orgId)
          ]);

          if (vehiclesResult.status === 'fulfilled') {
            const vehicleData = Array.isArray(vehiclesResult.value) ? vehiclesResult.value : [];
            setVehicles(vehicleData);
          } else {
            setVehicles([]);
          }

          if (customersResult.status === 'fulfilled') {
            const customerData = Array.isArray(customersResult.value) ? customersResult.value : [];
            setCustomers(customerData);
          } else {
            setCustomers([]);
          }

          appWarmupService.setWarmFinanceSnapshot({
            filters,
            kpiData: overviewSummary.kpiData,
            trendData: Array.isArray(overviewSummary.trendData) ? overviewSummary.trendData : [],
            pulseRows: Array.isArray(overviewSummary.pulseRows) ? overviewSummary.pulseRows : [],
            vehicles: vehiclesResult.status === 'fulfilled' && Array.isArray(vehiclesResult.value) ? vehiclesResult.value : [],
            customers: customersResult.status === 'fulfilled' && Array.isArray(customersResult.value) ? customersResult.value : [],
          });
        } catch (backgroundError) {
          console.error('❌ Finance background hydration failed:', backgroundError);
        } finally {
          setTrendLoading(false);
          setDirectoryLoading(false);
        }
      });
      
    } catch (err) {
      setError(err.message || tr('Failed to load dashboard data', 'Échec du chargement du tableau financier'));
      setKpiData(null);
      setTrendData([]);
      setPulseRows([]);
      setVehicles([]);
      setCustomers([]);
      
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const applyQuickRange = (mode, payloadDate = endDateObject) => {
    const todayBase = new Date();
    todayBase.setHours(12, 0, 0, 0);
    const base = mode === 'today' ? new Date(todayBase) : new Date(payloadDate);
    base.setHours(12, 0, 0, 0);

    let start = new Date(base);
    let end = new Date(base);

    if (mode === 'today') {
      start = new Date(todayBase);
      end = new Date(todayBase);
    } else if (mode === 'yesterday') {
      start = new Date(todayBase);
      start.setDate(start.getDate() - 1);
      end = new Date(start);
    } else if (mode === 'week') {
      start = startOfWeek(base);
      end = endOfWeek(base);
    } else if (mode === 'last7') {
      end = new Date(base);
      start = new Date(base);
      start.setDate(start.getDate() - 6);
    } else if (mode === 'month') {
      start = startOfMonth(base);
      end = new Date(base);
    } else if (mode === 'day') {
      start = new Date(base);
      end = new Date(base);
    }

    setFilters((prev) => ({
      ...prev,
      startDate: toDateInputValue(start),
      endDate: toDateInputValue(end)
    }));
  };

  const shiftWeek = (direction) => {
    const nextEnd = new Date(endDateObject);
    nextEnd.setDate(nextEnd.getDate() + direction * 7);
    applyQuickRange('week', nextEnd);
  };

  const activeQuickRangeLabel = (() => {
    if (filters.startDate === filters.endDate) {
      return tr('Day focus', 'Focus jour');
    }
    if (filters.startDate === toDateInputValue(weekStart) && filters.endDate === toDateInputValue(weekEnd)) {
      return tr('Week focus', 'Focus semaine');
    }
    if (filters.startDate === toDateInputValue(startOfMonth(endDateObject))) {
      return tr('Month focus', 'Focus mois');
    }
    return tr('Custom range', 'Période personnalisée');
  })();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      appWarmupService.invalidateModule('finance', { rewarm: false });
      // Trigger refresh across all components
      setLastRefresh(new Date());
      await loadDashboardData();
      
      // Add a small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('❌ Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExport = async () => {
    try {
      // Export based on active tab
      let exportData;
      switch (activeTab) {
        case 'rental-pl':
          exportData = await financeApiV2.exportPeriodPL(filters);
          break;
        case 'tour-pl':
          exportData = await financeApiV2.exportTourPL(filters);
          break;
        case 'vehicle-finance':
          exportData = await financeApiV2.exportVehicleProfitability(filters);
          break;
        case 'customer-analysis':
          exportData = await financeApiV2.exportCustomerAnalysis(filters);
          break;
        default:
          // Export overview data
          const kpiData = await financeApiV2.getKPIData(filters);
          const csvContent = [
            'Metric,Amount (MAD),Change (%)',
            `Total Revenue,${kpiData.totalRevenue},${kpiData.revenueChange}`,
            `Total Expenses,${kpiData.totalExpenses},${kpiData.expensesChange}`,
            `Taxes,${kpiData.taxes},${kpiData.taxesChange}`,
            `Gross Profit,${kpiData.grossProfit},${kpiData.profitChange}`
          ].join('\n');
          
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `finance_overview_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
          return;
      }

      if (exportData) {
        const csvHeaders = exportData.headers.join(',');
        const csvRows = (exportData.data || []).map((row) =>
          exportData.headers.map((header) => {
            const value = row[header];
            const normalized = value === null || value === undefined ? '' : String(value);
            return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
          }).join(',')
        );
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportData.filename || `finance_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('❌ Export failed:', error);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      vehicleIds: [],
      customerIds: [],
      orgId: 'current'
    });
  };

  const handleOpenBreakdown = (type) => {
    setBreakdownType(type);
  };

  const handleCloseBreakdown = () => {
    setBreakdownType(null);
  };

  const handleOpenBreakdownSource = (row) => {
    if (!row?.href) return;
    window.location.href = row.href;
  };

  const activeTabConfig = tabs.find(tab => tab.id === activeTab);
  const showActiveTabMeta = activeTab !== 'vehicle-finance';

  const renderTabContent = () => {
    const tabProps = { 
      filters, 
      refreshTrigger: lastRefresh.getTime(),
      className: "animate-fadeIn"
    };

    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6 animate-slideInUp">
            <KPICardsV2
              {...tabProps}
              prefetchedKpiData={kpiData}
              parentLoading={loading && !hasLoadedOnce}
              onOpenBreakdown={handleOpenBreakdown}
            />
            <OverviewChartsV2
              {...tabProps}
              prefetchedTrendData={trendData}
              prefetchedKpiData={kpiData}
              prefetchedPulseRows={pulseRows}
              parentLoading={(loading && !hasLoadedOnce) || trendLoading}
            />
          </div>
        );
      case 'rental-pl':
        return (
          <div className="animate-slideInUp">
            <RentalPLTableV2 {...tabProps} />
          </div>
        );
      case 'tour-pl':
        return (
          <div className="animate-slideInUp">
            <TourPLTableV2 {...tabProps} />
          </div>
        );
      case 'fuel-pl':
        return (
          <div className="animate-slideInUp">
            <FuelPLTabV2 {...tabProps} />
          </div>
        );
      case 'maintenance-pl':
        return (
          <div className="animate-slideInUp">
            <MaintenancePLTabV2 {...tabProps} />
          </div>
        );
      case 'vehicle-finance':
        return (
          <div className="animate-slideInUp">
            <VehicleFinanceTabV2 
              {...tabProps}
              vehicles={vehicles}
              loading={directoryLoading}
              initialVehicleId={focusVehicleId}
              initialDetailOpen={focusVehicleDetail}
            />
          </div>
        );
      case 'customer-analysis':
        return (
          <div className="animate-slideInUp">
            <CustomerAnalysisTabV2 {...tabProps} customers={customers} loading={directoryLoading} />
          </div>
        );
      case 'calendar':
        return (
          <div className="animate-slideInUp">
            <FinanceCalendarTab filters={filters} refreshTrigger={lastRefresh.getTime()} />
          </div>
        );
      case 'ledger':
        return (
          <div className="animate-slideInUp">
            <FinanceLedgerTabV2 filters={filters} refreshTrigger={lastRefresh.getTime()} />
          </div>
        );
      case 'reports':
        return (
          <div className="animate-slideInUp">
            <ReportsTabV2 {...tabProps} />
          </div>
        );
      case 'alerts':
        return (
          <div className="animate-slideInUp">
            <FinanceAlertsTabV2 filters={filters} refreshTrigger={lastRefresh.getTime()} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
    <div className="space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 lg:px-8">
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Financial Overview', 'Aperçu financier')}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{tr('Finance command center', 'Centre de commande financier')}</h2>
        </div>

        <div className="rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_24px_70px_rgba(76,29,149,0.08)] sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-violet-50 p-3">
                  <BarChart3 className="h-6 w-6 text-violet-700" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">{tr('Finance dashboard', 'Tableau de bord financier')}</h3>
                  <p className="text-sm text-slate-500">
                    {tr('Last refreshed', 'Dernière actualisation')} {lastRefresh.toLocaleTimeString(isFrench ? 'fr-FR' : 'en-US')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-200 hover:text-violet-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {tr('Refresh', 'Actualiser')}
              </button>

              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.25)] transition-all hover:scale-[1.01]"
              >
                <Download className="h-4 w-4" />
                {tr('Export', 'Exporter')}
              </button>

              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-white"
              >
                <RotateCcw className="h-4 w-4" />
                {tr('Reset', 'Réinitialiser')}
              </button>
            </div>
          </div>

        </div>
      </section>

      <section id="finance-tabs" className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
          <nav className="flex space-x-2 overflow-x-auto pb-1" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    group relative flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 whitespace-nowrap
                    ${isActive
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)]'
                      : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }
                  `}
                  title={tab.description}
                >
                  <Icon className={`mr-2 h-5 w-5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                  <span>{tab.label}</span>
                  
                  {/* Active tab indicator */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-3 rounded-[20px] border border-violet-100 bg-slate-50/70 p-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Fast date focus', 'Focus date rapide')}</p>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  <span className="font-semibold text-slate-900">{activeQuickRangeLabel}</span>
                  <span className="mx-2 text-slate-300">•</span>
                  <span>{filters.startDate} → {filters.endDate}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { key: 'today', label: tr('Today', "Aujourd'hui") },
                { key: 'yesterday', label: tr('Yesterday', 'Hier') },
                { key: 'week', label: tr('This Week', 'Cette semaine') },
                { key: 'last7', label: tr('Last 7 Days', '7 derniers jours') },
                { key: 'month', label: tr('This Month', 'Ce mois') }
              ].map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => applyQuickRange(chip.key)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-white hover:text-violet-700"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => shiftWeek(-1)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                >
                  {tr('Prev Week', 'Semaine préc.')}
                </button>
                <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                  {weekStart.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}
                </p>
                <button
                  type="button"
                  onClick={() => shiftWeek(1)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                >
                  {tr('Next Week', 'Semaine suiv.')}
                </button>
              </div>

              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2 px-1 xl:grid xl:min-w-0 xl:grid-cols-7">
                  {weekDays.map((day) => {
                    const dayValue = toDateInputValue(day);
                    const isActiveDay = filters.startDate === dayValue && filters.endDate === dayValue;
                    return (
                      <button
                        key={dayValue}
                        type="button"
                        onClick={() => applyQuickRange('day', day)}
                        className={`min-w-[76px] rounded-[1rem] border px-2.5 py-2 text-left transition xl:min-w-0 ${
                          isActiveDay
                            ? 'border-violet-300 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-[0_12px_28px_rgba(76,29,149,0.10)]'
                            : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
                        }`}
                      >
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${isActiveDay ? 'text-violet-600' : 'text-slate-500'}`}>
                          {day.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { weekday: 'short' })}
                        </p>
                        <p className="mt-0.5 text-base font-bold text-slate-900">{day.getDate()}</p>
                        <p className="text-xs text-slate-500">
                          {day.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short' })}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <FilterBarV2
                filters={filters}
                vehicles={vehicles}
                customers={customers}
                onFiltersChange={handleFiltersChange}
                loading={loading}
                className="rounded-2xl border border-white bg-white/90 shadow-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="mb-4">
            <div className="rounded-[24px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-3">
              <div className="flex items-center space-x-3">
                <div className="rounded-2xl bg-violet-100 p-2">
                  {React.createElement(activeTabConfig?.icon || BarChart3, {
                    className: "h-5 w-5 text-violet-700"
                  })}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {activeTabConfig?.label}
                  </h2>
                  {showActiveTabMeta && activeTabConfig?.description && (
                    <p className="text-sm text-slate-600">
                      {activeTabConfig?.description}
                    </p>
                  )}
                  {showActiveTabMeta && activeTabConfig?.dataScope && (
                    <p className="mt-1 text-xs text-slate-500">
                      {activeTabConfig?.dataScope}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-[520px]">
            {renderTabContent()}
          </div>

          <div id="finance-reports" className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-center text-xs text-slate-500">
              {tr('Note: Overview shows data for the selected period, while Vehicle Finance shows total lifetime performance.', "Remarque : l’aperçu affiche les données de la période sélectionnée, tandis que la finance véhicule affiche la performance totale à vie.")}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span>{tr('Last updated:', 'Dernière mise à jour :')} {lastRefresh.toLocaleTimeString(isFrench ? 'fr-FR' : 'en-US')}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">{tr('Currency: MAD', 'Devise : MAD')}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>{tr('Vehicles:', 'Véhicules :')} {vehicles.length}</span>
            <span>•</span>
            <span>{tr('Customers:', 'Clients :')} {customers.length}</span>
          </div>
        </div>
      </section>

      {/* Custom Styles for Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideInUp {
          from { 
            opacity: 0; 
            transform: translateY(20px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideInUp {
          animation: slideInUp 0.4s ease-out;
        }
      `}</style>
    </div>
    <FinanceBreakdownDrawer
      isOpen={Boolean(breakdownType)}
      onClose={handleCloseBreakdown}
      breakdownType={breakdownType}
      filters={filters}
      onOpenSource={handleOpenBreakdownSource}
    />
    </>
  );
};

export default FinanceDashboardV2;
