import { supabase } from '../lib/supabase';
import { TBL } from '../config/tables';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
} from './OrganizationService';

const STORAGE_KEY = 'vehicle_dispositions_v1';

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const toIsoDate = (value) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.includes('T') ? normalized.split('T')[0] : normalized;
};

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const buildDispositionFromVehicle = (vehicle) => {
  if (!vehicle) return null;

  const eventType = String(vehicle.status || '').toLowerCase();
  const eventDate = toIsoDate(vehicle.sold_date);
  const salePrice = toMoney(vehicle.sale_price_mad);
  const buyerName = String(vehicle.sold_buyer_name || '').trim();
  const proofUrl = String(vehicle.sale_proof_url || '').trim();
  const proofName = String(vehicle.sale_proof_name || '').trim();
  const notes = String(vehicle.sale_notes || '').trim();

  const hasDispositionSnapshot =
    eventType === 'sold' ||
    eventType === 'disposed' ||
    Boolean(eventDate) ||
    salePrice > 0 ||
    Boolean(buyerName) ||
    Boolean(proofUrl) ||
    Boolean(proofName) ||
    Boolean(notes);

  if (!hasDispositionSnapshot) return null;

  return {
    id: `vehicle-disposition-${vehicle.id}`,
    vehicle_id: String(vehicle.id),
    event_type: eventType === 'disposed' ? 'disposed' : 'sold',
    event_date: eventDate || new Date().toISOString().split('T')[0],
    sale_price_mad: salePrice,
    buyer_name: buyerName,
    proof_url: proofUrl,
    proof_name: proofName,
    notes,
    updated_at: vehicle.updated_at || vehicle.created_at || new Date().toISOString(),
    created_at: vehicle.created_at || vehicle.updated_at || new Date().toISOString(),
    source: 'database',
  };
};

class VehicleDispositionService {
  constructor() {
    this.dispositionCache = [];
  }

  canUseStorage() {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  }

  readLegacyLocalRecords() {
    if (!this.canUseStorage()) return [];

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to read legacy vehicle dispositions:', error);
      return [];
    }
  }

  clearLegacyLocalRecords() {
    if (!this.canUseStorage()) return;

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear legacy vehicle dispositions:', error);
    }
  }

  async refreshDispositions() {
    const organizationId = await getCurrentOrganizationId();
    const { data, error } = await applyOrganizationScope(
      supabase
        .from(TBL.VEHICLES)
        .select(
          'id, status, sold_date, sale_price_mad, sold_buyer_name, sale_proof_url, sale_proof_name, sale_notes, created_at, updated_at'
        )
        .order('updated_at', { ascending: false }),
      organizationId
    );

    if (error) {
      console.error('Failed to load vehicle dispositions from database:', error);
      return this.dispositionCache;
    }

    this.dispositionCache = (data || [])
      .map(buildDispositionFromVehicle)
      .filter(Boolean)
      .sort((a, b) => new Date(b.event_date || b.updated_at || 0).getTime() - new Date(a.event_date || a.updated_at || 0).getTime());

    return this.dispositionCache;
  }

  listDispositions() {
    return Array.isArray(this.dispositionCache) ? [...this.dispositionCache] : [];
  }

  async getVehicleDisposition(vehicleId) {
    if (!vehicleId) return null;

    const organizationId = await getCurrentOrganizationId();
    const { data, error } = await applyOrganizationScope(
      supabase
        .from(TBL.VEHICLES)
        .select(
          'id, status, sold_date, sale_price_mad, sold_buyer_name, sale_proof_url, sale_proof_name, sale_notes, created_at, updated_at'
        )
        .eq('id', vehicleId)
        .maybeSingle(),
      organizationId
    );

    if (error) {
      console.error('Failed to load vehicle disposition from database:', error);
      return null;
    }

    const databaseRecord = buildDispositionFromVehicle(data);
    if (databaseRecord) return databaseRecord;

    const legacyRecord = this.readLegacyLocalRecords().find(
      (record) => String(record.vehicle_id) === String(vehicleId)
    ) || null;
    return legacyRecord ? { ...legacyRecord, source: 'legacy_local_storage' } : null;
  }

  async upsertDisposition(vehicleId, payload = {}) {
    const organizationId = await getCurrentOrganizationId();
    const nextEventType = String(payload.event_type || 'sold').toLowerCase() === 'disposed' ? 'disposed' : 'sold';
    const savedRecord = {
      id: `vehicle-disposition-${vehicleId}`,
      vehicle_id: String(vehicleId),
      event_type: nextEventType,
      event_date: toIsoDate(payload.event_date) || new Date().toISOString().split('T')[0],
      sale_price_mad: toMoney(payload.sale_price_mad),
      buyer_name: String(payload.buyer_name || '').trim(),
      proof_url: String(payload.proof_url || '').trim(),
      proof_name: String(payload.proof_name || '').trim(),
      notes: String(payload.notes || '').trim(),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      source: 'database',
    };

    const updatePayload = applyOrganizationMatch(
      {
        status: nextEventType,
        sold_date: savedRecord.event_date,
        sale_price_mad: savedRecord.sale_price_mad || 0,
        sold_buyer_name: savedRecord.buyer_name || null,
        sale_proof_url: savedRecord.proof_url || null,
        sale_proof_name: savedRecord.proof_name || null,
        sale_notes: savedRecord.notes || null,
        updated_at: savedRecord.updated_at,
      },
      organizationId
    );

    const { error } = await applyOrganizationScope(
      supabase
        .from(TBL.VEHICLES)
        .update(updatePayload)
        .eq('id', vehicleId),
      organizationId
    );

    if (error) {
      console.error('Failed to persist vehicle disposition to database:', error);
      throw error;
    }

    return savedRecord;
  }

  async deleteDisposition(vehicleId) {
    const organizationId = await getCurrentOrganizationId();
    const { error } = await applyOrganizationScope(
      supabase
        .from(TBL.VEHICLES)
        .update(
          applyOrganizationMatch(
            {
              status: 'available',
              sold_date: null,
              sale_price_mad: null,
              sold_buyer_name: null,
              sale_proof_url: null,
              sale_proof_name: null,
              sale_notes: null,
              updated_at: new Date().toISOString(),
            },
            organizationId
          )
        )
        .eq('id', vehicleId),
      organizationId
    );

    if (error) {
      console.error('Failed to clear vehicle disposition from database:', error);
      throw error;
    }
  }
}

export default new VehicleDispositionService();
