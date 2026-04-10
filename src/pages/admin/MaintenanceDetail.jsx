import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';
import VehicleReportService from '../../services/VehicleReportService';
import AddMaintenanceForm from '../../components/maintenance/AddMaintenanceForm';
import { formatRentalReference } from '../../utils/rentalReference';
import { formatMaintenanceReference } from '../../utils/maintenanceReference';
import { getMaintenanceTypeVisual } from '../../utils/maintenanceVisuals';
import i18n from '../../i18n';
import {
  ArrowLeft,
  Edit,
  Wrench,
  Car,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Package,
  DollarSign,
  FileText,
  User,
  Gauge,
  ExternalLink,
} from 'lucide-react';

const statusIcon = (status) => {
  switch (status) {
    case 'scheduled':   return <Clock className="w-4 h-4 text-yellow-600" />;
    case 'in_progress': return <Wrench className="w-4 h-4 text-blue-600" />;
    case 'completed':   return <CheckCircle className="w-4 h-4 text-green-600" />;
    default:            return <AlertTriangle className="w-4 h-4 text-gray-500" />;
  }
};

const reportTypeLabel = (report) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const labels = { damage: isFrench ? 'Rapport de dommage' : 'Damage Report', accident: isFrench ? "Rapport d'accident" : 'Accident Report', mechanical_issue: isFrench ? 'Rapport mécanique' : 'Mechanical Report' };
  return labels[report?.report_type] || (isFrench ? 'Rapport véhicule' : 'Vehicle Report');
};

