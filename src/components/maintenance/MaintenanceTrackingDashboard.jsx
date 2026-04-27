import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import appWarmupService from '../../services/AppWarmupService';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';
import { useAuth } from '../../contexts/AuthContext';
import { formatRentalReference } from '../../utils/rentalReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import AddMaintenanceForm from './AddMaintenanceForm';
import MaintenanceListView from './MaintenanceListView';
import AdminModuleHero from '../admin/AdminModuleHero';
import AdminMobileStatsRow from '../admin/AdminMobileStatsRow';
import i18n from '../../i18n';
import {
  Plus, 
  Wrench, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  DollarSign,
  Car,
  Calendar,
  TrendingUp,
  Trash2
} from 'lucide-react';

let maintenanceDashboardSnapshotPromise = null;
let maintenanceDashboardSnapshotCache = null;
let maintenanceDashboardSnapshotCacheAt = 0;
let maintenancePrimarySnapshotPromise = null;
let maintenancePrimarySnapshotCache = null;
let maintenancePrimarySnapshotCacheAt = 0;
let maintenanceHistorySnapshotPromise = null;
let maintenanceHistorySnapshotCache = null;
let maintenanceHistorySnapshotCacheAt = 0;
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const resetMaintenanceDashboardCaches = () => {
  maintenanceDashboardSnapshotPromise = null;
  maintenanceDashboardSnapshotCache = null;
  maintenanceDashboardSnapshotCacheAt = 0;
  maintenancePrimarySnapshotPromise = null;
  maintenancePrimarySnapshotCache = null;
  maintenancePrimarySnapshotCacheAt = 0;
  maintenanceHistorySnapshotPromise = null;
  maintenanceHistorySnapshotCache = null;
  maintenanceHistorySnapshotCacheAt = 0;
};

const buildLinkedReportMap = async ({ vehiclesData = [], upcomingData = [], historyData = [] }) => {
  const maintenanceIds = [
    ...(Array.isArray(vehiclesData)
      ? vehiclesData.flatMap((item) => (item?.maintenance_records || []).map((record) => record?.id))
      : []),
    ...(Array.isArray(upcomingData) ? upcomingData.map((record) => record?.id) : []),
    ...(Array.isArray(historyData) ? historyData.map((record) => record?.id) : []),
  ].filter(Boolean);

  if (maintenanceIds.length === 0) {
    return {};
  }

  return VehicleReportService.getReportsByMaintenanceIds(maintenanceIds);
};

const hydrateMaintenanceVehicles = (vehiclesData = [], reportsByMaintenanceId = {}) =>
  (Array.isArray(vehiclesData) ? vehiclesData : []).map((vehicleData) => {
    const maintenanceRecords = (vehicleData?.maintenance_records || []).map((record) => ({
      ...record,
      linked_rental_report: reportsByMaintenanceId[record?.id] || null,
    }));

    return {
      ...vehicleData,
      maintenance_records: maintenanceRecords,
      linked_report_count: maintenanceRecords.filter((record) => Boolean(record.linked_rental_report)).length,
      has_linked_rental_report: maintenanceRecords.some((record) => Boolean(record.linked_rental_report)),
    };
  });

const getMaintenancePrimarySnapshot = async () => {
  const now = Date.now();
  if (maintenancePrimarySnapshotCache && now - maintenancePrimarySnapshotCacheAt < 5000) {
    return maintenancePrimarySnapshotCache;
  }

  if (maintenancePrimarySnapshotPromise) {
    return maintenancePrimarySnapshotPromise;
  }

  maintenancePrimarySnapshotPromise = (async () => {
    const vehiclesData = await MaintenanceTrackingService.getVehiclesInMaintenance();
    const [upcomingResult, statsResult] = await Promise.allSettled([
      MaintenanceTrackingService.getUpcomingMaintenance(),
      MaintenanceTrackingService.getMaintenanceStatistics(),
    ]);

    const upcomingData = upcomingResult.status === 'fulfilled' ? upcomingResult.value : [];
    const statsData = statsResult.status === 'fulfilled' ? statsResult.value : {};
    const reportsByMaintenanceId = await buildLinkedReportMap({ vehiclesData, upcomingData });

    const snapshot = {
      vehiclesInMaintenance: hydrateMaintenanceVehicles(vehiclesData, reportsByMaintenanceId),
      upcomingMaintenance: (Array.isArray(upcomingData) ? upcomingData : []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      })),
      statistics: statsData || {},
    };

    maintenancePrimarySnapshotCache = snapshot;
    maintenancePrimarySnapshotCacheAt = Date.now();
    return snapshot;
  })();

  try {
    return await maintenancePrimarySnapshotPromise;
  } finally {
    maintenancePrimarySnapshotPromise = null;
  }
};

