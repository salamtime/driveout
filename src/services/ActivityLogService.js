import { supabase } from '../lib/supabase';
import { TABLE_NAMES } from '../config/tableNames';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
} from './OrganizationService';

const ACTIVITY_LOG_TABLE = TABLE_NAMES.ACTIVITY_LOG;

class ActivityLogService {
  async getLogs({ limit = 100 } = {}) {
    let query = supabase
      .from(ACTIVITY_LOG_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createLog(logData) {
    const organizationId = await getCurrentOrganizationId();
    const payload = applyOrganizationMatch({
      ...logData,
      created_at: new Date().toISOString(),
    }, organizationId);

    const { data, error } = await supabase
      .from(ACTIVITY_LOG_TABLE)
      .insert([payload])
      .select();

    if (error) throw error;
    return data?.[0] || null;
  }

  async subscribe(callbacks = {}) {
    const organizationId = await getCurrentOrganizationId();
    const channel = supabase
      .channel(`activity_log_changes:${organizationId || 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: ACTIVITY_LOG_TABLE,
        },
        (payload) => {
          const scopedOrganizationId = payload?.new?.organization_id || payload?.old?.organization_id || '';
          if (organizationId && String(scopedOrganizationId) !== String(organizationId)) return;
          callbacks.onChange?.(payload);
        }
      )
      .subscribe();

    return channel;
  }
}

export default new ActivityLogService();
