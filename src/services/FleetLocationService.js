import { supabase } from '../lib/supabase';

const TABLE = 'saharax_0u4w4d_locations';

const normalizeLocation = (row = {}) => ({
  id: row.id,
  name: row.name || '',
  code: row.code || '',
  address: row.address || '',
  is_active: row.is_active !== false,
  is_default: Boolean(row.is_default),
  display_order: Number(row.display_order || 0),
});

const FleetLocationService = {
  async listLocations(includeInactive = true) {
    let query = supabase
      .from(TABLE)
      .select('id, name, code, address, is_active, is_default, display_order')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeLocation);
  },

  async saveLocation(location = {}) {
    const payload = {
      name: String(location.name || '').trim(),
      code: String(location.code || '').trim() || null,
      address: String(location.address || '').trim() || null,
      is_active: location.is_active !== false,
      is_default: Boolean(location.is_default),
      display_order: Number(location.display_order || 0),
    };

    if (!payload.name) {
      throw new Error('Location name is required.');
    }

    if (payload.is_default) {
      const { error: resetError } = await supabase
        .from(TABLE)
        .update({ is_default: false })
        .neq('id', location.id || 0);
      if (resetError) throw resetError;
    }

    if (location.id) {
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', location.id)
        .select('id, name, code, address, is_active, is_default, display_order')
        .single();
      if (error) throw error;
      return normalizeLocation(data);
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert([payload])
      .select('id, name, code, address, is_active, is_default, display_order')
      .single();
    if (error) throw error;
    return normalizeLocation(data);
  },
};

export default FleetLocationService;
