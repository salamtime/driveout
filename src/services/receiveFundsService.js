import { supabase } from '../lib/supabase';
import { financeApiV2 } from './financeApiV2';
import { getScopedOrganizationId } from './OrganizationService';
import { buildExpenseDescription, buildExpenseNote, parseExpenseNote } from '../utils/expenseLabels';
import { isBusinessOwnerAccountType, isPlatformOwnerEmail } from '../utils/accountType';

const RECEIVE_FUNDS_TABLE = 'app_4c3a7a6153_receive_funds_entries';
const FINANCE_EXPENSES_TABLE = 'finance_expenses';
const DEFAULT_CURRENCY = 'MAD';

const normalizeMethod = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'bank_deposit' || raw === 'deposit' || raw === 'cash_deposit') {
    return 'bank_deposit';
  }
  if (raw === 'wire' || raw === 'wire_transfer' || raw === 'bank_transfer' || raw === 'transfer') {
    return 'wire_transfer';
  }
  return 'cash';
};

const normalizeStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'reversed' ? 'reversed' : 'active';
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Math.round(toNumber(value) * 100) / 100;

const formatDateKey = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateDistanceInDays = (left, right) => {
  const leftDate = new Date(`${formatDateKey(left)}T12:00:00`);
  const rightDate = new Date(`${formatDateKey(right)}T12:00:00`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return 0;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000);
};

const buildRecorderDisplay = (profile) =>
  String(
    profile?.fullName ||
      profile?.full_name ||
      profile?.display_name ||
      profile?.name ||
      profile?.user_metadata?.full_name ||
      profile?.user_metadata?.display_name ||
      profile?.user_metadata?.name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      [profile?.user_metadata?.first_name, profile?.user_metadata?.last_name].filter(Boolean).join(' ').trim() ||
      profile?.username ||
      profile?.email ||
      'Team'
  ).trim();

const buildWorkspaceId = (profile, organizationId) =>
  String(
    profile?.workspaceId ||
      profile?.workspace_id ||
      profile?.organizationId ||
      profile?.organization_id ||
      organizationId ||
      ''
  ).trim() || null;

const assertOwnerDeleteAccess = (profile) => {
  const role = String(profile?.role || '').toLowerCase();
  const accountType = String(profile?.accountType || profile?.account_type || '').toLowerCase();
  const organizationRole = String(profile?.organizationRole || profile?.organization_role || '').toLowerCase();
  const email = String(profile?.email || '').toLowerCase();
  const isOwner =
    role === 'owner' ||
    role === 'business_owner' ||
    organizationRole === 'org_owner' ||
    organizationRole === 'owner' ||
    accountType === 'owner' ||
    isBusinessOwnerAccountType(accountType) ||
    isPlatformOwnerEmail(email);

  if (!isOwner) {
    throw new Error('Only the owner can delete finance records.');
  }
};

const mapReceiveFundsRow = (row) => ({
  id: row.id,
  entryType: 'receive_funds',
  amount: roundCurrency(row.amount),
  currency: row.currency || DEFAULT_CURRENCY,
  method: normalizeMethod(row.method),
  receivedDate: formatDateKey(row.received_date),
  note: row.note || '',
  status: normalizeStatus(row.status),
  recordedByUserId: row.recorded_by_user_id || null,
  recordedByDisplayName: row.recorded_by_display_name || 'Team',
  recordedByEmail: row.recorded_by_email || '',
  receivedByAdminUserId: row.received_by_admin_user_id || null,
  receivedByAdminDisplayName: row.received_by_admin_display_name || '',
  receiptImageUrl: row.receipt_image_url || '',
  receiptImagePath: row.receipt_image_path || '',
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  reversedAt: row.reversed_at || null,
  reversedByUserId: row.reversed_by_user_id || null,
  reversalNote: row.reversal_note || '',
  sourceType: row.source_type || null,
  sourceId: row.source_id || null,
  organizationId: row.organization_id || null,
  workspaceId: row.workspace_id || null,
});

