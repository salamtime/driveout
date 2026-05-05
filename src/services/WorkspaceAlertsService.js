import { supabase } from '../lib/supabase';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
} from './OrganizationService';

const ALERTS_TABLE = 'app_3c652a5149_alerts';

class WorkspaceAlertsService {
  async getAlerts() {
    let query = supabase
      .from(ALERTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async markAlertAsRead(alertId) {
    let query = supabase
      .from(ALERTS_TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', alertId);

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data;
  }

  async markAllAlertsAsRead() {
    let query = supabase
      .from(ALERTS_TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false);

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    const { data, error } = await query.select('*');
    if (error) throw error;
    return data || [];
  }

  async createAlert(alertData) {
    const organizationId = await getCurrentOrganizationId();
    const payload = applyOrganizationMatch(alertData, organizationId);

    const { data, error } = await supabase
      .from(ALERTS_TABLE)
      .insert([payload])
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async subscribe(callbacks = {}) {
    const organizationId = await getCurrentOrganizationId();
    const channel = supabase
      .channel(`alerts-channel:${organizationId || 'global'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: ALERTS_TABLE,
        },
        (payload) => {
          if (organizationId && String(payload?.new?.organization_id || '') !== String(organizationId)) return;
          callbacks.onInsert?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: ALERTS_TABLE,
        },
        (payload) => {
          if (organizationId && String(payload?.new?.organization_id || '') !== String(organizationId)) return;
          callbacks.onUpdate?.(payload.new);
        }
      )
      .subscribe();

    return channel;
  }
}

export default new WorkspaceAlertsService();
