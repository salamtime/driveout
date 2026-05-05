import { supabase } from '../lib/supabase';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
} from './OrganizationService';

const FINANCE_RECORDS_TABLE = 'finance_records';

class FinanceRecordsService {
  async getRecords({ startDate, endDate, type, category } = {}) {
    let query = supabase
      .from(FINANCE_RECORDS_TABLE)
      .select('*')
      .order('transaction_date', { ascending: false });

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);
    if (type && type !== 'all') query = query.eq('transaction_type', type);
    if (category && category !== 'all') query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createRecord(recordData) {
    const organizationId = await getCurrentOrganizationId();
    const payload = applyOrganizationMatch({
      ...recordData,
      created_at: new Date().toISOString(),
    }, organizationId);

    const { data, error } = await supabase
      .from(FINANCE_RECORDS_TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateRecord(id, updateData) {
    let query = supabase
      .from(FINANCE_RECORDS_TABLE)
      .update(updateData)
      .eq('id', id);

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  }

  async deleteRecord(id) {
    let query = supabase
      .from(FINANCE_RECORDS_TABLE)
      .delete()
      .eq('id', id);

    const organizationId = await getCurrentOrganizationId();
    query = applyOrganizationScope(query, organizationId);

    const { error } = await query;
    if (error) throw error;
    return id;
  }
}

export default new FinanceRecordsService();
