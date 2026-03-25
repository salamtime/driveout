import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import { useAuth } from '../../contexts/AuthContext';
import { formatRentalReference } from '../../utils/rentalReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import AddMaintenanceForm from './AddMaintenanceForm';
import MaintenanceListView from './MaintenanceListView';
import AdminModuleHero from '../admin/AdminModuleHero';
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

/**
 * MaintenanceTrackingDashboard - Main dashboard for maintenance tracking system
 * 
 * Mobile-friendly, comprehensive maintenance management interface
 */
const MaintenanceTrackingDashboard = () => {
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data states - ALWAYS INITIALIZE AS ARRAYS
  const [vehiclesInMaintenance, setVehiclesInMaintenance] = useState([]);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState([]);
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [initialFormContext, setInitialFormContext] = useState(null);
  const [initialEditRecordId, setInitialEditRecordId] = useState(null);
  const [initialViewRecordId, setInitialViewRecordId] = useState(null);
  const [dashboardSourceFilter, setDashboardSourceFilter] = useState('all');
  const [selectedRecordForDelete, setSelectedRecordForDelete] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
      setLoading(true);
      setError(null);

      const [vehiclesData, upcomingData, historyData, statsData] = await Promise.all([
        MaintenanceTrackingService.getVehiclesInMaintenance(),
        MaintenanceTrackingService.getUpcomingMaintenance(),
        MaintenanceTrackingService.getMaintenanceHistory({ limit: 10 }),
        MaintenanceTrackingService.getMaintenanceStatistics()
      ]);

      const maintenanceIds = [
        ...(Array.isArray(vehiclesData) ? vehiclesData.flatMap((item) => (item?.maintenance_records || []).map((record) => record?.id)) : []),
        ...(Array.isArray(upcomingData) ? upcomingData.map((record) => record?.id) : []),
        ...(Array.isArray(historyData) ? historyData.map((record) => record?.id) : []),
      ].filter(Boolean);

      const reportsByMaintenanceId = await VehicleReportService.getReportsByMaintenanceIds(maintenanceIds);

      // CRITICAL: Always ensure arrays, never undefined
      const safeVehiclesData = (Array.isArray(vehiclesData) ? vehiclesData : []).map((vehicleData) => {
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
      const safeUpcomingData = (Array.isArray(upcomingData) ? upcomingData : []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      }));
      const safeHistoryData = (Array.isArray(historyData) ? historyData : []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      }));
      const safeStatsData = statsData || {};

      setVehiclesInMaintenance(safeVehiclesData);
      setUpcomingMaintenance(safeUpcomingData);
      setMaintenanceHistory(safeHistoryData);
      setStatistics(safeStatsData);

      console.log('✅ Dashboard data loaded successfully');
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(`Failed to load dashboard data: ${err.message}`);
      // CRITICAL: Set empty arrays on error
      setVehiclesInMaintenance([]);
      setUpcomingMaintenance([]);
      setMaintenanceHistory([]);
      setStatistics({});
    } finally {
      setLoading(false);
    }
  };

  const handleMaintenanceAdded = async () => {
    setSuccess('✅ Maintenance record added successfully!');
    setShowAddForm(false);
    setInitialFormContext(null);
    await loadDashboardData();
    
    // Clear success message after delay
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleMaintenanceUpdated = async () => {
    setSuccess('✅ Maintenance record updated successfully!');
    clearInitialRecordSelection();
    await loadDashboardData();
    
    // Clear success message after delay
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecordForDelete || !isOwner) return;

    try {
      setLoading(true);
      await MaintenanceTrackingService.deleteMaintenanceRecord(selectedRecordForDelete.id);
      setSuccess('✅ Maintenance record deleted successfully!');
      setShowDeleteModal(false);
      setSelectedRecordForDelete(null);
      clearInitialRecordSelection();
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

  if (loading && activeTab === 'dashboard') {
    return (
      <div className="p-4 md:p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <AdminModuleHero
        icon={<Wrench className="h-8 w-8 text-white" />}
        eyebrow="Quad Maintenance"
        title="Quad Maintenance"
        description="Run maintenance work, parts usage, and cost tracking from one execution-focused workflow."
        actions={
          <Button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
          >
            <Plus className="w-4 h-4" />
            New Maintenance Record
          </Button>
        }
      />

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6 mt-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Wrench className="inline-block w-4 h-4 mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => {
              clearInitialRecordSelection();
              setActiveTab('maintenance');
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === 'maintenance'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Car className="inline-block w-4 h-4 mr-2" />
            Maintenance Records
          </button>
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Vehicles in Maintenance</p>
                    <p className="text-2xl font-bold text-blue-600">{statistics.vehiclesInMaintenance || 0}</p>
                  </div>
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Car className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Overdue Items</p>
                    <p className="text-2xl font-bold text-red-600">{getOverdueCount()}</p>
                  </div>
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Due Soon</p>
                    <p className="text-2xl font-bold text-yellow-600">{getDueSoonCount()}</p>
                  </div>
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Monthly Cost</p>
                    <p className="text-2xl font-bold text-green-600">
                      {MaintenanceTrackingService.formatCurrency(statistics.totalCostThisMonth)}
                    </p>
                  </div>
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Vehicles in Maintenance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    Vehicles in Maintenance ({filteredVehiclesInMaintenance.length})
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
                      className="rounded-lg"
                    >
                      View All Records
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-2 rounded-lg"
                    >
                      <Plus className="w-4 h-4" />
                      New Record
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'linked', label: 'Linked Rental Reports' },
                    { id: 'regular', label: 'Regular Maintenance' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDashboardSourceFilter(option.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        dashboardSourceFilter === option.id
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {filteredVehiclesInMaintenance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Car className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No vehicles match this maintenance filter</p>
                    <p className="text-sm">Try another source filter or create a new maintenance record.</p>
                  </div>
                ) : (
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
                        <div key={safeVehicle.id || Math.random()} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-gray-900">
                                {safeVehicle.name || 'Unknown Vehicle'} ({safeVehicle.plate_number || 'N/A'})
                              </h4>
                              <p className="mt-1 text-sm text-gray-500">
                                {safeMaintenanceRecords.length} open item{safeMaintenanceRecords.length !== 1 ? 's' : ''}
                              </p>
                              {latestLinkedReport && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                                    Linked Rental Report
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
                              {safeMaintenanceRecords.length} open item{safeMaintenanceRecords.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {latestLinkedReport && (
                            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Rental-linked repair</p>
                              <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Rental</p>
                                  <p className="font-medium text-gray-900">{formatRentalReference(latestLinkedReport.rental_id)}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Report</p>
                                  <p className="font-medium text-gray-900">{getLinkedReportLabel(latestLinkedReport)}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Status</p>
                                  <p className="font-medium text-gray-900">
                                    {latestLinkedReport.status === 'maintenance_completed' ? 'Ready to close rental' : 'Repair in progress'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pricing shown from latest record</p>
                                {(() => {
                                  const maintenanceVisual = getMaintenanceTypeVisual(latestRecord?.maintenance_type);
                                  return (
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                        <span>{maintenanceVisual.emoji}</span>
                                        <span>{maintenanceVisual.label}</span>
                                      </span>
                                      <p className="text-sm font-medium text-blue-900">
                                        {latestRecord?.maintenance_type || 'No maintenance type'}
                                      </p>
                                    </div>
                                  );
                                })()}
                              </div>
                              {safeMaintenanceRecords.length > 1 && (
                                <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                  Combined open total: {MaintenanceTrackingService.formatCurrency(combinedTotals.total)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700">Labor</p>
                              <p className="mt-1 text-sm font-semibold text-blue-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.labor)}</p>
                            </div>
                            <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-700">Parts</p>
                              <p className="mt-1 text-sm font-semibold text-indigo-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.parts)}</p>
                            </div>
                            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Tax</p>
                              <p className="mt-1 text-sm font-semibold text-amber-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.tax)}</p>
                            </div>
                            <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-green-700">Total</p>
                              <p className="mt-1 text-sm font-semibold text-green-900">{MaintenanceTrackingService.formatCurrency(latestRecordTotals.total)}</p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {safeMaintenanceRecords.slice(0, 2).map((record) => (
                              <button
                                key={record.id || Math.random()}
                                type="button"
                                onClick={() => openMaintenanceRecord(record.id, 'view')}
                                className="w-full flex items-center justify-between text-sm rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100 transition-colors"
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
                                        <p className="text-gray-800 font-medium">{record.maintenance_type || 'Unknown Type'}</p>
                                      </div>
                                    );
                                  })()}
                                  <p className="mt-1 text-xs text-gray-500">{MaintenanceTrackingService.formatCurrency(getRecordFinancialSummary(record).total)}</p>
                                  {record?.linked_rental_report && (
                                    <p className="mt-1 text-[11px] font-medium text-red-600">
                                      Linked rental {formatRentalReference(record.linked_rental_report.rental_id)}
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
                          <div className="mt-4 flex flex-col lg:flex-row gap-2">
                            {safeMaintenanceRecords[0]?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMaintenanceRecord(safeMaintenanceRecords[0].id, 'view')}
                                className="w-full lg:w-auto"
                              >
                                Open Record
                              </Button>
                            )}
                            {safeMaintenanceRecords[0]?.id && (
                              <Button
                                size="sm"
                                onClick={() => openMaintenanceRecord(safeMaintenanceRecords[0].id, 'edit')}
                                className="w-full lg:w-auto"
                              >
                                Edit Record
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
                                className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 lg:w-auto"
                              >
                                <Trash2 className="mr-1.5 h-4 w-4" />
                                Delete Record
                              </Button>
                            )}
                            {safeMaintenanceRecords.length > 2 && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
                                +{safeMaintenanceRecords.length - 2} more records
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
                          className="w-full text-center text-sm text-blue-600 hover:text-blue-700 py-2"
                        >
                          View all {filteredVehiclesInMaintenance.length} vehicles →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming/Overdue Maintenance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Upcoming & Overdue ({safeUpcomingMaintenance.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {safeUpcomingMaintenance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">All caught up!</p>
                    <p className="text-sm">No upcoming maintenance scheduled</p>
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
                          className={`w-full text-left p-4 rounded-xl border transition-colors hover:shadow-sm ${
                          MaintenanceTrackingService.getPriorityColor(record.priority)
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                  <span>{maintenanceVisual.emoji}</span>
                                  <span>{maintenanceVisual.label}</span>
                                </span>
                                <h4 className="font-medium text-gray-900">
                                  {safeVehicle.plate_number || 'No Plate'} - {record.maintenance_type || 'Unknown Type'}
                                </h4>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {safeVehicle.name || 'Unknown Vehicle'}
                              </p>
                            </div>
                            <span className="text-xs font-medium">
                              {record.isOverdue ? 'OVERDUE' : 'DUE SOON'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>Scheduled: {MaintenanceTrackingService.formatDate(record.scheduled_date)}</span>
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
                        className="w-full text-center text-sm text-blue-600 hover:text-blue-700 py-2"
                      >
                        View all {safeUpcomingMaintenance.length} items →
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Maintenance History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Recent Maintenance History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {safeMaintenanceHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">No maintenance history</p>
                  <p className="text-sm">Start tracking maintenance to see history here</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-900">Vehicle</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-900">Type</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-900">Date</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-900">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-900">Cost</th>
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
                            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => openMaintenanceRecord(record.id, 'view')}
                          >
                            <td className="py-2 px-3">
                              <div>
                                <p className="font-medium text-gray-900">{safeVehicle.name || 'Unknown Vehicle'}</p>
                                <p className="text-xs text-gray-500">{safeVehicle.plate_number || 'N/A'}</p>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-gray-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                  <span>{maintenanceVisual.emoji}</span>
                                  <span>{maintenanceVisual.label}</span>
                                </span>
                                <span>{record.maintenance_type || 'Unknown Type'}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-gray-600">
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
                            <td className="py-2 px-3 text-gray-900 font-medium">
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
                        className="text-sm text-blue-600 hover:text-blue-700"
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
                  <h3 className="text-lg font-semibold text-gray-900">Delete Maintenance Record</h3>
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
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteRecord}
                  disabled={loading}
                >
                  Delete Record
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceTrackingDashboard;