const mapExpenseRow = (row) => {
  const parsedExpenseNote = parseExpenseNote(row.notes || row.note || row.description || '');

  return ({
  ...parsedExpenseNote,
  id: `expense-${row.id}`,
  entryType: 'expense',
  amount: roundCurrency(row.amount),
  currency: DEFAULT_CURRENCY,
  method: 'expense',
  receivedDate: formatDateKey(row.expense_date),
  note: parsedExpenseNote.noteBody,
  status: normalizeStatus(row.status),
  recordedByUserId: row.created_by || null,
  recordedByDisplayName: row.created_by_display_name || row.created_by_name || 'Team',
  recordedByEmail: '',
  receivedByAdminUserId: null,
  receivedByAdminDisplayName: '',
  receiptImageUrl: row.invoice_url || '',
  receiptImagePath: '',
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  reversedAt: null,
  reversedByUserId: null,
  reversalNote: '',
  sourceType: row.reference_type || 'finance_expense',
  sourceId: row.reference_id || row.id || null,
  organizationId: row.organization_id || null,
  workspaceId: row.workspace_id || null,
  });
};

const normalizeExpenseId = (entryId) =>
  String(entryId || '')
    .replace(/^expense-/, '')
    .trim();

const createReviewItems = (entries, expectedRevenue, totalReceived) => {
  const activeEntries = entries.filter((entry) => entry.status === 'active');
  const duplicateGroups = new Map();

  activeEntries.forEach((entry) => {
    const key = [
      entry.receivedDate,
      entry.method,
      roundCurrency(entry.amount),
      entry.recordedByUserId || entry.recordedByEmail || entry.recordedByDisplayName || 'unknown',
    ].join('__');
    const existing = duplicateGroups.get(key) || [];
    existing.push(entry);
    duplicateGroups.set(key, existing);
  });

  const duplicates = Array.from(duplicateGroups.values()).filter((group) => group.length > 1);
  const backdatedEntries = activeEntries.filter((entry) => Math.abs(getDateDistanceInDays(entry.createdAt, entry.receivedDate)) > 1);
  const averageAmount = activeEntries.length > 0
    ? activeEntries.reduce((sum, entry) => sum + entry.amount, 0) / activeEntries.length
    : 0;
  const unusualEntries = activeEntries.filter((entry) => {
    if (expectedRevenue > 0 && entry.amount > expectedRevenue) return true;
    if (averageAmount > 0 && entry.amount >= averageAmount * 2.25) return true;
    return false;
  });

  const items = [];

  if (expectedRevenue > 0 && totalReceived === 0) {
    items.push({
      id: 'missing-collected-funds',
      type: 'warning',
      title: 'Expected revenue has no recorded funds',
      detail: `The system expects ${roundCurrency(expectedRevenue)} ${DEFAULT_CURRENCY}, but no cash, bank deposit, or bank transfer has been logged yet.`,
      count: 1,
    });
  }

  if (duplicates.length > 0) {
    items.push({
      id: 'duplicate-entries',
      type: 'warning',
      title: 'Possible duplicate entries',
      detail: `${duplicates.length} grouped duplicate pattern${duplicates.length === 1 ? '' : 's'} found with the same date, method, amount, and recorder.`,
      count: duplicates.reduce((sum, group) => sum + group.length, 0),
    });
  }

  if (backdatedEntries.length > 0) {
    items.push({
      id: 'backdated-entries',
      type: 'info',
      title: 'Entries recorded on a different day',
      detail: `${backdatedEntries.length} entr${backdatedEntries.length === 1 ? 'y was' : 'ies were'} logged more than one day away from the received date.`,
      count: backdatedEntries.length,
    });
  }

  if (unusualEntries.length > 0) {
    items.push({
      id: 'unusual-amounts',
      type: 'warning',
      title: 'Unusual collected amounts',
      detail: `${unusualEntries.length} entr${unusualEntries.length === 1 ? 'y looks' : 'ies look'} larger than expected for this period and may need review.`,
      count: unusualEntries.length,
    });
  }

  const variance = roundCurrency(totalReceived - expectedRevenue);
  if (Math.abs(variance) > 0.009) {
    items.push({
      id: 'variance-review',
      type: variance < 0 ? 'warning' : 'info',
      title: variance < 0 ? 'Under-collected period' : 'Over-collected period',
      detail: variance < 0
        ? `Collected funds are ${roundCurrency(Math.abs(variance))} ${DEFAULT_CURRENCY} below expected revenue.`
        : `Collected funds are ${roundCurrency(variance)} ${DEFAULT_CURRENCY} above expected revenue.`,
      count: 1,
    });
  }

  return items;
};

