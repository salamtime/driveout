import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Car, Clock3, FileText, Fuel, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TBL } from '../../config/tables';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import FuelTransactionService from '../../services/FuelTransactionService';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import { formatRentalReference } from '../../utils/rentalReference';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const PAGE_SIZE = 20;

const formatDate = (value) => {
  if (!value) return 'Non défini';
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return 'Non défini';
  return new Date(value).toLocaleString();
};

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()} MAD`;
};

const formatStatus = (value) => String(value || 'unknown').replace(/_/g, ' ');

const formatFuelEventLabel = (record) => {
  const type = String(record?.transaction_type || '').toLowerCase();
  if (type === 'rental_opening_level') return 'Carburant location au départ';
  if (type === 'rental_closing_level') return 'Carburant location au retour';
  if (type === 'vehicle_refill') return 'Remplissage direct';
  if (type === 'tank_refill') return 'Remplissage cuve';
  if (type === 'withdrawal') return 'Transfert cuve';
  if (type === 'manual_adjustment') return 'Ajustement manuel carburant';
  return formatStatus(record?.transaction_type || 'fuel event');
};

const formatReportLabel = (report) => {
  const type = String(report?.report_type || '').toLowerCase();
  if (type === 'damage') return 'Rapport de dommage';
  if (type === 'accident') return 'Rapport d’accident';
  if (type === 'mechanical_issue' || type === 'mechanical') return 'Rapport mécanique';
  return formatStatus(report?.report_type || 'report');
};

const typeClasses = {
  vehicle: 'bg-slate-100 text-slate-700',
  maintenance: 'bg-amber-100 text-amber-800',
  fuel: 'bg-emerald-100 text-emerald-800',
  report: 'bg-rose-100 text-rose-800',
};

const iconByType = {
  vehicle: Car,
  maintenance: Wrench,
  fuel: Fuel,
  report: FileText,
};

const VehicleActivityPage = () => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);
  const [fuelHistory, setFuelHistory] = useState([]);
  const [vehicleReports, setVehicleReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadActivity = async () => {
      if (!vehicleId) return;

      setLoading(true);
      setError(null);

      try {
        const { data: vehicleData, error: vehicleError } = await supabase
          .from(TBL.VEHICLES)
          .select('*')
          .eq('id', vehicleId)
          .single();

        if (vehicleError) throw vehicleError;

        const [allMaintenanceRecords, fuelResult, reportRows, rentalRows] = await Promise.all([
          MaintenanceTrackingService.getAllMaintenanceRecords(),
          FuelTransactionService.getAllTransactions({ limit: 1000, offset: 0 }),
          VehicleReportService.getReportsForVehicle(vehicleId),
          supabase
            .from(RENTALS_TABLE)
            .select('id, rental_id, customer_name, vehicle_id, rental_start_date, rental_end_date, started_at, updated_at, completed_at, start_fuel_level, end_fuel_level')
            .eq('vehicle_id', vehicleId)
            .order('created_at', { ascending: false }),
        ]);

        const parsedVehicleId = parseInt(vehicleId, 10);
        const maintenanceRecords = (allMaintenanceRecords || []).filter(
          (record) => String(record?.vehicle_id) === String(parsedVehicleId)
        );
        const rentalData = Array.isArray(rentalRows?.data) ? rentalRows.data : [];

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

        setVehicle(vehicleData);
        setMaintenanceHistory(maintenanceRecords);
        setFuelHistory(
          [...existingFuelTransactions, ...rentalFuelSnapshots].sort(
            (a, b) => new Date(b.transaction_date || b.created_at || 0) - new Date(a.transaction_date || a.created_at || 0)
          )
        );
        setVehicleReports(Array.isArray(reportRows) ? reportRows : []);
      } catch (loadError) {
        console.error('Failed to load vehicle activity:', loadError);
        setError(loadError.message || 'Impossible de charger l’activité du véhicule');
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, [vehicleId]);

  const activityLog = useMemo(() => {
    if (!vehicle) return [];

    const entries = [
      {
        id: `vehicle-created-${vehicle.id}`,
        type: 'vehicle',
        title: 'Véhicule ajouté à la flotte',
        timestamp: vehicle.created_at,
        detail: vehicle.purchase_supplier ? `Fournisseur : ${vehicle.purchase_supplier}` : 'Fiche véhicule créée',
      },
      ...maintenanceHistory.map((record) => ({
        id: `maintenance-${record.id}`,
        type: 'maintenance',
        title: `Maintenance ${formatStatus(record.maintenance_type)}`,
        timestamp: record.updated_at || record.service_date || record.created_at,
        detail: `${formatStatus(record.status)} • ${formatMoney(record.cost || 0)}`,
      })),
      ...fuelHistory.map((record) => ({
        id: `fuel-${record.id}`,
        type: 'fuel',
        title: formatFuelEventLabel(record),
        timestamp: record.transaction_date || record.created_at,
        detail: [
          record.fuel_lines_after !== null && record.fuel_lines_after !== undefined
            ? `${record.fuel_lines_after}/8 lignes`
            : `${record.amount || record.liters_after || 0}L`,
          record.rental_reference ? formatRentalReference(record.rental_reference) : null,
          record.customer_name || null,
          record.cost ? formatMoney(record.cost || 0) : null,
        ].filter(Boolean).join(' • '),
      })),
      ...vehicleReports.map((report) => ({
        id: `report-${report.id}`,
        type: 'report',
        title: `${formatReportLabel(report)} créé`,
        timestamp: report.created_at,
        detail: [
          formatStatus(report.severity),
          report.rental_reference ? formatRentalReference(report.rental_reference) : null,
        ].filter(Boolean).join(' • '),
      })),
    ];

    return entries
      .filter((entry) => entry.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [vehicle, maintenanceHistory, fuelHistory, vehicleReports]);

  const totalPages = Math.max(1, Math.ceil(activityLog.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedEntries = activityLog.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-[480px] animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6" />
            <div>
              <h1 className="text-lg font-semibold">Impossible de charger l'activité du véhicule</h1>
              <p className="mt-1 text-sm">{error || 'Véhicule introuvable'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Clock3 className="h-8 w-8 text-white" />}
        eyebrow="Fleet Management"
        title="Vehicle Activity Log"
        description={`${vehicle.name} • ${vehicle.plate_number || 'No plate'}`}
      />

      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => navigate(`/admin/fleet/${vehicle.id}`)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-sm font-medium text-violet-700">Activity Timeline</p>
                <h1 className="text-2xl font-bold text-slate-900">All Vehicle Activity</h1>
                <p className="mt-1 text-sm text-slate-500">{activityLog.length} events logged for this vehicle</p>
              </div>
            </div>
            <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              Page {currentPage} of {totalPages}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          {activityLog.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No activity yet</p>
              <p className="mt-1 text-sm text-slate-500">As the vehicle is used, its full history will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedEntries.map((entry) => {
                const EntryIcon = iconByType[entry.type] || Clock3;
                return (
                  <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-white p-2 text-slate-600 shadow-sm">
                          <EntryIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeClasses[entry.type] || 'bg-slate-100 text-slate-700'}`}>
                              {entry.type}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.timestamp)}</p>
                          <p className="mt-3 text-sm text-slate-600">{entry.detail || 'No additional details.'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, activityLog.length)} of {activityLog.length}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleActivityPage;
