const STORAGE_KEY = 'vehicle_dispositions_v1';

class VehicleDispositionService {
  canUseStorage() {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  }

  readAll() {
    if (!this.canUseStorage()) return [];

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to read vehicle dispositions:', error);
      return [];
    }
  }

  saveAll(records) {
    if (!this.canUseStorage()) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records || []));
    } catch (error) {
      console.error('Failed to persist vehicle dispositions:', error);
    }
  }

  listDispositions() {
    return this.readAll().sort((a, b) => new Date(b.event_date || b.updated_at || 0).getTime() - new Date(a.event_date || a.updated_at || 0).getTime());
  }

  getVehicleDisposition(vehicleId) {
    return this.listDispositions().find((record) => String(record.vehicle_id) === String(vehicleId)) || null;
  }

  upsertDisposition(vehicleId, payload = {}) {
    const records = this.readAll();
    const existingIndex = records.findIndex((record) => String(record.vehicle_id) === String(vehicleId));
    const nextRecord = {
      id: existingIndex >= 0 ? records[existingIndex].id : `vehicle-disposition-${Date.now()}`,
      vehicle_id: String(vehicleId),
      event_type: payload.event_type || 'sold',
      event_date: payload.event_date || new Date().toISOString().split('T')[0],
      sale_price_mad: Number(payload.sale_price_mad || 0) || 0,
      buyer_name: payload.buyer_name || '',
      notes: payload.notes || '',
      updated_at: new Date().toISOString(),
      created_at: existingIndex >= 0 ? records[existingIndex].created_at : new Date().toISOString()
    };

    if (existingIndex >= 0) {
      records[existingIndex] = nextRecord;
    } else {
      records.push(nextRecord);
    }

    this.saveAll(records);
    return nextRecord;
  }

  deleteDisposition(vehicleId) {
    const records = this.readAll().filter((record) => String(record.vehicle_id) !== String(vehicleId));
    this.saveAll(records);
  }
}

export default new VehicleDispositionService();