class ReceiveFundsService {
  constructor() {
    this.tableExistence = null;
    this.expensesTableExistence = null;
  }

  async checkTableExists() {
    if (typeof this.tableExistence === 'boolean') {
      return this.tableExistence;
    }

    try {
      const { error } = await supabase.from(RECEIVE_FUNDS_TABLE).select('id', { count: 'exact', head: true });
      this.tableExistence = !error;
      return this.tableExistence;
    } catch (error) {
      this.tableExistence = false;
      return false;
    }
  }

  async checkExpensesTableExists() {
    if (typeof this.expensesTableExistence === 'boolean') {
      return this.expensesTableExistence;
    }

    try {
      const { error } = await supabase
        .from(FINANCE_EXPENSES_TABLE)
        .select('id', { count: 'exact', head: true })
        .limit(1);

      this.expensesTableExistence = !error;
      return this.expensesTableExistence;
    } catch (_error) {
      this.expensesTableExistence = false;
      return false;
    }
  }

  async refreshExpensesTableExists() {
    this.expensesTableExistence = null;
    return this.checkExpensesTableExists();
  }

  async listEntries(filters, userProfile) {
    const tableReady = await this.checkTableExists();
    const organizationId = getScopedOrganizationId(userProfile);

    if (!tableReady) {
      return { tableReady: false, entries: [] };
    }

    let query = supabase
      .from(RECEIVE_FUNDS_TABLE)
      .select('*')
      .gte('received_date', filters.startDate)
      .lte('received_date', filters.endDate)
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data || []).map(mapReceiveFundsRow).sort(
      (left, right) =>
        new Date(right.createdAt || right.receivedDate || 0).getTime() -
        new Date(left.createdAt || left.receivedDate || 0).getTime()
    );