const getMaintenanceHistorySnapshot = async () => {
  const now = Date.now();
  if (maintenanceHistorySnapshotCache && now - maintenanceHistorySnapshotCacheAt < 5000) {
    return maintenanceHistorySnapshotCache;
  }

  if (maintenanceHistorySnapshotPromise) {
    return maintenanceHistorySnapshotPromise;
  }

  maintenanceHistorySnapshotPromise = (async () => {
    const historyData = await MaintenanceTrackingService.getMaintenanceHistory({ limit: 10 });
    const reportsByMaintenanceId = await buildLinkedReportMap({ historyData });
    const snapshot = {
      maintenanceHistory: (Array.isArray(historyData) ? historyData : []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      })),
    };

    maintenanceHistorySnapshotCache = snapshot;
    maintenanceHistorySnapshotCacheAt = Date.now();
    return snapshot;
  })();

  try {
    return await maintenanceHistorySnapshotPromise;
  } finally {
    maintenanceHistorySnapshotPromise = null;
  }
};

const getMaintenanceDashboardSnapshot = async () => {
  const now = Date.now();
  if (maintenanceDashboardSnapshotCache && now - maintenanceDashboardSnapshotCacheAt < 5000) {
    return maintenanceDashboardSnapshotCache;
  }

  if (maintenanceDashboardSnapshotPromise) {
    return maintenanceDashboardSnapshotPromise;
  }

  maintenanceDashboardSnapshotPromise = (async () => {
    const vehiclesData = await MaintenanceTrackingService.getVehiclesInMaintenance();
    const [upcomingResult, historyResult, statsResult] = await Promise.allSettled([
      MaintenanceTrackingService.getUpcomingMaintenance(),
      MaintenanceTrackingService.getMaintenanceHistory({ limit: 10 }),
      MaintenanceTrackingService.getMaintenanceStatistics(),
    ]);

    const upcomingData = upcomingResult.status === 'fulfilled' ? upcomingResult.value : [];
    const historyData = historyResult.status === 'fulfilled' ? historyResult.value : [];
    const statsData = statsResult.status === 'fulfilled' ? statsResult.value : {};
    const maintenanceIds = [
      ...(Array.isArray(vehiclesData)
        ? vehiclesData.flatMap((item) => (item?.maintenance_records || []).map((record) => record?.id))
        : []),
      ...(Array.isArray(upcomingData) ? upcomingData.map((record) => record?.id) : []),
      ...(Array.isArray(historyData) ? historyData.map((record) => record?.id) : []),
    ].filter(Boolean);

    const reportsByMaintenanceId = maintenanceIds.length > 0
      ? await VehicleReportService.getReportsByMaintenanceIds(maintenanceIds)
      : {};

    const hydratedVehicles = (Array.isArray(vehiclesData) ? vehiclesData : []).map((vehicleData) => {
      const maintenanceRecords = (vehicleData?.maintenance_records || []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      }));

      return {
        ...vehicleData,
        maintenance_records: maintenanceRecords,
        linked_report_count: maintenanceRecords.filter((record) => Boolean(record.linked_rental_report)).length,
        has_linked_rental_report: maintenanceRecords.some((record) => Boolean(record.linked_rental_report)),
      };
    });

    const snapshot = {
      vehiclesInMaintenance: hydratedVehicles,
      upcomingMaintenance: (Array.isArray(upcomingData) ? upcomingData : []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      })),
      maintenanceHistory: (Array.isArray(historyData) ? historyData : []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      })),
      statistics: statsData || {},
    };

    maintenanceDashboardSnapshotCache = snapshot;
    maintenanceDashboardSnapshotCacheAt = Date.now();
    return snapshot;
  })();

  try {
    return await maintenanceDashboardSnapshotPromise;
  } finally {
    maintenanceDashboardSnapshotPromise = null;
  }
};

/**
 * MaintenanceTrackingDashboard - Main dashboard for maintenance tracking system
 * 
 * Mobile-friendly, comprehensive maintenance management interface
 */
