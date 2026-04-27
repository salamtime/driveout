import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import { useAuth } from '../../contexts/AuthContext';
import { formatRentalReference } from '../../utils/rentalReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import AddMaintenanceForm from './AddMaintenanceForm';
import i18n from '../../i18n';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  Calendar,
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
  Car,
  Package,
  Grid,
  List
} from 'lucide-react';

/**
 * MaintenanceListView - List and manage all maintenance records
 * 
 * CRITICAL: All arrays must have fallback values to prevent undefined.map() errors
 */
const MaintenanceListView = ({ onMaintenanceUpdated, onAddMaintenance, initialEditRecordId = null, initialViewRecordId = null, onClearInitialSelection = null }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const softActionButtonClass = 'rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900';
  const primaryActionButtonClass = 'rounded-2xl bg-violet-600 text-white shadow-sm hover:bg-violet-700';
  const warningActionButtonClass = 'rounded-2xl border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800';
  const dangerActionButtonClass = 'rounded-2xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800';
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isOwner = userProfile?.role === 'owner';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // FIXED: Removed local success state to prevent duplicate notifications
  
  // Data states - ALWAYS INITIALIZE AS ARRAYS
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [smartFilter, setSmartFilter] = useState('all');
  const [sortBy, setSortBy] = useState('service_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [viewMode, setViewMode] = useState('cards');
  const [densityMode, setDensityMode] = useState('compact');
  const [expandedRecordIds, setExpandedRecordIds] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modal states
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // CRITICAL FIX: Add state for full record with parts data
  const [editingRecordWithParts, setEditingRecordWithParts] = useState(null);
  const [loadingFullRecord, setLoadingFullRecord] = useState(false);
  
  // ENHANCEMENT: Add state for view modal with complete data
  const [selectedRecordWithParts, setSelectedRecordWithParts] = useState(null);
  const [loadingViewRecord, setLoadingViewRecord] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  useEffect(() => {
    loadMaintenanceData();
  }, []);

  useEffect(() => {
    const openInitialEdit = async () => {
      if (!initialEditRecordId) return;
      try {
        const record = await MaintenanceTrackingService.getMaintenanceById(initialEditRecordId);
        if (record) {
          handleEditRecord(record);
          onClearInitialSelection?.();
        }
      } catch (error) {
        console.error('Failed to open initial maintenance record:', error);
      }
    };

    openInitialEdit();
  }, [initialEditRecordId, onClearInitialSelection]);

  useEffect(() => {
    const openInitialView = async () => {
      if (!initialViewRecordId) return;
      try {
        const record = await MaintenanceTrackingService.getMaintenanceById(initialViewRecordId);
        if (record) {
          handleViewRecord(record);
          onClearInitialSelection?.();
        }
      } catch (error) {
        console.error('Failed to open initial maintenance record for viewing:', error);
      }
    };

    openInitialView();
  }, [initialViewRecordId, onClearInitialSelection]);

  useEffect(() => {
    filterAndSortRecords();
  }, [maintenanceRecords, searchTerm, statusFilter, vehicleFilter, sourceFilter, smartFilter, sortBy, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, vehicleFilter, sourceFilter, smartFilter, sortBy, sortOrder, viewMode]);

  const loadMaintenanceData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [recordsData, vehiclesData] = await Promise.all([
        MaintenanceTrackingService.getAllMaintenanceRecords(),
        MaintenanceTrackingService.getAllVehicles()
      ]);

      const reportsByMaintenanceId = await VehicleReportService.getReportsByMaintenanceIds(
        (recordsData || []).map((record) => record?.id)
      );

      // CRITICAL: Always ensure arrays, never undefined
      const safeRecords = (recordsData || []).map((record) => ({
        ...record,
        linked_rental_report: reportsByMaintenanceId[record?.id] || null,
      }));
      const safeVehicles = vehiclesData || [];

      setMaintenanceRecords(safeRecords);
      setVehicles(safeVehicles);

      console.log('✅ Maintenance data loaded:', safeRecords.length, 'records,', safeVehicles.length, 'vehicles');
    } catch (err) {
      console.error('Error loading maintenance data:', err);
      setError(`Failed to load maintenance data: ${err.message}`);
      // CRITICAL: Set empty arrays on error
      setMaintenanceRecords([]);
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortRecords = () => {
    try {
      // CRITICAL: Always ensure we have an array
      let filtered = Array.isArray(maintenanceRecords) ? [...maintenanceRecords] : [];

      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(record => 
          (record.maintenance_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (record.description || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Apply status filter
      if (statusFilter !== 'all') {
        filtered = filtered.filter(record => record.status === statusFilter);
      }

      // Apply vehicle filter
      if (vehicleFilter !== 'all') {
        filtered = filtered.filter(record => record.vehicle_id === parseInt(vehicleFilter));
      }

      if (sourceFilter === 'linked') {
        filtered = filtered.filter((record) => Boolean(record.linked_rental_report));
      }

      if (sourceFilter === 'regular') {
        filtered = filtered.filter((record) => !record.linked_rental_report);
      }

      if (smartFilter === 'needs_attention') {
        filtered = filtered.filter((record) => (
          record.status === 'scheduled'
          || record.status === 'in_progress'
          || Boolean(record.linked_rental_report && record.linked_rental_report.status !== 'maintenance_completed')
        ));
      }

      if (smartFilter === 'incomplete') {
        filtered = filtered.filter((record) => record.status !== 'completed');
      }

      if (smartFilter === 'high_cost') {
        filtered = filtered.filter((record) => getFinancialSummary(record).total >= 1000);
      }

      // Apply sorting
      filtered.sort((a, b) => {
        let aValue = a[sortBy] || '';
        let bValue = b[sortBy] || '';

        if (sortBy === 'service_date') {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
        }

        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      setFilteredRecords(filtered);
    } catch (err) {
      console.error('Error filtering records:', err);
      setFilteredRecords([]);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    try {
      setLoading(true);
      await MaintenanceTrackingService.deleteMaintenanceRecord(recordId);
      
      // FIXED: Only call parent callback, no local success notification
      setShowDeleteModal(false);
      setSelectedRecord(null);
      
      await loadMaintenanceData();
      if (onMaintenanceUpdated) {
        onMaintenanceUpdated();
      }
    } catch (err) {
      console.error('Error deleting maintenance record:', err);
      setError(`Failed to delete maintenance record: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ENHANCEMENT: Load full maintenance record with parts data for viewing
  const handleViewRecord = async (record) => {
    try {
      console.log('👁️ Loading full maintenance record for viewing:', record.id);
      setLoadingViewRecord(true);
      setSelectedRecord(record);
      
      // Load the complete maintenance record with parts data
      const fullRecord = await MaintenanceTrackingService.getMaintenanceById(record.id);
      const linkedReport = await VehicleReportService.getReportByMaintenanceId(record.id);
      
      if (fullRecord) {
        console.log('✅ Full maintenance record loaded for viewing with parts:', fullRecord);
        console.log('🔍 Parts data for viewing:', fullRecord.parts_used);
        
        // Map the parts data for display
        const mappedRecord = {
          ...fullRecord,
          linked_rental_report: linkedReport,
          // Ensure parts_used is properly formatted for display
          parts_used: (fullRecord.parts_used || []).map(part => ({
            item_id: part.item_id,
            quantity: part.quantity || 0,
            notes: part.notes || '',
            item_name: part.inventory_item?.name || part.part_name || 'Unknown Item',
            unit_cost_mad: part.unit_cost_mad || 0,
            unit: part.inventory_item?.unit || 'units'
          })),
          // Map field names for compatibility
          scheduled_date: fullRecord.service_date || fullRecord.scheduled_date,
          notes: fullRecord.description || fullRecord.notes || ''
        };
        
        console.log('🔄 Mapped record for viewing:', mappedRecord);
        setSelectedRecordWithParts(mappedRecord);
        setShowViewModal(true);
      } else {
        // Fallback to basic record if full record fails to load
        console.warn('⚠️ Failed to load complete record, using basic record');
        setSelectedRecordWithParts({
          ...record,
          linked_rental_report: await VehicleReportService.getReportByMaintenanceId(record.id),
        });
        setShowViewModal(true);
      }
    } catch (err) {
      console.error('❌ Error loading full maintenance record for viewing:', err);
      // Fallback to basic record on error
      setSelectedRecordWithParts(record);
      setShowViewModal(true);
    } finally {
      setLoadingViewRecord(false);
    }
  };

  // CRITICAL FIX: Load full maintenance record with parts data for editing
  const handleEditRecord = async (record) => {
    try {
      console.log('🔧 Loading full maintenance record for editing:', record.id);
      setLoadingFullRecord(true);
      setSelectedRecord(record);
      
      // Load the complete maintenance record with parts data
      const fullRecord = await MaintenanceTrackingService.getMaintenanceById(record.id);
      const linkedReport = await VehicleReportService.getReportByMaintenanceId(record.id);
      
      if (fullRecord) {
        console.log('✅ Full maintenance record loaded with parts:', fullRecord);
        console.log('🔍 Parts data:', fullRecord.parts_used);
        
        // Map the parts data to the format expected by AddMaintenanceForm
        const mappedRecord = {
          ...fullRecord,
          linked_rental_report: linkedReport,
          // Ensure parts_used is properly formatted
          parts_used: (fullRecord.parts_used || []).map(part => ({
            item_id: part.item_id?.toString() || '',
            quantity: part.quantity || 0,
            notes: part.notes || '',
            // Include additional data for display
            item_name: part.inventory_item?.name || part.part_name || 'Unknown Item',
            unit_cost_mad: part.unit_cost_mad || 0
          })),
          // Map field names for compatibility
          scheduled_date: fullRecord.service_date || fullRecord.scheduled_date,
          notes: fullRecord.description || fullRecord.notes || ''
        };
        
        console.log('🔄 Mapped record for editing:', mappedRecord);
        setEditingRecordWithParts(mappedRecord);
        setShowEditModal(true);
      } else {
        throw new Error('Failed to load maintenance record details');
      }
    } catch (err) {
      console.error('❌ Error loading full maintenance record:', err);
      setError(`Failed to load maintenance details: ${err.message}`);
    } finally {
      setLoadingFullRecord(false);
    }
  };

  const handleEditSuccess = async () => {
    // FIXED: Only call parent callback, no local success notification
    setShowEditModal(false);
    setSelectedRecord(null);
    setEditingRecordWithParts(null);
    
    await loadMaintenanceData();
    if (onMaintenanceUpdated) {
      onMaintenanceUpdated();
    }
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
    setSelectedRecord(null);
    setEditingRecordWithParts(null);
  };

  const handleInlineStatusChange = async (record, nextStatus) => {
    if (!record?.id || !nextStatus || record.status === nextStatus) return;

    try {
      setUpdatingStatusId(record.id);
      await MaintenanceTrackingService.updateMaintenanceRecord(record.id, {
        status: nextStatus,
        completed_date: nextStatus === 'completed' ? new Date().toISOString() : null,
      });
      await loadMaintenanceData();
      if (onMaintenanceUpdated) {
        onMaintenanceUpdated();
      }
    } catch (err) {
      console.error('❌ Error updating maintenance status inline:', err);
      setError(`Failed to update maintenance status: ${err.message}`);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDuplicateRecord = async (record) => {
    if (!record?.id) return;

    try {
      setLoading(true);
      setOpenMenuId(null);
      const fullRecord = await MaintenanceTrackingService.getMaintenanceById(record.id);
      const duplicateSource = fullRecord || record;

      await MaintenanceTrackingService.createMaintenanceRecord({
        vehicle_id: parseInt(duplicateSource.vehicle_id),
        maintenance_type: duplicateSource.maintenance_type || duplicateSource.type || 'Other',
        status: 'scheduled',
        scheduled_date: new Date().toISOString().split('T')[0],
        completed_date: null,
        odometer_reading: duplicateSource.odometer_reading || null,
        labor_rate_mad: MaintenanceTrackingService.safeCostToNumber(duplicateSource.labor_rate_mad || duplicateSource.labor_cost_mad),
        parts_cost_mad: MaintenanceTrackingService.safeCostToNumber(duplicateSource.parts_cost_mad),
        tax_mad: MaintenanceTrackingService.safeCostToNumber(duplicateSource.tax_mad),
        notes: `Duplicated from ${record.id}${duplicateSource.description || duplicateSource.notes ? `\n${duplicateSource.description || duplicateSource.notes}` : ''}`,
        technician_name: duplicateSource.technician_name || duplicateSource.technician || '',
        parts_used: (duplicateSource.parts_used || []).map((part) => ({
          ...part,
          source_type: part.source_type || (part.item_id ? 'inventory' : 'manual'),
          item_id: part.item_id || null,
          quantity: part.quantity || 1,
        })),
        created_by: 'Admin',
      });

      await loadMaintenanceData();
      onMaintenanceUpdated?.();
    } catch (err) {
      console.error('❌ Error duplicating maintenance record:', err);
      setError(`Failed to duplicate maintenance record: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewClose = () => {
    setShowViewModal(false);
    setSelectedRecord(null);
    setSelectedRecordWithParts(null);
  };

  const getVehicleName = (vehicleId) => {
    // CRITICAL: Always ensure vehicles is an array
    const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    const vehicle = safeVehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.name} (${vehicle.plate_number})` : 'Unknown Vehicle';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'in_progress': return <Wrench className="w-4 h-4 text-blue-600" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getFinancialSummary = (record) => {
    const labor = MaintenanceTrackingService.safeCostToNumber(record?.labor_rate_mad || record?.labor_cost_mad);
    const parts = MaintenanceTrackingService.safeCostToNumber(record?.parts_cost_mad);
    const tax = MaintenanceTrackingService.safeCostToNumber(record?.tax_mad);
    const total = MaintenanceTrackingService.safeCostToNumber(record?.cost || record?.total_cost_mad);

    return { labor, parts, tax, total };
  };

  const toggleExpandedRecord = (recordId) => {
    setExpandedRecordIds((current) => (
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId]
    ));
  };

  const summaryStats = maintenanceRecords.reduce((summary, record) => {
    const financials = getFinancialSummary(record);
    return {
      total: summary.total + 1,
      open: summary.open + (record.status !== 'completed' ? 1 : 0),
      completed: summary.completed + (record.status === 'completed' ? 1 : 0),
      cost: summary.cost + financials.total,
    };
  }, { total: 0, open: 0, completed: 0, cost: 0 });
  const averageMaintenanceCost = summaryStats.total > 0 ? summaryStats.cost / summaryStats.total : 0;

  const getLinkedReportLabel = (report) => {
    if (!report) return null;

    const labels = {
      damage: 'Damage Report',
      accident: 'Accident Report',
      mechanical_issue: 'Mechanical Report',
    };

    return labels[report.report_type] || 'Linked Rental Report';
  };

  const getMaintenanceDescriptionSummary = (record) => {
    if (!record) return '';

    if (record.linked_rental_report) {
      const summaryBits = [];
      const inspectionNote = String(record.linked_rental_report.description || '').trim();
      const affectedAreas = Array.isArray(record.linked_rental_report.affected_areas)
        ? record.linked_rental_report.affected_areas
        : [];
      const rentalReference = record.linked_rental_report.rental_id || record.linked_rental_report.rental_reference;

      if (inspectionNote) {
        summaryBits.push(`Inspection note: ${inspectionNote}`);
      }

      if (affectedAreas.length > 0) {
        summaryBits.push(`Affected areas: ${affectedAreas.map((area) => String(area).replace(/_/g, ' ')).join(', ')}`);
      }

      if (rentalReference) {
        summaryBits.push(`Rental ${formatRentalReference(rentalReference)}`);
      }

      return summaryBits.join(' • ');
    }

    return String(record.description || '')
      .replace(/Vehicle report ID:\s*[^\n|]+/gi, '')
      .replace(/Rental reference:\s*([a-f0-9-]{8,})/gi, (_, rentalId) => `Rental ${formatRentalReference(rentalId)}`)
      .replace(/\n+/g, ' • ')
      .replace(/\s*\|\s*/g, ' • ')
      .replace(/\s{2,}/g, ' ')
      .replace(/ • $/, '')
      .trim();
  };

  const totalPages = Math.max(1, Math.ceil((filteredRecords || []).length / pageSize));
  const paginatedRecords = (filteredRecords || []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading && maintenanceRecords.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-[2rem] border border-slate-200/80 bg-slate-100/80 p-3 shadow-inner sm:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Maintenance Records</h2>
          <p className="text-gray-600">
            Manage and track all maintenance activities ({(filteredRecords || []).length} records)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'cards'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Grid className="w-4 h-4" />
              Box View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <List className="w-4 h-4" />
              {tr('List View', 'Vue liste')}
            </button>
          </div>
          <Button
            onClick={onAddMaintenance}
            className={`flex items-center gap-2 ${primaryActionButtonClass}`}
          >
            <Plus className="w-4 h-4" />
            {tr('Add Maintenance', 'Ajouter une maintenance')}
          </Button>
        </div>
      </div>

      {/* FIXED: Removed local success message display - only show errors */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: tr('Total maintenance', 'Total maintenance'), value: summaryStats.total },
          { label: tr('Open jobs', 'Interventions ouvertes'), value: summaryStats.open },
          { label: tr('Completed jobs', 'Interventions terminees'), value: summaryStats.completed },
          { label: tr('Average cost', 'Cout moyen'), value: MaintenanceTrackingService.formatCurrency(averageMaintenanceCost) },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card className="rounded-[2rem] border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { id: 'all', label: tr('All', 'Tous') },
              { id: 'linked', label: tr('Linked Rental Reports', 'Rapports de location lies') },
              { id: 'regular', label: tr('Regular Maintenance', 'Maintenance reguliere') },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSourceFilter(option.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  sourceFilter === option.id
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: tr('All work', 'Tous travaux') },
                { id: 'needs_attention', label: tr('Needs attention', 'Attention requise') },
                { id: 'incomplete', label: tr('Incomplete', 'Incomplet') },
                { id: 'high_cost', label: tr('High cost', 'Cout eleve') },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSmartFilter(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    smartFilter === option.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
              {[
                { id: 'compact', label: tr('Compact', 'Compact') },
                { id: 'comfortable', label: tr('Comfortable', 'Confort') },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDensityMode(option.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    densityMode === option.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder={tr('Search maintenance...', 'Rechercher une maintenance...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={tr('Filter by status', 'Filtrer par statut')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('All Statuses', 'Tous les statuts')}</SelectItem>
                <SelectItem value="scheduled">{tr('Scheduled', 'Planifie')}</SelectItem>
                <SelectItem value="in_progress">{tr('In Progress', 'En cours')}</SelectItem>
                <SelectItem value="completed">{tr('Completed', 'Termine')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Vehicle Filter */}
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger>
                <SelectValue placeholder={tr('Filter by vehicle', 'Filtrer par vehicule')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr('All Vehicles', 'Tous les vehicules')}</SelectItem>
                {(vehicles || []).map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                    {vehicle.name} ({vehicle.plate_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
              const [field, order] = value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}>
              <SelectTrigger>
                <SelectValue placeholder={tr('Sort by', 'Trier par')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service_date-desc">{tr('Date (Newest)', 'Date (plus recente)')}</SelectItem>
                <SelectItem value="service_date-asc">{tr('Date (Oldest)', 'Date (plus ancienne)')}</SelectItem>
                <SelectItem value="maintenance_type-asc">{tr('Type (A-Z)', 'Type (A-Z)')}</SelectItem>
                <SelectItem value="maintenance_type-desc">{tr('Type (Z-A)', 'Type (Z-A)')}</SelectItem>
                <SelectItem value="status-asc">{tr('Status (A-Z)', 'Statut (A-Z)')}</SelectItem>
                <SelectItem value="cost-desc">{tr('Cost (High-Low)', 'Cout (haut-bas)')}</SelectItem>
                <SelectItem value="cost-asc">{tr('Cost (Low-High)', 'Cout (bas-haut)')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Records List */}
      <Card className="rounded-[2rem] border-slate-200 bg-slate-50/90 shadow-sm">
        <CardContent className="p-0">
          {(filteredRecords || []).length === 0 ? (
            <div className="text-center py-12">
              <Car className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{tr('No maintenance records found', 'Aucun dossier de maintenance trouve')}</h3>
              <p className="text-gray-500 mb-4">
                {(maintenanceRecords || []).length === 0 
                  ? tr('Start by adding your first maintenance record', 'Commencez par ajouter votre premier dossier de maintenance')
                  : tr('Try adjusting your filters to see more records', 'Essayez de modifier vos filtres pour voir plus de dossiers')
                }
              </p>
              <Button onClick={onAddMaintenance} className={`flex items-center gap-2 ${primaryActionButtonClass}`}>
                <Plus className="w-4 h-4" />
                {tr('Add First Maintenance Record', 'Ajouter le premier dossier')}
              </Button>
            </div>
          ) : (
            <>
            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-2">
                {paginatedRecords.map((record) => {
                  const financials = getFinancialSummary(record);
                  const maintenanceVisual = getMaintenanceTypeVisual(record.maintenance_type);
                  const isExpanded = expandedRecordIds.includes(record.id) || densityMode === 'comfortable';
                  return (
                    <div
                      key={record.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpandedRecord(record.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleExpandedRecord(record.id);
                        }
                      }}
                      className={`relative rounded-[1.25rem] border border-slate-300 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition-all hover:border-violet-200 hover:shadow-[0_16px_34px_rgba(76,29,149,0.10)] ${densityMode === 'compact' ? 'p-3' : 'p-4'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{getVehicleName(record.vehicle_id)}</p>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${MaintenanceTrackingService.getStatusColor(record.status)}`}>
                              {getStatusIcon(record.status)}
                              {record.status || tr('unknown', 'inconnu')}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                              <span>{maintenanceVisual.emoji}</span>
                              <span>{maintenanceVisual.label}</span>
                            </span>
                            <p className="text-sm text-gray-700">{record.maintenance_type || tr('N/A', 'N/D')}</p>
                          </div>
                          {record.linked_rental_report && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                                {tr('Linked Rental Report', 'Rapport de location lie')}
                              </span>
                              {record.linked_rental_report.rental_id && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/admin/rentals/${record.linked_rental_report.rental_id}`);
                                  }}
                                  className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 hover:bg-orange-100"
                                >
                                  {tr('Rental', 'Location')} {formatRentalReference(record.linked_rental_report.rental_id)}
                                </button>
                              )}
                            </div>
                          )}
                          {isExpanded && getMaintenanceDescriptionSummary(record) && (
                            <p className="mt-1 text-xs text-gray-500 line-clamp-2">{getMaintenanceDescriptionSummary(record)}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Total', 'Total')}</p>
                            <p className="text-base font-black text-green-700">{MaintenanceTrackingService.formatCurrency(financials.total)}</p>
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenMenuId(openMenuId === record.id ? null : record.id);
                              }}
                              className="rounded-full border border-slate-200 px-2.5 py-1 text-lg leading-none text-slate-500 hover:bg-slate-50"
                              aria-label={tr('Open quick actions', 'Ouvrir actions rapides')}
                            >
                              ⋯
                            </button>
                            {openMenuId === record.id && (
                              <div
                                className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button type="button" onClick={() => handleInlineStatusChange(record, 'completed')} className="w-full rounded-xl px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
                                  {tr('Mark completed', 'Marquer termine')}
                                </button>
                                <button type="button" onClick={() => { setOpenMenuId(null); handleEditRecord(record); }} className="w-full rounded-xl px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
                                  {tr('Add cost', 'Ajouter cout')}
                                </button>
                                {record.linked_rental_report?.rental_id && (
                                  <button type="button" onClick={() => navigate(`/admin/rentals/${record.linked_rental_report.rental_id}`)} className="w-full rounded-xl px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
                                    {tr('Open rental', 'Ouvrir location')}
                                  </button>
                                )}
                                <button type="button" onClick={() => handleDuplicateRecord(record)} className="w-full rounded-xl px-3 py-2 text-left text-slate-700 hover:bg-slate-50">
                                  {tr('Duplicate', 'Dupliquer')}
                                </button>
                                {isOwner && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedRecord(record);
                                      setShowDeleteModal(true);
                                    }}
                                    className="w-full rounded-xl px-3 py-2 text-left text-red-700 hover:bg-red-50"
                                  >
                                    {tr('Delete', 'Supprimer')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                        <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
                          <span>{tr('Labor', 'Main-d oeuvre')} {MaintenanceTrackingService.formatCurrency(financials.labor)}</span>
                          <span>{tr('Parts', 'Pieces')} {MaintenanceTrackingService.formatCurrency(financials.parts)}</span>
                          <span>{tr('Tax', 'Taxe')} {MaintenanceTrackingService.formatCurrency(financials.tax)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          {MaintenanceTrackingService.formatDate(record.service_date)}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {record.linked_rental_report && (
                            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                              <span className="font-semibold">{getLinkedReportLabel(record.linked_rental_report)}</span>
                              <span> • {String(record.linked_rental_report.severity || 'reported').replace(/_/g, ' ')}</span>
                              <span> • {record.linked_rental_report.status === 'maintenance_completed' ? tr('Ready to close rental', 'Pret a cloturer la location') : tr('Repair in progress', 'Reparation en cours')}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { value: 'scheduled', label: tr('Scheduled', 'Planifie'), activeClasses: 'border-amber-300 bg-amber-50 text-amber-800' },
                              { value: 'in_progress', label: tr('In Progress', 'En cours'), activeClasses: 'border-blue-300 bg-blue-50 text-blue-800' },
                              { value: 'completed', label: tr('Completed', 'Termine'), activeClasses: 'border-green-300 bg-green-50 text-green-800' },
                            ].map((option) => {
                              const isActive = record.status === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleInlineStatusChange(record, option.value);
                                  }}
                                  disabled={updatingStatusId === record.id}
                                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                    isActive
                                      ? option.activeClasses
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                  } ${updatingStatusId === record.id ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                          {updatingStatusId === record.id && (
                            <p className="text-[11px] font-medium text-blue-600">{tr('Saving status...', 'Enregistrement du statut...')}</p>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/admin/maintenance/${record.id}`);
                            }}
                            className={`flex items-center gap-1 ${softActionButtonClass}`}
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEditRecord(record);
                            }}
                            disabled={loadingFullRecord}
                            className={`flex items-center gap-1 ${primaryActionButtonClass}`}
                          >
                            <Edit className="w-3 h-3" />
                            {tr('Edit', 'Modifier')}
                          </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="overflow-x-auto rounded-[1.5rem] bg-white">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[30%]" />
                  <col className="w-[16%]" />
                  <col className="w-[12%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-4 px-4 font-medium text-gray-900 align-top">{tr('Vehicle', 'Vehicule')}</th>
                    <th className="text-left py-4 px-4 font-medium text-gray-900 align-top">{tr('Type', 'Type')}</th>
                    <th className="text-left py-4 px-4 font-medium text-gray-900 align-top">{tr('Status', 'Statut')}</th>
                    <th className="text-left py-4 px-4 font-medium text-gray-900 align-top">{tr('Service Date', 'Date de service')}</th>
                    <th className="text-left py-4 px-4 font-medium text-gray-900 align-top">{tr('Cost Summary', 'Resume des couts')}</th>
                    <th className="text-left py-4 px-4 font-medium text-gray-900 align-top">{tr('Actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record) => {
                    const financials = getFinancialSummary(record);
                    const maintenanceVisual = getMaintenanceTypeVisual(record.maintenance_type);
                    return (
                    <tr key={record.id} className="border-b align-top hover:bg-gray-50">
                      <td className="py-5 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <Car className="mt-1 w-4 h-4 flex-shrink-0 text-gray-400" />
                          <span className="font-medium leading-8 text-gray-900">
                            {getVehicleName(record.vehicle_id)}
                          </span>
                        </div>
                      </td>
                      <td className="py-5 px-4 align-top text-gray-600">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-start gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                              <span>{maintenanceVisual.emoji}</span>
                              <span>{maintenanceVisual.label}</span>
                            </span>
                            <p className="pt-0.5 font-medium leading-7 text-gray-900">{record.maintenance_type || tr('N/A', 'N/D')}</p>
                          </div>
                          {record.linked_rental_report && (
                            <div className="flex flex-wrap gap-1.5">
                              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                {tr('Linked Rental Report', 'Rapport de location lie')}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                {tr('Rental', 'Location')} {formatRentalReference(record.linked_rental_report.rental_id)}
                              </span>
                            </div>
                          )}
                          {getMaintenanceDescriptionSummary(record) && (
                            <p className="text-xs leading-5 text-gray-500 line-clamp-2">{getMaintenanceDescriptionSummary(record)}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-5 px-4 align-top">
                        <div className="flex items-start gap-2">
                          <span className="mt-1 flex-shrink-0">{getStatusIcon(record.status)}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            MaintenanceTrackingService.getStatusColor(record.status)
                          }`}>
                            {record.status || tr('unknown', 'inconnu')}
                          </span>
                        </div>
                      </td>
                      <td className="py-5 px-4 align-top text-gray-600">
                        <div className="flex items-start gap-2">
                          <Calendar className="mt-1 w-4 h-4 flex-shrink-0 text-gray-400" />
                          <span className="leading-7">{MaintenanceTrackingService.formatDate(record.service_date)}</span>
                        </div>
                      </td>
                      <td className="py-5 px-4 align-top">
                        <div className="min-w-[220px] space-y-2.5">
                          <p className="text-sm font-semibold text-gray-900">
                            {MaintenanceTrackingService.formatCurrency(financials.total)}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-100">
                              {tr('Labor', 'Main-d oeuvre')} {MaintenanceTrackingService.formatCurrency(financials.labor)}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 border border-indigo-100">
                              {tr('Parts', 'Pieces')} {MaintenanceTrackingService.formatCurrency(financials.parts)}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-100">
                              {tr('Tax', 'Taxe')} {MaintenanceTrackingService.formatCurrency(financials.tax)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-5 px-4 align-top">
                        <div className="flex flex-wrap items-start gap-2">
                          {record.linked_rental_report?.rental_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/admin/rentals/${record.linked_rental_report.rental_id}`)}
                              className={`flex items-center gap-1 ${warningActionButtonClass}`}
                            >
                              {tr('Open Rental', 'Ouvrir la location')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/maintenance/${record.id}`)}
                            className={`flex items-center gap-1 ${softActionButtonClass}`}
                          >
                            <Eye className="w-3 h-3" />
                            {tr('View', 'Voir')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditRecord(record)}
                            disabled={loadingFullRecord}
                            className={`flex items-center gap-1 ${primaryActionButtonClass}`}
                          >
                            {loadingFullRecord && selectedRecord?.id === record.id ? (
                              <>
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                {tr('Loading...', 'Chargement...')}
                              </>
                            ) : (
                              <>
                                <Edit className="w-3 h-3" />
                                {tr('Edit', 'Modifier')}
                              </>
                            )}
                          </Button>
                          {isOwner && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedRecord(record);
                                setShowDeleteModal(true);
                              }}
                              className={`flex items-center gap-1 ${dangerActionButtonClass}`}
                            >
                              <Trash2 className="w-3 h-3" />
                              {tr('Delete', 'Supprimer')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-200 px-4 py-4">
              <p className="text-sm text-gray-500">
                {tr('Showing', 'Affichage')} {paginatedRecords.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}
                {' '}{tr('to', 'a')} {Math.min(currentPage * pageSize, (filteredRecords || []).length)} {tr('of', 'sur')} {(filteredRecords || []).length} {tr('records', 'dossiers')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  {tr('Previous', 'Precedent')}
                </Button>
                <span className="text-sm font-medium text-gray-700">
                  {tr('Page', 'Page')} {currentPage} {tr('of', 'sur')} {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  {tr('Next', 'Suivant')}
                </Button>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ENHANCED View Modal - Now shows parts information */}
      {showViewModal && selectedRecordWithParts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{tr('Maintenance Record Details', 'Details du dossier de maintenance')}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewClose}
                >
                  {tr('Close', 'Fermer')}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(() => {
                    const financials = getFinancialSummary(selectedRecordWithParts);
                    return (
                      <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
                    <p className="text-gray-900">{getVehicleName(selectedRecordWithParts.vehicle_id)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Type</label>
                    {(() => {
                      const maintenanceVisual = getMaintenanceTypeVisual(selectedRecordWithParts.maintenance_type);
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                            <span>{maintenanceVisual.emoji}</span>
                            <span>{maintenanceVisual.label}</span>
                          </span>
                          <p className="text-gray-900">{selectedRecordWithParts.maintenance_type || 'N/A'}</p>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(selectedRecordWithParts.status)}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        MaintenanceTrackingService.getStatusColor(selectedRecordWithParts.status)
                      }`}>
                        {selectedRecordWithParts.status || 'unknown'}
                      </span>
                    </div>
                  </div>
                  {selectedRecordWithParts.linked_rental_report && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Linked Rental Report</label>
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">
                          Rental {formatRentalReference(selectedRecordWithParts.linked_rental_report.rental_id)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {getLinkedReportLabel(selectedRecordWithParts.linked_rental_report)} • {String(selectedRecordWithParts.linked_rental_report.severity || 'reported').replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Date</label>
                    <p className="text-gray-900">{MaintenanceTrackingService.formatDate(selectedRecordWithParts.service_date)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost</label>
                    <p className="text-gray-900 font-medium">{MaintenanceTrackingService.formatCurrency(financials.total)}</p>
                  </div>
                  {selectedRecordWithParts.next_service_date && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Next Service Date</label>
                      <p className="text-gray-900">{MaintenanceTrackingService.formatDate(selectedRecordWithParts.next_service_date)}</p>
                    </div>
                  )}
                      </>
                    );
                  })()}
                </div>

                {(() => {
                  const financials = getFinancialSummary(selectedRecordWithParts);
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Cost Breakdown</label>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                          <p className="text-xs font-medium text-blue-700">Labor</p>
                          <p className="mt-1 text-sm font-semibold text-blue-900">{MaintenanceTrackingService.formatCurrency(financials.labor)}</p>
                        </div>
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                          <p className="text-xs font-medium text-indigo-700">Parts</p>
                          <p className="mt-1 text-sm font-semibold text-indigo-900">{MaintenanceTrackingService.formatCurrency(financials.parts)}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-700">Tax</p>
                          <p className="mt-1 text-sm font-semibold text-amber-900">{MaintenanceTrackingService.formatCurrency(financials.tax)}</p>
                        </div>
                        <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                          <p className="text-xs font-medium text-green-700">Total</p>
                          <p className="mt-1 text-sm font-semibold text-green-900">{MaintenanceTrackingService.formatCurrency(financials.total)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ENHANCEMENT: Parts Used Section */}
                {selectedRecordWithParts?.parts_used && selectedRecordWithParts.parts_used.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Parts Used
                    </label>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      {selectedRecordWithParts.parts_used.map((part, index) => (
                        <div key={index} className="flex justify-between items-center bg-white p-3 rounded border">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{part.item_name || 'Unknown Part'}</span>
                              <span className="text-gray-500 text-sm">x{part.quantity} {part.unit || 'units'}</span>
                            </div>
                            {part.notes && (
                              <p className="text-xs text-gray-600 mt-1">{part.notes}</p>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {MaintenanceTrackingService.formatCurrency(part.unit_cost_mad * part.quantity)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {MaintenanceTrackingService.formatCurrency(part.unit_cost_mad)} each
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <div className="flex justify-between items-center text-sm font-medium">
                          <span className="text-gray-700">Total Parts Cost:</span>
                          <span className="text-gray-900">
                            {MaintenanceTrackingService.formatCurrency(
                              selectedRecordWithParts.parts_used.reduce((total, part) => 
                                total + (part.unit_cost_mad * part.quantity), 0
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* No Parts Message */}
                {(!selectedRecordWithParts?.parts_used || selectedRecordWithParts.parts_used.length === 0) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Parts Used
                    </label>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm">No parts used in this maintenance</p>
                    </div>
                  </div>
                )}

                {selectedRecordWithParts.description && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedRecordWithParts.description}</p>
                  </div>
                )}

                {selectedRecordWithParts.linked_rental_report?.rental_id && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate(`/admin/rentals/${selectedRecordWithParts.linked_rental_report.rental_id}`)}
                      className="border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      Open Linked Rental
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CRITICAL FIX: Edit Modal - Now uses full record with parts data */}
      {showEditModal && editingRecordWithParts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <AddMaintenanceForm
              editingRecord={editingRecordWithParts}
              onCancel={handleEditCancel}
              onSuccess={handleEditSuccess}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedRecord && isOwner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{tr('Delete Maintenance Record', 'Supprimer la fiche de maintenance')}</h3>
              </div>
              
              <p className="text-gray-600 mb-6">
                {tr('Are you sure you want to delete this maintenance record for', 'Êtes-vous sûr de vouloir supprimer cette fiche de maintenance pour')}{' '}
                <strong>{getVehicleName(selectedRecord.vehicle_id)}</strong>? This action cannot be undone.
              </p>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedRecord(null);
                  }}
                  disabled={loading}
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteRecord(selectedRecord.id)}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {tr('Deleting...', 'Suppression...')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {tr('Delete Record', 'Supprimer la fiche')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceListView;
