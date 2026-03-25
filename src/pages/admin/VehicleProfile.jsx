import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Calendar, Car, Check, Clock3, DollarSign, Edit, FileText, Gauge, Shield, StickyNote, Wrench, X, Fuel, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TBL } from '../../config/tables';
import DocumentUpload from '../../components/DocumentUpload';
import VehicleImageUpload from '../../components/VehicleImageUpload';
import VehicleDocuments from '../../components/VehicleDocuments';
import FuelTransactionService from '../../services/FuelTransactionService';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import VehicleDispositionService from '../../services/VehicleDispositionService';
import { formatRentalReference } from '../../utils/rentalReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import { getFleetAlertsForVehicle } from '../../utils/fleetAlerts';
import { normalizeVehicleImageUrl } from '../../utils/vehicleImage';

const formatDate = (value) => {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString();
};

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()} MAD`;
};

const formatStatus = (value) => {
  return String(value || 'unknown').replace(/_/g, ' ');
};

const formatFuelEventLabel = (record) => {
  const type = String(record?.transaction_type || '').toLowerCase();
  if (type === 'rental_opening_level') return 'Rental fuel at departure';
  if (type === 'rental_closing_level') return 'Rental fuel at return';
  if (type === 'vehicle_refill') return 'Direct refill';
  if (type === 'tank_refill') return 'Tank refill';
  if (type === 'withdrawal') return 'Tank transfer';
  if (type === 'manual_adjustment') return 'Manual fuel adjustment';
  return formatStatus(record?.transaction_type || 'fuel event');
};

const formatReportLabel = (report) => {
  const type = String(report?.report_type || '').toLowerCase();
  if (type === 'damage') return 'Damage report';
  if (type === 'accident') return 'Accident report';
  if (type === 'mechanical_issue' || type === 'mechanical') return 'Mechanical report';
  return formatStatus(report?.report_type || 'report');
};

const formatMaintenanceSummary = (record) => {
  if (!record) return '';

  if (record.linked_report) {
    const summaryBits = [];
    const inspectionNote = String(record.linked_report.description || '').trim();
    const affectedAreas = Array.isArray(record.linked_report.affected_areas)
      ? record.linked_report.affected_areas
      : [];
    const rentalReference = record.linked_report.rental_id || record.linked_report.rental_reference;

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

const statusClasses = {
  available: 'bg-green-100 text-green-800',
  rented: 'bg-blue-100 text-blue-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
  tour: 'bg-violet-100 text-violet-800',
  out_of_service: 'bg-red-100 text-red-800',
};

const InfoRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0">
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="text-sm text-gray-900 text-right">{value || 'Not set'}</dd>
  </div>
);

const EditableRow = ({ label, editing, viewValue, children }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0">
    <dt className="text-sm font-medium text-gray-500 pt-2">{label}</dt>
    <dd className="text-sm text-gray-900 text-right flex-1">
      {editing ? children : (viewValue || 'Not set')}
    </dd>
  </div>
);

const SectionCard = ({ title, description, icon: Icon, children, action }) => (
  <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
    <div className="px-6 py-5">{children}</div>
  </section>
);

const HistoryEmptyState = ({ title, description }) => (
  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center">
    <p className="text-sm font-medium text-gray-700">{title}</p>
    <p className="mt-1 text-sm text-gray-500">{description}</p>
  </div>
);

const VehicleProfile = () => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);
  const [fuelHistory, setFuelHistory] = useState([]);
  const [vehicleFuelState, setVehicleFuelState] = useState(null);
  const [vehicleReports, setVehicleReports] = useState([]);
  const [vehicleImageUrl, setVehicleImageUrl] = useState('');
  const [vehicleDocuments, setVehicleDocuments] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'quad',
    power_cc: '',
    capacity: '',
    color: '',
    plate_number: '',
    status: 'available',
    current_odometer: '',
    engine_hours: '',
    purchase_cost_mad: '',
    purchase_date: '',
    purchase_supplier: '',
    purchase_invoice_url: '',
    registration_number: '',
    registration_expiry_date: '',
    insurance_policy_number: '',
    insurance_provider: '',
    insurance_expiry_date: '',
    general_notes: '',
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dispositionRecord, setDispositionRecord] = useState(null);
  const [dispositionEditing, setDispositionEditing] = useState(false);
  const [dispositionSaving, setDispositionSaving] = useState(false);
  const [dispositionForm, setDispositionForm] = useState({
    event_type: 'sold',
    event_date: '',
    sale_price_mad: '',
    buyer_name: '',
    notes: '',
  });

  const syncFormData = (vehicleData) => {
    setVehicleImageUrl(normalizeVehicleImageUrl(vehicleData?.image_url || ''));
    setFormData({
      name: vehicleData?.name || '',
      model: vehicleData?.model || '',
      vehicle_type: vehicleData?.vehicle_type || 'quad',
      power_cc: vehicleData?.power_cc?.toString?.() || '',
      capacity: vehicleData?.capacity?.toString?.() || '',
      color: vehicleData?.color || '',
      plate_number: vehicleData?.plate_number || '',
      status: vehicleData?.status || 'available',
      current_odometer: vehicleData?.current_odometer?.toString?.() || '',
      engine_hours: vehicleData?.engine_hours?.toString?.() || '',
      purchase_cost_mad: vehicleData?.purchase_cost_mad?.toString?.() || '',
      purchase_date: vehicleData?.purchase_date || '',
      purchase_supplier: vehicleData?.purchase_supplier || '',
      purchase_invoice_url: vehicleData?.purchase_invoice_url || '',
      registration_number: vehicleData?.registration_number || '',
      registration_expiry_date: vehicleData?.registration_expiry_date || '',
      insurance_policy_number: vehicleData?.insurance_policy_number || '',
      insurance_provider: vehicleData?.insurance_provider || '',
      insurance_expiry_date: vehicleData?.insurance_expiry_date || '',
      general_notes: vehicleData?.general_notes || '',
      notes: vehicleData?.notes || '',
    });
  };

  const syncDispositionForm = (record) => {
    setDispositionRecord(record || null);
    setDispositionForm({
      event_type: record?.event_type || 'sold',
      event_date: record?.event_date || new Date().toISOString().split('T')[0],
      sale_price_mad: record?.sale_price_mad?.toString?.() || '',
      buyer_name: record?.buyer_name || '',
      notes: record?.notes || '',
    });
  };

  useEffect(() => {
    const loadVehicleProfile = async () => {
      if (!vehicleId) return;

      setLoading(true);
      setError(null);

      try {
        const { data: vehicleData, error: vehicleError } = await supabase
          .from(TBL.VEHICLES)
          .select('*')
          .eq('id', vehicleId)
          .single();

        if (vehicleError) {
          throw vehicleError;
        }

        syncDispositionForm(VehicleDispositionService.getVehicleDisposition(vehicleId));

        const [allMaintenanceRecords, fuelResult, reportRows, rentalRows] = await Promise.all([
          MaintenanceTrackingService.getAllMaintenanceRecords(),
          FuelTransactionService.getAllTransactions({ limit: 1000, offset: 0 }),
          VehicleReportService.getReportsForVehicle(vehicleId),
          supabase
            .from('app_4c3a7a6153_rentals')
            .select('id, rental_id, customer_name, vehicle_id, rental_start_date, rental_end_date, started_at, updated_at, completed_at, start_fuel_level, end_fuel_level, rental_status')
            .eq('vehicle_id', vehicleId)
            .order('created_at', { ascending: false }),
        ]);

        const parsedVehicleId = parseInt(vehicleId, 10);
        const maintenanceRecords = (allMaintenanceRecords || []).filter(
          (record) => String(record?.vehicle_id) === String(parsedVehicleId)
        );
        const rentalData = Array.isArray(rentalRows?.data) ? rentalRows.data : [];
        const maintenanceIds = maintenanceRecords.map((record) => record.id).filter(Boolean);
        const reportsFromMaintenanceMap = await VehicleReportService.getReportsByMaintenanceIds(maintenanceIds);
        const maintenanceLinkedReports = (
          await Promise.all(
            maintenanceIds.map((maintenanceId) => VehicleReportService.getReportByMaintenanceId(maintenanceId))
          )
        ).filter(Boolean);
        const reportsByRentalId = await VehicleReportService.getLatestReportsForRentals(
          rentalData.map((rentalRecord) => rentalRecord?.id).filter(Boolean)
        );
        const existingFuelTransactions = (fuelResult?.transactions || []).filter(
          (transaction) => String(transaction.vehicle_id) === String(vehicleId)
        );
        const existingFuelKeys = new Set(
          existingFuelTransactions
            .filter((transaction) => transaction.rental_id && transaction.transaction_type)
            .map((transaction) => `${transaction.rental_id}-${transaction.transaction_type}`)
        );

        const rentalFuelSnapshots = rentalData.flatMap((rentalRecord) => {
          const snapshots = [];

          if (rentalRecord.start_fuel_level !== null && rentalRecord.start_fuel_level !== undefined) {
            const key = `${rentalRecord.id}-rental_opening_level`;
            if (!existingFuelKeys.has(key)) {
              snapshots.push({
                id: `rental-open-${rentalRecord.id}`,
                transaction_type: 'rental_opening_level',
                source: 'rental_opening_level',
                vehicle_id: rentalRecord.vehicle_id,
                rental_id: rentalRecord.id,
                rental_reference: rentalRecord.rental_id,
                customer_name: rentalRecord.customer_name,
                transaction_date: rentalRecord.started_at || rentalRecord.rental_start_date,
                fuel_lines_after: rentalRecord.start_fuel_level,
                liters_after: FuelTransactionService.linesToLiters(rentalRecord.start_fuel_level),
                notes: 'Captured at rental departure',
                performed_by_name: 'Rental workflow',
              });
            }
          }

          if (rentalRecord.end_fuel_level !== null && rentalRecord.end_fuel_level !== undefined) {
            const key = `${rentalRecord.id}-rental_closing_level`;
            if (!existingFuelKeys.has(key)) {
              snapshots.push({
                id: `rental-close-${rentalRecord.id}`,
                transaction_type: 'rental_closing_level',
                source: 'rental_closing_level',
                vehicle_id: rentalRecord.vehicle_id,
                rental_id: rentalRecord.id,
                rental_reference: rentalRecord.rental_id,
                customer_name: rentalRecord.customer_name,
                transaction_date: rentalRecord.completed_at || rentalRecord.updated_at || rentalRecord.rental_end_date,
                fuel_lines_after: rentalRecord.end_fuel_level,
                liters_after: FuelTransactionService.linesToLiters(rentalRecord.end_fuel_level),
                notes: 'Captured at rental return',
                performed_by_name: 'Rental workflow',
              });
            }
          }

          return snapshots;
        });

        const vehicleFuelHistory = [...existingFuelTransactions, ...rentalFuelSnapshots]
          .sort((a, b) => new Date(b.transaction_date || b.created_at || 0) - new Date(a.transaction_date || a.created_at || 0));

        const mergedRawReports = [
          ...(Array.isArray(reportRows) ? reportRows : []),
          ...Object.values(reportsFromMaintenanceMap || {}),
          ...maintenanceLinkedReports,
          ...Object.values(reportsByRentalId || {}),
        ].filter(Boolean);

        const uniqueRawReports = mergedRawReports.filter((report, index, list) => {
          const reportKey = String(report.id || report.maintenance_id || index);
          return list.findIndex((candidate) => String(candidate.id || candidate.maintenance_id || -1) === reportKey) === index;
        });

        const hydratedReports = await Promise.all(
          uniqueRawReports.map(async (report) => {
            const hydrated = await VehicleReportService.hydrateReportWithMaintenance(report);
            const rentalContext = rentalData.find((rentalRecord) => String(rentalRecord.id) === String(hydrated.rental_id));
            return {
              ...hydrated,
              rental_reference: rentalContext?.rental_id || hydrated.rental_id,
              customer_name: rentalContext?.customer_name || hydrated.customer_name,
            };
          })
        );

        const reportsByMaintenanceId = new Map(
          hydratedReports
            .filter((report) => report?.maintenance_id)
            .map((report) => [String(report.maintenance_id), report])
        );

        const normalizedMaintenanceHistory = maintenanceRecords
          .map((record) => ({
            ...record,
            linked_report: reportsByMaintenanceId.get(String(record.id)) || null,
          }))
          .sort((a, b) => new Date(b.updated_at || b.service_date || b.created_at || 0) - new Date(a.updated_at || a.service_date || a.created_at || 0));

        setVehicle(vehicleData);
        syncFormData(vehicleData);
        setVehicleDocuments(vehicleData?.documents || []);
        setMaintenanceHistory(normalizedMaintenanceHistory);
        setFuelHistory(vehicleFuelHistory);
        setVehicleFuelState(await FuelTransactionService.getVehicleFuelState(vehicleId));
        setVehicleReports(hydratedReports.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
      } catch (loadError) {
        console.error('Failed to load vehicle profile:', loadError);
        setError(loadError.message || 'Failed to load vehicle profile');
      } finally {
        setLoading(false);
      }
    };

    loadVehicleProfile();
  }, [vehicleId]);

  const handleChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCancelEdit = () => {
    syncFormData(vehicle);
    setIsEditing(false);
  };

  const handleDispositionChange = (field, value) => {
    setDispositionForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveDisposition = async () => {
    if (!vehicleId) return;
    setDispositionSaving(true);
    try {
      const savedRecord = VehicleDispositionService.upsertDisposition(vehicleId, {
        event_type: dispositionForm.event_type,
        event_date: dispositionForm.event_date || new Date().toISOString().split('T')[0],
        sale_price_mad: dispositionForm.sale_price_mad,
        buyer_name: dispositionForm.buyer_name,
        notes: dispositionForm.notes,
      });
      syncDispositionForm(savedRecord);
      setDispositionEditing(false);
    } finally {
      setDispositionSaving(false);
    }
  };

  const handleDeleteDisposition = () => {
    if (!vehicleId) return;
    VehicleDispositionService.deleteDisposition(vehicleId);
    syncDispositionForm(null);
    setDispositionEditing(false);
  };

  const handleDocumentsChange = (nextDocuments) => {
    const currentSignature = JSON.stringify(
      (Array.isArray(vehicleDocuments) ? vehicleDocuments : []).map((document) => ({
        id: document?.id,
        storagePath: document?.storagePath,
        url: document?.url,
        name: document?.name,
      }))
    );
    const nextSignature = JSON.stringify(
      (Array.isArray(nextDocuments) ? nextDocuments : []).map((document) => ({
        id: document?.id,
        storagePath: document?.storagePath,
        url: document?.url,
        name: document?.name,
      }))
    );

    if (currentSignature === nextSignature) {
      return;
    }

    setVehicleDocuments(nextDocuments);
    setVehicle((current) => current ? ({
      ...current,
      document_count: Array.isArray(nextDocuments) ? nextDocuments.length : 0,
      documents: nextDocuments,
    }) : current);
  };

  const handleDeleteDocument = async (documentId) => {
    setVehicleDocuments((current) => {
      const nextDocuments = current.filter((document) => document.id !== documentId);
      setVehicle((currentVehicle) => currentVehicle ? ({
        ...currentVehicle,
        document_count: nextDocuments.length,
        documents: nextDocuments,
      }) : currentVehicle);
      return nextDocuments;
    });
  };

  const handleSave = async () => {
    if (!vehicle?.id) return;

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        model: formData.model.trim(),
        vehicle_type: formData.vehicle_type,
        power_cc: formData.power_cc === '' ? 0 : parseInt(formData.power_cc, 10) || 0,
        capacity: formData.capacity === '' ? 1 : parseInt(formData.capacity, 10) || 1,
        color: formData.color.trim(),
        plate_number: formData.plate_number.trim(),
        status: formData.status,
        current_odometer: formData.current_odometer === '' ? null : parseFloat(formData.current_odometer) || null,
        engine_hours: formData.engine_hours === '' ? null : parseFloat(formData.engine_hours) || null,
        purchase_cost_mad: formData.purchase_cost_mad === '' ? null : parseFloat(formData.purchase_cost_mad) || null,
        purchase_date: formData.purchase_date || null,
        purchase_supplier: formData.purchase_supplier.trim() || null,
        purchase_invoice_url: formData.purchase_invoice_url.trim() || null,
        image_url: vehicleImageUrl || null,
        registration_number: formData.registration_number.trim(),
        registration_expiry_date: formData.registration_expiry_date || null,
        insurance_policy_number: formData.insurance_policy_number.trim(),
        insurance_provider: formData.insurance_provider.trim(),
        insurance_expiry_date: formData.insurance_expiry_date || null,
        general_notes: formData.general_notes.trim(),
        notes: formData.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      const { data, error: updateError } = await supabase
        .from(TBL.VEHICLES)
        .update(payload)
        .eq('id', vehicle.id)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      setVehicle(data);
      syncFormData(data);
      setIsEditing(false);
    } catch (saveError) {
      console.error('Failed to save vehicle profile:', saveError);
      alert(`Failed to save vehicle profile: ${saveError.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const vehicleReportOverview = useMemo(() => {
    const overviewMap = new Map();

    (vehicleReports || []).forEach((report) => {
      if (!report) return;
      const key = String(report.id || report.maintenance_id || Math.random());
      overviewMap.set(key, report);
    });

    (maintenanceHistory || []).forEach((record) => {
      const linkedReport = record?.linked_report;
      if (!linkedReport) return;

      const key = String(linkedReport.id || linkedReport.maintenance_id || record.id);
      if (overviewMap.has(key)) {
        const existing = overviewMap.get(key);
        overviewMap.set(key, {
          ...existing,
          maintenance: existing?.maintenance || record,
          maintenance_id: existing?.maintenance_id || record.id,
          rental_reference: existing?.rental_reference || linkedReport?.rental_reference,
          rental_id: existing?.rental_id || linkedReport?.rental_id,
          customer_name: existing?.customer_name || linkedReport?.customer_name,
        });
        return;
      }

      overviewMap.set(key, {
        ...linkedReport,
        maintenance: record,
        maintenance_id: linkedReport?.maintenance_id || record.id,
        maintenance_cost_total: Number(linkedReport?.maintenance_cost_total || record?.cost || 0),
        customer_charge_amount: Number(linkedReport?.customer_charge_amount || linkedReport?.maintenance_cost_total || record?.cost || 0),
        created_at: linkedReport?.created_at || record?.updated_at || record?.service_date || record?.created_at,
      });
    });

    return Array.from(overviewMap.values()).sort(
      (a, b) => new Date(b?.created_at || b?.updated_at || 0) - new Date(a?.created_at || a?.updated_at || 0)
    );
  }, [maintenanceHistory, vehicleReports]);

  const operationalVehicleStatus = useMemo(() => {
    if (vehicle?.status === 'out_of_service') {
      return 'out_of_service';
    }

    const hasOpenMaintenance = (maintenanceHistory || []).some((record) =>
      ['scheduled', 'in_progress'].includes(String(record?.status || '').toLowerCase())
    );

    if (hasOpenMaintenance) {
      return 'maintenance';
    }

    return vehicle?.status || 'available';
  }, [maintenanceHistory, vehicle?.status]);

  const fleetAlerts = useMemo(() => getFleetAlertsForVehicle(vehicle), [vehicle]);

  const activityLog = useMemo(() => {
    if (!vehicle) return [];

    const entries = [
      {
        id: `vehicle-created-${vehicle.id}`,
        type: 'vehicle',
        title: 'Vehicle added to fleet',
        timestamp: vehicle.created_at,
        detail: vehicle.purchase_supplier ? `Supplier: ${vehicle.purchase_supplier}` : 'Vehicle record created',
      },
      {
        id: `vehicle-updated-${vehicle.id}`,
        type: 'vehicle',
        title: 'Vehicle profile updated',
        timestamp: vehicle.updated_at,
        detail: `Current status: ${formatStatus(operationalVehicleStatus)}`,
      },
      ...maintenanceHistory.map((record) => ({
        id: `maintenance-${record.id}`,
        type: 'maintenance',
        title: `${formatStatus(record.maintenance_type)} maintenance`,
        timestamp: record.updated_at || record.service_date || record.created_at,
        detail: `${formatStatus(record.status)} • ${formatMoney(record.cost || 0)}${record.linked_report?.rental_reference ? ` • ${formatRentalReference(record.linked_report.rental_reference)}` : ''}`,
      })),
      ...fuelHistory.map((record) => ({
        id: `fuel-${record.id}`,
        type: 'fuel',
        title: formatFuelEventLabel(record),
        timestamp: record.transaction_date || record.created_at,
        detail: [
          record.fuel_lines_after !== null && record.fuel_lines_after !== undefined
            ? `${record.fuel_lines_after}/8 lines`
            : `${record.amount || record.liters_after || 0}L`,
          record.rental_reference ? formatRentalReference(record.rental_reference) : null,
          record.customer_name || null,
          record.cost ? formatMoney(record.cost || 0) : null,
        ].filter(Boolean).join(' • '),
      })),
      ...vehicleReports.map((report) => ({
        id: `report-${report.id}`,
        type: 'report',
        title: `${formatReportLabel(report)} created`,
        timestamp: report.created_at,
        detail: [
          formatStatus(report.severity),
          report.rental_reference ? formatRentalReference(report.rental_reference) : null,
          report.maintenance ? `${formatStatus(report.maintenance.status)} maintenance` : (report.send_to_maintenance ? 'maintenance pending' : 'no maintenance link'),
        ].filter(Boolean).join(' • '),
      })),
    ];

    return entries
      .filter((entry) => entry.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [vehicle, maintenanceHistory, fuelHistory, vehicleReports, operationalVehicleStatus]);

  const liveDocumentCount = useMemo(() => {
    if (Array.isArray(vehicleDocuments) && vehicleDocuments.length > 0) {
      return vehicleDocuments.length;
    }

    if (Array.isArray(vehicle?.documents) && vehicle.documents.length > 0) {
      return vehicle.documents.length;
    }

    return Number(vehicle?.document_count || 0);
  }, [vehicle?.document_count, vehicle?.documents, vehicleDocuments]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse h-10 bg-gray-200 rounded w-80" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="animate-pulse h-64 bg-gray-200 rounded-2xl" />
            <div className="animate-pulse h-72 bg-gray-200 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <div className="animate-pulse h-56 bg-gray-200 rounded-2xl" />
            <div className="animate-pulse h-56 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 text-red-700">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <h1 className="text-lg font-semibold">Unable to load vehicle profile</h1>
              <p className="mt-1 text-sm">{error || 'Vehicle not found'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/fleet')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Fleet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/fleet')}
            className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            title="Back to fleet"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-sm font-medium text-blue-600">Fleet Management</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{vehicle.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Full vehicle profile with legal, operational, and history details.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-white hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit Vehicle
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard
            title="Overview"
            description="A quick operational snapshot for this vehicle."
            icon={Car}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
              <div className="aspect-square rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                {vehicleImageUrl ? (
                  <img src={vehicleImageUrl} alt={vehicle.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <Car className="w-16 h-16" />
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-400">Plate Number</p>
                    <div className="mt-2 inline-flex items-center rounded-3xl border border-blue-300 bg-gradient-to-r from-blue-50 to-sky-100 px-5 py-3 text-2xl font-black tracking-[0.3em] text-blue-950 shadow-sm ring-1 ring-blue-100">
                      {vehicle.plate_number || 'NOT SET'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[operationalVehicleStatus] || 'bg-gray-100 text-gray-800'}`}>
                      {formatStatus(operationalVehicleStatus)}
                    </span>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-700">
                      {vehicle.vehicle_type || 'Vehicle'}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-lg font-bold text-gray-900">{vehicle.name || 'Vehicle'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                      {vehicle.model || 'Model not set'}
                    </span>
                    <span className="text-sm font-medium text-gray-500">
                      {vehicle.vehicle_type || 'Vehicle'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Model</p>
                    <p className="mt-2 text-base font-semibold text-gray-900">{vehicle.model || 'Not set'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current Odometer</p>
                    <p className="mt-2 text-base font-semibold text-gray-900">{vehicle.current_odometer ? `${vehicle.current_odometer} km` : 'Not set'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Engine Hours</p>
                    <p className="mt-2 text-base font-semibold text-gray-900">{vehicle.engine_hours ? `${vehicle.engine_hours} h` : 'Not set'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Document Count</p>
                    <p className="mt-2 text-base font-semibold text-gray-900">{liveDocumentCount}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fleet Alerts</p>
                  {fleetAlerts.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">No active oil change or document expiry alerts.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {fleetAlerts.map((alert) => (
                          <span key={alert.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${alert.classes}`}>
                            <span>{alert.emoji}</span>
                            <span>{alert.label}</span>
                          </span>
                        ))}
                      </div>
                      <div className="space-y-1">
                        {fleetAlerts.map((alert) => (
                          <p key={`${alert.id}-detail`} className="text-xs text-gray-600">
                            {alert.detail}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Basic Information" description="Core vehicle details used in rentals and fleet operations." icon={FileText}>
            <dl>
              <EditableRow label="Vehicle Name" editing={isEditing} viewValue={vehicle.name}>
                <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Model" editing={isEditing} viewValue={vehicle.model}>
                <input value={formData.model} onChange={(e) => handleChange('model', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Vehicle Type" editing={isEditing} viewValue={vehicle.vehicle_type}>
                <select value={formData.vehicle_type} onChange={(e) => handleChange('vehicle_type', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="quad">quad</option>
                  <option value="ATV">ATV</option>
                  <option value="motorcycle">motorcycle</option>
                </select>
              </EditableRow>
              <EditableRow label="Power" editing={isEditing} viewValue={vehicle.power_cc ? `${vehicle.power_cc} cc` : 'Not set'}>
                <input type="number" value={formData.power_cc} onChange={(e) => handleChange('power_cc', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Capacity" editing={isEditing} viewValue={vehicle.capacity || 'Not set'}>
                <input type="number" value={formData.capacity} onChange={(e) => handleChange('capacity', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Color" editing={isEditing} viewValue={vehicle.color}>
                <input value={formData.color} onChange={(e) => handleChange('color', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Plate Number" editing={isEditing} viewValue={vehicle.plate_number}>
                <input value={formData.plate_number} onChange={(e) => handleChange('plate_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Status" editing={isEditing} viewValue={formatStatus(operationalVehicleStatus)}>
                <select value={formData.status} onChange={(e) => handleChange('status', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="available">available</option>
                  <option value="rented">rented</option>
                  <option value="tour">tour</option>
                  <option value="maintenance">maintenance</option>
                  <option value="out_of_service">out of service</option>
                </select>
              </EditableRow>
              <EditableRow label="Current Odometer" editing={isEditing} viewValue={vehicle.current_odometer ? `${vehicle.current_odometer} km` : 'Not set'}>
                <input type="number" value={formData.current_odometer} onChange={(e) => handleChange('current_odometer', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Engine Hours" editing={isEditing} viewValue={vehicle.engine_hours ? `${vehicle.engine_hours} h` : 'Not set'}>
                <input type="number" value={formData.engine_hours} onChange={(e) => handleChange('engine_hours', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
            </dl>
          </SectionCard>

          <SectionCard title="Acquisition" description="Purchase and sourcing information for this vehicle." icon={DollarSign}>
            <dl>
              <EditableRow label="Purchase Cost" editing={isEditing} viewValue={vehicle.purchase_cost_mad ? formatMoney(vehicle.purchase_cost_mad) : 'Not set'}>
                <input type="number" value={formData.purchase_cost_mad} onChange={(e) => handleChange('purchase_cost_mad', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Purchase Date" editing={isEditing} viewValue={formatDate(vehicle.purchase_date)}>
                <input type="date" value={formData.purchase_date} onChange={(e) => handleChange('purchase_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Supplier" editing={isEditing} viewValue={vehicle.purchase_supplier}>
                <input value={formData.purchase_supplier} onChange={(e) => handleChange('purchase_supplier', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow
                label="Purchase Invoice"
                editing={isEditing}
                viewValue={vehicle.purchase_invoice_url ? <a href={vehicle.purchase_invoice_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 underline">Open invoice</a> : 'Not uploaded'}
              >
                <input value={formData.purchase_invoice_url} onChange={(e) => handleChange('purchase_invoice_url', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="https://..." />
              </EditableRow>
            </dl>
          </SectionCard>

          <SectionCard title="Legal & Administrative" description="Registration and insurance information." icon={Shield}>
            <dl>
              <EditableRow label="Registration Number" editing={isEditing} viewValue={vehicle.registration_number}>
                <input value={formData.registration_number} onChange={(e) => handleChange('registration_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Registration Expiry" editing={isEditing} viewValue={formatDate(vehicle.registration_expiry_date)}>
                <input type="date" value={formData.registration_expiry_date} onChange={(e) => handleChange('registration_expiry_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Insurance Policy" editing={isEditing} viewValue={vehicle.insurance_policy_number}>
                <input value={formData.insurance_policy_number} onChange={(e) => handleChange('insurance_policy_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Insurance Provider" editing={isEditing} viewValue={vehicle.insurance_provider}>
                <input value={formData.insurance_provider} onChange={(e) => handleChange('insurance_provider', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label="Insurance Expiry" editing={isEditing} viewValue={formatDate(vehicle.insurance_expiry_date)}>
                <input type="date" value={formData.insurance_expiry_date} onChange={(e) => handleChange('insurance_expiry_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
            </dl>
          </SectionCard>

          <SectionCard title="Documents & Media" description="Vehicle image, legal files, and uploaded documents." icon={FileText}>
            {isEditing ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Vehicle Image</h3>
                  <p className="mt-1 text-sm text-gray-500">Upload or replace the main vehicle photo directly from this profile.</p>
                  <VehicleImageUpload
                    vehicleId={vehicle.id?.toString()}
                    currentImageUrl={vehicleImageUrl}
                    onImageChange={setVehicleImageUrl}
                    disabled={saving}
                    className="mt-4"
                  />
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Legal & Administrative Documents</h3>
                  <p className="mt-1 text-sm text-gray-500">Click or drag files here to upload registration, insurance, and other vehicle documents.</p>
                  <DocumentUpload
                    vehicleId={vehicle.id?.toString()}
                    documents={vehicleDocuments}
                    onDocumentsChange={handleDocumentsChange}
                    disabled={saving}
                    className="mt-4"
                  />
                </div>
              </div>
            ) : null}
            <VehicleDocuments
              vehicleId={vehicle.id}
              documents={vehicleDocuments}
              loadFromStorage={true}
              onDocumentsChange={handleDocumentsChange}
              canDelete={isEditing}
              onDeleteDocument={handleDeleteDocument}
            />
          </SectionCard>

          <SectionCard title="Notes" description="Operational notes and internal system notes for the team." icon={StickyNote}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Additional Notes</p>
                {isEditing ? (
                  <textarea
                    value={formData.general_notes}
                    onChange={(e) => handleChange('general_notes', e.target.value)}
                    rows={8}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{vehicle.general_notes || 'No additional notes yet.'}</p>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">System Notes</p>
                {isEditing ? (
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    rows={8}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{vehicle.notes || 'No system notes yet.'}</p>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Maintenance History" description="Recent work logged against this vehicle." icon={Wrench}>
            {maintenanceHistory.length === 0 ? (
              <HistoryEmptyState title="No maintenance records yet" description="Maintenance history will appear here as records are added." />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                {maintenanceHistory.slice(0, 6).map((record) => (
                  <div key={record.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {(() => {
                          const maintenanceVisual = getMaintenanceTypeVisual(record.maintenance_type);
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${maintenanceVisual.classes}`}>
                                <span>{maintenanceVisual.emoji}</span>
                                <span>{maintenanceVisual.label}</span>
                              </span>
                              <p className="text-sm font-semibold text-gray-900">{formatStatus(record.maintenance_type)}</p>
                            </div>
                          );
                        })()}
                        <p className="mt-1 text-xs text-gray-500">{formatDate(record.service_date)}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[record.status] || 'bg-gray-100 text-gray-800'}`}>
                        {formatStatus(record.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">{formatMaintenanceSummary(record) || 'No description provided.'}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
                      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <p className="text-[11px] text-gray-400">Technician</p>
                        <p className="mt-1 font-medium text-gray-700">{record.technician_name || 'Technician not set'}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <p className="text-[11px] text-gray-400">Total Price</p>
                        <p className="mt-1 font-medium text-gray-900">{formatMoney(record.cost || 0)}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                        <p className="text-[11px] text-blue-600">Labor</p>
                        <p className="mt-1 font-semibold text-blue-900">{formatMoney(record.labor_rate_mad || record.labor_cost_mad || 0)}</p>
                      </div>
                      <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2">
                        <p className="text-[11px] text-indigo-600">Parts</p>
                        <p className="mt-1 font-semibold text-indigo-900">{formatMoney(record.parts_cost_mad || 0)}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                        <p className="text-[11px] text-amber-600">Tax</p>
                        <p className="mt-1 font-semibold text-amber-900">{formatMoney(record.tax_mad || 0)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/maintenance?maintenanceId=${record.id}`)}
                        className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Open in Quad Maintenance
                      </button>
                      {record.linked_report?.rental_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/rentals/${record.linked_report.rental_id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Linked Rental
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Fuel Status"
            description="Current fuel level for this vehicle with a direct link back to the fuel module."
            icon={Gauge}
            action={(
              <button
                type="button"
                onClick={() => navigate('/admin/fuel', {
                  state: {
                    activeTab: 'transactions',
                    fuelFilters: { vehicleId: String(vehicle.id) },
                  },
                })}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Fuel className="w-4 h-4" />
                Open Fuel Logs
              </button>
            )}
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 p-4 bg-gradient-to-br from-emerald-50 to-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Current Vehicle Fuel</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {vehicleFuelState?.current_fuel_lines ?? 0}/8
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {Number(vehicleFuelState?.current_fuel_liters || 0).toFixed(1)} L in tank
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {formatStatus(vehicleFuelState?.last_source || 'unknown')}
                  </span>
                </div>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, ((vehicleFuelState?.current_fuel_lines || 0) / 8) * 100)}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                    <p className="text-gray-400">Last source</p>
                    <p className="mt-1 font-medium text-gray-700">{formatStatus(vehicleFuelState?.last_source || 'unknown')}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                    <p className="text-gray-400">Recent fuel events</p>
                    <p className="mt-1 font-medium text-gray-700">{fuelHistory.length}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Rental departure/return fuel levels and direct fuel transactions are tracked in the fuel logs for this vehicle.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Activity Log" description="A combined timeline of profile, maintenance, and fuel activity." icon={Clock3}>
            {activityLog.length === 0 ? (
              <HistoryEmptyState title="No activity yet" description="As the vehicle is used, its operational timeline will appear here." />
            ) : (
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                {activityLog.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDate(entry.timestamp)}</p>
                      <p className="text-sm text-gray-600 mt-2">{entry.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Vehicle Report" description="Inspection reports captured from rental return workflow." icon={FileText}>
            {vehicleReportOverview.length === 0 ? (
              <HistoryEmptyState title="No vehicle reports yet" description="Damage, accident, and issue reports will appear here when staff log them during rental inspection." />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                {vehicleReportOverview.slice(0, 6).map((report) => (
                  <div key={report.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{formatReportLabel(report)}</p>
                        <p className="mt-1 text-xs text-gray-500">{formatDate(report.created_at)}</p>
                      </div>
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800">
                        {formatStatus(report.severity)}
                      </span>
                    </div>
                    {report.rental_reference && (
                      <div className="mt-3 inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-medium text-orange-800">
                        Linked rental • {formatRentalReference(report.rental_reference)}
                        {report.customer_name ? ` • ${report.customer_name}` : ''}
                      </div>
                    )}
                    <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">{report.description || 'No description provided.'}</p>
                    {Array.isArray(report.affected_areas) && report.affected_areas.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.affected_areas.map((area) => (
                          <span key={area} className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 border border-red-100">
                            {formatStatus(area)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-500">
                      <div className="flex items-center justify-between">
                        <span>Linked media</span>
                        <span>{report.photos?.length || 0} item(s)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Maintenance</span>
                        <span>{report.maintenance ? `${formatStatus(report.maintenance.status)} • ${formatMoney(report.maintenance.cost || 0)}` : (report.maintenance_id ? 'Created' : (report.send_to_maintenance ? 'Pending link' : 'Not requested'))}</span>
                      </div>
                      {report.customer_chargeable && (
                        <div className="flex items-center justify-between">
                          <span>Customer charge</span>
                          <span>{formatMoney(report.customer_charge_amount || report.maintenance_cost_total || 0)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.maintenance?.id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/maintenance?maintenanceId=${report.maintenance.id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Open Linked Maintenance
                        </button>
                      )}
                      {report.rental_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/rentals/${report.rental_id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Linked Rental
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Sold History"
            description="Track sale or disposal events so finance can include resale and write-off lifecycle data."
            icon={Calendar}
            action={(
              <div className="flex items-center gap-2">
                {dispositionRecord && !dispositionEditing && (
                  <button
                    type="button"
                    onClick={() => setDispositionEditing(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
                {!dispositionEditing && !dispositionRecord && (
                  <button
                    type="button"
                    onClick={() => {
                      syncDispositionForm(null);
                      setDispositionEditing(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Add Sale / Disposal
                  </button>
                )}
              </div>
            )}
          >
            {dispositionEditing ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">Event Type</span>
                    <select
                      value={dispositionForm.event_type}
                      onChange={(e) => handleDispositionChange('event_type', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    >
                      <option value="sold">Sold</option>
                      <option value="disposed">Disposed</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">Event Date</span>
                    <input
                      type="date"
                      value={dispositionForm.event_date}
                      onChange={(e) => handleDispositionChange('event_date', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{dispositionForm.event_type === 'sold' ? 'Sale Price' : 'Disposal Value'} (MAD)</span>
                    <input
                      type="number"
                      value={dispositionForm.sale_price_mad}
                      onChange={(e) => handleDispositionChange('sale_price_mad', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{dispositionForm.event_type === 'sold' ? 'Buyer' : 'Handled By / Destination'}</span>
                    <input
                      type="text"
                      value={dispositionForm.buyer_name}
                      onChange={(e) => handleDispositionChange('buyer_name', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block space-y-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Notes</span>
                  <textarea
                    rows={3}
                    value={dispositionForm.notes}
                    onChange={(e) => handleDispositionChange('notes', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDisposition}
                    disabled={dispositionSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    {dispositionSaving ? 'Saving...' : 'Save Record'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      syncDispositionForm(dispositionRecord);
                      setDispositionEditing(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  {dispositionRecord && (
                    <button
                      type="button"
                      onClick={handleDeleteDisposition}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Delete Record
                    </button>
                  )}
                </div>
              </div>
            ) : dispositionRecord ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {formatStatus(dispositionRecord.event_type)}
                  </span>
                  <span className="text-sm text-slate-600">{formatDate(dispositionRecord.event_date)}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Value</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(dispositionRecord.sale_price_mad || 0)}</p>
                  </div>
                  {dispositionRecord.buyer_name && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{dispositionRecord.event_type === 'sold' ? 'Buyer' : 'Handled By'}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{dispositionRecord.buyer_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Finance Impact</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {dispositionRecord.event_type === 'sold' ? 'Counts as resale revenue' : 'Counts as disposal/write-off tracking'}
                    </p>
                  </div>
                </div>
                {dispositionRecord.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                    <p className="mt-1 text-sm text-slate-700">{dispositionRecord.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <HistoryEmptyState title="No sale or disposal recorded yet" description="Add a sale or disposal event here so vehicle lifecycle finance stays complete." />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default VehicleProfile;