export default function MaintenanceDetail() {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const handleBack = () => {
    if (location.state?.from === 'rental') {
      navigate(-1);
    } else {
      navigate('/admin/maintenance', { state: { activeTab: 'maintenance' } });
    }
  };

  const loadRecord = async () => {
    try {
      setLoading(true);
      const [full, report] = await Promise.all([
        MaintenanceTrackingService.getMaintenanceById(id),
        VehicleReportService.getReportByMaintenanceId(id).catch(() => null),
      ]);
      if (!full) { setError(tr('Maintenance record not found.', "Fiche de maintenance introuvable.")); return; }
      setRecord({
        ...full,
        linked_rental_report: report || null,
        parts_used: (full.parts_used || []).map((p) => ({
          item_id: p.item_id,
          quantity: p.quantity || 0,
          notes: p.notes || '',
          item_name: p.inventory_item?.name || p.part_name || tr('Unknown Part', 'Pièce inconnue'),
          unit_cost_mad: p.unit_cost_mad || 0,
          unit: p.inventory_item?.unit || tr('units', 'unités'),
        })),
      });
    } catch (err) {
      setError(err.message || tr('Failed to load maintenance record.', 'Impossible de charger la fiche de maintenance.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    loadRecord();
  }, [id]);

  const handleOpenEdit = async () => {
    try {
      setLoadingEdit(true);
      const [full, report] = await Promise.all([
        MaintenanceTrackingService.getMaintenanceById(id),
        VehicleReportService.getReportByMaintenanceId(id).catch(() => null),
      ]);
      setEditingRecord({
        ...full,
        linked_rental_report: report || null,
        parts_used: (full.parts_used || []).map((p) => ({
          item_id: p.item_id?.toString() || '',
          quantity: p.quantity || 0,
          notes: p.notes || '',
          item_name: p.inventory_item?.name || p.part_name || tr('Unknown Item', 'Élément inconnu'),
          unit_cost_mad: p.unit_cost_mad || 0,
        })),
        scheduled_date: full.service_date || full.scheduled_date,
        notes: full.description || full.notes || '',
      });
      setShowEditForm(true);
    } catch (err) {
      console.error('Failed to load record for editing:', err);
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleEditSuccess = async () => {
    setShowEditForm(false);
    setEditingRecord(null);
    await loadRecord();
  };

  const handleEditCancel = () => {
    setShowEditForm(false);
    setEditingRecord(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{tr('Loading maintenance record…', 'Chargement de la fiche de maintenance…')}</p>
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="p-6">
        <Button variant="outline" size="sm" onClick={handleBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> {tr('Back to Maintenance', 'Retour à la maintenance')}
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700">{error || tr('Record not found.', 'Fiche introuvable.')}</p>
        </div>
      </div>
    );
  }

  const typeVisual = getMaintenanceTypeVisual(record.maintenance_type);
  const labor    = MaintenanceTrackingService.safeCostToNumber(record.labor_rate_mad || record.labor_cost_mad);
  const parts    = MaintenanceTrackingService.safeCostToNumber(record.parts_cost_mad);
  const external = MaintenanceTrackingService.safeCostToNumber(record.external_cost_mad);
  const tax      = MaintenanceTrackingService.safeCostToNumber(record.tax_mad);
  const total    = MaintenanceTrackingService.safeCostToNumber(record.cost || record.total_cost_mad);
  const fmt      = (n) => MaintenanceTrackingService.formatCurrency(n);
  const fmtDate  = (d) => MaintenanceTrackingService.formatDate(d);

  const vehicleName = record.vehicle
    ? `${record.vehicle.name || ''} (${record.vehicle.plate_number || ''})`.trim()
    : tr('Unknown Vehicle', 'Véhicule inconnu');

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> {tr('Back', 'Retour')}
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{tr('Maintenance Record', 'Fiche de maintenance')}</h1>
                <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {formatMaintenanceReference(record.id)}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${typeVisual.classes}`}>
                  <span>{typeVisual.emoji}</span>
                  <span>{typeVisual.label}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {statusIcon(record.status)}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MaintenanceTrackingService.getStatusColor(record.status)}`}>
                  {record.status?.replace(/_/g, ' ') || tr('unknown', 'inconnu')}
                </span>
              </div>
            </div>
          </div>

          <Button
            onClick={handleOpenEdit}
            disabled={loadingEdit}
            className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
            size="sm"
          >
            <Edit className="w-4 h-4 mr-1.5" />
            {loadingEdit ? tr('Loading…', 'Chargement…') : tr('Edit Record', 'Modifier la fiche')}
          </Button>
        </div>

        {/* ── Overview ───────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tr('Overview', 'Vue d’ensemble')}</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Car className="w-3 h-3" /> {tr('Vehicle', 'Véhicule')}</p>
              <p className="text-sm font-medium text-gray-900">{vehicleName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> {tr('Service Date', 'Date de service')}</p>
              <p className="text-sm font-medium text-gray-900">{fmtDate(record.service_date)}</p>
            </div>
            {record.scheduled_date && (
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> {tr('Scheduled Date', 'Date planifiée')}</p>
                <p className="text-sm font-medium text-gray-900">{fmtDate(record.scheduled_date)}</p>
              </div>
            )}
            {record.completed_date && (
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {tr('Completed Date', 'Date de clôture')}</p>
                <p className="text-sm font-medium text-gray-900">{fmtDate(record.completed_date)}</p>
              </div>
            )}
            {record.next_service_date && (
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> {tr('Next Service', 'Prochain service')}</p>
                <p className="text-sm font-medium text-gray-900">{fmtDate(record.next_service_date)}</p>
              </div>
            )}
            {record.odometer_reading != null && (
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Gauge className="w-3 h-3" /> {tr('Odometer', 'Kilométrage')}</p>
                <p className="text-sm font-medium text-gray-900">{Number(record.odometer_reading).toLocaleString()} km</p>
              </div>
            )}
            {record.technician_name && (
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> {tr('Technician', 'Technicien')}</p>
                <p className="text-sm font-medium text-gray-900">{record.technician_name}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Linked Rental Report ────────────────────────────── */}
        {record.linked_rental_report && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 shadow-sm">
            <div className="border-b border-orange-100 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-semibold text-orange-800 uppercase tracking-wide">{tr('Linked Rental Report', 'Rapport de location lié')}</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-300 text-orange-700 hover:bg-orange-100"
                onClick={() => navigate(`/admin/rentals/${record.linked_rental_report.rental_id}`)}
              >
                <ExternalLink className="w-3 h-3 mr-1.5" /> {tr('Open Rental', 'Ouvrir la location')}
              </Button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-orange-600 mb-1">{tr('Rental Reference', 'Référence de location')}</p>
                <p className="text-sm font-medium text-orange-900">{formatRentalReference(record.linked_rental_report.rental_id)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-600 mb-1">{tr('Report Type', 'Type de rapport')}</p>
                <p className="text-sm font-medium text-orange-900">{reportTypeLabel(record.linked_rental_report)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-600 mb-1">{tr('Severity', 'Gravité')}</p>
                <p className="text-sm font-medium text-orange-900 capitalize">
                  {String(record.linked_rental_report.severity || 'reported').replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Cost Breakdown ──────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tr('Cost Breakdown', 'Détail des coûts')}</h2>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700">{tr('Labor', "Main-d'oeuvre")}</p>
              <p className="mt-1 text-sm font-semibold text-blue-900">{fmt(labor)}</p>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs font-medium text-indigo-700">{tr('Parts', 'Pièces')}</p>
              <p className="mt-1 text-sm font-semibold text-indigo-900">{fmt(parts)}</p>
            </div>
            {external > 0 && (
              <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                <p className="text-xs font-medium text-purple-700">{tr('External', 'Externe')}</p>
                <p className="mt-1 text-sm font-semibold text-purple-900">{fmt(external)}</p>
              </div>
            )}
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">{tr('Tax', 'Taxe')}</p>
              <p className="mt-1 text-sm font-semibold text-amber-900">{fmt(tax)}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium text-green-700">{tr('Total', 'Total')}</p>
              <p className="mt-1 text-sm font-bold text-green-900">{fmt(total)}</p>
            </div>
          </div>
        </div>

        {/* ── Parts Used ─────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tr('Parts Used', 'Pièces utilisées')}</h2>
            {record.parts_used?.length > 0 && (
              <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {isFrench ? `${record.parts_used.length} article${record.parts_used.length !== 1 ? 's' : ''}` : `${record.parts_used.length} item${record.parts_used.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          {record.parts_used?.length > 0 ? (
            <div className="p-5 space-y-2">
              {record.parts_used.map((part, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{part.item_name}</span>
                      <span className="text-xs text-gray-500 shrink-0">× {part.quantity} {part.unit}</span>
                    </div>
                    {part.notes && <p className="text-xs text-gray-500 mt-0.5">{part.notes}</p>}
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmt(part.unit_cost_mad * part.quantity)}</p>
                    <p className="text-xs text-gray-500">{fmt(part.unit_cost_mad)} / {tr('unit', 'unité')}</p>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 text-sm font-semibold text-gray-800">
                <span>{tr('Total Parts Cost', 'Coût total des pièces')}</span>
                <span>{fmt(record.parts_used.reduce((s, p) => s + p.unit_cost_mad * p.quantity, 0))}</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{tr('No parts recorded for this maintenance', 'Aucune pièce enregistrée pour cette maintenance')}</p>
            </div>
          )}
        </div>

        {/* ── Description / Notes ─────────────────────────────── */}
        {record.description && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tr('Notes / Description', 'Notes / Description')}</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{record.description}</p>
            </div>
          </div>
        )}

      </div>

      {/* ── Edit Form Overlay ───────────────────────────────── */}
      {showEditForm && editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <AddMaintenanceForm
              editingRecord={editingRecord}
              onCancel={handleEditCancel}
              onSuccess={handleEditSuccess}
            />
          </div>
        </div>
      )}
    </>
  );
}