const MaintenanceTrackingDashboard = () => {
  const isFrench = isFrenchLocale();
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const location = useLocation();
  const navigate = useNavigate();
  const warmMaintenanceSnapshot = appWarmupService.getWarmMaintenanceSnapshot();
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'dashboard');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(warmMaintenanceSnapshot));
  const [historyLoading, setHistoryLoading] = useState(!(warmMaintenanceSnapshot?.maintenanceHistory?.length > 0));
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data states - ALWAYS INITIALIZE AS ARRAYS
  const [vehiclesInMaintenance, setVehiclesInMaintenance] = useState(warmMaintenanceSnapshot?.vehiclesInMaintenance || []);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState(warmMaintenanceSnapshot?.upcomingMaintenance || []);
  const [maintenanceHistory, setMaintenanceHistory] = useState(warmMaintenanceSnapshot?.maintenanceHistory || []);
  const [statistics, setStatistics] = useState(warmMaintenanceSnapshot?.statistics || {});
  const [showAddForm, setShowAddForm] = useState(false);
  const [initialFormContext, setInitialFormContext] = useState(null);
  const [initialEditRecordId, setInitialEditRecordId] = useState(null);
  const [initialViewRecordId, setInitialViewRecordId] = useState(null);
  const [dashboardSourceFilter, setDashboardSourceFilter] = useState('all');
  const [selectedRecordForDelete, setSelectedRecordForDelete] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  useAdminModalFocus(showDeleteModal, 'maintenance-delete');
  const softActionButtonClass = 'rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900';
  const primaryActionButtonClass = 'rounded-2xl bg-violet-600 text-white shadow-sm hover:bg-violet-700';
  const dangerActionButtonClass = 'rounded-2xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800';

  const clearInitialRecordSelection = () => {
    setInitialEditRecordId(null);
    setInitialViewRecordId(null);
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const reportId = params.get('reportId');
    const maintenanceId = params.get('maintenanceId');
    const editId = params.get('editId');
    const vehicleId = params.get('vehicleId');

    const hydrateContext = async () => {
      if (maintenanceId) {
        // Redirect to full-page detail view instead of opening edit form
        navigate(`/admin/maintenance/${maintenanceId}`, { replace: true });
        return;
      }

      if (editId) {
        // Open the edit form for this record
        setActiveTab('maintenance');
        setInitialViewRecordId(null);
        setInitialEditRecordId(editId);
        return;
      }

      if (action === 'create' && (reportId || vehicleId)) {
        let report = null;
        if (reportId) {
          try {
            report = await VehicleReportService.getReportById(reportId);
          } catch (error) {
            console.error('Failed to load vehicle report for maintenance deep link:', error);
          }
        }

        setInitialFormContext({
          source: report ? 'rental_report' : 'manual',
          report,
          vehicleId: report?.vehicle_id?.toString() || vehicleId || '',
          rentalId: params.get('rentalId') || report?.rental_id || '',
        });
        setShowAddForm(true);
      }
    };

    hydrateContext();
  }, [location.search]);

  const loadDashboardData = async () => {
    try {
      if (!hasLoadedOnce) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      const primarySnapshot = await getMaintenancePrimarySnapshot();
      setVehiclesInMaintenance(primarySnapshot.vehiclesInMaintenance || []);
      setUpcomingMaintenance(primarySnapshot.upcomingMaintenance || []);
      setStatistics(primarySnapshot.statistics || {});
      setHasLoadedOnce(true);
      appWarmupService.setWarmMaintenanceSnapshot({
        vehiclesInMaintenance: primarySnapshot.vehiclesInMaintenance || [],
        upcomingMaintenance: primarySnapshot.upcomingMaintenance || [],
        maintenanceHistory,
        statistics: primarySnapshot.statistics || {},
      });
      setLoading(false);
      setRefreshing(false);

      window.setTimeout(async () => {
        setHistoryLoading(true);
        try {
          const historySnapshot = await getMaintenanceHistorySnapshot();
          setMaintenanceHistory(historySnapshot.maintenanceHistory || []);
          appWarmupService.setWarmMaintenanceSnapshot({
            vehiclesInMaintenance: primarySnapshot.vehiclesInMaintenance || [],
            upcomingMaintenance: primarySnapshot.upcomingMaintenance || [],
            maintenanceHistory: historySnapshot.maintenanceHistory || [],
            statistics: primarySnapshot.statistics || {},
          });
        } catch (historyError) {
          console.error('Error loading maintenance history:', historyError);
        } finally {
          setHistoryLoading(false);
        }
      }, 0);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(
        isFrench
          ? `Impossible de charger les donnees du tableau de bord : ${err.message}`
          : `Failed to load dashboard data: ${err.message}`
      );
      // CRITICAL: Set empty arrays on error
      setVehiclesInMaintenance([]);
      setUpcomingMaintenance([]);
      setMaintenanceHistory([]);
      setStatistics({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleMaintenanceAdded = async () => {
    setSuccess(tr('✅ Maintenance record added successfully!', '✅ Fiche de maintenance ajoutee avec succes !'));
    setShowAddForm(false);
    setInitialFormContext(null);
    resetMaintenanceDashboardCaches();
    appWarmupService.invalidateModule('maintenance');
    appWarmupService.invalidateModule('finance');
    await loadDashboardData();
    
    // Clear success message after delay
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleMaintenanceUpdated = async () => {
    setSuccess(tr('✅ Maintenance record updated successfully!', '✅ Fiche de maintenance mise a jour avec succes !'));
    clearInitialRecordSelection();
    resetMaintenanceDashboardCaches();
    appWarmupService.invalidateModule('maintenance');
    appWarmupService.invalidateModule('finance');
    await loadDashboardData();
    
    // Clear success message after delay
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecordForDelete || !isOwner) return;

    try {
      setLoading(true);
      await MaintenanceTrackingService.deleteMaintenanceRecord(selectedRecordForDelete.id);
      setSuccess(tr('✅ Maintenance record deleted successfully!', '✅ Fiche de maintenance supprimee avec succes !'));
      setShowDeleteModal(false);
      setSelectedRecordForDelete(null);
      clearInitialRecordSelection();
      resetMaintenanceDashboardCaches();
      appWarmupService.invalidateModule('maintenance');
      appWarmupService.invalidateModule('finance');
      await loadDashboardData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting maintenance record from dashboard:', err);
      setError(`Failed to delete maintenance record: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openMaintenanceRecord = (recordId, mode = 'view') => {
    if (!recordId) return;
    if (mode === 'view') {
      navigate(`/admin/maintenance/${recordId}`);
      return;
    }
    // edit mode — open the edit form inside the dashboard
    setActiveTab('maintenance');
    setInitialViewRecordId(null);
    setInitialEditRecordId(String(recordId));
  };

  const getOverdueCount = () => {
    // CRITICAL: Always ensure array
    const safeUpcoming = Array.isArray(upcomingMaintenance) ? upcomingMaintenance : [];
    return safeUpcoming.filter(item => item.isOverdue).length;
  };

  const getDueSoonCount = () => {
    // CRITICAL: Always ensure array
    const safeUpcoming = Array.isArray(upcomingMaintenance) ? upcomingMaintenance : [];
    return safeUpcoming.filter(item => item.isDueSoon && !item.isOverdue).length;
  };

  const getRecordFinancialSummary = (record) => {
    const labor = MaintenanceTrackingService.safeCostToNumber(record?.labor_rate_mad || record?.labor_cost_mad);
    const parts = MaintenanceTrackingService.safeCostToNumber(record?.parts_cost_mad);
    const tax = MaintenanceTrackingService.safeCostToNumber(record?.tax_mad);
    const total = MaintenanceTrackingService.safeCostToNumber(record?.cost || record?.total_cost_mad);
    return { labor, parts, tax, total };
  };

  const getVehicleFinancialSummary = (records = []) => {
    return (Array.isArray(records) ? records : []).reduce((summary, record) => {
      const financials = getRecordFinancialSummary(record);
      return {
        labor: summary.labor + financials.labor,
        parts: summary.parts + financials.parts,
        tax: summary.tax + financials.tax,
        total: summary.total + financials.total,
      };
    }, { labor: 0, parts: 0, tax: 0, total: 0 });
  };

  const getLinkedReportLabel = (report) => {
    if (!report) return null;
    const typeLabelMap = {
      damage: 'Damage Report',
      accident: 'Accident Report',
      mechanical_issue: 'Mechanical Report',
    };

    return typeLabelMap[report.report_type] || 'Linked Rental Report';
  };

  // CRITICAL: Safe array access for all data
  const safeVehiclesInMaintenance = Array.isArray(vehiclesInMaintenance) ? vehiclesInMaintenance : [];
  const safeUpcomingMaintenance = Array.isArray(upcomingMaintenance) ? upcomingMaintenance : [];
  const safeMaintenanceHistory = Array.isArray(maintenanceHistory) ? maintenanceHistory : [];

  const getFilteredVehiclesInMaintenance = () => {
    if (dashboardSourceFilter === 'linked') {
      return safeVehiclesInMaintenance.filter((vehicleData) => vehicleData?.has_linked_rental_report);
    }

    if (dashboardSourceFilter === 'regular') {
      return safeVehiclesInMaintenance.filter((vehicleData) => !vehicleData?.has_linked_rental_report);
    }

    return safeVehiclesInMaintenance;
  };

  const filteredVehiclesInMaintenance = getFilteredVehiclesInMaintenance();

  if (loading && !hasLoadedOnce && activeTab === 'dashboard') {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminModuleHero
          icon={<Wrench className="h-8 w-8 text-white" />}
          eyebrow={tr('Maintenance', 'Maintenance')}
          title={tr('Maintenance', 'Maintenance')}
          description={tr('Preparing the maintenance workspace...', 'Préparation de l’espace maintenance...')}
          className="w-full"
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <div className="text-5xl leading-none animate-pulse">⏳</div>
              <p className="text-xl font-semibold text-slate-900">{tr('Loading maintenance...', 'Chargement de la maintenance...')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Wrench className="h-8 w-8 text-white" />}
        eyebrow={tr('Maintenance', 'Maintenance')}
        title={tr('Maintenance', 'Maintenance')}
        description={tr('Run maintenance work, parts usage, and cost tracking from one execution-focused workflow.', "Gérez les travaux de maintenance, l'utilisation des pièces et le suivi des coûts depuis un flux unique d'exécution.")}
        className="w-full"
        actions={
          <Button
            onClick={() => setShowAddForm(true)}
            className="hidden items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20 sm:inline-flex"
          >
            <Plus className="w-4 h-4" />
            {tr('Add Maintenance', 'Ajouter une maintenance')}
          </Button>
        }
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {refreshing && hasLoadedOnce ? (
        <div className="mt-6 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          {tr('Refreshing maintenance data...', 'Actualisation des données de maintenance...')}
        </div>
      ) : null}

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 mt-6 rounded-[1.5rem] border border-green-200 bg-green-50 px-4 py-4 shadow-sm">
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 mt-6 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-4 shadow-sm">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6 mt-6 rounded-[1.75rem] border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
        <nav className="-mx-1 flex gap-3 overflow-x-auto px-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`inline-flex items-center rounded-2xl px-4 py-2.5 font-semibold text-sm whitespace-nowrap transition ${
              activeTab === 'dashboard'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wrench className="inline-block w-4 h-4 mr-2" />
            {tr('Dashboard', 'Tableau de bord')}
          </button>
          <button
            onClick={() => {
              clearInitialRecordSelection();
              setActiveTab('maintenance');
            }}
            className={`inline-flex items-center rounded-2xl px-4 py-2.5 font-semibold text-sm whitespace-nowrap transition ${
              activeTab === 'maintenance'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Car className="inline-block w-4 h-4 mr-2" />
            {tr('Maintenance Records', 'Dossiers de maintenance')}
          </button>
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <AdminMobileStatsRow>
            <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{tr('Maintenance', 'Maintenance')}</p>
                    <p className="text-2xl font-bold text-violet-700">{statistics.vehiclesInMaintenance || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-violet-50 p-3">
                    <Car className="w-6 h-6 text-violet-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{tr('Overdue Items', 'Éléments en retard')}</p>
                    <p className="text-2xl font-bold text-red-600">{getOverdueCount()}</p>
                  </div>
                  <div className="rounded-2xl bg-red-50 p-3">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{tr('Due Soon', 'À venir bientôt')}</p>
                    <p className="text-2xl font-bold text-yellow-600">{getDueSoonCount()}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{tr('Monthly Cost', 'Coût mensuel')}</p>
                    <p className="text-2xl font-bold text-green-600">
                      {MaintenanceTrackingService.formatCurrency(statistics.totalCostThisMonth)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </AdminMobileStatsRow>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Maintenance */}
            <Card className="rounded-[2rem] border-slate-200 bg-slate-50/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 rounded-t-[2rem]">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    {tr('Maintenance', 'Maintenance')} ({filteredVehiclesInMaintenance.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInitialEditRecordId(null);
                        setInitialViewRecordId(null);
                        setActiveTab('maintenance');
                      }}
                      className={softActionButtonClass}
                    >
                      {tr('View All Records', 'Voir tous les dossiers')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowAddForm(true)}
                      className={`flex items-center gap-2 ${primaryActionButtonClass}`}
                    >
                      <Plus className="w-4 h-4" />
                      {tr('New Record', 'Nouveau dossier')}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: tr('All', 'Tous') },
                    { id: 'linked', label: tr('Linked Rental Reports', 'Rapports de location liés') },
                    { id: 'regular', label: tr('Regular Maintenance', 'Maintenance standard') },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDashboardSourceFilter(option.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        dashboardSourceFilter === option.id
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {filteredVehiclesInMaintenance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Car className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">{tr('No vehicles match this maintenance filter', 'Aucun véhicule ne correspond à ce filtre de maintenance')}</p>
                    <p className="text-sm">{tr('Try another source filter or create a new maintenance record.', 'Essayez un autre filtre source ou créez un nouveau dossier de maintenance.')}</p>
                  </div>
                ) : (
                <div className="rounded-[1.75rem] border border-slate-200/80 bg-slate-100/80 p-3 shadow-inner">
                <div className="space-y-4">
                    {filteredVehiclesInMaintenance.slice(0, 5).map((vehicleData) => {
                      // CRITICAL: Safe access to nested arrays
                      const safeMaintenanceRecords = Array.isArray(vehicleData.maintenance_records) ? vehicleData.maintenance_records : [];
                      const safeVehicle = vehicleData.vehicle || {};
                      const latestRecord = safeMaintenanceRecords[0] || null;
                      const latestRecordTotals = getRecordFinancialSummary(latestRecord);
                      const combinedTotals = getVehicleFinancialSummary(safeMaintenanceRecords);
                      const latestLinkedReport = safeMaintenanceRecords.find((record) => record?.linked_rental_report)?.linked_rental_report || null;
                      
                      return (
                        <div key={safeVehicle.id || Math.random()} className="rounded-[1.5rem] border border-slate-300 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition-all hover:border-violet-200 hover:shadow-[0_16px_34px_rgba(76,29,149,0.10)]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-slate-900">
                                {safeVehicle.name || tr('Unknown Vehicle', 'Véhicule inconnu')} ({safeVehicle.plate_number || 'N/A'})
                              </h4>
                              <p className="mt-1 text-sm text-slate-500">
                                {safeMaintenanceRecords.length} {tr('open item', 'élément ouvert')}{safeMaintenanceRecords.length !== 1 ? 's' : ''}
                              </p>
                              {latestLinkedReport && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                                    {tr('Linked Rental Report', 'Rapport de location lié')}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700">
                                    {getLinkedReportLabel(latestLinkedReport)}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                    {String(latestLinkedReport.severity || 'reported').replace(/_/g, ' ')}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 border border-orange-200">
                              {safeMaintenanceRecords.length} {tr('open item', 'élément ouvert')}{safeMaintenanceRecords.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {latestLinkedReport && (
                            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{tr('Rental-linked repair', 'Réparation liée à une location')}</p>
                              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{tr('Rental', 'Location')}</p>
                                  <p className="font-medium text-gray-900">{formatRentalReference(latestLinkedReport.rental_id)}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{tr('Report', 'Rapport')}</p>
                                  <p className="font-medium text-gray-900">{getLinkedReportLabel(latestLinkedReport)}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{tr('Status', 'Statut')}</p>
                                  <p className="font-medium text-gray-900">
                                    {latestLinkedReport.status === 'maintenance_completed' ? tr('Ready to close rental', 'Prêt à clôturer la location') : tr('Repair in progress', 'Réparation en cours')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{tr('Pricing shown from latest record', 'Tarif affiché à partir du dernier dossier')}</p>
                                {(() => {
                                  const maintenanceVisual = getMaintenanceTypeVisual(latestRecord?.maintenance_type);
                                  return (
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                        <span>{maintenanceVisual.emoji}</span>
                                        <span>{maintenanceVisual.label}</span>
                                      </span>
                                      <p className="text-sm font-medium text-slate-900">
                                        {latestRecord?.maintenance_type || tr('No maintenance type', 'Aucun type de maintenance')}
                                      </p>
                                    </div>
                                  );
                                })()}
                              </div>
                              {safeMaintenanceRecords.length > 1 && (
                                <span className="inline-flex items-center rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-700">
                                  {tr('Combined open total:', 'Total combiné ouvert :')} {MaintenanceTrackingService.formatCurrency(combinedTotals.total)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
                            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700">{tr('Labor', "Main-d'œuvre")}</p>
                              <p className="mt-1 text-sm font-semibold text-blue-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.labor)}</p>
                            </div>
                            <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-700">{tr('Parts', 'Pièces')}</p>
                              <p className="mt-1 text-sm font-semibold text-indigo-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.parts)}</p>
                            </div>
                            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">{tr('Tax', 'Taxe')}</p>
                              <p className="mt-1 text-sm font-semibold text-amber-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.tax)}</p>
                            </div>
                            <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-green-700">{tr('Total', 'Total')}</p>
                              <p className="mt-1 text-sm font-semibold text-green-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.total)}</p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {safeMaintenanceRecords.slice(0, 2).map((record) => (
                              <button
                                key={record.id || Math.random()}
                                type="button"
                                onClick={() => openMaintenanceRecord(record.id, 'view')}
                                className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100"
                              >
                                <div className="pr-2">
                                  {(() => {
                                    const maintenanceVisual = getMaintenanceTypeVisual(record.maintenance_type);
                                    return (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                          <span>{maintenanceVisual.emoji}</span>
                                          <span>{maintenanceVisual.label}</span>
                                        </span>
                                        <p className="font-medium text-slate-800">{record.maintenance_type || tr('Unknown Type', 'Type inconnu')}</p>
                                      </div>
                                    );
                                  })()}
                                  <p className="mt-1 text-xs text-slate-500">{MaintenanceTrackingService.formatCurrency(getRecordFinancialSummary(record).total)}</p>
                                  {record?.linked_rental_report && (
                                    <p className="mt-1 text-[11px] font-medium text-red-600">
                                      {tr('Linked rental', 'Location liée')} {formatRentalReference(record.linked_rental_report.rental_id)}
                                    </p>
                                  )}
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  MaintenanceTrackingService.getStatusColor(record.status)
                                }`}>
                                  {record.status || 'unknown'}
                                </span>
                              </button>
                            ))}
                            {safeMaintenanceRecords.length > 2 && (
                              <p className="text-xs text-gray-500">
                                +{safeMaintenanceRecords.length - 2} more items
                              </p>
                            )}
                          </div>
                          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            {safeMaintenanceRecords[0]?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMaintenanceRecord(safeMaintenanceRecords[0].id, 'view')}
                                className={`w-full sm:w-auto sm:flex-1 xl:flex-none ${softActionButtonClass}`}
                              >
                                {tr('Open Record', 'Ouvrir le dossier')}
                              </Button>
                            )}
                            {safeMaintenanceRecords[0]?.id && (
                              <Button
                                size="sm"
                                onClick={() => openMaintenanceRecord(safeMaintenanceRecords[0].id, 'edit')}
                                className={`w-full sm:w-auto sm:flex-1 xl:flex-none ${primaryActionButtonClass}`}
                              >
                                {tr('Edit Record', 'Modifier le dossier')}
                              </Button>
                            )}
                            {isOwner && safeMaintenanceRecords[0]?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRecordForDelete(safeMaintenanceRecords[0]);
                                  setShowDeleteModal(true);
                                }}
                                className={`w-full sm:w-auto sm:flex-1 xl:flex-none ${dangerActionButtonClass}`}
                              >
                                <Trash2 className="mr-1.5 h-4 w-4" />
                                {tr('Delete Record', 'Supprimer le dossier')}
                              </Button>
                            )}
                            {safeMaintenanceRecords.length > 2 && (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                                +{safeMaintenanceRecords.length - 2} {tr('more records', 'autres dossiers')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredVehiclesInMaintenance.length > 5 && (
                      <div className="pt-1">
                        <button
                          onClick={() => {
                            setInitialEditRecordId(null);
                            setInitialViewRecordId(null);
                            setActiveTab('maintenance');
                          }}
                            className="w-full py-2 text-center text-sm text-violet-600 hover:text-violet-700"
                        >
                          {tr('View all', 'Voir les')} {filteredVehiclesInMaintenance.length} {tr('vehicles', 'véhicules')} →
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming/Overdue Maintenance */}
            <Card className="rounded-[2rem] border-slate-200 bg-slate-50/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 rounded-t-[2rem]">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {tr('Upcoming & Overdue', 'À venir & en retard')} ({safeUpcomingMaintenance.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {safeUpcomingMaintenance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">{tr('All caught up!', 'Tout est à jour !')}</p>
                    <p className="text-sm">{tr('No upcoming maintenance scheduled', 'Aucune maintenance à venir planifiée')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {safeUpcomingMaintenance.slice(0, 5).map((record) => {
                      // CRITICAL: Safe access to nested vehicle object
                      const safeVehicle = record.vehicle || {};
                      const maintenanceVisual = getMaintenanceTypeVisual(record.maintenance_type);
                      
                      return (
                        <button
                          key={record.id || Math.random()}
                          type="button"
                          onClick={() => openMaintenanceRecord(record.id, 'view')}
                          className={`w-full rounded-[1.5rem] border p-4 text-left transition-colors hover:shadow-sm ${
                          MaintenanceTrackingService.getPriorityColor(record.priority)
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                  <span>{maintenanceVisual.emoji}</span>
                                  <span>{maintenanceVisual.label}</span>
                                </span>
                                <h4 className="font-medium text-slate-900">
                                  {safeVehicle.plate_number || tr('No Plate', 'Sans plaque')} - {record.maintenance_type || tr('Unknown Type', 'Type inconnu')}
                                </h4>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {safeVehicle.name || tr('Unknown Vehicle', 'Véhicule inconnu')}
                              </p>
                            </div>
                            <span className="text-xs font-medium">
                              {record.isOverdue ? tr('OVERDUE', 'EN RETARD') : tr('DUE SOON', 'BIENTÔT DÛ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm text-slate-600">
                            <span>{tr('Scheduled:', 'Planifié :')} {MaintenanceTrackingService.formatDate(record.scheduled_date)}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              MaintenanceTrackingService.getStatusColor(record.status)
                            }`}>
                              {record.status || 'unknown'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    {safeUpcomingMaintenance.length > 5 && (
                      <button
                        onClick={() => {
                          setInitialEditRecordId(null);
                          setInitialViewRecordId(null);
                          setActiveTab('maintenance');
                        }}
                        className="w-full py-2 text-center text-sm text-violet-600 hover:text-violet-700"
                      >
                          {tr('View all', 'Voir les')} {safeUpcomingMaintenance.length} {tr('items', 'éléments')} →
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Maintenance History */}
          <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/70 rounded-t-[2rem]">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {tr('Recent Maintenance History', 'Historique récent de maintenance')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {safeMaintenanceHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">{tr('No maintenance history', 'Aucun historique de maintenance')}</p>
                  <p className="text-sm">{tr('Start tracking maintenance to see history here', "Commencez à suivre la maintenance pour voir l'historique ici")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[1.5rem] border border-slate-100 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-3 py-3 text-left font-medium text-slate-900">{tr('Vehicle', 'Véhicule')}</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-900">{tr('Type', 'Type')}</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-900">{tr('Date', 'Date')}</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-900">{tr('Status', 'Statut')}</th>
                        <th className="px-3 py-3 text-left font-medium text-slate-900">{tr('Cost', 'Coût')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeMaintenanceHistory.slice(0, 10).map((record) => {
                        // CRITICAL: Safe access to nested vehicle object
                        const safeVehicle = record.vehicle || {};
                        const maintenanceVisual = getMaintenanceTypeVisual(record.maintenance_type);
                        
                        return (
                          <tr
                            key={record.id || Math.random()}
                            className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                            onClick={() => openMaintenanceRecord(record.id, 'view')}
                          >
                            <td className="py-2 px-3">
                              <div>
                                <p className="font-medium text-slate-900">{safeVehicle.name || 'Unknown Vehicle'}</p>
                                <p className="text-xs text-slate-500">{safeVehicle.plate_number || 'N/A'}</p>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                  <span>{maintenanceVisual.emoji}</span>
                                  <span>{maintenanceVisual.label}</span>
                                </span>
                                <span>{record.maintenance_type || 'Unknown Type'}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {MaintenanceTrackingService.formatDate(record.scheduled_date)}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                MaintenanceTrackingService.getStatusColor(record.status)
                              }`}>
                                  {record.status || 'unknown'}
                                </span>
                                {record?.linked_rental_report && (
                                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">
                                    Linked Rental Report
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {MaintenanceTrackingService.formatCurrency(record.total_cost_mad)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {safeMaintenanceHistory.length > 10 && (
                    <div className="text-center pt-4">
                      <button
                        onClick={() => setActiveTab('maintenance')}
                        className="text-sm text-violet-600 hover:text-violet-700"
                      >
                        View complete history →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Maintenance Records Tab */}
      {activeTab === 'maintenance' && (
        <MaintenanceListView 
          onMaintenanceUpdated={handleMaintenanceUpdated}
          onAddMaintenance={() => setShowAddForm(true)}
          initialEditRecordId={initialEditRecordId}
          initialViewRecordId={initialViewRecordId}
          onClearInitialSelection={clearInitialRecordSelection}
        />
      )}

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="app-floating-primary sm:hidden fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-[1.6rem] border border-violet-500/80 bg-gradient-to-r from-violet-600 via-violet-600 to-indigo-700 px-5 py-4 text-white shadow-[0_18px_36px_rgba(79,70,229,0.28)] transition-all duration-200 hover:scale-[1.01] hover:from-violet-700 hover:to-indigo-800 active:scale-[0.99]"
          aria-label={tr('Add Maintenance', 'Ajouter une maintenance')}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/16 ring-1 ring-white/20">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">{tr('Add Maintenance', 'Ajouter une maintenance')}</span>
        </button>
      )}

      {/* Add Maintenance Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <AddMaintenanceForm
              onCancel={() => setShowAddForm(false)}
              onSuccess={handleMaintenanceAdded}
              initialContext={initialFormContext}
            />
          </div>
        </div>
      )}

      {showDeleteModal && selectedRecordForDelete && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{tr('Delete Maintenance Record', 'Supprimer la fiche de maintenance')}</h3>
                  <p className="text-sm text-gray-500">Owner-only action</p>
                </div>
              </div>
              <p className="text-sm text-gray-700">
                Delete <strong>{selectedRecordForDelete.maintenance_type || 'this maintenance record'}</strong> for this vehicle?
                This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedRecordForDelete(null);
                  }}
                  disabled={loading}
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteRecord}
                  disabled={loading}
                >
                  {tr('Delete Record', 'Supprimer la fiche')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default MaintenanceTrackingDashboard;
