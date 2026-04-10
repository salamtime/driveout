import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Calendar, Car, Check, Clock3, DollarSign, Edit, FileText, Gauge, Shield, StickyNote, Wrench, X, Fuel, ExternalLink, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TBL } from '../../config/tables';
import DocumentUpload from '../../components/DocumentUpload';
import VehicleImageUpload from '../../components/VehicleImageUpload';
import VehicleDocuments from '../../components/VehicleDocuments';
import FuelTransactionService from '../../services/FuelTransactionService';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import VehicleDispositionService from '../../services/VehicleDispositionService';
import VehicleAnnualTaxService from '../../services/VehicleAnnualTaxService';
import { financeApiV2 } from '../../services/financeApiV2';
import { formatRentalReference } from '../../utils/rentalReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import { getFleetAlertsForVehicle } from '../../utils/fleetAlerts';
import { normalizeVehicleImageUrl } from '../../utils/vehicleImage';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import { useAuth } from '../../contexts/AuthContext';
import { canAdjustVehicleFuelLevel } from '../../utils/permissionHelpers';
import i18n from '../../i18n';

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 800 });
  }

  return window.setTimeout(callback, 0);
};
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);
const FLEET_LOCATIONS_TABLE = 'saharax_0u4w4d_locations';

const formatDate = (value) => {
  if (!value) return tr('Not set', 'Non défini');
  return new Date(value).toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US');
};

const formatDateTime = (value) => {
  if (!value) return tr('Not set', 'Non défini');
  return new Date(value).toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US');
};

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()} MAD`;
};

const attachLocationName = async (vehicleData) => {
  if (!vehicleData?.location_id) {
    return {
      ...vehicleData,
      location_name: null,
    };
  }

  const { data: locationData } = await supabase
    .from(FLEET_LOCATIONS_TABLE)
    .select('name')
    .eq('id', vehicleData.location_id)
    .maybeSingle();

  return {
    ...vehicleData,
    location_name: locationData?.name || null,
  };
};

const formatStatus = (value) => {
  const normalized = String(value || 'unknown').replace(/_/g, ' ');
  const map = {
    unknown: tr('unknown', 'inconnu'),
    available: tr('available', 'disponible'),
    rented: tr('rented', 'loué'),
    impounded: tr('impounded', 'mis en fourrière'),
    maintenance: tr('maintenance', 'maintenance'),
    tour: tr('tour', 'tour'),
    out_of_service: tr('out of service', 'hors service'),
    scheduled: tr('scheduled', 'planifié'),
    sold: tr('sold', 'vendu'),
    disposed: tr('disposed', 'mis au rebut'),
  };
  return map[normalized] || normalized;
};

const formatFuelEventLabel = (record) => {
  const type = String(record?.transaction_type || '').toLowerCase();
  if (type === 'rental_opening_level') return tr('Rental fuel at departure', 'Carburant location au départ');
  if (type === 'rental_closing_level') return tr('Rental fuel at return', 'Carburant location au retour');
  if (type === 'vehicle_refill') return tr('Direct refill', 'Remplissage direct');
  if (type === 'tank_refill') return tr('Tank refill', 'Remplissage cuve');
  if (type === 'withdrawal') return tr('Tank transfer', 'Transfert cuve');
  if (type === 'manual_adjustment') return tr('Manual fuel adjustment', 'Ajustement manuel carburant');
  return formatStatus(record?.transaction_type || tr('fuel event', 'événement carburant'));
};

const formatReportLabel = (report) => {
  const type = String(report?.report_type || '').toLowerCase();
  if (type === 'damage') return tr('Damage report', 'Rapport de dommage');
  if (type === 'accident') return tr('Accident report', 'Rapport d’accident');
  if (type === 'mechanical_issue' || type === 'mechanical') return tr('Mechanical report', 'Rapport mécanique');
  return formatStatus(report?.report_type || tr('report', 'rapport'));
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
      summaryBits.push(tr(`Inspection note: ${inspectionNote}`, `Note d'inspection : ${inspectionNote}`));
    }

    if (affectedAreas.length > 0) {
      summaryBits.push(tr(
        `Affected areas: ${affectedAreas.map((area) => String(area).replace(/_/g, ' ')).join(', ')}`,
        `Zones concernées : ${affectedAreas.map((area) => String(area).replace(/_/g, ' ')).join(', ')}`
      ));
    }

    if (rentalReference) {
      summaryBits.push(tr(`Rental ${formatRentalReference(rentalReference)}`, `Location ${formatRentalReference(rentalReference)}`));
    }

    return summaryBits.join(' • ');
  }

  return String(record.description || '')
    .replace(/Vehicle report ID:\s*[^\n|]+/gi, '')
    .replace(/Rental reference:\s*([a-f0-9-]{8,})/gi, (_, rentalId) => `Location ${formatRentalReference(rentalId)}`)
    .replace(/\n+/g, ' • ')
    .replace(/\s*\|\s*/g, ' • ')
    .replace(/\s{2,}/g, ' ')
    .replace(/ • $/, '')
    .trim();
};

const statusClasses = {
  available: 'bg-green-100 text-green-800',
  rented: 'bg-blue-100 text-blue-800',
  impounded: 'bg-amber-100 text-amber-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
  tour: 'bg-violet-100 text-violet-800',
  out_of_service: 'bg-red-100 text-red-800',
};

const InfoRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className="text-right text-sm text-slate-900">{value || tr('Not set', 'Non défini')}</dd>
  </div>
);

