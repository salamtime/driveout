import { supabase } from '../lib/supabase';

export const VEHICLE_ANNUAL_TAX_TABLE = 'saharax_0u4w4d_vehicle_annual_taxes';

const STORAGE_KEY = 'vehicle_annual_taxes_v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readLocalRecords = () => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read local vehicle annual tax records:', error);
    return [];
  }
};

const writeLocalRecords = (records) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records || []));
  } catch (error) {
    console.error('Failed to save local vehicle annual tax records:', error);
  }
};

const clearLocalRecordsForVehicle = (vehicleId) => {
  if (!vehicleId || !canUseStorage()) return;
  writeLocalRecords(readLocalRecords().filter((record) => String(record.vehicle_id) !== String(vehicleId)));
};

const normalizeRecord = (record) => ({
  id: record.id || `local-tax-${Date.now()}`,
  vehicle_id: record.vehicle_id,
  tax_year: Number(record.tax_year || new Date().getFullYear()),
  amount_mad: Number(record.amount_mad || 0),
  payment_date: record.payment_date || null,
  valid_from: record.valid_from || null,
  valid_until: record.valid_until || null,
  proof_url: record.proof_url || null,
  proof_name: record.proof_name || null,
  notes: record.notes || '',
  created_at: record.created_at || new Date().toISOString(),
  updated_at: record.updated_at || new Date().toISOString(),
});

class VehicleAnnualTaxService {
  async syncLocalRecordsForVehicle(vehicleId) {
    if (!vehicleId) return [];

    const localRecords = readLocalRecords()
      .filter((record) => String(record.vehicle_id) === String(vehicleId))
      .map((record) => normalizeRecord(record));

    if (!localRecords.length) return [];

    const dbPayload = localRecords.map((record) => ({
      vehicle_id: Number(record.vehicle_id),
      tax_year: record.tax_year,
      amount_mad: record.amount_mad,
      payment_date: record.payment_date,
      valid_from: record.valid_from,
      valid_until: record.valid_until,
      proof_url: record.proof_url,
      proof_name: record.proof_name,
      notes: record.notes,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from(VEHICLE_ANNUAL_TAX_TABLE)
      .upsert(dbPayload, { onConflict: 'vehicle_id,tax_year' })
      .select('*');

    if (error) {
      console.warn('Unable to sync local annual tax records to Supabase:', error.message);
      return [];
    }

    clearLocalRecordsForVehicle(vehicleId);
    return Array.isArray(data) ? data : [];
  }

  async listForVehicle(vehicleId) {
    if (!vehicleId) return [];

    const { data, error } = await supabase
      .from(VEHICLE_ANNUAL_TAX_TABLE)
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('tax_year', { ascending: false })
      .order('payment_date', { ascending: false });

    if (!error) {
      const syncedRecords = await this.syncLocalRecordsForVehicle(vehicleId);
      const combined = [...(Array.isArray(data) ? data : []), ...syncedRecords];
      const uniqueByYear = new Map();

      combined.forEach((record) => {
        uniqueByYear.set(String(record.tax_year), record);
      });

      return Array.from(uniqueByYear.values())
        .sort((a, b) => Number(b.tax_year || 0) - Number(a.tax_year || 0));
    }

    console.warn('Vehicle annual tax table unavailable, using local fallback:', error.message);
    return readLocalRecords()
      .filter((record) => String(record.vehicle_id) === String(vehicleId))
      .sort((a, b) => Number(b.tax_year || 0) - Number(a.tax_year || 0));
  }

  async upsert(vehicleId, payload = {}) {
    if (!vehicleId) {
      throw new Error('Vehicle ID is required');
    }

    const record = normalizeRecord({
      ...payload,
      vehicle_id: Number(vehicleId),
      updated_at: new Date().toISOString(),
    });

    const dbPayload = {
      vehicle_id: record.vehicle_id,
      tax_year: record.tax_year,
      amount_mad: record.amount_mad,
      payment_date: record.payment_date,
      valid_from: record.valid_from,
      valid_until: record.valid_until,
      proof_url: record.proof_url,
      proof_name: record.proof_name,
      notes: record.notes,
      updated_at: record.updated_at,
    };

    const isLocalId = String(record.id || '').startsWith('local-tax-');
    const query = isLocalId
      ? supabase.from(VEHICLE_ANNUAL_TAX_TABLE).upsert(dbPayload, { onConflict: 'vehicle_id,tax_year' })
      : supabase.from(VEHICLE_ANNUAL_TAX_TABLE).upsert({ id: record.id, ...dbPayload }, { onConflict: 'id' });

    const { data, error } = await query.select('*').single();

    if (!error) {
      return data;
    }

    throw new Error(`Annual tax could not be saved to the shared database: ${error.message}`);
  }

  async remove(recordId) {
    if (!recordId) return;

    const { error } = await supabase
      .from(VEHICLE_ANNUAL_TAX_TABLE)
      .delete()
      .eq('id', recordId);

    if (!error) return;

    writeLocalRecords(readLocalRecords().filter((record) => String(record.id) !== String(recordId)));
  }
}

export default new VehicleAnnualTaxService();