    return { tableReady, entries };
  }

  async listExpenses(filters, userProfile) {
    const tableReady = await this.checkExpensesTableExists();
    const organizationId = getScopedOrganizationId(userProfile);

    if (!tableReady) {
      return { tableReady: false, entries: [] };
    }

    let query = supabase
      .from(FINANCE_EXPENSES_TABLE)
      .select('*')
      .eq('subcategory', 'purchase_expense')
      .eq('status', 'active')
      .gte('expense_date', filters.startDate)
      .lte('expense_date', filters.endDate)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) {
      const fallback = await supabase
        .from(FINANCE_EXPENSES_TABLE)
        .select('*')
        .eq('subcategory', 'purchase_expense')
        .eq('status', 'active')
        .gte('expense_date', filters.startDate)
        .lte('expense_date', filters.endDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return { tableReady, entries: (fallback.data || []).map(mapExpenseRow) };
    }

    return { tableReady, entries: (data || []).map(mapExpenseRow) };
  }

  async listMyExpenses(userProfile) {
    const tableReady = await this.checkExpensesTableExists();
    const organizationId = getScopedOrganizationId(userProfile);
    const userId = String(userProfile?.id || '').trim();

    if (!tableReady) {
      return { tableReady: false, entries: [] };
    }

    if (!userId) {
      return { tableReady, entries: [] };
    }

    let query = supabase
      .from(FINANCE_EXPENSES_TABLE)
      .select('*')
      .eq('subcategory', 'purchase_expense')
      .eq('status', 'active')
      .eq('created_by', userId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return { tableReady, entries: (data || []).map(mapExpenseRow) };
  }

  async getDashboardData(filters, userProfile) {
    const [kpiData, entryPayload] = await Promise.all([
      financeApiV2.getKPIData(filters),
      this.listEntries(filters, userProfile),
    ]);

    const entries = entryPayload.entries;
    const activeFundsEntries = entries.filter((entry) => entry.entryType === 'receive_funds' && entry.status === 'active');
    const cashReceived = roundCurrency(activeFundsEntries.filter((entry) => entry.method === 'cash').reduce((sum, entry) => sum + entry.amount, 0));
    const bankDepositReceived = roundCurrency(activeFundsEntries.filter((entry) => entry.method === 'bank_deposit').reduce((sum, entry) => sum + entry.amount, 0));
    const wireTransferReceived = roundCurrency(activeFundsEntries.filter((entry) => entry.method === 'wire_transfer').reduce((sum, entry) => sum + entry.amount, 0));
    const totalReceived = roundCurrency(cashReceived + bankDepositReceived + wireTransferReceived);
    const expectedRevenue = roundCurrency(kpiData?.totalRevenue || 0);
    const variance = roundCurrency(totalReceived - expectedRevenue);
    const absoluteVariance = roundCurrency(Math.abs(variance));

    let reconciliationStatus = 'matched';
    if (expectedRevenue === 0 && totalReceived === 0) {
      reconciliationStatus = 'idle';
    } else if (expectedRevenue > 0 && totalReceived === 0) {
      reconciliationStatus = 'pending_review';
    } else if (variance < -0.009) {
      reconciliationStatus = 'under_collected';
    } else if (variance > 0.009) {
      reconciliationStatus = 'over_collected';
    }

    const reviewItems = createReviewItems(activeFundsEntries, expectedRevenue, totalReceived);

    return {
      tableReady: entryPayload.tableReady,
      entries,
      summary: {
        expectedRevenue,
        cashReceived,
        bankDepositReceived,
        wireTransferReceived,
        totalReceived,
        variance,
        absoluteVariance,
        reconciliationStatus,
        sentence:
          expectedRevenue > 0
            ? `Collected ${roundCurrency(totalReceived)} ${DEFAULT_CURRENCY} of ${roundCurrency(expectedRevenue)} ${DEFAULT_CURRENCY} expected. Difference: ${roundCurrency(absoluteVariance)} ${DEFAULT_CURRENCY}.`
            : `Collected ${roundCurrency(totalReceived)} ${DEFAULT_CURRENCY} in this period.`,
        reviewCount: reviewItems.length,
      },
      reviewItems,
    };
  }

  async recordEntry(payload, userProfile) {
    const tableReady = await this.checkTableExists();
    if (!tableReady) {
      throw new Error('Receive Funds table is not ready yet. Please run the SQL migration first.');
    }

    const organizationId = getScopedOrganizationId(userProfile);
    const actorName = buildRecorderDisplay(userProfile);
    const actorEmail = String(userProfile?.email || '').trim() || null;
    const workspaceId = buildWorkspaceId(userProfile, organizationId);
    const amount = roundCurrency(payload.amount);

    if (!(amount > 0)) {
      throw new Error('Enter a valid amount before saving.');
    }

    const insertPayload = {
      organization_id: organizationId,
      workspace_id: workspaceId,
      source_type: payload.sourceType || null,
      source_id: payload.sourceId || null,
      amount,
      currency: payload.currency || DEFAULT_CURRENCY,
      method: normalizeMethod(payload.method),
      received_date: formatDateKey(payload.receivedDate) || formatDateKey(new Date()),
      note: String(payload.note || '').trim() || null,
      recorded_by_user_id: userProfile?.id || null,
      recorded_by_display_name: actorName,
      recorded_by_email: actorEmail,
      received_by_admin_user_id: payload.receivedByAdminUserId || null,
      received_by_admin_display_name: String(payload.receivedByAdminDisplayName || '').trim() || null,
      receipt_image_url: String(payload.receiptImageUrl || '').trim() || null,
      receipt_image_path: String(payload.receiptImagePath || '').trim() || null,
      status: 'active',
    };

    const { data, error } = await supabase
      .from(RECEIVE_FUNDS_TABLE)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async reverseEntry(entryId, payload, userProfile) {
    const tableReady = await this.checkTableExists();
    if (!tableReady) {
      throw new Error('Receive Funds table is not ready yet. Please run the SQL migration first.');
    }

    const { data, error } = await supabase
      .from(RECEIVE_FUNDS_TABLE)
      .update({
        status: 'reversed',
        reversed_at: new Date().toISOString(),
        reversed_by_user_id: userProfile?.id || null,
        reversal_note: String(payload?.reversalNote || '').trim() || null,
      })
      .eq('id', entryId)
      .eq('status', 'active')
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async deleteEntry(entryId, userProfile) {
    assertOwnerDeleteAccess(userProfile);

    const tableReady = await this.checkTableExists();
    if (!tableReady) {
      throw new Error('Receive Funds table is not ready yet. Please run the SQL migration first.');
    }

    const organizationId = getScopedOrganizationId(userProfile);
    let query = supabase
      .from(RECEIVE_FUNDS_TABLE)
      .delete()
      .eq('id', entryId);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.select('id');

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Receive funds delete was not applied. Run the finance delete permissions SQL and try again.');
    }

    return true;
  }

  async updateEntry(entryId, payload, userProfile) {
    const tableReady = await this.checkTableExists();
    if (!tableReady) {
      throw new Error('Receive Funds table is not ready yet. Please run the SQL migration first.');
    }

    const amount = roundCurrency(payload.amount);
    if (!(amount > 0)) {
      throw new Error('Enter a valid amount before saving.');
    }

    const updatePayload = {
      amount,
      currency: payload.currency || DEFAULT_CURRENCY,
      method: normalizeMethod(payload.method),
      received_date: formatDateKey(payload.receivedDate) || formatDateKey(new Date()),
      note: String(payload.note || '').trim() || null,
      received_by_admin_user_id: payload.receivedByAdminUserId || null,
      received_by_admin_display_name: String(payload.receivedByAdminDisplayName || '').trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(payload, 'receiptImageUrl')) {
      updatePayload.receipt_image_url = String(payload.receiptImageUrl || '').trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'receiptImagePath')) {
      updatePayload.receipt_image_path = String(payload.receiptImagePath || '').trim() || null;
    }

    const { data, error } = await supabase
      .from(RECEIVE_FUNDS_TABLE)
      .update(updatePayload)
      .eq('id', entryId)
      .eq('status', 'active')
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async recordExpense(payload, userProfile) {
    const tableReady = await this.checkExpensesTableExists();
    if (!tableReady) {
      throw new Error('Finance expenses table is not ready yet. Please run the SQL migration first.');
    }

    const organizationId = getScopedOrganizationId(userProfile);
    const workspaceId = buildWorkspaceId(userProfile, organizationId);
    const amount = roundCurrency(payload.amount);

    if (!(amount > 0)) {
      throw new Error('Enter a valid amount before saving.');
    }

    const expenseLabels = Array.isArray(payload.labels) ? payload.labels : [];
    const expenseNote = buildExpenseNote(payload.note, expenseLabels);
    const basePayload = {
      organization_id: organizationId,
      workspace_id: workspaceId,
      category: 'operations',
      subcategory: 'purchase_expense',
      description: buildExpenseDescription(expenseLabels),
      amount,
      expense_date: formatDateKey(payload.receivedDate) || formatDateKey(new Date()),
      invoice_url: String(payload.receiptImageUrl || '').trim() || null,
      notes: expenseNote || null,
      created_by: userProfile?.id || null,
      reference_type: 'receive_funds_drawer',
      status: 'active',
    };

    let result = await supabase
      .from(FINANCE_EXPENSES_TABLE)
      .insert(basePayload)
      .select('*')
      .single();

    if (result.error) {
      const fallbackPayload = {
        organization_id: basePayload.organization_id,
        workspace_id: basePayload.workspace_id,
        category: basePayload.category,
        subcategory: basePayload.subcategory,
        description: basePayload.description,
        amount: basePayload.amount,
        expense_date: basePayload.expense_date,
        invoice_url: basePayload.invoice_url,
        notes: basePayload.notes,
        created_by: basePayload.created_by,
        reference_type: basePayload.reference_type,
        status: basePayload.status,
      };

      result = await supabase
        .from(FINANCE_EXPENSES_TABLE)
        .insert(fallbackPayload)
        .select('*')
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }

  async updateExpense(entryId, payload, userProfile) {
    const tableReady = await this.checkExpensesTableExists();
    if (!tableReady) {
      throw new Error('Finance expenses table is not ready yet. Please run the SQL migration first.');
    }

    const expenseId = normalizeExpenseId(entryId);
    const amount = roundCurrency(payload.amount);
    if (!(amount > 0)) {
      throw new Error('Enter a valid amount before saving.');
    }

    const expenseLabels = Array.isArray(payload.labels) ? payload.labels : [];
    const expenseNote = buildExpenseNote(payload.note, expenseLabels);
    const updatePayload = {
      description: buildExpenseDescription(expenseLabels),
      amount,
      expense_date: formatDateKey(payload.receivedDate) || formatDateKey(new Date()),
      notes: expenseNote || null,
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(payload, 'receiptImageUrl')) {
      updatePayload.invoice_url = String(payload.receiptImageUrl || '').trim() || null;
    }

    const { data, error } = await supabase
      .from(FINANCE_EXPENSES_TABLE)
      .update(updatePayload)
      .eq('id', expenseId)
      .eq('status', 'active')
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async updateMyExpense(entryId, payload, userProfile) {
    const tableReady = await this.checkExpensesTableExists();
    if (!tableReady) {
      throw new Error('Finance expenses table is not ready yet. Please run the SQL migration first.');
    }

    const expenseId = normalizeExpenseId(entryId);
    const userId = String(userProfile?.id || '').trim();
    if (!userId) {
      throw new Error('No active user is available to update this expense.');
    }

    const amount = roundCurrency(payload.amount);
    if (!(amount > 0)) {
      throw new Error('Enter a valid amount before saving.');
    }

    const expenseLabels = Array.isArray(payload.labels) ? payload.labels : [];
    const expenseNote = buildExpenseNote(payload.note, expenseLabels);
    const updatePayload = {
      description: buildExpenseDescription(expenseLabels),
      amount,
      expense_date: formatDateKey(payload.receivedDate) || formatDateKey(new Date()),
      notes: expenseNote || null,
      updated_at: new Date().toISOString(),
    };

    const organizationId = getScopedOrganizationId(userProfile);
    let query = supabase
      .from(FINANCE_EXPENSES_TABLE)
      .update(updatePayload)
      .eq('id', expenseId)
      .eq('created_by', userId)
      .eq('status', 'active');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.select('*').single();
    if (error) {
      throw error;
    }

    return data;
  }

  async deleteExpense(entryId, userProfile) {
    assertOwnerDeleteAccess(userProfile);

    const tableReady = await this.checkExpensesTableExists();
    if (!tableReady) {
      throw new Error('Finance expenses table is not ready yet. Please run the SQL migration first.');
    }

    const expenseId = normalizeExpenseId(entryId);
    const organizationId = getScopedOrganizationId(userProfile);
    let query = supabase
      .from(FINANCE_EXPENSES_TABLE)
      .delete()
      .eq('id', expenseId);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.select('id');

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Purchase expense delete was not applied. Run the finance delete permissions SQL and try again.');
    }

    return true;
  }
}

export const receiveFundsService = new ReceiveFundsService();
export { RECEIVE_FUNDS_TABLE, FINANCE_EXPENSES_TABLE, DEFAULT_CURRENCY, mapReceiveFundsRow };