const EditableRow = ({ label, editing, viewValue, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
    <dt className="pt-2 text-sm font-medium text-slate-500">{label}</dt>
    <dd className="flex-1 text-right text-sm text-slate-900">
      {editing ? children : (viewValue || tr('Not set', 'Non défini'))}
    </dd>
  </div>
);

const SectionCard = ({ title, description, icon: Icon, children, action }) => (
  <section className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
    <div className="flex items-start justify-between gap-4 border-b border-violet-100 px-6 py-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-100 p-2 text-violet-700">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
    <div className="px-6 py-5">{children}</div>
  </section>
);

const HistoryEmptyState = ({ title, description }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
    <p className="text-sm font-medium text-slate-700">{title}</p>
    <p className="mt-1 text-sm text-slate-500">{description}</p>
  </div>
);

const buildVehicleFuelHistory = (fuelTransactions, rentalData, vehicleId) => {
  const existingFuelTransactions = (fuelTransactions || []).filter(
    (transaction) => String(transaction.vehicle_id) === String(vehicleId)
  );
  const existingFuelKeys = new Set(
    existingFuelTransactions
      .filter((transaction) => transaction.rental_id && transaction.transaction_type)
      .map((transaction) => `${transaction.rental_id}-${transaction.transaction_type}`)
  );

  const rentalFuelSnapshots = (rentalData || []).flatMap((rentalRecord) => {
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

  return [...existingFuelTransactions, ...rentalFuelSnapshots].sort(
    (a, b) => new Date(b.transaction_date || b.created_at || 0) - new Date(a.transaction_date || a.created_at || 0)
  );
};

const VehicleProfile = () => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);
  const [fuelHistory, setFuelHistory] = useState([]);
  const [vehicleFuelState, setVehicleFuelState] = useState(null);
  const [vehicleReports, setVehicleReports] = useState([]);
  const [rentalHistory, setRentalHistory] = useState([]);
  const [vehicleFuelSummary, setVehicleFuelSummary] = useState(null);
  const [vehicleImageUrl, setVehicleImageUrl] = useState('');
  const [vehicleDocuments, setVehicleDocuments] = useState([]);
  const [annualTaxRecords, setAnnualTaxRecords] = useState([]);
  const [vehicleFinanceOverview, setVehicleFinanceOverview] = useState(null);
  const [vehicleFinanceLoading, setVehicleFinanceLoading] = useState(false);
  const [vehicleFinanceDrawerOpen, setVehicleFinanceDrawerOpen] = useState(false);
  const [fleetLocations, setFleetLocations] = useState([]);
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
    location_id: '',
    purchase_cost_mad: '',
    purchase_date: '',
    purchase_supplier: '',
    purchase_invoice_url: '',
    registration_number: '',
    registration_date: '',
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
  const [activeProfileTab, setActiveProfileTab] = useState('overview');
  const [dispositionForm, setDispositionForm] = useState({
    event_type: 'sold',
    event_date: '',
    sale_price_mad: '',
    buyer_name: '',
    proof_url: '',
    proof_name: '',
    notes: '',
  });
  const [taxEditing, setTaxEditing] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxForm, setTaxForm] = useState({
    id: '',
    tax_year: new Date().getFullYear().toString(),
    amount_mad: '',
    payment_date: new Date().toISOString().split('T')[0],
    valid_from: '',
    valid_until: '',
    proof_url: '',
    proof_name: '',
    notes: '',
  });
  const [fuelAdjustOpen, setFuelAdjustOpen] = useState(false);
  const [fuelAdjustSaving, setFuelAdjustSaving] = useState(false);
  const [fuelAdjustForm, setFuelAdjustForm] = useState({
    fuel_lines: 0,
    reason: 'Manual correction',
    notes: '',
  });
  const canEditVehicleFuel = canAdjustVehicleFuelLevel(userProfile);

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
      location_id: vehicleData?.location_id?.toString?.() || '',
      purchase_cost_mad: vehicleData?.purchase_cost_mad?.toString?.() || '',
      purchase_date: vehicleData?.purchase_date || '',
      purchase_supplier: vehicleData?.purchase_supplier || '',
      purchase_invoice_url: vehicleData?.purchase_invoice_url || '',
      registration_number: vehicleData?.registration_number || '',
      registration_date: vehicleData?.registration_date || '',
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
      proof_url: record?.proof_url || '',
      proof_name: record?.proof_name || '',
      notes: record?.notes || '',
    });
  };

  const resetTaxForm = (record = null) => {
    setTaxForm({
      id: record?.id || '',
      tax_year: record?.tax_year?.toString?.() || new Date().getFullYear().toString(),
      amount_mad: record?.amount_mad?.toString?.() || '',
      payment_date: record?.payment_date || new Date().toISOString().split('T')[0],
      valid_from: record?.valid_from || '',
      valid_until: record?.valid_until || '',
      proof_url: record?.proof_url || '',
      proof_name: record?.proof_name || '',
      notes: record?.notes || '',
    });
  };

  useEffect(() => {
    const loadVehicleProfile = async () => {
      if (!vehicleId) return;

      setLoading(true);
      setError(null);

      try {
        const { data: locationRows } = await supabase
          .from(FLEET_LOCATIONS_TABLE)
          .select('id, name, is_active, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true });

        setFleetLocations(Array.isArray(locationRows) ? locationRows : []);

        const { data: vehicleData, error: vehicleError } = await supabase
          .from(TBL.VEHICLES)
          .select('*')
          .eq('id', vehicleId)
          .single();

        if (vehicleError) {
          throw vehicleError;
        }

        const enrichedVehicleData = await attachLocationName(vehicleData);

        setVehicle(enrichedVehicleData);
        syncFormData(enrichedVehicleData);
        setVehicleDocuments(enrichedVehicleData?.documents || []);
        syncDispositionForm(VehicleDispositionService.getVehicleDisposition(vehicleId));
        setAnnualTaxRecords(await VehicleAnnualTaxService.listForVehicle(vehicleId));
        setVehicleFinanceLoading(true);
        setLoading(false);

        scheduleBackgroundTask(async () => {
          try {
            const { data: earlyRentalRows } = await supabase
              .from('app_4c3a7a6153_rentals')
              .select('id, rental_id, customer_name, vehicle_id, rental_start_date, rental_end_date, started_at, updated_at, completed_at, start_fuel_level, end_fuel_level, rental_status, is_impounded, impounded_at, released_from_impound_at, total_amount')
              .eq('vehicle_id', vehicleId)
              .order('created_at', { ascending: false });

            const earlyRentalData = Array.isArray(earlyRentalRows) ? earlyRentalRows : Array.isArray(earlyRentalRows?.data) ? earlyRentalRows.data : [];
            if (earlyRentalData.length > 0) {
              setRentalHistory(earlyRentalData);
            } else {
              setRentalHistory([]);
            }

            const hasEarlyActiveImpoundRental = earlyRentalData.some((record) =>
              (
                Boolean(record?.is_impounded) ||
                String(record?.rental_status || '').toLowerCase() === 'impounded'
              ) &&
              !record?.released_from_impound_at
            );

            if (hasEarlyActiveImpoundRental) {
              setVehicle((current) => (current ? { ...current, status: 'impounded' } : current));
            }

            const [
              maintenanceResult,
              fuelResult,
              fuelSummaryResult,
              reportRowsResult,
              rentalRowsResult,
              vehicleFuelStateResult,
              financeOverviewResult,
            ] = await Promise.allSettled([
              supabase
                .from(MaintenanceTrackingService.MAINTENANCE_RECORDS_TABLE)
                .select('id, vehicle_id, status, maintenance_type, service_date, description, labor_rate_mad, parts_cost_mad, tax_mad, cost, created_at, updated_at')
                .eq('vehicle_id', vehicleId)
                .order('updated_at', { ascending: false }),
              FuelTransactionService.getAllTransactions({ limit: 200, offset: 0, vehicleId }),
              FuelTransactionService.getVehicleFuelUsageSummary(vehicleId, { persist: true }),
              VehicleReportService.getReportsForVehicle(vehicleId),
              supabase
                .from('app_4c3a7a6153_rentals')
                .select('id, rental_id, customer_name, vehicle_id, rental_start_date, rental_end_date, started_at, updated_at, completed_at, start_fuel_level, end_fuel_level, rental_status, is_impounded, impounded_at, released_from_impound_at, total_amount')
                .eq('vehicle_id', vehicleId)
                .order('created_at', { ascending: false }),
              FuelTransactionService.getVehicleFuelState(vehicleId),
              financeApiV2.getVehicleFinanceData([vehicleId], {}),
            ]);

            const maintenanceRecords = Array.isArray(maintenanceResult.value?.data)
              ? maintenanceResult.value.data
              : Array.isArray(maintenanceResult.value)
                ? maintenanceResult.value
                : [];
            const rentalData = Array.isArray(rentalRowsResult.value?.data) ? rentalRowsResult.value.data : earlyRentalData;
            const hasActiveImpoundRental = rentalData.some((record) =>
              (
                Boolean(record?.is_impounded) ||
                String(record?.rental_status || '').toLowerCase() === 'impounded'
              ) &&
              !record?.released_from_impound_at
            );

            setRentalHistory(rentalData);
            if (hasActiveImpoundRental) {
              setVehicle((current) => (current ? { ...current, status: 'impounded' } : current));
            }

            const maintenanceIds = maintenanceRecords.map((record) => record.id).filter(Boolean);
            const reportsFromMaintenanceMap = await VehicleReportService.getReportsByMaintenanceIds(maintenanceIds);
            const reportsByRentalId = await VehicleReportService.getLatestReportsForRentals(
              rentalData.map((rentalRecord) => rentalRecord?.id).filter(Boolean)
            );
            const vehicleFuelHistory = buildVehicleFuelHistory(
              fuelResult.value?.transactions || [],
              rentalData,
              vehicleId
            );

            const mergedRawReports = [
              ...(Array.isArray(reportRowsResult.value) ? reportRowsResult.value : []),
              ...Object.values(reportsFromMaintenanceMap || {}),
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

            setMaintenanceHistory(normalizedMaintenanceHistory);
            setFuelHistory(vehicleFuelHistory);
            setVehicleFuelState(vehicleFuelStateResult.status === 'fulfilled' ? vehicleFuelStateResult.value : null);
            setVehicleFuelSummary(fuelSummaryResult.status === 'fulfilled' ? fuelSummaryResult.value?.summary || null : null);
            setVehicleReports(hydratedReports.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
            setVehicleFinanceOverview(financeOverviewResult.status === 'fulfilled' ? financeOverviewResult.value : null);
          } catch (backgroundError) {
            console.error('Failed to hydrate vehicle profile history panels:', backgroundError);
          } finally {
            setVehicleFinanceLoading(false);
          }
        });
      } catch (loadError) {
        console.error('Failed to load vehicle profile:', loadError);
        setError(loadError.message || 'Failed to load vehicle profile');
      } finally {
        setLoading(false);
      }
    };

    loadVehicleProfile();
  }, [vehicleId]);

  useEffect(() => {
    setFuelAdjustForm((current) => ({
      ...current,
      fuel_lines: Number(vehicleFuelState?.current_fuel_lines ?? 0),
    }));
  }, [vehicleFuelState?.current_fuel_lines]);

  const refreshFuelPanel = async () => {
    if (!vehicleId) return;

    const [fuelResult, fuelSummaryResult, rentalRows] = await Promise.all([
      FuelTransactionService.getAllTransactions({ limit: 200, offset: 0, vehicleId }),
      FuelTransactionService.getVehicleFuelUsageSummary(vehicleId, { persist: true }),
      supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, rental_id, customer_name, vehicle_id, rental_start_date, rental_end_date, started_at, updated_at, completed_at, start_fuel_level, end_fuel_level, rental_status')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false }),
    ]);

    const rentalData = Array.isArray(rentalRows?.data) ? rentalRows.data : [];
    setFuelHistory(buildVehicleFuelHistory(fuelResult?.transactions || [], rentalData, vehicleId));
    setVehicleFuelState(await FuelTransactionService.getVehicleFuelState(vehicleId));
    setVehicleFuelSummary(fuelSummaryResult?.summary || null);
  };

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

  const handleTaxChange = (field, value) => {
    setTaxForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const refreshTaxRecords = async () => {
    if (!vehicleId) return;
    setAnnualTaxRecords(await VehicleAnnualTaxService.listForVehicle(vehicleId));
  };

  const handleSaveTaxRecord = async () => {
    if (!vehicleId) return;
    setTaxSaving(true);
    try {
      const linkedTaxDocument = getAnnualTaxDocumentForRecord(taxForm);
      await VehicleAnnualTaxService.upsert(vehicleId, {
        id: taxForm.id || undefined,
        tax_year: taxForm.tax_year,
        amount_mad: taxForm.amount_mad,
        payment_date: taxForm.payment_date || null,
        valid_from: taxForm.valid_from || null,
        valid_until: taxForm.valid_until || null,
        proof_url: taxForm.proof_url || linkedTaxDocument?.url || null,
        proof_name: taxForm.proof_name || linkedTaxDocument?.name || null,
        notes: taxForm.notes,
      });
      await refreshTaxRecords();
      resetTaxForm();
      setTaxEditing(false);
    } catch (taxError) {
      console.error('Failed to save annual tax record:', taxError);
      window.alert(`Failed to save annual vehicle tax: ${taxError.message || 'Unknown error'}`);
    } finally {
      setTaxSaving(false);
    }
  };

  const handleDeleteTaxRecord = async (recordId) => {
    if (!recordId || !window.confirm(tr('Delete this annual tax payment record?', 'Supprimer ce paiement annuel ?'))) return;
    await VehicleAnnualTaxService.remove(recordId);
    await refreshTaxRecords();
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
        proof_url: dispositionForm.proof_url,
        proof_name: dispositionForm.proof_name,
        notes: dispositionForm.notes,
      });
      if (savedRecord.event_type === 'sold' && vehicle?.id) {
        const saleSnapshotPayload = {
          status: 'sold',
          sold_date: savedRecord.event_date || null,
          sale_price_mad: savedRecord.sale_price_mad || 0,
          sold_buyer_name: savedRecord.buyer_name || null,
          sale_proof_url: savedRecord.proof_url || null,
          sale_proof_name: savedRecord.proof_name || null,
          sale_notes: savedRecord.notes || null,
          updated_at: new Date().toISOString(),
        };
        const { error: saleSnapshotError } = await supabase
          .from(TBL.VEHICLES)
          .update(saleSnapshotPayload)
          .eq('id', vehicle.id);

        if (saleSnapshotError?.message?.includes('sold_date') || saleSnapshotError?.message?.includes('sale_') || saleSnapshotError?.message?.includes('sold_buyer')) {
          await supabase
            .from(TBL.VEHICLES)
            .update({ status: 'sold', updated_at: new Date().toISOString() })
            .eq('id', vehicle.id);
        }

        setVehicle((current) => current ? { ...current, ...saleSnapshotPayload } : current);
        setFormData((current) => ({ ...current, status: 'sold' }));
      }
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
        location_id: formData.location_id === '' ? null : parseInt(formData.location_id, 10) || null,
        purchase_cost_mad: formData.purchase_cost_mad === '' ? null : parseFloat(formData.purchase_cost_mad) || null,
        purchase_date: formData.purchase_date || null,
        purchase_supplier: formData.purchase_supplier.trim() || null,
        purchase_invoice_url: formData.purchase_invoice_url.trim() || null,
        image_url: vehicleImageUrl || null,
        registration_number: formData.registration_number.trim(),
        registration_date: formData.registration_date || null,
        registration_expiry_date: formData.registration_expiry_date || null,
        insurance_policy_number: formData.insurance_policy_number.trim(),
        insurance_provider: formData.insurance_provider.trim(),
        insurance_expiry_date: formData.insurance_expiry_date || null,
        general_notes: formData.general_notes.trim(),
        notes: formData.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      let { data, error: updateError } = await supabase
        .from(TBL.VEHICLES)
        .update(payload)
        .eq('id', vehicle.id)
        .select('*')
        .single();

      if (updateError?.message?.includes('registration_date')) {
        const { registration_date, ...fallbackPayload } = payload;
        window.alert(tr(
          'Registration Date needs the vehicle lifecycle SQL migration before it can be saved. I will save the other vehicle fields now.',
          "La date d'immatriculation nécessite la migration SQL du cycle de vie véhicule avant d'être enregistrée. Les autres champs du véhicule seront sauvegardés."
        ));
        const fallbackResult = await supabase
          .from(TBL.VEHICLES)
          .update(fallbackPayload)
          .eq('id', vehicle.id)
          .select('*')
          .single();
        data = fallbackResult.data;
        updateError = fallbackResult.error;
      }

      if (updateError) {
        throw updateError;
      }

      const enrichedVehicleData = await attachLocationName(data);

      setVehicle(enrichedVehicleData);
      syncFormData(enrichedVehicleData);
      setIsEditing(false);
    } catch (saveError) {
      console.error('Failed to save vehicle profile:', saveError);
      alert(`Failed to save vehicle profile: ${saveError.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFuelAdjustChange = (field, value) => {
    setFuelAdjustForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleOpenFuelAdjust = () => {
    setFuelAdjustForm({
      fuel_lines: Number(vehicleFuelState?.current_fuel_lines ?? 0),
      reason: 'Manual correction',
      notes: '',
    });
    setFuelAdjustOpen(true);
  };

  const handleSaveFuelAdjust = async () => {
    if (!vehicleId) return;

    const nextLines = Number(fuelAdjustForm.fuel_lines);
    if (!Number.isFinite(nextLines) || nextLines < 0 || nextLines > 8) {
      window.alert('Fuel level must be between 0 and 8 lines.');
      return;
    }

    setFuelAdjustSaving(true);
    try {
      const result = await FuelTransactionService.adjustVehicleFuelLevel({
        vehicleId,
        fuelLines: nextLines,
        actor: userProfile,
        reason: fuelAdjustForm.reason,
        notes: fuelAdjustForm.notes,
        tankCapacityLiters: vehicleFuelState?.tank_capacity_liters || null,
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to adjust fuel level');
      }

      await refreshFuelPanel();
      setFuelAdjustOpen(false);
    } catch (fuelAdjustError) {
      console.error('Failed to adjust vehicle fuel level:', fuelAdjustError);
      window.alert(`Failed to adjust fuel level: ${fuelAdjustError.message || 'Unknown error'}`);
    } finally {
      setFuelAdjustSaving(false);
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
    const hasActiveImpound = (rentalHistory || []).some((record) =>
      (
        Boolean(record?.is_impounded) ||
        String(record?.rental_status || '').toLowerCase() === 'impounded'
      ) &&
      !record?.released_from_impound_at
    );

    if (hasActiveImpound) {
      return 'impounded';
    }

    if (vehicle?.status === 'impounded') {
      return 'impounded';
    }

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
  }, [maintenanceHistory, rentalHistory, vehicle?.status]);

  const fleetAlerts = useMemo(() => getFleetAlertsForVehicle(vehicle), [vehicle]);

  const activityLog = useMemo(() => {
    if (!vehicle) return [];

    const entries = [
      {
        id: `vehicle-created-${vehicle.id}`,
        type: 'vehicle',
        title: tr('Vehicle added to fleet', 'Véhicule ajouté à la flotte'),
        timestamp: vehicle.created_at,
        detail: vehicle.purchase_supplier ? tr(`Supplier: ${vehicle.purchase_supplier}`, `Fournisseur : ${vehicle.purchase_supplier}`) : tr('Vehicle record created', 'Fiche véhicule créée'),
      },
      ...maintenanceHistory.map((record) => ({
        id: `maintenance-${record.id}`,
        type: 'maintenance',
        title: tr(`${formatStatus(record.maintenance_type)} maintenance`, `Maintenance ${formatStatus(record.maintenance_type)}`),
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
            ? tr(`${record.fuel_lines_after}/8 lines`, `${record.fuel_lines_after}/8 lignes`)
            : `${record.amount || record.liters_after || 0}L`,
          record.rental_reference ? formatRentalReference(record.rental_reference) : null,
          record.customer_name || null,
          record.cost ? formatMoney(record.cost || 0) : null,
          record.notes || null,
        ].filter(Boolean).join(' • '),
      })),
      ...vehicleReports.map((report) => ({
        id: `report-${report.id}`,
        type: 'report',
        title: tr(`${formatReportLabel(report)} created`, `${formatReportLabel(report)} créé`),
        timestamp: report.created_at,
        detail: [
          formatStatus(report.severity),
          report.rental_reference ? formatRentalReference(report.rental_reference) : null,
          report.maintenance ? tr(`${formatStatus(report.maintenance.status)} maintenance`, `Maintenance ${formatStatus(report.maintenance.status)}`) : (report.send_to_maintenance ? tr('maintenance pending', 'maintenance en attente') : tr('no maintenance link', 'aucun lien maintenance')),
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

  const purchaseInvoiceDocument = useMemo(() => {
    const documents = Array.isArray(vehicleDocuments) ? vehicleDocuments : [];
    return documents.find((document) => {
      const haystack = [
        document?.categoryKey,
        document?.category,
        document?.name,
        document?.storagePath,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes('purchase-invoice') || haystack.includes('purchase invoice') || haystack.includes("facture d'achat");
    }) || null;
  }, [vehicleDocuments]);

  const annualTaxDocuments = useMemo(() => {
    const documents = Array.isArray(vehicleDocuments) ? vehicleDocuments : [];
    return documents.filter((document) => {
      const haystack = [
        document?.categoryKey,
        document?.category,
        document?.name,
        document?.storagePath,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes('annual-tax')
        || haystack.includes('annual vehicle tax')
        || haystack.includes('vehicle tax')
        || haystack.includes('vignette');
    });
  }, [vehicleDocuments]);

  const getAnnualTaxDocumentForRecord = (record) => {
    const taxYear = String(record?.tax_year || '').trim();
    if (!annualTaxDocuments.length) return null;

    if (taxYear) {
      const matchingYearDocument = annualTaxDocuments.find((document) => {
        const haystack = [
          document?.name,
          document?.storagePath,
          document?.uploadedAt,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(taxYear);
      });

      if (matchingYearDocument) return matchingYearDocument;
    }

    return annualTaxDocuments[0] || null;
  };

  const insuranceExpiryDate = vehicle?.insurance_expiry_date ? new Date(vehicle.insurance_expiry_date) : null;
  const hasValidInsuranceExpiry = insuranceExpiryDate && !Number.isNaN(insuranceExpiryDate.getTime());
  const insuranceExpired = hasValidInsuranceExpiry && insuranceExpiryDate < new Date();
  const latestTaxRecord = annualTaxRecords[0] || null;
  const vehicleFinanceCostRows = useMemo(() => {
    if (!vehicleFinanceOverview) return [];

    const acquisition = Number(vehicleFinanceOverview.lifetimeAcquisitionCosts || 0);
    const otherWithoutAcquisition = Math.max(0, Number(vehicleFinanceOverview.lifetimeOtherCosts || 0) - acquisition);

    return [
      { key: 'acquisition', label: tr('Acquisition', 'Acquisition'), value: acquisition },
      { key: 'maintenance', label: tr('Maintenance', 'Maintenance'), value: Number(vehicleFinanceOverview.lifetimeMaintenanceCosts || 0) },
      { key: 'fuel', label: tr('Fuel', 'Carburant'), value: Number(vehicleFinanceOverview.lifetimeFuelCosts || 0) },
      { key: 'parts', label: tr('Parts / inventory', 'Pièces / stock'), value: Number(vehicleFinanceOverview.lifetimeInventoryCosts || 0) },
      { key: 'other', label: tr('Other', 'Autres'), value: otherWithoutAcquisition },
    ].filter((row) => row.value > 0);
  }, [vehicleFinanceOverview]);
  const profileTabs = [
    { key: 'overview', label: tr('Overview', "Vue d'ensemble"), icon: Car },
    { key: 'documents', label: tr('Documents', 'Documents'), icon: FileText },
    { key: 'legal', label: tr('Legal', 'Juridique'), icon: Shield },
    { key: 'finance', label: tr('Finance', 'Finance'), icon: DollarSign },
  ];

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
              <h1 className="text-lg font-semibold">{tr('Unable to load vehicle profile', 'Impossible de charger le profil véhicule')}</h1>
              <p className="mt-1 text-sm">{error || tr('Vehicle not found', 'Véhicule introuvable')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/fleet')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {tr('Back to Fleet', 'Retour à la flotte')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Car className="h-8 w-8 text-white" />}
        eyebrow={tr('Fleet Management', 'Gestion de flotte')}
        title={vehicle.name}
        description={vehicle.plate_number ? `${vehicle.plate_number} • ${vehicle.model || tr('Vehicle Profile', 'Profil véhicule')}` : tr('Vehicle profile', 'Profil véhicule')}
      />

      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="sticky top-0 z-30 rounded-xl border border-violet-100 bg-white/95 p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => navigate('/admin/fleet')}
              className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              title={tr('Back to fleet', 'Retour à la flotte')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-sm font-medium text-violet-700">{tr('Vehicle Profile', 'Profil véhicule')}</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">{vehicle.plate_number || vehicle.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-blue-900">
                  {vehicle.name || tr('Vehicle', 'Véhicule')}
                </span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[operationalVehicleStatus] || 'bg-slate-100 text-slate-800'}`}>
                  {formatStatus(operationalVehicleStatus)}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {vehicle.model || tr('Model not set', 'Modèle non défini')}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
                  <FileText className="h-3.5 w-3.5 text-violet-500" />
                  {liveDocumentCount} {tr('docs', 'docs')}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                  insuranceExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  <Shield className="h-3.5 w-3.5" />
                  {insuranceExpired ? tr('Insurance expired', 'Assurance expirée') : tr('Insurance OK', 'Assurance OK')}
                  {hasValidInsuranceExpiry ? ` • ${formatDate(vehicle.insurance_expiry_date)}` : ''}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold ${
                  fleetAlerts.length > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {fleetAlerts.length} {tr('alerts', 'alertes')}
                </span>
                {latestTaxRecord ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                    <DollarSign className="h-3.5 w-3.5" />
                    {tr('Tax', 'Taxe')} {latestTaxRecord.tax_year}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
                {tr('Cancel', 'Annuler')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01] disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {saving ? tr('Saving...', 'Enregistrement...') : tr('Save Changes', 'Enregistrer les modifications')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01]"
            >
              <Edit className="w-4 h-4" />
              {tr('Edit Vehicle', 'Modifier le véhicule')}
            </button>
          )}
        </div>
        </div>
      </div>

      <div className="sticky top-[148px] z-20 -mx-3 overflow-x-auto border-y border-violet-100 bg-slate-50/95 px-3 py-2 backdrop-blur sm:top-[154px] sm:mx-0 sm:rounded-2xl sm:border sm:bg-white/95">
        <div className="flex min-w-max gap-2">
          {profileTabs.map((tab) => {
            const TabIcon = tab.icon;
            const active = activeProfileTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveProfileTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)]'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {activeProfileTab === 'overview' ? (
          <SectionCard
            title={tr('Overview', "Vue d'ensemble")}
            description={tr('A quick operational snapshot for this vehicle.', 'Un aperçu opérationnel rapide de ce véhicule.')}
            icon={Car}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
              <div className="aspect-square overflow-hidden rounded-2xl border border-violet-100 bg-slate-50">
                {vehicleImageUrl ? (
                  <img src={vehicleImageUrl} alt={vehicle.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <Car className="w-16 h-16" />
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{tr('Plate Number', "Numéro d'immatriculation")}</p>
                    <div className="mt-2 inline-flex items-center rounded-3xl border border-blue-300 bg-gradient-to-r from-blue-50 to-sky-100 px-5 py-3 text-2xl font-black tracking-[0.3em] text-blue-950 shadow-sm ring-1 ring-blue-100">
                      {vehicle.plate_number || tr('NOT SET', 'NON DÉFINI')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[operationalVehicleStatus] || 'bg-gray-100 text-gray-800'}`}>
                      {formatStatus(operationalVehicleStatus)}
                    </span>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-700">
                      {vehicle.vehicle_type || tr('Vehicle', 'Véhicule')}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                  <p className="text-lg font-bold text-slate-900">{vehicle.name || tr('Vehicle', 'Véhicule')}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                      {vehicle.model || tr('Model not set', 'Modèle non défini')}
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                      {vehicle.vehicle_type || tr('Vehicle', 'Véhicule')}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Current Location', 'Emplacement actuel')}</p>
                    <div className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                      <MapPin className="h-4 w-4 text-violet-500" />
                      <span>{vehicle.location_name || tr('Not set', 'Non défini')}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Model', 'Modèle')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{vehicle.model || tr('Not set', 'Non défini')}</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Current Odometer', 'Kilométrage actuel')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{vehicle.current_odometer ? `${vehicle.current_odometer} km` : tr('Not set', 'Non défini')}</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Engine Hours', 'Heures moteur')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{vehicle.engine_hours ? `${vehicle.engine_hours} h` : tr('Not set', 'Non défini')}</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Document Count', 'Nombre de documents')}</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{liveDocumentCount}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(76,29,149,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Fleet Alerts', 'Alertes flotte')}</p>
                  {fleetAlerts.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">{tr('No active oil change or document expiry alerts.', 'Aucune alerte active de vidange ou d’expiration de document.')}</p>
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
                          <p key={`${alert.id}-detail`} className="text-xs text-slate-600">
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
          ) : null}

          {activeProfileTab === 'overview' ? (
          <SectionCard title={tr('Basic Information', 'Informations de base')} description={tr('Core vehicle details used in rentals and fleet operations.', 'Informations principales du véhicule utilisées dans les locations et opérations de flotte.')} icon={FileText}>
            <dl>
              <EditableRow label={tr('Vehicle Name', 'Nom du véhicule')} editing={isEditing} viewValue={vehicle.name}>
                <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Model', 'Modèle')} editing={isEditing} viewValue={vehicle.model}>
                <input value={formData.model} onChange={(e) => handleChange('model', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Vehicle Type', 'Type de véhicule')} editing={isEditing} viewValue={vehicle.vehicle_type}>
                <select value={formData.vehicle_type} onChange={(e) => handleChange('vehicle_type', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="quad">{tr('quad', 'quad')}</option>
                  <option value="ATV">ATV</option>
                  <option value="motorcycle">{tr('motorcycle', 'moto')}</option>
                </select>
              </EditableRow>
              <EditableRow label={tr('Power', 'Puissance')} editing={isEditing} viewValue={vehicle.power_cc ? `${vehicle.power_cc} cc` : tr('Not set', 'Non défini')}>
                <input type="number" value={formData.power_cc} onChange={(e) => handleChange('power_cc', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Capacity', 'Capacité')} editing={isEditing} viewValue={vehicle.capacity || tr('Not set', 'Non défini')}>
                <input type="number" value={formData.capacity} onChange={(e) => handleChange('capacity', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Color', 'Couleur')} editing={isEditing} viewValue={vehicle.color}>
                <input value={formData.color} onChange={(e) => handleChange('color', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Plate Number', 'Numéro de plaque')} editing={isEditing} viewValue={vehicle.plate_number}>
                <input value={formData.plate_number} onChange={(e) => handleChange('plate_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Status', 'Statut')} editing={isEditing} viewValue={formatStatus(operationalVehicleStatus)}>
                <select value={formData.status} onChange={(e) => handleChange('status', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="available">{tr('available', 'disponible')}</option>
                  <option value="rented">{tr('rented', 'loué')}</option>
                  <option value="impounded">{tr('impounded', 'mis en fourrière')}</option>
                  <option value="tour">{tr('tour', 'tour')}</option>
                  <option value="maintenance">{tr('maintenance', 'maintenance')}</option>
                  <option value="out_of_service">{tr('out of service', 'hors service')}</option>
                  <option value="sold">{tr('sold', 'vendu')}</option>
                </select>
              </EditableRow>
              <EditableRow label={tr('Current Location', 'Emplacement actuel')} editing={isEditing} viewValue={vehicle.location_name || tr('Not set', 'Non défini')}>
                <select value={formData.location_id} onChange={(e) => handleChange('location_id', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="">{tr('Not set', 'Non défini')}</option>
                  {fleetLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </EditableRow>
              <EditableRow label={tr('Current Odometer', 'Kilométrage actuel')} editing={isEditing} viewValue={vehicle.current_odometer ? `${vehicle.current_odometer} km` : tr('Not set', 'Non défini')}>
                <input type="number" value={formData.current_odometer} onChange={(e) => handleChange('current_odometer', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Engine Hours', 'Heures moteur')} editing={isEditing} viewValue={vehicle.engine_hours ? `${vehicle.engine_hours} h` : tr('Not set', 'Non défini')}>
                <input type="number" value={formData.engine_hours} onChange={(e) => handleChange('engine_hours', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
            </dl>
          </SectionCard>
          ) : null}

          {activeProfileTab === 'finance' ? (
          <SectionCard title={tr('Acquisition', 'Acquisition')} description={tr('Purchase and sourcing information for this vehicle.', 'Informations d’achat et d’approvisionnement pour ce véhicule.')} icon={DollarSign}>
            <button
              type="button"
              onClick={() => vehicleFinanceOverview && setVehicleFinanceDrawerOpen(true)}
              disabled={!vehicleFinanceOverview}
              className="mb-5 w-full rounded-2xl border border-violet-100 bg-violet-50/70 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Vehicle lifetime finance overview', 'Aperçu finance véhicule à vie')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {vehicleFinanceLoading
                      ? tr('Loading lifetime finance...', 'Chargement de la finance à vie...')
                      : vehicleFinanceOverview
                        ? tr('Tap to open the detailed vehicle breakdown', 'Touchez pour ouvrir le détail financier du véhicule')
                        : tr('Lifetime finance is not available yet', 'La finance à vie n’est pas encore disponible')}
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[420px]">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Revenue', 'Revenus')}</p>
                    <p className="mt-1 text-sm font-bold text-emerald-700">{formatMoney(vehicleFinanceOverview?.lifetimeRevenue || 0)}</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Costs', 'Coûts')}</p>
                    <p className="mt-1 text-sm font-bold text-rose-700">{formatMoney(vehicleFinanceOverview?.lifetimeTotalCosts || 0)}</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Net', 'Net')}</p>
                    <p className={`mt-1 text-sm font-bold ${(vehicleFinanceOverview?.grossProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {(vehicleFinanceOverview?.grossProfit || 0) >= 0 ? '+' : ''}{formatMoney(vehicleFinanceOverview?.grossProfit || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </button>
            <dl>
              <EditableRow label={tr('Purchase Cost', 'Coût d’achat')} editing={isEditing} viewValue={vehicle.purchase_cost_mad ? formatMoney(vehicle.purchase_cost_mad) : tr('Not set', 'Non défini')}>
                <input type="number" value={formData.purchase_cost_mad} onChange={(e) => handleChange('purchase_cost_mad', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Purchase Date', 'Date d’achat')} editing={isEditing} viewValue={formatDate(vehicle.purchase_date)}>
                <input type="date" value={formData.purchase_date} onChange={(e) => handleChange('purchase_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Supplier', 'Fournisseur')} editing={isEditing} viewValue={vehicle.purchase_supplier}>
                <input value={formData.purchase_supplier} onChange={(e) => handleChange('purchase_supplier', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow
                label={tr('Purchase Invoice', 'Facture d’achat')}
                editing={isEditing}
                viewValue={purchaseInvoiceDocument?.url || vehicle.purchase_invoice_url ? (
                  <a href={purchaseInvoiceDocument?.url || vehicle.purchase_invoice_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 underline">
                    {tr('Open purchase invoice', 'Ouvrir la facture d’achat')}
                  </a>
                ) : tr('Not uploaded', 'Non téléversée')}
              >
                <div className="space-y-2 text-left">
                  <input value={formData.purchase_invoice_url} onChange={(e) => handleChange('purchase_invoice_url', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="https://..." />
                  <p className="text-xs text-slate-500">
                    {purchaseInvoiceDocument
                      ? tr('Linked from Documents & Media.', 'Lié depuis Documents et médias.')
                      : tr('Preferred: upload it in Documents & Media using document type “Purchase invoice”.', 'Préféré : importez-la dans Documents et médias avec le type « Facture d’achat ».')}
                  </p>
                </div>
              </EditableRow>
            </dl>
          </SectionCard>
          ) : null}

          {activeProfileTab === 'legal' ? (
          <SectionCard title={tr('Legal & Administrative', 'Juridique et administratif')} description={tr('Registration and insurance information.', 'Informations d’immatriculation et d’assurance.')} icon={Shield}>
            <dl>
              <EditableRow label={tr('Registration Number', "Numéro d'immatriculation administratif")} editing={isEditing} viewValue={vehicle.registration_number}>
                <input value={formData.registration_number} onChange={(e) => handleChange('registration_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Registration Date', "Date d'immatriculation")} editing={isEditing} viewValue={formatDate(vehicle.registration_date)}>
                <input type="date" value={formData.registration_date} onChange={(e) => handleChange('registration_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Registration Expiry', "Expiration de l'immatriculation")} editing={isEditing} viewValue={formatDate(vehicle.registration_expiry_date)}>
                <input type="date" value={formData.registration_expiry_date} onChange={(e) => handleChange('registration_expiry_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Insurance Policy', "Police d'assurance")} editing={isEditing} viewValue={vehicle.insurance_policy_number}>
                <input value={formData.insurance_policy_number} onChange={(e) => handleChange('insurance_policy_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Insurance Provider', "Assureur")} editing={isEditing} viewValue={vehicle.insurance_provider}>
                <input value={formData.insurance_provider} onChange={(e) => handleChange('insurance_provider', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
              <EditableRow label={tr('Insurance Expiry', "Expiration de l'assurance")} editing={isEditing} viewValue={formatDate(vehicle.insurance_expiry_date)}>
                <input type="date" value={formData.insurance_expiry_date} onChange={(e) => handleChange('insurance_expiry_date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </EditableRow>
            </dl>
          </SectionCard>
          ) : null}

          {activeProfileTab === 'legal' ? (
          <SectionCard
            title={tr('Annual Vehicle Tax / Vignette', 'Taxe annuelle véhicule / vignette')}
            description={tr('Track yearly road tax payments and proof documents for this vehicle.', 'Suivez les paiements annuels de vignette et les justificatifs de ce véhicule.')}
            icon={Shield}
            action={(
              <button
                type="button"
                onClick={() => {
                  resetTaxForm();
                  setTaxEditing(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <DollarSign className="w-3.5 h-3.5" />
                {tr('Add Tax Payment', 'Ajouter paiement')}
              </button>
            )}
          >
            {taxEditing && (
              <div className="mb-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Year', 'Année')}</span>
                    <input
                      type="number"
                      value={taxForm.tax_year}
                      onChange={(event) => handleTaxChange('tax_year', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Amount Paid', 'Montant payé')} (MAD)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxForm.amount_mad}
                      onChange={(event) => handleTaxChange('amount_mad', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Payment Date', 'Date de paiement')}</span>
                    <input
                      type="date"
                      value={taxForm.payment_date}
                      onChange={(event) => handleTaxChange('payment_date', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Valid From', 'Valide depuis')}</span>
                    <input
                      type="date"
                      value={taxForm.valid_from}
                      onChange={(event) => handleTaxChange('valid_from', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Valid Until', "Valide jusqu'au")}</span>
                    <input
                      type="date"
                      value={taxForm.valid_until}
                      onChange={(event) => handleTaxChange('valid_until', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <div className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Receipt Media', 'Média du reçu')}</span>
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                      <p>
                        {getAnnualTaxDocumentForRecord(taxForm)
                          ? tr('Linked from Documents & Media.', 'Lié depuis Documents et médias.')
                          : tr('Upload the receipt in Documents & Media using “Annual vehicle tax receipt”.', 'Téléversez le reçu dans Documents et médias avec « Reçu de taxe annuelle véhicule ».')}
                      </p>
                      {getAnnualTaxDocumentForRecord(taxForm)?.url ? (
                        <a
                          href={getAnnualTaxDocumentForRecord(taxForm).url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {getAnnualTaxDocumentForRecord(taxForm).name || tr('Open linked receipt', 'Ouvrir le reçu lié')}
                        </a>
                      ) : (
                        <a href="#vehicle-documents-media" className="mt-1 inline-flex text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                          {tr('Go to Documents & Media', 'Aller à Documents et médias')}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <label className="block space-y-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{tr('Notes', 'Notes')}</span>
                  <textarea
                    rows={2}
                    value={taxForm.notes}
                    onChange={(event) => handleTaxChange('notes', event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveTaxRecord}
                    disabled={taxSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    {taxSaving ? tr('Saving...', 'Enregistrement...') : tr('Save Tax Payment', 'Enregistrer paiement')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetTaxForm();
                      setTaxEditing(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <X className="w-4 h-4" />
                    {tr('Cancel', 'Annuler')}
                  </button>
                </div>
              </div>
            )}

            {annualTaxRecords.length > 0 ? (
              <div className="space-y-3">
                {annualTaxRecords.map((record) => {
                  const linkedTaxDocument = getAnnualTaxDocumentForRecord(record);
                  const proofUrl = record.proof_url || linkedTaxDocument?.url;
                  const proofName = record.proof_name || linkedTaxDocument?.name;

                  return (
                  <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {tr('Tax year', 'Année')} {record.tax_year}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">{formatMoney(record.amount_mad)}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {tr('Paid', 'Payé')} {formatDate(record.payment_date)}
                          {record.valid_until ? ` • ${tr('Valid until', 'Valide jusqu’au')} ${formatDate(record.valid_until)}` : ''}
                        </p>
                        {proofName ? (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            {tr('Receipt', 'Reçu')}: {proofName}
                          </p>
                        ) : null}
                        {record.notes ? <p className="mt-1 text-sm text-slate-500">{record.notes}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {proofUrl ? (
                          <a
                            href={proofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {tr('Open receipt', 'Ouvrir reçu')}
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            resetTaxForm(record);
                            setTaxEditing(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          {tr('Edit', 'Modifier')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTaxRecord(record.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          {tr('Delete', 'Supprimer')}
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <HistoryEmptyState
                title={tr('No annual tax payments recorded yet', 'Aucun paiement annuel enregistré')}
                description={tr('Add the yearly vignette / road tax payment so the legal lifecycle stays complete.', 'Ajoutez la vignette / taxe routière annuelle pour compléter le cycle légal.')}
              />
            )}
          </SectionCard>
          ) : null}

          {activeProfileTab === 'documents' ? (
          <div id="vehicle-documents-media">
          <SectionCard title={tr('Documents & Media', 'Documents et médias')} description={tr('Vehicle image, legal files, and uploaded documents.', 'Photo du véhicule, documents légaux et fichiers téléversés.')} icon={FileText}>
            {isEditing ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{tr('Vehicle Image', 'Image du véhicule')}</h3>
                  <p className="mt-1 text-sm text-gray-500">{tr('Upload or replace the main vehicle photo directly from this profile.', 'Téléversez ou remplacez la photo principale du véhicule directement depuis cette fiche.')}</p>
                  <VehicleImageUpload
                    vehicleId={vehicle.id?.toString()}
                    currentImageUrl={vehicleImageUrl}
                    onImageChange={setVehicleImageUrl}
                    disabled={saving}
                    className="mt-4"
                  />
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{tr('Legal & Administrative Documents', 'Documents légaux et administratifs')}</h3>
                  <p className="mt-1 text-sm text-gray-500">{tr('Click or drag files here to upload registration, insurance, and other vehicle documents.', "Cliquez ou glissez des fichiers ici pour téléverser l'immatriculation, l'assurance et les autres documents du véhicule.")}</p>
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
          </div>
          ) : null}

          {activeProfileTab === 'overview' ? (
          <SectionCard title={tr('Notes', 'Notes')} description={tr('Operational notes and internal system notes for the team.', "Notes opérationnelles et notes internes de l'équipe.")} icon={StickyNote}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-violet-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Additional Notes', 'Notes supplémentaires')}</p>
                {isEditing ? (
                  <textarea
                    value={formData.general_notes}
                    onChange={(e) => handleChange('general_notes', e.target.value)}
                    rows={8}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{vehicle.general_notes || tr('No additional notes yet.', 'Aucune note supplémentaire pour le moment.')}</p>
                )}
              </div>
              <div className="rounded-xl border border-violet-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('System Notes', 'Notes système')}</p>
                {isEditing ? (
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    rows={8}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{vehicle.notes || tr('No system notes yet.', 'Aucune note système pour le moment.')}</p>
                )}
              </div>
            </div>
          </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6">
          {activeProfileTab === 'overview' ? (
          <SectionCard title={tr('Maintenance History', 'Historique maintenance')} description={tr('Recent work logged against this vehicle.', 'Travaux récents enregistrés sur ce véhicule.')} icon={Wrench}>
            {maintenanceHistory.length === 0 ? (
              <HistoryEmptyState title={tr('No maintenance records yet', 'Aucun entretien enregistré pour le moment')} description={tr('Maintenance history will appear here as records are added.', "L'historique de maintenance apparaîtra ici au fur et à mesure des enregistrements.")} />
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
                    <p className="mt-3 text-sm text-gray-600">{formatMaintenanceSummary(record) || tr('No description provided.', 'Aucune description fournie.')}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
                      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <p className="text-[11px] text-gray-400">{tr('Technician', 'Technicien')}</p>
                        <p className="mt-1 font-medium text-gray-700">{record.technician_name || tr('Technician not set', 'Technicien non défini')}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <p className="text-[11px] text-gray-400">{tr('Total Price', 'Prix total')}</p>
                        <p className="mt-1 font-medium text-gray-900">{formatMoney(record.cost || 0)}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                        <p className="text-[11px] text-blue-600">{tr('Labor', "Main-d'oeuvre")}</p>
                        <p className="mt-1 font-semibold text-blue-900">{formatMoney(record.labor_rate_mad || record.labor_cost_mad || 0)}</p>
                      </div>
                      <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2">
                        <p className="text-[11px] text-indigo-600">{tr('Parts', 'Pièces')}</p>
                        <p className="mt-1 font-semibold text-indigo-900">{formatMoney(record.parts_cost_mad || 0)}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                        <p className="text-[11px] text-amber-600">{tr('Tax', 'Taxe')}</p>
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
                        {tr('Open in Quad Maintenance', 'Ouvrir en maintenance quad')}
                      </button>
                      {record.linked_report?.rental_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/rentals/${record.linked_report.rental_id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {tr('Open Linked Rental', 'Ouvrir la location liée')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          ) : null}

          {activeProfileTab === 'overview' ? (
          <SectionCard
            title={tr('Rental History', 'Historique locations')}
            description={tr('Open linked rentals for this vehicle.', 'Ouvrez les locations liées à ce véhicule.')}
            icon={Calendar}
          >
            {rentalHistory.length === 0 ? (
              <HistoryEmptyState
                title={tr('No rentals for this vehicle yet', 'Aucune location pour ce véhicule pour le moment')}
                description={tr('Rental history links will appear here as bookings are created.', "Les liens d'historique des locations apparaîtront ici au fur et à mesure des réservations.")}
              />
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {rentalHistory.map((record) => {
                  const rentalStatus = record?.is_impounded ? 'impounded' : (record?.rental_status || 'scheduled');
                  return (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => navigate(`/admin/rentals/${record.id}`)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-violet-700">
                            {formatRentalReference(record.rental_id || record.id)}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {record.customer_name || tr('Unknown customer', 'Client inconnu')}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(record.started_at || record.rental_start_date)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[rentalStatus] || 'bg-slate-100 text-slate-800'}`}>
                            {formatStatus(rentalStatus)}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {formatMoney(record.total_amount || 0)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
          ) : null}

          {activeProfileTab === 'finance' ? (
          <SectionCard
            title={tr('Fuel Status', 'État du carburant')}
            description={tr('Current fuel, usage, and cost for this vehicle.', "Carburant actuel, consommation et coût pour ce véhicule.")}
            icon={Gauge}
            action={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canEditVehicleFuel ? (
                  <button
                    type="button"
                    onClick={handleOpenFuelAdjust}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Edit className="w-4 h-4" />
                    {tr('Adjust Fuel', 'Ajuster le carburant')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate('/admin/fuel', {
                    state: {
                      activeTab: 'transactions',
                      fuelFilters: { vehicleId: String(vehicle.id) },
                    },
                  })}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Fuel className="w-4 h-4" />
                  {tr('Open Fuel Logs', 'Ouvrir les journaux carburant')}
                </button>
              </div>
            )}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{tr('Current Vehicle Fuel', 'Carburant actuel du véhicule')}</p>
                    <p className="mt-2 text-4xl font-black tracking-tight text-slate-900">
                      {vehicleFuelState?.current_fuel_lines ?? 0}/8
                    </p>
                    <p className="mt-1 text-base font-medium text-slate-600">
                      {isFrenchLocale() ? `${Number(vehicleFuelState?.current_fuel_liters || 0).toFixed(1)} L dans le réservoir` : `${Number(vehicleFuelState?.current_fuel_liters || 0).toFixed(1)} L in tank`}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {formatStatus(vehicleFuelState?.last_source || 'unknown')}
                  </span>
                </div>
                <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, ((vehicleFuelState?.current_fuel_lines || 0) / 8) * 100)}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-emerald-100 bg-white/90 p-3">
                    <p className="text-slate-400">{tr('Last source', 'Dernière source')}</p>
                    <p className="mt-1 font-medium text-slate-700">{formatStatus(vehicleFuelState?.last_source || 'unknown')}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-white/90 p-3">
                    <p className="text-slate-400">{tr('Recent fuel events', 'Événements carburant récents')}</p>
                    <p className="mt-1 font-medium text-slate-700">{fuelHistory.length}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">{tr('Fuel Supplied', 'Carburant fourni')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {Number(vehicleFuelSummary?.totalFuelSuppliedLiters || vehicle?.total_fuel_supplied_liters || 0).toFixed(1)}L
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-amber-100 bg-amber-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">{tr('Fuel Used', 'Carburant consommé')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {Number(vehicleFuelSummary?.totalFuelUsedLiters || vehicle?.total_fuel_used_liters || 0).toFixed(1)}L
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-violet-100 bg-violet-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Fuel Cost', 'Coût carburant')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatMoney(vehicleFuelSummary?.totalFuelCostMad || vehicle?.total_fuel_cost_mad || 0)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isFrenchLocale() ? `Moy. ${Number(vehicleFuelSummary?.averageFuelCostPerLiterMad || vehicle?.average_fuel_cost_per_liter_mad || 0).toFixed(2)} MAD/L` : `Avg ${Number(vehicleFuelSummary?.averageFuelCostPerLiterMad || vehicle?.average_fuel_cost_per_liter_mad || 0).toFixed(2)} MAD/L`}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Last Activity', 'Dernière activité')}</p>
                  <p className="mt-2 text-sm font-semibold leading-5 text-slate-900 break-words">
                    {formatDateTime(vehicleFuelSummary?.lastFuelActivityAt || vehicle?.last_fuel_activity_at)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isFrenchLocale() ? `${vehicleFuelSummary?.fuelEventCount || fuelHistory.length} événements carburant enregistrés` : `${vehicleFuelSummary?.fuelEventCount || fuelHistory.length} logged fuel events`}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
          ) : null}

          {activeProfileTab === 'finance' && fuelAdjustOpen ? (
            <section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{tr('Adjust Fuel', 'Ajuster le carburant')}</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{tr('Set vehicle fuel level', 'Définir le niveau de carburant du véhicule')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{tr('This updates the Fleet fuel source of truth for this vehicle.', 'Cela met à jour la source de vérité carburant de la flotte pour ce véhicule.')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFuelAdjustOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Current fuel', 'Carburant actuel')}</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                    {vehicleFuelState?.current_fuel_lines ?? 0}/8
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {Number(vehicleFuelState?.current_fuel_liters || 0).toFixed(1)} L
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{tr('New fuel level', 'Nouveau niveau de carburant')}</p>
                  <div className="mt-3">
                    <label className="text-sm font-medium text-slate-700">{tr('Fuel lines', 'Barres de carburant')}</label>
                    <div className="mt-2 grid grid-cols-4 gap-2 lg:flex lg:flex-wrap">
                      {Array.from({ length: 8 }, (_, index) => {
                        const lineValue = index + 1;
                        const selected = Number(fuelAdjustForm.fuel_lines) === lineValue;
                        return (
                          <button
                            key={lineValue}
                            type="button"
                            onClick={() => handleFuelAdjustChange('fuel_lines', lineValue)}
                            className={`rounded-2xl border px-3 py-3 text-center text-sm font-bold transition-all lg:min-w-[72px] lg:flex-none ${
                              selected
                                ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                            }`}
                          >
                            {lineValue}/8
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {Number.isFinite(Number(fuelAdjustForm.fuel_lines))
                        ? `${FuelTransactionService.linesToLiters(Number(fuelAdjustForm.fuel_lines), vehicleFuelState?.tank_capacity_liters || undefined).toFixed(1)} L after adjustment`
                        : tr('Enter the corrected fuel level', 'Entrez le niveau corrigé de carburant')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">{tr('Reason', 'Raison')}</label>
                  <select
                    value={fuelAdjustForm.reason}
                    onChange={(event) => handleFuelAdjustChange('reason', event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none focus:border-emerald-400"
                  >
                    <option value="Manual correction">{tr('Manual correction', 'Correction manuelle')}</option>
                    <option value="Inspection update">{tr('Inspection update', "Mise à jour d'inspection")}</option>
                    <option value="After external fuel use">{tr('After external fuel use', 'Après utilisation externe du carburant')}</option>
                    <option value="Staff correction">{tr('Staff correction', "Correction de l'équipe")}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">{tr('Note', 'Note')}</label>
                  <input
                    type="text"
                    value={fuelAdjustForm.notes}
                    onChange={(event) => handleFuelAdjustChange('notes', event.target.value)}
                    placeholder={tr('Optional note', 'Note facultative')}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFuelAdjustOpen(false)}
                  disabled={fuelAdjustSaving}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveFuelAdjust}
                  disabled={fuelAdjustSaving}
                  className="rounded-2xl bg-gradient-to-r from-emerald-600 to-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,163,74,0.22)] hover:from-emerald-700 hover:to-green-800 disabled:opacity-60"
                >
                  {fuelAdjustSaving ? tr('Saving...', 'Enregistrement...') : tr('Set Fuel Level', 'Définir le niveau')}
                </button>
              </div>
            </section>
          ) : null}

          {activeProfileTab === 'overview' ? (
          <SectionCard
            title={tr('Activity Log', "Journal d'activité")}
            description={tr('A combined timeline of profile, maintenance, and fuel activity.', "Chronologie combinée du profil, de la maintenance et du carburant.")}
            icon={Clock3}
            action={(
              <button
                type="button"
                onClick={() => navigate(`/admin/fleet/${vehicle.id}/activity`)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {tr('View all', 'Voir tout')}
              </button>
            )}
          >
            {activityLog.length === 0 ? (
              <HistoryEmptyState title={tr('No activity yet', 'Aucune activité pour le moment')} description={tr('As the vehicle is used, its operational timeline will appear here.', "La chronologie opérationnelle du véhicule apparaîtra ici au fur et à mesure de son utilisation.")} />
            ) : (
              <div className="max-h-[420px] overflow-y-scroll pr-2">
                <div className="space-y-4">
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
              </div>
            )}
          </SectionCard>
          ) : null}

          {activeProfileTab === 'overview' ? (
          <SectionCard title={tr('Vehicle Report', 'Rapports véhicule')} description={tr('Inspection reports captured from rental return workflow.', "Rapports d'inspection enregistrés pendant le retour de location.")} icon={FileText}>
            {vehicleReportOverview.length === 0 ? (
              <HistoryEmptyState title={tr('No vehicle reports yet', 'Aucun rapport véhicule pour le moment')} description={tr('Damage, accident, and issue reports will appear here when staff log them during rental inspection.', "Les rapports de dommages, d'accident et d'incident apparaîtront ici lorsque l'équipe les enregistrera pendant l'inspection de retour.")} />
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
                        {tr('Linked rental', 'Location liée')} • {formatRentalReference(report.rental_reference)}
                        {report.customer_name ? ` • ${report.customer_name}` : ''}
                      </div>
                    )}
                    <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">{report.description || tr('No description provided.', 'Aucune description fournie.')}</p>
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
                        <span>{tr('Linked media', 'Médias liés')}</span>
                        <span>{isFrenchLocale() ? `${report.photos?.length || 0} élément(s)` : `${report.photos?.length || 0} item(s)`}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{tr('Maintenance', 'Maintenance')}</span>
                        <span>{report.maintenance ? `${formatStatus(report.maintenance.status)} • ${formatMoney(report.maintenance.cost || 0)}` : (report.maintenance_id ? tr('Created', 'Créée') : (report.send_to_maintenance ? tr('Pending link', 'Lien en attente') : tr('Not requested', 'Non demandée')))}</span>
                      </div>
                      {report.customer_chargeable && (
                        <div className="flex items-center justify-between">
                          <span>{tr('Customer charge', 'Facturation client')}</span>
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
                          {tr('Open Linked Maintenance', 'Ouvrir la maintenance liée')}
                        </button>
                      )}
                      {report.rental_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/rentals/${report.rental_id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {tr('Open Linked Rental', 'Ouvrir la location liée')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          ) : null}

          {activeProfileTab === 'finance' ? (
          <SectionCard
            title={tr('Sold History', 'Historique de vente')}
            description={tr('Track sale or disposal events so finance can include resale and write-off lifecycle data.', 'Suivez les ventes et mises au rebut afin que la finance intègre le cycle de revente et de sortie d’actif.')}
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
                    {tr('Edit', 'Modifier')}
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
                    {tr('Add Sale / Disposal', 'Ajouter vente / mise au rebut')}
                  </button>
                )}
              </div>
            )}
          >
            {dispositionEditing ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Event Type', "Type d'événement")}</span>
                    <select
                      value={dispositionForm.event_type}
                      onChange={(e) => handleDispositionChange('event_type', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    >
                      <option value="sold">{tr('Sold', 'Vendu')}</option>
                      <option value="disposed">{tr('Disposed', 'Mis au rebut')}</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{tr('Event Date', "Date de l'événement")}</span>
                    <input
                      type="date"
                      value={dispositionForm.event_date}
                      onChange={(e) => handleDispositionChange('event_date', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{dispositionForm.event_type === 'sold' ? tr('Sale Price', 'Prix de vente') : tr('Disposal Value', 'Valeur de sortie')} (MAD)</span>
                    <input
                      type="number"
                      value={dispositionForm.sale_price_mad}
                      onChange={(e) => handleDispositionChange('sale_price_mad', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{dispositionForm.event_type === 'sold' ? tr('Buyer', 'Acheteur') : tr('Handled By / Destination', 'Pris en charge par / destination')}</span>
                    <input
                      type="text"
                      value={dispositionForm.buyer_name}
                      onChange={(e) => handleDispositionChange('buyer_name', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block space-y-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{tr('Notes', 'Notes')}</span>
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
                    {dispositionSaving ? tr('Saving...', 'Enregistrement...') : tr('Save Record', 'Enregistrer la fiche')}
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
                    {tr('Cancel', 'Annuler')}
                  </button>
                  {dispositionRecord && (
                    <button
                      type="button"
                      onClick={handleDeleteDisposition}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      {tr('Delete Record', "Supprimer l'enregistrement")}
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
                    <p className="text-xs uppercase tracking-wide text-slate-500">{tr('Value', 'Valeur')}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(dispositionRecord.sale_price_mad || 0)}</p>
                  </div>
                  {dispositionRecord.buyer_name && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{dispositionRecord.event_type === 'sold' ? tr('Buyer', 'Acheteur') : tr('Handled By', 'Pris en charge par')}</p>
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
          ) : null}
        </div>
      </div>
      {vehicleFinanceDrawerOpen && vehicleFinanceOverview ? (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-sm"
          onClick={() => setVehicleFinanceDrawerOpen(false)}
        >
          <aside
            className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Vehicle lifetime finance', 'Finance véhicule à vie')}</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{vehicle?.plate_number || vehicle?.name || tr('Vehicle', 'Véhicule')}</h2>
                  <p className="mt-1 text-sm text-slate-500">{tr('Acquisition, revenue, costs, and sale impact from the full vehicle lifecycle.', 'Acquisition, revenus, coûts et impact de vente sur tout le cycle de vie du véhicule.')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVehicleFinanceDrawerOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{tr('Revenue', 'Revenus')}</p>
                  <p className="mt-2 text-lg font-bold text-emerald-700">{formatMoney(vehicleFinanceOverview.lifetimeRevenue)}</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">{tr('Costs', 'Coûts')}</p>
                  <p className="mt-2 text-lg font-bold text-rose-700">{formatMoney(vehicleFinanceOverview.lifetimeTotalCosts)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Net', 'Net')}</p>
                  <p className={`mt-2 text-lg font-bold ${vehicleFinanceOverview.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {vehicleFinanceOverview.grossProfit >= 0 ? '+' : ''}{formatMoney(vehicleFinanceOverview.grossProfit)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">{tr('Cost breakdown', 'Répartition des coûts')}</h3>
                <div className="mt-3 space-y-2">
                  {vehicleFinanceCostRows.length > 0 ? vehicleFinanceCostRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-sm font-medium text-slate-600">{row.label}</span>
                      <span className="text-sm font-bold text-rose-700">{formatMoney(row.value)}</span>
                    </div>
                  )) : (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      {tr('No lifetime costs have been recorded for this vehicle yet.', 'Aucun coût à vie n’a encore été enregistré pour ce véhicule.')}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-900">{tr('Recent finance events', 'Événements financiers récents')}</h3>
                <div className="mt-3 space-y-3">
                  {(vehicleFinanceOverview.events || []).slice(0, 8).map((event, index) => (
                    <div key={`${event.source}-${event.date}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{event.eventType}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>{formatDate(event.date)}</span>
                            <span>•</span>
                            {event.href ? (
                              <button
                                type="button"
                                onClick={() => navigate(event.href)}
                                className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700 transition hover:bg-violet-200 hover:text-violet-900"
                              >
                                {event.source}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <span>{event.source}</span>
                            )}
                          </div>
                        </div>
                        <p className={`text-sm font-bold ${(event.net || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {(event.net || 0) >= 0 ? '+' : ''}{formatMoney(event.net || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/admin/finance?tab=vehicle-finance&vehicleId=${vehicleId}&detail=1`)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
              >
                <ExternalLink className="h-4 w-4" />
                {tr('Open Finance Management', 'Ouvrir la gestion financière')}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
      </div>
    </div>
  );
};

export default VehicleProfile;
